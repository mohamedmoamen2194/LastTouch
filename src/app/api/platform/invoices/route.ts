import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { assertPlatformApi } from "@/lib/platform/admin";

const postSchema = z.object({
  tenantId: z.string().uuid(),
  amount: z.number().positive().max(100000000),
  plan: z.string().min(1).default("manual"),
  status: z.string().default("paid"),
  paymentMethod: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.string().min(1).max(30).optional(),
  amount: z.number().positive().max(100000000).optional(),
  paymentMethod: z.string().nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

/** POST = manual invoice (cash / Instapay / custom enterprise top-ups). */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = postSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    const invoiceNumber = `LT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db
      .insert(invoices)
      .values({
        tenantId: input.data.tenantId,
        invoiceNumber,
        plan: input.data.plan,
        amount: String(input.data.amount),
        tax: "0",
        discount: "0",
        status: input.data.status,
        paymentMethod: input.data.paymentMethod ?? "manual",
        issueDate: new Date(),
        dueDate: input.data.dueDate ? new Date(input.data.dueDate) : null,
      })
      .returning({ id: invoices.id });
    return NextResponse.json(ok({ id: row.id, invoiceNumber }), { status: HttpStatus.Created });
  });
}

/** PATCH = mark paid / pending / failed, correct amount. */
export async function PATCH(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = patchSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.data.status !== undefined) patch.status = input.data.status;
    if (input.data.amount !== undefined) patch.amount = String(input.data.amount);
    if (input.data.paymentMethod !== undefined) patch.paymentMethod = input.data.paymentMethod;
    await db.update(invoices).set(patch).where(eq(invoices.id, input.data.id));
    return NextResponse.json(ok({ id: input.data.id }), { status: HttpStatus.Ok });
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
    await db.delete(invoices).where(eq(invoices.id, input.data.id));
    return NextResponse.json(ok({ id: input.data.id }), { status: HttpStatus.Ok });
  });
}
