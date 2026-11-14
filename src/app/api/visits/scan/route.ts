import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError, ForbiddenError } from "@/lib/errors";
import { getOptionalUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { appointments, customers, locations, tenants, visits } from "@/db/schema";
import {
  addMinutesHm,
  apptDayYmd,
  completeAppointment,
  getClientProfile,
  tenantNow,
} from "@/lib/marketplace/client";
import { haversineMeters, ATTENDANCE_GEOFENCE_METERS } from "@/modules/attendance/application/attendance";
import { readGuestBookingToken } from "@/lib/marketplace/guest-access";

const bodySchema = z.object({
  appointmentId: z.string().uuid(),
  mode: z.enum(["auto", "in", "out"]).default("auto"),
  /** Optional: QR can be used to reach/open the booking; in-app check-in/out does not require scanning. */
  qr: z.string().min(1).max(2000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().optional(),
  guestToken: z.string().optional(),
});

async function assertScanAccess(appt: typeof appointments.$inferSelect, userId: string | null, guestToken?: string) {
  if (userId) {
    let owned = appt.clientUserId === userId;
    if (!owned && appt.customerId) {
      const [c] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, appt.customerId)).limit(1);
      const profile = await getClientProfile(userId);
      owned = Boolean(profile?.phone && c?.phone && profile.phone === c.phone);
    }
    if (!owned) throw new ValidationAppError("This booking is not yours");
    return;
  }
  const tok = readGuestBookingToken(guestToken);
  if (!tok || tok.aid !== appt.id) throw new ValidationAppError("Not authorized");
  if (tok.s === "store" && tok.tid && tok.tid !== appt.tenantId) throw new ValidationAppError("Not authorized");
}

export async function GET(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const appointmentId = url.searchParams.get("appointmentId");
    const guestToken = url.searchParams.get("guestToken") ?? undefined;
    if (!appointmentId || !z.string().uuid().safeParse(appointmentId).success) {
      throw new ValidationAppError("Missing appointment");
    }
    const userId = await getOptionalUserId();
    if (!userId && !guestToken) throw new ValidationAppError("Not authorized");

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
    if (!appt) throw new ValidationAppError("Booking not found");
    await assertScanAccess(appt, userId, guestToken);

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

export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`visits:scan:${clientIp(req)}`, 20);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid scan request");
    const { appointmentId, mode, qr, latitude, longitude, guestToken } = input.data;
    const userId = await getOptionalUserId();
    if (!userId && !guestToken) throw new ValidationAppError("Not authorized");

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
    if (!appt) throw new ValidationAppError("Booking not found");
    await assertScanAccess(appt, userId, guestToken);

    let customer = null as null | { id: string; phone: string | null; firstName: string };
    if (appt.customerId) {
      const [c] = await db
        .select({ id: customers.id, phone: customers.phone, firstName: customers.firstName })
        .from(customers)
        .where(eq(customers.id, appt.customerId))
        .limit(1);
      customer = c ?? null;
    }

    if (appt.status !== "pending" && appt.status !== "confirmed") {
      throw new ValidationAppError("This booking is closed");
    }

    const [tenant] = await db
      .select({ slug: tenants.slug, timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, appt.tenantId))
      .limit(1);
    if (!tenant) throw new ValidationAppError("Store not found");

    if (qr) {
      let qrOk = false;
      try {
        const url = new URL(qr, "https://lasttouch.app");
        qrOk = url.pathname.includes(`/book/${tenant.slug}`) || url.pathname.includes(`/checkin/${tenant.slug}`);
      } catch {
        qrOk = false;
      }
      if (!qrOk) throw new ValidationAppError("wrong_store");
    }

    const [storeLoc] = await db
      .select({ latitude: locations.latitude, longitude: locations.longitude })
      .from(locations)
      .where(and(eq(locations.tenantId, appt.tenantId), eq(locations.active, true)))
      .limit(1);
    if (!storeLoc?.latitude || !storeLoc.longitude) throw new ValidationAppError("location_not_set");
    const distanceMeters = haversineMeters(
      { latitude, longitude },
      { latitude: Number(storeLoc.latitude), longitude: Number(storeLoc.longitude) },
    );
    if (distanceMeters > ATTENDANCE_GEOFENCE_METERS) throw new ForbiddenError("out_of_range");

    const tz = tenant.timezone ?? "Africa/Cairo";
    const now = tenantNow(tz);
    const day = apptDayYmd(appt.appointmentDate, tz);
    const lateCheckin = addMinutesHm(appt.startTime, 5);
    const checkoutDeadline = addMinutesHm(appt.endTime, 180);

    const [open] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.appointmentId, appointmentId), eq(visits.status, "checked_in")))
      .limit(1);

    const wantOut = mode === "out" || (mode === "auto" && open);

    if (!wantOut) {
      if (open) {
        return NextResponse.json(ok({ action: "checked_in", status: appt.status, visitId: open.id, already: true }), { status: HttpStatus.Ok });
      }
      if (day !== now.ymd) throw new ValidationAppError("not_today");
      if (now.hm > lateCheckin) throw new ValidationAppError("too_late_checkin");
      const [created] = await db
        .insert(visits)
        .values({
          tenantId: appt.tenantId,
          customerId: appt.customerId,
          customerName: customer?.firstName ?? null,
          phone: customer?.phone ?? null,
          appointmentId: appt.id,
          status: "checked_in",
        })
        .onConflictDoNothing()
        .returning({ id: visits.id });
      if (!created) {
        const [winner] = await db.select({ id: visits.id }).from(visits).where(and(eq(visits.appointmentId, appointmentId), eq(visits.status, "checked_in"))).limit(1);
        return NextResponse.json(ok({ action: "checked_in", status: appt.status, visitId: winner?.id ?? null, already: true }), { status: HttpStatus.Ok });
      }
      // keep appointment in upcoming state until check-out; only mark visit checked_in
      if (appt.status === "pending") {
        await db.update(appointments).set({ status: "confirmed", updatedAt: new Date() }).where(eq(appointments.id, appt.id));
      }
      return NextResponse.json(ok({ action: "checked_in", status: appt.status === "pending" ? "confirmed" : appt.status, visitId: created.id }), { status: HttpStatus.Ok });
    }

    if (day > now.ymd) throw new ValidationAppError("too_early");
    if (day < now.ymd) throw new ValidationAppError("too_late_checkout");
    if (now.hm > checkoutDeadline) throw new ValidationAppError("too_late_checkout");

    if (open) {
      await db.update(visits).set({ status: "checked_out", checkOutAt: new Date(), updatedAt: new Date() }).where(eq(visits.id, open.id));
    } else {
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
    const [closed] = await db.select({ id: visits.id }).from(visits).where(and(eq(visits.appointmentId, appointmentId), eq(visits.status, "checked_out"))).orderBy(visits.id).limit(1);
    return NextResponse.json(ok({ action: "checked_out", status: "completed", visitId: closed?.id ?? null }), { status: HttpStatus.Ok });
  });
}
