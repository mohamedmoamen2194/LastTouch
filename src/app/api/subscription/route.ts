import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { canManageBilling } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { db } from "@/db";
import { subscriptions, tenants, BILLING_PERIODS, SUBSCRIPTION_PLANS, type BillingPeriod, type SubscriptionPlan } from "@/db/schema";
import { periodEnd } from "@/lib/subscriptions";

const bodySchema = z.object({
  slug: z.string().min(1),
  plan: z.enum(SUBSCRIPTION_PLANS as unknown as [SubscriptionPlan, ...SubscriptionPlan[]]),
  billingPeriod: z.enum(BILLING_PERIODS as unknown as [BillingPeriod, ...BillingPeriod[]]).default("monthly"),
});

/**
 * POST /api/subscription
 * Owner-only plan change (manual activation until online billing lands).
 * Sets the period start/end from the chosen billing period and syncs
 * tenants.subscriptionPlan so gating updates immediately.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: HttpStatus.BadRequest },
      );
    }

    const ctx = await getDashboardAccess(input.data.slug);
    if (!canManageBilling(ctx.role)) throw new ForbiddenError();

    const now = new Date();
    const end = periodEnd(now, input.data.billingPeriod);

    if (input.data.plan === "free") {
      await db
        .insert(subscriptions)
        .values({ tenantId: ctx.tenantId, plan: "free", status: "cancelled" })
        .onConflictDoUpdate({
          target: subscriptions.tenantId,
          set: {
            plan: "free",
            status: "cancelled",
            renewalDate: null,
            expirationDate: null,
            updatedAt: new Date(),
          },
        });
    } else {
      await db
        .insert(subscriptions)
        .values({
          tenantId: ctx.tenantId,
          plan: input.data.plan,
          status: "active",
          billingPeriod: input.data.billingPeriod,
          startedAt: now,
          renewalDate: end,
          expirationDate: end,
        })
        .onConflictDoUpdate({
          target: subscriptions.tenantId,
          set: {
            plan: input.data.plan,
            status: "active",
            billingPeriod: input.data.billingPeriod,
            startedAt: now,
            renewalDate: end,
            expirationDate: end,
            updatedAt: new Date(),
          },
        });
    }

    await db
      .update(tenants)
      .set({ subscriptionPlan: input.data.plan, updatedAt: new Date() })
      .where(eq(tenants.id, ctx.tenantId));

    return NextResponse.json(
      ok({ plan: input.data.plan, expiresAt: input.data.plan === "free" ? null : end.toISOString() }),
      { status: HttpStatus.Ok },
    );
  });
}

const patchSchema = z.object({
  slug: z.string().min(1),
  autoRenew: z.boolean(),
});

/**
 * PATCH /api/subscription
 * Owner-only auto-renew toggle (cancel / keep). Cancelling never cuts
 * access early: the store keeps full access until the current period ends,
 * it simply will not renew.
 */
export async function PATCH(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = patchSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: HttpStatus.BadRequest },
      );
    }

    const ctx = await getDashboardAccess(input.data.slug);
    if (!canManageBilling(ctx.role)) throw new ForbiddenError();

    await db
      .update(subscriptions)
      .set({ autoRenew: input.data.autoRenew, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, ctx.tenantId));

    return NextResponse.json(ok({ autoRenew: input.data.autoRenew }), {
      status: HttpStatus.Ok,
    });
  });
}
