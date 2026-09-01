"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

const PLANS = [
  {
    key: "basic",
    features: ["management", "booking", "whatsappManager", "whatsappWorkers", "whatsappClients"] as const,
    basePrice: 800,
  },
  {
    key: "pro",
    features: ["included", "ads", "performance", "aiAssistant", "campaigns"] as const,
    basePrice: 1200,
    popular: true,
  },
  {
    key: "custom",
    features: ["everything", "tailored", "support", "flexible"] as const,
    customPrice: true,
  },
] as const;

const BILLING = [
  { key: "billing1m", months: 1, off: 0 },
  { key: "billing3m", months: 3, off: 0.1 },
  { key: "billing6m", months: 6, off: 0.2 },
  { key: "billing1y", months: 12, off: 0.4 },
] as const;

function discountedPrice(base: number, off: number) {
  return Math.round(base * (1 - off));
}

export function PricingSection() {
  const t = useTranslations("pricing");
  const trackRef = useRef<HTMLDivElement>(null);
  const [billing, setBilling] = useState<(typeof BILLING)[number]>(BILLING[0]);

  const scrollCarousel = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-pricing-card]");
    if (!card) return;
    const gap = 16;
    const step = card.offsetWidth + gap;
    const from = track.scrollLeft;
    const snap = step * Math.round(from / step);
    track.scrollTo({ left: snap + dir * step, behavior: "smooth" });
  };

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
      <div className="mb-8 max-w-2xl md:mb-10">
        <h2 className="text-2xl font-bold text-[#091426] md:text-4xl">{t("title")}</h2>
        <p className="mt-3 text-base text-[#45474c] md:text-lg">{t("subtitle")}</p>
      </div>

      {/* Billing toggle */}
      <div className="mb-8 flex flex-col items-start gap-3 md:items-center">
        <span className="text-sm font-semibold text-[#45474c]">{t("billingLabel")}</span>
        <div className="flex w-full max-w-full gap-2 overflow-x-auto rounded-full border border-[#c5c6cd]/60 bg-white p-1 md:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BILLING.map((b) => {
            const active = billing.key === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setBilling(b)}
                className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:py-2 sm:text-sm"
                style={{
                  backgroundColor: active ? "#091426" : "transparent",
                  color: active ? "#ffffff" : "#45474c",
                }}
              >
                {t(b.key)}
                {b.off > 0 && (
                  <span className={`ms-1 text-xs ${active ? "text-emerald-300" : "text-emerald-600"}`}>
                    −{Math.round(b.off * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Carousel */}
      <div className="relative">
        {/* Prev / Next arrows (mobile only) */}
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scrollCarousel(-1)}
          className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#c5c6cd]/60 bg-white text-[#091426] shadow-md transition-colors hover:bg-[#f2f4f6] md:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => scrollCarousel(1)}
          className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#c5c6cd]/60 bg-white text-[#091426] shadow-md transition-colors hover:bg-[#f2f4f6] md:hidden"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 pt-6 md:scroll-mx-0 md:mx-auto md:max-w-5xl md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {PLANS.map((plan) => {
            const featured = "popular" in plan && plan.popular;
            const customPrice = "customPrice" in plan;
            const discount = customPrice ? 0 : billing.off;
            const base = customPrice ? 0 : plan.basePrice;
            const current = customPrice ? null : discountedPrice(base, discount);
            const showOld = !customPrice && discount > 0;

            return (
              <div
                key={plan.key}
                data-pricing-card
                className={`relative flex w-3/4 max-w-[20rem] shrink-0 snap-center flex-col rounded-2xl border p-5 md:w-auto md:max-w-none md:snap-none md:min-w-0 md:p-6 ${
                  featured
                    ? "border-[#091426] bg-[#091426] text-white shadow-lg"
                    : "border-[#c5c6cd]/60 bg-white"
                }`}
              >
                {featured && (
                  <span className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#091426]">
                    {t("popular")}
                  </span>
                )}
                <h3 className={`text-sm font-semibold uppercase tracking-wide md:text-base ${featured ? "text-white" : "text-[#091426]"}`}>
                  {t(`plans.${plan.key}.name`)}
                </h3>

                {/* Price */}
                <div className="mt-3 flex items-baseline gap-2">
                  {customPrice ? (
                    <span className={`text-2xl font-bold md:text-4xl ${featured ? "text-white" : "text-[#091426]"}`}>
                      {t(`plans.${plan.key}.priceLabel`)}
                    </span>
                  ) : (
                    <>
                      {showOld && (
                        <span
                          className={`text-base font-semibold line-through md:text-xl ${
                            featured ? "text-white/50" : "text-[#9aa0a6]"
                          }`}
                        >
                          {base}
                        </span>
                      )}
                      <span className={`text-2xl font-bold md:text-4xl ${featured ? "text-white" : "text-[#091426]"}`}>
                        {current}
                      </span>
                      <span className={`text-xs md:text-sm ${featured ? "text-white/70" : "text-[#45474c]"}`}>
                        {t("billed")}
                      </span>
                    </>
                  )}
                </div>

                {/* Off badge */}
                {!customPrice && discount > 0 && (
                  <span
                    className={`mt-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      featured ? "bg-emerald-400 text-[#0f5132]" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {t("off", { pct: String(Math.round(discount * 100)) })}
                  </span>
                )}

                <p className={`mt-2 text-xs leading-relaxed md:text-sm ${featured ? "text-white/80" : "text-[#45474c]"}`}>
                  {t(`plans.${plan.key}.description`)}
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs md:text-sm">
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 md:h-4 md:w-4 ${featured ? "text-white" : "text-[#091426]"}`}
                        strokeWidth={3}
                      />
                      <span className={featured ? "text-white/80" : "text-[#45474c]"}>
                        {t(`plans.${plan.key}.features.${f}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/sign-up"
                  className={`mt-5 rounded-full px-5 py-2.5 text-center text-xs font-semibold md:mt-6 md:px-6 md:py-3 md:text-sm ${
                    featured
                      ? "bg-white text-[#091426] hover:bg-[#eff1f3]"
                      : "bg-[#091426] text-white hover:bg-[#1e293b]"
                  }`}
                >
                  {t("choose")}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}