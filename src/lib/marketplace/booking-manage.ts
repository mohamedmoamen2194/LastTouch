import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  appointmentEmployees,
  appointmentServices,
  appointments,
  customers,
  employees,
  tenants,
  visits,
  type ClientArrivalStatus,
} from "@/db/schema";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import {
  apptDayYmd,
  getClientProfile,
  normalizePhone,
  zonedDateTime,
} from "@/lib/marketplace/client";
import { sweepStaleAppointments } from "@/modules/appointments/application/no-show-sweep";
import { validateBookingAvailability, assertNoClientOverlap } from "@/modules/booking/application/book";
import { mintGuestBookingToken } from "@/lib/marketplace/guest-access";

const UPCOMING = ["pending", "confirmed"] as const;

export type PublicManageBooking = {
  id: string;
  tenantId: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  trackingNumber: string;
  appointmentDate: string; // ymd
  startTime: string;
  endTime: string;
  status: string;
  clientArrivalStatus: ClientArrivalStatus | null;
  timezone: string;
  price: number;
  services: string[];
  serviceIds: string[];
  employeeName: string | null;
  homeVisit: boolean;
  homeAddress: string | null;
  homeCity: string | null;
  hasOpenVisit: boolean;
  canModify: boolean;
  canCancel: boolean;
  guestToken?: string;
};

export function canModifyNow(appt: { status: string; appointmentDate: Date; startTime: string; timezone: string | null }) {
  const startAt = zonedDateTime(
    apptDayYmd(new Date(appt.appointmentDate), appt.timezone),
    appt.startTime,
    appt.timezone,
  );
  return (UPCOMING as readonly string[]).includes(appt.status) && startAt.getTime() - Date.now() > 30 * 60_000;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapRows(rows: any[], scope: "store" | "global"): Promise<PublicManageBooking[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [openVisitRows, svcRows] = await Promise.all([
    db.select({ appointmentId: visits.appointmentId }).from(visits).where(and(inArray(visits.appointmentId, ids), eq(visits.status, "checked_in"))),
    db.select({ appointmentId: appointmentServices.appointmentId, name: appointmentServices.serviceNameSnapshot, serviceId: appointmentServices.serviceId }).from(appointmentServices).where(inArray(appointmentServices.appointmentId, ids)).orderBy(appointmentServices.sortOrder),
  ]);
  const openVisitIds = new Set(openVisitRows.map((v) => v.appointmentId));
  const svcsBy = new Map<string, string[]>();
  const svcIdsBy = new Map<string, string[]>();
  for (const s of svcRows) {
    svcsBy.set(s.appointmentId, [...(svcsBy.get(s.appointmentId) ?? []), s.name]);
    if (s.serviceId) svcIdsBy.set(s.appointmentId, [...(svcIdsBy.get(s.appointmentId) ?? []), s.serviceId]);
  }
  // sweep per tenant lazily
  const tzByTenant = new Map<string, string>();
  for (const r of rows) tzByTenant.set(r.tenantId, r.timezone ?? "Africa/Cairo");
  for (const [tid, tz] of tzByTenant) await sweepStaleAppointments(tid, tz);

  return rows.map((r) => {
    const mod = canModifyNow(r);
    const token = mintGuestBookingToken({ aid: r.id, tid: r.tenantId, s: scope }) ?? undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      businessName: r.businessName,
      slug: r.slug,
      logoUrl: r.logoUrl ?? null,
      trackingNumber: r.trackingNumber,
      appointmentDate: apptDayYmd(new Date(r.appointmentDate), r.timezone),
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      clientArrivalStatus: (r.clientArrivalStatus as ClientArrivalStatus | null) ?? null,
      timezone: r.timezone ?? "Africa/Cairo",
      price: Number(r.price ?? 0),
      services: svcsBy.get(r.id) ?? [],
      serviceIds: svcIdsBy.get(r.id) ?? [],
      employeeName: r.employeeName ?? (r.employeeFirst ? `${r.employeeFirst} ${r.employeeLast ?? ""}`.trim() : null),
      homeVisit: r.homeVisit ?? false,
      homeAddress: r.homeAddress ?? null,
      homeCity: r.homeCity ?? null,
      hasOpenVisit: openVisitIds.has(r.id),
      canModify: mod,
      canCancel: mod,
      guestToken: token,
    };
  });
}

