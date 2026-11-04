import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  createAttendanceRequest,
  listWorkerRequests,
  type CreateAttendanceRequestInput,
} from "@/modules/attendance/application/attendance";

function getSlug(req: Request): string {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) throw new ValidationAppError("Missing tenant slug");
  return slug;
}

/** GET /api/staff/attendance/requests?slug=... — the worker's requests. */
export async function GET(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const rows = await listWorkerRequests(ctx);
    return NextResponse.json(ok(rows, "Requests"));
  });
}

/** POST /api/staff/attendance/requests?slug=... — request a day off / late arrival. */
export async function POST(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const body = await readJson<CreateAttendanceRequestInput>(req);
    const row = await createAttendanceRequest(ctx, body);
    return NextResponse.json(ok(row, "Request submitted"));
  });
}
