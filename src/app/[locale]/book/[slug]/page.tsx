import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MapPin, PauseCircle } from "lucide-react";
import { avg, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { resolveTenantForBooking, getTenantLocation, listTenantEmployeesWithServices, listTenantServices } from "@/modules/booking/domain/catalog";
import { listActivePackagesForBooking } from "@/modules/booking/application/packages";
import { getBusinessTypeConfig, getThemeTokens } from "@/config/business-types";
import { BookingWidget } from "@/components/booking/booking-widget";
import { BookingTabs } from "@/components/booking/booking-tabs";
import { RecordRecentStore } from "@/components/marketplace/continue-row";
import { Link } from "@/i18n/navigation";
import { ScanView } from "@/components/booking/scan-view";
import { RatingsView } from "@/components/booking/ratings-view";
import { Logo } from "@/components/booking/logo";
import { ShopCarousel } from "@/components/booking/shop-carousel";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { getSubscriptionState } from "@/lib/subscriptions";
import { getOptionalUserId } from "@/lib/auth/session";
import { getClientProfile, getRebookSelection } from "@/lib/marketplace/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  let tenant;
  try {
    tenant = await resolveTenantForBooking(slug);
  } catch {
    return { title: "LastTouch" };
  }
  return {
    title: tenant.businessName,
    description: tenant.tagline ?? tenant.description ?? undefined,
    icons: tenant.logoUrl ? { icon: tenant.logoUrl, apple: tenant.logoUrl } : undefined,
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ rebook?: string }>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  let tenant;
  try {
    tenant = await resolveTenantForBooking(slug);
  } catch {
    notFound();
  }

  const biz = getBusinessTypeConfig(tenant.businessType);
  const employeeLabel = tenant.employeeLabel ?? biz.employeeLabel;
  const theme = getThemeTokens(tenant.theme);

  // Unsubscribed/expired stores: booking site shows a disabled message
  // instead of the booking flow (APIs enforce the same gate).
  const sub = await getSubscriptionState(tenant.id);
  if (!sub.hasAccess) {
    const bt = await getTranslations("booking");
    return (
      <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
        <header
          className="sticky top-0 z-50 border-b border-black/5 bg-white [transform:translateZ(0)] sm:bg-white/70 sm:backdrop-blur-md"
        >
          <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-4 md:px-8">
            <div className="min-w-0 flex-shrink">
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt={tenant.businessName} className="h-8 w-auto max-w-[110px] object-contain sm:h-10 sm:max-w-[170px]" />
              ) : (
                <Logo className="h-4 w-auto sm:h-5 md:h-6" />
              )}
            </div>
            <LangSwitcher theme={theme} />
          </div>
        </header>
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center md:py-24">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
          >
            <PauseCircle className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-bold md:text-3xl" style={{ color: theme.primary }}>
            {tenant.businessName}
          </h1>
          <p className="mt-2 text-base font-semibold" style={{ color: theme.primary }}>
            {bt("siteDisabledTitle")}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed md:text-base" style={{ color: theme.onSurfaceVariant }}>
            {bt("siteDisabledBody")}
          </p>
        </section>
        <PoweredByLastTouch theme={theme} />
      </main>
    );
  }

  const [employees, services, packages, [ratingRow], storeLocation] = await Promise.all([
    listTenantEmployeesWithServices(tenant.id),
    listTenantServices(tenant.id),
    listActivePackagesForBooking(tenant.id),
    db
      .select({ avg: avg(reviews.rating), count: count(reviews.id) })
      .from(reviews)
      .where(eq(reviews.tenantId, tenant.id)),
    getTenantLocation(tenant.id),
  ]);
  const locationLabel = [storeLocation?.address, storeLocation?.city].filter(Boolean).join(" · ");
  const directionsUrl =
    storeLocation?.latitude != null && storeLocation?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${storeLocation.latitude},${storeLocation.longitude}`
      : locationLabel
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
        : null;

  const pick = (en: string, ar: string | null) => (locale === "ar" && ar ? ar : en);

  // Signed-in clients get their details prefilled (booking still works for guests).
  const bookerId = await getOptionalUserId();
  const bookerProfile = bookerId ? await getClientProfile(bookerId) : null;
  const mt = await getTranslations("marketplace");
  const bt = await getTranslations("booking");

  // "Book again" deep-link: same services + same workers preselected,
  // date/time left for the client to choose.
  const rebook =
    bookerId && sp.rebook ? await getRebookSelection(bookerId, sp.rebook) : null;

  return (
    <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      <RecordRecentStore slug={slug} />
      {/* Nav — compact + wrapping-safe on small phones */}
      <header
        className="sticky top-0 z-50 border-b border-black/5 bg-white [transform:translateZ(0)] sm:bg-white/70 sm:backdrop-blur-md"
      >
        <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 md:px-8">
          <div className="min-w-0 flex-shrink">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.businessName} className="h-8 w-auto max-w-[110px] object-contain sm:h-10 sm:max-w-[170px]" />
            ) : (
              <Logo className="h-4 w-auto sm:h-5 md:h-6" />
            )}
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
            <Link
              href="/"
              className="hidden max-w-[110px] truncate text-xs font-semibold underline min-[400px]:block"
              style={{ color: theme.secondary }}
            >
              {mt("allStores")}
            </Link>
            <LangSwitcher theme={theme} />
            <a
              href="#booking"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold sm:px-5 sm:py-2.5 sm:text-sm"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              Book Now
            </a>
          </div>
        </div>
      </header>

      {/* Tabs: booking | scan | ratings */}
      <div className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-10 md:px-8 md:py-14">
        <BookingTabs
          theme={theme}
          booking={
            <>
              {/* Hero */}
              <section className="flex w-full flex-col gap-6 md:gap-8">
                <div className="flex max-w-3xl flex-col items-start gap-2.5 sm:gap-3 md:gap-4">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest sm:text-xs"
                    style={{ color: theme.secondary }}
                  >
                    {biz.label}
                  </span>
                  <h1 className="break-words text-2xl font-bold leading-tight sm:text-3xl md:text-5xl" style={{ color: theme.primary }}>
                    {tenant.businessName}
                  </h1>
                  <p className="text-sm leading-relaxed sm:text-base md:text-lg" style={{ color: theme.onSurfaceVariant }}>
                    {tenant.tagline ?? tenant.description ?? ""}
                  </p>
                  {locationLabel && (
                    <p className="flex max-w-full flex-wrap items-center gap-1.5 text-xs sm:text-sm" style={{ color: theme.secondary }}>
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {bt("storeLocation")} · {locationLabel}
                      </span>
                      {directionsUrl && (
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 font-semibold underline"
                          style={{ color: theme.primary }}
                        >
                          {bt("getDirections")}
                        </a>
                      )}
                    </p>
                  )}
                </div>

                {tenant.shopImages && tenant.shopImages.length > 0 && (
                  <ShopCarousel images={tenant.shopImages.slice(0, 6)} businessName={tenant.businessName} theme={theme} />
                )}
              </section>

              {/* Booking */}
              <section id="booking" className="mx-auto mt-6 max-w-4xl md:mt-8">
                <BookingWidget
                  tenant={{
                    businessName: tenant.businessName,
                    tagline: tenant.tagline,
                    description: tenant.description,
                    employeeLabel,
                    currency: tenant.currency,
                  }}
                  themeId={tenant.theme}
                  services={services.map((s) => ({
                    id: s.id,
                    name: pick(s.name, s.nameAr ?? null),
                    description: s.descriptionAr && locale === "ar" ? s.descriptionAr : s.description,
                    durationMinutes: s.durationMinutes,
                    price: String(s.price),
                  }))}
                  packages={packages.map((p) => ({
                    id: p.id,
                    name: pick(p.name, p.nameAr ?? null),
                    description: p.descriptionAr && locale === "ar" ? p.descriptionAr : p.description,
                    price: p.price,
                    serviceIds: p.serviceIds,
                    serviceNames: p.serviceNames,
                  }))}
                  employees={employees.map((e) => ({
                    id: e.id,
                    displayName: e.displayName,
                    firstName: e.firstName,
                    lastName: e.lastName,
                    yearsExperience: e.yearsExperience,
                    isGeneral: e.isGeneral,
                    serviceIds: e.serviceIds,
                  }))}
                  initialCustomer={
                    bookerProfile?.fullName || bookerProfile?.phone
                      ? { firstName: bookerProfile.fullName ?? "", phone: bookerProfile.phone ?? "" }
                      : null
                  }
                  initialServiceIds={rebook?.serviceIds ?? null}
                  initialAssignments={rebook?.assignments ?? null}
                />
              </section>
            </>
          }
          scan={
            <section className="py-2">
              <ScanView theme={theme} slug={slug} />
            </section>
          }
          ratings={
            <section className="py-2">
              <RatingsView
                theme={theme}
                storeRating={
                  ratingRow && Number(ratingRow.count) > 0
                    ? { avg: Number(ratingRow.avg ?? 0), count: Number(ratingRow.count) }
                    : null
                }
                workers={employees.map((e) => ({
                  name: e.displayName ?? `${e.firstName}${e.lastName ? " " + e.lastName : ""}`,
                  role: employeeLabel,
                  rating: Number(e.rating ?? 0),
                }))}
              />
            </section>
          }
        />
      </div>

      {/* Footer */}
      <PoweredByLastTouch theme={theme} />
    </main>
  );
}