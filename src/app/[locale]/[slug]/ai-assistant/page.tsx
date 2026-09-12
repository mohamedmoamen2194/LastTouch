import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { hasFeature } from "@/lib/tenant/context";
import { getThemeTokens } from "@/config/business-types";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { AiChat } from "@/components/dashboard/ai-chat";
import { getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * AI Assistant (Phase-5b placeholder). Visible only on AI Growth and
 * Enterprise plans via the nav + feature check below; renders a coming-soon
 * card until the real assistant ships, an upgrade CTA otherwise.
 */
export default async function AiAssistantPage({
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
  const allowed = sub.hasAccess && hasFeature(ctx, "ai_assistant");
  // v1 console is owner/manager-only (preview); everyone else keeps the card.
  const canChat = allowed && (ctx.role === "owner" || ctx.role === "manager");

  if (canChat) {
    return <AiChat slug={slug} theme={theme} businessName={ctx.businessName} />;
  }

  return (
    <ComingSoon
      locale={locale}
      slug={slug}
      theme={theme}
      icon="assistant"
      title={t("assistantTitle")}
      body={allowed ? t("assistantBody") : t("upgradeBody")}
      badge={allowed ? t("comingSoon") : t("upgradeTitle")}
      mode={allowed ? "soon" : "upgrade"}
      cta={t("viewPlans")}
    />
  );
}
