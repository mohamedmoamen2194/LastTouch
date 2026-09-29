import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { appointments, customers, tenants, visits } from "@/db/schema";
import {
  addMinutesHm,
  apptDayYmd,
  completeAppointment,
  getClientProfile,
  tenantNow,
} from "@/lib/marketplace/client";

const bodySchema = z.object({
  appointmentId: z.string().uuid(),
  /** auto = first scan checks in, second checks out; in/out force one side. */
  mode: z.enum(["auto", "in", "out"]).default("auto"),
  /** Raw QR content from the camera — must belong to the booking's store. */
  qr: z.string().min(1).max(2000),
});

/**
 * GET /api/visits/scan?appointmentId=… — visit state for the scan popup:
 * whether a check-in is open (so the UI preselects check-out), and the
 * booking status. Ownership-checked, no side effects.
 */
export async function GET(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const appointmentId = new URL(req.url).searchParams.get("appointmentId");
    if (!appointmentId) throw new ValidationAppError("Missing appointment");

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
    if (!appt) throw new ValidationAppError("Booking not found");

    let owned = appt.clientUserId === userId;
    if (!owned && appt.customerId) {
      const [c] = await db
        .select({ phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, appt.customerId))
        .limit(1);
      const profile = await getClientProfile(userId);
      owned = Boolean(profile?.phone && c?.phone && profile.phone === c.phone);
    }
    if (!owned) throw new ValidationAppError("This booking is not yours");

    const [open] = await db
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.appointmentId, appointmentId), eq(visits.status, "checked_in")))
      .limit(1);

    return NextResponse.json(
      ok({ open: Boolean(open), suggested: open ? "out" : "in", status: appt.status }),
      { status: HttpStatus.Ok },
    );
  });
}

/**
 * POST /api/visits/scan — appointment check-in / check-out from the client
 * bookings page. Guards, in order: ownership, open status, QR belongs to
 * the appointment's store, same-day check-in window (start +10 min),
 * check-out deadline (end +3h). Checkout closes the visit AND completes
 * the appointment (points accrue); a checkout with no open visit records
 * check-in + check-out together instead of failing.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`visits:scan:${clientIp(req)}`, 20);
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid scan request");
    const { appointmentId, mode, qr } = input.data;

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
    if (!appt) throw new ValidationAppError("Booking not found");

    // Ownership: account link, or profile phone matching the booking customer.
    let owned = appt.clientUserId === userId;
    let customer = null as null | { id: string; phone: string | null; firstName: string };
    if (appt.customerId) {
      const [c] = await db
        .select({ id: customers.id, phone: customers.phone, firstName: customers.firstName })
        .from(customers)
        .where(eq(customers.id, appt.customerId))
        .limit(1);
      customer = c ?? null;
      if (!owned) {
        const profile = await getClientProfile(userId);
        owned = Boolean(profile?.phone && customer?.phone && profile.phone === customer.phone);
      }
    } else if (!owned) {
      // No customer row and no account link — nothing ties this booking here.
      owned = false;
    }
    if (!owned) throw new ValidationAppError("This booking is not yours");

    if (appt.status !== "pending" && appt.status !== "confirmed") {
      throw new ValidationAppError("This booking is closed");
    }

    const [tenant] = await db
      .select({ slug: tenants.slug, timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, appt.tenantId))
      .limit(1);
    if (!tenant) throw new ValidationAppError("Store not found");

    // The scanned QR must belong to this appointment's store.
    let qrOk = false;
    try {
      const url = new URL(qr, "https://lasttouch.app");
      qrOk =
        url.pathname.includes(`/book/${tenant.slug}`) || url.pathname.includes(`/checkin/${tenant.slug}`);
    } catch {
      qrOk = false;
    }
    if (!qrOk) throw new ValidationAppError("wrong_store");

    const tz = tenant.timezone ?? "Africa/Cairo";
    const now = tenantNow(tz);
    const day = apptDayYmd(appt.appointmentDate, tz);
    const lateCheckin = addMinutesHm(appt.startTime, 10);
    const checkoutDeadline = addMinutesHm(appt.endTime, 180);

    const [open] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.appointmentId, appointmentId), eq(visits.status, "checked_in")))
      .limit(1);

    const wantOut = mode === "out" || (mode === "auto" && open);

    if (!wantOut) {
      // ---- check-in ----
      if (open) throw new ValidationAppError("already_checked_in");
      if (day !== now.ymd) throw new ValidationAppError("not_today");
      if (now.hm > lateCheckin) throw new ValidationAppError("too_late_checkin");
      await db.insert(visits).values({
        tenantId: appt.tenantId,
        customerId: appt.customerId,
        customerName: customer?.firstName ?? null,
        phone: customer?.phone ?? null,
        appointmentId: appt.id,
        status: "checked_in",
      });
      if (appt.status === "pending") {
        await db
          .update(appointments)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));
      }
      return NextResponse.json(ok({ action: "checked_in", status: "confirmed" }), { status: HttpStatus.Ok });
    }

    // ---- check-out ----
    if (day > now.ymd) throw new ValidationAppError("too_early");
    if (day < now.ymd) throw new ValidationAppError("too_late_checkout");
    if (now.hm > checkoutDeadline) throw new ValidationAppError("too_late_checkout");

    if (open) {
      await db
        .update(visits)
        .set({ status: "checked_out", checkOutAt: new Date(), updatedAt: new Date() })
        .where(eq(visits.id, open.id));
    } else {
      // No open visit (missed check-in): record both legs at once so the
      // visit isn't lost — the admin panel can correct mistakes.
      await db.insert(visits).values({
        tenantId: appt.tenantId,
        customerId: appt.customerId,
        customerName: customer?.firstName ?? null,
        phone: customer?.phone ?? null,
        appointmentId: appt.id,
        status: "checked_out",
        checkOutAt: new Date(),
      });
    }
    await completeAppointment(appt.id);
    return NextResponse.json(ok({ action: "checked_out", status: "completed" }), {
      status: HttpStatus.Ok,
    });
  });
}
