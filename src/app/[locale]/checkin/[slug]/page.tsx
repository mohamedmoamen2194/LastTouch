import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { avg, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import {
  listTenantEmployeesWithServices,
  resolveTenantForBooking,
} from "@/modules/booking/domain/catalog";
import { getThemeTokens } from "@/config/business-types";
import { CheckinWidget } from "@/components/booking/checkin-widget";
import { Logo } from "@/components/booking/logo";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { getSubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Public check-in page. The store QR (settings → Check-in QR, printable)
 * points here; the native camera app opens it directly. First touch from a
 * device opens a visit, the next one closes it; phone-number fallback covers
 * devices that can't be told apart. Same subscription gate as booking.
 */
export default async function CheckinPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  let tenant;
  try {
    tenant = await resolveTenantForBooking(slug);
  } catch {
    notFound();
  }

  const theme = getThemeTokens(tenant.theme);

  const sub = await getSubscriptionState(tenant.id);
  if (!sub.hasAccess) {
    const bt = await getTranslations("booking");
    return (
      <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="mt-5 text-2xl font-bold md:text-3xl" style={{ color: theme.primary }}>
            {tenant.businessName}
          </h1>
          <p className="mt-2 text-base font-semibold" style={{ color: theme.primary }}>
            {bt("siteDisabledTitle")}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>
            {bt("siteDisabledBody")}
          </p>
        </section>
        <PoweredByLastTouch theme={theme} />
      </main>
    );
  }

  const [employees, [ratingRow]] = await Promise.all([
    listTenantEmployeesWithServices(tenant.id),
    db
      .select({ avg: avg(reviews.rating), count: count(reviews.id) })
      .from(reviews)
      .where(eq(reviews.tenantId, tenant.id)),
  ]);

  return (
    <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      <header
        className="sticky top-0 z-50 border-b border-black/5 backdrop-blur-md"
        style={{ backgroundColor: "rgba(255,255,255,0.7)" }}
      >
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 md:px-8">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.businessName} className="h-10 w-auto max-w-[170px] object-contain" />
          ) : (
            <Logo />
          )}
          <LangSwitcher theme={theme} />
        </div>
      </header>

      <section className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-10 md:px-8 md:py-14">
        <CheckinWidget
          slug={slug}
          theme={theme}
          businessName={tenant.businessName}
          storeRating={
            ratingRow && Number(ratingRow.count) > 0
              ? { avg: Number(ratingRow.avg ?? 0), count: Number(ratingRow.count) }
              : null
          }
          workers={employees.map((e) => ({
            name: e.displayName ?? `${e.firstName}${e.lastName ? " " + e.lastName : ""}`,
            rating: Number(e.rating ?? 0),
          }))}
        />
      </section>

      <PoweredByLastTouch theme={theme} />
    </main>
  );
}
