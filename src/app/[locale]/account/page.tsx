import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ChevronRight, FileText, LogOut, ShieldCheck, Store } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/errors";
import { getClientProfile, clientAccentForGender } from "@/lib/marketplace/client";
import { listMarketplaceStores } from "@/lib/marketplace/stores";
import { db } from "@/db";
import { clientFavorites, clientPaymentMethods, memberships, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { MarketplaceFooter } from "@/components/marketplace/footer";
import { ProfileForm } from "@/components/marketplace/profile-form";
import { ReferralWidget } from "@/components/marketplace/referral-widget";
import { DeleteAccount } from "@/components/marketplace/delete-account";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { PaymentsManager } from "@/components/marketplace/payments-manager";
import { StoreCard } from "@/components/marketplace/store-card";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("client");

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect(`/${locale}/auth/sign-in?redirect_url=/${locale}/account`);
    throw e;
  }

  const [profile, stores, favs, myBusinesses, payments] = await Promise.all([
    getClientProfile(userId),
    listMarketplaceStores(),
    db.select({ tenantId: clientFavorites.tenantId }).from(clientFavorites).where(eq(clientFavorites.userId, userId)),
    db
      .select({ slug: tenants.slug, businessName: tenants.businessName, role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, userId), eq(memberships.active, true), eq(tenants.active, true))),
    db.select().from(clientPaymentMethods).where(eq(clientPaymentMethods.userId, userId)),
  ]);
  const favIds = new Set(favs.map((f) => f.tenantId));
  const favStores = stores.filter((s) => favIds.has(s.id));

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col text-[#191c1e]" style={{ "--mp-accent": clientAccentForGender(profile?.gender) } as Record<string, string>}>
      <MarketplaceTopbar signedIn />
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-1 flex-col gap-5 px-4 pb-10 pt-6 md:min-h-[calc(100vh-4rem)] md:min-h-[calc(100dvh-4rem)] md:px-8">
        <div>
          <h1 className="text-2xl font-bold text-[#091426]">{t("accountTitle")}</h1>
          <p className="mt-0.5 text-sm text-[#45474c]">{t("accountSubtitle")}</p>
        </div>

        <ReferralWidget />

        {/* 1 — My info */}
        <section className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm md:p-5">
          <h2 className="mb-3 font-bold text-[#091426]">{t("profileTitle")}</h2>
          <ProfileForm initial={profile} />
        </section>

        {/* 2 — Language */}
        <section className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#091426]">{t("languageTitle")}</h2>
              <p className="mt-0.5 text-xs text-[#45474c]">{t("languageBody")}</p>
            </div>
            <LangSwitcher />
          </div>
        </section>

        {/* 3 — Payments */}
        <section className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm md:p-5">
          <h2 className="mb-3 font-bold text-[#091426]">{t("paymentsTitle")}</h2>
          <PaymentsManager
            initial={payments.map((p) => ({
              id: p.id,
              brand: p.brand,
              last4: p.last4,
              expMonth: p.expMonth,
              expYear: p.expYear,
              holderName: p.holderName,
              isDefault: p.isDefault,
            }))}
          />
        </section>

        <section>
          <h2 className="mb-3 font-bold text-[#091426]">
            {t("favoritesTitle")} <span className="text-sm font-medium text-[#9aa0a6]">({favStores.length})</span>
          </h2>
          {favStores.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#c5c6cd] bg-white px-5 py-8 text-center text-sm text-[#45474c]">
              {t("noFavorites")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
              {favStores.map((s) => (
                <StoreCard key={s.id} store={s} locale={locale} isFavorite signedIn />
              ))}
            </div>
          )}
        </section>

        {/* 5 — My businesses (owners only) */}
        {myBusinesses.length > 0 && (
          <section className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm md:p-5">
            <h2 className="mb-3 font-bold text-[#091426]">{t("businessesTitle")}</h2>
            <div className="flex flex-col gap-2">
              {myBusinesses.map((b) => (
                <Link
                  key={b.slug}
                  href={`/${b.slug}/dashboard`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f9fb] px-4 py-3 text-sm font-semibold text-[#091426] transition-colors hover:bg-[#eff1f3]"
                >
                  <span className="truncate">{b.businessName}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-[#45474c]">
                    {t("openDashboard")} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 6 — Privacy & terms */}
        <section className="overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-sm">
          <Link href="/privacy" className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
            <span className="flex items-center gap-3 text-sm font-semibold text-[#091426]">
              <ShieldCheck className="h-4 w-4 text-[#45474c]" />
              {t("privacyTitle")}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa0a6] rtl:rotate-180" />
          </Link>
          <Link href="/terms" className="flex items-center justify-between gap-3 border-t border-[#c5c6cd]/50 px-4 py-3.5 md:px-5">
            <span className="flex items-center gap-3 text-sm font-semibold text-[#091426]">
              <FileText className="h-4 w-4 text-[#45474c]" />
              {t("termsTitle")}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa0a6] rtl:rotate-180" />
          </Link>
        </section>

        <section className="rounded-2xl bg-[#091426] p-5 text-center">
          <Store className="mx-auto h-6 w-6 text-white/70" />
          <h2 className="mt-2 font-bold text-white">{t("forBusiness")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/70">{t("forBusinessBody")}</p>
          <Link
            href="/partners"
            className="mt-3 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-[#091426]"
          >
            {t("forBusinessCta")}
          </Link>
        </section>

        <SignOutButton>
          <button className="flex items-center justify-center gap-2 rounded-full border border-[#c5c6cd]/60 bg-white px-5 py-2.5 text-sm font-semibold text-[#ba1a1a]">
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </button>
        </SignOutButton>

        {/* Danger zone */}
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 md:p-5">
          <DeleteAccount />
        </section>
      </div>

      <MarketplaceFooter locale={locale} />

      <MarketplaceTabs />
    </main>
  );
}
