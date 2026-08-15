import { and, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { appointmentServices, appointmentEmployees, appointments, customers, employees, employeeServices, reviews, workingHours } from "@/db/schema";
import { NotFoundError, ValidationAppError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";
import { listTenantServicesForAdmin } from "@/modules/booking/domain/catalog";

export type EmployeeOverview = {
  upcoming: {
    id: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    status: string;
    services: {
      name: string;
      startTime: string;
      endTime: string;
    }[];
    customerName: string | null;
  }[];
  monthly: {
    date: string;
    count: number;
  }[];
  servedCustomers: number;
  rating: number;
  totalWorksThisMonth: number;
};

export type EmployeeInput = {
  firstName: string;
  lastName?: string | null;
  displayName?: string | null;
  role?: string | null;
  phone?: string | null;
  salary?: number | string | null;
  isGeneral?: boolean;
  active?: boolean;
  serviceIds?: string[];
  workingHours?: WorkingDay[];
};

type WorkingDay = { weekday: number; startTime: string; endTime: string };

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Shared build for the stored display name shown across the app. */
function buildDisplayName(firstName: string, lastName?: string | null): string {
  return lastName ? `${firstName.trim()} ${lastName.trim()}` : firstName.trim();
}

/** Ensures a worker gets a default weekly schedule so they're immediately bookable. */
function defaultWorkingWeek(): WorkingDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, startTime: "09:00", endTime: "22:00" }));
}

/** Validates that every provided serviceId belongs to the tenant; returns its ids. */
async function validateServiceIds(ctx: TenantContext, serviceIds?: string[]): Promise<string[]> {
  if (!serviceIds || serviceIds.length === 0) return [];
  const catalog = await listTenantServicesForAdmin(ctx.tenantId);
  const owned = new Set(catalog.map((s) => s.id));
  return [...new Set(serviceIds)].filter((id) => owned.has(id));
}

/** Create a new worker for the tenant, links them to services and gives a default schedule. */
export async function createEmployee(ctx: TenantContext, input: EmployeeInput) {
  assertPermission(ctx, Permission["employees.manage"]);

  const displayName = buildDisplayName(input.firstName, input.lastName);
  const [created] = await db
    .insert(employees)
    .values({
      tenantId: ctx.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      displayName,
      role: input.role?.trim() || null,
      phone: input.phone?.trim() || null,
      salary: input.salary != null && input.salary !== "" ? String(input.salary) : null,
      isGeneral: input.isGeneral ?? false,
      active: input.active ?? true,
    })
    .returning();

  const serviceIds = await validateServiceIds(ctx, input.serviceIds);
  if (serviceIds.length > 0) {
    await db.insert(employeeServices).values(serviceIds.map((serviceId) => ({ employeeId: created.id, serviceId })));
  }

  const week = input.workingHours?.length ? input.workingHours : defaultWorkingWeek();
  await db.insert(workingHours).values(week.map((d) => ({ ...d, employeeId: created.id })));

  return created;
}

/** Update a worker's profile, service links and weekly schedule. */
export async function updateEmployee(ctx: TenantContext, id: string, input: EmployeeInput) {
  assertPermission(ctx, Permission["employees.manage"]);

  const [existing] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Employee not found");

  const [updated] = await db
    .update(employees)
    .set({
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      displayName: buildDisplayName(input.firstName, input.lastName),
      role: input.role?.trim() || null,
      phone: input.phone?.trim() || null,
      salary: input.salary != null && input.salary !== "" ? String(input.salary) : null,
      isGeneral: input.isGeneral ?? existing.isGeneral,
      active: input.active ?? existing.active,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id))
    .returning();

  if (input.serviceIds) {
    const serviceIds = await validateServiceIds(ctx, input.serviceIds);
    await db.delete(employeeServices).where(eq(employeeServices.employeeId, id));
    if (serviceIds.length > 0) {
      await db.insert(employeeServices).values(serviceIds.map((serviceId) => ({ employeeId: id, serviceId })));
    }
  }

  if (input.workingHours) {
    await db.delete(workingHours).where(eq(workingHours.employeeId, id));
    const week = input.workingHours.length
      ? input.workingHours.reduce<WorkingDay[]>((acc, d) => (WEEKDAYS.includes(d.weekday) ? [...acc, d] : acc), [])
      : defaultWorkingWeek();
    await db.insert(workingHours).values(week.map((d) => ({ ...d, employeeId: id })));
  }

  return updated;
}

