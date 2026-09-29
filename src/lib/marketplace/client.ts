import { and, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  appointmentEmployees,
  appointmentServices,
  appointments,
  clientPointsLedger,
  clientProfiles,
  customers,
  employees,
  referrals,
  services,
  tenants,
  type AppointmentStatus,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/errors";

export type ClientProfile = typeof clientProfiles.$inferSelect;

/** Canonical phone form so "+20 100..." and "+20100..." are the same number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.trim().replace(/[^0-9+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p || p === "+") return null;
  return p;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase() ?? "";
  return e || null;
}

export async function getClientProfile(userId: string): Promise<ClientProfile | null> {
  const [row] = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, userId)).limit(1);
  return row ?? null;
}

export type ClientGender = "male" | "female" | null;

/** Create the profile on first use, or patch provided fields. */
export async function upsertClientProfile(
  userId: string,
  fields: Partial<Pick<ClientProfile, "fullName" | "phone" | "email" | "birthdate" | "avatarUrl" | "gender" | "age">>,
): Promise<ClientProfile> {
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.fullName !== undefined) clean.fullName = fields.fullName?.trim() || null;
  if (fields.phone !== undefined) clean.phone = normalizePhone(fields.phone);
  if (fields.email !== undefined) clean.email = normalizeEmail(fields.email);
  if (fields.birthdate !== undefined) clean.birthdate = fields.birthdate;
  if (fields.avatarUrl !== undefined) clean.avatarUrl = fields.avatarUrl || null;
  if (fields.gender !== undefined) clean.gender = fields.gender || null;
  if (fields.age !== undefined) clean.age = fields.age ?? null;

  try {
    const [row] = await db
      .insert(clientProfiles)
      .values({ userId, ...(clean as { fullName?: string | null }) })
      .onConflictDoUpdate({ target: clientProfiles.userId, set: clean })
      .returning();
    return row;
  } catch (e: unknown) {
    // 23505 on the phone/email unique indexes: number or email belongs to
    // another account. Never expose raw DB details.
    const msg = e instanceof Error ? e.message : "";
    const detail =
      typeof (e as { detail?: unknown })?.detail === "string"
        ? ((e as { detail?: string }).detail as string)
        : "";
    const hay = `${msg} ${detail}`.toLowerCase();
    if ((e as { code?: string })?.code === "23505" || hay.includes("already exists")) {
      if (hay.includes("phone")) throw new ConflictError("This phone number is already used by another account");
      if (hay.includes("email")) throw new ConflictError("This email is already used by another account");
      throw new ConflictError("Phone or email is already used by another account");
    }
    throw e;
  }
}

export type ClientBooking = {
  id: string;
  tenantId: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  status: string;
  price: number;
  services: string[];
  employeeName: string | null;
  canCancel: boolean;
};

const UPCOMING_STATUSES: AppointmentStatus[] = ["pending", "confirmed"];

/**
 * A client's bookings across ALL stores. Matches by account link first,
 * then falls back to the profile phone (catches guest bookings made with
 * the same number before the account existed).
 */
