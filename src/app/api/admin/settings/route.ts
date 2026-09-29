import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { canEditSettings } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { db } from "@/db";
import { tenants } from "@/db/schema";

const bodySchema = z.object({
  slug: z.string().min(1),
  marketplaceEnabled: z.boolean(),
});

/**
 * POST /api/admin/settings — owner toggles marketplace visibility.
 * Listed stores appear on the public marketplace home.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    const ctx = await getDashboardAccess(input.data.slug);
    if (!canEditSettings(ctx.role)) throw new ForbiddenError();
    await db
      .update(tenants)
      .set({ marketplaceEnabled: input.data.marketplaceEnabled, updatedAt: new Date() })
      .where(eq(tenants.id, ctx.tenantId));
    return NextResponse.json(ok({ marketplaceEnabled: input.data.marketplaceEnabled }), {
      status: HttpStatus.Ok,
    });
  });
}
