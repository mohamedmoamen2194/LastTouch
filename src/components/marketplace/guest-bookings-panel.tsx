"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { ManageBookingsList, type ManageBooking } from "@/components/marketplace/booking-manage-list";

export function GuestBookingsPanel({ slug, initialScope = "upcoming", showStoreLink = !slug }: { slug?: string; initialScope?: "upcoming" | "history"; showStoreLink?: boolean }) {
  const t = useTranslations("client");
  const [mode, setMode] = useState<"tracking" | "phone">("tracking");
  const [scope, setScope] = useState<"upcoming" | "history">(initialScope);
  const [tracking, setTracking] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bookings, setBookings] = useState<ManageBooking[]>([]);

  const lookup = async () => {
    setBusy(true); setError(null);
    try {
      const body: { scope: "upcoming" | "history"; slug?: string; trackingNumber?: string; phone?: string; name?: string } = { scope, slug };
      if (mode === "tracking") body.trackingNumber = tracking.trim();
      else { body.phone = phone.trim(); body.name = name.trim(); }
      const res = await fetch("/api/client/bookings/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Failed");
      setBookings(j.data?.bookings ?? []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBookings([]); setLoaded(true);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-[#091426]">{t("manageLookupTitle")}</h2>
        <p className="mt-0.5 text-xs text-[#45474c]">{t("manageLookupHint")}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={()=>setMode("tracking")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode==="tracking"?"mp-solid text-white":"border border-[#c5c6cd]/70 text-[#45474c]"}`}>{t("lookupByTracking")}</button>
          <button type="button" onClick={()=>setMode("phone")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode==="phone"?"mp-solid text-white":"border border-[#c5c6cd]/70 text-[#45474c]"}`}>{t("lookupByPhone")}</button>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={()=>setScope("upcoming")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${scope==="upcoming"?"bg-[#091426] text-white":"bg-[#eff1f3] text-[#45474c]"}`}>{t("upcomingTab")}</button>
          <button type="button" onClick={()=>setScope("history")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${scope==="history"?"bg-[#091426] text-white":"bg-[#eff1f3] text-[#45474c]"}`}>{t("historyTab")}</button>
        </div>
        <div className="mt-3 grid gap-2">
          {mode === "tracking" ? (
            <input value={tracking} onChange={(e)=>setTracking(e.target.value)} placeholder={t("trackingPlaceholder")} className="w-full rounded-xl border border-[#c5c6cd]/70 px-3 py-2 text-sm" />
          ) : (
            <>
              <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder={t("phonePlaceholder")} className="w-full rounded-xl border border-[#c5c6cd]/70 px-3 py-2 text-sm" />
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder={t("namePlaceholder")} className="w-full rounded-xl border border-[#c5c6cd]/70 px-3 py-2 text-sm" />
            </>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={()=>void lookup()} className="mp-solid mt-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          <Search className="h-4 w-4" />{busy ? t("scanWorking") : t("lookupAction")}
        </button>
      </div>
      {loaded && (bookings.length ? <ManageBookingsList bookings={bookings} onRefresh={()=>void lookup()} scope={scope} showStoreLink={showStoreLink} rebook={scope==="history"} /> : <p className="py-4 text-center text-sm text-[#45474c]">{t("lookupEmpty")}</p>)}
    </div>
  );
}
