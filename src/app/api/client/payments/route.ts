import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { clientPaymentMethods } from "@/db/schema";

/**
 * Saved payment references. The full card number NEVER reaches this API:
 * the form parses brand/last4/expiry in the browser and only uploads those.
 */
const postSchema = z.object({
  brand: z.string().max(20).default("card"),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12).nullable().optional(),
  expYear: z.number().int().min(2026).max(2100).nullable().optional(),
  holderName: z.string().max(120).nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

/** GET /api/client/payments — my saved payment methods. */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const rows = await db.select().from(clientPaymentMethods).where(eq(clientPaymentMethods.userId, userId));
    return NextResponse.json(ok({ methods: rows }), { status: HttpStatus.Ok });
  });
}

/** POST /api/client/payments — save a reference (brand/last4/expiry only). */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = postSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid card details" }, { status: HttpStatus.BadRequest });
    }
    if (input.data.isDefault) {
      await db
        .update(clientPaymentMethods)
        .set({ isDefault: false })
        .where(eq(clientPaymentMethods.userId, userId));
    }
    const [row] = await db
      .insert(clientPaymentMethods)
      .values({
        userId,
        brand: input.data.brand,
        last4: input.data.last4,
        expMonth: input.data.expMonth ?? null,
        expYear: input.data.expYear ?? null,
        holderName: input.data.holderName ?? null,
        isDefault: input.data.isDefault ?? false,
      })
      .returning();
    return NextResponse.json(ok({ method: row }), { status: HttpStatus.Created });
  });
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** DELETE /api/client/payments — remove a saved method. */
export async function DELETE(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = deleteSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await db
      .delete(clientPaymentMethods)
      .where(and(eq(clientPaymentMethods.id, input.data.id), eq(clientPaymentMethods.userId, userId)));
    return NextResponse.json(ok({ id: input.data.id }), { status: HttpStatus.Ok });
  });
}
