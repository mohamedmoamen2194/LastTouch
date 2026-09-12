"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, LogOut, Star } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type OpenVisit = {
  id: string;
  customerName: string | null;
  phone: string | null;
  checkInAt: string;
} | null;

function deviceKeyFor(slug: string): string {
  const lsKey = `lt-checkin-${slug}`;
  try {
    let key = window.localStorage.getItem(lsKey);
    if (!key) {
      key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(lsKey, key);
    }
    return key;
  } catch {
    return "";
  }
}

export function CheckinWidget({
  slug,
  theme,
  businessName,
  storeRating,
  workers,
}: {
  slug: string;
  theme: ThemeTokens;
  businessName: string;
  storeRating: { avg: number; count: number } | null;
  workers: { name: string; rating: number }[];
}) {
  const t = useTranslations("checkin");
  const [deviceKey, setDeviceKey] = useState("");
  const [open, setOpen] = useState<OpenVisit>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDeviceKey(deviceKeyFor(slug));
  }, [slug]);

  const call = useCallback(
    async (action: "status" | "checkin" | "checkout", payload: Record<string, unknown>) => {
      const res = await fetch(`/api/visits?slug=${encodeURIComponent(slug)}&action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      return json.data;
    },
    [slug],
  );

  // Device-aware: if THIS device already has an open visit, offer check-out.
  useEffect(() => {
    if (!deviceKey) return;
    setLoading(true);
    call("status", { deviceKey })
      .then((d) => setOpen(d.open as OpenVisit))
      .catch(() => setOpen(null))
      .finally(() => setLoading(false));
  }, [deviceKey, call]);

  const doCheckin = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const d = await call("checkin", { deviceKey, phone, customerName: name });
      setOpen(d.visit as OpenVisit);
      setNotice(t("checkedIn"));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const doCheckout = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await call("checkout", { deviceKey, phone: phone || open?.phone });
      setOpen(null);
      setNotice(t("checkedOut"));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold md:text-3xl" style={{ color: theme.primary }}>
          {businessName}
        </h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {t("subtitle")}
        </p>
      </div>

      {/* Manual check in / out — always visible as a fallback */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={doCheckin}
          disabled={busy || loading || open !== null}
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-bold disabled:opacity-40"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <LogIn className="h-5 w-5" />
          {t("checkIn")}
        </button>
        <button
          type="button"
          onClick={doCheckout}
          disabled={busy || loading || open === null}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 text-base font-bold disabled:opacity-40"
          style={{ borderColor: theme.primary, color: theme.primary }}
        >
          <LogOut className="h-5 w-5" />
          {t("checkOut")}
        </button>
      </div>

      {loading ? (
        <p className="text-center text-sm" style={{ color: theme.onSurfaceVariant }}>
          {t("loading")}
        </p>
      ) : (
        open && (
          <div
            className="rounded-2xl border px-5 py-4 text-center"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
          >
            <p className="text-sm font-semibold" style={{ color: theme.primary }}>
              {t("visitProgress")}
            </p>
            <p className="mt-1 text-xs tabular-nums" style={{ color: theme.onSurfaceVariant }}>
              {new Date(open.checkInAt).toLocaleString()}
              {open.customerName ? ` · ${open.customerName}` : ""}
            </p>
          </div>
        )
      )}

      {notice && (
        <div
          className="rounded-xl px-4 py-3 text-center text-sm font-medium"
          style={{ backgroundColor: theme.primaryContainer, color: theme.onSurfaceVariant }}
        >
          {notice}
        </div>
      )}

      {/* Phone fallback: same device logic keyed by number */}
      <div
        className="space-y-3 rounded-2xl border p-5"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
            {t("phone")}
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phonePlaceholder")}
            inputMode="tel"
            dir="ltr"
            className="w-full rounded-xl border px-4 py-3 text-base outline-none"
            style={{
              borderColor: theme.outlineVariant,
              backgroundColor: theme.surfaceContainerLowest,
              color: theme.onSurfaceVariant,
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
            {t("nameOptional")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="w-full rounded-xl border px-4 py-3 text-base outline-none"
            style={{
              borderColor: theme.outlineVariant,
              backgroundColor: theme.surfaceContainerLowest,
              color: theme.onSurfaceVariant,
            }}
          />
        </div>
      </div>

      {/* Ratings */}
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <h2 className="text-lg font-bold" style={{ color: theme.primary }}>
          {t("ratingsTitle")}
        </h2>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm" style={{ color: theme.onSurfaceVariant }}>
            {t("storeRating")}
          </span>
          <span className="flex items-center gap-1.5 text-base font-bold tabular-nums" style={{ color: theme.primary }}>
            <Star className="h-4 w-4" />
            {storeRating && storeRating.count > 0 ? `${storeRating.avg.toFixed(1)} (${storeRating.count})` : t("noRating")}
          </span>
        </div>
        {workers.length > 0 && (
          <ul className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: theme.outlineVariant }}>
            {workers.map((w) => (
              <li key={w.name} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm" style={{ color: theme.onSurfaceVariant }}>
                  {w.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums" style={{ color: theme.primary }}>
                  <Star className="h-3.5 w-3.5" />
                  {w.rating > 0 ? w.rating.toFixed(1) : t("noRating")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
