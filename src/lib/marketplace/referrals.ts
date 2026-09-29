import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientPointsLedger, clientProfiles, referrals, tenants } from "@/db/schema";
import { ConflictError } from "@/lib/errors";
import { ensureReferralCode, getClientProfile } from "@/lib/marketplace/client";

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

  const earned = rows.filter((r) => r.status === "earned");
  const balance = earned.reduce((a, r) => a + r.amount, 0);
  const totalEarnings = rows.reduce((a, r) => a + r.amount, 0);
  return {
    code: profile?.referralCode ?? null,
    balance,
    totalEarnings,
    referrals: rows.map((r) => ({
      id: r.id,
      businessName: r.businessName ?? "—",
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

/** Convert one earned referral (100 EGP) into 1000 loyalty points. */
export async function convertReferralToPoints(userId: string, referralId: string) {
  const [ref] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.id, referralId), eq(referrals.referrerUserId, userId)))
    .limit(1);
  if (!ref || ref.status !== "earned") throw new ConflictError("Referral is not available");
  await db
    .update(referrals)
    .set({ status: "converted", updatedAt: new Date() })
    .where(and(eq(referrals.id, referralId), eq(referrals.status, "earned")));
  await db
    .insert(clientPointsLedger)
    .values({ userId, amount: 1000, reason: "referral", refReferralId: referralId })
    .onConflictDoNothing();
  return { ok: true };
}

/** Request a cash payout for one earned referral (admin pays + marks paid). */
export async function requestReferralCash(userId: string, referralId: string) {
  const [ref] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.id, referralId), eq(referrals.referrerUserId, userId)))
    .limit(1);
  if (!ref || ref.status !== "earned") throw new ConflictError("Referral is not available");
  await db
    .update(referrals)
    .set({ status: "requested", updatedAt: new Date() })
    .where(and(eq(referrals.id, referralId), eq(referrals.status, "earned")));
  return { ok: true };
}
