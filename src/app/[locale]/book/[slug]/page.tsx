import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { resolveTenantForBooking, listTenantEmployeesWithServices, listTenantServices } from "@/modules/booking/domain/catalog";
import { getBusinessTypeConfig, getThemeTokens } from "@/config/business-types";
import { BookingWidget } from "@/components/booking/booking-widget";
import { Logo } from "@/components/booking/logo";
import { ShopCarousel } from "@/components/booking/shop-carousel";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";

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

  const biz = getBusinessTypeConfig(tenant.businessType);
  const employeeLabel = tenant.employeeLabel ?? biz.employeeLabel;
  const theme = getThemeTokens(tenant.theme);

  const [employees, services] = await Promise.all([
    listTenantEmployeesWithServices(tenant.id),
    listTenantServices(tenant.id),
  ]);

  return (
    <main className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      {/* Nav */}
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
          <a
            href="#booking"
            className="rounded-full px-5 py-2.5 text-sm font-semibold"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            Book Now
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-4 py-10 md:gap-8 md:px-8 md:py-14">
        <div className="flex max-w-3xl flex-col items-start gap-3 md:gap-4">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: theme.secondary }}
          >
            {biz.label}
          </span>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl" style={{ color: theme.primary }}>
            {tenant.businessName}
          </h1>
          <p className="text-base leading-relaxed md:text-lg" style={{ color: theme.onSurfaceVariant }}>
            {tenant.tagline ?? tenant.description ?? ""}
          </p>
        </div>

        {tenant.shopImages && tenant.shopImages.length > 0 && (
          <ShopCarousel images={tenant.shopImages.slice(0, 6)} businessName={tenant.businessName} theme={theme} />
        )}
      </section>

      {/* Booking */}
      <section id="booking" className="mx-auto max-w-4xl px-4 pb-20 md:px-8 md:pb-24">
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
            name: s.name,
            description: s.description,
            durationMinutes: s.durationMinutes,
            price: String(s.price),
          }))}
          employees={employees.map((e) => ({
            id: e.id,
            displayName: e.displayName,
            firstName: e.firstName,
            lastName: e.lastName,
            yearsExperience: e.yearsExperience,
            serviceIds: e.serviceIds,
          }))}
        />
      </section>

      {/* Footer */}
      <PoweredByLastTouch theme={theme} />
    </main>
  );
}