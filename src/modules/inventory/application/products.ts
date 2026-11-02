import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { Permission } from "@/lib/permissions";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";

export type ProductInput = {
  name?: string;
  nameAr?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  imageUrl?: string | null;
  costPrice?: string;
  sellPrice?: string;
  quantity?: number;
  lowStockThreshold?: number;
  expiryDate?: string | null;
  listedOnline?: boolean;
  active?: boolean;
};

export type ProductListArgs = {
  q?: string;
  category?: string;
  lowStock?: boolean;
  listedOnline?: boolean;
  includeInactive?: boolean;
};

function money(value: number | string | null | undefined, field: string): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new ValidationAppError(`${field} must be a positive number`);
  return number.toFixed(2);
}

function wholeNumber(value: number | string | null | undefined, field: string): number {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) throw new ValidationAppError(`${field} must be a whole number`);
  return number;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T23:59:59` : value);
  if (Number.isNaN(date.getTime())) throw new ValidationAppError(`${field} is not a valid date`);
  return date;
}

function clean(value: string | null | undefined, max = 500): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (text.length > max) throw new ValidationAppError("Text is too long");
  return text;
}

export function validateProductInput(input: unknown, partial = false): ProductInput {
  const v = input as ProductInput | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid product payload");

  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!partial && !name) throw new ValidationAppError("Product name is required");
  if (name.length > 200) throw new ValidationAppError("Product name is too long");

  const sku = clean(v.sku, 80);
  const barcode = clean(v.barcode, 80);

  const expiryDate =
    v.expiryDate === null || v.expiryDate === ""
      ? null
      : v.expiryDate !== undefined
        ? parseDate(v.expiryDate, "Expiry date")
        : undefined;

  return {
    name: name || undefined,
    nameAr: clean(v.nameAr, 200),
    sku,
    barcode,
    category: clean(v.category, 120),
    description: clean(v.description, 2000),
    descriptionAr: clean(v.descriptionAr, 2000),
    imageUrl: clean(v.imageUrl, 500),
    costPrice: v.costPrice === undefined ? undefined : money(v.costPrice, "Cost price"),
    sellPrice: v.sellPrice === undefined ? undefined : money(v.sellPrice, "Sell price"),
    quantity: v.quantity === undefined ? undefined : wholeNumber(v.quantity, "Quantity"),
    lowStockThreshold:
      v.lowStockThreshold === undefined ? undefined : wholeNumber(v.lowStockThreshold, "Low stock threshold"),
    expiryDate: expiryDate === undefined ? undefined : expiryDate ? expiryDate.toISOString() : null,
    listedOnline: typeof v.listedOnline === "boolean" ? v.listedOnline : undefined,
    active: typeof v.active === "boolean" ? v.active : undefined,
  };
}

async function assertUniqueSku(tenantId: string, sku: string | null, excludeId?: string) {
  if (!sku) return;
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.sku, sku),
        ...(excludeId ? [ne(products.id, excludeId)] : [])
      )
    )
    .limit(1);
  if (row) throw new ConflictError("A product with this SKU already exists");
}

export async function listProducts(ctx: TenantContext, args: ProductListArgs = {}) {
  assertPermission(ctx, Permission["inventory.read"]);
  const conditions = [eq(products.tenantId, ctx.tenantId), isNull(products.deletedAt)];
  if (!args.includeInactive) conditions.push(eq(products.active, true));
  if (args.listedOnline) conditions.push(eq(products.listedOnline, true));
  if (args.category) conditions.push(eq(products.category, args.category));
  if (args.q) {
    const term = `%${args.q.trim()}%`;
    const search = or(ilike(products.name, term), ilike(products.sku, term), ilike(products.barcode, term));
    if (search) conditions.push(search);
  }

  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.active), asc(products.name));
}

export async function getProduct(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["inventory.read"]);
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId), isNull(products.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("Product not found");
  return row;
}

export async function createProduct(ctx: TenantContext, raw: unknown) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const input = validateProductInput(raw);
  await assertUniqueSku(ctx.tenantId, input.sku ?? null);

  const [created] = await db
    .insert(products)
    .values({
      tenantId: ctx.tenantId,
      name: input.name!,
      nameAr: input.nameAr ?? null,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      category: input.category ?? null,
      description: input.description ?? null,
      descriptionAr: input.descriptionAr ?? null,
      imageUrl: input.imageUrl ?? null,
      costPrice: input.costPrice ?? "0.00",
      sellPrice: input.sellPrice ?? "0.00",
      quantity: input.quantity ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      listedOnline: input.listedOnline ?? false,
      active: input.active ?? true,
    })
    .returning();
  return created;
}

export async function updateProduct(ctx: TenantContext, id: string, raw: unknown) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const input = validateProductInput(raw, true);
  await getProduct(ctx, id);
  await assertUniqueSku(ctx.tenantId, input.sku ?? null, id);

  const [updated] = await db
    .update(products)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
      ...(input.sellPrice !== undefined ? { sellPrice: input.sellPrice } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
      ...(input.expiryDate !== undefined
        ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }
        : {}),
      ...(input.listedOnline !== undefined ? { listedOnline: input.listedOnline } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))
    .returning();
  return updated;
}

export async function deleteProduct(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["inventory.manage"]);
  await getProduct(ctx, id);
  const [removed] = await db
    .update(products)
    .set({ active: false, listedOnline: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))
    .returning();
  return removed;
}

export async function setProductStock(ctx: TenantContext, id: string, quantity: number) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const [updated] = await db
    .update(products)
    .set({ quantity: wholeNumber(quantity, "Quantity"), updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Product not found");
  return updated;
}

/** Public storefront: listed, active, in-stock products only (no cost data). */
export async function listPublicProducts(tenantId: string) {
  return db
    .select({
      id: products.id,
      name: products.name,
      nameAr: products.nameAr,
      category: products.category,
      description: products.description,
      descriptionAr: products.descriptionAr,
      imageUrl: products.imageUrl,
      sellPrice: products.sellPrice,
      quantity: products.quantity,
      expiryDate: products.expiryDate,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.active, true),
        eq(products.listedOnline, true),
        isNull(products.deletedAt)
      )
    )
    .orderBy(asc(products.name));
}

/** Products that are near/at the low-stock threshold or close to expiry. */
export async function listInventoryAlerts(ctx: TenantContext) {
  assertPermission(ctx, Permission["inventory.read"]);
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  const lowStock = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, ctx.tenantId),
        eq(products.active, true),
        isNull(products.deletedAt),
        lte(products.quantity, products.lowStockThreshold)
      )
    )
    .orderBy(asc(products.quantity));

  const expiring = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, ctx.tenantId),
        eq(products.active, true),
        isNull(products.deletedAt),
        isNotNull(products.expiryDate),
        gte(products.expiryDate, now),
        lte(products.expiryDate, soon)
      )
    )
    .orderBy(asc(products.expiryDate));

  return { lowStock, expiring };
}
