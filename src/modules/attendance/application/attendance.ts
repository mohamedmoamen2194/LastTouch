import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceDisputes,
  attendanceLogs,
  attendanceRequests,
  attendanceSettings,
  employees,
  locations,
  timeOff,
  workingHours,
  type AttendanceRequestStatus,
  type AttendanceRequestType,
} from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { Permission } from "@/lib/permissions";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import {
  dateKeyOf,
  shiftDateKey,
  weekdayOfKey,
  zonedDateTime,
} from "../domain/time";

export const ATTENDANCE_GEOFENCE_METERS = 100;

type GeoPoint = { latitude: number; longitude: number };

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const earthRadius = 6_371_000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(h)));
}

function parseCoordinate(value: unknown, axis: "latitude" | "longitude"): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ValidationAppError("Location is required");
  const limit = axis === "latitude" ? 90 : 180;
  if (number < -limit || number > limit) throw new ValidationAppError("Invalid location");
  return number;
}

export type LateTier = { minMinutes: number; amount: number };

export type AttendancePolicy = {
  earlyCheckInMinutes: number;
  lateGraceMinutes: number;
  noShowPenalty: number;
  lateTiers: LateTier[];
};

const DEFAULT_POLICY: AttendancePolicy = {
  earlyCheckInMinutes: 30,
  lateGraceMinutes: 0,
  noShowPenalty: 0,
  lateTiers: [],
};

export async function getAttendancePolicy(tenantId: string): Promise<AttendancePolicy> {
  const [row] = await db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.tenantId, tenantId))
    .limit(1);
  if (!row) return { ...DEFAULT_POLICY, lateTiers: [] };
  const tiers = Array.isArray(row.lateTiers) ? row.lateTiers : [];
  return {
    earlyCheckInMinutes: row.earlyCheckInMinutes ?? 30,
    lateGraceMinutes: row.lateGraceMinutes ?? 0,
    noShowPenalty: Number(row.noShowPenalty ?? 0),
    lateTiers: tiers
      .map((tier) => ({ minMinutes: Number(tier.minMinutes), amount: Number(tier.amount) }))
      .filter((tier) => Number.isFinite(tier.minMinutes) && Number.isFinite(tier.amount))
      .sort((a, b) => a.minMinutes - b.minMinutes),
  };
}

/** Highest threshold that the lateness reaches wins (45m → 30m tier). */
export function latePenaltyForMinutes(minutesLate: number, policy: AttendancePolicy): number {
  const effective = Math.max(0, minutesLate - policy.lateGraceMinutes);
  if (effective <= 0) return 0;
  let amount = 0;
  for (const tier of policy.lateTiers) {
    if (effective >= tier.minMinutes) amount = tier.amount;
  }
  return amount;
}

async function getStoreLocation(tenantId: string) {
  const [row] = await db
    .select({
      id: locations.id,
      name: locations.name,
      latitude: locations.latitude,
      longitude: locations.longitude,
    })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), eq(locations.active, true)))
    .limit(1);
  return row ?? null;
}

export async function getLinkedEmployee(ctx: TenantContext) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, ctx.tenantId),
        eq(employees.userId, ctx.userId),
        eq(employees.active, true)
      )
    )
    .limit(1);
  if (!employee) throw new NotFoundError("No worker profile is linked to this account");
  return employee;
}

type ShiftRow = { weekday: number; startTime: string; endTime: string };

async function getSchedule(employeeId: string) {
  const rows = await db
    .select({
      weekday: workingHours.weekday,
      startTime: workingHours.startTime,
      endTime: workingHours.endTime,
    })
    .from(workingHours)
    .where(eq(workingHours.employeeId, employeeId));
  const map = new Map<number, ShiftRow>();
  for (const row of rows) map.set(row.weekday, row);
  return map;
}

function shiftWindow(
  schedule: ShiftRow | undefined,
  dateKey: string,
  timeZone: string
): { startTime: string; endTime: string; start: Date; end: Date } | null {
  if (!schedule) return null;
  const start = zonedDateTime(dateKey, schedule.startTime, timeZone);
  let end = zonedDateTime(dateKey, schedule.endTime, timeZone);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { startTime: schedule.startTime, endTime: schedule.endTime, start, end };
}

export type AttendanceDayStatus = "off" | "on_time" | "late" | "no_show" | "pending";

