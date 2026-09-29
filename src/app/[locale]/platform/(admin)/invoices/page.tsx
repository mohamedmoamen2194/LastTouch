import { setRequestLocale } from "next-intl/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { invoices, tenants } from "@/db/schema";
import { formatEGP } from "@/lib/platform/plans";
import { ManualInvoiceClient } from "@/components/platform/invoices-client";

import { InvoiceRowActions } from "@/components/platform/admin-forms";

/** Auth-gated: must render per request, never prerender. */
export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const invRows = await db.select().from(invoices).orderBy(desc(invoices.issueDate)).limit(300);
  const tenantRows = await db.select({ id: tenants.id, businessName: tenants.businessName }).from(tenants);
  const tenantById = new Map(tenantRows.map((t) => [t.id, t.businessName]));

  // Tenants for the "new invoice" picker
  const allTenants = await db
    .select({ id: tenants.id, businessName: tenants.businessName })
    .from(tenants)
    .orderBy(tenants.businessName)
    .limit(300);

  const q = (sp.q ?? "").toLowerCase();
  const filtered = invRows.filter((r) => {
    if (sp.status && r.status !== sp.status) return false;
    if (!q) return true;
    return (
      r.invoiceNumber.toLowerCase().includes(q) ||
      (tenantById.get(r.tenantId) ?? "").toLowerCase().includes(q)
    );
  });

  const paid = filtered.filter((r) => r.status === "paid").reduce((a, r) => a + Number(r.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Invoices ({filtered.length})</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paid in view: <b className="tabular-nums">{formatEGP(paid)}</b> · add manual payments, fix statuses.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search number or tenant…" className="min-w-[200px] flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="mp-select rounded-full border border-gray-300 bg-white px-4 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="paid">paid</option>
          <option value="pending">pending</option>
          <option value="partial">partial</option>
          <option value="failed">failed</option>
        </select>
        <button className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-gray-400">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{r.invoiceNumber}<p className="font-sans text-[11px] text-gray-400">{r.plan}</p></td>
                <td className="px-4 py-2.5 font-semibold">{tenantById.get(r.tenantId) ?? "(deleted)"}</td>
                <td className="px-4 py-2.5 font-bold tabular-nums">{formatEGP(Number(r.amount ?? 0))}</td>
                <td className="px-4 py-2.5 text-xs">{r.status}</td>
                <td className="px-4 py-2.5 text-xs">{r.paymentMethod ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums">{new Date(r.issueDate).toLocaleDateString()}</td>
                <td className="px-4 py-2.5">
                    <InvoiceRowActions id={r.id} status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <h2 className="mb-2 font-bold">New manual invoice</h2>
        <p className="mb-3 text-xs text-gray-500">Cash / Instapay / custom enterprise top-ups — counts toward revenue immediately when marked paid.</p>
        <ManualInvoiceClient tenants={allTenants} />
      </div>
    </div>
  );
}
