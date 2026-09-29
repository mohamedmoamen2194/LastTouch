import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { db } from "@/db";
import { appointments, clientPointsLedger } from "@/db/schema";
import { assertPlatformApi } from "@/lib/platform/admin";

const bodySchema = z.object({
  action: z.enum(["reopen"]),
  appointmentId: z.string().uuid(),
});

/**
 * POST /api/platform/appointments — rescue actions for store mistakes.
 * reopen: completed → confirmed + claws back the spend points granted for
 * it. Nothing else can reopen a completed booking (stores and clients
 * are locked out by design).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, input.data.appointmentId)).limit(1);
    if (!appt) {
      return NextResponse.json({ success: false, message: "Booking not found" }, { status: HttpStatus.NotFound });
    }
    if (appt.status !== "completed") {
      return NextResponse.json({ success: false, message: "Only completed bookings can be reopened" }, { status: HttpStatus.BadRequest });
    }

    await db
      .update(appointments)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(appointments.id, appt.id));
    await db
      .delete(clientPointsLedger)
      .where(
        and(
          eq(clientPointsLedger.refAppointmentId, appt.id),
          eq(clientPointsLedger.reason, "booking"),
        ),
      );

    return NextResponse.json(ok({ id: appt.id, status: "confirmed" }), { status: HttpStatus.Ok });
  });
}
