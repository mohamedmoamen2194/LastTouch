"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getThemeTokens, type ThemeTokens } from "@/config/business-types";
import type { ThemeName } from "@/db/schema";
import { cn } from "@/lib/utils";

type WidgetService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
};
type WidgetEmployee = {
  id: string;
  displayName: string | null;
  firstName: string;
  lastName: string | null;
  yearsExperience: number | null;
  serviceIds: string[];
};
type WidgetTenant = {
  businessName: string;
  tagline: string | null;
  description: string | null;
  employeeLabel: string;
  currency: string;
};

type Slot = { start: string; end: string; available: boolean };
type Receipt = {
  appointmentId: string;
  startTime: string;
  endTime: string;
  appointmentDate: string;
  employee: { id: string; displayName: string | null; firstName: string; lastName: string | null } | null;
  services: { name: string; price: string; durationMinutes: number }[];
};

type Props = {
  tenant: WidgetTenant;
  themeId: ThemeName;
  services: WidgetService[];
  employees: WidgetEmployee[];
};

export function BookingWidget({ tenant, themeId, services, employees }: Props) {
  const t = useTranslations("booking");
  const theme = getThemeTokens(themeId);

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string>("any");
  const [teamOpen, setTeamOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => todayYM());
  const [months, setMonths] = useState<Record<string, string[]>>({});
  const monthsLoaded = useRef(new Set<string>());
  const [date, setDate] = useState<string | null>(null);
  const [hour, setHour] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", phone: "", notes: "" });

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [serviceId, services]);

  // Staff who can take the selected service (must be linked to it).
  const eligibleStaff = useMemo(() => {
    if (!serviceId) return [];
    return employees.filter((e) => e.serviceIds.includes(serviceId));
  }, [employees, serviceId]);

  const names = [t("stepService"), t("stepStaff"), t("stepTime")];

  const initials = (e: WidgetEmployee | undefined) =>
    (e ? (e.displayName ?? `${e.firstName} ${e.lastName ?? ""}`).trim().charAt(0).toUpperCase() : "") || "P";

  const week = useMemo(() => nextSevenDays(), []);
  const shortWeekLabels = useMemo(() => shortWeekLabelsFor(week), [week]);

  // ---- Slot fetching ----

  const fetchSlots = async (d: string) => {
    if (!serviceId) return;
    setLoadingSlots(true);
    setError(null);
    try {
      const res = await fetch("/api/book/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugFromPath(),
          serviceIds: [serviceId],
          employeeId: !employeeId || employeeId === "any" ? undefined : employeeId,
          date: d,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message);
        setSlots([]);
      } else {
        setSlots(json.data.slots as Slot[]);
      }
    } catch {
      setError("Something went wrong");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const loadMonth = async (ym: string) => {
    if (!serviceId) return;
    const key = `${ym}|${employeeId}|${serviceId}`;
    if (monthsLoaded.current.has(key)) return;
    monthsLoaded.current.add(key);
    setLoadingCalendar(true);
    try {
      const res = await fetch("/api/book/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugFromPath(),
          serviceIds: [serviceId],
          employeeId: !employeeId || employeeId === "any" ? undefined : employeeId,
          month: ym,
        }),
      });
      const json = await res.json();
      setMonths((prev) => ({ ...prev, [ym]: json.success ? (json.data.days as string[]) : [] }));
    } catch {
      setMonths((prev) => ({ ...prev, [ym]: [] }));
    } finally {
      setLoadingCalendar(false);
    }
  };

  const enterTimeStep = () => {
    const yms = new Set<string>([
      ...week.map((d) => d.value.slice(0, 7)),
      viewMonth,
      nextMonthYM(viewMonth),
    ]);
    setStep(3);
    setCalOpen(false);
    setMonths({});
    monthsLoaded.current.clear();
    for (const ym of yms) void loadMonth(ym);
    if (date && serviceId) void fetchSlots(date);
  };

  const pickDate = async (d: string) => {
    setDate(d);
    setHour(null);
    setTime(null);
    setCalOpen(false);
    await fetchSlots(d);
  };

  const moveMonth = (dir: 1 | -1) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const nd = new Date(y, (m ?? 1) - 1 + dir, 1);
    const ym = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
    setViewMonth(ym);
    void loadMonth(ym);
  };

  // ---- Confirm ----

  const confirm = async () => {
    if (!serviceId || !date || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/book/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugFromPath(),
          serviceIds: [serviceId],
          employeeId: !employeeId || employeeId === "any" ? undefined : employeeId,
          appointmentDate: date,
          startTime: time,
          customer: { ...form, marketingConsent: true },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message);
        return;
      }
      setReceipt(json.data as Receipt);
      setDone(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Hourly slot grouping ----

  const hourGroups = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const h = s.start.slice(0, 2) + ":00";
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(s);
    }
    return Array.from(map.entries())
      .map(([label, list]) => ({ label, times: list.sort((a, b) => a.start.localeCompare(b.start)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slots]);

  // ---- Done / receipt ----

  if (done) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>
          <CheckIcon className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold" style={{ color: theme.primary }}>{t("success")}</h2>
        <p className="mt-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("receiptNote")}</p>

        {receipt && (
          <div
            className="mx-auto mt-6 overflow-hidden rounded-2xl border text-left"
            style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
          >
            <div className="px-5 py-4 text-sm font-semibold" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.primary }}>
              {t("receipt")}
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: theme.onSurfaceVariant }}>{t("receiptDate")}</span>
                <span className="font-semibold" style={{ color: theme.primary }}>{formatNice(date ?? "")}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: theme.onSurfaceVariant }}>{t("receiptTime")}</span>
                <span className="font-semibold" style={{ color: theme.primary }}>
                  {formatTime(receipt.startTime)} – {formatTime(receipt.endTime)}
                </span>
              </div>
              {receipt.services.map((s, idx) => (
                <div key={`${s.name}-${idx}`} className="flex items-center justify-between gap-3">
                  <span style={{ color: theme.onSurfaceVariant }}>{s.name} · {s.durationMinutes} {t("min")}</span>
                  <span className="font-medium" style={{ color: theme.primary }}>{formatMoney(s.price, tenant.currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: theme.outlineVariant }}>
                <span style={{ color: theme.onSurfaceVariant }}>{t("receiptWorker")}</span>
                <span className="font-semibold" style={{ color: theme.primary }}>
                  {receipt.employee
                    ? receipt.employee.displayName ?? `${receipt.employee.firstName} ${receipt.employee.lastName ?? ""}`.trim()
                    : !employeeId || employeeId === "any"
                      ? t("anyTeam")
                      : (employees.find((e) => e.id === employeeId)?.displayName ?? "")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: theme.outlineVariant }}>
                <span style={{ color: theme.onSurfaceVariant }}>{t("totalPrice")}</span>
                <span className="text-lg font-bold" style={{ color: theme.primary }}>
                  {formatMoney(receipt.services.reduce((sum, s) => sum + Number(s.price), 0), tenant.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setDone(false);
            setReceipt(null);
            setStep(1);
            setServiceId(null);
            setEmployeeId("any");
            setDate(null);
            setHour(null);
            setTime(null);
            setSlots([]);
            setTeamOpen(false);
            setCalOpen(false);
          }}
          className="mt-8 rounded-full px-6 py-3 text-sm font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {t("makeAnother")}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Progress tracker */}
      <div className="relative mx-auto mb-8 md:mb-12">
        <div className="grid grid-cols-3 items-start">
          {names.map((label, i) => {
            const active = step >= i + 1;
            return (
              <div key={i} className="relative z-10 flex flex-col items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold md:h-10 md:w-10"
                  style={{
                    backgroundColor: active ? theme.primary : theme.surfaceContainerLowest,
                    color: active ? theme.onPrimary : theme.onSurfaceVariant,
                    border: active ? "none" : `2px solid ${theme.surfaceContainerHigh}`,
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className={cn("hidden text-sm sm:block")}
                  style={{ color: active ? theme.primary : theme.onSurfaceVariant }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="absolute left-[16.67%] right-[16.67%] top-4 h-0.5 md:top-5"
          style={{ backgroundColor: theme.surfaceContainerHigh }}
        />
        <div
          className="absolute left-[16.67%] top-4 h-0.5 transition-all duration-500 md:top-5"
          style={{
            backgroundColor: theme.primary,
            width: `calc(${Math.max(0, (step - 1) / 2)} * 66.66%)`,
          }}
        />
      </div>

      <div
        className="rounded-xl border p-5 md:p-8"
        style={{
          backgroundColor: theme.surfaceContainerLowest,
          borderColor: theme.outlineVariant,
          boxShadow: "0 4px 12px rgba(30, 41, 59, 0.05)",
        }}
      >
        {error && (
          <div className="mb-6 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#ffffff" }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <Heading title={t("selectService")} subtitle={t("subtitle")} theme={theme} />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (serviceId !== s.id) {
                      setServiceId(s.id);
                      setEmployeeId("any");
                      setTeamOpen(false);
                      setDate(null);
                      setHour(null);
                      setTime(null);
                      setSlots([]);
                      setMonths({});
                      monthsLoaded.current.clear();
                    }
                  }}
                  className="relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all sm:gap-3 sm:p-4 md:p-5"
                  style={{
                    borderColor: serviceId === s.id ? theme.primary : theme.outlineVariant,
                    boxShadow: serviceId === s.id ? `0 4px 20px -5px ${theme.primary}` : "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:h-10 sm:w-10"
                      style={{ backgroundColor: theme.primaryContainer, color: theme.onSurfaceVariant }}
                    >
                      {s.name.charAt(0)}
                    </span>
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                      style={{ borderColor: serviceId === s.id ? theme.primary : theme.outlineVariant }}
                    >
                      {serviceId === s.id && <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: theme.primary }} />}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold sm:text-base" style={{ color: theme.primary }}>{s.name}</h3>
                    {s.description && <p className="mt-0.5 hidden text-xs sm:mt-1 sm:block sm:text-sm" style={{ color: theme.onSurfaceVariant }}>{s.description}</p>}
                  </div>
                  <div className="mt-auto flex flex-col gap-0.5 border-t pt-2 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: theme.surfaceContainerHigh, color: theme.secondary }}>
                    <span className="text-xs sm:text-sm">{s.durationMinutes} {t("min")}</span>
                    <span className="text-xs font-semibold sm:text-sm" style={{ color: theme.primary }}>{formatMoney(s.price, tenant.currency)}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setTeamOpen(false);
                  setStep(2);
                }}
                disabled={!serviceId}
                className="rounded-full px-8 py-3 text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {t("continue")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <Back theme={theme} onClick={() => setStep(1)} />
            <Heading title={t("selectStaff")} subtitle={t("subtitle")} theme={theme} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Any team member */}
              <button
                type="button"
                onClick={() => {
                  setEmployeeId("any");
                  setTeamOpen(false);
                  setDate(null);
                  setHour(null);
                  setTime(null);
                  setSlots([]);
                }}
                className="flex flex-col items-center rounded-xl border-2 p-5 text-center transition-all sm:p-6"
                style={{
                  borderColor: employeeId === "any" ? theme.primary : theme.outlineVariant,
                  boxShadow: employeeId === "any" ? `0 4px 20px -5px ${theme.primary}` : "none",
                }}
              >
                <span
                  className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.surface }}
                >
                  <GroupsIcon color={theme.onSurfaceVariant} />
                </span>
                <span className="text-base font-semibold" style={{ color: employeeId === "any" ? theme.primary : theme.onSurfaceVariant }}>
                  {t("anyTeam")}
                </span>
                <span className="mt-1 text-xs" style={{ color: theme.secondary }}>
                  {t("anyTeamHint")}
                </span>
              </button>

              {/* Choose from team */}
              <button
                type="button"
                onClick={() => {
                  if (!employeeId || employeeId === "any") setEmployeeId("");
                  setTeamOpen((o) => !o);
                  setDate(null);
                  setHour(null);
                  setTime(null);
                  setSlots([]);
                }}
                className="flex flex-col items-center rounded-xl border-2 p-5 text-center transition-all sm:p-6"
                style={{
                  borderColor: teamOpen || (employeeId && employeeId !== "any" && eligibleStaff.some((e) => e.id === employeeId))
                    ? theme.primary
                    : theme.outlineVariant,
                  boxShadow: teamOpen || (employeeId && employeeId !== "any" && eligibleStaff.some((e) => e.id === employeeId))
                    ? `0 4px 20px -5px ${theme.primary}`
                    : "none",
                }}
              >
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-base font-semibold" style={{ backgroundColor: theme.surface, color: theme.primary }}>
                  {employeeId !== "any" && employeeId ? initials(eligibleStaff.find((e) => e.id === employeeId) ?? eligibleStaff[0]) : teamOpen ? "×" : "+"}
                </span>
                <span className="text-base font-semibold" style={{ color: employeeId && employeeId !== "any" ? theme.primary : theme.onSurfaceVariant }}>
                  {employeeId && employeeId !== "any"
                    ? (eligibleStaff.find((e) => e.id === employeeId)?.displayName ?? t("chooseTeam"))
                    : t("chooseTeam")}
                </span>
                <span className="mt-1 text-xs" style={{ color: theme.secondary }}>
                  {t("teamHint")}
                </span>
              </button>
            </div>

            {/* Team list — only staff for the selected service */}
            {teamOpen && (
              <div className="mt-4 rounded-xl border p-3 sm:p-4" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide" style={{ color: theme.secondary }}>
                  {t("teamListTitle")} · {service?.name}
                </p>
                {eligibleStaff.length === 0 ? (
                  <p className="py-6 text-center text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noStaffForService")}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {eligibleStaff.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setEmployeeId(e.id);
                          setTeamOpen(false);
                          setDate(null);
                          setHour(null);
                          setTime(null);
                          setSlots([]);
                        }}
                        className="flex items-center gap-3 rounded-lg border p-3 text-left"
                        style={{ borderColor: employeeId === e.id ? theme.primary : theme.outlineVariant }}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
                        >
                          {initials(e)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold" style={{ color: theme.primary }}>
                            {e.displayName ?? `${e.firstName} ${e.lastName ?? ""}`.trim()}
                          </span>
                          <span className="block truncate text-xs" style={{ color: theme.secondary }}>
                            {e.yearsExperience ? `${e.yearsExperience} yrs` : tenant.employeeLabel}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={enterTimeStep}
                className="rounded-full px-8 py-3 text-sm font-semibold"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {t("continue")}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <Back theme={theme} onClick={() => setStep(2)} />
            <Heading title={t("selectTime")} subtitle={t("totalDuration")} theme={theme} />

            {/* Collapsible date panel */}
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant }}>
              <button
                type="button"
                onClick={() => setCalOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left md:px-5"
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: date ? theme.primary : theme.onSurfaceVariant }}
                >
                  {date ? formatNice(date) : t("chooseDate")}
                </span>
                <span className="flex items-center gap-2 text-xs font-medium" style={{ color: theme.secondary }}>
                  {date && !calOpen ? t("change") : t("chooseDate")}
                  <ChevronIcon className={cn("h-4 w-4 transition-transform", calOpen && "rotate-180")} color={theme.secondary} />
                </span>
              </button>

              {calOpen && (
                <div className="border-t px-4 py-4 md:px-5" style={{ borderColor: theme.outlineVariant }}>
                  {loadingCalendar && (
                    <p className="mb-3 text-xs" style={{ color: theme.secondary }}>{t("loading")}</p>
                  )}

                  {/* Week shortcut — always visible while the panel is open */}
                  <div className="grid grid-cols-7 gap-1">
                    {week.map((d, i) => {
                      const ym = d.value.slice(0, 7);
                      const working = months[ym]?.includes(d.value) ?? false;
                      const dim = !working;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => working && void pickDate(d.value)}
                          disabled={dim}
                          className={cn("flex flex-col items-center rounded-lg py-2 text-xs transition-colors", dim && "cursor-not-allowed")}
                          style={{
                            backgroundColor: date === d.value ? theme.primary : "transparent",
                            color: dim ? theme.outlineVariant : date === d.value ? theme.onPrimary : theme.onSurfaceVariant,
                          }}
                        >
                          <span>{shortWeekLabels[i]}</span>
                          <span className="mt-0.5 text-sm font-semibold">{d.day}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Full calendar toggle — collapsed by default */}
                  <button
                    type="button"
                    onClick={() => setFullOpen((o) => !o)}
                    className="mt-3 flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-xs font-semibold"
                    style={{ borderColor: theme.outlineVariant, color: theme.primary }}
                  >
                    {t("showFullCalendar")}
                    <ChevronIcon className={cn("h-4 w-4 transition-transform", fullOpen && "rotate-180")} color={theme.primary} />
                  </button>

                  {fullOpen && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between px-1 pb-3">
                        <button
                          type="button"
                          onClick={() => moveMonth(-1)}
                          className="rounded-full p-2"
                          style={{ color: theme.secondary }}
                          aria-label={t("calPrev")}
                        >
                          <ChevronIcon className="h-4 w-4 -scale-x-100" color={theme.secondary} />
                        </button>
                        <span className="text-sm font-semibold" style={{ color: theme.primary }}>{formatMonth(viewMonth)}</span>
                        <button
                          type="button"
                          onClick={() => moveMonth(1)}
                          className="rounded-full p-2"
                          style={{ color: theme.secondary }}
                          aria-label={t("calNext")}
                        >
                          <ChevronIcon className="h-4 w-4" color={theme.secondary} />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-xs">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div key={i} className="pb-1 font-medium" style={{ color: theme.secondary }}>{d}</div>
                        ))}
                        {monthGrid(viewMonth).map((c, i) => {
                          const working = months[viewMonth]?.includes(c.date) ?? false;
                          const past = c.inMonth && c.date < todayYMD();
                          return (
                            <div key={i} className="flex aspect-square items-center justify-center">
                              {c.inMonth ? (
                                <button
                                  type="button"
                                  onClick={() => working && !past && void pickDate(c.date)}
                                  disabled={!working || past}
                                  className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
                                    (!working || past) && "cursor-not-allowed"
                                  )}
                                  style={{
                                    backgroundColor: date === c.date && working ? theme.primary : "transparent",
                                    color: !working || past ? theme.outlineVariant : date === c.date && working ? theme.onPrimary : theme.onSurfaceVariant,
                                    textDecoration: past ? "line-through" : "none",
                                  }}
                                >
                                  {c.day}
                                </button>
                              ) : (
                                <span />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs" style={{ color: theme.onSurfaceVariant }}>{t("workingDaysHint")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Slots — hourly, then fraction within the hour */}
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold" style={{ color: theme.primary }}>
                {date ? formatNice(date) : t("chooseDate")}
              </h3>
              {!date ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  {t("pickDateFirst")}
                </p>
              ) : loadingSlots ? (
                <p className="text-sm" style={{ color: theme.secondary }}>{t("loading")}</p>
              ) : hourGroups.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  {t("unavailable")}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: theme.secondary }}>
                    {t("pickHour")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {hourGroups.map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => {
                          setHour((h) => (h === g.label ? null : g.label));
                          setTime(null);
                        }}
                        className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                        style={{
                          borderColor: hour === g.label ? theme.primary : theme.outlineVariant,
                          backgroundColor: hour === g.label ? theme.primary : "transparent",
                          color: hour === g.label ? theme.onPrimary : theme.secondary,
                        }}
                      >
                        {formatTime(g.label)}
                      </button>
                    ))}
                  </div>

                  {hour && (
                    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: theme.secondary }}>
                        {t("pickSlot")} · {formatTime(hour)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {hourGroups.find((g) => g.label === hour)?.times.map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => s.available && setTime(s.start)}
                            disabled={!s.available}
                            className={cn(
                              "rounded-md border px-4 py-2 text-sm transition-colors",
                              !s.available && "cursor-not-allowed"
                            )}
                            style={{
                              borderColor: s.available ? (time === s.start ? theme.primary : theme.outlineVariant) : theme.surfaceContainerHigh,
                              backgroundColor: s.available ? (time === s.start ? theme.primary : "transparent") : theme.surfaceContainerLowest,
                              color: s.available ? (time === s.start ? theme.onPrimary : theme.secondary) : theme.outlineVariant,
                              textDecoration: !s.available ? "line-through" : "none",
                            }}
                          >
                            {formatTime(s.start)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-8 space-y-3">
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder={t("firstNamePlaceholder")}
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t("phonePlaceholder")}
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("notesOptional")}
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
              />
            </div>

            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row" style={{ borderColor: theme.outlineVariant }}>
              <div>
                <p className="text-sm" style={{ color: theme.secondary }}>{t("totalPrice")}</p>
                <p className="text-xl font-bold" style={{ color: theme.primary }}>
                  {service ? formatMoney(service.price, tenant.currency) : "0"}
                </p>
              </div>
              <button
                type="button"
                onClick={confirm}
                disabled={submitting || !time || !form.firstName || !form.phone}
                className="w-full rounded-full px-8 py-3 text-sm font-semibold disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {submitting ? t("loading") : t("bookNow")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- small helpers ----

function Heading({ title, subtitle, theme }: { title: string; subtitle?: string; theme: ThemeTokens }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold md:text-2xl" style={{ color: theme.primary }}>{title}</h2>
      {subtitle && <p className="mt-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{subtitle}</p>}
    </div>
  );
}

function Back({ theme, onClick }: { theme: ThemeTokens; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-6 flex items-center gap-2 text-sm font-medium" style={{ color: theme.secondary }}>
      <ArrowIcon /> Back
    </button>
  );
}

function nextSevenDays() {
  const out: { value: string; day: number }[] = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ value, day: d.getDate() });
  }
  return out;
}

function shortWeekLabelsFor(week: { value: string }[]) {
  return week.map((d) => dayLabel(d.value));
}

function dayLabel(ymd: string): string {
  const dt = new Date(`${ymd}T00:00:00`);
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][dt.getDay()];
}

function todayYM(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function todayYMD(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function nextMonthYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthGrid(ym: string): Array<{ date: string; inMonth: boolean; day: number }> {
  const [y, m] = ym.split("-").map(Number);
  const cells: Array<{ date: string; inMonth: boolean; day: number }> = [];
  const first = new Date(y, (m ?? 1) - 1, 1);
  for (let i = 0; i < first.getDay(); i++) {
    cells.push({ date: "", inMonth: false, day: 0 });
  }
  const last = new Date(y, (m ?? 1), 0).getDate();
  for (let d = 1; d <= last; d++) {
    cells.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, inMonth: true, day: d });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: "", inMonth: false, day: 0 });
  }
  return cells;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatNice(ymd: string) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatMoney(v: string | number, currency: string) {
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function slugFromPath() {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 13l4 4 10-10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GroupsIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke={color} strokeWidth={1.5}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ChevronIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l-6 6 6 6M3 12h18" />
    </svg>
  );
}