export type AttendanceDay = {
  dateKey: string;
  weekday: number;
  shift: { startTime: string; endTime: string } | null;
  isOff: boolean;
  offApproved: boolean;
  lateApproved: boolean;
  arrivalAt: string | null;
  leaveAt: string | null;
  status: AttendanceDayStatus;
  lateMinutes: number;
  earlyMinutes: number;
  earlyLeaveMinutes: number | null;
  penalty: number;
  request: {
    id: string;
    type: AttendanceRequestType;
    status: AttendanceRequestStatus;
    lateTime: string | null;
    reason: string | null;
    penaltyAmount: number | null;
    ownerNote: string | null;
  } | null;
  dispute: {
    id: string;
    note: string;
    status: string;
    ownerNote: string | null;
  } | null;
};

type ComputedInput = {
  employeeId: string;
  fromKey: string;
  toKey: string;
  timeZone: string;
  policy: AttendancePolicy;
};

async function computeDaySummaries(input: ComputedInput): Promise<AttendanceDay[]> {
  const { employeeId, fromKey, toKey, timeZone, policy } = input;
  const todayKey = dateKeyOf(new Date(), timeZone);
  const schedule = await getSchedule(employeeId);

  const fromDate = zonedDateTime(fromKey, "00:00", timeZone);
  const toDate = zonedDateTime(shiftDateKey(toKey, 1), "00:00", timeZone);

  const logs = await db
    .select({
      id: attendanceLogs.id,
      type: attendanceLogs.type,
      createdAt: attendanceLogs.createdAt,
    })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        gte(attendanceLogs.createdAt, fromDate),
        lt(attendanceLogs.createdAt, toDate)
      )
    )
    .orderBy(asc(attendanceLogs.createdAt));

  const logsByDay = new Map<string, { type: "arrive" | "leave"; createdAt: Date }[]>();
  for (const log of logs) {
    const key = dateKeyOf(log.createdAt, timeZone);
    const list = logsByDay.get(key) ?? [];
    list.push({ type: log.type, createdAt: log.createdAt });
    logsByDay.set(key, list);
  }

  const requests = await db
    .select()
    .from(attendanceRequests)
    .where(
      and(
        eq(attendanceRequests.employeeId, employeeId),
        gte(attendanceRequests.date, fromDate),
        lt(attendanceRequests.date, toDate)
      )
    );

  const disputes = await db
    .select()
    .from(attendanceDisputes)
    .where(
      and(
        eq(attendanceDisputes.employeeId, employeeId),
        gte(attendanceDisputes.date, fromDate),
        lt(attendanceDisputes.date, toDate)
      )
    );

  const days: AttendanceDay[] = [];
  for (let offset = 0; ; offset += 1) {
    const dateKey = shiftDateKey(fromKey, offset);
    if (dateKey > toKey) break;
    const weekday = weekdayOfKey(dateKey);
    const scheduleRow = schedule.get(weekday);
    const dayLogs = logsByDay.get(dateKey) ?? [];
    const arrivalLog = dayLogs.find((log) => log.type === "arrive") ?? null;
    const leaveLog = [...dayLogs].reverse().find((log) => log.type === "leave") ?? null;

    const requestRow =
      requests.find((row) => dateKeyOf(row.date, timeZone) === dateKey) ?? null;

    const disputeRow =
      disputes.find((row) => dateKeyOf(row.date, timeZone) === dateKey) ?? null;

    const request = requestRow
      ? {
          id: requestRow.id,
          type: requestRow.type,
          status: requestRow.status,
          lateTime: requestRow.lateTime,
          reason: requestRow.reason,
          penaltyAmount:
            requestRow.penaltyAmount == null ? null : Number(requestRow.penaltyAmount),
          ownerNote: requestRow.ownerNote,
        }
      : null;

    const dispute = disputeRow
      ? {
          id: disputeRow.id,
          note: disputeRow.note,
          status: disputeRow.status,
          ownerNote: disputeRow.ownerNote,
        }
      : null;

    const base = {
      dateKey,
      weekday,
      arrivalAt: arrivalLog ? arrivalLog.createdAt.toISOString() : null,
      leaveAt: leaveLog ? leaveLog.createdAt.toISOString() : null,
      request,
      dispute,
    };

    const window = shiftWindow(scheduleRow, dateKey, timeZone);

    if (!window) {
      days.push({
        ...base,
        shift: null,
        isOff: true,
        offApproved: request?.type === "day_off" && request.status === "accepted",
        lateApproved: false,
        status: "off",
        lateMinutes: 0,
        earlyMinutes: 0,
        earlyLeaveMinutes: null,
        penalty: 0,
      });
      continue;
    }

    const offApproved = request?.type === "day_off" && request.status === "accepted";
    if (offApproved) {
      days.push({
        ...base,
        shift: { startTime: window.startTime, endTime: window.endTime },
        isOff: true,
        offApproved: true,
        lateApproved: false,
        status: "off",
        lateMinutes: 0,
        earlyMinutes: 0,
        earlyLeaveMinutes: null,
        penalty: Number(request?.penaltyAmount ?? 0),
      });
      continue;
    }

    const lateApproved = request?.type === "late_arrival" && request.status === "accepted";
    const shift = { startTime: window.startTime, endTime: window.endTime };

    if (arrivalLog) {
      const lateMinutes = Math.max(
        0,
        Math.round((arrivalLog.createdAt.getTime() - window.start.getTime()) / 60000) - policy.lateGraceMinutes
      );
      const earlyMinutes = Math.max(
        0,
        Math.round((window.start.getTime() - arrivalLog.createdAt.getTime()) / 60000)
      );
      const earlyLeaveMinutes = leaveLog
        ? Math.max(0, Math.round((window.end.getTime() - leaveLog.createdAt.getTime()) / 60000))
        : null;
      days.push({
        ...base,
        shift,
        isOff: false,
        offApproved: false,
        lateApproved,
        status: lateMinutes > 0 ? "late" : "on_time",
        lateMinutes,
        earlyMinutes,
        earlyLeaveMinutes,
        penalty: lateApproved ? 0 : latePenaltyForMinutes(lateMinutes, policy),
      });
      continue;
    }

    const now = Date.now();
    const shiftEnded = now >= window.end.getTime();
    if (dateKey === todayKey && !shiftEnded) {
      days.push({
        ...base,
        shift,
        isOff: false,
        offApproved: false,
        lateApproved,
        status: "pending",
        lateMinutes: 0,
        earlyMinutes: 0,
        earlyLeaveMinutes: null,
        penalty: 0,
      });
      continue;
    }

    days.push({
      ...base,
      shift,
      isOff: false,
      offApproved: false,
      lateApproved,
      status: "no_show",
      lateMinutes: 0,
      earlyMinutes: 0,
      earlyLeaveMinutes: null,
      penalty: policy.noShowPenalty,
    });
  }

  return days;
}

