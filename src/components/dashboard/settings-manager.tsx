"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type Props = {
  slug: string;
  locale: string;
  theme: ThemeTokens;
  businessName: string;
  businessTypeLabel: string;
  bookingUrl: string;
  plan: string;
  planStatus: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  logoUrl: string | null;
  shopImages: string[];
};

const PLAN_KEYS: Record<string, string> = {
  free: "planFree",
  pro: "planPro",
  ai: "planAi",
  enterprise: "planEnterprise",
};

const STATUS_KEYS: Record<string, string> = {
  active: "subActive",
  trial: "subTrial",
  expired: "subExpired",
  cancelled: "subCancelled",
  grace: "subGrace",
};

function formatDate(locale: string, iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export function SettingsManager({
  slug,
  locale,
  theme,
  businessName,
  businessTypeLabel,
  bookingUrl,
  plan,
  planStatus,
  renewalDate,
  expirationDate,
  logoUrl,
  shopImages,
}: Props) {
  const t = useTranslations("settings");
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [images, setImages] = useState<string[]>(shopImages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const planKey = PLAN_KEYS[plan] ?? "planFree";
  const statusKey = planStatus ? (STATUS_KEYS[planStatus] ?? "subActive") : "subActive";
  const initials = businessName.trim().charAt(0).toUpperCase() || "S";

  const upload = async (file: File | null, kind: "logo" | "image") => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/media?slug=${encodeURIComponent(slug)}&kind=${kind}`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Upload failed");
      if (kind === "logo") setLogo(json.data.url as string);
      else setImages((json.data.images as string[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!logo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?slug=${encodeURIComponent(slug)}&kind=logo&action=remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: logo }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setLogo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (url: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?slug=${encodeURIComponent(slug)}&kind=image&action=remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setImages((json.data.images as string[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const cardClass = "rounded-2xl border p-5 md:p-6" + "";
  const cardStyle = { borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest } as const;

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("title")}</h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#ffffff" }}>
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {/* Business info */}
        <section className={cardClass} style={cardStyle}>
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold sm:h-14 sm:w-14"
              style={{ backgroundColor: theme.primaryContainer, color: theme.onSurfaceVariant }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold sm:text-lg" style={{ color: theme.primary }}>{businessName}</h2>
              <span className="text-sm" style={{ color: theme.onSurfaceVariant }}>{businessTypeLabel}</span>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 border-t pt-4 text-sm" style={{ borderColor: theme.outlineVariant }}>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>{t("theme")}</dt>
              <dd className="break-words" style={{ color: theme.onSurfaceVariant }}>{theme.label}</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>{t("address")}</dt>
              <dd className="truncate" style={{ color: theme.primary }}>{bookingUrl}</dd>
            </div>
          </dl>
        </section>

        {/* Plan */}
        <section className={cardClass} style={cardStyle}>
          <h2 className="text-base font-semibold sm:text-lg" style={{ color: theme.primary }}>{t("plan")}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              {t(planKey)}
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
            >
              {t(statusKey)}
            </span>
          </div>
          <dl className="mt-4 space-y-2.5 border-t pt-4 text-sm" style={{ borderColor: theme.outlineVariant }}>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>{t("renewsOn")}</dt>
              <dd className="break-words" style={{ color: theme.onSurfaceVariant }}>
                {renewalDate ? formatDate(locale, renewalDate) : t("notSet")}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>{t("expiresOn")}</dt>
              <dd className="break-words" style={{ color: theme.onSurfaceVariant }}>
                {expirationDate ? formatDate(locale, expirationDate) : t("notSet")}
              </dd>
            </div>
          </dl>
        </section>

        {/* Logo */}
        <section className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold sm:text-lg" style={{ color: theme.primary }}>{t("logo")}</h2>
              <p className="mt-0.5 text-xs sm:text-sm" style={{ color: theme.onSurfaceVariant }}>{t("logoHint")}</p>
            </div>
            {logo && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={busy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                style={{ borderColor: theme.outlineVariant, color: "#ba1a1a" }}
              >
                <X className="h-3.5 w-3.5" />
                {t("remove")}
              </button>
            )}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border sm:h-24 sm:w-24"
              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerHigh }}
            >
              {logo ? (
                <img src={logo} alt={businessName} className="h-full w-full object-contain" />
              ) : (
                <span className="text-2xl font-bold" style={{ color: theme.onSurfaceVariant }}>{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => logoInput.current?.click()}
              disabled={busy}
              className="rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              {busy ? t("uploading") : t("upload")}
            </button>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0] ?? null, "logo");
                e.target.value = "";
              }}
            />
          </div>
        </section>

        {/* Shop images */}
        <section className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold sm:text-lg" style={{ color: theme.primary }}>{t("shopImages")}</h2>
              <p className="mt-0.5 text-xs sm:text-sm" style={{ color: theme.onSurfaceVariant }}>{t("shopImagesHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => imageInput.current?.click()}
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              <ImagePlus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("addPhoto")}</span>
              <span className="sm:hidden">{t("addPhoto")}</span>
            </button>
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0] ?? null, "image");
                e.target.value = "";
              }}
            />
          </div>

          {images.length === 0 ? (
            <div
              className="mt-4 rounded-xl border border-dashed p-6 text-center text-xs sm:text-sm"
              style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
            >
              {t("noPhotos")}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 min-[420px]:grid-cols-3">
              {images.map((url) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerHigh }}>
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    disabled={busy}
                    aria-label={t("removePhoto")}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm"
                    style={{ backgroundColor: "rgba(10,10,10,0.7)" }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}