import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { getPlatformOverview, getRevenueDetail } from "@/lib/platform/stats";
import { formatEGP } from "@/lib/platform/plans";

/** Auth-gated: must render per request, never prerender. */
export const dynamic = "force-dynamic";

export default async function RevenuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const base = `/${locale}/platform`;
  const [o, r] = await Promise.all([getPlatformOverview(), getRevenueDetail()]);
  const maxBar = Math.max(1, ...r.monthly.map((m) => m.total));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="mt-1 text-sm text-gray-500">Everything you earned — MRR, collected invoices, top payers.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["MRR", formatEGP(o.mrr)],
          ["ARR", formatEGP(o.arr)],
          ["This month", formatEGP(r.thisMonth)],
          ["This year", formatEGP(r.thisYear)],
          ["All-time paid", formatEGP(r.allTime)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase text-gray-400">{k}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-500">Pending (unpaid) invoices: <b className="tabular-nums">{formatEGP(r.pending)}</b></p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <h2 className="mb-3 font-bold">Paid per month (12m)</h2>
          <div className="flex h-44 items-end gap-1.5">
            {r.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month}: ${formatEGP(m.total)}`}>
                <div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(4, (m.total / maxBar) * 150)}px`, opacity: m.total > 0 ? 1 : 0.15 }} />
                <span className="text-[9px] text-gray-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <h2 className="mb-3 font-bold">Top payers (all-time)</h2>
          <ul className="flex flex-col gap-2">
            {r.topPayers.map((t) => (
              <li key={t.tenantId} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <Link href={`${base}/tenants/${t.tenantId}`} className="truncate font-semibold text-blue-800 hover:underline">
                  {t.tenant?.businessName ?? "(deleted)"}
                </Link>
                <span className="shrink-0 font-bold tabular-nums">{formatEGP(t.total)}</span>
              </li>
            ))}
            {r.topPayers.length === 0 && <p className="text-sm text-gray-500">No paid invoices yet.</p>}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Latest invoices</h2>
          <Link href={`${base}/invoices`} className="text-xs font-semibold text-blue-700 hover:underline">Manage invoices →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="py-2 pe-3">Tenant</th>
                <th className="py-2 pe-3">Amount</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {r.invoices.slice(0, 20).map((inv) => (
                <tr key={inv.id} className="border-t border-black/5">
                  <td className="py-2 pe-3 font-semibold">{inv.tenant?.businessName ?? "(deleted)"}</td>
                  <td className="py-2 pe-3 font-bold tabular-nums">{formatEGP(inv.amount)}</td>
                  <td className="py-2 pe-3 text-xs">{inv.status}</td>
                  <td className="py-2 text-xs tabular-nums">{new Date(inv.issueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
