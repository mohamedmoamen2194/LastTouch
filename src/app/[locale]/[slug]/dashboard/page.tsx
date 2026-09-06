import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { getDashboardStats } from "@/modules/analytics/application/dashboard";
import { getBookingFlow } from "@/modules/analytics/application/flow";
import { BookingFlowChart } from "@/components/dashboard/booking-flow-chart";
import { SubscriptionPlans } from "@/components/dashboard/subscription-plans";
import { getSubscriptionState } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const ts = await getTranslations("subscription");

  let ctx;
  try {
    ctx = await getDashboardAccess(slug);
  } catch {
    notFound();
  }

  const theme = getThemeTokens(ctx.theme);
  const sub = await getSubscriptionState(ctx.tenantId, { role: ctx.role });

  // No active subscription (or expired) → plans + warm message instead of data.
  if (!sub.hasAccess) {
    const expired = sub.banner === "expired";
    return (
      <div className="space-y-6 md:space-y-8">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("welcome")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{ctx.businessName}</p>
        </div>

        <div
          className="rounded-2xl border px-5 py-6 text-center sm:px-8 md:py-8"
          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
        >
          <p className="text-base font-bold sm:text-lg" style={{ color: theme.primary }}>
            {expired ? ts("expiredTitle") : ts("unsubTitle")}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: theme.onSurfaceVariant }}>
            {expired ? ts("expiredBody") : ts("unsubBody")}
          </p>
        </div>

        <SubscriptionPlans
          slug={slug}
          theme={theme}
          currentPlan={sub.plan}
          isOwner={sub.isOwner}
        />
      </div>
    );
  }

  const [stats, flow] = await Promise.all([getDashboardStats(ctx), getBookingFlow(ctx)]);

  const cards = [
    { label: t("todayAppointments"), value: String(stats.todayAppointments) },
    { label: t("upcoming"), value: String(stats.upcomingAppointments) },
    { label: t("revenue"), value: formatMoney(stats.revenueToday, "EGP", locale) },
    { label: t("newCustomers"), value: String(stats.newCustomers30d) },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("welcome")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{ctx.businessName}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex h-full flex-col rounded-xl border p-4 md:p-5"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
          >
            {/* Uniform label zone so the number below always sits on the same baseline */}
            <p
              className="flex min-h-[2.4rem] items-start text-xs font-medium leading-snug md:min-h-[2rem] md:text-sm"
              style={{ color: theme.onSurfaceVariant }}
            >
              {c.label}
            </p>
            <p
              className="mt-2 text-xl font-bold leading-none tracking-tight tabular-nums md:mt-3 md:text-2xl"
              style={{ color: theme.primary }}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Booking flow chart */}
      <BookingFlowChart locale={locale} theme={theme} data={flow} />

      {/* Top services */}
      <section className="rounded-xl border p-5" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("topServices")}</h2>
        {stats.topServices.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noData")}</p>
        ) : (
          <ul className="mt-4 divide-y" style={{ borderColor: theme.outlineVariant }}>
            {stats.topServices.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate text-sm font-medium" style={{ color: theme.onSurfaceVariant }}>{s.name}</span>
                <span className="shrink-0 text-sm tabular-nums" style={{ color: theme.onSurfaceVariant }}>
                  {s.count} · {formatMoney(s.revenue, "EGP", locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
