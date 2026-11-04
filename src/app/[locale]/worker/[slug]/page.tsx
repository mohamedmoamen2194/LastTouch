import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LogIn } from "lucide-react";
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

  let state: Awaited<ReturnType<typeof getWorkerState>> | null = null;
  let stateError: string | null = null;
  try {
    state = await getWorkerState(ctx);
  } catch (err) {
    stateError = err instanceof Error ? err.message : "Unable to load attendance";
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
      permissions={[...ctx.permissions]}
    >
      {stateError || !state ? (
        <div className="mx-auto w-full max-w-xl space-y-4 py-10">
          <section
            className="rounded-3xl border px-5 py-8 text-center"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
          >
            <span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}
            >
              <LogIn className="h-8 w-8" />
            </span>
            <h1 className="mt-3 text-xl font-bold" style={{ color: theme.primary }}>
              Worker profile not linked
            </h1>
            <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
              {stateError}
            </p>
            <p className="mt-4 text-xs" style={{ color: theme.secondary }}>
              Ask the business owner to link your account to a staff member in the Employees panel.
            </p>
          </section>
        </div>
      ) : (
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
      )}
    </WorkerShell>
  );
}
