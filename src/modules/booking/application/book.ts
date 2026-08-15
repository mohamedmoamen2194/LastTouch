import { db } from "@/db";
import { appointmentServices, appointmentEmployees, appointments, customers, employees, employeeServices, services, type AppointmentSource } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { buildDaySlots, buildSequentialChainSlots } from "../../availability/domain/engine";

export type EmployeeAssignment = {
  serviceId: string;
  employeeId: string;
};

export type CreateBookingInput = {
  tenantId: string;
  slug: string;
  serviceIds: string[];
  employeeId?: string;
  employeeAssignments?: EmployeeAssignment[];
  appointmentDate: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  customer: {
    firstName: string;
    phone: string;
    email?: string;
    notes?: string;
    marketingConsent?: boolean;
  };
  source?: AppointmentSource;
};

export type BookingAvailability = {
  employeeId: string;
  assignments: EmployeeAssignment[];
  endTime: string;
  durationMinutes: number;
  price: string;
};

function parseBookingDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** All active workers of a tenant with their service mappings, keyed by id. */
async function tenantWorkers(tenantId: string) {
  const staff = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.active, true)));
  if (staff.length === 0) return new Map<string, { isGeneral: boolean; serviceIds: string[] }>();

  const links = await db
    .select()
    .from(employeeServices)
    .where(inArray(employeeServices.employeeId, staff.map((s) => s.id)));
  const byWorker = new Map<string, string[]>();
  for (const l of links) {
    byWorker.set(l.employeeId, [...(byWorker.get(l.employeeId) ?? []), l.serviceId]);
  }

  const map = new Map<string, { isGeneral: boolean; serviceIds: string[] }>();
  for (const s of staff) map.set(s.id, { isGeneral: s.isGeneral, serviceIds: byWorker.get(s.id) ?? [] });
  return map;
}

function workerCovers(worker: { isGeneral: boolean; serviceIds: string[] }, serviceId: string): boolean {
  return worker.isGeneral || worker.serviceIds.length === 0 || worker.serviceIds.includes(serviceId);
}

/** True when a worker can cover every requested service. */
function workerCoversAll(worker: { isGeneral: boolean; serviceIds: string[] }, serviceIds: string[]): boolean {
  if (worker.isGeneral || worker.serviceIds.length === 0) return true;
  const has = new Set(worker.serviceIds);
  return serviceIds.every((id) => has.has(id));
}

/**
 * Validates the requested slot is open for the given services + workers.
 * Called before any appointment is created (spec section 23).
 * Never trusts client input — re-validates service ownership and availability.
 *
 * Worker resolution precedence:
 *   1. `employeeAssignments` — one worker per service (multi-worker packages).
 *   2. `employeeId` — a single worker who must cover ALL services (general or mapped).
 *   3. neither — auto-assign: first a single worker covering all services, else one per service.
 */
