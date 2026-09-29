import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { createTenant } from "@/modules/onboarding/application/create-tenant";
import { requireUserId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { clientProfiles, referrals } from "@/db/schema";
import { BUSINESS_TYPES, THEMES, type BusinessType, type ThemeName } from "@/db/schema";

const bodySchema = z.object({
  businessName: z.string().min(1).max(120),
  businessType: z.enum(BUSINESS_TYPES as unknown as [string, ...string[]]),
  theme: z.enum(THEMES as unknown as [string, ...string[]]).optional(),
  employeeLabel: z.string().max(40).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).min(2).max(80).optional(),
  tagline: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  referralCode: z.string().max(60).optional(),
});

/**
 * POST /api/onboard/tenant
 * Creates the store + owner membership + starter catalog.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });

    // Real authenticated user (Clerk is required to create a store).
    const userId = await requireUserId();
    // Each store seeds a full catalog — cap runaway creation per user.
    rateLimit(`onboard:${userId}:${clientIp(req)}`, 3);

    const tenant = await createTenant({
      userId,
      businessName: input.data.businessName,
      businessType: input.data.businessType as BusinessType,
      theme: input.data.theme as ThemeName | undefined,
      employeeLabel: input.data.employeeLabel,
      slug: input.data.slug,
      tagline: input.data.tagline,
      phone: input.data.phone,
    });

    // Optional referral: credit the referrer (100 EGP earned). Invalid
    // codes and self-referrals never block setup — warn and continue.
    let referralWarning: string | null = null;
    const code = input.data.referralCode?.trim().toLowerCase();
    if (code) {
      try {
        const [referrer] = await db
          .select({ userId: clientProfiles.userId })
          .from(clientProfiles)
          .where(eq(clientProfiles.referralCode, code))
          .limit(1);
        if (!referrer) {
          referralWarning = "This referral code does not exist — your store was created without a referral.";
        } else if (referrer.userId === userId) {
          referralWarning = "You cannot refer your own store — it was created without a referral.";
        } else {
          await db
            .insert(referrals)
            .values({ code, referrerUserId: referrer.userId, tenantId: tenant.id, amount: 100, status: "earned" })
            .onConflictDoNothing();
        }
      } catch {
        referralWarning = "Referral could not be applied — your store was created normally.";
      }
    }

    return NextResponse.json(ok({ slug: tenant.slug, businessName: tenant.businessName, referralWarning }), {
      status: HttpStatus.Created,
    });
  });
}