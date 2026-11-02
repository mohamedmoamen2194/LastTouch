"use client";

import { useEffect, useState } from "react";
import { Clock3, LocateFixed, LogIn, LogOut, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type AttendanceState = {
  employee: {
    id: string;
    firstName: string;
    lastName: string | null;
    displayName: string | null;
    role: string | null;
  };
  location: { name: string; latitude: string | null; longitude: string | null } | null;
  clockedIn: boolean;
  lastLog: { type: "arrive" | "leave"; createdAt: string; distanceMeters: number | null } | null;
  today: Array<{ id: string; type: "arrive" | "leave"; createdAt: string; distanceMeters: number | null }>;
};

type Props = {
  slug: string;
  locale: string;
  timezone: string;
  theme: ThemeTokens;
  initialState: AttendanceState;
};

function formatTime(iso: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
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

export function WorkerAttendance({ slug, locale, timezone, theme, initialState }: Props) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<"arrive" | "leave" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = async () => {
    const res = await fetch(`/api/staff/attendance?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const json = await res.json();
    if (json.success) setState(json.data as AttendanceState);
  };

  const punch = async (type: "arrive" | "leave") => {
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
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not record attendance");
      await refresh();
    } catch (err) {
      setError(geoErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const employeeName =
    state.employee.displayName ??
    `${state.employee.firstName}${state.employee.lastName ? " " + state.employee.lastName : ""}`;

  const shiftStart = state.clockedIn && state.lastLog ? new Date(state.lastLog.createdAt).getTime() : null;
  const shiftDuration = shiftStart && now ? formatDuration(now - shiftStart) : null;

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <section
        className="overflow-hidden rounded-3xl border"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <div className="px-5 pb-6 pt-5 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: state.clockedIn ? "#dcfce7" : theme.surfaceContainerHigh,
              color: state.clockedIn ? "#15803d" : theme.onSurfaceVariant,
            }}
          >
            <Clock3 className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-xl font-bold" style={{ color: theme.primary }}>
            {state.clockedIn ? "You are on shift" : "Ready to start your shift"}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: theme.onSurfaceVariant }}>
            {employeeName}
            {state.employee.role ? ` · ${state.employee.role}` : ""}
          </p>
          {state.clockedIn && state.lastLog && (
            <p className="mt-1 text-sm font-medium" style={{ color: theme.secondary }}>
              Since {formatTime(state.lastLog.createdAt, locale, timezone)}
              {shiftDuration ? ` · ${shiftDuration}` : ""}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {state.clockedIn ? (
              <button
                type="button"
                onClick={() => void punch("leave")}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
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
                className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                <LogIn className="h-4 w-4" />
                {busy === "arrive" ? "Checking location…" : "Arrive at work"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setBusy("refresh");
                setError(null);
                void refresh().finally(() => setBusy(null));
              }}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 rounded-full border px-4 py-3.5 text-sm font-semibold"
              style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
            >
              <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-xl px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-start gap-3 border-t px-5 py-4 text-xs"
          style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold" style={{ color: theme.secondary }}>
              {state.location?.name ?? "Store location not set"}
            </p>
            <p className="mt-0.5">
              {state.location?.latitude
                ? "Location is checked when you arrive or leave. You must be within 100 m of the store."
                : "Ask the owner to set the store location in Settings before using attendance."}
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-3xl border px-5 py-4"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: theme.primary }}>
            Today
          </h2>
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: theme.secondary }}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Location verified
          </span>
        </div>

        {state.today.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: theme.onSurfaceVariant }}>
            No attendance recorded today.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {state.today.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: theme.outlineVariant }}
              >
                <span className="flex items-center gap-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
                  {log.type === "arrive" ? (
                    <LocateFixed className="h-4 w-4 text-green-600" />
                  ) : (
                    <LogOut className="h-4 w-4" style={{ color: "#b3261e" }} />
                  )}
                  {log.type === "arrive" ? "Arrived" : "Left"}
                </span>
                <span className="flex items-center gap-3 text-xs" style={{ color: theme.secondary }}>
                  {log.distanceMeters != null && <span>{log.distanceMeters} m</span>}
                  <span className="font-semibold" style={{ color: theme.onSurfaceVariant }}>
                    {formatTime(log.createdAt, locale, timezone)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