/** Current shift state for the signed-in worker. */
export async function getWorkerState(ctx: TenantContext) {
  assertPermission(ctx, Permission["attendance.use"]);
  const employee = await getLinkedEmployee(ctx);
  const policy = await getAttendancePolicy(ctx.tenantId);
  const todayKey = dateKeyOf(new Date(), ctx.timezone);

  const [last] = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.tenantId, ctx.tenantId), eq(attendanceLogs.employeeId, employee.id)))
    .orderBy(desc(attendanceLogs.createdAt))
    .limit(1);

  const startOfDay = zonedDateTime(todayKey, "00:00", ctx.timezone);
  const endOfDay = zonedDateTime(shiftDateKey(todayKey, 1), "00:00", ctx.timezone);
  const today = await db
    .select()
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.tenantId, ctx.tenantId),
        eq(attendanceLogs.employeeId, employee.id),
        gte(attendanceLogs.createdAt, startOfDay),
        lt(attendanceLogs.createdAt, endOfDay)
      )
    )
    .orderBy(desc(attendanceLogs.createdAt));

  const [day] = await computeDaySummaries({
    employeeId: employee.id,
    fromKey: todayKey,
    toKey: todayKey,
    timeZone: ctx.timezone,
    policy,
  });

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: employee.displayName,
      role: employee.role,
    },
    location: await getStoreLocation(ctx.tenantId),
    clockedIn: last?.type === "arrive",
    lastLog: last ?? null,
    today,
    day: day ?? null,
    policy,
    todayKey,
    timezone: ctx.timezone,
  };
}

export type AttendanceInput = {
  type: "arrive" | "leave";
  latitude: unknown;
  longitude: unknown;
  accuracyMeters?: unknown;
  confirmEarlyLeave?: boolean;
};

