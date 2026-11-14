import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { getOptionalUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { lookupBookings } from "@/lib/marketplace/booking-manage";

const bodySchema = z.object({
  slug: z.string().min(1).optional(),
  scope: z.enum(["upcoming", "history"]).default("upcoming"),
  trackingNumber: z.string().trim().min(3).max(40).optional(),
  phone: z.string().trim().min(4).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`client:lookup:${clientIp(req)}`, 30);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    const userId = await getOptionalUserId();
    let tenantId: string | undefined;
    if (input.data.slug) {
      const tenant = await resolveTenantForBooking(input.data.slug);
      tenantId = tenant.id;
    }
    const bookings = await lookupBookings({
      tenantId,
      scope: input.data.scope,
      trackingNumber: input.data.trackingNumber || undefined,
      phone: input.data.phone || undefined,
      name: input.data.name || undefined,
      userId,
    });
    return NextResponse.json(ok({ bookings }, "Bookings"));
  });
}
