/**
 * Platform (owner-only) plan catalog.
 *
 * Public names: Basic / AI Growth / Enterprise (Custom).
 * DB values:     pro  / ai        / enterprise (+ free = no subscription).
 *
 * Basic  = 800 EGP / month
 * AI     = 1200 EGP / month
 * Enterprise = custom monthly price YOU set per shop (stored on the
 * subscription row as `customMonthlyPrice`). All revenue math flows through
 * here so enterprise custom prices are calculated everywhere automatically.
 */

import type { BillingPeriod, SubscriptionPlan } from "@/db/schema";
import { BILLING_PERIOD_MONTHS } from "@/db/schema";

export const BASIC_MONTHLY_EGP = 800;
export const AI_MONTHLY_EGP = 1200;

export const BILLING_DISCOUNT: Record<BillingPeriod, number> = {
  monthly: 0,
  semiannual: 0.2,
  annual: 0.4,
};

export const BILLING_MONTHS: Record<BillingPeriod, number> = {
  ...BILLING_PERIOD_MONTHS,
};

export type PlatformPlan = "basic" | "ai" | "enterprise";
export type PaidDbPlan = Exclude<SubscriptionPlan, "free">;

export const DB_TO_PLATFORM: Record<PaidDbPlan, PlatformPlan> = {
  pro: "basic",
  ai: "ai",
  enterprise: "enterprise",
};

export const PLATFORM_TO_DB: Record<PlatformPlan, PaidDbPlan> = {
  basic: "pro",
  ai: "ai",
  enterprise: "enterprise",
};

export const PLATFORM_LABEL: Record<PlatformPlan | "free", string> = {
  basic: "Basic",
  ai: "AI Growth",
  enterprise: "Enterprise",
  free: "Free",
};

export function dbPlanLabel(plan: SubscriptionPlan): string {
  if (plan === "free") return "Free";
  return PLATFORM_LABEL[DB_TO_PLATFORM[plan as PaidDbPlan]] ?? plan;
}

/** Monthly list price before billing-period discount. */
export function monthlyListPrice(
  dbPlan: SubscriptionPlan,
  customMonthlyPrice?: number | string | null,
): number | null {
  if (dbPlan === "pro") return BASIC_MONTHLY_EGP;
  if (dbPlan === "ai") return AI_MONTHLY_EGP;
  if (dbPlan === "enterprise") {
    const v = Number(customMonthlyPrice ?? 0);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return 0;
}

/** Effective monthly price after billing-period discount. */
export function effectiveMonthlyPrice(
  dbPlan: SubscriptionPlan,
  billingPeriod: BillingPeriod,
  customMonthlyPrice?: number | string | null,
): number | null {
  const base = monthlyListPrice(dbPlan, customMonthlyPrice);
  if (base === null) return null;
  return Math.round(base * (1 - (BILLING_DISCOUNT[billingPeriod] ?? 0)));
}

/** Total invoice amount for one billing cycle. */
export function cycleTotal(
  dbPlan: SubscriptionPlan,
  billingPeriod: BillingPeriod,
  customMonthlyPrice?: number | string | null,
): number | null {
  const monthly = effectiveMonthlyPrice(dbPlan, billingPeriod, customMonthlyPrice);
  if (monthly === null) return null;
  return monthly * (BILLING_MONTHS[billingPeriod] ?? 1);
}

/** MRR contribution of one subscription row (0 when not revenue-generating). */
export function subscriptionMrr(args: {
  plan: SubscriptionPlan;
  status: string | null;
  billingPeriod: BillingPeriod | null;
  customMonthlyPrice?: number | string | null;
}): number {
  if (args.plan === "free") return 0;
  if (args.status === "cancelled" || args.status === "expired") return 0;
  const monthly = effectiveMonthlyPrice(
    args.plan,
    args.billingPeriod ?? "monthly",
    args.customMonthlyPrice,
  );
  return monthly ?? 0;
}

export function formatEGP(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("en-US")} EGP`;
}
