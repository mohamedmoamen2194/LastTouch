import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles, referrals, tenants } from "@/db/schema";
import { getPlatformOverview } from "@/lib/platform/stats";
import { dbPlanLabel, formatEGP } from "@/lib/platform/plans";
import { ReferralPayoutPopup } from "@/components/platform/referrals-client";

/** Auth-gated: must render per request, never prerender. */
export const dynamic = "force-dynamic";

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default async function PlatformOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const o = await getPlatformOverview();
  const base = `/${locale}/platform`;
  const maxBar = Math.max(1, ...o.revenueByMonth.map((r) => r.total));

  const payoutRows = await db
    .select({
      id: referrals.id,
      amount: referrals.amount,
      createdAt: referrals.createdAt,
      businessName: tenants.businessName,
      userName: clientProfiles.fullName,
      userPhone: clientProfiles.phone,
      userEmail: clientProfiles.email,
    })
    .from(referrals)
    .leftJoin(tenants, eq(tenants.id, referrals.tenantId))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, referrals.referrerUserId))
    .where(eq(referrals.status, "requested"))
    .orderBy(desc(referrals.createdAt))
    .limit(20);
  const payoutTotal = payoutRows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Platform overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Who subscribed, when it ends, and every pound of revenue — live from your database.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="MRR" value={formatEGP(o.mrr)} sub={`ARR ${formatEGP(o.arr)}`} />
        <Card label="Collected (paid)" value={formatEGP(o.collected)} sub="Sum of paid invoices" />
        <Card label="Pending" value={formatEGP(o.pending)} sub="Unpaid invoices" />
        <Card label="Active subs" value={String(o.activeSubs)} sub={`${o.totalTenants} tenants · ${o.activeTenants} active`} />
        <Card label="New subs (30d)" value={String(o.newSubs30d)} sub="Created in last 30 days" />
        <Card label="Expiring (7d)" value={String(o.expiring7d)} sub="Needs renewal attention" />
        <Card label="Trial" value={String(o.trialSubs)} sub={`Expired ${o.expiredSubs} · Cancelled ${o.cancelledSubs}`} />
        <Card label="Plans" value={o.planBreakdown.map((p) => `${dbPlanLabel(p.plan as never)}:${p.count}`).join(" · ") || "—"} sub="count per plan" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Revenue — last 12 months (paid invoices)</h2>
            <Link href={`${base}/revenue`} className="text-xs font-semibold text-blue-700 hover:underline">
              Full revenue →
            </Link>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {o.revenueByMonth.map((r) => (
              <div key={r.month} className="flex flex-1 flex-col items-center gap-1" title={`${r.month}: ${formatEGP(r.total)}`}>
                <div
                  className="w-full rounded-t bg-[#0b1526]"
                  style={{ height: `${Math.max(4, (r.total / maxBar) * 140)}px`, opacity: r.total > 0 ? 1 : 0.15 }}
                />
                <span className="text-[9px] text-gray-400">{r.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Expiring soon (14d)</h2>
            <Link href={`${base}/subscriptions`} className="text-xs font-semibold text-blue-700 hover:underline">
              All subscriptions →
            </Link>
          </div>
          {o.expiringSoon.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing expiring in the next 14 days.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {o.expiringSoon.map((e) => (
                <li key={e.tenantId} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.businessName}</p>
                    <p className="text-xs text-gray-500">
                      {dbPlanLabel(e.plan as never)} · {e.status} · ends {e.expirationDate?.toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      e.daysLeft <= 3 ? "bg-red-100 text-red-700" : e.daysLeft <= 7 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {e.daysLeft}d left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">
            Referrals — cash requests{" "}
            <span className="text-sm font-medium text-gray-400">
              ({payoutRows.length} · {formatEGP(payoutTotal)})
            </span>
          </h2>
        </div>
        {payoutRows.length === 0 ? (
          <p className="text-sm text-gray-500">No pending cash-out requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400">
                  <th className="py-2 pe-3">User</th>
                  <th className="py-2 pe-3">Phone</th>
                  <th className="py-2 pe-3">Store referred</th>
                  <th className="py-2 pe-3">Amount</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {payoutRows.map((r) => (
                  <tr key={r.id} className="border-t border-black/5">
                    <td className="py-2 pe-3">
                      <ReferralPayoutPopup
                        row={{
                          id: r.id,
                          businessName: r.businessName ?? "—",
                          amount: r.amount,
                          createdAt: new Date(r.createdAt).toISOString(),
                          user: {
                            name: r.userName ?? "(no name)",
                            phone: r.userPhone,
                            email: r.userEmail,
                          },
                        }}
                      />
                    </td>
                    <td className="py-2 pe-3 tabular-nums" dir="ltr">{r.userPhone ?? "—"}</td>
                    <td className="py-2 pe-3">{r.businessName ?? "—"}</td>
                    <td className="py-2 pe-3 font-bold tabular-nums">{formatEGP(r.amount)}</td>
                    <td className="py-2 tabular-nums">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Newest subscriptions</h2>
          <Link href={`${base}/tenants`} className="text-xs font-semibold text-blue-700 hover:underline">
            All tenants →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="py-2 pe-3">Business</th>
                <th className="py-2 pe-3">Plan</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2 pe-3">Period</th>
                <th className="py-2 pe-3">Ends</th>
                <th className="py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {o.recentSubs.map((s) => (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="py-2 pe-3 font-semibold">{s.businessName}</td>
                  <td className="py-2 pe-3">{dbPlanLabel(s.plan as never)}</td>
                  <td className="py-2 pe-3">{s.status ?? "—"}</td>
                  <td className="py-2 pe-3">{s.billingPeriod ?? "—"}</td>
                  <td className="py-2 pe-3 tabular-nums">
                    {(s.expirationDate ?? s.renewalDate)?.toLocaleDateString() ?? "—"}
                  </td>
                  <td className="py-2 tabular-nums">{s.createdAt?.toLocaleDateString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
