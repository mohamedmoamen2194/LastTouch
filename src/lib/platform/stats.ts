import { and, count, desc, eq, gte, lte, sql, sum, inArray } from "drizzle-orm";
import { db } from "@/db";
import { invoices, subscriptions, tenants } from "@/db/schema";
import { subscriptionMrr } from "@/lib/platform/plans";

export type PlatformOverview = {
  totalTenants: number;
  activeTenants: number;
  activeSubs: number;
  trialSubs: number;
  expiredSubs: number;
  cancelledSubs: number;
  mrr: number;
  arr: number;
  collected: number;
  pending: number;
  newSubs30d: number;
  expiring7d: number;
  planBreakdown: Array<{ plan: string; count: number; mrr: number }>;
  revenueByMonth: Array<{ month: string; total: number }>;
  recentSubs: Array<{
    id: string;
    businessName: string;
    slug: string;
    plan: string;
    status: string | null;
    billingPeriod: string | null;
    renewalDate: Date | null;
    expirationDate: Date | null;
    createdAt: Date | null;
  }>;
  expiringSoon: Array<{
    tenantId: string;
    businessName: string;
    slug: string;
    plan: string;
    status: string | null;
    expirationDate: Date | null;
    daysLeft: number;
  }>;
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [tenantCount] = await db.select({ value: count() }).from(tenants);
  const [activeTenantCount] = await db
    .select({ value: count() })
    .from(tenants)
    .where(eq(tenants.active, true));

  const subRows = await db
    .select({
      id: subscriptions.id,
      tenantId: subscriptions.tenantId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      billingPeriod: subscriptions.billingPeriod,
      customMonthlyPrice: subscriptions.customMonthlyPrice,
      renewalDate: subscriptions.renewalDate,
      expirationDate: subscriptions.expirationDate,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions);

  const tenantRows = await db
    .select({ id: tenants.id, businessName: tenants.businessName, slug: tenants.slug })
    .from(tenants);
  const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

  const now = new Date();
  const ago30 = new Date(now);
  ago30.setDate(now.getDate() - 30);
  const in7 = new Date(now);
  in7.setDate(now.getDate() + 7);

  let mrr = 0;
  let activeSubs = 0;
  let trialSubs = 0;
  let expiredSubs = 0;
  let cancelledSubs = 0;
  let newSubs30d = 0;
  let expiring7d = 0;
  const planMap = new Map<string, { count: number; mrr: number }>();
  const expiringSoon: PlatformOverview["expiringSoon"] = [];

  for (const s of subRows) {
    const m = subscriptionMrr({
      plan: s.plan as never,
      status: s.status,
      billingPeriod: s.billingPeriod as never,
      customMonthlyPrice: s.customMonthlyPrice,
    });
    mrr += m;
    const entry = planMap.get(s.plan) ?? { count: 0, mrr: 0 };
    entry.count += 1;
    entry.mrr += m;
    planMap.set(s.plan, entry);

    if (s.status === "active") activeSubs += 1;
    if (s.status === "trial") trialSubs += 1;
    if (s.status === "expired") expiredSubs += 1;
    if (s.status === "cancelled") cancelledSubs += 1;
    if (s.createdAt && new Date(s.createdAt) >= ago30) newSubs30d += 1;

    const end = s.expirationDate ?? s.renewalDate;
    if (end) {
      const endDate = new Date(end);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000);
      if (s.status === "active" || s.status === "trial") {
        if (endDate >= now && endDate <= in7) expiring7d += 1;
        if (daysLeft >= 0 && daysLeft <= 14) {
          const t = tenantById.get(s.tenantId);
          if (t) {
            expiringSoon.push({
              tenantId: s.tenantId,
              businessName: t.businessName,
              slug: t.slug,
              plan: s.plan,
              status: s.status,
              expirationDate: endDate,
              daysLeft,
            });
          }
        }
      }
    }
  }
  expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  const recentSubs = [...subRows]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 10)
    .map((s) => {
      const t = tenantById.get(s.tenantId);
      return {
        id: s.id,
        businessName: t?.businessName ?? "(deleted tenant)",
        slug: t?.slug ?? "—",
        plan: s.plan,
        status: s.status,
        billingPeriod: s.billingPeriod,
        renewalDate: s.renewalDate ? new Date(s.renewalDate) : null,
        expirationDate: s.expirationDate ? new Date(s.expirationDate) : null,
        createdAt: s.createdAt ? new Date(s.createdAt) : null,
      };
    });

  // Revenue from invoices: collected = paid, pending = pending/partial.
  const [collectedRow] = await db
    .select({ value: sum(invoices.amount) })
    .from(invoices)
    .where(eq(invoices.status, "paid"));
  const [pendingRow] = await db
    .select({ value: sum(invoices.amount) })
    .from(invoices)
    .where(inArray(invoices.status, ["pending", "partial"]));

  // Last 12 months of paid invoices.
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const paidRows = await db
    .select({ amount: invoices.amount, issueDate: invoices.issueDate })
    .from(invoices)
    .where(and(eq(invoices.status, "paid"), gte(invoices.issueDate, yearAgo)));
  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  for (const r of paidRows) {
    const d = new Date(r.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount ?? 0));
  }
  const revenueByMonth = [...buckets.entries()].map(([month, total]) => ({ month, total }));

  return {
    totalTenants: tenantCount?.value ?? 0,
    activeTenants: activeTenantCount?.value ?? 0,
    activeSubs,
    trialSubs,
    expiredSubs,
    cancelledSubs,
    mrr,
    arr: mrr * 12,
    collected: Number(collectedRow?.value ?? 0),
    pending: Number(pendingRow?.value ?? 0),
    newSubs30d,
    expiring7d,
    planBreakdown: [...planMap.entries()].map(([plan, v]) => ({ plan, ...v })),
    revenueByMonth,
    recentSubs,
    expiringSoon: expiringSoon.slice(0, 10),
  };
}