const baseSelect = {
  id: appointments.id,
  tenantId: appointments.tenantId,
  businessName: tenants.businessName,
  slug: tenants.slug,
  logoUrl: tenants.logoUrl,
  timezone: tenants.timezone,
  trackingNumber: appointments.trackingNumber,
  appointmentDate: appointments.appointmentDate,
  startTime: appointments.startTime,
  endTime: appointments.endTime,
  status: appointments.status,
  clientArrivalStatus: appointments.clientArrivalStatus,
  price: appointments.price,
  employeeName: employees.displayName,
  employeeFirst: employees.firstName,
  employeeLast: employees.lastName,
  homeVisit: appointments.homeVisit,
  homeAddress: appointments.homeAddress,
  homeCity: appointments.homeCity,
  customerId: appointments.customerId,
  clientUserId: appointments.clientUserId,
  employeeId: appointments.employeeId,
  packageId: appointments.packageId,
  durationMinutes: appointments.durationMinutes,
};

export async function lookupBookings(args: {
  tenantId?: string; // store scope
  scope: "upcoming" | "history";
  trackingNumber?: string;
  phone?: string;
  name?: string;
  userId?: string | null;
}) {
  const scopeKind: "store" | "global" = args.tenantId ? "store" : "global";
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
  const dateCond = args.scope === "upcoming"
    ? and(gte(appointments.appointmentDate, dayStart), inArray(appointments.status, ["pending", "confirmed"]))
    : or(inArray(appointments.status, ["completed", "cancelled", "no_show"]), lt(appointments.appointmentDate, dayStart));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let match: any = null;
  if (args.userId) {
    const profile = await getClientProfile(args.userId);
    let phoneCustomerIds: string[] = [];
    if (profile?.phone) {
      const pcs = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, profile.phone));
      phoneCustomerIds = pcs.map((c) => c.id);
    }
    match = phoneCustomerIds.length ? or(eq(appointments.clientUserId, args.userId), inArray(appointments.customerId, phoneCustomerIds)) : eq(appointments.clientUserId, args.userId);
  } else if (args.trackingNumber) {
    match = eq(appointments.trackingNumber, args.trackingNumber.trim().toUpperCase());
  } else if (args.phone && args.name) {
    const phone = normalizePhone(args.phone) ?? args.phone.trim();
    const name = args.name.trim().toLowerCase();
    // match by customer phone+name (tenant-scoped if provided, else across stores)
    const custWhere = args.tenantId
      ? and(eq(customers.tenantId, args.tenantId), eq(customers.phone, phone))
      : eq(customers.phone, phone);
    const custs = await db.select({ id: customers.id, tenantId: customers.tenantId, firstName: customers.firstName, lastName: customers.lastName }).from(customers).where(custWhere);
    const matching = custs.filter((c) => `${c.firstName} ${c.lastName ?? ""}`.trim().toLowerCase() === name || c.firstName.trim().toLowerCase() === name);
    if (matching.length === 0) return [];
    match = inArray(appointments.customerId, matching.map((c) => c.id));
  } else {
    throw new ValidationAppError("Provide tracking number or phone and name");
  }

  const rows = await db
    .select(baseSelect)
    .from(appointments)
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .leftJoin(employees, eq(employees.id, appointments.employeeId))
    .where(and(match, dateCond, ...(args.tenantId ? [eq(appointments.tenantId, args.tenantId)] : [])))
    .orderBy(args.scope === "upcoming" ? appointments.appointmentDate : desc(appointments.appointmentDate))
    .limit(100);
  return mapRows(rows, scopeKind);
}