export async function getClientBookings(
  userId: string,
  scope: "upcoming" | "history",
): Promise<ClientBooking[]> {
  const profile = await getClientProfile(userId);

  let phoneCustomerIds: string[] = [];
  if (profile?.phone) {
    const phoneCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, profile.phone));
    phoneCustomerIds = phoneCustomers.map((c) => c.id);
  }

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dateCond =
    scope === "upcoming"
      ? and(gte(appointments.appointmentDate, dayStart), inArray(appointments.status, UPCOMING_STATUSES))
      : lt(appointments.appointmentDate, dayStart);

  const matchCond =
    phoneCustomerIds.length > 0
      ? or(
          eq(appointments.clientUserId, userId),
          inArray(appointments.customerId, phoneCustomerIds),
        )
      : eq(appointments.clientUserId, userId);

  const rows = await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      businessName: tenants.businessName,
      slug: tenants.slug,
      logoUrl: tenants.logoUrl,
      appointmentDate: appointments.appointmentDate,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      price: appointments.price,
      employeeName: employees.displayName,
      employeeFirst: employees.firstName,
      employeeLast: employees.lastName,
    })
    .from(appointments)
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .leftJoin(employees, eq(employees.id, appointments.employeeId))
    .where(and(matchCond, dateCond))
    .orderBy(scope === "upcoming" ? appointments.appointmentDate : desc(appointments.appointmentDate))
    .limit(100);

  const serviceRows =
    rows.length > 0
      ? await db
          .select({
            appointmentId: appointmentServices.appointmentId,
            name: appointmentServices.serviceNameSnapshot,
          })
          .from(appointmentServices)
          .where(inArray(appointmentServices.appointmentId, rows.map((r) => r.id)))
      : [];
  const servicesByAppt = new Map<string, string[]>();
  for (const s of serviceRows) {
    servicesByAppt.set(s.appointmentId, [...(servicesByAppt.get(s.appointmentId) ?? []), s.name]);
  }

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    businessName: r.businessName,
    slug: r.slug,
    logoUrl: r.logoUrl,
    appointmentDate: new Date(r.appointmentDate),
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    price: Number(r.price ?? 0),
    services: servicesByAppt.get(r.id) ?? [],
    employeeName:
      r.employeeName ?? (r.employeeFirst ? `${r.employeeFirst} ${r.employeeLast ?? ""}`.trim() : null),
    canCancel:
      UPCOMING_STATUSES.includes(r.status) && new Date(r.appointmentDate) >= dayStart,
  }));
}

/** Accent color + filter priority follow the client's gender. */
export function clientAccentForGender(gender: string | null | undefined): string {
  return gender === "female" ? "#964735" : "#1e293b";
}

export function isProfileComplete(p: ClientProfile | null): boolean {
  return Boolean(p?.fullName && p?.phone && (p?.gender === "male" || p?.gender === "female"));
}

/** Lifetime points balance = SUM(ledger). Spend accrues on completion. */
export async function getClientPointsTotal(userId: string): Promise<number> {
  const rows = await db
    .select({ amount: clientPointsLedger.amount })
    .from(clientPointsLedger)
    .where(eq(clientPointsLedger.userId, userId));
  return rows.reduce((a, r) => a + (r.amount ?? 0), 0);
}

/** "HH:MM" + minutes → "HH:MM" (wraps past midnight). */
export function addMinutesHm(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h ?? 0) * 60 + (m ?? 0) + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Current calendar day + clock time inside a tenant timezone. */
export function tenantNow(tz: string | null | undefined, now = new Date()): { ymd: string; hm: string } {
  const zone = tz || "Africa/Cairo";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "00" : (parts.hour ?? "00");
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hm: `${hour}:${parts.minute ?? "00"}` };
}

/** Calendar day of an appointment in the tenant timezone. */
export function apptDayYmd(date: Date, tz: string | null | undefined): string {
  return tenantNow(tz, new Date(date)).ymd;
}

/**
 * Single atomic completion path for scan check-out AND store manual
 * completion. Flips pending/confirmed → completed exactly once and grants
 * spend points (1/EGP) a single time via the ledger's unique ref.
 * Completed stays completed — nothing reopens it here (platform admin
 * has a separate rescue action).
 */
export async function completeAppointment(appointmentId: string) {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) throw new NotFoundError("Booking not found");
  if (appt.status === "completed") return { already: true as const, appointment: appt };
  if (appt.status !== "pending" && appt.status !== "confirmed") {
    throw new ConflictError("This booking is closed");
  }

  const [updated] = await db
    .update(appointments)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(appointments.id, appointmentId), inArray(appointments.status, ["pending", "confirmed"])))
    .returning();
  if (!updated) return { already: true as const, appointment: appt };

  // Spend points: account-linked bookings only, rounded pounds, once.
  if (updated.clientUserId) {
    const amount = Math.max(0, Math.round(Number(updated.price ?? 0)));
    if (amount > 0) {
      await db
        .insert(clientPointsLedger)
        .values({
          userId: updated.clientUserId,
          amount,
          reason: "booking",
          refAppointmentId: updated.id,
        })
        .onConflictDoNothing();
    }
  }
  return { already: false as const, appointment: updated };
}

