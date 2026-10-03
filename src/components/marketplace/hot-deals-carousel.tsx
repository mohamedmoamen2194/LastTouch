"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgePercent, ChevronLeft, ChevronRight, Flame, MapPin, Scissors } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getBusinessTypeConfig, getThemeTokens } from "@/config/business-types";
import type { BusinessType } from "@/db/schema";
import type { HotPackage } from "@/lib/marketplace/stores";

const AUTOPLAY_MS = 5000;

/**
 * Hero-width hot-picks carousel: one wide centered card at a time
 * (same width as the hero banner), auto-advancing when 2+ picks exist.
 * Shows store name big, included services, full price strikethrough +
 * current price + savings badge.
 */
export function HotDealsCarousel({ deals }: { deals: HotPackage[] }) {
  const t = useTranslations("marketplace");
  const locale = useLocale();
  const moneyLocale = locale === "ar" ? "ar-EG" : "en-US";
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = deals.length;

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + count) % count),
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [count, paused]);

  useEffect(() => setIndex(0), [count]);

  if (count === 0) return null;
  const isRtl = locale === "ar";

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Viewport: full hero width, compact height like before */}
      <div
        className="overflow-hidden rounded-3xl"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
          setPaused(true);
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          setPaused(false);
          if (start == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? start) - start;
          if (Math.abs(dx) < 40) return;
          // In RTL a swipe-left means "previous".
          const dir = dx < 0 ? 1 : -1;
          setIndex((i) => (i + (isRtl ? -dir : dir) + count) % count);
        }}
      >
        {/* Track stays LTR so translate math is stable; slides set their own dir. */}
        <div
          dir="ltr"
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {deals.map((d) => {
            const full = d.fullPrice > 0 ? d.fullPrice : null;
            const save = full != null && full > d.price ? full - d.price : 0;
            const bg = d.coverUrl ?? d.shopImage;
            // Card follows the STORE's gender theme (not the viewer's):
            // barber shops get the blue male theme, salons/spas get the
            // female theme. Text uses the theme's contrast color.
            const th = getThemeTokens(
              getBusinessTypeConfig(d.businessType as BusinessType).theme,
            );
            return (
              <div key={d.id} dir={isRtl ? "rtl" : "ltr"} className="w-full shrink-0">
                <Link
                  href={`/book/${d.slug}`}
                  scroll={false}
                  className="group relative flex min-h-[148px] w-full flex-col justify-between gap-3 overflow-hidden rounded-3xl p-4 shadow-lg sm:min-h-[156px] sm:p-5"
                  style={{
                    backgroundColor: th.primary,
                    backgroundImage: `linear-gradient(135deg, ${th.primary} 0%, ${th.primaryContainer} 130%)`,
                    color: th.onPrimary,
                  }}
                >
                  {/* faint cover backdrop, tinted with the theme color */}
                  {bg && (
                    <>
                      <img src={bg} alt="" aria-hidden loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ background: `linear-gradient(to top, ${th.primary} 15%, transparent 90%)` }}
                      />
                    </>
                  )}
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Flame className="h-3 w-3 fill-white" />
                        {t("hotBadge")}
                      </span>
                      {save > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white">
                          <BadgePercent className="h-3 w-3" />
                          {t("saveAmount", { amount: `${save.toLocaleString(moneyLocale)}` })}
                        </span>
                      )}
                    </div>
                    {/* Store name: big and prominent */}
                    <p
                      className="mt-2 truncate text-xl font-black leading-tight sm:text-2xl"
                      style={{ color: th.onPrimary }}
                    >
                      {d.businessName}
                    </p>
                    <p
                      className="mt-0.5 truncate text-sm font-bold opacity-85"
                      style={{ color: th.onPrimary }}
                    >
                      {d.name}
                    </p>
                    {/* Included services */}
                    {d.serviceNames.length > 0 && (
                      <p
                        className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed opacity-75"
                        style={{ color: th.onPrimary }}
                      >
                        <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2 min-w-0">
                          {d.serviceNames.join(" · ")}
                        </span>
                      </p>
                    )}
                    <p
                      className="mt-1 flex items-center gap-1 text-[11px] opacity-60"
                      style={{ color: th.onPrimary }}
                    >
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {t(`type_${d.businessType}` as never)}
                      </span>
                    </p>
                  </div>
                  <div className="relative flex items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {full != null && full > d.price && (
                        <span
                          dir="ltr"
                          className="text-sm font-semibold tabular-nums opacity-60 line-through"
                          style={{ color: th.onPrimary }}
                        >
                          {full.toLocaleString(moneyLocale)}
                        </span>
                      )}
                      <span
                        dir="ltr"
                        className="text-2xl font-black tabular-nums"
                        style={{ color: th.onPrimary }}
                      >
                        {d.price.toLocaleString(moneyLocale)}
                      </span>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-5 py-2 text-xs font-bold transition-transform group-active:scale-95"
                      style={{ backgroundColor: th.onPrimary, color: th.primary }}
                    >
                      {t("book")}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls: only when 2+ picks */}
      {count > 1 && (
        <>
          <div className="pointer-events-none absolute inset-y-0 start-2 flex items-center">
            <button
              type="button"
              aria-label="previous"
              onClick={() => go(isRtl ? 1 : -1)}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#091426] shadow-md transition-transform active:scale-95"
            >
              <ChevronLeft className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 end-2 flex items-center">
            <button
              type="button"
              aria-label="next"
              onClick={() => go(isRtl ? -1 : 1)}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#091426] shadow-md transition-transform active:scale-95"
            >
              <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            {deals.map((d, i) => (
              <button
                key={d.id}
                type="button"
                aria-label={`go to ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "mp-solid w-6" : "w-1.5 bg-[#c5c6cd]",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
