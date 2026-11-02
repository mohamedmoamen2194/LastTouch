import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, productSaleItems, productSales, products } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { Permission } from "@/lib/permissions";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";

export const SALE_STATUSES = ["pending", "paid", "completed", "cancelled", "refunded"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const PAYMENT_METHODS = ["cash", "card", "wallet", "online"] as const;
const STOCK_RESTORING: SaleStatus[] = ["cancelled", "refunded"];
const REVENUE_STATUSES: SaleStatus[] = ["paid", "completed"];

export type SaleItemInput = { productId: string; quantity: number };
export type SaleInput = {
  items: SaleItemInput[];
  customerId?: string | null;
  appointmentId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string;
  discount?: number | string | null;
  notes?: string | null;
};

function parseItems(raw: unknown): { productId: string; quantity: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ValidationAppError("Add at least one product");
  const merged = new Map<string, number>();
  for (const item of raw) {
    const productId = typeof item?.productId === "string" ? item.productId : "";
    const quantity = Number(item?.quantity);
    if (!productId) throw new ValidationAppError("Invalid product");
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationAppError("Quantity must be a whole number");
    }
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function parseSaleInput(raw: unknown): SaleInput {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid sale payload");
  const discount = Number(v.discount ?? 0);
  if (!Number.isFinite(discount) || discount < 0) throw new ValidationAppError("Discount must be a positive number");
  const paymentMethod =
    typeof v.paymentMethod === "string" && PAYMENT_METHODS.includes(v.paymentMethod as (typeof PAYMENT_METHODS)[number])
      ? v.paymentMethod
      : "cash";
  return {
    items: parseItems(v.items),
    customerId: typeof v.customerId === "string" && v.customerId ? v.customerId : null,
    appointmentId: typeof v.appointmentId === "string" && v.appointmentId ? v.appointmentId : null,
    customerName: typeof v.customerName === "string" ? v.customerName.trim() || null : null,
    customerPhone: typeof v.customerPhone === "string" ? v.customerPhone.trim() || null : null,
    paymentMethod,
    discount,
    notes: typeof v.notes === "string" ? v.notes.trim() || null : null,
  };
}

async function insertSale(args: {
  tenantId: string;
  userId: string | null;
  channel: "in_store" | "online";
  status: SaleStatus;
  input: SaleInput;
}) {
  const { tenantId, userId, channel, status, input } = args;

  return db.transaction(async (tx) => {
    const ids = [...new Set(input.items.map((item) => item.productId))];
    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        sellPrice: products.sellPrice,
        quantity: products.quantity,
      })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          inArray(products.id, ids),
          eq(products.active, true),
          isNull(products.deletedAt)
        )
      );

    const byId = new Map(rows.map((row) => [row.id, row]));
    if (rows.length !== ids.length) throw new NotFoundError("One of the products is unavailable");

    let subtotal = 0;
    const lines = input.items.map((item) => {
      const product = byId.get(item.productId)!;
      if (product.quantity < item.quantity) {
        throw new ConflictError(`Not enough stock for ${product.name}`);
      }
      const unitPrice = Number(product.sellPrice);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        unitPrice: product.sellPrice,
        quantity: item.quantity,
        lineTotal: lineTotal.toFixed(2),
      };
    });

    const discount = Math.min(Number(input.discount ?? 0), subtotal);
    const total = Math.max(0, subtotal - discount);

    if (input.customerId) {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)))
        .limit(1);
      if (!customer) throw new NotFoundError("Customer not found");
    }

    const [sale] = await tx
      .insert(productSales)
      .values({
        tenantId,
        customerId: input.customerId ?? null,
        appointmentId: input.appointmentId ?? null,
        soldByUserId: userId,
        channel,
        paymentMethod: input.paymentMethod ?? "cash",
        status,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    await tx.insert(productSaleItems).values(sale ? lines.map((line) => ({ ...line, saleId: sale.id })) : []);

    for (const item of input.items) {
      const [updated] = await tx
        .update(products)
        .set({ quantity: sql`${products.quantity} - ${item.quantity}`, updatedAt: new Date() })
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.tenantId, tenantId),
            gte(products.quantity, item.quantity)
          )
        )
        .returning({ id: products.id });
      if (!updated) throw new ConflictError("Stock changed while selling — try again");
    }

    return sale;
  });
}

/** In-store / private sale created by staff. */
export async function createSale(ctx: TenantContext, raw: unknown) {
  assertPermission(ctx, Permission["sales.create"]);
  const input = parseSaleInput(raw);
  return insertSale({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    channel: "in_store",
    status: "paid",
    input,
  });
}

/** Public storefront order. Stock is reserved immediately; staff collect payment. */
export async function createOnlineOrder(tenantId: string, raw: unknown) {
  const input = parseSaleInput(raw);
  if (!input.customerName || !input.customerPhone) {
    throw new ValidationAppError("Name and phone are required for online orders");
  }
  return insertSale({
    tenantId,
    userId: null,
    channel: "online",
    status: "pending",
    input,
  });
}

export async function listSales(ctx: TenantContext, limit = 100) {
  assertPermission(ctx, Permission["sales.read"]);
  const sales = await db
    .select()
    .from(productSales)
    .where(eq(productSales.tenantId, ctx.tenantId))
    .orderBy(desc(productSales.createdAt))
    .limit(limit);

  if (sales.length === 0) return [];
  const items = await db
    .select()
    .from(productSaleItems)
    .where(inArray(productSaleItems.saleId, sales.map((s) => s.id)));

  const bySale = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySale.get(item.saleId) ?? [];
    list.push(item);
    bySale.set(item.saleId, list);
  }

  return sales.map((sale) => ({ ...sale, items: bySale.get(sale.id) ?? [] }));
}

export async function setSaleStatus(ctx: TenantContext, id: string, status: unknown) {
  assertPermission(ctx, Permission["sales.create"]);
  if (typeof status !== "string" || !SALE_STATUSES.includes(status as SaleStatus)) {
    throw new ValidationAppError("Invalid sale status");
  }
  const next = status as SaleStatus;

  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(productSales)
      .where(and(eq(productSales.id, id), eq(productSales.tenantId, ctx.tenantId)))
      .limit(1);
    if (!sale) throw new NotFoundError("Sale not found");

    const previous = sale.status as SaleStatus;
    if (STOCK_RESTORING.includes(previous) && !STOCK_RESTORING.includes(next)) {
      throw new ValidationAppError("Cancelled sales cannot be reopened");
    }

    const lines = await tx.select().from(productSaleItems).where(eq(productSaleItems.saleId, id));

    if (!STOCK_RESTORING.includes(previous) && STOCK_RESTORING.includes(next)) {
      for (const line of lines) {
        if (!line.productId) continue;
        await tx
          .update(products)
          .set({ quantity: sql`${products.quantity} + ${line.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, line.productId), eq(products.tenantId, ctx.tenantId)));
      }
    }

    const [updated] = await tx
      .update(productSales)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(productSales.id, id))
      .returning();
    return updated;
  });
}

/** Sum of paid/completed product sales in a date range (for dashboard revenue). */
export async function sumProductRevenue(tenantId: string, from: Date, to: Date) {
  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${productSales.total}), 0)` })
    .from(productSales)
    .where(
      and(
        eq(productSales.tenantId, tenantId),
        inArray(productSales.status, REVENUE_STATUSES),
        gte(productSales.createdAt, from),
        lte(productSales.createdAt, to)
      )
    );
  return Number(row?.value ?? 0);
}
