import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { MarketplaceStore } from "@/lib/marketplace/stores";
import { FavoriteButton } from "@/components/marketplace/favorite-button";

/**
 * One store card in the marketplace grid. Links to the store's own
 * booking page (/book/[slug]).
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

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/book/${store.slug}`} className="block">
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-[#1e293b] to-[#091426]">
          {store.coverUrl ? (
            <img src={store.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : store.shopImages[0] ? (
            <img src={store.shopImages[0]} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-[#091426]">
            {t(`type_${store.businessType}` as never)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-lg font-bold text-[#091426]">
              {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-[#091426]">{store.businessName}</h3>
              <p className="truncate text-xs text-[#45474c]">
                {[store.city, distanceKm != null ? t("kmAway", { km: distanceKm.toFixed(1) }) : null]
                  .filter(Boolean)
                  .join(" · ") || store.tagline || ""}
              </p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-semibold text-[#091426]">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {store.ratingCount > 0 ? (
                <>
                  {store.ratingAvg.toFixed(1)}
                  <span className="font-normal text-[#9aa0a6]">({store.ratingCount})</span>
                </>
              ) : (
                <span className="font-normal text-[#9aa0a6]">{t("new")}</span>
              )}
            </span>
            {store.priceFrom != null && (
              <span className="text-xs text-[#45474c]">
                {t("from")}{" "}
                <b dir="ltr" className="tabular-nums text-[#091426]">
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
