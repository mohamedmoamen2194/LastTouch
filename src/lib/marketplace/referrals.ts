import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientPointsLedger, referrals, subscriptions, tenants } from "@/db/schema";
import { ConflictError } from "@/lib/errors";
import { ensureReferralCode, getClientProfile } from "@/lib/marketplace/client";

/**
 * Paid plans that unlock a referral prize: Basic 800 (db "pro"),
 * AI Growth 1200 (db "ai") and custom Enterprise (db "enterprise").
 */
const PRIZE_PLANS = ["pro", "ai", "enterprise"] as const;

/**
 * True when the referred store holds an active paid subscription, i.e. the
 * referrer's prize is unlocked and can be claimed as points or cash.
 */
export async function isReferralPrizeUnlocked(tenantId: string): Promise<boolean> {
  const [tenant] = await db
    .select({ plan: tenants.subscriptionPlan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant || !(PRIZE_PLANS as readonly string[]).includes(tenant.plan)) return false;
  const [sub] = await db
    .select({
      status: subscriptions.status,
      renewalDate: subscriptions.renewalDate,
      expirationDate: subscriptions.expirationDate,
      trialEnd: subscriptions.trialEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trial" && sub.status !== "grace") return false;
  const end = sub.expirationDate ?? sub.renewalDate ?? sub.trialEnd ?? null;
  if (end && new Date(end).getTime() < Date.now()) return false;
  return true;
}

/**
 * Flip a store's pending referrals to earned once it holds a paid plan.
 * Safe to call after any subscription change — no-ops when ineligible.
 * Returns true when the store is eligible (prize unlocked).
 */
export async function unlockReferralsForTenant(tenantId: string): Promise<boolean> {
  if (!(await isReferralPrizeUnlocked(tenantId))) return false;
  await db
    .update(referrals)
    .set({ status: "earned", updatedAt: new Date() })
    .where(and(eq(referrals.tenantId, tenantId), eq(referrals.status, "pending")));
  return true;
}

/** Referral row enriched for the account popup. */
export async function getReferralStats(userId: string) {
  await ensureReferralCode(userId);
  const profile = await getClientProfile(userId);
  const rows = await db
    .select({
      id: referrals.id,
      tenantId: referrals.tenantId,
      amount: referrals.amount,
      status: referrals.status,
      createdAt: referrals.createdAt,
      businessName: tenants.businessName,
    })
    .from(referrals)
    .leftJoin(tenants, eq(tenants.id, referrals.tenantId))
    .where(eq(referrals.referrerUserId, userId))
    .orderBy(desc(referrals.createdAt));

  // Self-heal on read: a referred store may have activated its paid plan
  // since the last check — unlock its referrals before reporting stats.
  // Distinct tenants unlock concurrently (one batch, not one round-trip
  // per referral row).
  const pendingTenantIds = [...new Set(rows.filter((r) => r.status === "pending").map((r) => r.tenantId))];
  const unlockedTenantIds = new Set<string>();
  await Promise.all(
    pendingTenantIds.map(async (tenantId) => {
      try {
        if (await unlockReferralsForTenant(tenantId)) unlockedTenantIds.add(tenantId);
      } catch {
        // Never block stats on an unlock failure.
      }
    }),
  );
  const visible = rows.map((r) => ({
    ...r,
    status: r.status === "pending" && unlockedTenantIds.has(r.tenantId) ? "earned" : r.status,
  }));

  const earned = visible.filter((r) => r.status === "earned");
  const balance = earned.reduce((a, r) => a + r.amount, 0);
  // Pending referrals are not earnings yet — the prize unlocks with the
  // store's paid plan.
  const totalEarnings = visible
    .filter((r) => r.status !== "pending")
    .reduce((a, r) => a + r.amount, 0);
  return {
    code: profile?.referralCode ?? null,
    balance,
    totalEarnings,
    referrals: visible.map((r) => ({
      id: r.id,
      businessName: r.businessName ?? "—",
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

/** Resolve a referral for claiming; self-heals a pending row whose store just subscribed. */
async function getClaimableReferral(userId: string, referralId: string) {
  const [ref] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.id, referralId), eq(referrals.referrerUserId, userId)))
    .limit(1);
  if (!ref) throw new ConflictError("Referral is not available");
  if (ref.status === "pending") {
    try {
      await unlockReferralsForTenant(ref.tenantId);
    } catch {
      // fall through to the status check below
    }
    const [fresh] = await db
      .select()
      .from(referrals)
      .where(and(eq(referrals.id, referralId), eq(referrals.referrerUserId, userId)))
      .limit(1);
    if (!fresh || fresh.status === "pending") {
      throw new ConflictError("Prize unlocks when the store activates a paid plan");
    }
    if (fresh.status !== "earned") throw new ConflictError("Referral is not available");
    return fresh;
  }
  if (ref.status !== "earned") throw new ConflictError("Referral is not available");
  return ref;
}

/** Convert one earned referral (100 EGP) into 1000 loyalty points. Atomic: exactly one claim wins. */
export async function convertReferralToPoints(userId: string, referralId: string) {
  await getClaimableReferral(userId, referralId);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(referrals)
      .set({ status: "converted", updatedAt: new Date() })
      .where(and(eq(referrals.id, referralId), eq(referrals.status, "earned")))
      .returning({ id: referrals.id });
    if (updated.length === 0) throw new ConflictError("Referral is not available");
    await tx
      .insert(clientPointsLedger)
      .values({ userId, amount: 1000, reason: "referral", refReferralId: referralId })
      .onConflictDoNothing();
  });
  return { ok: true };
}

/** Request a cash payout for one earned referral (admin pays + marks paid). Atomic: exactly one claim wins. */
export async function requestReferralCash(userId: string, referralId: string) {
  await getClaimableReferral(userId, referralId);
  const updated = await db
    .update(referrals)
    .set({ status: "requested", updatedAt: new Date() })
    .where(and(eq(referrals.id, referralId), eq(referrals.status, "earned")))
    .returning({ id: referrals.id });
  if (updated.length === 0) throw new ConflictError("Referral is not available");
  return { ok: true };
}