/**
 * Cancel a booking as the client who made it. Only pending/confirmed
 * future bookings, and only when the account link (or profile phone)
 * proves ownership.
 */
export async function cancelClientBooking(userId: string, appointmentId: string) {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) throw new Error("Booking not found");

  let owned = appt.clientUserId === userId;
  if (!owned) {
    const profile = await getClientProfile(userId);
    if (profile?.phone && appt.customerId) {
      const [cust] = await db.select().from(customers).where(eq(customers.id, appt.customerId)).limit(1);
      owned = cust?.phone === profile.phone;
    }
  }
  if (!owned) throw new Error("Not authorized");

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (!UPCOMING_STATUSES.includes(appt.status) || new Date(appt.appointmentDate) < dayStart) {
    throw new Error("This booking can no longer be cancelled");
  }

  await db
    .update(appointments)
    .set({
      status: "cancelled",
      cancelledBy: "client",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appointmentId));
}

/**
 * Permanent referral code (`firstlast_123`): generated once from the
 * profile name, unique across accounts, never regenerated afterwards —
 * even if the name changes later.
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  let profile = await getClientProfile(userId);
  if (!profile) {
    profile = await upsertClientProfile(userId, {});
  }
  if (profile.referralCode) return profile.referralCode;
  const base =
    (profile.fullName ?? "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) || "user";
  for (let i = 0; i < 25; i++) {
    const code = `${base}_${Math.floor(100 + Math.random() * 900)}`;
    const [row] = await db
      .update(clientProfiles)
      .set({ referralCode: code, updatedAt: new Date() })
      .where(and(eq(clientProfiles.userId, userId), isNull(clientProfiles.referralCode)))
      .returning({ referralCode: clientProfiles.referralCode });
    if (row) return row.referralCode;
  }
  return null;
}

export type RebookSelection = {
  serviceIds: string[];
  assignments: Array<{ serviceId: string; employeeId: string }>;
} | null;

/**
 * "Book again" data for one past booking: the same services + same workers,
 * filtered to what is still active/valid. Ownership-checked like scans.
 */
export async function getRebookSelection(
  userId: string,
  appointmentId: string,
): Promise<RebookSelection> {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) return null;

  let owned = appt.clientUserId === userId;
  if (!owned && appt.customerId) {
    const [c] = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, appt.customerId))
      .limit(1);
    const profile = await getClientProfile(userId);
    owned = Boolean(profile?.phone && c?.phone && profile.phone === c.phone);
  }
  if (!owned) return null;

  const svcRows = await db
    .select({ serviceId: appointmentServices.serviceId })
    .from(appointmentServices)
    .where(eq(appointmentServices.appointmentId, appointmentId))
    .orderBy(appointmentServices.sortOrder);
  const empRows = await db
    .select({ serviceId: appointmentEmployees.serviceId, employeeId: appointmentEmployees.employeeId })
    .from(appointmentEmployees)
    .where(eq(appointmentEmployees.appointmentId, appointmentId));

  // Keep only services/workers that still exist and are active.
  const serviceIds = svcRows.map((r) => r.serviceId).filter((id): id is string => Boolean(id));
  const validServices =
    serviceIds.length > 0
      ? (
          await db
            .select({ id: services.id })
            .from(services)
            .where(and(eq(services.tenantId, appt.tenantId), eq(services.active, true)))
        ).map((r) => r.id)
      : [];
  const keep = new Set(validServices);
  const keptServiceIds = serviceIds.filter((id) => keep.has(id));
  if (keptServiceIds.length === 0) return null;

  const validEmployees =
    empRows.length > 0
      ? new Set(
          (
            await db
              .select({ id: employees.id })
              .from(employees)
              .where(and(eq(employees.tenantId, appt.tenantId), eq(employees.active, true)))
          ).map((r) => r.id),
        )
      : new Set<string>();
  const assignments = empRows
    .filter((a) => a.serviceId && keep.has(a.serviceId) && validEmployees.has(a.employeeId))
    .map((a) => ({ serviceId: a.serviceId as string, employeeId: a.employeeId }));

  return { serviceIds: keptServiceIds, assignments };
}
