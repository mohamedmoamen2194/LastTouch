import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  getWorkerState,
  recordAttendance,
  type AttendanceInput,
} from "@/modules/attendance/application/attendance";

function getSlug(req: Request): string {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) throw new ValidationAppError("Missing tenant slug");
  return slug;
}

/** GET /api/staff/attendance?slug=... — current shift for the signed-in worker. */
export async function GET(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const state = await getWorkerState(ctx);
    return NextResponse.json(ok(state, "Attendance state"));
  });
}

/** POST /api/staff/attendance?slug=... — arrive / leave within the store geofence. */
export async function POST(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const body = await readJson<AttendanceInput>(req);
    const result = await recordAttendance(ctx, body);
    return NextResponse.json(ok(result, result.already ? "Already recorded" : "Attendance recorded"));
  });
}
