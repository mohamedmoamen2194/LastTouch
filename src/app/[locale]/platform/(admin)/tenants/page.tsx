import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, tenants } from "@/db/schema";
import { dbPlanLabel } from "@/lib/platform/plans";
import { TenantActions, TenantInlineEdit } from "@/components/platform/tenants-client";

/** Auth-gated: must render per request, never prerender. */
export const dynamic = "force-dynamic";

export default async function TenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; plan?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const base = `/${locale}/platform`;

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      businessName: tenants.businessName,
      businessType: tenants.businessType,
      plan: tenants.subscriptionPlan,
      phone: tenants.phone,
      email: tenants.email,
      active: tenants.active,
      createdAt: tenants.createdAt,
      subStatus: subscriptions.status,
      subPeriod: subscriptions.billingPeriod,
      subEnd: subscriptions.expirationDate,
      subRenew: subscriptions.renewalDate,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .orderBy(desc(tenants.createdAt))
    .limit(200);

  const q = (sp.q ?? "").toLowerCase();
  const planFilter = sp.plan ?? "";
  const filtered = rows.filter((r) => {
    if (planFilter && r.plan !== planFilter) return false;
    if (!q) return true;
    return (
      r.businessName.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Tenants ({filtered.length})</h1>
        <p className="mt-1 text-sm text-gray-500">See, edit, activate/deactivate, or delete anything.</p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name, slug, phone, email…"
          className="min-w-[220px] flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm"
        />
        <select name="plan" defaultValue={planFilter} className="mp-select rounded-full border border-gray-300 bg-white px-4 py-2 text-sm">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Basic (pro)</option>
          <option value="ai">AI Growth (ai)</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-gray-400">
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Plan / Status</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const end = r.subEnd ?? r.subRenew;
              return (
                <tr key={r.id} className="border-b border-black/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`${base}/tenants/${r.id}`} className="font-bold text-blue-800 hover:underline">
                      {r.businessName}
                    </Link>
                    <p className="text-xs text-gray-500">
                      /{r.slug} · {r.businessType}
                    </p>
                    <p className="text-[11px] text-gray-400">since {r.createdAt?.toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold">
                      {dbPlanLabel(r.plan as never)}
                    </span>
                    <p className="mt-1 text-xs text-gray-500">
                      {r.subStatus ?? "no sub"} · {r.subPeriod ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs">
                    {end ? new Date(end).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{r.phone ?? "—"}</p>
                    <p className="text-gray-500">{r.email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {r.active ? "active" : "off"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <TenantInlineEdit
                        id={r.id}
                        current={{ businessName: r.businessName, phone: r.phone, email: r.email }}
                      />
                      <TenantActions id={r.id} active={r.active} />
                    </div>
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