export async function getRevenueDetail() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const invRows = await db
    .select({
      id: invoices.id,
      tenantId: invoices.tenantId,
      invoiceNumber: invoices.invoiceNumber,
      plan: invoices.plan,
      amount: invoices.amount,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .orderBy(desc(invoices.issueDate))
    .limit(500);

  const tenantRows = await db
    .select({ id: tenants.id, businessName: tenants.businessName, slug: tenants.slug })
    .from(tenants);
  const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

  const paid = invRows.filter((r) => r.status === "paid");
  const sumPaid = (rows: typeof invRows) => rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);

  const thisMonth = sumPaid(paid.filter((r) => new Date(r.issueDate) >= startOfMonth));
  const thisYear = sumPaid(paid.filter((r) => new Date(r.issueDate) >= startOfYear));
  const allTime = sumPaid(paid);
  const pending = invRows
    .filter((r) => r.status === "pending" || r.status === "partial")
    .reduce((a, r) => a + Number(r.amount ?? 0), 0);

  // Top payers
  const byTenant = new Map<string, number>();
  for (const r of paid) byTenant.set(r.tenantId, (byTenant.get(r.tenantId) ?? 0) + Number(r.amount ?? 0));
  const topPayers = [...byTenant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tenantId, total]) => ({ tenantId, total, tenant: tenantById.get(tenantId) ?? null }));

  // Monthly buckets (12m)
  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  for (const r of paid) {
    const d = new Date(r.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount ?? 0));
  }

  return {
    thisMonth,
    thisYear,
    allTime,
    pending,
    topPayers,
    monthly: [...buckets.entries()].map(([month, total]) => ({ month, total })),
    invoices: invRows.slice(0, 100).map((r) => ({
      ...r,
      amount: Number(r.amount ?? 0),
      tenant: tenantById.get(r.tenantId) ?? null,
    })),
  };
}