export async function getAppointmentForManage(appointmentId: string) {
  const [row] = await db
    .select(baseSelect)
    .from(appointments)
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .leftJoin(employees, eq(employees.id, appointments.employeeId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) throw new NotFoundError("Booking not found");
  return row;
}

export async function assertManageAccess(args: { appointmentId: string; userId?: string | null; tokenPayload?: { aid: string; tid?: string; s: string } | null; tenantId?: string }) {
  const row = await getAppointmentForManage(args.appointmentId);
  if (args.tenantId && row.tenantId !== args.tenantId) throw new ValidationAppError("Not authorized");
  if (args.userId) {
    const profile = await getClientProfile(args.userId);
    let owned = row.clientUserId === args.userId;
    if (!owned && row.customerId) {
      const [c] = await db.select({ phone: customers.phone, firstName: customers.firstName, lastName: customers.lastName }).from(customers).where(eq(customers.id, row.customerId)).limit(1);
      owned = Boolean(profile?.phone && c?.phone && profile.phone === c.phone);
    }
    if (!owned) throw new ValidationAppError("Not authorized");
  } else if (args.tokenPayload) {
    if (args.tokenPayload.aid !== args.appointmentId) throw new ValidationAppError("Not authorized");
    if (args.tokenPayload.s === "store" && args.tokenPayload.tid && args.tokenPayload.tid !== row.tenantId) throw new ValidationAppError("Not authorized");
  } else {
    throw new ValidationAppError("Not authorized");
  }
  return row;
}

export async function rescheduleBooking(args: {
  appointmentId: string;
  appointmentDate: string; // yyyy-mm-dd
  startTime: string; // HH:MM
  actor: string;
}) {
  const row = await getAppointmentForManage(args.appointmentId);
  if (!(UPCOMING as readonly string[]).includes(row.status)) throw new ConflictError("Only upcoming bookings can be rescheduled");
  if (!canModifyNow(row)) throw new ConflictError("This booking can no longer be changed");

  const svcRows = await db.select({ serviceId: appointmentServices.serviceId, duration: appointmentServices.durationSnapshot, price: appointmentServices.priceSnapshot }).from(appointmentServices).where(eq(appointmentServices.appointmentId, row.id)).orderBy(appointmentServices.sortOrder);
  const empRows = await db.select({ serviceId: appointmentEmployees.serviceId, employeeId: appointmentEmployees.employeeId }).from(appointmentEmployees).where(eq(appointmentEmployees.appointmentId, row.id)).orderBy(appointmentEmployees.sortOrder);
  const serviceIds = svcRows.map((s) => s.serviceId).filter((x): x is string => Boolean(x));
  if (serviceIds.length === 0) throw new ConflictError("This booking cannot be rescheduled");

  // determine assignments pattern
  const uniqueEmp = [...new Set(empRows.map((e) => e.employeeId))];
  const hasPerService = empRows.some((e) => e.serviceId);
  const employeeAssignments = hasPerService
    ? empRows.filter((e) => e.serviceId).map((e) => ({ serviceId: e.serviceId as string, employeeId: e.employeeId }))
    : undefined;
  const employeeId = !hasPerService ? (uniqueEmp.length === 1 ? uniqueEmp[0] : row.employeeId ?? undefined) : undefined;

  const appointmentDate = new Date(`${args.appointmentDate}T00:00:00`);
  const availability = await validateBookingAvailability({
    tenantId: row.tenantId,
    serviceIds,
    employeeId,
    employeeAssignments,
    appointmentDate,
    startTime: args.startTime,
    homeVisit: row.homeVisit ?? false,
    excludeAppointmentId: row.id,
  });

  if (row.clientUserId) {
    await assertNoClientOverlap(row.clientUserId, appointmentDate, args.startTime, availability.endTime, row.id);
  }

  await db.update(appointments).set({
    appointmentDate,
    startTime: args.startTime,
    endTime: availability.endTime,
    durationMinutes: availability.durationMinutes,
    rescheduledFrom: row.appointmentDate,
    rescheduledBy: args.actor,
    rescheduledAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(appointments.id, row.id));

  // keep same employee assignments/service snapshots/price/package; workers may be same by design
  if (availability.employeeId && availability.employeeId !== row.employeeId) {
    await db.update(appointments).set({ employeeId: availability.employeeId }).where(eq(appointments.id, row.id));
  }
  return { id: row.id, startTime: args.startTime, endTime: availability.endTime, appointmentDate: args.appointmentDate };
}
