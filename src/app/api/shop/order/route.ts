import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { assertBookingOpen } from "@/lib/subscriptions";
import { createOnlineOrder } from "@/modules/inventory/application/sales";

/**
 * POST /api/shop/order?slug=...
 * Public storefront order (pay on pickup). Reserves stock immediately.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    rateLimit(`shop-order:${clientIp(req)}`, 10);

    const tenant = await resolveTenantForBooking(slug);
    await assertBookingOpen(tenant.id);

    const sale = await createOnlineOrder(tenant.id, await readJson<unknown>(req));
    return NextResponse.json(
      ok(
        {
          id: sale.id,
          reference: sale.reference,
          total: sale.total,
          status: sale.status,
        },
        "Order placed"
      ),
      { status: HttpStatus.Created }
    );
  });
}
