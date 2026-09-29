import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, tenants } from "@/db/schema";
import { dbPlanLabel, formatEGP, subscriptionMrr } from "@/lib/platform/plans";
import { SubQuickActions } from "@/components/platform/subs-client";

/** Auth-gated: must render per request, never prerender. */
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; plan?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const base = `/${locale}/platform`;

  const rows = await db
    .select({
      tenantId: subscriptions.tenantId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      billingPeriod: subscriptions.billingPeriod,
      customMonthlyPrice: subscriptions.customMonthlyPrice,
      startedAt: subscriptions.startedAt,
      renewalDate: subscriptions.renewalDate,
      expirationDate: subscriptions.expirationDate,
      autoRenew: subscriptions.autoRenew,
      businessName: tenants.businessName,
      slug: tenants.slug,
    })
    .from(subscriptions)
    .leftJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(300);

  const now = new Date();
  const filtered = rows.filter((r) => {
    if (sp.status && r.status !== sp.status) return false;
    if (sp.plan && r.plan !== sp.plan) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Subscriptions ({filtered.length})</h1>
        <p className="mt-1 text-sm text-gray-500">Who subscribed, when it ends, quick renew / extend / cancel.</p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="mp-select rounded-full border border-gray-300 bg-white px-4 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="trial">trial</option>
          <option value="grace">grace</option>
          <option value="expired">expired</option>
          <option value="cancelled">cancelled</option>
        </select>
        <select name="plan" defaultValue={sp.plan ?? ""} className="mp-select rounded-full border border-gray-300 bg-white px-4 py-2 text-sm">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Basic (pro)</option>
          <option value="ai">AI Growth (ai)</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-gray-400">
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">MRR</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Left</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const end = r.expirationDate ?? r.renewalDate;
              const daysLeft = end ? Math.ceil((new Date(end).getTime() - now.getTime()) / 86_400_000) : null;
              const mrr = subscriptionMrr({
                plan: r.plan as never,
                status: r.status,
                billingPeriod: r.billingPeriod as never,
                customMonthlyPrice: r.customMonthlyPrice,
              });
              return (
                <tr key={r.tenantId} className="border-b border-black/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`${base}/tenants/${r.tenantId}`} className="font-bold text-blue-800 hover:underline">
                      {r.businessName ?? "(deleted)"}
                    </Link>
                    <p className="text-xs text-gray-500">/{r.slug ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold">{dbPlanLabel(r.plan as never)}</span>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {r.billingPeriod}{r.plan === "enterprise" ? ` · ${formatEGP(Number(r.customMonthlyPrice ?? 0))}/mo` : ""}
                      {r.autoRenew ? "" : " · no-renew"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.status}</td>
                  <td className="px-4 py-3 text-xs font-bold tabular-nums">{formatEGP(mrr)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.startedAt ? new Date(r.startedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{end ? new Date(end).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    {daysLeft === null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${daysLeft < 0 ? "bg-red-100 text-red-700" : daysLeft <= 7 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                        {daysLeft}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SubQuickActions tenantId={r.tenantId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
