import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { appointments, appointmentEmployees, appointmentServices, employees, type AppointmentStatus } from "@/db/schema";
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

export type AppointmentServiceRow = {
  serviceId: string | null;
  name: string;
  durationMinutes: number;
  sortOrder: number;
  startTime: string;
  endTime: string;
  worker: { employeeId: string; name: string } | null;
};

export type ListedAppointment = {
  id: string;
  dateTime: Date;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  price: string;
  source: string;
  employeeId: string | null;
  employeeFirstName: string | null;
  employeeLastName: string | null;
  customerId: string | null;
  durationMinutes: number | null;
  services: AppointmentServiceRow[];
};

/**
 * Compute each service's start/end time inside an appointment, assuming the
 * services run back-to-back in `sortOrder` starting at `startTime`.
 */
export function computeServiceWindows(
  startTime: string,
  services: Array<{ durationMinutes: number }>
): Array<{ startTime: string; endTime: string }> {
  const base = toMinute(startTime);
  const out: Array<{ startTime: string; endTime: string }> = [];
  let cursor = base;
  for (const s of services) {
    const end = cursor + s.durationMinutes;
    out.push({ startTime: toHHMM(cursor), endTime: toHHMM(end) });
    cursor = end;
  }
  return out;
}

function toMinute(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * List appointments for a tenant with optional filters (spec section 22).
 */
export async function listAppointments(
  ctx: TenantContext,
  args: ListAppointmentsArgs = {}
): Promise<ListedAppointment[]> {
  assertPermission(ctx, Permission["appointments.read"]);

  const conditions = [eq(appointments.tenantId, ctx.tenantId)];
  if (args.status) conditions.push(inArray(appointments.status, [args.status]));
  if (args.employeeId) conditions.push(eq(appointments.employeeId, args.employeeId));
  if (args.from) conditions.push(gte(appointments.appointmentDate, parseDateTime(args.from)));
  if (args.to) conditions.push(lte(appointments.appointmentDate, parseDateTime(args.to, "23:59:59")));

  const rows = await db
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

  if (rows.length === 0) return rows.map((r) => ({ ...r, services: [] }));

  // Per-service worker assignments (multi-worker packages): the appointment's
  // primary worker is `appointments.employeeId`; the full team is the rows in
  // `appointmentEmployees`, each bound to a specific service.
  const assigned = await db
    .select({
      appointmentId: appointmentEmployees.appointmentId,
      serviceId: appointmentEmployees.serviceId,
      employeeId: appointmentEmployees.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(appointmentEmployees)
    .innerJoin(employees, eq(employees.id, appointmentEmployees.employeeId))
    .where(inArray(appointmentEmployees.appointmentId, rows.map((r) => r.id)))
    .orderBy(appointmentEmployees.sortOrder);

  const byAppointment = new Map<string, typeof assigned>();
  for (const a of assigned) {
    const list = byAppointment.get(a.appointmentId) ?? [];
    list.push(a);
    byAppointment.set(a.appointmentId, list);
  }

  // Service snapshots (name + duration) for every appointment, ordered.
  const serviceRows = await db
    .select({
      appointmentId: appointmentServices.appointmentId,
      serviceId: appointmentServices.serviceId,
      name: appointmentServices.serviceNameSnapshot,
      durationMinutes: appointmentServices.durationSnapshot,
      sortOrder: appointmentServices.sortOrder,
    })
    .from(appointmentServices)
    .where(inArray(appointmentServices.appointmentId, rows.map((r) => r.id)))
    .orderBy(appointmentServices.sortOrder);

  const servicesByAppt = new Map<string, typeof serviceRows>();
  for (const s of serviceRows) {
    const list = servicesByAppt.get(s.appointmentId) ?? [];
    list.push(s);
    servicesByAppt.set(s.appointmentId, list);
  }

  return rows.map((r) => {
    const services = (servicesByAppt.get(r.id) ?? []).map((s) => {
      const worker = (byAppointment.get(r.id) ?? []).find(
        (w) => w.serviceId === s.serviceId
      );
      return {
        serviceId: s.serviceId,
        name: s.name,
        durationMinutes: s.durationMinutes,
        sortOrder: s.sortOrder,
        startTime: r.startTime,
        endTime: r.endTime,
        worker: worker
          ? {
              employeeId: worker.employeeId,
              name: worker.lastName ? `${worker.firstName} ${worker.lastName}` : worker.firstName,
            }
          : null,
      };
    });
    // Fill in the actual per-service windows (back-to-back from startTime).
    const windows = computeServiceWindows(r.startTime, services);
    services.forEach((s, i) => {
      s.startTime = windows[i]?.startTime ?? s.startTime;
      s.endTime = windows[i]?.endTime ?? s.endTime;
    });
    return { ...r, services };
  });
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