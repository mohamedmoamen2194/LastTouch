"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

export type PartnerStore = {
  slug: string;
  businessName: string;
  businessType: string;
  logoUrl: string | null;
};

/**
 * A card for a partner store shown inside the StoresMarquee. Shows the store's
 * logo on top (falling back to the LastTouch logo when none is set) with the
 * business name underneath. Rendered twice by the marquee for the seamless loop.
 */
export function StorePill({ store, businessTypeLabel }: { store: PartnerStore; businessTypeLabel: string }) {
  const locale = useLocale();

  return (
    <Link
      href={`/${locale}/book/${store.slug}`}
      className="flex w-28 flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-center backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/15 sm:w-32"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ backgroundColor: store.logoUrl ? "rgba(255,255,255,0.12)" : "#ffffff" }}
      >
        <img
          src={store.logoUrl ?? "/logo.svg"}
          alt={store.businessName}
          className={store.logoUrl ? "h-full w-full object-cover" : "h-6 w-auto object-contain"}
        />
      </span>
      <span className="flex w-full flex-col leading-tight">
        <span className="w-full truncate text-sm font-semibold text-white">{store.businessName}</span>
        {businessTypeLabel && <span className="w-full truncate text-[11px] text-white/60">{businessTypeLabel}</span>}
      </span>
    </Link>
  );
}