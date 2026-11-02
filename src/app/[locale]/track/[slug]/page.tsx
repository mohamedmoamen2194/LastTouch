import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { getThemeTokens } from "@/config/business-types";
import { PublicTracker } from "@/components/booking/public-tracker";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale, slug } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);

  let tenant;
  try {
    tenant = await resolveTenantForBooking(slug);
  } catch {
    notFound();
  }

  const theme = getThemeTokens(tenant.theme);

  return (
    <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      <div className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <PublicTracker
          slug={slug}
          theme={theme}
          currency={tenant.currency}
          businessName={tenant.businessName}
          initialCode={code}
        />
      </div>
      <PoweredByLastTouch theme={theme} />
    </main>
  );
}