/** Soft-delete a worker (marks them inactive). Appointments keep their FK. */
export async function deleteEmployee(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["employees.manage"]);

  const [existing] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Employee not found");

  const [updated] = await db
    .update(employees)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  return updated;
}

export function validateEmployeeInput(input: unknown): EmployeeInput {
  const v = input as Partial<EmployeeInput> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid employee payload");

  const firstName = typeof v.firstName === "string" ? v.firstName.trim() : "";
  if (!firstName) throw new ValidationAppError("First name is required");
  if (firstName.length > 200) throw new ValidationAppError("First name is too long");

  const phone = typeof v.phone === "string" ? v.phone.trim() : "";
  if (phone && phone.length > 30) throw new ValidationAppError("Phone is too long");

  const role = typeof v.role === "string" ? v.role.trim() : "";
  if (role.length > 120) throw new ValidationAppError("Role is too long");

  let salary: number | null = null;
  if (v.salary != null && v.salary !== "") {
    salary = Number(v.salary);
    if (!Number.isFinite(salary) || salary < 0) throw new ValidationAppError("Salary must be a positive number");
  }

  const lastName = typeof v.lastName === "string" ? v.lastName.trim() : "";
  const serviceIds = Array.isArray(v.serviceIds)
    ? v.serviceIds.filter((s): s is string => typeof s === "string" && Boolean(s))
    : [];

  let workingHours: WorkingDay[] | undefined;
  if (Array.isArray(v.workingHours)) {
    const WEEKDAYS_SET = new Set(WEEKDAYS);
    workingHours = v.workingHours
      .filter((d): d is WorkingDay => typeof d === "object" && d !== null && typeof d.weekday === "number" && WEEKDAYS_SET.has(d.weekday) && typeof d.startTime === "string" && typeof d.endTime === "string")
      .map((d) => ({
        weekday: d.weekday,
        startTime: /^\d{2}:\d{2}$/.test(d.startTime) ? d.startTime : "09:00",
        endTime: /^\d{2}:\d{2}$/.test(d.endTime) ? d.endTime : "22:00",
      }));
  }

  return {
    firstName,
    lastName: lastName || null,
    role: role || null,
    phone: phone || null,
    salary,
    isGeneral: typeof v.isGeneral === "boolean" ? v.isGeneral : false,
    active: typeof v.active === "boolean" ? v.active : true,
    serviceIds,
    workingHours,
  };
}

