import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listAppointments } from "@/modules/appointments/application/appointments";
import { formatMoney } from "@/lib/utils";
import { AppointmentActions } from "@/components/dashboard/appointment-actions";
import { User } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#fff4e5", fg: "#9a6b00" },
  confirmed: { bg: "#e3f2fd", fg: "#04519b" },
  completed: { bg: "#e1f3e2", fg: "#1d6e2f" },
  cancelled: { bg: "#fdeaea", fg: "#a12b2b" },
  no_show: { bg: "#f0e9fb", fg: "#6a3bb0" },
};

export default async function AppointmentsPage({
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

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const rows = await listAppointments(ctx, { from: iso });

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("upcoming")}</h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{ctx.businessName}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm md:p-10" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {t("noData")}
        </div>
      ) : (
        <div className="flex flex-col gap-3 md:rounded-lg md:border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
          {/* Header row — hidden on small screens, shown md+ */}
          <div
            className="hidden grid-cols-12 items-center gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide md:grid"
            style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
          >
            <div className="col-span-4">{t("appointmentDate")}</div>
            <div className="col-span-2">{t("appointmentStatus")}</div>
            <div className="col-span-2 text-right">{t("appointmentPrice")}</div>
            <div className="col-span-4 text-right">{t("appointmentActions")}</div>
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border p-4 md:grid md:grid-cols-12 md:items-center md:rounded-none md:border-x-0 md:border-t md:border-b-0 md:px-4 md:py-3"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
              >
                {/* Date + time + worker */}
                <div className="md:col-span-4">
                  <p className="text-sm font-semibold" style={{ color: theme.primary }}>{displayDate(r.dateTime)}</p>
                  <p className="mt-0.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                    {r.startTime}–{r.endTime}
                  </p>
                  {r.employeeFirstName && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                      <User size={12} className="shrink-0" />
                      {r.employeeLastName
                        ? `${r.employeeFirstName} ${r.employeeLastName}`
                        : r.employeeFirstName}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center justify-between gap-3 md:contents">
                  <StatusBadge status={r.status} theme={theme} />

                  {/* Price */}
                  <div className="text-sm font-semibold md:col-span-2 md:w-auto md:text-right" style={{ color: theme.primary }}>
                    {formatMoney(r.price, "EGP", locale)}
                  </div>
                </div>

                {/* Actions */}
                <div className="md:col-span-4 md:justify-self-end">
                  <AppointmentActions slug={slug} appointmentId={r.id} status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function displayDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function StatusBadge({ status, theme }: { status: string; theme: ReturnType<typeof getThemeTokens> }) {
  const colors = STATUS_COLORS[status] ?? { bg: theme.surfaceContainerHigh, fg: theme.onSurfaceVariant };
  return (
    <span
      className="inline-block rounded-md px-2.5 py-1 text-xs font-medium capitalize"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      {status.replace("_", " ")}
    </span>
  );
}