import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  noShowAppointment,
} from "@/modules/appointments/application/appointments";

const cancelSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const rescheduleSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const idSchema = z.object({
  appointmentId: z.string().uuid(),
});

/**
 * POST /api/admin/appointments
 * Manage a tenant's appointments: cancel / reschedule / confirm /
 * complete / no_show. Runs in the authenticated tenant context and
 * enforces permission + status on the server.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");

    const action = url.searchParams.get("action");

    const ctx = await getDashboardAccess(slug);

    if (action === "cancel") {
      const body = await readJson<unknown>(req);
      const input = cancelSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid cancel request");
      const updated = await cancelAppointment(ctx, input.data.appointmentId, input.data.reason);
      return NextResponse.json(ok({ id: updated.id, status: updated.status }, "Appointment cancelled"));
    }

    if (action === "reschedule") {
      const body = await readJson<unknown>(req);
      const input = rescheduleSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid reschedule request");
      const updated = await rescheduleAppointment(ctx, input.data.appointmentId, input.data.appointmentDate, input.data.startTime);
      return NextResponse.json(
        ok(
          { id: updated.id, appointmentDate: updated.appointmentDate, startTime: updated.startTime },
          "Appointment rescheduled"
        ),
        { status: HttpStatus.Ok }
      );
    }

    if (action === "confirm") {
      const body = await readJson<unknown>(req);
      const input = idSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid appointment payload");
      const updated = await confirmAppointment(ctx, input.data.appointmentId);
      return NextResponse.json(ok({ id: updated.id, status: updated.status }, "Appointment confirmed"));
    }

    if (action === "complete") {
      const body = await readJson<unknown>(req);
      const input = idSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid appointment payload");
      const updated = await completeAppointment(ctx, input.data.appointmentId);
      return NextResponse.json(ok({ id: updated.id, status: updated.status }, "Appointment completed"));
    }

    if (action === "no_show") {
      const body = await readJson<unknown>(req);
      const input = idSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid appointment payload");
      const updated = await noShowAppointment(ctx, input.data.appointmentId);
      return NextResponse.json(ok({ id: updated.id, status: updated.status }, "Appointment marked as no-show"));
    }

    throw new ValidationAppError("Unknown action");
  });
}