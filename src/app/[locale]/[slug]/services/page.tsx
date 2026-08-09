import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listTenantServicesForAdmin } from "@/modules/booking/domain/catalog";
import { ServicesManager } from "@/components/dashboard/services-manager";

export const dynamic = "force-dynamic";

export default async function ServicesPage({
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

  const theme = getThemeTokens(ctx.theme);
  const services = await listTenantServicesForAdmin(ctx.tenantId);

  return (
    <ServicesManager
      slug={slug}
      locale={locale}
      theme={theme}
      businessName={ctx.businessName}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.durationMinutes,
        price: String(s.price),
        active: s.active,
      }))}
    />
  );
}