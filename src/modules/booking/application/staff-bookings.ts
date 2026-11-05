import { db } from "@/db";
import { appointmentServices, appointmentEmployees, appointments, customers, employees, employeeServices, services, type AppointmentSource } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";
import { normalizePhone } from "@/lib/marketplace/client";
import { tenantNow } from "@/lib/marketplace/client";
import type { EmployeeAssignment } from "./book";

const SLOT_STEP = 30;
const QUICK_DURATION_MINUTES = 90; // 3 slots

type StaffAppointmentInput = {
  dateKey: string; // YYYY-MM-DD
  startTime?: string; // HH:MM — required unless useCurrentTime or quick
  /** Walk-in: derive [start, end] from the current time via walkInWindow. */
  useCurrentTime?: boolean;
  employeeId?: string;
  employeeAssignments?: EmployeeAssignment[];
  /** May be empty for a quick appointment (services added later). */
  serviceIds?: string[];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  homeAddress?: string;
  homeCity?: string;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  source?: AppointmentSource;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Walk-in slot math. Walk-ins arrive mid-slot; the booking occupies the
 * current 30-minute slot plus the slots the services need.
 *  - Arriving less than 10 minutes into the current slot → the service
 *    slots only (start at the current slot).
 *  - Arriving 10+ minutes into the current slot → the current slot is added
 *    on top of the service slots (30 more minutes).
 * Examples (60-minute service): 3:09 → 3:00–4:00; 3:15 → 3:00–4:30.
 */
export function walkInWindow(nowMinutes: number, serviceMinutes: number): { startMinutes: number; durationMinutes: number } {
  const slotStart = Math.floor(nowMinutes / SLOT_STEP) * SLOT_STEP;
  const elapsed = nowMinutes - slotStart;
  const extra = elapsed >= 10 ? SLOT_STEP : 0;
  return { startMinutes: slotStart, durationMinutes: serviceMinutes + extra };
}

type WorkerCapability = { isGeneral: boolean; homeVisit: boolean; serviceIds: string[] };

async function tenantWorkers(tenantId: string) {
  const staff = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.active, true)));
  if (staff.length === 0) return new Map<string, WorkerCapability>();
  const links = await db
    .select()
    .from(employeeServices)
    .where(inArray(employeeServices.employeeId, staff.map((s) => s.id)));
  const byWorker = new Map<string, string[]>();
  for (const l of links) byWorker.set(l.employeeId, [...(byWorker.get(l.employeeId) ?? []), l.serviceId]);
  const map = new Map<string, WorkerCapability>();
  for (const s of staff) map.set(s.id, { isGeneral: s.isGeneral, homeVisit: s.homeVisit ?? false, serviceIds: byWorker.get(s.id) ?? [] });
  return map;
}

function workerCovers(worker: WorkerCapability, serviceId: string): boolean {
  return worker.isGeneral || worker.serviceIds.length === 0 || worker.serviceIds.includes(serviceId);
}

function workerCoversAll(worker: WorkerCapability, serviceIds: string[]): boolean {
  if (worker.isGeneral || worker.serviceIds.length === 0) return true;
  const has = new Set(worker.serviceIds);
  return serviceIds.every((id) => has.has(id));
}

function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Creates an appointment on behalf of staff (walk-in / phone / manual).
 * Everything else (coverage, home-visit rules, customer matching) mirrors the
 * public booking path, but slot availability is intentionally NOT enforced:
 * staff are authoritative about their own schedule. The created row blocks the
 * worker's slots through the normal availability engine.
 */
