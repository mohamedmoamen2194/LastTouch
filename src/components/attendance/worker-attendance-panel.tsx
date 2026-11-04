"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarOff,
  CheckCircle2,
  Clock3,
  Download,
  FileWarning,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type DayView = {
  dateKey: string;
  weekday: number;
  shift: { startTime: string; endTime: string } | null;
  isOff: boolean;
  offApproved: boolean;
  lateApproved: boolean;
  arrivalAt: string | null;
  leaveAt: string | null;
  status: "off" | "on_time" | "late" | "no_show" | "pending";
  lateMinutes: number;
  earlyMinutes: number;
  earlyLeaveMinutes: number | null;
  penalty: number;
  request: { type: "day_off" | "late_arrival"; status: string; lateTime: string | null } | null;
  dispute: { note: string; status: string; ownerNote: string | null } | null;
};

export type RequestView = {
  id: string;
  type: "day_off" | "late_arrival";
  dateKey: string;
  lateTime: string | null;
  reason: string | null;
  status: string;
  penaltyAmount: number | null;
  ownerNote: string | null;
};

export type DisputeView = {
  id: string;
  dateKey: string;
  note: string;
  status: string;
  ownerNote: string | null;
};

type Props = {
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  theme: ThemeTokens;
  linked: boolean;
  employeeName: string;
  employeeRole: string | null;
  clockedIn: boolean;
  lastLogAt: string | null;
  locationName: string | null;
  today: DayView | null;
  canPunch: boolean;
  todayKey: string;
  history: DayView[];
  requests: RequestView[];
  disputes: DisputeView[];
  earlyCheckInMinutes: number;
};

function formatTime(iso: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

function formatDay(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function money(value: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device does not support location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

function geoErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as GeolocationPositionError).code;
    if (code === 1) return "Allow location access in your browser, then try again.";
    if (code === 3) return "Getting your location timed out. Move near a window and try again.";
    return "Could not get your location. Try again.";
  }
  return error instanceof Error ? error.message : "Could not get your location";
}

function statusMeta(day: DayView, theme: ThemeTokens) {
  if (day.isOff) {
    return { label: day.offApproved ? "Approved day off" : "Day off", bg: theme.surfaceContainerHigh, fg: theme.secondary };
  }
  if (day.status === "no_show") return { label: "No show", bg: "#fdeaea", fg: "#a12b2b" };
  if (day.status === "pending") return { label: "Awaiting arrival", bg: "#fff4e5", fg: "#9a6b00" };
  if (day.status === "late") {
    return {
      label: day.lateApproved ? `Late ${day.lateMinutes}m · approved` : `Late by ${day.lateMinutes}m`,
      bg: "#fff4e5",
      fg: "#9a6b00",
    };
  }
  if (day.earlyMinutes > 0) return { label: `Early by ${day.earlyMinutes}m`, bg: "#e3f2fd", fg: "#04519b" };
  return { label: "On time", bg: "#e1f3e2", fg: "#1d6e2f" };
}

