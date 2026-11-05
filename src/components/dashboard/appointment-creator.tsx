"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CalendarPlus, Clock3, Home, MapPin, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeTokens } from "@/config/business-types";

export type CreatorService = {
  id: string;
  name: string;
  homeVisit: boolean;
  durationMinutes: number;
  price: string;
};

export type CreatorEmployee = {
  id: string;
  name: string;
  homeVisit: boolean;
};

type Props = {
  slug: string;
  theme: ThemeTokens;
  services: CreatorService[];
  employees: CreatorEmployee[];
  canCreate: boolean;
};

type Mode = "manual" | "quick";

export function AppointmentCreator({ slug, theme, services, employees, canCreate }: Props) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState<Mode | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [useCurrentTime, setUseCurrentTime] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [homeCity, setHomeCity] = useState("");

  const homeVisitSelected = selectedServices.some((id) => services.find((s) => s.id === id)?.homeVisit);

  const openMode = (mode: Mode) => {
    setError(null);
    setSelectedServices([]);
    setEmployeeId("");
    setDate(new Date().toISOString().slice(0, 10));
    setUseCurrentTime(false);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setHomeAddress("");
    setHomeCity("");
    setOpen(mode);
  };

  const toggleService = (id: string) =>
    setSelectedServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        serviceIds: open === "manual" ? selectedServices : [],
        employeeId: employeeId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        notes: notes || undefined,
      };
      if (open === "quick" || useCurrentTime) {
        payload.useCurrentTime = true;
        payload.dateKey = date;
      } else {
        payload.dateKey = date;
        payload.startTime = time;
      }
      if (homeVisitSelected) {
        payload.homeAddress = homeAddress || undefined;
        payload.homeCity = homeCity || undefined;
      }
      const res = await fetch(`/api/admin/appointments?slug=${encodeURIComponent(slug)}&action=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ success: false, message: "Network error" }));
      if (!json.success) throw new Error(json.message ?? t("error"));
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  if (!canCreate) return null;

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#091426]";
  const quick = open === "quick";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openMode("quick")}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <Clock3 className="h-4 w-4" />
          {t("quickAppointment")}
        </button>
        <button
          type="button"
          onClick={() => openMode("manual")}
          className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold"
          style={{ borderColor: theme.outlineVariant, color: theme.primary, backgroundColor: theme.surfaceContainerLowest }}
        >
          <Plus className="h-4 w-4" />
          {t("addAppointment")}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !busy && setOpen(null)}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6"
            style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ color: theme.primary }}>
                  <CalendarPlus className="h-5 w-5" />
                  {quick ? t("quickAppointment") : t("addAppointment")}
                </h2>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.onSurfaceVariant }}>
                  {quick ? t("quickAppointmentHint") : t("addAppointmentHint")}
                </p>
              </div>
              <button type="button" onClick={() => !busy && setOpen(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>
                {error}
              </div>
            )}

            <div className="space-y-4">
              {!quick && (
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                    {t("appointmentServices")}
                  </label>
                  {services.length === 0 ? (
                    <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>{t("noData")}</p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {services.map((s) => {
                        const checked = selectedServices.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", checked && "border-primary")}
                            style={{
                              borderColor: checked ? theme.primary : theme.outlineVariant,
                              color: theme.onSurfaceVariant,
                              backgroundColor: checked ? theme.surface : "transparent",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleService(s.id)}
                              className="h-4 w-4"
                              style={{ accentColor: theme.primary }}
                            />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            {s.homeVisit && (
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "#e3f2fd", color: "#04519b" }}>
                                {t("homeVisit")}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                  {t("appointmentWorker")}
                </label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                >
                  <option value="">{t("chooseWorker")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.homeVisit ? ` · ${t("homeVisit")}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {!quick && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                      {t("appointmentDate")}
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      disabled={useCurrentTime}
                      className={inputClass}
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                      {t("appointmentTime")}
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      disabled={useCurrentTime}
                      className={inputClass}
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                    />
                  </div>
                </div>
              )}

              {!quick && (
                <label className="flex items-center gap-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
                  <input
                    type="checkbox"
                    checked={useCurrentTime}
                    onChange={(e) => setUseCurrentTime(e.target.checked)}
                    className="h-4 w-4"
                    style={{ accentColor: theme.primary }}
                  />
                  {t("useCurrentTime")}
                </label>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                    {t("customerNameOptional")}
                  </label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                    {t("customerPhoneOptional")}
                  </label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    inputMode="tel"
                    dir="ltr"
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                  {t("notesOptional")}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                />
              </div>

              {homeVisitSelected && (
                <div className="rounded-xl border p-3" style={{ borderColor: theme.primary, backgroundColor: theme.surface }}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: theme.primary }}>
                    <MapPin className="h-3.5 w-3.5" />
                    {t("homeAddress")}
                  </p>
                  <div className="mt-2 space-y-2">
                    <input
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                      placeholder={t("homeAddressRequired")}
                      className={inputClass}
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                    />
                    <input
                      value={homeCity}
                      onChange={(e) => setHomeCity(e.target.value)}
                      placeholder={t("homeCityPlaceholder")}
                      className={inputClass}
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  disabled={busy}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold"
                  style={{ color: theme.onSurfaceVariant }}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !employeeId || (!quick && selectedServices.length === 0)}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                >
                  {busy ? t("processing") : t("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
