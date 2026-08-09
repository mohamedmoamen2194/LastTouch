import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { Logo } from "@/components/booking/logo";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { PricingSection } from "@/components/shared/pricing-section";
import { BUSINESS_TYPE_CONFIGS, getBusinessTypeConfig } from "@/config/business-types";
import { StoresMarquee } from "@/components/landing/stores-marquee";
import { StorePill, type PartnerStore } from "@/components/landing/store-pill";
import type { BusinessType } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const businessTypes = Object.values(BUSINESS_TYPE_CONFIGS);

  const partnerStores = (await db
    .select({ slug: tenants.slug, businessName: tenants.businessName, businessType: tenants.businessType, logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.active, true))
    .limit(20)) as unknown as PartnerStore[];

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#c5c6cd]/40 bg-[#f7f9fb]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-[#45474c] hover:text-[#091426]">{t("nav.features")}</a>
            <a href="#pricing" className="text-sm font-medium text-[#45474c] hover:text-[#091426]">{t("nav.pricing")}</a>
          </nav>
          <div className="flex items-center gap-3">
            <LangSwitcher />
            <Link
              href="/auth/sign-up"
              className="rounded-full bg-[#091426] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] md:px-6 md:py-2.5"
            >
              {t("nav.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-12 md:px-8 md:py-24">
        <div className="flex flex-col items-start gap-5 md:gap-6">
          <span className="rounded-full border border-[#c5c6cd] bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#515f74]">
            {t("hero.badge")}
          </span>
          <h1 className="text-3xl font-bold leading-[1.1] tracking-tight text-[#091426] sm:text-4xl md:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[#45474c] md:text-lg">{t("hero.subtitle")}</p>
          <div className="flex w-full flex-col gap-3 pt-1 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-4 sm:pt-2">
            <Link href="/auth/sign-up" className="rounded-full bg-[#091426] px-8 py-3.5 text-center text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#1e293b]">
              {t("hero.cta")}
            </Link>
            <a href="#businesses" className="rounded-full border border-[#75777d] px-8 py-3.5 text-center text-base font-medium text-[#091426] transition-colors hover:border-[#091426]">
              {t("hero.seeBusinesses")}
            </a>
          </div>
        </div>
        <div
          className="relative flex h-56 w-full flex-col justify-center overflow-hidden rounded-2xl md:h-96"
          style={{ background: "linear-gradient(135deg, #1e293b, #091426 60%, #3c475a)" }}
        >
          <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_70%_30%,rgba(188,199,222,0.3),transparent_55%)]" />
          <div className="relative z-10 flex flex-col items-center gap-4 px-5 md:gap-6">
            <p className="text-center text-sm font-medium text-white/70 md:text-base">
              {t("hero.storesLabel")}
            </p>
            <StoresMarquee className="max-w-full">
              {partnerStores.map((s) => (
                <StorePill
                  key={s.slug}
                  store={s}
                  businessTypeLabel={getBusinessTypeConfig(s.businessType as BusinessType).label}
                />
              ))}
            </StoresMarquee>
          </div>
        </div>
      </section>

      {/* Businesses supported */}
      <section id="businesses" className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-[#515f74] md:mb-8">{t("businesses.label")}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {businessTypes.map((b) => (
            <div
              key={b.type}
              className="flex h-full flex-col items-center justify-center rounded-xl border border-[#c5c6cd]/60 bg-white p-4 text-center"
            >
              <p className="text-sm font-semibold leading-snug text-[#091426] md:text-base">{b.label}</p>
              <p className="mt-1 text-xs text-[#45474c] md:text-sm">{b.employeeLabel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
        <div className="mb-8 max-w-2xl md:mb-10">
          <h2 className="text-2xl font-bold text-[#091426] md:text-4xl">{t("features.title")}</h2>
          <p className="mt-3 text-base text-[#45474c] md:text-lg">{t("features.subtitle")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
          {["booking", "customers", "ai", "reports", "marketing", "payments"].map((k) => (
            <div
              key={k}
              className="flex h-full flex-col rounded-xl border border-[#c5c6cd]/60 bg-white p-5 transition-shadow hover:shadow-md md:p-6"
            >
              <h3 className="text-base font-semibold text-[#091426] md:text-lg">{t(`features.items.${k}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#45474c]">{t(`features.items.${k}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-20">
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-[#091426] px-6 py-12 text-center md:gap-6 md:px-8 md:py-14">
          <h2 className="max-w-xl text-2xl font-bold text-white md:text-4xl">{t("cta.title")}</h2>
          <Link href="/auth/sign-up" className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-[#091426] transition-colors hover:bg-[#eff1f3]">
            {t("cta.button")}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#c5c6cd]/40 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-8">
          <Logo className="h-5 w-auto" />
          <p className="text-sm text-[#45474c]">© 2026 LastTouch. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}