export async function recordAttendance(ctx: TenantContext, input: AttendanceInput) {
  assertPermission(ctx, Permission["attendance.use"]);
  if (input.type !== "arrive" && input.type !== "leave") {
    throw new ValidationAppError("Choose arrive or leave");
  }

  const employee = await getLinkedEmployee(ctx);
  const store = await getStoreLocation(ctx.tenantId);
  if (!store?.latitude || !store.longitude) {
    throw new ValidationAppError("The store location has not been set yet");
  }

  const point: GeoPoint = {
    latitude: parseCoordinate(input.latitude, "latitude"),
    longitude: parseCoordinate(input.longitude, "longitude"),
  };
  const storePoint: GeoPoint = {
    latitude: Number(store.latitude),
    longitude: Number(store.longitude),
  };
  const distanceMeters = haversineMeters(point, storePoint);
  if (distanceMeters > ATTENDANCE_GEOFENCE_METERS) {
    throw new ForbiddenError("You are out of the store");
  }

  const [last] = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.tenantId, ctx.tenantId), eq(attendanceLogs.employeeId, employee.id)))
    .orderBy(desc(attendanceLogs.createdAt))
    .limit(1);

  const alreadyClockedIn = last?.type === "arrive";
  if (input.type === "arrive" && alreadyClockedIn) {
    return { log: last, already: true, distanceMeters, requiresEarlyLeaveConfirm: false, earlyLeave: false };
  }
  if (input.type === "leave" && !alreadyClockedIn) {
    throw new ValidationAppError("You are not checked in yet");
  }

  const policy = await getAttendancePolicy(ctx.tenantId);
  const todayKey = dateKeyOf(new Date(), ctx.timezone);
  const schedule = await getSchedule(employee.id);
  const window = shiftWindow(schedule.get(weekdayOfKey(todayKey)), todayKey, ctx.timezone);
  const now = new Date();

  if (input.type === "arrive" && window) {
    const earliest = new Date(window.start.getTime() - policy.earlyCheckInMinutes * 60_000);
    if (now.getTime() < earliest.getTime()) {
      throw new ValidationAppError(
        `You can arrive at most ${policy.earlyCheckInMinutes} minutes before your shift starts (${window.startTime}).`
      );
    }
  }

  let earlyLeave = false;
  if (input.type === "leave" && window && now.getTime() < window.end.getTime()) {
    if (!input.confirmEarlyLeave) {
      const minutesEarly = Math.ceil((window.end.getTime() - now.getTime()) / 60_000);
      return {
        requiresEarlyLeaveConfirm: true,
        minutesEarly,
        shiftEnd: window.endTime,
        already: false,
        log: null,
        distanceMeters,
        earlyLeave: false,
      };
    }
    earlyLeave = true;
  }

  const accuracy = Number(input.accuracyMeters);
  const [log] = await db
    .insert(attendanceLogs)
    .values({
      tenantId: ctx.tenantId,
      employeeId: employee.id,
      userId: ctx.userId,
      type: input.type,
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      accuracyMeters: Number.isFinite(accuracy) && accuracy > 0 ? String(accuracy) : null,
      distanceMeters,
      verified: true,
    })
    .returning();

  return {
    log,
    already: false,
    distanceMeters,
    requiresEarlyLeaveConfirm: false,
    earlyLeave,
  };
}

export type AttendanceHistory = {
  days: AttendanceDay[];
  policy: AttendancePolicy;
  employee: { id: string; firstName: string; lastName: string | null; displayName: string | null };
};

/** Worker-facing day-by-day history for the last `days` days. */
export async function getWorkerHistory(ctx: TenantContext, days = 30): Promise<AttendanceHistory> {
  assertPermission(ctx, Permission["attendance.read"]);
  const employee = await getLinkedEmployee(ctx);
  const policy = await getAttendancePolicy(ctx.tenantId);
  const todayKey = dateKeyOf(new Date(), ctx.timezone);
  const fromKey = shiftDateKey(todayKey, -(Math.max(1, days) - 1));
  const rows = await computeDaySummaries({
    employeeId: employee.id,
    fromKey,
    toKey: todayKey,
    timeZone: ctx.timezone,
    policy,
  });
  return {
    days: rows.reverse(),
    policy,
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: employee.displayName,
    },
  };
}

