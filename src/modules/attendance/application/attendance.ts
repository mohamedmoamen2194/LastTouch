import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceLogs, employees, locations } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { Permission } from "@/lib/permissions";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";

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

async function getLinkedEmployee(ctx: TenantContext) {
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

/** Current shift state for the signed-in worker. */
export async function getWorkerState(ctx: TenantContext) {
  assertPermission(ctx, Permission["attendance.use"]);
  const employee = await getLinkedEmployee(ctx);

  const [last] = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.tenantId, ctx.tenantId), eq(attendanceLogs.employeeId, employee.id)))
    .orderBy(desc(attendanceLogs.createdAt))
    .limit(1);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = await db
    .select()
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.tenantId, ctx.tenantId),
        eq(attendanceLogs.employeeId, employee.id),
        gte(attendanceLogs.createdAt, startOfDay)
      )
    )
    .orderBy(desc(attendanceLogs.createdAt));

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
  };
}

export type AttendanceInput = {
  type: "arrive" | "leave";
  latitude: unknown;
  longitude: unknown;
  accuracyMeters?: unknown;
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
    return { log: last, already: true, distanceMeters };
  }
  if (input.type === "leave" && !alreadyClockedIn) {
    throw new ValidationAppError("You are not checked in yet");
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

  return { log, already: false, distanceMeters };
}
