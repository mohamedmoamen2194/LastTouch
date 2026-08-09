import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listCustomers } from "@/modules/crm/application/customers";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
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

  const rows = await listCustomers(ctx);

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("newCustomers")}</h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{ctx.businessName}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm md:p-10" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {t("noData")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Visits</th>
                  <th className="px-4 py-3 text-right font-medium">Spent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b" style={{ borderColor: theme.outlineVariant }}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: theme.onSurfaceVariant }}>
                      {c.firstName} {c.lastName ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3" style={{ color: theme.onSurfaceVariant }}>{c.phone ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: theme.onSurfaceVariant }}>{c.visitCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" style={{ color: theme.primary }}>{c.totalSpent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}