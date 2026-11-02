import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import { createSale, listSales, setSaleStatus } from "@/modules/inventory/application/sales";

const saleIdSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/sales?slug=...&action=create|list|status */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    const action = url.searchParams.get("action");

    const ctx = await getDashboardAccess(slug);
    await assertSubscriptionAccess(ctx.tenantId);

    if (action === "create") {
      const sale = await createSale(ctx, await readJson<unknown>(req));
      return NextResponse.json(ok({ sale }, "Sale recorded"), { status: HttpStatus.Created });
    }

    if (action === "list") {
      const sales = await listSales(ctx);
      return NextResponse.json(ok({ sales }, "Sales"));
    }

    if (action === "status") {
      const body = await readJson<{ id?: unknown; status?: unknown }>(req);
      const parsed = saleIdSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid sale payload");
      const sale = await setSaleStatus(ctx, parsed.data.id, body.status);
      return NextResponse.json(ok({ sale }, "Sale updated"));
    }

    throw new ValidationAppError("Unknown action");
  });
}