export async function listWorkerRequests(ctx: TenantContext) {
  assertPermission(ctx, Permission["attendance.read"]);
  const employee = await getLinkedEmployee(ctx);
  const rows = await db
    .select()
    .from(attendanceRequests)
    .where(eq(attendanceRequests.employeeId, employee.id))
    .orderBy(desc(attendanceRequests.date));
  return rows.map((row) => ({
    ...row,
    penaltyAmount: row.penaltyAmount == null ? null : Number(row.penaltyAmount),
    dateKey: dateKeyOf(row.date, ctx.timezone),
  }));
}

export type CreateAttendanceRequestInput = {
  type: AttendanceRequestType;
  dateKey: string;
  lateTime?: string | null;
  reason?: string | null;
};

export async function createAttendanceRequest(ctx: TenantContext, input: CreateAttendanceRequestInput) {
  assertPermission(ctx, Permission["attendance.request"]);
  if (input.type !== "day_off" && input.type !== "late_arrival") {
    throw new ValidationAppError("Invalid request type");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey ?? "")) {
    throw new ValidationAppError("Choose a valid date");
  }
  const todayKey = dateKeyOf(new Date(), ctx.timezone);
  if (input.dateKey < todayKey) throw new ValidationAppError("Requests must be for today or a future day");
  if (input.type === "late_arrival" && !/^\d{2}:\d{2}$/.test(input.lateTime ?? "")) {
    throw new ValidationAppError("Choose the time you will arrive");
  }

  const employee = await getLinkedEmployee(ctx);
  const date = zonedDateTime(input.dateKey, "12:00", ctx.timezone);

  const [existing] = await db
    .select({ id: attendanceRequests.id })
    .from(attendanceRequests)
    .where(
      and(
        eq(attendanceRequests.employeeId, employee.id),
        eq(attendanceRequests.type, input.type),
        eq(attendanceRequests.date, date),
        eq(attendanceRequests.status, "pending")
      )
    )
    .limit(1);
  if (existing) throw new ConflictError("You already have a pending request for this day");

  const [row] = await db
    .insert(attendanceRequests)
    .values({
      tenantId: ctx.tenantId,
      employeeId: employee.id,
      type: input.type,
      date,
      lateTime: input.type === "late_arrival" ? input.lateTime ?? null : null,
      reason: input.reason?.trim() || null,
      status: "pending",
    })
    .returning();

  return row;
}

export async function listWorkerDisputes(ctx: TenantContext) {
  assertPermission(ctx, Permission["attendance.read"]);
  const employee = await getLinkedEmployee(ctx);
  const rows = await db
    .select()
    .from(attendanceDisputes)
    .where(eq(attendanceDisputes.employeeId, employee.id))
    .orderBy(desc(attendanceDisputes.date));
  return rows.map((row) => ({ ...row, dateKey: dateKeyOf(row.date, ctx.timezone) }));
}

export type CreateDisputeInput = { dateKey: string; note: string };

export async function createAttendanceDispute(ctx: TenantContext, input: CreateDisputeInput) {
  assertPermission(ctx, Permission["attendance.request"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey ?? "")) {
    throw new ValidationAppError("Choose a valid date");
  }
  if (!input.note?.trim()) throw new ValidationAppError("Add a note for the owner");
  const todayKey = dateKeyOf(new Date(), ctx.timezone);
  if (input.dateKey > todayKey) throw new ValidationAppError("You can only dispute past or current days");

  const employee = await getLinkedEmployee(ctx);
  const date = zonedDateTime(input.dateKey, "12:00", ctx.timezone);

  const [existing] = await db
    .select({ id: attendanceDisputes.id })
    .from(attendanceDisputes)
    .where(and(eq(attendanceDisputes.employeeId, employee.id), eq(attendanceDisputes.date, date)))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(attendanceDisputes)
      .set({ note: input.note.trim(), status: "pending", ownerNote: null, resolvedAt: null, resolvedBy: null })
      .where(eq(attendanceDisputes.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(attendanceDisputes)
    .values({
      tenantId: ctx.tenantId,
      employeeId: employee.id,
      date,
      note: input.note.trim(),
      status: "pending",
    })
    .returning();
  return row;
}

// ── Owner / manager ─────────────────────────────────────────────────────────

export type SavePolicyInput = {
  earlyCheckInMinutes?: unknown;
  lateGraceMinutes?: unknown;
  noShowPenalty?: unknown;
  lateTiers?: unknown;
};

function toNonNegativeInt(value: unknown, fallback: number, label: string): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ValidationAppError(`Invalid ${label}`);
  return Math.round(number);
}

function sanitizeTiers(value: unknown): LateTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => {
      const record = tier as { minMinutes?: unknown; amount?: unknown };
      const minMinutes = Number(record?.minMinutes);
      const amount = Number(record?.amount);
      return { minMinutes, amount };
    })
    .filter((tier) => Number.isFinite(tier.minMinutes) && Number.isFinite(tier.amount) && tier.minMinutes >= 0 && tier.amount >= 0)
    .map((tier) => ({ minMinutes: Math.round(tier.minMinutes), amount: tier.amount }))
    .sort((a, b) => a.minMinutes - b.minMinutes);
}

