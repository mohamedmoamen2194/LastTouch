import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { listMachines } from "@/modules/inventory/application/machines";
import { MachinesManager } from "@/components/dashboard/machines-manager";
import { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function MachinesPage({
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
  if (!ctx.permissions.has(Permission["inventory.read"])) notFound();

  const theme = getThemeTokens(ctx.theme);
  const rows = await listMachines(ctx);

  return (
    <MachinesManager
      slug={slug}
      locale={locale}
      timezone={ctx.timezone}
      currency={ctx.currency}
      theme={theme}
      machines={rows.map((m) => ({
        id: m.id,
        name: m.name,
        nameAr: m.nameAr,
        serialNumber: m.serialNumber,
        category: m.category,
        description: m.description,
        imageUrl: m.imageUrl,
        purchaseDate: m.purchaseDate ? m.purchaseDate.toISOString() : null,
        warrantyExpiry: m.warrantyExpiry ? m.warrantyExpiry.toISOString() : null,
        expiryDate: m.expiryDate ? m.expiryDate.toISOString() : null,
        maintenanceIntervalDays: m.maintenanceIntervalDays,
        lastMaintenanceAt: m.lastMaintenanceAt ? m.lastMaintenanceAt.toISOString() : null,
        nextMaintenanceAt: m.nextMaintenanceAt ? m.nextMaintenanceAt.toISOString() : null,
        status: (m.status as "operational" | "maintenance" | "retired") ?? "operational",
        notes: m.notes,
        active: m.active,
      }))}
    />
  );
}
