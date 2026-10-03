"use client";

import { useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Nearby toggle: when enabled, geolocates once and pins
 * `?nearby=1&lat=..&lng=..` in the URL (scroll: false) so the server
 * sorts the (already filtered) stores by distance. Disabling removes it.
 * Survives type/city/sort/search changes.
 */
export function NearbyToggle() {
  const t = useTranslations("marketplace");
  const router = useRouter();
  const sp = useSearchParams();
  const enabled = sp.get("nearby") === "1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const enable = () => {
    if (!("geolocation" in navigator)) {
      setError(true);
      return;
    }
    setBusy(true);
    setError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(sp.toString());
        p.set("nearby", "1");
        p.set("lat", String(pos.coords.latitude));
        p.set("lng", String(pos.coords.longitude));
        router.replace(`/?${p.toString()}`, { scroll: false });
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError(true);
      },
      { timeout: 10000 },
    );
  };

  const disable = () => {
    const p = new URLSearchParams(sp.toString());
    p.delete("nearby");
    p.delete("lat");
    p.delete("lng");
    const qs = p.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    setError(false);
  };

  if (enabled) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full items-center justify-between gap-2 rounded-2xl bg-[#091426] px-4 py-3 text-sm font-semibold text-white">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("nearbyOn")}</span>
          </span>
          <button
            type="button"
            onClick={disable}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/25"
          >
            <X className="h-3.5 w-3.5" />
            {t("nearbyOff")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className={cn(
          "mp-solid flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-70",
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        {busy ? t("locating") : t("nearMe")}
      </button>
      {error && (
        <p className="rounded-2xl border border-[#c5c6cd]/60 bg-white px-5 py-3 text-center text-xs leading-relaxed text-[#45474c]">
          {t("locationDenied")}
        </p>
      )}
    </div>
  );
}
