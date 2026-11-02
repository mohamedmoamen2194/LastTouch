import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { UnauthorizedError } from "@/lib/errors";
import { getWorkerState } from "@/modules/attendance/application/attendance";
import { WorkerShell } from "@/components/worker/worker-shell";
import { WorkerAttendance } from "@/components/worker/worker-attendance";

export const dynamic = "force-dynamic";

export default async function WorkerPage({
  params,
}: {
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

  let state;
  try {
    state = await getWorkerState(ctx);
  } catch {
    redirect(`/${locale}/${slug}/dashboard`);
  }

  const theme = getThemeTokens(ctx.theme);
  const [tenant] = await db
    .select({ logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  return (
    <WorkerShell
      slug={slug}
      locale={locale}
      businessName={ctx.businessName}
      logoUrl={tenant?.logoUrl ?? null}
      theme={theme}
    >
      <WorkerAttendance
        slug={slug}
        locale={locale}
        timezone={ctx.timezone}
        theme={theme}
        initialState={{
          employee: state.employee,
          location: state.location,
          clockedIn: state.clockedIn,
          lastLog: state.lastLog
            ? {
                type: state.lastLog.type,
                createdAt: state.lastLog.createdAt.toISOString(),
                distanceMeters: state.lastLog.distanceMeters,
              }
            : null,
          today: state.today.map((log) => ({
            id: log.id,
            type: log.type,
            createdAt: log.createdAt.toISOString(),
            distanceMeters: log.distanceMeters,
          })),
        }}
      />
    </WorkerShell>
  );
}
