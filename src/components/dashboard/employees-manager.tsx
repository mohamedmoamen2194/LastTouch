"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  Pencil,
  Phone,
  Plus,
  Star,
  StickyNote,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ManagedEmployee = {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string | null;
  role: string | null;
  phone: string | null;
  salary: string | null;
  bio: string | null;
  rating: string | null;
  active: boolean;
  serviceIds: string[];
  workingHours: { weekday: number; startTime: string; endTime: string }[];
};

export type ManagedServiceRef = {
  id: string;
  name: string;
};

type Props = {
  slug: string;
  locale: string;
  theme: ThemeTokens;
  employees: ManagedEmployee[];
  services: ManagedServiceRef[];
  businessName: string;
};

type DayForm = { weekday: number; enabled: boolean; start: string; end: string };

type FormState = {
  id?: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
  salary: string;
  active: boolean;
  serviceIds: string[];
  days: DayForm[];
};

const WEEKDAY_LABELS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function makeEmptyDays(): DayForm[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({ weekday, enabled: true, start: "09:00", end: "22:00" }));
}

function daysToForm(days: ManagedEmployee["workingHours"]): DayForm[] {
  const map = new Map(days.map((d) => [d.weekday, { weekday: d.weekday, enabled: true, start: d.startTime, end: d.endTime }]));
  return WEEKDAY_LABELS.map((_, weekday) => map.get(weekday) ?? { weekday, enabled: false, start: "09:00", end: "22:00" });
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  role: "",
  phone: "",
  salary: "",
  active: true,
  serviceIds: [],
  days: makeEmptyDays(),
};

type EmployeeOverview = {
  upcoming: {
    id: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    status: string;
    serviceNames: string[];
    customerName: string | null;
  }[];
  monthly: { date: string; count: number }[];
  servedCustomers: number;
  rating: number;
  totalWorksThisMonth: number;
};

