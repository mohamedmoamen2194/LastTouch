import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { hasFeature } from "@/lib/tenant/context";
import { getThemeTokens } from "@/config/business-types";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * AI Insights (Phase-5a placeholder). Visible only on AI Growth and
 * Enterprise plans via the nav + feature check below; renders a coming-soon
 * card until the real insights ship, an upgrade CTA otherwise.
 */
export default async function AiInsightsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ai");

  let ctx;
  try {
    ctx = await getDashboardAccess(slug);
  } catch {
    notFound();
  }

  const theme = getThemeTokens(ctx.theme);
  const sub = await getSubscriptionState(ctx.tenantId, { role: ctx.role });
  const allowed = sub.hasAccess && hasFeature(ctx, "ai_insights");

  return (
    <ComingSoon
      locale={locale}
      slug={slug}
      theme={theme}
      icon="insights"
      title={t("insightsTitle")}
      body={allowed ? t("insightsBody") : t("upgradeBody")}
      badge={allowed ? t("comingSoon") : t("upgradeTitle")}
      mode={allowed ? "soon" : "upgrade"}
      cta={t("viewPlans")}
    />
  );
}
