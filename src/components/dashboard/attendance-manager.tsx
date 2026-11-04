"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  Check,
  Clock3,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";
import type { DayView } from "@/components/attendance/worker-attendance-panel";

export type AdminWorkerRow = {
  employee: { id: string; name: string; role: string | null; isBookable: boolean };
  day: DayView | null;
};

export type AdminRequest = {
  id: string;
  type: "day_off" | "late_arrival";
  dateKey: string;
  lateTime: string | null;
  reason: string | null;
  status: string;
  penaltyAmount: number | null;
  ownerNote: string | null;
  employeeName: string;
};

export type AdminDispute = {
  id: string;
  dateKey: string;
  note: string;
  status: string;
  ownerNote: string | null;
  employeeName: string;
};

type Props = {
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  theme: ThemeTokens;
  dateKey: string;
  todayKey: string;
  rows: AdminWorkerRow[];
  policy: { earlyCheckInMinutes: number; lateGraceMinutes: number; noShowPenalty: number; lateTiers: { minMinutes: number; amount: number }[] };
  requests: AdminRequest[];
  disputes: AdminDispute[];
};

function formatDay(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatTime(iso: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

function money(value: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function statusLabel(day: DayView | null) {
  if (!day) return { label: "No data", bg: "#f0f0f0", fg: "#666" };
  if (day.isOff) return { label: day.offApproved ? "Approved off" : "Day off", bg: "#eef0f3", fg: "#45474c" };
  if (day.status === "no_show") return { label: "No show", bg: "#fdeaea", fg: "#a12b2b" };
  if (day.status === "pending") return { label: "Not arrived", bg: "#fff4e5", fg: "#9a6b00" };
  if (day.status === "late") return { label: day.lateApproved ? `Late ${day.lateMinutes}m (approved)` : `Late ${day.lateMinutes}m`, bg: "#fff4e5", fg: "#9a6b00" };
  if (day.earlyMinutes > 0) return { label: `Early ${day.earlyMinutes}m`, bg: "#e3f2fd", fg: "#04519b" };
  return { label: "On time", bg: "#e1f3e2", fg: "#1d6e2f" };
}

export function AttendanceManager(props: Props) {
  const { slug, locale, timezone, currency, theme, dateKey, todayKey, rows, policy, requests, disputes } = props;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [early, setEarly] = useState(String(policy.earlyCheckInMinutes));
  const [grace, setGrace] = useState(String(policy.lateGraceMinutes));
  const [noShow, setNoShow] = useState(String(policy.noShowPenalty));
  const [tiers, setTiers] = useState(policy.lateTiers.length > 0 ? policy.lateTiers : [{ minMinutes: 30, amount: 50 }]);
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const call = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/attendance?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    const ok = await call(
      {
        action: "save-settings",
        earlyCheckInMinutes: early,
        lateGraceMinutes: grace,
        noShowPenalty: noShow,
        lateTiers: tiers,
      },
      "settings"
    );
    if (ok) setNotice("Attendance settings saved.");
  };

  const resolveRequest = async (request: AdminRequest, status: "accepted" | "rejected") => {
    await call(
      {
        action: "resolve-request",
        id: request.id,
        status,
        penaltyAmount: request.type === "day_off" ? penaltyDrafts[request.id] ?? "" : undefined,
        ownerNote: noteDrafts[request.id] ?? null,
      },
      `req-${request.id}`
    );
  };

  const resolveDispute = async (dispute: AdminDispute, status: "accepted" | "rejected") => {
    await call(
      { action: "resolve-dispute", id: dispute.id, status, ownerNote: noteDrafts[dispute.id] ?? null },
      `disp-${dispute.id}`
    );
  };

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none";
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pendingDisputes = disputes.filter((d) => d.status === "pending");
  const totalPenalty = rows.reduce((sum, row) => sum + (row.day?.penalty ?? 0), 0);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>Attendance</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>All workers · {formatDay(dateKey, locale)}</p>
        </div>
        <input
          type="date"
          value={dateKey}
          max={todayKey}
          onChange={(e) => router.push(`?date=${e.target.value}`)}
          className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
        />
      </div>

      {error && <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</div>}
      {notice && <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#e1f3e2", color: "#1d6e2f" }}>{notice}</div>}

      {/* Workers */}
      <section className="rounded-2xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.outlineVariant }}>
          <h2 className="text-sm font-semibold" style={{ color: theme.primary }}>Workers</h2>
          <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>
            Total penalties today: <span className="font-semibold" style={{ color: totalPenalty > 0 ? "#a12b2b" : theme.primary }}>{money(totalPenalty, locale, currency)}</span>
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: theme.onSurfaceVariant }}>No active workers.</p>
          ) : (
            rows.map(({ employee, day }) => {
              const meta = statusLabel(day);
              return (
                <div key={employee.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: theme.primary }}>
                      {employee.name}
                      {employee.role ? <span className="ml-2 text-xs font-normal" style={{ color: theme.secondary }}>{employee.role}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                      {day?.shift ? `${day.shift.startTime} – ${day.shift.endTime}` : "Day off"}
                      {day?.arrivalAt ? ` · in ${formatTime(day.arrivalAt, locale, timezone)}` : ""}
                      {day?.leaveAt ? ` · out ${formatTime(day.leaveAt, locale, timezone)}` : ""}
                      {day?.earlyLeaveMinutes ? ` · early leave ${day.earlyLeaveMinutes}m` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {day && day.penalty > 0 && (
                      <span className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: "#fdeaea", color: "#a12b2b" }}>
                        -{money(day.penalty, locale, currency)}
                      </span>
                    )}
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: meta.bg, color: meta.fg }}>{meta.label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Settings */}
      <section className="rounded-2xl border p-4" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.primary }}>
          <Settings2 className="h-4 w-4" /> Attendance rules & penalties
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
            Earliest check-in (min before shift)
            <input type="number" min="0" value={early} onChange={(e) => setEarly(e.target.value)} className={inputClass} style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }} />
          </label>
          <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
            Grace period (min)
            <input type="number" min="0" value={grace} onChange={(e) => setGrace(e.target.value)} className={inputClass} style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }} />
          </label>
          <label className="text-xs" style={{ color: theme.onSurfaceVariant }}>
            No-show penalty ({currency})
            <input type="number" min="0" step="10" value={noShow} onChange={(e) => setNoShow(e.target.value)} className={inputClass} style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }} />
          </label>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>Late penalty tiers</p>
          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>Late ≥</span>
                <input
                  type="number"
                  min="0"
                  value={tier.minMinutes}
                  onChange={(e) => setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, minMinutes: Number(e.target.value) } : t)))}
                  className="w-20 rounded-lg border px-2 py-1.5 text-sm outline-none"
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                />
                <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>min →</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={tier.amount}
                  onChange={(e) => setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, amount: Number(e.target.value) } : t)))}
                  className="w-24 rounded-lg border px-2 py-1.5 text-sm outline-none"
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                />
                <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>{currency}</span>
                <button type="button" onClick={() => setTiers((prev) => prev.filter((_, i) => i !== index))} className="ml-auto rounded-md p-1.5" style={{ color: "#a12b2b" }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTiers((prev) => [...prev, { minMinutes: (prev.at(-1)?.minMinutes ?? 30) + 30, amount: (prev.at(-1)?.amount ?? 50) + 50 }])}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
            >
              <Plus className="h-3.5 w-3.5" /> Add tier
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              <Save className="h-3.5 w-3.5" /> {busy === "settings" ? "Saving…" : "Save settings"}
            </button>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: theme.secondary }}>
            The highest tier reached applies. Example: tiers 30→50, 60→100; a 45-minute late is penalised 50.
          </p>
        </div>
      </section>

      {/* Requests */}
      <section className="rounded-2xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.outlineVariant }}>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.primary }}>
            <CalendarCheck className="h-4 w-4" /> Requests
          </h2>
          <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>{pendingRequests.length} pending</span>
        </div>
        <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
          {requests.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: theme.onSurfaceVariant }}>No requests.</p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: theme.primary }}>
                      {request.employeeName} · {request.type === "day_off" ? "Day off" : `Late arrival${request.lateTime ? ` at ${request.lateTime}` : ""}`}
                    </p>
                    <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                      {formatDay(request.dateKey, locale)}
                      {request.reason ? ` · ${request.reason}` : ""}
                    </p>
                    {request.ownerNote && <p className="text-[11px]" style={{ color: theme.secondary }}>Note: {request.ownerNote}</p>}
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>{request.status}</span>
                </div>
                {request.status === "pending" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {request.type === "day_off" && (
                      <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder={`Penalty ${currency} (optional)`}
                        value={penaltyDrafts[request.id] ?? ""}
                        onChange={(e) => setPenaltyDrafts((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        className="w-40 rounded-lg border px-2 py-1.5 text-xs outline-none"
                        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                      />
                    )}
                    <input
                      placeholder="Owner note (optional)"
                      value={noteDrafts[request.id] ?? ""}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                    />
                    <button type="button" onClick={() => void resolveRequest(request, "accepted")} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#e1f3e2", color: "#1d6e2f" }}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button type="button" onClick={() => void resolveRequest(request, "rejected")} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#fdeaea", color: "#a12b2b" }}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Disputes */}
      <section className="rounded-2xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.outlineVariant }}>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.primary }}>
            <Clock3 className="h-4 w-4" /> Disputes
          </h2>
          <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>{pendingDisputes.length} pending</span>
        </div>
        <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
          {disputes.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: theme.onSurfaceVariant }}>No disputes.</p>
          ) : (
            disputes.map((dispute) => (
              <div key={dispute.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: theme.primary }}>{dispute.employeeName} · {formatDay(dispute.dateKey, locale)}</p>
                    <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>{dispute.note}</p>
                    {dispute.ownerNote && <p className="text-[11px]" style={{ color: theme.secondary }}>Note: {dispute.ownerNote}</p>}
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>{dispute.status}</span>
                </div>
                {dispute.status === "pending" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      placeholder="Owner note (optional)"
                      value={noteDrafts[dispute.id] ?? ""}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [dispute.id]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface, color: theme.onSurfaceVariant }}
                    />
                    <button type="button" onClick={() => void resolveDispute(dispute, "accepted")} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#e1f3e2", color: "#1d6e2f" }}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button type="button" onClick={() => void resolveDispute(dispute, "rejected")} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#fdeaea", color: "#a12b2b" }}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
