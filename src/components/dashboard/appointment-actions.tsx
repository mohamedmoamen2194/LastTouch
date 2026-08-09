"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Props = {
  slug: string;
  appointmentId: string;
  status: string;
};

export function AppointmentActions({ slug, appointmentId, status }: Props) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointments?slug=${slug}&action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, ...payload }),
      });
      const json = await res.json().catch(() => ({ success: false, message: "Network error" }));
      if (!json.success) {
        setError(json.message);
        return;
      }
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(null);
    }
  };

  const submitReschedule = async () => {
    if (!newDate || !newTime) return;
    await run("reschedule", { appointmentDate: newDate, startTime: newTime });
    if (!error) setRescheduling(false);
  };

  return (
    <div className="flex flex-wrap items-stretch justify-stretch gap-2 md:items-center md:justify-end">
      {error && (
        <span className="w-full text-right text-xs text-[#ba1a1a]">{error}</span>
      )}

      {status === "pending" && (
        <ActionButton
          label={t("confirmAppointment")}
          busy={busy === "confirm"}
          disabled={busy !== null}
          onClick={() => run("confirm")}
          style={{ borderColor: "#c5c6cd", color: "#45474c" }}
        />
      )}
      {(status === "pending" || status === "confirmed") && (
        <ActionButton
          label={t("rescheduleAppointment")}
          busy={busy === "open-reschedule"}
          disabled={busy !== null}
          onClick={() => {
            setNewDate(new Date().toISOString().slice(0, 10));
            setNewTime("10:00");
            setRescheduling(true);
          }}
          style={{ borderColor: "#c5c6cd", color: "#45474c" }}
        />
      )}
      {status === "confirmed" && (
        <>
          <ActionButton
            label={t("completeAppointment")}
            busy={busy === "complete"}
            disabled={busy !== null}
            onClick={() => run("complete")}
            style={{ borderColor: "#091426", color: "#091426" }}
          />
          <ActionButton
            label={t("noShowAppointment")}
            busy={busy === "no_show"}
            disabled={busy !== null}
            onClick={() => run("no_show")}
            style={{ borderColor: "#c5c6cd", color: "#45474c" }}
          />
        </>
      )}
      {(status === "pending" || status === "confirmed") && (
        <ActionButton
          label={t("cancelAction")}
          busy={busy === "cancel"}
          disabled={busy !== null}
          onClick={() => run("cancel")}
          style={{ borderColor: "#c5c6cd", color: "#ba1a1a" }}
        />
      )}
      {status !== "pending" && status !== "confirmed" && <span className="text-xs text-[#8a8d94]">—</span>}

      {rescheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-xl" style={{ borderColor: "#c5c6cd" }}>
            <h3 className="text-base font-semibold" style={{ color: "#091426" }}>{t("rescheduleTitle")}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#45474c]">{t("appointmentDate")}</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full rounded-lg border border-[#c5c6cd] px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#45474c]">{t("appointmentTime")}</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full rounded-lg border border-[#c5c6cd] px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRescheduling(false);
                  setError(null);
                }}
                disabled={busy !== null}
                className="rounded-md px-5 py-2.5 text-sm font-semibold text-[#45474c]"
              >
                {t("cancelAction")}
              </button>
              <button
                type="button"
                onClick={submitReschedule}
                disabled={busy !== null || !newDate || !newTime}
                className="flex-1 rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
                style={{ backgroundColor: "#091426" }}
              >
                {busy === "reschedule" ? t("processing") : t("rescheduleAppointment")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
  style,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 sm:flex-none"
      style={style}
    >
      {busy ? "…" : label}
    </button>
  );
}