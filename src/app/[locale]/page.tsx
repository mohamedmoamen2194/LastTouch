import { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getOptionalUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { clientFavorites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listMarketplaceStores, orderedBusinessTypes } from "@/lib/marketplace/stores";
import { distanceKm } from "@/lib/marketplace/geo";
import { clientAccentForGender, getClientBookings, getClientPointsTotal, getClientProfile } from "@/lib/marketplace/client";
import { getReferralStats } from "@/lib/marketplace/referrals";
import { ForYouRow, NumbersStrip, QuickRebookRow, UpNextCard } from "@/components/marketplace/personal-section";
import { ContinueRow } from "@/components/marketplace/continue-row";
import { Logo } from "@/components/booking/logo";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { NearbyToggle } from "@/components/marketplace/nearby-toggle";
import { MarketplaceSearch } from "@/components/marketplace/search-bar";
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

type SearchParams = { q?: string; type?: string; city?: string; sort?: string; nearby?: string; lat?: string; lng?: string };

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
  const nearbyOn = sp.nearby === "1";
  const userLat = sp.lat != null && sp.lat !== "" ? Number(sp.lat) : null;
  const userLng = sp.lng != null && sp.lng !== "" ? Number(sp.lng) : null;
  const hasCoords = nearbyOn && userLat != null && userLng != null && !Number.isNaN(userLat) && !Number.isNaN(userLng);

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

  // Distance per store when nearby mode has coords; nearby always wins over
  // the sort dropdown (even with filters active). Stores without coords sink.
  const withDistance = filtered.map((s) => ({
    store: s,
    km:
      hasCoords && s.latitude != null && s.longitude != null
        ? distanceKm(userLat as number, userLng as number, s.latitude, s.longitude)
        : null,
  }));

  const sorted = [...withDistance].sort((a, b) => {
    if (hasCoords) {
      if (a.km == null && b.km == null) return b.store.ratingAvg - a.store.ratingAvg;
      if (a.km == null) return 1;
      if (b.km == null) return -1;
      return a.km - b.km;
    }
    if (sort === "rating") return b.store.ratingAvg - a.store.ratingAvg || b.store.ratingCount - a.store.ratingCount;
    if (sort === "name") return a.store.businessName.localeCompare(b.store.businessName, locale);
    // recommended: rated stores first, then most-reviewed
    return b.store.ratingAvg - a.store.ratingAvg || b.store.ratingCount - a.store.ratingCount;
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
    const next = {
      q: sp.q ?? "",
      type: typeFilter,
      city: cityFilter,
      sort,
      nearby: sp.nearby ?? "",
      lat: sp.lat ?? "",
      lng: sp.lng ?? "",
      ...over,
    };
    if (next.q) p.set("q", next.q);
    if (next.type) p.set("type", next.type);
    if (next.city) p.set("city", next.city);
    if (next.sort && next.sort !== "recommended") p.set("sort", next.sort);
    if (next.nearby) {
      p.set("nearby", next.nearby);
      if (next.lat) p.set("lat", next.lat);
      if (next.lng) p.set("lng", next.lng);
    }
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
          <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 p-5 pb-6 text-center md:gap-3 md:p-8 md:pb-10">
            <Logo className="h-6 w-auto -translate-y-1 brightness-0 invert md:h-9" />
            <h1 className="max-w-xl text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">
              {t("title")}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-white/85 sm:text-sm md:text-base">
              {t("subtitle")}
            </p>
          </div>
        </section>

        {/* Search (instant suggestions + results panel under the bar, no scroll jump) */}
        <section>
          <MarketplaceSearch
            keep={{
              type: typeFilter || undefined,
              city: cityFilter || undefined,
              sort: sort !== "recommended" ? sort : undefined,
              nearby: sp.nearby ?? undefined,
              lat: sp.lat ?? undefined,
              lng: sp.lng ?? undefined,
            }}
          />
        </section>

        {/* Hot deals ad space */}
        <HotDeals locale={locale} />

        {/* Nearby toggle (sorts the grid below by distance) */}
        <NearbyToggle />

        {/* Type chips (scroll:false so filters never jump to top) */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={hrefWith({ type: "" })}
            scroll={false}
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
              scroll={false}
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
            <Link href="/" scroll={false} className="text-xs font-semibold text-[#45474c] underline">
              {t("allTypes")} ✕
            </Link>
          )}
        </div>

        {/* Store grid (nearby distance shown on cards when enabled) */}
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
              {sorted.map(({ store: s, km }) => (
                <StoreCard key={s.id} store={s} locale={locale} distanceKm={km} isFavorite={favIds.has(s.id)} signedIn={Boolean(userId)} />
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
