import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  createAttendanceDispute,
  listWorkerDisputes,
  type CreateDisputeInput,
} from "@/modules/attendance/application/attendance";

function getSlug(req: Request): string {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) throw new ValidationAppError("Missing tenant slug");
  return slug;
}

/** GET /api/staff/attendance/disputes?slug=... — the worker's disputes. */
export async function GET(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const rows = await listWorkerDisputes(ctx);
    return NextResponse.json(ok(rows, "Disputes"));
  });
}

/** POST /api/staff/attendance/disputes?slug=... — dispute a day's attendance. */
export async function POST(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const body = await readJson<CreateDisputeInput>(req);
    const row = await createAttendanceDispute(ctx, body);
    return NextResponse.json(ok(row, "Dispute submitted"));
  });
}
