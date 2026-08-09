import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { appointments, employees, type AppointmentStatus } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";
import { buildDaySlots } from "../../availability/domain/engine";

const OPEN_STATUSES: AppointmentStatus[] = ["pending", "confirmed"];

export type ListAppointmentsArgs = {
  status?: AppointmentStatus;
  employeeId?: string;
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
  limit?: number;
  offset?: number;
};

/**
 * List appointments for a tenant with optional filters (spec section 22).
 */
export async function listAppointments(ctx: TenantContext, args: ListAppointmentsArgs = {}) {
  assertPermission(ctx, Permission["appointments.read"]);

  const conditions = [eq(appointments.tenantId, ctx.tenantId)];
  if (args.status) conditions.push(inArray(appointments.status, [args.status]));
  if (args.employeeId) conditions.push(eq(appointments.employeeId, args.employeeId));
  if (args.from) conditions.push(gte(appointments.appointmentDate, parseDateTime(args.from)));
  if (args.to) conditions.push(lte(appointments.appointmentDate, parseDateTime(args.to, "23:59:59")));

  return db
    .select({
      id: appointments.id,
      dateTime: appointments.appointmentDate,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      price: appointments.price,
      source: appointments.source,
      employeeId: appointments.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      customerId: appointments.customerId,
      durationMinutes: appointments.durationMinutes,
    })
    .from(appointments)
    .leftJoin(employees, eq(employees.id, appointments.employeeId))
    .where(and(...conditions))
    .orderBy(appointments.appointmentDate)
    .limit(args.limit ?? 50)
    .offset(args.offset ?? 0);
}

/**
 * Reschedule an upcoming appointment (spec section 24). Records an audit
 * trail via the appointments reschedule fields.
 */
export async function rescheduleAppointment(
  ctx: TenantContext,
  id: string,
  appointmentDate: string,
  startTime: string
) {
  assertPermission(ctx, Permission["appointments.update"]);

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (!OPEN_STATUSES.includes(appt.status)) {
    throw new ConflictError("Only pending or confirmed appointments can be rescheduled");
  }
  if (!appt.employeeId) throw new ConflictError("Appointment has no assigned staff");

  const date = parseDateTime(appointmentDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) throw new ValidationAppError("Cannot reschedule to a past date");

  const slots = await buildDaySlots({
    employeeId: appt.employeeId,
    date,
    serviceDurationMinutes: appt.durationMinutes,
  });
  const pick = slots.find((s) => s.start === startTime && s.available);
  if (!pick) throw new ConflictError("The requested slot is no longer available");

  const [updated] = await db
    .update(appointments)
    .set({
      appointmentDate: date,
      startTime,
      endTime: pick.end,
      rescheduledFrom: appt.appointmentDate,
      rescheduledBy: ctx.userId,
      rescheduledAt: new Date(),
    })
    .where(eq(appointments.id, appt.id))
    .returning();

  return updated;
}

/**
 * Cancel an appointment (spec §5). Marks cancelled and records the reason.
 */
export async function cancelAppointment(ctx: TenantContext, id: string, reason?: string) {
  assertPermission(ctx, Permission["appointments.update"]);

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (!OPEN_STATUSES.includes(appt.status)) throw new ConflictError("Appointment is already closed");

  const [updated] = await db
    .update(appointments)
    .set({
      status: "cancelled",
      cancelReason: reason ?? null,
      cancelledBy: ctx.userId,
      cancelledAt: new Date(),
    })
    .where(eq(appointments.id, appt.id))
    .returning();

  return updated;
}

/** Confirm a pending appointment. */
export async function confirmAppointment(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["appointments.update"]);

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.status !== "pending") throw new ConflictError("Only pending appointments can be confirmed");

  const [updated] = await db
    .update(appointments)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(appointments.id, appt.id))
    .returning();
  return updated;
}

/** Mark a confirmed appointment as completed. */
export async function completeAppointment(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["appointments.update"]);

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.status !== "confirmed") throw new ConflictError("Only confirmed appointments can be completed");

  const [updated] = await db
    .update(appointments)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(appointments.id, appt.id))
    .returning();
  return updated;
}

/** Mark a confirmed appointment as a no-show. */
export async function noShowAppointment(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["appointments.update"]);

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.status !== "confirmed") throw new ConflictError("Only confirmed appointments can be marked as no-show");

  const [updated] = await db
    .update(appointments)
    .set({ status: "no_show", updatedAt: new Date() })
    .where(eq(appointments.id, appt.id))
    .returning();
  return updated;
}

function parseDateTime(datePart: string, timePart = "00:00:00"): Date {
  return new Date(`${datePart}T${timePart}`);
}