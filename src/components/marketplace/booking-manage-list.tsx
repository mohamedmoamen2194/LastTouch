"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Clock, ExternalLink, LogIn, LogOut, Star, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

export type ManageBooking = {
  id: string;
  tenantId?: string;
  businessName: string;
  slug: string;
  logoUrl?: string | null;
  trackingNumber: string;
  appointmentDate: Date | string;
  startTime: string;
  endTime: string;
  status: string;
  clientArrivalStatus?: string | null;
  timezone?: string;
  price?: number;
  services: string[];
  employeeName?: string | null;
  homeVisit?: boolean;
  homeAddress?: string | null;
  homeCity?: string | null;
  hasOpenVisit?: boolean;
  canCancel?: boolean;
  canModify?: boolean;
  guestToken?: string;
};

function ymdOf(d: Date | string) {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function dateOf(d: Date | string) {
  return typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00`) : d;
}
function dayLabel(date: Date, t: (k: string) => string, locale: string): string {
  const now = new Date();
  const strip = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((strip(date) - strip(now)) / 86_400_000);
  if (diff === 0) return t("today");
  if (diff === 1) return t("tomorrow");
  return date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

async function getPosition(): Promise<{ latitude: number; longitude: number; accuracyMeters?: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("location_unsupported");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? "location_denied" : "location_unavailable")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

const SCAN_ERROR_KEYS = ["wrong_store", "not_today", "too_early", "too_late_checkin", "too_late_checkout", "already_checked_in", "out_of_range", "location_not_set"] as const;

function ScanPopup({ booking, onClose, onDone }: { booking: ManageBooking; onClose: () => void; onDone?: () => void }) {
  const t = useTranslations("client");
  const tb = useTranslations("booking");
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ action: "checked_in" | "checked_out"; visitId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [rated, setRated] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ appointmentId: booking.id });
    if (booking.guestToken) qs.set("guestToken", booking.guestToken);
    void fetch(`/api/visits/scan?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setMode(j.success && j.data?.suggested === "out" ? "out" : "in"); })
      .catch(() => { if (alive) setMode("in"); });
    return () => { alive = false; };
  }, [booking.id, booking.guestToken]);

  const mapError = (msg: string): string => {
    if ((SCAN_ERROR_KEYS as readonly string[]).includes(msg)) return t(`scan_${msg}`);
    if (msg === "location_denied") return tb("locationDenied");
    if (msg === "location_unsupported" || msg === "location_unavailable") return tb("locationUnsupported");
    return msg;
  };

  const submit = async (forcedMode?: "in" | "out") => {
    const m = forcedMode ?? mode;
    if (busy || !m) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const pos = await getPosition();
      const res = await fetch("/api/visits/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: booking.id, mode: m, ...pos, guestToken: booking.guestToken }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setResult({ action: json.data.action, visitId: json.data.visitId ?? null });
      onDone?.();
    } catch (e) {
      setError(mapError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (!result || rating < 1) return;
    setRatingBusy(true); setRatingError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: booking.slug, appointmentId: booking.id, visitId: result.visitId, rating, comment: comment.trim() || undefined, guestToken: booking.guestToken }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setRated(true);
      onDone?.();
    } catch (e) { setRatingError(e instanceof Error ? e.message : "Failed"); }
    finally { setRatingBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h3 className="font-bold text-[#091426]">{t("checkInOutTitle")}</h3><p className="mt-0.5 text-xs text-[#45474c]">{booking.businessName}</p></div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eff1f3] text-[#45474c]"><X className="h-4 w-4" /></button>
        </div>
        {result ? (
          <div className="py-3 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h3 className="mt-3 text-lg font-bold text-[#091426]">{result.action === "checked_out" ? t("scanDoneCompleted") : t("scanDoneCheckedIn")}</h3>
            {result.action === "checked_out" && !rated && (
              <div className="mt-4 rounded-2xl bg-[#f6f7f9] p-4 text-start">
                <p className="text-sm font-semibold text-[#091426]">{t("rateVisit")}</p>
                <p className="mt-0.5 text-xs text-[#45474c]">{t("rateVisitHint")}</p>
                <div className="mt-3 flex justify-center gap-1">{[1,2,3,4,5].map((v)=>(<button key={v} type="button" onClick={()=>setRating(v)} className="p-1"><Star className={`h-7 w-7 ${v<=rating?"fill-amber-400 text-amber-400":"text-[#c5c6cd]"}`} /></button>))}</div>
                <textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder={t("rateVisitComment")} rows={2} className="mt-3 w-full rounded-xl border border-[#c5c6cd]/70 bg-white px-3 py-2 text-sm outline-none" />
                {ratingError && <p className="mt-2 text-xs text-red-700">{ratingError}</p>}
                <button type="button" onClick={()=>void submitRating()} disabled={ratingBusy||rating<1} className="mp-solid mt-3 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{ratingBusy?t("scanWorking"):t("submitRating")}</button>
              </div>
            )}
            {rated && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{t("ratingThanks")}</p>}
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-full border border-[#c5c6cd]/70 px-4 py-2.5 text-sm font-semibold text-[#091426]">{t("done")}</button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-[#45474c]">{t("checkInOutHint")}</p>
            <button type="button" disabled={busy || !mode} onClick={()=>void submit(mode ?? undefined)} className="mp-solid flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {mode === "out" ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {busy ? t("scanWorking") : (mode === "out" ? t("checkOut") : t("checkIn"))}
            </button>
            {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-center text-xs text-red-700">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function RescheduleBox({ booking, onDone }: { booking: ManageBooking; onDone: () => void }) {
  const t = useTranslations("client");
  const [date, setDate] = useState(ymdOf(booking.appointmentDate));
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const min = useMemo(() => new Date().toISOString().slice(0,10), []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setMsg(null);
    void fetch("/api/client/bookings/slots", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id: booking.id, date, guestToken: booking.guestToken }) })
      .then(r=>r.json()).then(j=>{ if(alive){ setSlots(j.success ? (j.data?.slots ?? []) : []); if(!j.success) setMsg(j.message||"Failed"); } })
      .catch(()=>{ if(alive) setMsg("Failed"); })
      .finally(()=>{ if(alive) setLoading(false); });
    return ()=>{ alive=false; };
  }, [booking.id, booking.guestToken, date]);

  const pick = async (startTime: string) => {
    setSaving(startTime); setMsg(null);
    try {
      const res = await fetch("/api/client/bookings/manage", { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id: booking.id, action:"reschedule", appointmentDate: date, startTime, guestToken: booking.guestToken }) });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Failed");
      onDone();
    } catch(e){ setMsg(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(null); }
  };

  return (
    <div className="mt-3 rounded-xl border border-[#c5c6cd]/60 bg-[#f6f7f9] p-3">
      <p className="text-xs font-semibold text-[#091426]">{t("rescheduleTitle")}</p>
      <p className="mt-0.5 text-[11px] text-[#45474c]">{t("rescheduleHint")}</p>
      <input type="date" min={min} value={date} onChange={(e)=>setDate(e.target.value)} className="mt-2 w-full rounded-lg border border-[#c5c6cd]/70 bg-white px-3 py-2 text-sm" />
      <div className="mt-2 flex flex-wrap gap-2">
        {loading ? <p className="text-xs text-[#45474c]">{t("scanWorking")}</p>
          : slots.length ? slots.map(s=>(
            <button key={s.start} type="button" disabled={saving!==null} onClick={()=>void pick(s.start)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${saving===s.start?"mp-solid text-white":"border border-[#c5c6cd]/70 bg-white text-[#091426]"}`}><span dir="ltr">{s.start}</span></button>
          )) : <p className="text-xs text-[#45474c]">{t("noSlots")}</p>}
      </div>
      {msg && <p className="mt-2 text-xs text-red-700">{msg}</p>}
    </div>
  );
}

export function ManageBookingsList({ bookings, onRefresh, scope="upcoming", showStoreLink=true, rebook=false }: { bookings: ManageBooking[]; onRefresh?: () => void; scope?: "upcoming"|"history"; showStoreLink?: boolean; rebook?: boolean }) {
  const t = useTranslations("client");
  const locale = useLocale();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [resId, setResId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => { if (onRefresh) { onRefresh(); } else { router.refresh(); } };
  if (bookings.length === 0) return <p className="py-6 text-center text-sm text-[#45474c]">{t(scope==="upcoming"?"noUpcoming":"noHistory")}</p>;

  const callManage = async (id: string, body: { id: string; action: "arrival" | "cancel" | "reschedule"; status?: string; appointmentDate?: string; startTime?: string; guestToken?: string }) => {
    setBusyId(id); setErr(null);
    try {
      const res = await fetch("/api/client/bookings/manage", { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Failed");
      refresh();
    } catch(e){ setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  };

  const tAny = t as unknown as (k: string) => string;
  const statusKey = (s: string) => `status_${s}`;
  const arrivalKey = (s: string) => `arrival_${s}`;
  const arrivalOptions = ["at_home","on_my_way","five_min","arrived"] as const;

  return (
    <>
      {err && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      <ul className="flex flex-col gap-3">
        {bookings.map((b) => {
          const expanded = openId === b.id;
          const d = dateOf(b.appointmentDate);
          const upcomingOpen = b.status === "pending" || b.status === "confirmed";
          const scannable = upcomingOpen;
          return (
            <li key={b.id} className="rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-sm">
              <button type="button" onClick={()=>setOpenId(expanded?null:b.id)} className="flex w-full items-start gap-3 p-4 text-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-lg font-bold text-[#091426]">{b.logoUrl ? <img src={b.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : b.businessName.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[#091426]">{b.businessName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#091426]">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{dayLabel(d, tAny, locale)}</span>
                    <span className="flex items-center gap-1 tabular-nums"><Clock className="h-3.5 w-3.5" /><span dir="ltr">{b.startTime}</span></span>
                    <span className="rounded-full bg-[#eff1f3] px-2 py-0.5 text-[11px] font-bold">{tAny(statusKey(b.status))}</span>
                  </span>
                </span>
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-[#9aa0a6] transition-transform ${expanded?"rotate-180":""}`} />
              </button>
              {expanded && (
                <div className="border-t border-[#c5c6cd]/50 px-4 py-3 text-sm">
                  <dl className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("trackingNumber")}</dt><dd dir="ltr" className="font-mono font-semibold text-[#091426]">{b.trackingNumber}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("detailDate")}</dt><dd className="font-semibold text-[#091426]">{d.toLocaleDateString(locale,{day:"numeric",month:"long",year:"numeric"})}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("detailTime")}</dt><dd className="font-semibold tabular-nums text-[#091426]"><span dir="ltr">{b.startTime} – {b.endTime}</span></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("services")}</dt><dd className="max-w-[60%] text-end font-semibold text-[#091426]">{b.services.join(" · ")||"—"}</dd></div>
                    {b.employeeName && <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("with")}</dt><dd className="font-semibold text-[#091426]">{b.employeeName}</dd></div>}
                    {b.homeVisit && b.homeAddress && <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#9aa0a6]">{t("homeVisits")}</dt><dd className="text-end font-semibold text-[#091426]">{[b.homeAddress,b.homeCity].filter(Boolean).join(", ")}</dd></div>}
                    {typeof b.price === "number" && <div className="flex justify-between gap-3"><dt className="text-[#9aa0a6]">{t("detailPrice")}</dt><dd className="font-bold tabular-nums text-[#091426]">{b.price.toLocaleString(locale==="ar"?"ar-EG":"en-US")}</dd></div>}
                  </dl>

                  {upcomingOpen && (
                    <div className="mt-3 rounded-xl bg-[#f6f7f9] p-3">
                      <p className="text-xs font-semibold text-[#091426]">{t("arrivalTitle")}</p>
                      <p className="mt-0.5 text-[11px] text-[#45474c]">{t("arrivalHint")}</p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {arrivalOptions.map((opt)=>{ const active=b.clientArrivalStatus===opt; return (
                          <button key={opt} type="button" disabled={busyId===b.id} onClick={()=>void callManage(b.id,{id:b.id,action:"arrival",status:opt,guestToken:b.guestToken})} className={`rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${active?"bg-[#091426] text-white":"border border-[#c5c6cd]/70 bg-white text-[#45474c]"}`}>{tAny(arrivalKey(opt))}</button>
                        );})}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link href={`/track/${b.slug}?code=${encodeURIComponent(b.trackingNumber)}`} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#c5c6cd]/70 px-4 py-2 text-xs font-semibold text-[#091426] sm:flex-1"><ExternalLink className="h-3.5 w-3.5" />{t("trackBooking")}</Link>
                    {scannable && <button type="button" onClick={()=>setScanId(b.id)} className="mp-solid flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white sm:flex-1">{b.hasOpenVisit ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{b.hasOpenVisit ? t("checkOut") : t("checkIn")}</button>}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {showStoreLink && <Link href={`/book/${b.slug}`} className="w-full rounded-full border border-[#c5c6cd]/70 px-4 py-2 text-center text-xs font-semibold text-[#091426] sm:flex-1">{t("viewStore")}</Link>}
                    {rebook && b.status !== "cancelled" && <Link href={`/book/${b.slug}?rebook=${b.id}`} className="mp-solid w-full rounded-full px-4 py-2 text-center text-xs font-semibold text-white sm:flex-1">{t("bookAgain")}</Link>}
                  </div>

                  {upcomingOpen && (
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {b.canModify ? (
                          <button type="button" onClick={()=>setResId(resId===b.id?null:b.id)} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#c5c6cd]/70 px-4 py-2 text-xs font-semibold text-[#091426] sm:flex-1"><CalendarClock className="h-3.5 w-3.5" />{t("rescheduleAction")}</button>
                        ) : null}
                        {b.canCancel ? (
                          <button type="button" disabled={busyId===b.id} onClick={()=>{ if(confirm(t("cancelConfirm"))) void callManage(b.id,{id:b.id,action:"cancel",guestToken:b.guestToken}); }} className="w-full rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 sm:flex-1">{busyId===b.id?t("cancelling"):t("cancel")}</button>
                        ) : null}
                      </div>
                      {!b.canModify && !b.canCancel && <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-800">{t("cancelCutoff")}</p>}
                      {resId===b.id && b.canModify && <RescheduleBox booking={b} onDone={()=>{ setResId(null); refresh(); }} />}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {scanId && <ScanPopup booking={bookings.find((b)=>b.id===scanId)!} onClose={()=>setScanId(null)} onDone={refresh} />}
    </>
  );
}
