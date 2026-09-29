import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import {
  convertReferralToPoints,
  getReferralStats,
  requestReferralCash,
} from "@/lib/marketplace/referrals";

/** GET /api/client/referrals — my code, balance, earnings, referral list. */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const stats = await getReferralStats(userId);
    return NextResponse.json(ok(stats), { status: HttpStatus.Ok });
  });
}

const postSchema = z.object({
  action: z.enum(["convert", "request"]),
  referralId: z.string().uuid(),
});

/**
 * POST /api/client/referrals — convert one earned referral to 1000 points,
 * or request its 100 EGP as cash (admin pays out later).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = postSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    try {
      if (input.data.action === "convert") {
        await convertReferralToPoints(userId, input.data.referralId);
      } else {
        await requestReferralCash(userId, input.data.referralId);
      }
    } catch (e) {
      return NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : "Failed" },
        { status: HttpStatus.BadRequest },
      );
    }
    return NextResponse.json(ok({ ok: true }), { status: HttpStatus.Ok });
  });
}