export function EmployeesManager({ slug, locale, theme, employees: initial, services, businessName }: Props) {
  const t = useTranslations("employees");
  const dt = useTranslations("dashboard");

  const [employees, setEmployees] = useState<ManagedEmployee[]>(initial);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ManagedEmployee | null>(null);
  const [overview, setOverview] = useState<EmployeeOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [openSections, setOpenSections] = useState<{ upcoming: boolean; monthly: boolean; services: boolean; notes: boolean }>({
    upcoming: false,
    monthly: false,
    services: false,
    notes: false,
  });

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((o) => ({ ...o, [key]: !o[key] }));

  const openDetail = async (e: ManagedEmployee) => {
    setDetail(e);
    setOverview(null);
    setOpenSections({ upcoming: false, monthly: false, services: false, notes: false });
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees?slug=${encodeURIComponent(slug)}&action=overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setOverview(json.data as EmployeeOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoadingOverview(false);
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setModal("create");
  };

  const openEdit = (e: ManagedEmployee) => {
    setForm({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName ?? "",
      role: e.role ?? "",
      phone: e.phone ?? "",
      salary: e.salary ?? "",
      active: e.active,
      serviceIds: e.serviceIds,
      days: daysToForm(e.workingHours),
    });
    setEditingId(e.id);
    setError(null);
    setModal("edit");
  };

  const call = async (action: "create" | "update" | "delete", payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/employees?slug=${encodeURIComponent(slug)}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Request failed");
    return json.data as { id: string; displayName: string | null };
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const isEdit = modal === "edit";
      const payload = {
        id: isEdit ? editingId : undefined,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        phone: form.phone,
        salary: form.salary,
        active: form.active,
        serviceIds: form.serviceIds,
        workingHours: form.days.filter((d) => d.enabled).map((d) => ({ weekday: d.weekday, startTime: d.start, endTime: d.end })),
      };
      const result = await call(isEdit ? "update" : "create", payload);
      const full: ManagedEmployee = {
        id: result.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        displayName: result.displayName ?? `${form.firstName.trim()}${form.lastName.trim() ? " " + form.lastName.trim() : ""}`,
        role: form.role.trim() || null,
        phone: form.phone.trim() || null,
        salary: form.salary === "" ? null : form.salary,
        bio: null,
        rating: null,
        active: form.active,
        serviceIds: form.serviceIds,
        workingHours: form.days.filter((d) => d.enabled).map((d) => ({ weekday: d.weekday, startTime: d.start, endTime: d.end })),
      };
      if (isEdit) {
        setEmployees((prev) => prev.map((e) => (e.id === result.id ? { ...e, ...full } : e)));
      } else {
        setEmployees((prev) => [...prev, full]);
      }
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await call("delete", { id });
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleService = (serviceId: string) => {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(serviceId)
        ? f.serviceIds.filter((id) => id !== serviceId)
        : [...f.serviceIds, serviceId],
    }));
  };

  const updateDay = (weekday: number, patch: Partial<DayForm>) => {
    setForm((f) => ({ ...f, days: f.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) }));
  };

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#091426]";
  const timeClass = "w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-[#091426]";

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("title")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{businessName}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full px-4 py-2.5 text-sm font-semibold sm:self-auto"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#ffffff" }}>
          {error}
        </div>
      )}

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm md:p-10" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {dt("noData")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {employees.map((e) => {
            const assigned = e.serviceIds
              .map((id) => services.find((s) => s.id === id)?.name)
              .filter((n): n is string => Boolean(n));
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => void openDetail(e)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    void openDetail(e);
                  }
                }}
                className="flex h-full cursor-pointer flex-col rounded-xl border p-4 transition-shadow hover:shadow-lg md:p-5 focus:outline-none"
                style={{
                  borderColor: theme.outlineVariant,
                  backgroundColor: theme.surfaceContainerLowest,
                  opacity: e.active ? 1 : 0.6,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold md:text-lg" style={{ color: theme.primary }}>
                      {e.displayName ?? `${e.firstName}${e.lastName ? " " + e.lastName : ""}`}
                    </h3>
                    {e.role && <p className="mt-0.5 truncate text-xs font-medium" style={{ color: theme.secondary }}>{e.role}</p>}
                  </div>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: e.active ? theme.surfaceContainerHigh : theme.outlineVariant,
                      color: e.active ? theme.secondary : theme.onSurfaceVariant,
                    }}
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {e.active ? t("active") : t("inactive")}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-sm" style={{ color: theme.onSurfaceVariant }}>
                  {e.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" dir="ltr">{e.phone}</span>
                    </p>
                  )}
                  {e.salary && (
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {t("salaryShort")}: <span className="font-medium" style={{ color: theme.primary }}>{Number(e.salary).toLocaleString(locale)}</span>
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {assigned.length > 0 ? (
                    assigned.slice(0, 3).map((name) => (
                      <span key={name} className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}>
                      {t("general")}
                    </span>
                  )}
                  {assigned.length > 3 && (
                    <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>
                      +{assigned.length - 3}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t pt-3 md:mt-auto" style={{ borderColor: theme.outlineVariant }}>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openEdit(e);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: theme.outlineVariant, color: theme.primary }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setPendingDelete(e.id);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: theme.outlineVariant, color: "#ba1a1a" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !busy && setModal(null)}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6"
            style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>
                {modal === "create" ? t("addTitle") : t("editTitle")}
              </h2>
              <button type="button" onClick={() => !busy && setModal(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("firstName")}</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder={t("firstNamePlaceholder")}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("lastName")}</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    placeholder={t("lastNamePlaceholder")}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("role")}</label>
                  <input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder={t("rolePlaceholder")}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("phone")}</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder={t("phonePlaceholder")}
                    inputMode="tel"
                    dir="ltr"
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("salary")}</label>
                <input
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  placeholder={t("salaryPlaceholder")}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="50"
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("services")}</label>
                {services.length === 0 ? (
                  <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>{t("noServicesHint")}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {services.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                        <input
                          type="checkbox"
                          checked={form.serviceIds.includes(s.id)}
                          onChange={() => toggleService(s.id)}
                          className="h-4 w-4"
                          style={{ accentColor: theme.primary }}
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                  {t("generalHint")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("workingHours")}</label>
                <div className="space-y-1.5">
                  {form.days.map((d) => (
                    <div key={d.weekday} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.outlineVariant }}>
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => updateDay(d.weekday, { enabled: e.target.checked })}
                        className="h-4 w-4 shrink-0"
                        style={{ accentColor: theme.primary }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                        {t(`days.${WEEKDAY_LABELS[d.weekday]}`)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="time"
                          value={d.start}
                          disabled={!d.enabled}
                          onChange={(e) => updateDay(d.weekday, { start: e.target.value })}
                          className={timeClass}
                          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                        />
                        <span className="text-xs" style={{ color: theme.onSurfaceVariant }}>–</span>
                        <input
                          type="time"
                          value={d.end}
                          disabled={!d.enabled}
                          onChange={(e) => updateDay(d.weekday, { end: e.target.value })}
                          className={timeClass}
                          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4"
                  style={{ accentColor: theme.primary }}
                />
                {t("active")}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  disabled={busy}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold"
                  style={{ color: theme.onSurfaceVariant }}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || !form.firstName.trim()}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                >
                  {busy ? dt("processing") : t("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6"
            style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold" style={{ color: theme.primary }}>
                  {detail.displayName ?? `${detail.firstName}${detail.lastName ? " " + detail.lastName : ""}`}
                </h2>
                {detail.role && <p className="truncate text-xs font-medium" style={{ color: theme.secondary }}>{detail.role}</p>}
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#ffffff" }}>
                {error}
              </div>
            )}

            <div className="space-y-2">
              <AccordionItem
                icon={<CalendarDays className="h-4 w-4" />}
                label={t("upcoming")}
                open={openSections.upcoming}
                onToggle={() => toggleSection("upcoming")}
                theme={theme}
                badge={overview ? String(overview.upcoming.length) : undefined}
              >
                {loadingOverview ? (
                  <p className="py-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{dt("processing")}</p>
                ) : !overview || overview.upcoming.length === 0 ? (
                  <p className="py-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noUpcoming")}</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.upcoming.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: theme.outlineVariant }}>
                        <div className="min-w-0">
                          <p className="truncate font-medium" style={{ color: theme.onSurfaceVariant }}>
                            {formatNiceDay(a.appointmentDate)} · {a.startTime}–{a.endTime}
                          </p>
                          <p className="truncate text-xs" style={{ color: theme.secondary }}>
                            {a.customerName ?? t("emptyState")}
                            {a.serviceNames.length > 0 ? ` · ${a.serviceNames.join(", ")}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md px-2 py-1 text-xs font-medium capitalize" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}>
                          {a.status.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionItem>

              <AccordionItem
                icon={<Users className="h-4 w-4" />}
                label={t("monthlyWork")}
                open={openSections.monthly}
                onToggle={() => toggleSection("monthly")}
                theme={theme}
                badge={overview ? `${overview.totalWorksThisMonth} · ${t("servedCustomers")}: ${overview.servedCustomers}` : undefined}
              >
                {loadingOverview ? (
                  <p className="py-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{dt("processing")}</p>
                ) : !overview || overview.monthly.length === 0 ? (
                  <p className="py-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("emptyState")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {overview.monthly.map((m) => (
                      <li key={m.date} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: theme.outlineVariant }}>
                        <span style={{ color: theme.onSurfaceVariant }}>{formatShortDay(m.date)}</span>
                        <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.primary }}>
                          {t("worksCount", { count: m.count })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionItem>

              <AccordionItem
                icon={<Wrench className="h-4 w-4" />}
                label={t("servicesAssigned")}
                open={openSections.services}
                onToggle={() => toggleSection("services")}
                theme={theme}
                badge={detail.serviceIds.length > 0 ? String(detail.serviceIds.length) : undefined}
              >
                {detail.serviceIds.length === 0 ? (
                  <p className="py-2 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noServicesAssigned")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.serviceIds
                      .map((id) => services.find((s) => s.id === id)?.name)
                      .filter((n): n is string => Boolean(n))
                      .map((name) => (
                        <span key={name} className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>
                          {name}
                        </span>
                      ))}
                  </div>
                )}
              </AccordionItem>

              <AccordionItem
                icon={<StickyNote className="h-4 w-4" />}
                label={t("notesLabel")}
                open={openSections.notes}
                onToggle={() => toggleSection("notes")}
                theme={theme}
              >
                {detail.bio ? (
                  <p className="py-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{detail.bio}</p>
                ) : (
                  <p className="py-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noNotes")}</p>
                )}
              </AccordionItem>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: theme.outlineVariant }}>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: theme.outlineVariant }}>
                <Clock className="h-4 w-4 shrink-0" style={{ color: theme.onSurfaceVariant }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.secondary }}>{t("salaryShort")}</p>
                  <p className="truncate text-sm font-semibold" style={{ color: theme.primary }}>
                    {detail.salary ? Number(detail.salary).toLocaleString(locale) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: theme.outlineVariant }}>
                <Star className="h-4 w-4 shrink-0" style={{ color: theme.onSurfaceVariant }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.secondary }}>{t("rating")}</p>
                  <p className="truncate text-sm font-semibold" style={{ color: theme.primary }}>
                    {overview ? (overview.rating > 0 ? overview.rating.toFixed(1) : t("noRating")) : t("noRating")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border p-6 text-center shadow-xl" style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}>
            <h3 className="text-base font-semibold" style={{ color: theme.primary }}>{t("confirmDelete")}</h3>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={busy}
                className="rounded-full px-5 py-2.5 text-sm font-semibold"
                style={{ color: theme.onSurfaceVariant }}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => remove(pendingDelete)}
                disabled={busy}
                className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#ba1a1a", color: "#ffffff" }}
              >
                {busy ? dt("processing") : t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AccordionProps = {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  theme: ThemeTokens;
  badge?: string;
  children: ReactNode;
};

function AccordionItem({ icon, label, open, onToggle, theme, badge, children }: AccordionProps) {
  return (
    <div className="rounded-xl border" style={{ borderColor: theme.outlineVariant }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
        style={{ color: theme.onSurfaceVariant }}
      >
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          <span style={{ color: theme.primary }}>{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge && (
            <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.primary }}>
              {badge}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: theme.onSurfaceVariant }}
          />
        </span>
      </button>
      {open && (
        <div className="border-t px-3 py-2.5" style={{ borderColor: theme.outlineVariant }}>
          {children}
        </div>
      )}
    </div>
  );
}

function formatNiceDay(ymd: string) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDay(ymd: string) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}