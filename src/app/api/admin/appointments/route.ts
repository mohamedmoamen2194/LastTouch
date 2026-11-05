import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import {
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  noShowAppointment,
} from "@/modules/appointments/application/appointments";
import { createStaffAppointment, addServicesToAppointment } from "@/modules/booking/application/staff-bookings";
import { listTenantServicesForAdmin } from "@/modules/booking/domain/catalog";

const cancelSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const createSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  useCurrentTime: z.boolean().optional(),
  employeeId: z.string().uuid().optional(),
  employeeAssignments: z
    .array(z.object({ serviceId: z.string().uuid(), employeeId: z.string().uuid() }))
    .optional(),
  serviceIds: z.array(z.string().uuid()).optional().default([]),
  customerName: z.string().max(200).optional().or(z.literal("")),
  customerPhone: z.string().max(30).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  homeAddress: z.string().max(500).optional().or(z.literal("")),
  homeCity: z.string().max(120).optional().or(z.literal("")),
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
});

const attachSchema = z.object({
  appointmentId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
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
    await assertSubscriptionAccess(ctx.tenantId);

    if (action === "services") {
      const services = await listTenantServicesForAdmin(ctx.tenantId);
      return NextResponse.json(
        ok(
          services.filter((s) => s.active).map((s) => ({
            id: s.id,
            name: s.name,
            homeVisit: s.homeVisit,
            durationMinutes: s.durationMinutes,
            price: String(s.price),
          })),
          "Services"
        ),
        { status: HttpStatus.Ok }
      );
    }

    if (action === "create") {
      const body = await readJson<unknown>(req);
      const input = createSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid appointment payload");
      const result = await createStaffAppointment(ctx, {
        dateKey: input.data.dateKey ?? "",
        startTime: input.data.startTime,
        useCurrentTime: input.data.useCurrentTime,
        employeeId: input.data.employeeId,
        employeeAssignments: input.data.employeeAssignments,
        serviceIds: input.data.serviceIds ?? [],
        customerName: input.data.customerName || undefined,
        customerPhone: input.data.customerPhone || undefined,
        notes: input.data.notes || undefined,
        homeAddress: input.data.homeAddress || undefined,
        homeCity: input.data.homeCity || undefined,
        homeLatitude: input.data.homeLatitude,
        homeLongitude: input.data.homeLongitude,
        source: input.data.useCurrentTime ? "walk_in" : "dashboard",
      });
      return NextResponse.json(ok({ id: result.appointment.id, status: result.appointment.status }, "Appointment added"), {
        status: HttpStatus.Created,
      });
    }

    if (action === "attach-services") {
      const body = await readJson<unknown>(req);
      const input = attachSchema.safeParse(body);
      if (!input.success) throw new ValidationAppError("Invalid payload");
      const result = await addServicesToAppointment(ctx, input.data.appointmentId, input.data.serviceIds, input.data.employeeId);
      return NextResponse.json(ok({ id: result.appointment.id, added: result.added }, "Services added"));
    }

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