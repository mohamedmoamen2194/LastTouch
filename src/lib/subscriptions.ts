import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  BILLING_PERIOD_MONTHS,
  subscriptions,
  tenants,
  type BillingPeriod,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/db/schema";

export const REMINDER_DAYS = 5;

export type PaidPlan = Exclude<SubscriptionPlan, "free">;

export type SubscriptionBanner = "none" | "ending_soon" | "expired" | "unsubscribed";

export type SubscriptionState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  billingPeriod: BillingPeriod | null;
  /** Full dashboard access (stats + management). */
  hasAccess: boolean;
  banner: SubscriptionBanner;
  daysLeft: number | null;
  endDate: Date | null;
  isOwner: boolean;
};

/**
 * Single source of truth for subscription gating.
 * - plan "free" (or missing row) → locked, "choose a plan" experience.
 * - paid plan + valid dates → full access.
 * - ≤5 days left (active/trial/grace) → full access + ending-soon reminder.
 * - past expiration / cancelled → locked + warm "come back" experience.
 */
export async function getSubscriptionState(
  tenantId: string,
  opts?: { role?: string },
): Promise<SubscriptionState> {
  const [tenant] = await db
    .select({ plan: tenants.subscriptionPlan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const plan = tenant?.plan ?? "free";
  const isOwner = opts?.role === "owner";
  const base: SubscriptionState = {
    plan,
    status: sub?.status ?? null,
    billingPeriod: sub?.billingPeriod ?? null,
    hasAccess: false,
    banner: "unsubscribed",
    daysLeft: null,
    endDate: null,
    isOwner,
  };

  if (plan === "free" || !sub) return base;

  const end = sub.expirationDate ?? sub.renewalDate ?? sub.trialEnd ?? null;
  if (!end) return { ...base, hasAccess: true, banner: "none", endDate: null };

  const endDate = new Date(end);
  const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (sub.status === "cancelled" || daysLeft < 0 || sub.status === "expired") {
    return { ...base, hasAccess: false, banner: "expired", daysLeft: Math.max(daysLeft, 0), endDate };
  }

  if (daysLeft <= REMINDER_DAYS) {
    return { ...base, hasAccess: true, banner: "ending_soon", daysLeft, endDate };
  }

  return { ...base, hasAccess: true, banner: "none", daysLeft, endDate };
}

export function periodEnd(from: Date, period: BillingPeriod): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + BILLING_PERIOD_MONTHS[period]);
  return d;
}
