import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/session";
import { claimStaffInvite } from "@/modules/staff/application/invites";

/**
 * POST /api/staff/claim
 * Redeem a staff invite link for the signed-in Clerk user.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<{ code?: unknown }>(req);
    if (typeof body.code !== "string" || !body.code.trim()) {
      throw new ValidationAppError("Enter your invite code");
    }

    const result = await claimStaffInvite(userId, body.code);
    return NextResponse.json(
      ok(
        {
          tenantSlug: result.tenant.slug,
          tenantName: result.tenant.businessName,
          role: result.role,
        },
        "Invite accepted"
      )
    );
  });
}
