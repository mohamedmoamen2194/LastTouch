import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { getOptionalUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { appointments, CLIENT_ARRIVAL_STATUSES } from "@/db/schema";
import { readGuestBookingToken } from "@/lib/marketplace/guest-access";
import { assertManageAccess, rescheduleBooking, canModifyNow } from "@/lib/marketplace/booking-manage";

const bodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["arrival", "cancel", "reschedule"]),
  status: z.enum(CLIENT_ARRIVAL_STATUSES).optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  guestToken: z.string().optional(),
});

export async function PATCH(req: Request) {
  return withApi(async () => {
    rateLimit(`client:manage:${clientIp(req)}`, 40);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    const userId = await getOptionalUserId();
    const token = readGuestBookingToken(input.data.guestToken);
    if (!userId && !token) return NextResponse.json({ success: false, message: "Not authorized" }, { status: 401 });

    const row = await assertManageAccess({ appointmentId: input.data.id, userId, tokenPayload: token });

    if (input.data.action === "arrival") {
      if (!input.data.status) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
      if (!["pending", "confirmed"].includes(row.status)) return NextResponse.json({ success: false, message: "Cannot update" }, { status: 400 });
      await db.update(appointments).set({ clientArrivalStatus: input.data.status, clientArrivalUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(appointments.id, row.id));
      return NextResponse.json(ok({ id: row.id }, "Updated"));
    }

    if (input.data.action === "cancel") {
      if (!canModifyNow(row)) return NextResponse.json({ success: false, message: "This booking can no longer be cancelled" }, { status: 400 });
      await db.update(appointments).set({ status: "cancelled", cancelledBy: userId ? "client" : "guest", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(appointments.id, row.id));
      return NextResponse.json(ok({ id: row.id }, "Cancelled"));
    }

    if (input.data.action === "reschedule") {
      if (!input.data.appointmentDate || !input.data.startTime) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
      const result = await rescheduleBooking({ appointmentId: row.id, appointmentDate: input.data.appointmentDate, startTime: input.data.startTime, actor: userId ? `client:${userId}` : "guest" });
      return NextResponse.json(ok(result, "Rescheduled"));
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  });
}