export function WorkerAttendancePanel(props: Props) {
  const { slug, locale, timezone, currency, theme, linked, employeeName, employeeRole, clockedIn, lastLogAt, locationName, today, canPunch, todayKey, history, requests, disputes, earlyCheckInMinutes } = props;
  const router = useRouter();
  const [busy, setBusy] = useState<"arrive" | "leave" | "refresh" | "request" | "dispute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [tab, setTab] = useState<"history" | "requests" | "disputes">("history");
  const [earlyLeave, setEarlyLeave] = useState<{ minutesEarly: number; shiftEnd: string } | null>(null);

  const [reqType, setReqType] = useState<"day_off" | "late_arrival">("day_off");
  const [reqDate, setReqDate] = useState(todayKey);
  const [reqLateTime, setReqLateTime] = useState("10:00");
  const [reqReason, setReqReason] = useState("");

  const [disputeDate, setDisputeDate] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState("");

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = async () => {
    router.refresh();
  };

  const punch = async (type: "arrive" | "leave", confirmEarlyLeave = false) => {
    setBusy(type);
    setError(null);
    try {
      const position = await locate();
      const res = await fetch(`/api/staff/attendance?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          confirmEarlyLeave,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not record attendance");
      if (json.data?.requiresEarlyLeaveConfirm) {
        setEarlyLeave({ minutesEarly: json.data.minutesEarly, shiftEnd: json.data.shiftEnd });
        return;
      }
      setEarlyLeave(null);
      await refresh();
    } catch (err) {
      setError(geoErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const submitRequest = async () => {
    setBusy("request");
    setError(null);
    try {
      const res = await fetch(`/api/staff/attendance/requests?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reqType,
          dateKey: reqDate,
          lateTime: reqType === "late_arrival" ? reqLateTime : null,
          reason: reqReason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not submit request");
      setReqReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setBusy(null);
    }
  };

  const submitDispute = async () => {
    if (!disputeDate) return;
    setBusy("dispute");
    setError(null);
    try {
      const res = await fetch(`/api/staff/attendance/disputes?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey: disputeDate, note: disputeNote }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not submit dispute");
      setDisputeDate(null);
      setDisputeNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit dispute");
    } finally {
      setBusy(null);
    }
  };

  if (!linked) {
    return (
      <div className="mx-auto w-full max-w-xl py-10">
        <section className="rounded-3xl border px-5 py-8 text-center" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>
            <LogIn className="h-8 w-8" />
          </span>
          <h1 className="mt-3 text-xl font-bold" style={{ color: theme.primary }}>Worker profile not linked</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>Ask the business owner to link your account to a staff member in the Team panel.</p>
        </section>
      </div>
    );
  }

  const shiftDuration = clockedIn && lastLogAt && now ? formatDuration(now - new Date(lastLogAt).getTime()) : null;
  const meta = today ? statusMeta(today, theme) : null;

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none";

  const downloadReport = () => {
    const header = ["Date", "Shift", "Arrived", "Left", "Status", "Late (min)", "Early (min)", "Early leave (min)", "Penalty", "Request", "Dispute"];
    const rows = history.map((day) => [
      day.dateKey,
      day.shift ? `${day.shift.startTime}-${day.shift.endTime}` : "Day off",
      day.arrivalAt ? formatTime(day.arrivalAt, locale, timezone) : "",
      day.leaveAt ? formatTime(day.leaveAt, locale, timezone) : "",
      day.status,
      String(day.lateMinutes),
      String(day.earlyMinutes),
      day.earlyLeaveMinutes == null ? "" : String(day.earlyLeaveMinutes),
      String(day.penalty),
      day.request ? `${day.request.type}:${day.request.status}` : "",
      day.dispute ? `dispute:${day.dispute.status}` : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${(employeeName || "worker").replace(/\s+/g, "-").toLowerCase()}-${todayKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>Attendance</h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {employeeName}{employeeRole ? ` · ${employeeRole}` : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</div>
      )}

      {/* Today / shift */}
      <section className="overflow-hidden rounded-2xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: theme.primary }}>
                <Clock3 className="h-4 w-4" />
                {today?.shift ? `${today.shift.startTime} – ${today.shift.endTime}` : "No shift today"}
              </span>
              {meta && (
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: meta.bg, color: meta.fg }}>
                  {meta.label}
                </span>
              )}
            </div>
            {today?.arrivalAt && (
              <p className="mt-1.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                Arrived {formatTime(today.arrivalAt, locale, timezone)}
                {today.leaveAt ? ` · Left ${formatTime(today.leaveAt, locale, timezone)}` : ""}
                {today.earlyLeaveMinutes ? ` · left ${today.earlyLeaveMinutes}m early` : ""}
              </p>
            )}
            {clockedIn && lastLogAt && (
              <p className="mt-1 text-xs font-medium" style={{ color: theme.secondary }}>
                On shift since {formatTime(lastLogAt, locale, timezone)}{shiftDuration ? ` · ${shiftDuration}` : ""}
              </p>
            )}
            <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: theme.secondary }}>
              <MapPin className="h-3 w-3" />
              {locationName ?? "Store location not set"}
            </p>
            {today?.shift && !clockedIn && (
              <p className="mt-1 text-[11px]" style={{ color: theme.secondary }}>
                You can arrive up to {earlyCheckInMinutes} min before your shift starts.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canPunch ? (
              clockedIn ? (
                <button
                  type="button"
                  onClick={() => void punch("leave")}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#b3261e" }}
                >
                  <LogOut className="h-4 w-4" />
                  {busy === "leave" ? "Checking location…" : "Leave work"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void punch("arrive")}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                >
                  <LogIn className="h-4 w-4" />
                  {busy === "arrive" ? "Checking location…" : "Arrive at work"}
                </button>
              )
            ) : null}
            <button
              type="button"
              onClick={() => { setBusy("refresh"); setError(null); void refresh().finally(() => setBusy(null)); }}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
            >
              <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        {today?.dispute?.ownerNote && (
          <div className="border-t px-5 py-3 text-xs" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
            Owner note: {today.dispute.ownerNote}
          </div>
        )}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}>
        {([
          { key: "history", label: "History", icon: Clock3 },
          { key: "requests", label: "Requests", icon: CalendarOff },
          { key: "disputes", label: "Disputes", icon: FileWarning },
        ] as const).map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold"
              style={{ backgroundColor: active ? theme.primary : "transparent", color: active ? theme.onPrimary : theme.onSurfaceVariant }}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "history" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>Last 30 days</p>
            <button
              type="button"
              onClick={downloadReport}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
            >
              <Download className="h-3.5 w-3.5" /> Download report
            </button>
          </div>
          {history.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>No attendance yet.</p>
          ) : (
            history.map((day) => {
              const m = statusMeta(day, theme);
              return (
                <div key={day.dateKey} className="rounded-xl border p-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: theme.primary }}>{formatDay(day.dateKey, locale)}</p>
                      <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                        {day.shift ? `${day.shift.startTime} – ${day.shift.endTime}` : "Day off"}
                        {day.arrivalAt ? ` · in ${formatTime(day.arrivalAt, locale, timezone)}` : ""}
                        {day.leaveAt ? ` · out ${formatTime(day.leaveAt, locale, timezone)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {day.penalty > 0 && (
                        <span className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: "#fdeaea", color: "#a12b2b" }}>
                          -{money(day.penalty, locale, currency)}
                        </span>
                      )}
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: m.bg, color: m.fg }}>{m.label}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {day.dispute ? (
                      <span className="text-[11px]" style={{ color: theme.secondary }}>
                        Dispute: {day.dispute.status}{day.dispute.ownerNote ? ` · ${day.dispute.ownerNote}` : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setDisputeDate(day.dateKey); setDisputeNote(""); }}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
                      >
                        <FileWarning className="h-3 w-3" /> Raise dispute
                      </button>
                    )}
                    {day.request && (
                      <span className="text-[11px]" style={{ color: theme.secondary }}>
                        {day.request.type === "day_off" ? "Day off" : "Late arrival"} request: {day.request.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === "requests" && (
        <section className="space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primary }}>New request</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                Type
                <select
                  value={reqType}
                  onChange={(e) => setReqType(e.target.value as "day_off" | "late_arrival")}
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                >
                  <option value="day_off">Day off</option>
                  <option value="late_arrival">Late arrival</option>
                </select>
              </label>
              <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                Date
                <input
                  type="date"
                  min={todayKey}
                  value={reqDate}
                  onChange={(e) => setReqDate(e.target.value)}
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                />
              </label>
              {reqType === "late_arrival" && (
                <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                  I will arrive at
                  <input
                    type="time"
                    value={reqLateTime}
                    onChange={(e) => setReqLateTime(e.target.value)}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                  />
                </label>
              )}
              <label className={`text-xs ${reqType === "late_arrival" ? "" : "sm:col-span-2"}`} style={{ color: theme.onSurfaceVariant }}>
                Reason (optional)
                <input
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void submitRequest()}
              disabled={busy !== null || !reqDate}
              className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              <Send className="h-3.5 w-3.5" />
              {busy === "request" ? "Sending…" : "Submit request"}
            </button>
            <p className="mt-2 text-[11px]" style={{ color: theme.secondary }}>
              If the owner rejects it — or it is still pending — and you do not arrive, it counts as a no-show.
            </p>
          </div>

          {requests.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>No requests yet.</p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: theme.primary }}>
                    {request.type === "day_off" ? "Day off" : `Late arrival${request.lateTime ? ` · ${request.lateTime}` : ""}`} · {formatDay(request.dateKey, locale)}
                  </p>
                  {request.reason && <p className="truncate text-xs" style={{ color: theme.onSurfaceVariant }}>{request.reason}</p>}
                  {request.ownerNote && <p className="text-[11px]" style={{ color: theme.secondary }}>Owner: {request.ownerNote}</p>}
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>{request.status}</span>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "disputes" && (
        <section className="space-y-2">
          {disputes.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>No disputes raised.</p>
          ) : (
            disputes.map((dispute) => (
              <div key={dispute.id} className="rounded-xl border p-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: theme.primary }}>{formatDay(dispute.dateKey, locale)}</p>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>{dispute.status}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: theme.onSurfaceVariant }}>{dispute.note}</p>
                {dispute.ownerNote && <p className="mt-1 text-[11px]" style={{ color: theme.secondary }}>Owner: {dispute.ownerNote}</p>}
              </div>
            ))
          )}
        </section>
      )}

      {earlyLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-xl" style={{ borderColor: theme.outlineVariant }}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#fff4e5", color: "#9a6b00" }}>
              <LogOut className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-base font-semibold" style={{ color: theme.primary }}>Leave early?</h3>
            <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
              Your shift ends at {earlyLeave.shiftEnd}. You are leaving {earlyLeave.minutesEarly} minutes early. Confirm?
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setEarlyLeave(null)} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ color: theme.onSurfaceVariant }}>Cancel</button>
              <button
                type="button"
                onClick={() => void punch("leave", true)}
                disabled={busy !== null}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#b3261e" }}
              >
                {busy === "leave" ? "Saving…" : "Confirm leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {disputeDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-xl" style={{ borderColor: theme.outlineVariant }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: theme.primary }}>Dispute {formatDay(disputeDate, locale)}</h3>
              <button type="button" onClick={() => setDisputeDate(null)} style={{ color: theme.onSurfaceVariant }}><X className="h-5 w-5" /></button>
            </div>
            <textarea
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              rows={4}
              placeholder="Explain the attendance issue for this day…"
              className={`${inputClass} mt-3`}
              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDisputeDate(null)} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ color: theme.onSurfaceVariant }}>Cancel</button>
              <button
                type="button"
                onClick={() => void submitDispute()}
                disabled={busy !== null || !disputeNote.trim()}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy === "dispute" ? "Sending…" : "Send to owner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
