import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listAppointments } from "@/modules/appointments/application/appointments";
import { formatMoney } from "@/lib/utils";
import { AppointmentList } from "@/components/dashboard/appointment-list";

export const dynamic = "force-dynamic";

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

  const cards = rows.map((r) => ({
    ...r,
    price: formatMoney(r.price, "EGP", locale),
  }));

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("upcoming")}</h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{ctx.businessName}</p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm md:p-10" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {t("noData")}
        </div>
      ) : (
        <AppointmentList rows={cards} slug={slug} theme={theme} />
      )}
    </div>
  );
}