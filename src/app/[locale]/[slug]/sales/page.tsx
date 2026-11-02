import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listProducts } from "@/modules/inventory/application/products";
import { listSales } from "@/modules/inventory/application/sales";
import { listCustomers } from "@/modules/crm/application/customers";
import { SalesManager } from "@/components/dashboard/sales-manager";
import { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  let ctx;
  try {
    ctx = await getDashboardAccess(slug);
  } catch {
    notFound();
  }
  if (!ctx.permissions.has(Permission["sales.read"])) notFound();

  const theme = getThemeTokens(ctx.theme);
  const [products, sales] = await Promise.all([listProducts(ctx), listSales(ctx)]);
  const customers = ctx.permissions.has(Permission["customers.read"]) ? await listCustomers(ctx, { limit: 100 }) : [];

  return (
    <SalesManager
      slug={slug}
      locale={locale}
      currency={ctx.currency}
      theme={theme}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        imageUrl: p.imageUrl,
        sellPrice: p.sellPrice,
        quantity: p.quantity,
        active: p.active,
      }))}
      customers={customers.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
        phone: c.phone,
      }))}
      sales={sales.map((s) => ({
        id: s.id,
        reference: s.reference,
        channel: s.channel,
        status: s.status,
        paymentMethod: s.paymentMethod,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        notes: s.notes,
        createdAt: s.createdAt.toISOString(),
        items: s.items.map((item) => ({
          id: item.id,
          productNameSnapshot: item.productNameSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      }))}
    />
  );
}