export async function saveAttendancePolicy(ctx: TenantContext, input: SavePolicyInput) {
  assertPermission(ctx, Permission["attendance.manage"]);
  const current = await getAttendancePolicy(ctx.tenantId);
  let noShowPenalty = current.noShowPenalty;
  if (input.noShowPenalty != null && input.noShowPenalty !== "") {
    const amount = Number(input.noShowPenalty);
    if (!Number.isFinite(amount) || amount < 0) throw new ValidationAppError("Invalid no-show penalty");
    noShowPenalty = amount;
  }
  const values = {
    earlyCheckInMinutes: toNonNegativeInt(input.earlyCheckInMinutes, current.earlyCheckInMinutes, "early check-in window"),
    lateGraceMinutes: toNonNegativeInt(input.lateGraceMinutes, current.lateGraceMinutes, "grace period"),
    noShowPenalty: String(noShowPenalty),
    lateTiers: input.lateTiers === undefined ? current.lateTiers : sanitizeTiers(input.lateTiers),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: attendanceSettings.id })
    .from(attendanceSettings)
    .where(eq(attendanceSettings.tenantId, ctx.tenantId))
    .limit(1);

  if (existing) {
    await db.update(attendanceSettings).set(values).where(eq(attendanceSettings.id, existing.id));
  } else {
    await db.insert(attendanceSettings).values({ tenantId: ctx.tenantId, ...values });
  }
  return getAttendancePolicy(ctx.tenantId);
}

export async function listWorkersAttendance(ctx: TenantContext, dateKey: string) {
  assertPermission(ctx, Permission["attendance.manage"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "")) throw new ValidationAppError("Invalid date");
  const policy = await getAttendancePolicy(ctx.tenantId);
  const staff = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      displayName: employees.displayName,
      role: employees.role,
      isBookable: employees.isBookable,
    })
    .from(employees)
    .where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.active, true)))
    .orderBy(asc(employees.firstName));

  const rows = await Promise.all(
    staff.map(async (employee) => {
      const [day] = await computeDaySummaries({
        employeeId: employee.id,
        fromKey: dateKey,
        toKey: dateKey,
        timeZone: ctx.timezone,
        policy,
      });
      return {
        employee: {
          id: employee.id,
          name: employee.displayName ?? `${employee.firstName}${employee.lastName ? " " + employee.lastName : ""}`,
          role: employee.role,
          isBookable: employee.isBookable,
        },
        day: day ?? null,
      };
    })
  );

  return { policy, dateKey, rows };
}

export async function listAttendanceRequests(ctx: TenantContext, status?: AttendanceRequestStatus) {
  assertPermission(ctx, Permission["attendance.manage"]);
  const rows = await db
    .select({
      id: attendanceRequests.id,
      type: attendanceRequests.type,
      date: attendanceRequests.date,
      lateTime: attendanceRequests.lateTime,
      reason: attendanceRequests.reason,
      status: attendanceRequests.status,
      penaltyAmount: attendanceRequests.penaltyAmount,
      ownerNote: attendanceRequests.ownerNote,
      createdAt: attendanceRequests.createdAt,
      employeeId: attendanceRequests.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      displayName: employees.displayName,
    })
    .from(attendanceRequests)
    .innerJoin(employees, eq(employees.id, attendanceRequests.employeeId))
    .where(
      status
        ? and(eq(attendanceRequests.tenantId, ctx.tenantId), eq(attendanceRequests.status, status))
        : eq(attendanceRequests.tenantId, ctx.tenantId)
    )
    .orderBy(desc(attendanceRequests.createdAt));

  return rows.map((row) => ({
    ...row,
    dateKey: dateKeyOf(row.date, ctx.timezone),
    employeeName:
      row.displayName ?? `${row.firstName}${row.lastName ? " " + row.lastName : ""}`,
    penaltyAmount: row.penaltyAmount == null ? null : Number(row.penaltyAmount),
  }));
}

