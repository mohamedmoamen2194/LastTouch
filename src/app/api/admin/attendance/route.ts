import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  resolveAttendanceDispute,
  resolveAttendanceRequest,
  saveAttendancePolicy,
  type SavePolicyInput,
} from "@/modules/attendance/application/attendance";

function getSlug(req: Request): string {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) throw new ValidationAppError("Missing tenant slug");
  return slug;
}

type Body = SavePolicyInput & {
  action: "save-settings" | "resolve-request" | "resolve-dispute";
  id?: string;
  status?: "accepted" | "rejected";
  penaltyAmount?: unknown;
  ownerNote?: string | null;
};

/** POST /api/admin/attendance?slug=... — attendance policy + request/dispute decisions. */
export async function POST(req: Request) {
  return withApi(async () => {
    const ctx = await getDashboardAccess(getSlug(req));
    const body = await readJson<Body>(req);

    if (body.action === "save-settings") {
      const policy = await saveAttendancePolicy(ctx, body);
      return NextResponse.json(ok(policy, "Attendance settings saved"));
    }

    if (body.action === "resolve-request") {
      if (!body.id) throw new ValidationAppError("Missing request id");
      if (body.status !== "accepted" && body.status !== "rejected") {
        throw new ValidationAppError("Invalid status");
      }
      const row = await resolveAttendanceRequest(ctx, body.id, body.status, {
        penaltyAmount: body.penaltyAmount,
        ownerNote: body.ownerNote,
      });
      return NextResponse.json(ok(row, "Request updated"));
    }

    if (body.action === "resolve-dispute") {
      if (!body.id) throw new ValidationAppError("Missing dispute id");
      if (body.status !== "accepted" && body.status !== "rejected") {
        throw new ValidationAppError("Invalid status");
      }
      const row = await resolveAttendanceDispute(ctx, body.id, body.status, body.ownerNote);
      return NextResponse.json(ok(row, "Dispute updated"));
    }

    throw new ValidationAppError("Unknown action");
  });
}
