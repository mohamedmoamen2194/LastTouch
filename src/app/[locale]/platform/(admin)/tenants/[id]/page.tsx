import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { eq, desc, count } from "drizzle-orm";
import { db } from "@/db";
import { appointments, customers, employees, invoices, memberships, subscriptions, tenants } from "@/db/schema";
import { dbPlanLabel, formatEGP, subscriptionMrr } from "@/lib/platform/plans";
import { InvoiceCreator, InvoiceRowActions, SubscriptionEditor } from "@/components/platform/admin-forms";
import { TenantActions } from "@/components/platform/tenants-client";
import { ReopenAppointmentButton } from "@/components/platform/appointment-actions";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const base = `/${locale}/platform`;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, id)).limit(1);
  const invRows = await db.select().from(invoices).where(eq(invoices.tenantId, id)).orderBy(desc(invoices.issueDate)).limit(50);
  const [custCount] = await db.select({ value: count() }).from(customers).where(eq(customers.tenantId, id));
  const [apptCount] = await db.select({ value: count() }).from(appointments).where(eq(appointments.tenantId, id));
  const [empCount] = await db.select({ value: count() }).from(employees).where(eq(employees.tenantId, id));
  const memberRows = await db.select().from(memberships).where(eq(memberships.tenantId, id)).limit(20);
  const recentAppts = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      appointmentDate: appointments.appointmentDate,
      status: appointments.status,
      price: appointments.price,
    })
    .from(appointments)
    .where(eq(appointments.tenantId, id))
    .orderBy(desc(appointments.appointmentDate))
    .limit(15);

  const paidTotal = invRows.filter((r) => r.status === "paid").reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const mrr = sub
    ? subscriptionMrr({ plan: sub.plan as never, status: sub.status, billingPeriod: sub.billingPeriod as never, customMonthlyPrice: sub.customMonthlyPrice })
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/tenants`} className="text-xs font-semibold text-blue-700 hover:underline">
        ← All tenants
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tenant.businessName}</h1>
          <p className="text-sm text-gray-500">
            /{tenant.slug} · {tenant.businessType} · {tenant.phone ?? "no phone"} · {tenant.email ?? "no email"}
          </p>
        </div>
        <TenantActions id={tenant.id} active={tenant.active} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Plan", dbPlanLabel(tenant.subscriptionPlan as never)],
          ["MRR", formatEGP(mrr)],
          ["Paid total", formatEGP(paidTotal)],
          ["Customers", String(custCount?.value ?? 0)],
          ["Appointments", String(apptCount?.value ?? 0)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-400">{k}</p>
            <p className="mt-0.5 font-bold">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Subscription — edit anything</h2>
        <SubscriptionEditor
          tenantId={tenant.id}
          initial={{
            plan: sub?.plan ?? tenant.subscriptionPlan ?? "free",
            billingPeriod: sub?.billingPeriod ?? "monthly",
            status: sub?.status ?? "active",
            customMonthlyPrice: (sub?.customMonthlyPrice as string | null) ?? null,
            notes: (sub as { notes?: string | null } | undefined)?.notes ?? null,
            renewalDate: sub?.renewalDate ? new Date(sub.renewalDate).toISOString() : null,
            expirationDate: sub?.expirationDate ? new Date(sub.expirationDate).toISOString() : null,
          }}
        />
        {sub && (
          <p className="mt-2 text-xs text-gray-500">
            Started {sub.startedAt ? new Date(sub.startedAt).toLocaleString() : "—"} · Ends{" "}
            {(sub.expirationDate ?? sub.renewalDate) ? new Date((sub.expirationDate ?? sub.renewalDate) as Date).toLocaleString() : "—"} · Auto-renew{" "}
            {sub.autoRenew ? "on" : "off"} · Team seats: {empCount?.value ?? 0}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Invoices ({invRows.length}) — {formatEGP(paidTotal)} paid</h2>
        <div className="mb-3">
          <InvoiceCreator tenantId={tenant.id} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="py-2 pe-3">Number</th>
                <th className="py-2 pe-3">Plan</th>
                <th className="py-2 pe-3">Amount</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2 pe-3">Issued</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invRows.map((r) => (
                <tr key={r.id} className="border-t border-black/5">
                  <td className="py-2 pe-3 font-mono text-xs">{r.invoiceNumber}</td>
                  <td className="py-2 pe-3 text-xs">{r.plan}</td>
                  <td className="py-2 pe-3 font-bold tabular-nums">{formatEGP(Number(r.amount ?? 0))}</td>
                  <td className="py-2 pe-3 text-xs">{r.status}</td>
                  <td className="py-2 pe-3 text-xs tabular-nums">{new Date(r.issueDate).toLocaleDateString()}</td>
                  <td className="py-2">
                    <InvoiceRowActions id={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invRows.length === 0 && <p className="py-3 text-sm text-gray-500">No invoices yet — save the subscription with invoice, or add one manually above.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-bold">Recent appointments ({recentAppts.length})</h2>
        <p className="mb-2 text-xs text-gray-500">Rescue only: reopen a mistakenly completed booking (removes its points).</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="py-2 pe-3">Date</th>
                <th className="py-2 pe-3">Time</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2 pe-3">Price</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentAppts.map((a) => (
                <tr key={a.id} className="border-t border-black/5">
                  <td className="py-2 pe-3 text-xs tabular-nums">{new Date(a.appointmentDate).toLocaleDateString()}</td>
                  <td className="py-2 pe-3 text-xs tabular-nums"><span dir="ltr">{a.startTime}–{a.endTime}</span></td>
                  <td className="py-2 pe-3 text-xs">{a.status}</td>
                  <td className="py-2 pe-3 text-xs tabular-nums">{formatEGP(Number(a.price ?? 0))}</td>
                  <td className="py-2">{a.status === "completed" && <ReopenAppointmentButton appointmentId={a.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentAppts.length === 0 && <p className="py-3 text-sm text-gray-500">No appointments yet.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-bold">Members ({memberRows.length})</h2>
        <ul className="text-sm">
          {memberRows.map((m) => (
            <li key={m.id} className="flex justify-between border-b border-black/5 py-1.5 last:border-0">
              <span className="font-mono text-xs">{m.userId}</span>
              <span className="text-xs text-gray-500">{m.role} · {m.active ? "active" : "off"}</span>
            </li>
          ))}
          {memberRows.length === 0 && <p className="text-sm text-gray-500">No members.</p>}
        </ul>
      </div>
    </div>
  );
}
