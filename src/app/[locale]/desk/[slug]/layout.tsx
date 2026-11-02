import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { featuresForPlan } from "@/lib/tenant/context";
import { getThemeTokens } from "@/config/business-types";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { UnauthorizedError } from "@/lib/errors";

export default async function DeskLayout({
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
    if (err instanceof UnauthorizedError) redirect(`/${locale}/auth/sign-in`);
    notFound();
  }

  if (ctx.role === "employee") redirect(`/${locale}/worker/${slug}`);

  const theme = getThemeTokens(ctx.theme);
  const [tenant] = await db
    .select({ logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  return (
    <DashboardShell
      slug={slug}
      businessName={ctx.businessName}
      theme={theme}
      logoUrl={tenant?.logoUrl ?? null}
      features={featuresForPlan(ctx.subscriptionPlan)}
      permissions={[...ctx.permissions]}
    >
      {children}
    </DashboardShell>
  );
}
