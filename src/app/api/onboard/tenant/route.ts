import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { createTenant } from "@/modules/onboarding/application/create-tenant";
import { requireUserId } from "@/lib/auth/session";
import { BUSINESS_TYPES, THEMES, type BusinessType, type ThemeName } from "@/db/schema";

const bodySchema = z.object({
  businessName: z.string().min(1).max(120),
  businessType: z.enum(BUSINESS_TYPES as unknown as [string, ...string[]]),
  theme: z.enum(THEMES as unknown as [string, ...string[]]).optional(),
  employeeLabel: z.string().max(40).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).min(2).max(80).optional(),
  tagline: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
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

    return NextResponse.json(ok({ slug: tenant.slug, businessName: tenant.businessName }), {
      status: HttpStatus.Created,
    });
  });
}