import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { clientFavorites } from "@/db/schema";

const bodySchema = z.object({ tenantId: z.string().uuid() });

/** GET /api/client/favorites — my saved store ids. */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const rows = await db.select({ tenantId: clientFavorites.tenantId }).from(clientFavorites).where(eq(clientFavorites.userId, userId));
    return NextResponse.json(ok({ tenantIds: rows.map((r) => r.tenantId) }), { status: HttpStatus.Ok });
  });
}

/** POST /api/client/favorites — save a store. */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await db.insert(clientFavorites).values({ userId, tenantId: input.data.tenantId }).onConflictDoNothing();
    return NextResponse.json(ok({ tenantId: input.data.tenantId }), { status: HttpStatus.Created });
  });
}

/** DELETE /api/client/favorites — unsave a store. */
export async function DELETE(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await db
      .delete(clientFavorites)
      .where(and(eq(clientFavorites.userId, userId), eq(clientFavorites.tenantId, input.data.tenantId)));
    return NextResponse.json(ok({ tenantId: input.data.tenantId }), { status: HttpStatus.Ok });
  });
}
