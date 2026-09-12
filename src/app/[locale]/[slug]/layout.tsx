import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { featuresForPlan } from "@/lib/tenant/context";
import { getThemeTokens } from "@/config/business-types";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SubscriptionReminder } from "@/components/dashboard/subscription-reminder";
import { getSubscriptionState } from "@/lib/subscriptions";
import { UnauthorizedError } from "@/lib/errors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  let logoUrl: string | null = null;
  let businessName: string | null = null;
  try {
    const [tenant] = await db.select({ logoUrl: tenants.logoUrl, businessName: tenants.businessName }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    logoUrl = tenant?.logoUrl ?? null;
    businessName = tenant?.businessName ?? null;
  } catch {
    // fall through with defaults
  }
  return {
    title: businessName ?? "LastTouch",
    icons: logoUrl ? { icon: logoUrl, apple: logoUrl } : undefined,
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  let ctx;
  try {
    ctx = await getDashboardAccess(slug);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/${locale}/auth/sign-in`);
    }
    notFound();
  }

  const theme = getThemeTokens(ctx.theme);

  const [tenantLogo] = await db
    .select({ logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  return (
    <DashboardShell
      slug={slug}
      businessName={ctx.businessName}
      theme={theme}
      logoUrl={tenantLogo?.logoUrl ?? null}
      features={featuresForPlan(ctx.subscriptionPlan)}
    >
      {children}
      <SubscriptionReminderGate
        tenantId={ctx.tenantId}
        slug={slug}
        theme={theme}
        role={ctx.role}
      />
    </DashboardShell>
  );
}

async function SubscriptionReminderGate({
  tenantId,
  slug,
  theme,
  role,
}: {
  tenantId: string;
  slug: string;
  theme: ReturnType<typeof getThemeTokens>;
  role: string;
}) {
  const state = await getSubscriptionState(tenantId, { role });
  if (state.banner !== "ending_soon" || state.daysLeft === null) return null;
  return (
    <SubscriptionReminder
      tenantId={tenantId}
      slug={slug}
      theme={theme}
      daysLeft={state.daysLeft}
    />
  );
}