export async function validateBookingAvailability(args: {
  tenantId: string;
  serviceIds: string[];
  employeeId?: string;
  employeeAssignments?: EmployeeAssignment[];
  appointmentDate: Date;
  startTime: string;
}): Promise<BookingAvailability> {
  if (args.serviceIds.length === 0) throw new ValidationAppError("Select at least one service");

  let durationMinutes = 0;
  let priceNum = 0;
  for (const serviceId of args.serviceIds) {
    const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!svc || svc.tenantId !== args.tenantId) throw new NotFoundError("Service not found");
    if (!svc.active) throw new ConflictError("Service is not active");
    durationMinutes += svc.durationMinutes;
    priceNum += Number(svc.price);
  }

  const workers = await tenantWorkers(args.tenantId);
  const assignmentOf = (serviceId: string) =>
    args.employeeAssignments?.find((a) => a.serviceId === serviceId)?.employeeId;

  const assignments: EmployeeAssignment[] = [];

  if (args.employeeAssignments && args.employeeAssignments.length > 0) {
    // Multi-worker package: every service must have a worker, and that worker
    // must cover the service. Services run back-to-back in the requested order
    // (worker 1 does service 1, then worker 2 does service 2, ...), so each
    // worker only needs their OWN slot free at its offset — not the whole
    // appointment window.
    for (const serviceId of args.serviceIds) {
      const employeeId = assignmentOf(serviceId);
      if (!employeeId) throw new ValidationAppError("Every service needs a selected staff member");
      const worker = workers.get(employeeId);
      if (!worker || !workerCovers(worker, serviceId)) {
        throw new NotFoundError("This staff member does not offer the selected service");
      }
      assignments.push({ serviceId, employeeId });
    }

    const durationByService = new Map<string, number>();
    for (const serviceId of args.serviceIds) {
      const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
      if (svc) durationByService.set(serviceId, svc.durationMinutes);
    }
    const chain = await buildSequentialChainSlots({
      assignments: assignments.map((a) => ({
        employeeId: a.employeeId,
        serviceDurationMinutes: durationByService.get(a.serviceId) ?? 0,
      })),
      date: args.appointmentDate,
    });
    if (!chain.some((s) => s.start === args.startTime && s.available)) {
      throw new ConflictError("One of the selected staff members is unavailable at that time");
    }
    const found = chain.find((s) => s.start === args.startTime);

    const primary = assignments[0].employeeId;
    return {
      employeeId: primary,
      assignments,
      endTime: found?.end ?? addMinutes(args.startTime, durationMinutes),
      durationMinutes,
      price: priceNum.toFixed(2),
    };
  }

  let employeeId = args.employeeId;
  if (employeeId) {
    // A single specific worker must cover every requested service.
    const worker = workers.get(employeeId);
    if (!worker || !workerCoversAll(worker, args.serviceIds)) {
      throw new NotFoundError("This staff member does not offer the selected service");
    }
  } else {
    // Auto-assign: prefer one worker covering all services, else one per service.
    const coveringAll = [...workers.entries()].find(([, w]) => workerCoversAll(w, args.serviceIds))?.[0];
    if (coveringAll) {
      employeeId = coveringAll;
    } else {
      const perService: string[] = [];
      for (const serviceId of args.serviceIds) {
        const candidate = [...workers.entries()].find(([, w]) => workerCovers(w, serviceId))?.[0];
        if (!candidate) throw new ConflictError("No staff member offers the selected services");
        perService.push(candidate);
      }
      assignments.push(...args.serviceIds.map((serviceId, i) => ({ serviceId, employeeId: perService[i] })));
      employeeId = perService[0];
    }
  }

  if (assignments.length === 0) {
    const slots = await buildDaySlots({ employeeId, date: args.appointmentDate, serviceDurationMinutes: durationMinutes });
    if (!slots.some((s) => s.start === args.startTime && s.available)) {
      throw new ConflictError("No employee available at the selected time");
    }
    assignments.push(...args.serviceIds.map((serviceId) => ({ serviceId, employeeId })));
  } else {
    for (const employeeId of [...new Set(assignments.map((a) => a.employeeId))]) {
      const slots = await buildDaySlots({ employeeId, date: args.appointmentDate, serviceDurationMinutes: durationMinutes });
      if (!slots.some((s) => s.start === args.startTime && s.available)) {
        throw new ConflictError("No employee available at the selected time");
      }
    }
  }

  const slot = await buildDaySlots({ employeeId, date: args.appointmentDate, serviceDurationMinutes: durationMinutes });
  const found = slot.find((s) => s.start === args.startTime);
  if (!found) throw new ValidationAppError("The selected time is unavailable");
  if (!found.available) throw new ConflictError("The selected time is no longer available");

  return { employeeId, assignments, endTime: found.end, durationMinutes, price: priceNum.toFixed(2) };
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Creates (or reuses) the customer, then creates the appointment + snapshots.
 * Single entry point for booking from website, AI, WhatsApp, or dashboard.
 */
export async function createBooking(input: CreateBookingInput) {
  const appointmentDate = parseBookingDay(input.appointmentDate);

  const availability = await validateBookingAvailability({
    tenantId: input.tenantId,
    serviceIds: input.serviceIds,
    employeeId: input.employeeId,
    employeeAssignments: input.employeeAssignments,
    appointmentDate,
    startTime: input.startTime,
  });

  let customerId: string | null = null;
  if (input.customer.firstName) {
    const existing = await db.query.customers.findFirst({
      where: (c, { and, eq: op }) =>
        and(op(c.tenantId, input.tenantId), op(c.phone, input.customer.phone)),
    });

    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const [created] = await db
        .insert(customers)
        .values({
          tenantId: input.tenantId,
          firstName: input.customer.firstName,
          phone: input.customer.phone,
          email: input.customer.email ?? null,
          notes: input.customer.notes ?? null,
          marketingConsent: input.customer.marketingConsent ?? false,
        })
        .returning();
      id = created.id;
    }
    customerId = id;
  }

  const [appt] = await db
    .insert(appointments)
    .values({
      tenantId: input.tenantId,
      customerId,
      employeeId: availability.employeeId,
      appointmentDate,
      startTime: input.startTime,
      endTime: availability.endTime,
      durationMinutes: availability.durationMinutes,
      price: availability.price,
      status: "pending",
      source: input.source ?? "website",
      notes: input.customer.notes ?? null,
    })
    .returning();

  // Persist snapshot rows for immutable history (spec section 18).
  let sortOrder = 0;
  for (const serviceId of input.serviceIds) {
    const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (svc) {
      await db.insert(appointmentServices).values({
        appointmentId: appt.id,
        serviceId: svc.id,
        serviceNameSnapshot: svc.name,
        durationSnapshot: svc.durationMinutes,
        priceSnapshot: svc.price,
        sortOrder: sortOrder++,
      });
    }
  }

  // Persist per-service worker assignments (multi-worker packages).
  await db.insert(appointmentEmployees).values(
    availability.assignments.map((a, i) => ({
      appointmentId: appt.id,
      employeeId: a.employeeId,
      serviceId: a.serviceId,
      sortOrder: i,
    }))
  );

  return { appointment: appt, customerId };
}