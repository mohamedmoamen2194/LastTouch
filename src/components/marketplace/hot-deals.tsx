import { Flame } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { listHotPackages } from "@/lib/marketplace/stores";
import { HotDealsCarousel } from "@/components/marketplace/hot-deals-carousel";

/**
 * "Hot picks" ad space directly under the hero: full hero-width carousel
 * (one wide centered card at a time, auto-advancing). Always renders so
 * the slot is stable; shows a quiet placeholder until stores publish packages.
 */
export async function HotDeals({ locale: _locale }: { locale: string }) {
  void _locale;
  const t = await getTranslations("marketplace");
  const deals = await listHotPackages(8);

  return (
    <section aria-label={t("hotDealsTitle")}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <Flame className="h-4 w-4 fill-orange-400 text-orange-400" />
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight text-[#091426]">{t("hotDealsTitle")}</h2>
          <p className="text-xs text-[#45474c]">{t("hotDealsSubtitle")}</p>
        </div>
      </div>
      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#c5c6cd] bg-white/70 px-5 py-8 text-center text-xs leading-relaxed text-[#9aa0a6]">
          {t("hotDealsEmpty")}
        </div>
      ) : (
        <div className="mx-auto w-full">
          <HotDealsCarousel deals={deals} />
        </div>
      )}
    </section>
  );
}
