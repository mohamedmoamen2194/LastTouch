import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { canEditSettings } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { db } from "@/db";
import { locations } from "@/db/schema";

const bodySchema = z.object({
  slug: z.string().min(1),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

/**
 * POST /api/admin/location — owner upserts the store's primary branch
 * (address/city/coordinates). Shown on the public booking page and used
 * for marketplace "nearby" sorting.
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

    const address = input.data.address?.trim() ? input.data.address.trim() : null;
    const city = input.data.city?.trim() ? input.data.city.trim() : null;

    const existing = await db
      .select()
      .from(locations)
      .where(and(eq(locations.tenantId, ctx.tenantId), eq(locations.active, true)))
      .limit(1);
    const current = existing[0];

    if (current) {
      await db
        .update(locations)
        .set({
          address,
          city,
          latitude: input.data.latitude != null ? String(input.data.latitude) : null,
          longitude: input.data.longitude != null ? String(input.data.longitude) : null,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, current.id));
    } else {
      await db.insert(locations).values({
        tenantId: ctx.tenantId,
        name: "Main branch",
        address,
        city,
        latitude: input.data.latitude != null ? String(input.data.latitude) : null,
        longitude: input.data.longitude != null ? String(input.data.longitude) : null,
        active: true,
      });
    }
    return NextResponse.json(ok({ saved: true }), { status: HttpStatus.Ok });
  });
}