export async function resolveAttendanceRequest(
  ctx: TenantContext,
  id: string,
  status: AttendanceRequestStatus,
  options: { penaltyAmount?: unknown; ownerNote?: string | null } = {}
) {
  assertPermission(ctx, Permission["attendance.manage"]);
  if (status !== "accepted" && status !== "rejected") throw new ValidationAppError("Invalid status");

  const [row] = await db
    .select()
    .from(attendanceRequests)
    .where(and(eq(attendanceRequests.id, id), eq(attendanceRequests.tenantId, ctx.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("Request not found");

  let penaltyAmount: string | null = null;
  if (status === "accepted" && row.type === "day_off" && options.penaltyAmount != null && options.penaltyAmount !== "") {
    const amount = Number(options.penaltyAmount);
    if (!Number.isFinite(amount) || amount < 0) throw new ValidationAppError("Invalid penalty amount");
    penaltyAmount = amount === 0 ? null : String(amount);
  }

  const [updated] = await db
    .update(attendanceRequests)
    .set({
      status,
      penaltyAmount: row.type === "day_off" ? penaltyAmount : null,
      ownerNote: options.ownerNote?.trim() || null,
      resolvedBy: ctx.userId,
      resolvedAt: new Date(),
    })
    .where(eq(attendanceRequests.id, id))
    .returning();

  if (status === "accepted" && row.type === "day_off") {
    const dateKey = dateKeyOf(row.date, ctx.timezone);
    const dayStart = zonedDateTime(dateKey, "00:00", ctx.timezone);
    const dayEnd = zonedDateTime(dateKey, "23:59", ctx.timezone);
    const [existingOff] = await db
      .select({ id: timeOff.id })
      .from(timeOff)
      .where(and(eq(timeOff.employeeId, row.employeeId), eq(timeOff.startDate, dayStart)))
      .limit(1);
    if (!existingOff) {
      await db.insert(timeOff).values({
        employeeId: row.employeeId,
        startDate: dayStart,
        endDate: dayEnd,
        type: "day_off",
        reason: row.reason ?? "Approved day off",
      });
    }
  }

  return updated;
}

export async function listAttendanceDisputes(ctx: TenantContext) {
  assertPermission(ctx, Permission["attendance.manage"]);
  const rows = await db
    .select({
      id: attendanceDisputes.id,
      date: attendanceDisputes.date,
      note: attendanceDisputes.note,
      status: attendanceDisputes.status,
      ownerNote: attendanceDisputes.ownerNote,
      createdAt: attendanceDisputes.createdAt,
      employeeId: attendanceDisputes.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      displayName: employees.displayName,
    })
    .from(attendanceDisputes)
    .innerJoin(employees, eq(employees.id, attendanceDisputes.employeeId))
    .where(eq(attendanceDisputes.tenantId, ctx.tenantId))
    .orderBy(desc(attendanceDisputes.createdAt));

  return rows.map((row) => ({
    ...row,
    dateKey: dateKeyOf(row.date, ctx.timezone),
    employeeName:
      row.displayName ?? `${row.firstName}${row.lastName ? " " + row.lastName : ""}`,
  }));
}

export async function resolveAttendanceDispute(
  ctx: TenantContext,
  id: string,
  status: "accepted" | "rejected",
  ownerNote?: string | null
) {
  assertPermission(ctx, Permission["attendance.manage"]);
  if (status !== "accepted" && status !== "rejected") throw new ValidationAppError("Invalid status");
  const [row] = await db
    .select({ id: attendanceDisputes.id })
    .from(attendanceDisputes)
    .where(and(eq(attendanceDisputes.id, id), eq(attendanceDisputes.tenantId, ctx.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("Dispute not found");
  const [updated] = await db
    .update(attendanceDisputes)
    .set({
      status,
      ownerNote: ownerNote?.trim() || null,
      resolvedBy: ctx.userId,
      resolvedAt: new Date(),
    })
    .where(eq(attendanceDisputes.id, id))
    .returning();
  return updated;
}
