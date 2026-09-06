import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, tenants } from "@/db/schema";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getBusinessTypeConfig, getThemeTokens } from "@/config/business-types";
import { SettingsManager } from "@/components/dashboard/settings-manager";
import { getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
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

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, ctx.tenantId))
    .limit(1);
  const subState = await getSubscriptionState(ctx.tenantId, { role: ctx.role });

  return (
    <SettingsManager
      slug={slug}
      locale={locale}
      theme={theme}
      businessName={tenant?.businessName ?? ctx.businessName}
      businessTypeLabel={getBusinessTypeConfig(ctx.businessType).label}
      bookingUrl={`/${locale}/book/${slug}`}
      plan={tenant?.subscriptionPlan ?? ctx.subscriptionPlan}
      planStatus={subscription?.status ?? "active"}
      renewalDate={subscription?.renewalDate ? subscription.renewalDate.toISOString() : null}
      expirationDate={subscription?.expirationDate ? subscription.expirationDate.toISOString() : null}
      billingPeriod={subscription?.billingPeriod ?? null}
      daysLeft={subState.daysLeft}
      autoRenew={subscription?.autoRenew ?? true}
      subscribed={subState.hasAccess}
      canManage={ctx.role === "owner"}
      manageHref={`/${locale}/${slug}/dashboard#subscription`}
      logoUrl={tenant?.logoUrl ?? null}
      shopImages={tenant?.shopImages ?? []}
    />
  );
}