export async function createStaffAppointment(ctx: TenantContext, input: StaffAppointmentInput) {
  assertPermission(ctx, Permission["appointments.create"]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey ?? "")) {
    throw new ValidationAppError("Choose a valid date");
  }
  const serviceIds = [...new Set((input.serviceIds ?? []).filter(Boolean))];

  // --- services ---
  let durationMinutes = QUICK_DURATION_MINUTES;
  let price = "0.00";
  let isHomeVisit = false;
  const svcById = new Map<string, typeof services.$inferSelect>();
  if (serviceIds.length > 0) {
    const rows = await db.select().from(services).where(inArray(services.id, serviceIds));
    for (const r of rows) svcById.set(r.id, r);
    durationMinutes = 0;
    price = "0.00";
    for (const serviceId of serviceIds) {
      const svc = svcById.get(serviceId);
      if (!svc || svc.tenantId !== ctx.tenantId) throw new NotFoundError("Service not found");
      if (!svc.active) throw new ConflictError("Service is not active");
      durationMinutes += svc.durationMinutes;
      price = (Number(price) + Number(svc.price)).toFixed(2);
      if (svc.homeVisit) isHomeVisit = true;
    }
  }

  // --- worker ---
  const workers = await tenantWorkers(ctx.tenantId);
  const assertHomeCapable = (worker: WorkerCapability | undefined) => {
    if (isHomeVisit && (!worker || !worker.homeVisit)) {
      throw new NotFoundError("This staff member does not offer home visits");
    }
  };
  const assignments: EmployeeAssignment[] = [];
  let primaryEmployeeId: string | null = null;

  if (input.employeeAssignments && input.employeeAssignments.length > 0) {
    for (const a of input.employeeAssignments) {
      const worker = workers.get(a.employeeId);
      if (!worker) throw new NotFoundError("This staff member does not offer the selected service");
      assertHomeCapable(worker);
      assignments.push(a);
    }
    primaryEmployeeId = assignments[0].employeeId;
  } else if (input.employeeId) {
    const worker = workers.get(input.employeeId);
    if (!worker) throw new NotFoundError("This staff member does not offer the selected service");
    if (serviceIds.length > 0 && !workerCoversAll(worker, serviceIds)) {
      throw new NotFoundError("This staff member does not offer the selected service");
    }
    assertHomeCapable(worker);
    primaryEmployeeId = input.employeeId;
    assignments.push(...serviceIds.map((serviceId) => ({ serviceId, employeeId: input.employeeId as string })));
  } else {
    // Auto-assign a covering worker (home-visit bookings restrict the pool).
    const pool = [...workers.entries()].filter(([, w]) => !isHomeVisit || w.homeVisit);
    const coveringAll = pool.find(([, w]) => workerCoversAll(w, serviceIds))?.[0];
    if (coveringAll) {
      primaryEmployeeId = coveringAll;
      assignments.push(...serviceIds.map((serviceId) => ({ serviceId, employeeId: coveringAll })));
    } else {
      const perService: string[] = [];
      for (const serviceId of serviceIds) {
        const candidate = pool.find(([, w]) => workerCovers(w, serviceId))?.[0];
        if (!candidate) throw new ConflictError("No staff member offers the selected services");
        perService.push(candidate);
      }
      assignments.push(...serviceIds.map((serviceId, i) => ({ serviceId, employeeId: perService[i] })));
      primaryEmployeeId = perService[0] ?? null;
    }
  }

  if (!primaryEmployeeId) throw new ValidationAppError("Choose the worker for this appointment");

  // --- window: now-derived or explicit ---
  const tz = ctx.timezone ?? "Africa/Cairo";
  const nowLocal = tenantNow(tz);
  let dateKey = input.dateKey;
  let startTime = input.startTime ?? "";
  let endTime: string;

  if (input.useCurrentTime || !startTime) {
    const nowMinutes = toMinutes(nowLocal.hm);
    const win = walkInWindow(nowMinutes, durationMinutes);
    startTime = toHHMM(win.startMinutes);
    endTime = toHHMM(win.startMinutes + win.durationMinutes);
    durationMinutes = win.durationMinutes;
    dateKey = nowLocal.ymd;
  } else {
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new ValidationAppError("Choose the appointment time");
    endTime = toHHMM(toMinutes(startTime) + durationMinutes);
  }

  // Home visits need a usable address, mirroring the public booking rules.
  const homeAddress = isHomeVisit ? (input.homeAddress?.trim() ?? "") : "";
  if (isHomeVisit && !homeAddress) {
    throw new ValidationAppError("Your home address is required for a home visit booking");
  }

  const appointmentDate = parseDay(dateKey);
  const startInstant = parseDay(dateKey);
  startInstant.setHours(toMinutes(startTime) / 60 | 0, toMinutes(startTime) % 60, 0, 0);
  const endInstant = new Date(startInstant.getTime() + durationMinutes * 60_000);
  const nowInstant = new Date();
  // Past appointments are history (completed); happening-now or future are open.
  const status: "pending" | "confirmed" | "completed" =
    endInstant < nowInstant ? "completed" : startInstant <= nowInstant ? "confirmed" : "pending";

  // --- customer (optional) ---
  let customerId: string | null = null;
  const customerName = input.customerName?.trim() ?? "";
  const customerPhone = input.customerPhone?.trim() ?? "";
  if (customerName || customerPhone) {
    const phoneKey = customerPhone ? normalizePhone(customerPhone) ?? customerPhone : null;
    if (phoneKey) {
      const [existing] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.phone, phoneKey)))
        .limit(1);
      if (existing) customerId = existing.id;
      else {
        const [created] = await db
          .insert(customers)
          .values({
            tenantId: ctx.tenantId,
            firstName: customerName || "Walk-in",
            phone: phoneKey,
            notes: input.notes?.trim() || null,
          })
          .returning({ id: customers.id });
        customerId = created.id;
      }
    } else {
      const [created] = await db
        .insert(customers)
        .values({ tenantId: ctx.tenantId, firstName: customerName, notes: input.notes?.trim() || null })
        .returning({ id: customers.id });
      customerId = created.id;
    }
  }

  return db.transaction(async (tx) => {
    const [appt] = await tx
      .insert(appointments)
      .values({
        tenantId: ctx.tenantId,
        customerId,
        employeeId: primaryEmployeeId,
        appointmentDate,
        startTime,
        endTime,
        durationMinutes,
        price,
        status,
        source: input.source ?? "walk_in",
        notes: input.notes?.trim() || null,
        homeVisit: isHomeVisit,
        homeAddress: isHomeVisit ? homeAddress : null,
        homeCity: isHomeVisit ? input.homeCity?.trim() || null : null,
        homeLatitude:
          isHomeVisit && typeof input.homeLatitude === "number"
            ? String(input.homeLatitude)
            : null,
        homeLongitude:
          isHomeVisit && typeof input.homeLongitude === "number"
            ? String(input.homeLongitude)
            : null,
        createdByUserId: ctx.userId,
      })
      .returning();

    if (serviceIds.length > 0) {
      const snapshots = serviceIds
        .map((serviceId, i) => {
          const svc = svcById.get(serviceId);
          if (!svc) return null;
          return {
            appointmentId: appt.id,
            serviceId: svc.id,
            serviceNameSnapshot: svc.name,
            durationSnapshot: svc.durationMinutes,
            priceSnapshot: svc.price,
            sortOrder: i,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (snapshots.length > 0) await tx.insert(appointmentServices).values(snapshots);
    }

    if (assignments.length > 0) {
      await tx.insert(appointmentEmployees).values(
        assignments.map((a, i) => ({
          appointmentId: appt.id,
          employeeId: a.employeeId,
          serviceId: a.serviceId,
          sortOrder: i,
        }))
      );
    }

    return { appointment: appt, customerId, startTime, endTime };
  });
}

/**
 * Attaches services to an existing appointment — the "quick appointment,
 * services added later" flow. If the appointment had no services, its
 * placeholder duration is replaced by the sum of the added services.
 * Services are attached to the appointment's own assigned workers.
 */
export async function addServicesToAppointment(
  ctx: TenantContext,
  appointmentId: string,
  serviceIds: string[],
  employeeId?: string,
) {
  assertPermission(ctx, Permission["appointments.update"]);
  if (!serviceIds || serviceIds.length === 0) {
    throw new ValidationAppError("Select at least one service");
  }

  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.status === "cancelled" || appt.status === "no_show") {
    throw new ConflictError("This appointment is closed");
  }

  const rows = await db.select().from(services).where(inArray(services.id, serviceIds));
  const svcById = new Map(rows.map((s) => [s.id, s]));
  for (const serviceId of serviceIds) {
    const svc = svcById.get(serviceId);
    if (!svc || svc.tenantId !== ctx.tenantId) throw new NotFoundError("Service not found");
    if (!svc.active) throw new ConflictError("Service is not active");
  }

  const [existingSnapshots] = await db
    .select({ id: appointmentServices.id })
    .from(appointmentServices)
    .where(eq(appointmentServices.appointmentId, appt.id))
    .limit(1);
  const hadServices = Boolean(existingSnapshots);

  const workerId = employeeId ?? appt.employeeId;
  let addedDuration = 0;
  let addedPrice = 0;
  const snapshots: Array<{
    appointmentId: string;
    serviceId: string;
    serviceNameSnapshot: string;
    durationSnapshot: number;
    priceSnapshot: string;
    sortOrder: number;
  }> = [];
  let cursor = 0;
  for (const serviceId of serviceIds) {
    const svc = svcById.get(serviceId)!;
    snapshots.push({
      appointmentId: appt.id,
      serviceId,
      serviceNameSnapshot: svc.name,
      durationSnapshot: svc.durationMinutes,
      priceSnapshot: svc.price,
      sortOrder: cursor++,
      // sortOrder continues after existing ones — normalized by insertion order below.
    });
    addedDuration += svc.durationMinutes;
    addedPrice += Number(svc.price);
  }

  return db.transaction(async (tx) => {
    if (snapshots.length > 0) {
      // Number after the existing snapshots so ordering stays chronological.
      const existingCount = await tx
        .select({ id: appointmentServices.id })
        .from(appointmentServices)
        .where(eq(appointmentServices.appointmentId, appt.id));
      await tx.insert(appointmentServices).values(
        snapshots.map((s, i) => ({ ...s, sortOrder: existingCount.length + i }))
      );

      if (workerId) {
        await tx.insert(appointmentEmployees).values(
          snapshots.map((s, i) => ({
            appointmentId: appt.id,
            employeeId: workerId,
            serviceId: s.serviceId,
            sortOrder: existingCount.length + i,
          }))
        );
      }
    }

    // Quick appointments carry a placeholder duration; replace it with the
    // real service durations once services exist.
    const [updated] = await tx
      .update(appointments)
      .set({
        durationMinutes: hadServices ? appt.durationMinutes + addedDuration : addedDuration,
        endTime: hadServices
          ? toHHMM(toMinutes(appt.endTime) + addedDuration)
          : toHHMM(toMinutes(appt.startTime) + addedDuration),
        price: (Number(appt.price) + addedPrice).toFixed(2),
        employeeId: workerId ?? appt.employeeId,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, appt.id))
      .returning();
    return { appointment: updated, added: snapshots.length };
  });
}
