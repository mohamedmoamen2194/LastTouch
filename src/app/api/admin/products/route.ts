import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  setProductStock,
  updateProduct,
} from "@/modules/inventory/application/products";

const idSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/products?slug=...&action=create|update|delete|stock|get */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    const action = url.searchParams.get("action");

    const ctx = await getDashboardAccess(slug);
    await assertSubscriptionAccess(ctx.tenantId);

    if (action === "create") {
      const body = await readJson<unknown>(req);
      const product = await createProduct(ctx, body);
      return NextResponse.json(ok({ product }, "Product created"), { status: HttpStatus.Created });
    }

    if (action === "update") {
      const body = await readJson<Record<string, unknown>>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid product payload");
      const product = await updateProduct(ctx, parsed.data.id, body);
      return NextResponse.json(ok({ product }, "Product updated"));
    }

    if (action === "delete") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid product payload");
      await deleteProduct(ctx, parsed.data.id);
      return NextResponse.json(ok({ id: parsed.data.id }, "Product deleted"));
    }

    if (action === "stock") {
      const body = await readJson<{ id?: unknown; quantity?: unknown }>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid product payload");
      const product = await setProductStock(ctx, parsed.data.id, Number(body.quantity));
      return NextResponse.json(ok({ product }, "Stock updated"));
    }

    if (action === "get") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid product payload");
      const product = await getProduct(ctx, parsed.data.id);
      return NextResponse.json(ok({ product }, "Product"));
    }

    if (action === "list") {
      const products = await listProducts(ctx);
      return NextResponse.json(ok({ products }, "Products"));
    }

    throw new ValidationAppError("Unknown action");
  });
}
