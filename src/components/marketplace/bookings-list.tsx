"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, Clock, QrCode, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ClientBooking } from "@/lib/marketplace/client";
import { QrScanner } from "@/components/marketplace/qr-scanner";

function dayLabel(date: Date, t: (k: string) => string, locale: string): string {
  const now = new Date();
  const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((strip(date) - strip(now)) / 86_400_000);
  if (diff === 0) return t("today");
  if (diff === 1) return t("tomorrow");
  return date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

const SCAN_ERROR_KEYS = [
  "wrong_store",
  "not_today",
  "too_early",
  "too_late_checkin",
  "too_late_checkout",
  "already_checked_in",
] as const;

/** Scan popup: check-in/out choice (auto-preselected) + store QR camera. */
function ScanPopup({ booking, onClose }: { booking: ClientBooking; onClose: () => void }) {
  const t = useTranslations("client");
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preselect the logical action from live visit state.
  useEffect(() => {
    let alive = true;
    void fetch(`/api/visits/scan?appointmentId=${booking.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setMode(j.success && j.data?.suggested === "out" ? "out" : "in");
      })
      .catch(() => {
        if (alive) setMode("in");
      });
    return () => {
      alive = false;
    };
  }, [booking.id]);

  const mapError = (msg: string): string => {
    if ((SCAN_ERROR_KEYS as readonly string[]).includes(msg)) return t(`scan_${msg}`);
    return msg;
  };

  const submit = async (qr: string) => {
    if (busy || !mode) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/visits/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: booking.id, mode, qr }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setResult(t(json.data.action === "checked_out" ? "scanDoneCompleted" : "scanDoneCheckedIn"));
      router.refresh();
    } catch (e) {
      setError(mapError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#091426]">{t("scanTitle")}</h3>
            <p className="mt-0.5 text-xs text-[#45474c]">{booking.businessName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eff1f3] text-[#45474c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["in", "out"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                mode === m ? "mp-solid text-white" : "border border-[#c5c6cd]/70 bg-white text-[#45474c]"
              }`}
            >
              {t(m === "in" ? "checkIn" : "checkOut")}
            </button>
          ))}
        </div>

        <QrScanner onScan={(v) => void submit(v)} />

        {busy && <p className="mt-2 text-center text-xs text-[#45474c]">{t("scanWorking")}</p>}
        {error && <p className="mt-2 rounded-xl bg-red-50 px-4 py-2.5 text-center text-xs text-red-700">{error}</p>}
        {result && (
          <p className="mt-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-xs font-semibold text-emerald-700">
            {result}
          </p>
        )}
      </div>
    </div>
  );
}

/** Booking cards: tap for details, scan button for check-in/out. */
export function BookingsList({ bookings, emptyHint, rebook = false }: { bookings: ClientBooking[]; emptyHint: React.ReactNode; rebook?: boolean }) {
  const t = useTranslations("client");
  const locale = useLocale();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (bookings.length === 0) return <>{emptyHint}</>;

  const cancel = async (id: string) => {
    if (!confirm(t("cancelConfirm"))) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/client/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const statusKey = (s: string) => `status_${s}` as never;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {bookings.map((b) => {
          const expanded = openId === b.id;
          const scannable = b.status === "pending" || b.status === "confirmed";
          return (
            <li key={b.id} className="rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-sm">
              <button type="button" onClick={() => setOpenId(expanded ? null : b.id)} className="flex w-full items-start gap-3 p-4 text-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-lg font-bold text-[#091426]">
                  {b.logoUrl ? <img src={b.logoUrl} alt="" className="h-full w-full object-cover" /> : b.businessName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[#091426]">{b.businessName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium text-[#091426]">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {dayLabel(b.appointmentDate, t as (k: string) => string, locale)}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Clock className="h-3.5 w-3.5" />
                      <span dir="ltr">{b.startTime}</span>
                    </span>
                    <span className="rounded-full bg-[#eff1f3] px-2 py-0.5 text-[11px] font-bold">{t(statusKey(b.status))}</span>
                  </span>
                </span>
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-[#9aa0a6] transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>

              {expanded && (
                <div className="border-t border-[#c5c6cd]/50 px-4 py-3 text-sm">
                  <dl className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#9aa0a6]">{t("detailDate")}</dt>
                      <dd className="font-semibold text-[#091426]">
                        {b.appointmentDate.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#9aa0a6]">{t("detailTime")}</dt>
                      <dd className="font-semibold tabular-nums text-[#091426]">
                        <span dir="ltr">{b.startTime} – {b.endTime}</span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#9aa0a6]">{t("services")}</dt>
                      <dd className="max-w-[60%] text-end font-semibold text-[#091426]">{b.services.join(" · ") || "—"}</dd>
                    </div>
                    {b.employeeName && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#9aa0a6]">{t("with")}</dt>
                        <dd className="font-semibold text-[#091426]">{b.employeeName}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#9aa0a6]">{t("detailPrice")}</dt>
                      <dd className="font-bold tabular-nums text-[#091426]">
                        {b.price.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-col gap-2">
                    {scannable && (
                      <button
                        type="button"
                        onClick={() => setScanId(b.id)}
                        className="mp-solid flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white"
                      >
                        <QrCode className="h-4 w-4" />
                        {t("scanCta")}
                      </button>
                    )}
                    <Link
                      href={`/book/${b.slug}`}
                      className="w-full rounded-full border border-[#c5c6cd]/70 px-4 py-2 text-center text-xs font-semibold text-[#091426]"
                    >
                      {t("viewStore")}
                    </Link>
                    {rebook && b.status !== "cancelled" && (
                      <Link
                        href={`/book/${b.slug}?rebook=${b.id}`}
                        className="mp-solid w-full rounded-full px-4 py-2 text-center text-xs font-semibold text-white"
                      >
                        {t("bookAgain")}
                      </Link>
                    )}
                    {b.canCancel && (
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() => cancel(b.id)}
                        className="w-full rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        {busyId === b.id ? t("cancelling") : t("cancel")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {scanId && (
        <ScanPopup booking={bookings.find((b) => b.id === scanId)!} onClose={() => setScanId(null)} />
      )}
    </>
  );
}
