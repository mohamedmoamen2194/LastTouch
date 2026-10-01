import { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getOptionalUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { clientFavorites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listMarketplaceStores, orderedBusinessTypes } from "@/lib/marketplace/stores";
import { clientAccentForGender, getClientBookings, getClientPointsTotal, getClientProfile } from "@/lib/marketplace/client";
import { getReferralStats } from "@/lib/marketplace/referrals";
import { ForYouRow, NumbersStrip, QuickRebookRow, UpNextCard } from "@/components/marketplace/personal-section";
import { ContinueRow } from "@/components/marketplace/continue-row";
import { Logo } from "@/components/booking/logo";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { NearbyStores } from "@/components/marketplace/nearby-stores";
import { HotDeals } from "@/components/marketplace/hot-deals";
import { SectionSeparator } from "@/components/marketplace/section-separator";
import { MarketplaceFooter } from "@/components/marketplace/footer";
import { FilterSelects } from "@/components/marketplace/filter-selects";
import { StoreCard } from "@/components/marketplace/store-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketplace" });
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

type SearchParams = { q?: string; type?: string; city?: string; sort?: string };

export default async function MarketplaceHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("marketplace");

  const q = (sp.q ?? "").trim().toLowerCase();
  const typeFilter = sp.type ?? "";
  const cityFilter = sp.city ?? "";
  const sort = sp.sort ?? "recommended";

  const allStores = await listMarketplaceStores();
  const cities = [...new Set(allStores.map((s) => s.city).filter((c): c is string => Boolean(c)))].sort();

  const userId = await getOptionalUserId();
  const clientProfile = userId ? await getClientProfile(userId) : null;
  const gender = clientProfile?.gender ?? null;
  const accent = clientAccentForGender(gender);
  const typeOrder = orderedBusinessTypes(gender);
  let favIds = new Set<string>();
  if (userId) {
    const favs = await db
      .select({ tenantId: clientFavorites.tenantId })
      .from(clientFavorites)
      .where(eq(clientFavorites.userId, userId));
    favIds = new Set(favs.map((f) => f.tenantId));
  }

  const filtered = allStores.filter((s) => {
    if (typeFilter && s.businessType !== typeFilter) return false;
    if (cityFilter && s.city !== cityFilter) return false;
    if (q && !`${s.businessName} ${s.city ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "rating") return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
    if (sort === "name") return a.businessName.localeCompare(b.businessName, locale);
    // recommended: rated stores first, then most-reviewed
    return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
  });

  // Logged-in personal rails (compact carousels below the stores, so
  // browsing + filters always stay near the top).
  const upcoming = userId ? await getClientBookings(userId, "upcoming") : [];
  const historyList = userId ? await getClientBookings(userId, "history") : [];
  const upNext = upcoming[0] ?? null;
  const seenSlugs = new Set<string>();
  const quickRebook = historyList
    .filter((b) => (seenSlugs.has(b.slug) ? false : (seenSlugs.add(b.slug), true)))
    .slice(0, 6);
  const visitedTenants = new Set([...upcoming, ...historyList].map((b) => b.tenantId));
  const forYou = allStores
    .filter((s) => !visitedTenants.has(s.id))
    .sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount)
    .slice(0, 6);
  const points = userId ? await getClientPointsTotal(userId) : 0;
  const referralBalance = userId ? (await getReferralStats(userId)).balance : 0;

  const hrefWith = (over: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    const next = { q: sp.q ?? "", type: typeFilter, city: cityFilter, sort, ...over };
    if (next.q) p.set("q", next.q);
    if (next.type) p.set("type", next.type);
    if (next.city) p.set("city", next.city);
    if (next.sort && next.sort !== "recommended") p.set("sort", next.sort);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col text-[#191c1e]" style={{ "--mp-accent": accent } as Record<string, string>}>
      <MarketplaceTopbar signedIn={Boolean(userId)} />

      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-10 pt-6 md:min-h-[calc(100vh-4rem)] md:min-h-[calc(100dvh-4rem)] md:px-8 md:pt-10">
        {/* Hero banner */}
        <section className="relative h-52 overflow-hidden rounded-3xl sm:h-64 md:h-80">
          <Image
            src="/hero.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1152px"
            className="object-cover"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(9,20,38,0.88) 0%, rgba(9,20,38,0.45) 45%, rgba(150,71,53,0.55) 62%, rgba(150,71,53,0.88) 100%)" }} />
          <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 md:gap-3 md:p-8">
            <Logo className="h-6 w-auto brightness-0 invert md:h-9" />
            <h1 className="max-w-xl text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">
              {t("title")}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-white/85 sm:text-sm md:text-base">
              {t("subtitle")}
            </p>
          </div>
        </section>

        {/* Search */}
        <section>
          <form method="GET" className="flex gap-2">
            {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
            {cityFilter && <input type="hidden" name="city" value={cityFilter} />}
            {sort !== "recommended" && <input type="hidden" name="sort" value={sort} />}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a6]" />
              <input
                name="q"
                suppressHydrationWarning
                defaultValue={sp.q ?? ""}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-full border border-[#c5c6cd]/60 bg-white py-3 pe-4 ps-10 text-sm outline-none placeholder:text-[#9aa0a6] focus:border-[#091426]"
              />
            </div>
            <button suppressHydrationWarning className="mp-solid shrink-0 rounded-full px-5 py-3 text-sm font-semibold text-white">
              {t("searchPlaceholder").split("…")[0]}
            </button>
          </form>
        </section>

        {/* Hot deals ad space */}
        <HotDeals locale={locale} />

        {/* Nearby (location permission → distance-ranked carousel) */}
        <NearbyStores />

        {/* Type chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={hrefWith({ type: "" })}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold",
              !typeFilter ? "mp-solid border-transparent text-white" : "border-[#c5c6cd]/60 bg-white text-[#45474c]",
            )}
          >
            {t("allTypes")}
          </Link>
          {typeOrder.map((b) => (
            <Link
              key={b}
              href={hrefWith({ type: b })}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold",
                typeFilter === b ? "mp-solid border-transparent text-white" : "border-[#c5c6cd]/60 bg-white text-[#45474c]",
              )}
            >
              {t(`type_${b}` as never)}
            </Link>
          ))}
        </div>

        {/* City + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <FilterSelects cities={cities} />
          </Suspense>
          {(q || typeFilter || cityFilter) && (
            <Link href="/" className="text-xs font-semibold text-[#45474c] underline">
              {t("allTypes")} ✕
            </Link>
          )}
        </div>

        {/* Store grid */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-[#091426]">
            {t("allStores")} <span className="text-sm font-medium text-[#9aa0a6]">({sorted.length})</span>
          </h2>
          {allStores.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#c5c6cd] bg-white px-5 py-10 text-center text-sm text-[#45474c]">
              {t("noStoresYet")}
            </p>
          ) : sorted.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#c5c6cd] bg-white px-5 py-10 text-center text-sm text-[#45474c]">
              {t("noStores")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4">
              {sorted.map((s) => (
                <StoreCard key={s.id} store={s} locale={locale} isFavorite={favIds.has(s.id)} signedIn={Boolean(userId)} />
              ))}
            </div>
          )}
        </section>

        {/* Personal rails for signed-in clients (compact carousels AFTER
            the stores, so browsing + filters stay near the top). Guests see
            About + partner CTA instead (below). */}
        {userId ? (
          <>
            {upNext && <UpNextCard booking={upNext} />}
            <NumbersStrip points={points} referralBalance={referralBalance} locale={locale} />
            <QuickRebookRow items={quickRebook} />
            <ForYouRow stores={forYou} locale={locale} />
            <ContinueRow />
          </>
        ) : (
          <>
        {/* About us */}
        <SectionSeparator />
        <section className="overflow-hidden rounded-3xl border border-[#c5c6cd]/60 bg-white">
          <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_1fr] md:gap-8 md:p-8">
            <div className="flex flex-col justify-center">
              <span className="mp-solid w-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                {t("aboutEyebrow")}
              </span>
              <h2 className="mt-3 text-xl font-bold text-[#091426] md:text-2xl">{t("aboutTitle")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#45474c] md:text-base">{t("aboutBody")}</p>
            </div>
            <ul className="flex flex-col">
              {[
                { n: "01", title: t("aboutPoint1Title"), body: t("aboutPoint1Body") },
                { n: "02", title: t("aboutPoint2Title"), body: t("aboutPoint2Body") },
                { n: "03", title: t("aboutPoint3Title"), body: t("aboutPoint3Body") },
              ].map((p) => (
                <li key={p.n} className="flex items-baseline gap-4 border-t border-[#c5c6cd]/50 py-5 first:border-t-0 first:pt-1 last:pb-1">
                  <span className="shrink-0 text-3xl font-bold tabular-nums text-[#c5c6cd] md:text-4xl">
                    {p.n}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-[#091426] md:text-base">{p.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[#45474c] md:text-sm">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Partner CTA */}
        <SectionSeparator />
        <section className="relative overflow-hidden rounded-3xl">
          <Image
            src="/about.jpg"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1152px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/15" />
          <div className="relative flex flex-col items-center gap-4 px-6 py-10 text-center md:py-14">
            <h2 className="max-w-xl text-xl font-bold leading-snug text-white md:text-2xl">{t("partnerCtaTitle")}</h2>
            <p className="max-w-xl text-sm leading-relaxed text-white/85 md:text-base">{t("partnerCtaBody")}</p>
            <Link
              href="/partners"
              className="rounded-full bg-white px-8 py-3 text-sm font-bold text-[#091426] transition-colors hover:bg-[#eff1f3] md:text-base"
            >
              {t("partnerCtaButton")}
            </Link>
          </div>
        </section>
          </>
        )}
      </div>

      <MarketplaceFooter locale={locale} />

      <MarketplaceTabs guest={!userId} />
    </main>
  );
}