/** Aggregate stats shown in the team detail popup (upcoming + current-month workload). */
export async function getEmployeeOverview(ctx: TenantContext, id: string): Promise<EmployeeOverview> {
  assertPermission(ctx, Permission["employees.read"]);

  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId)))
    .limit(1);
  if (!emp) throw new NotFoundError("Employee not found");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Appointments where this worker is the PRIMARY staff member.
  const primaryUpcoming = await db
    .select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(appointments)
    .leftJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.employeeId, id),
        gte(appointments.appointmentDate, now),
        inArray(appointments.status, ["pending", "confirmed"])
      )
    )
    .orderBy(appointments.appointmentDate)
    .limit(20);

  // All appointments this worker serves per-service (multi-worker packages),
  // even when they are NOT the primary staff member.
  const assignedRows = await db
    .select({ appointmentId: appointmentEmployees.appointmentId })
    .from(appointmentEmployees)
    .where(eq(appointmentEmployees.employeeId, id));
  const assignedIds = [...new Set(assignedRows.map((a) => a.appointmentId))];

  const extraUpcoming =
    assignedIds.length > 0
      ? await db
          .select({
            id: appointments.id,
            appointmentDate: appointments.appointmentDate,
            startTime: appointments.startTime,
            endTime: appointments.endTime,
            status: appointments.status,
            customerFirstName: customers.firstName,
            customerLastName: customers.lastName,
          })
          .from(appointments)
          .leftJoin(customers, eq(customers.id, appointments.customerId))
          .where(
            and(
              eq(appointments.tenantId, ctx.tenantId),
              inArray(appointments.id, assignedIds),
              ne(appointments.employeeId, id),
              gte(appointments.appointmentDate, now),
              inArray(appointments.status, ["pending", "confirmed"])
            )
          )
          .orderBy(appointments.appointmentDate)
          .limit(20)
      : [];

  const upcoming = mergeById(primaryUpcoming, extraUpcoming).slice(0, 20);
  const upcomingIds = upcoming.map((a) => a.id);

  // Current-month workload: primary OR any per-service assignment.
  const monthRows =
    assignedIds.length > 0
      ? await db
          .select({
            appointmentDate: appointments.appointmentDate,
            customerId: appointments.customerId,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.tenantId, ctx.tenantId),
              or(eq(appointments.employeeId, id), inArray(appointments.id, assignedIds)),
              gte(appointments.appointmentDate, startOfMonth),
              lte(appointments.appointmentDate, endOfMonth)
            )
          )
      : [];

  const avgReview = await db
    .select({ value: reviews.rating, })
    .from(reviews)
    .where(and(eq(reviews.tenantId, ctx.tenantId), eq(reviews.employeeId, id)));

  // Service snapshots for every upcoming appointment (full ordered list, so we
  // can compute each service's window inside the appointment).
  const serviceRows =
    upcomingIds.length > 0
      ? await db
          .select({
            appointmentId: appointmentServices.appointmentId,
            serviceId: appointmentServices.serviceId,
            serviceName: appointmentServices.serviceNameSnapshot,
            durationMinutes: appointmentServices.durationSnapshot,
            sortOrder: appointmentServices.sortOrder,
          })
          .from(appointmentServices)
          .where(inArray(appointmentServices.appointmentId, upcomingIds))
          .orderBy(appointmentServices.sortOrder)
      : [];

  const servicesByAppt = new Map<string, typeof serviceRows>();
  for (const s of serviceRows) {
    const list = servicesByAppt.get(s.appointmentId) ?? [];
    list.push(s);
    servicesByAppt.set(s.appointmentId, list);
  }

  // Which serviceIds this worker performs in each upcoming appointment.
  const myLinks =
    upcomingIds.length > 0
      ? await db
          .select({
            appointmentId: appointmentEmployees.appointmentId,
            serviceId: appointmentEmployees.serviceId,
          })
          .from(appointmentEmployees)
          .where(
            and(
              inArray(appointmentEmployees.appointmentId, upcomingIds),
              eq(appointmentEmployees.employeeId, id)
            )
          )
      : [];
  const myServiceByAppt = new Map<string, Set<string>>();
  for (const l of myLinks) {
    if (!l.serviceId) continue;
    const set = myServiceByAppt.get(l.appointmentId) ?? new Set<string>();
    set.add(l.serviceId);
    myServiceByAppt.set(l.appointmentId, set);
  }

  const monthly = new Map<string, number>();
  const servedCustomers = new Set<string>();
  for (const a of monthRows) {
    const key = `${a.appointmentDate.getFullYear()}-${String(a.appointmentDate.getMonth() + 1).padStart(2, "0")}-${String(a.appointmentDate.getDate()).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + 1);
    if (a.customerId) servedCustomers.add(a.customerId);
  }

  const rating =
    avgReview.length > 0
      ? avgReview.reduce((sum, r) => sum + r.value, 0) / avgReview.length
      : Number(emp.rating ?? 0);

  return {
    upcoming: upcoming.map((a) => {
      const apptServices = servicesByAppt.get(a.id) ?? [];
      // Services run back-to-back in sortOrder; compute each window.
      const windows = computeServiceWindows(a.startTime, apptServices);
      const mine = myServiceByAppt.get(a.id);
      // Worker is primary AND has per-service rows -> show only their own
      // services. Legacy single-worker rows have no per-service links, so the
      // primary worker sees the whole appointment.
      const shown = apptServices
        .map((s, i) => ({
          name: s.serviceName,
          startTime: windows[i]?.startTime ?? a.startTime,
          endTime: windows[i]?.endTime ?? a.endTime,
        }))
        .filter((_, i) => !mine || mine.has(apptServices[i]?.serviceId ?? ""));
      return {
        id: a.id,
        appointmentDate: `${a.appointmentDate.getFullYear()}-${String(a.appointmentDate.getMonth() + 1).padStart(2, "0")}-${String(a.appointmentDate.getDate()).padStart(2, "0")}`,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        services: shown,
        customerName: [a.customerFirstName, a.customerLastName].filter(Boolean).join(" ") || null,
      };
    }),
    monthly: Array.from(monthly.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    servedCustomers: servedCustomers.size,
    rating,
    totalWorksThisMonth: monthRows.length,
  };
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((x) => x.id));
  return [...a, ...b.filter((x) => !seen.has(x.id))];
}

function computeServiceWindows(
  startTime: string,
  services: Array<{ durationMinutes: number }>
): Array<{ startTime: string; endTime: string }> {
  let cursor = toMinute(startTime);
  return services.map((s) => {
    const end = cursor + s.durationMinutes;
    const out = { startTime: toHHMM(cursor), endTime: toHHMM(end) };
    cursor = end;
    return out;
  });
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