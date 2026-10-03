import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { MarketplaceStore } from "@/lib/marketplace/stores";
import { getBusinessTypeConfig, getThemeTokens } from "@/config/business-types";
import type { BusinessType } from "@/db/schema";
import { FavoriteButton } from "@/components/marketplace/favorite-button";

/**
 * One store card in the marketplace grid. Links to the store's own
 * booking page (/book/[slug]). Themed by the STORE's gender theme
 * (male blue / female terracotta), not the viewer's.
 */
export async function StoreCard({
  store,
  locale,
  distanceKm,
  isFavorite,
  signedIn,
}: {
  store: MarketplaceStore;
  locale: string;
  distanceKm?: number | null;
  isFavorite?: boolean;
  signedIn?: boolean;
}) {
  const t = await getTranslations("marketplace");
  const moneyLocale = locale === "ar" ? "ar-EG" : "en-US";
  const initials = store.businessName.trim().charAt(0).toUpperCase() || "S";
  const th = getThemeTokens(getBusinessTypeConfig(store.businessType as BusinessType).theme);

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md"
      style={{
        backgroundColor: th.primary,
        backgroundImage: `linear-gradient(150deg, ${th.primary} 0%, ${th.primaryContainer} 140%)`,
        color: th.onPrimary,
      }}
    >
      <Link href={`/book/${store.slug}`} className="block">
        <div
          className="relative h-32 w-full overflow-hidden"
          style={{ backgroundImage: `linear-gradient(135deg, ${th.primaryContainer} 0%, ${th.primary} 100%)` }}
        >
          {store.coverUrl ? (
            <img src={store.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : store.shopImages[0] ? (
            <img src={store.shopImages[0]} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to top, ${th.primary} 5%, transparent 75%)` }}
          />
          <span
            className="absolute bottom-2 start-2 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: th.onPrimary, color: th.primary }}
          >
            {t(`type_${store.businessType}` as never)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-start gap-2.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold"
              style={{ backgroundColor: th.onPrimary, color: th.primary }}
            >
              {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold" style={{ color: th.onPrimary }}>{store.businessName}</h3>
              <p className="truncate text-xs opacity-75" style={{ color: th.onPrimary }}>
                {[store.city, distanceKm != null ? t("kmAway", { km: distanceKm.toFixed(1) }) : null]
                  .filter(Boolean)
                  .join(" · ") || store.tagline || ""}
              </p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: th.onPrimary }}>
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {store.ratingCount > 0 ? (
                <>
                  {store.ratingAvg.toFixed(1)}
                  <span className="font-normal opacity-60">({store.ratingCount})</span>
                </>
              ) : (
                <span className="font-normal opacity-60">{t("new")}</span>
              )}
            </span>
            {store.priceFrom != null && (
              <span className="text-xs opacity-75" style={{ color: th.onPrimary }}>
                {t("from")}{" "}
                <b dir="ltr" className="tabular-nums" style={{ color: th.onPrimary }}>
                  {store.priceFrom.toLocaleString(moneyLocale)}
                </b>
              </span>
            )}
          </div>
        </div>
      </Link>
      {signedIn && (
        <div className="absolute end-2 top-2">
          <FavoriteButton tenantId={store.id} initial={isFavorite ?? false} />
        </div>
      )}
    </div>
  );
}
