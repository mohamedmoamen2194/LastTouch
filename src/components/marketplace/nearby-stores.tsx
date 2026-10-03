"use client";

import { useState } from "react";
import { Loader2, MapPin, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { distanceKm } from "@/lib/marketplace/geo";
import type { MarketplaceStore } from "@/lib/marketplace/stores";

type Located = MarketplaceStore & { km: number };

/**
 * "Near me" section: asks for location permission, then ranks stores with
 * coordinates by distance. Stores without coordinates are hidden here.
 */
export function NearbyStores() {
  const t = useTranslations("marketplace");
  const [state, setState] = useState<"idle" | "locating" | "denied" | "done">("idle");
  const [stores, setStores] = useState<Located[]>([]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState("denied");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/marketplace/stores");
          const json = await res.json();
          const all = (json.data?.stores ?? []) as MarketplaceStore[];
          const ranked = all
            .filter((s) => s.latitude != null && s.longitude != null)
            .map((s) => ({
              ...s,
              km: distanceKm(pos.coords.latitude, pos.coords.longitude, s.latitude!, s.longitude!),
            }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 6);
          setStores(ranked);
          setState("done");
        } catch {
          setState("denied");
        }
      },
      () => setState("denied"),
      { timeout: 10000 },
    );
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        suppressHydrationWarning
        onClick={locate}
        className="mp-solid flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white"
      >
        <MapPin className="h-4 w-4" />
        {t("nearMe")}
      </button>
    );
  }

  if (state === "locating") {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#c5c6cd]/60 bg-white px-5 py-3.5 text-sm font-medium text-[#45474c]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("locating")}
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="rounded-2xl border border-[#c5c6cd]/60 bg-white px-5 py-3.5 text-center text-xs leading-relaxed text-[#45474c]">
        {t("locationDenied")}
      </p>
    );
  }

  if (stores.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-[#091426]">{t("nearbyTitle")}</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stores.map((s) => (
          <Link
            key={s.id}
            href={`/book/${s.slug}`}
            className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white"
          >
            <div className="flex h-20 items-center justify-center bg-gradient-to-br from-[#1e293b] to-[#091426] text-xl font-bold text-white">
              {s.logoUrl ? <img src={s.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : s.businessName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2.5">
              <p className="truncate text-xs font-bold text-[#091426]">{s.businessName}</p>
              <p className="flex items-center gap-1 text-[11px] text-[#45474c]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : t("new")}
                <span>·</span>
                <span className="tabular-nums">{t("kmAway", { km: s.km.toFixed(1) })}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
