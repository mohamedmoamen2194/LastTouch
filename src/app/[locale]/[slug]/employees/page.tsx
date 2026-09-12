import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listTenantServicesForAdmin, listTenantTeam } from "@/modules/booking/domain/catalog";
import { EmployeesManager } from "@/components/dashboard/employees-manager";
import { LockedPage } from "@/components/dashboard/locked-page";
import { getMaxEmployeesForPlan, getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
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
  const sub = await getSubscriptionState(ctx.tenantId, { role: ctx.role });
  if (!sub.hasAccess) {
    return <LockedPage page="employees" slug={slug} theme={theme} />;
  }

  const [team, services] = await Promise.all([
    listTenantTeam(ctx.tenantId),
    listTenantServicesForAdmin(ctx.tenantId),
  ]);

  return (
    <EmployeesManager
      slug={slug}
      locale={locale}
      theme={theme}
      maxEmployees={getMaxEmployeesForPlan(ctx.subscriptionPlan)}
      businessName={ctx.businessName}
      employees={team.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        displayName: e.displayName,
        role: e.role,
        phone: e.phone,
        salary: e.salary ? String(e.salary) : null,
        bio: e.bio,
        rating: e.rating ? String(e.rating) : null,
        isGeneral: e.isGeneral,
        active: e.active,
        serviceIds: e.serviceIds,
        workingHours: e.workingHours,
      }))}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}