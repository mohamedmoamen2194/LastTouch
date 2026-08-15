import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listTenantServicesForAdmin } from "@/modules/booking/domain/catalog";
import { listTenantPackages } from "@/modules/booking/application/packages";
import { ServicesManager } from "@/components/dashboard/services-manager";
import { PackagesManager } from "@/components/dashboard/packages-manager";

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
  const [services, packages] = await Promise.all([
    listTenantServicesForAdmin(ctx.tenantId),
    listTenantPackages(ctx),
  ]);

  const serviceRefs = services.map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return (
    <div className="space-y-10 md:space-y-12">
      <PackagesManager
        slug={slug}
        locale={locale}
        theme={theme}
        packages={packages}
        services={serviceRefs}
      />

      <div className="border-t" style={{ borderColor: theme.outlineVariant }} />

      <ServicesManager
        slug={slug}
        locale={locale}
        theme={theme}
        businessName={ctx.businessName}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          nameAr: s.nameAr ?? null,
          description: s.description,
          descriptionAr: s.descriptionAr ?? null,
          durationMinutes: s.durationMinutes,
          price: String(s.price),
          active: s.active,
        }))}
      />
    </div>
  );
}