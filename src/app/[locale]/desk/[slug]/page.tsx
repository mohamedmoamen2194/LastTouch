import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, PackagePlus, ShoppingBag, Users } from "lucide-react";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listAppointments } from "@/modules/appointments/application/appointments";
import { formatMoney } from "@/lib/utils";
import { AppointmentList } from "@/components/dashboard/appointment-list";
import { AppointmentCreator } from "@/components/dashboard/appointment-creator";
import { listTenantServicesForAdmin, listTenantTeam } from "@/modules/booking/domain/catalog";
import { Permission } from "@/lib/permissions";
import { LockedPage } from "@/components/dashboard/locked-page";
import { getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function DeskPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  let ctx;
  try {
    ctx = await getDashboardAccess(slug);
  } catch {
    notFound();
  }
  const theme = getThemeTokens(ctx.theme);
  const sub = await getSubscriptionState(ctx.tenantId, { role: ctx.role });
  if (!sub.hasAccess) return <LockedPage page="appointments" slug={slug} theme={theme} />;

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [rows, svcRows, team] = await Promise.all([
    listAppointments(ctx, { from: iso, to: iso }),
    listTenantServicesForAdmin(ctx.tenantId),
    listTenantTeam(ctx.tenantId),
  ]);
  const catalogServices = svcRows
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.name, homeVisit: s.homeVisit, durationMinutes: s.durationMinutes, price: String(s.price) }));
  const creatorEmployees = team
    .filter((e) => e.active && e.isBookable)
    .map((e) => ({ id: e.id, name: e.displayName ?? `${e.firstName}${e.lastName ? " " + e.lastName : ""}`, homeVisit: e.homeVisit }));
  const cards = rows.map((r) => ({ ...r, price: formatMoney(r.price, "EGP", locale) }));

  const quickLinks = [
    { href: `/${locale}/${slug}/appointments`, label: "Appointments", icon: CalendarDays },
    { href: `/${locale}/${slug}/customers`, label: "Customers", icon: Users },
    { href: `/${locale}/${slug}/products`, label: "Products", icon: ShoppingBag },
    { href: `/${locale}/${slug}/sales`, label: "New sale", icon: PackagePlus },
  ];

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>
          Front desk
        </h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {ctx.businessName} · {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: ctx.timezone }).format(today)}
        </p>
      </div>

      <AppointmentCreator
        slug={slug}
        theme={theme}
        services={catalogServices}
        employees={creatorEmployees}
        canCreate={ctx.permissions.has(Permission["appointments.create"])}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold sm:text-sm"
              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
              {link.label}
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold" style={{ color: theme.primary }}>
          Today&apos;s appointments
        </h2>
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
            {t("noData")}
          </div>
        ) : (
          <AppointmentList rows={cards} slug={slug} theme={theme} />
        )}
      </div>
    </div>
  );
}
