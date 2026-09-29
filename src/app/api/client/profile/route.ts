import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import { ensureReferralCode, isProfileComplete, upsertClientProfile } from "@/lib/marketplace/client";

const postSchema = z.object({
  fullName: z.string().max(120).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(255).nullable().optional().or(z.literal("")),
  birthdate: z.string().datetime().nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  age: z.number().int().min(5).max(120).nullable().optional(),
});

/** GET /api/client/profile — my client account (auto-created on first read). */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const profile = await upsertClientProfile(userId, {});
    return NextResponse.json(ok({ profile }), { status: HttpStatus.Ok });
  });
}

/** POST /api/client/profile — update my info. */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = postSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    const profile = await upsertClientProfile(userId, {
      fullName: input.data.fullName ?? undefined,
      phone: input.data.phone ?? undefined,
      email: input.data.email || undefined,
      birthdate: input.data.birthdate ? new Date(input.data.birthdate) : undefined,
      gender: input.data.gender ?? undefined,
      age: input.data.age ?? undefined,
    });
    // Permanent referral code is minted the moment the profile is complete.
    if (isProfileComplete(profile) && !profile.referralCode) {
      await ensureReferralCode(userId);
    }
    return NextResponse.json(ok({ profile }), { status: HttpStatus.Ok });
  });
}
