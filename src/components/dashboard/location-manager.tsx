"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MapPin } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type LocationValue = {
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Owner location editor (settings): address + city + coordinates with a
 * "use my current location" helper. Saved to the primary branch.
 */
export function LocationManager({
  slug,
  theme,
  initial,
}: {
  slug: string;
  theme: ThemeTokens;
  initial: LocationValue | null;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [lat, setLat] = useState(initial?.latitude != null ? String(initial.latitude) : "");
  const [lng, setLng] = useState(initial?.longitude != null ? String(initial.longitude) : "");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const useCurrent = () => {
    if (!("geolocation" in navigator)) {
      setError(t("locationDenied"));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(t("locationDenied"));
      },
      { timeout: 10000 },
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const latitude = lat.trim() === "" ? null : Number(lat);
      const longitude = lng.trim() === "" ? null : Number(lng);
      if ((latitude != null && Number.isNaN(latitude)) || (longitude != null && Number.isNaN(longitude))) {
        throw new Error(t("locationInvalid"));
      }
      const res = await fetch("/api/admin/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, address: address || null, city: city || null, latitude, longitude }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const mapsUrl =
    lat.trim() !== "" && lng.trim() !== ""
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat.trim()},${lng.trim()}`)}`
      : address.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
        : null;

  return (
    <section className="rounded-2xl border p-5 md:p-6" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
        >
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg" style={{ color: theme.primary }}>
            {t("locationTitle")}
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm" style={{ color: theme.onSurfaceVariant }}>
            {t("locationHint")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>
            {t("locationAddress")}
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("locationAddressPlaceholder")}
            className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.primary }}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>
            {t("locationCity")}
          </span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("locationCityPlaceholder")}
            className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.primary }}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>
              {t("locationLat")}
            </span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="30.0444"
              inputMode="decimal"
              dir="ltr"
              className="w-full rounded-lg border px-4 py-2.5 text-sm tabular-nums outline-none"
              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.primary }}
            />
          </label>
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>
              {t("locationLng")}
            </span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="31.2357"
              inputMode="decimal"
              dir="ltr"
              className="w-full rounded-lg border px-4 py-2.5 text-sm tabular-nums outline-none"
              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.primary }}
            />
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg px-4 py-2.5 text-xs" style={{ backgroundColor: "#ba1a1a", color: "#fff" }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-3 rounded-lg px-4 py-2.5 text-xs font-semibold" style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}>
          {t("locationSaved")}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {busy ? t("saving") : t("saveLocation")}
        </button>
        <button
          type="button"
          onClick={useCurrent}
          disabled={locating || busy}
          className="flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: theme.outlineVariant, color: theme.primary }}
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {t("useCurrentLocation")}
        </button>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-center text-xs font-semibold underline sm:ms-auto" style={{ color: theme.secondary }}>
            {t("previewOnMap")}
          </a>
        )}
      </div>
    </section>
  );
}
