import { Flame } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listHotPackages } from "@/lib/marketplace/stores";

/**
 * "Hot deals" ad space directly under the hero: active packages from
 * listed stores, horizontally scrollable. Always renders so the slot is
 * stable; shows a quiet placeholder until stores publish packages.
 */
export async function HotDeals({ locale }: { locale: string }) {
  const t = await getTranslations("marketplace");
  const moneyLocale = locale === "ar" ? "ar-EG" : "en-US";
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
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {deals.map((d) => (
            <Link
              key={d.id}
              href={`/book/${d.slug}`}
              className="flex w-56 shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl bg-white p-4 text-[#091426] shadow-lg transition-transform active:scale-[0.98]"
            >
              <div>
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {t("hotBadge")}
                </span>
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug">{d.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#45474c]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eff1f3] text-[10px] font-bold text-[#091426]">
                    {d.logoUrl ? <img src={d.logoUrl} alt="" className="h-full w-full object-cover" /> : d.businessName.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{d.businessName}</span>
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span dir="ltr" className="text-lg font-bold tabular-nums">
                  {d.price.toLocaleString(moneyLocale)}
                </span>
                <span className="mp-solid rounded-full px-4 py-1.5 text-xs font-bold text-white">
                  {t("book")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
