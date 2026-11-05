import { db } from "@/db";
import { appointments, visits } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { tenantNow } from "@/lib/marketplace/client";
import { zonedDateTime } from "../../attendance/domain/time";

/** Minutes after the appointment ends before an absent booking is a no-show. */
export const NO_SHOW_AFTER_MINUTES = 30;

/**
 * The no-show safety net, run lazily whenever appointments are listed.
 *
 * A pending/confirmed appointment with NEITHER a check-in nor a check-out
 * becomes a no-show only 30 minutes AFTER its slot ends — never earlier.
 * An earlier manual no-show / cancel by staff is untouched; a client who
 * merely checked in (or checked out) is already completed and never flips.
 */
export async function sweepStaleAppointments(tenantId: string, timezone: string): Promise<number> {
  const now = tenantNow(timezone);
  const nowAbs = zonedDateTime(now.ymd, now.hm, timezone).getTime();

  const rows = await db
    .select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      endTime: appointments.endTime,
    })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), inArray(appointments.status, ["pending", "confirmed"])));
  if (rows.length === 0) return 0;

  const withVisits = await db
    .select({ appointmentId: visits.appointmentId })
    .from(visits)
    .where(inArray(visits.appointmentId, rows.map((r) => r.id)));
  const visited = new Set(withVisits.map((v) => v.appointmentId));

  const threshold = nowAbs - NO_SHOW_AFTER_MINUTES * 60_000;
  const toFlip: string[] = [];
  for (const r of rows) {
    if (visited.has(r.id)) continue;
    const dayYmd = tenantNow(timezone, new Date(r.appointmentDate)).ymd;
    const endAbs = zonedDateTime(dayYmd, r.endTime, timezone).getTime();
    if (endAbs < threshold) toFlip.push(r.id);
  }

  if (toFlip.length === 0) return 0;
  await db
    .update(appointments)
    .set({ status: "no_show", updatedAt: new Date() })
    .where(inArray(appointments.id, toFlip));
  return toFlip.length;
}
