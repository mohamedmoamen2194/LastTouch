import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { db } from "@/db";
import {
  subscriptions,
  tenants,
  BILLING_PERIODS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type BillingPeriod,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/db/schema";
import { periodEnd } from "@/lib/subscriptions";
import { assertPlatformApi } from "@/lib/platform/admin";
import { createCycleInvoice } from "@/lib/platform/invoices";

const planEnum = z.enum(SUBSCRIPTION_PLANS as unknown as [SubscriptionPlan, ...SubscriptionPlan[]]);
const periodEnum = z.enum(BILLING_PERIODS as unknown as [BillingPeriod, ...BillingPeriod[]]);
const statusEnum = z.enum(
  SUBSCRIPTION_STATUSES as unknown as [SubscriptionStatus, ...SubscriptionStatus[]],
);

/**
 * POST /api/platform/subscriptions
 * Full upsert: set plan / period / status / dates / enterprise custom price.
 * Optionally emits an invoice so revenue stays in sync.
 */
const postSchema = z.object({
  tenantId: z.string().uuid(),
  plan: planEnum,
  billingPeriod: periodEnum.default("monthly"),
  status: statusEnum.default("active"),
  customMonthlyPrice: z.number().min(0).max(10000000).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  autoRenew: z.boolean().optional(),
  createInvoice: z.boolean().optional().default(true),
  invoiceStatus: z.string().optional().default("paid"),
  paymentMethod: z.string().optional().default("manual"),
});

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = postSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    const d = input.data;

    const start = d.startDate ? new Date(d.startDate) : new Date();
    const end = d.endDate ? new Date(d.endDate) : periodEnd(start, d.billingPeriod);
    const custom = d.plan === "enterprise" ? (d.customMonthlyPrice ?? 0) : "0";

    await db
      .insert(subscriptions)
      .values({
        tenantId: d.tenantId,
        plan: d.plan,
        status: d.status,
        billingPeriod: d.billingPeriod,
        customMonthlyPrice: String(Number(custom ?? 0)),
        notes: d.notes ?? null,
        autoRenew: d.autoRenew ?? true,
        startedAt: start,
        renewalDate: end,
        expirationDate: end,
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          plan: d.plan,
          status: d.status,
          billingPeriod: d.billingPeriod,
          customMonthlyPrice: String(Number(custom ?? 0)),
          notes: d.notes ?? null,
          ...(d.autoRenew !== undefined ? { autoRenew: d.autoRenew } : {}),
          startedAt: start,
          renewalDate: end,
          expirationDate: end,
          updatedAt: new Date(),
        },
      });

    // Plan sync triggers keep tenants.subscription_plan aligned, but update
    // explicitly too so reads are immediate even if triggers are disabled.
    await db
      .update(tenants)
      .set({ subscriptionPlan: d.plan, updatedAt: new Date() })
      .where(eq(tenants.id, d.tenantId));

    let invoice: { invoiceNumber: string; amount: number | null } | null = null;
    if (d.createInvoice && d.plan !== "free" && d.status === "active") {
      try {
        invoice = await createCycleInvoice({
          tenantId: d.tenantId,
          plan: d.plan,
          billingPeriod: d.billingPeriod,
          customMonthlyPrice: d.plan === "enterprise" ? Number(custom ?? 0) : null,
          paymentMethod: d.paymentMethod,
          status: d.invoiceStatus,
        });
      } catch (e) {
        console.error("[platform] invoice creation failed", e);
      }
    }

    return NextResponse.json(ok({ tenantId: d.tenantId, plan: d.plan, invoice }), {
      status: HttpStatus.Ok,
    });
  });
}

const patchSchema = z.object({
  tenantId: z.string().uuid(),
  /** extend = push renewal/expiration forward; cancel/reactivate/expire flip status; renew = new cycle from now */
  action: z.enum(["extend", "cancel", "reactivate", "expire", "renew", "toggle_renew"]),
  months: z.number().int().min(1).max(36).optional().default(1),
  billingPeriod: periodEnum.optional(),
});

/** PATCH /api/platform/subscriptions — quick lifecycle actions. */
export async function PATCH(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = patchSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    await assertPlatformApi();
    const { tenantId, action } = input.data;

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
    if (!sub) {
      return NextResponse.json({ success: false, message: "No subscription for tenant" }, { status: HttpStatus.NotFound });
    }

    const now = new Date();
    const base = sub.expirationDate ? new Date(sub.expirationDate) : now;
    const anchor = base > now ? base : now;

    if (action === "extend") {
      const next = new Date(anchor);
      next.setMonth(next.getMonth() + (input.data.months ?? 1));
      await db
        .update(subscriptions)
        .set({ renewalDate: next, expirationDate: next, status: "active", updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));
    } else if (action === "renew") {
      const period = input.data.billingPeriod ?? sub.billingPeriod;
      const end = periodEnd(now, period);
      await db
        .update(subscriptions)
        .set({
          status: "active",
          billingPeriod: period,
          startedAt: now,
          renewalDate: end,
          expirationDate: end,
          updatedAt: now,
        })
        .where(eq(subscriptions.tenantId, tenantId));
      try {
        await createCycleInvoice({
          tenantId,
          plan: sub.plan,
          billingPeriod: period,
          customMonthlyPrice: sub.customMonthlyPrice,
          paymentMethod: "manual",
          status: "paid",
        });
      } catch (e) {
        console.error("[platform] renew invoice failed", e);
      }
    } else if (action === "cancel") {
      await db
        .update(subscriptions)
        .set({ status: "cancelled", autoRenew: false, updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));
    } else if (action === "reactivate") {
      const period = input.data.billingPeriod ?? sub.billingPeriod;
      const end = periodEnd(now, period);
      await db
        .update(subscriptions)
        .set({ status: "active", autoRenew: true, renewalDate: end, expirationDate: end, updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));
    } else if (action === "expire") {
      await db
        .update(subscriptions)
        .set({ status: "expired", updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));
    } else if (action === "toggle_renew") {
      await db
        .update(subscriptions)
        .set({ autoRenew: !sub.autoRenew, updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));
    }

    return NextResponse.json(ok({ tenantId, action }), { status: HttpStatus.Ok });
  });
}
