import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { assertPlatformApi } from "@/lib/platform/admin";

const patchSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  active: z.boolean().optional(),
  marketplaceEnabled: z.boolean().optional(),
  currency: z.string().max(10).optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
  hard: z.boolean().optional().default(false),
});

/**
 * PATCH /api/platform/tenants — edit anything on a tenant.
 * DELETE /api/platform/tenants — soft-deactivate (or hard delete).
 * Both guarded by the admin account allowlist + Clerk login.
 */
export async function PATCH(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = patchSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    const { id, ...fields } = input.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.businessName !== undefined) patch.businessName = fields.businessName;
    if (fields.slug !== undefined) patch.slug = fields.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (fields.phone !== undefined) patch.phone = fields.phone;
    if (fields.email !== undefined) patch.email = fields.email;
    if (fields.active !== undefined) patch.active = fields.active;
    if (fields.marketplaceEnabled !== undefined) patch.marketplaceEnabled = fields.marketplaceEnabled;
    if (fields.currency !== undefined) patch.currency = fields.currency;
    await db.update(tenants).set(patch).where(eq(tenants.id, id));
    return NextResponse.json(ok({ id }), { status: HttpStatus.Ok });
  });
}

export async function DELETE(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = deleteSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    if (input.data.hard) {
      await db.delete(tenants).where(eq(tenants.id, input.data.id));
    } else {
      await db
        .update(tenants)
        .set({ active: false, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenants.id, input.data.id));
    }
    return NextResponse.json(ok({ id: input.data.id }), { status: HttpStatus.Ok });
  });
}
