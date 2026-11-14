import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { getOptionalUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { appointmentEmployees, appointmentServices } from "@/db/schema";
import { readGuestBookingToken } from "@/lib/marketplace/guest-access";
import { assertManageAccess, canModifyNow } from "@/lib/marketplace/booking-manage";
import { buildDaySlots, buildSequentialChainSlots, parseDay } from "@/modules/availability/domain/engine";

const bodySchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestToken: z.string().optional(),
});

export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`client:reslots:${clientIp(req)}`, 60);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    const userId = await getOptionalUserId();
    const token = readGuestBookingToken(input.data.guestToken);
    if (!userId && !token) return NextResponse.json({ success: false, message: "Not authorized" }, { status: 401 });
    const row = await assertManageAccess({ appointmentId: input.data.id, userId, tokenPayload: token });
    if (!canModifyNow(row)) return NextResponse.json({ success: false, message: "Cannot modify" }, { status: 400 });

    const [svcRows, empRows] = await Promise.all([
      db.select({ serviceId: appointmentServices.serviceId, duration: appointmentServices.durationSnapshot }).from(appointmentServices).where(eq(appointmentServices.appointmentId, row.id)).orderBy(appointmentServices.sortOrder),
      db.select({ serviceId: appointmentEmployees.serviceId, employeeId: appointmentEmployees.employeeId }).from(appointmentEmployees).where(eq(appointmentEmployees.appointmentId, row.id)).orderBy(appointmentEmployees.sortOrder),
    ]);
    const serviceIds = svcRows.map((s) => s.serviceId).filter((x): x is string => Boolean(x));
    if (serviceIds.length === 0) return NextResponse.json(ok({ slots: [], meta: null }));
    const durationBy = new Map(svcRows.filter(s=>s.serviceId).map(s => [s.serviceId as string, s.duration]));
    const total = svcRows.reduce((a, s) => a + s.duration, 0);
    const date = parseDay(input.data.date);

    let slots;
    let meta: { mode: string; assignments?: { serviceId: string; employeeId: string }[]; employeeId?: string } | null = null;
    const hasPerService = empRows.some((e) => e.serviceId);
    if (hasPerService) {
      const assignments = serviceIds.map((sid) => {
        const e = empRows.find((x) => x.serviceId === sid);
        return { employeeId: e?.employeeId || row.employeeId!, serviceDurationMinutes: durationBy.get(sid) ?? 0 };
      });
      slots = await buildSequentialChainSlots({ assignments, date, excludeAppointmentId: row.id });
      meta = { mode: "sequential", assignments: serviceIds.map((sid, i) => ({ serviceId: sid, employeeId: assignments[i].employeeId })) };
    } else {
      const employeeId = row.employeeId || empRows[0]?.employeeId;
      if (!employeeId) return NextResponse.json(ok({ slots: [], meta: null }));
      slots = await buildDaySlots({ employeeId, date, serviceDurationMinutes: total, excludeAppointmentId: row.id });
      meta = { mode: "single", employeeId };
    }
    return NextResponse.json(ok({ slots, meta }));
  });
}
