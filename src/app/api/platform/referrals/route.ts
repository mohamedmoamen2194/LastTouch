import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { assertPlatformApi } from "@/lib/platform/admin";

const bodySchema = z.object({
  action: z.enum(["paid"]),
  referralId: z.string().uuid(),
});

/**
 * POST /api/platform/referrals — mark a requested cash payout as paid
 * (you pay the user manually, then confirm here).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    await db
      .update(referrals)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(referrals.id, input.data.referralId), eq(referrals.status, "requested")));
    return NextResponse.json(ok({ id: input.data.referralId }), { status: HttpStatus.Ok });
  });
}
