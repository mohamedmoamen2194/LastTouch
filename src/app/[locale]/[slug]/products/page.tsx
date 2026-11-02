import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listProducts } from "@/modules/inventory/application/products";
import { ProductsManager } from "@/components/dashboard/products-manager";
import { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
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
  if (!ctx.permissions.has(Permission["inventory.read"])) notFound();

  const theme = getThemeTokens(ctx.theme);
  const products = await listProducts(ctx);

  return (
    <ProductsManager
      slug={slug}
      locale={locale}
      currency={ctx.currency}
      theme={theme}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        description: p.description,
        descriptionAr: p.descriptionAr,
        imageUrl: p.imageUrl,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        quantity: p.quantity,
        lowStockThreshold: p.lowStockThreshold,
        expiryDate: p.expiryDate ? p.expiryDate.toISOString() : null,
        listedOnline: p.listedOnline,
        active: p.active,
      }))}
    />
  );
}
