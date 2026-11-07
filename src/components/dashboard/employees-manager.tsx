"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  KeyRound,
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
  email: string | null;
  phone: string | null;
  salary: string | null;
  bio: string | null;
  rating: string | null;
  isGeneral: boolean;
  homeVisit: boolean;
  isBookable: boolean;
  active: boolean;
  userId: string | null;
  accessRole: string | null;
  panelAccess: boolean;
  permissions: string[] | null;
  membershipActive: boolean | null;
  inviteExpiresAt: string | null;
  serviceIds: string[];
  workingHours: { weekday: number; startTime: string; endTime: string }[];
};

export type ManagedServiceRef = {
  id: string;
  name: string;
  homeVisit: boolean;
};

type Props = {
  slug: string;
  locale: string;
  theme: ThemeTokens;
  employees: ManagedEmployee[];
  services: ManagedServiceRef[];
  businessName: string;
  roleOptions: string[];
  /** Max active team members for the current plan; null = unlimited (enterprise). */
  maxEmployees?: number | null;
};

type DayForm = { weekday: number; enabled: boolean; start: string; end: string };

export type AccessRole = "employee" | "cashier" | "manager";

type FormState = {
  id?: string;
  firstName: string;
  lastName: string;
  role: string;
  customRole: string;
  email: string;
  phone: string;
  salary: string;
  isGeneral: boolean;
  isBookable: boolean;
  homeVisit: boolean;
  active: boolean;
  panelAccess: boolean;
  accessRole: AccessRole;
  permissions: string[];
  serviceIds: string[];
  days: DayForm[];
};

/** Curated, human-facing grants shown as checkboxes in the team form. */
export const PERMISSION_GROUPS: { key: string; permissions: { key: string; label: string }[] }[] = [
  {
    key: "appointments",
    permissions: [
      { key: "appointments.read", label: "View appointments" },
      { key: "appointments.create", label: "Add appointments" },
      { key: "appointments.confirm", label: "Confirm appointments" },
      { key: "appointments.update", label: "Reschedule / edit" },
      { key: "appointments.complete", label: "Complete / no-show" },
    ],
  },
  {
    key: "customers",
    permissions: [
      { key: "customers.read", label: "View customers" },
      { key: "customers.create", label: "Add customers" },
    ],
  },
  {
    key: "inventory",
    permissions: [
      { key: "inventory.read", label: "View inventory" },
      { key: "inventory.manage", label: "Manage inventory" },
      { key: "sales.create", label: "Sell products" },
      { key: "sales.read", label: "View sales" },
    ],
  },
  {
    key: "other",
    permissions: [
      { key: "attendance.use", label: "Arrive / leave" },
      { key: "attendance.read", label: "View attendance history" },
      { key: "attendance.request", label: "Request day off / late arrival" },
      { key: "attendance.manage", label: "Manage all attendance" },
      { key: "services.read", label: "View services" },
      { key: "reviews.read", label: "View ratings" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

function defaultPermissionsFor(role: AccessRole): string[] {
  switch (role) {
    case "cashier":
      return [
        "appointments.read",
        "appointments.create",
        "appointments.confirm",
        "appointments.update",
        "appointments.complete",
        "customers.read",
        "customers.create",
        "customers.update",
        "services.read",
        "inventory.read",
        "sales.create",
        "sales.read",
        "reviews.read",
        "attendance.use",
        "attendance.read",
        "attendance.request",
      ];
    case "manager":
      return [
        "appointments.read",
        "appointments.create",
        "appointments.confirm",
        "appointments.update",
        "appointments.complete",
        "customers.read",
        "customers.create",
        "customers.update",
        "employees.read",
        "employees.manage",
        "services.read",
        "services.manage",
        "inventory.read",
        "inventory.manage",
        "sales.create",
        "sales.read",
        "attendance.use",
        "attendance.read",
        "attendance.request",
        "reviews.read",
      ];
    default:
      return [
        "appointments.read",
        "appointments.confirm",
        "appointments.update",
        "appointments.complete",
        "customers.read",
        "services.read",
        "inventory.read",
        "attendance.use",
        "attendance.read",
        "attendance.request",
      ];
  }
}

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
  customRole: "",
  email: "",
  phone: "",
  salary: "",
  isGeneral: false,
  isBookable: true,
  homeVisit: false,
  active: true,
  panelAccess: false,
  accessRole: "employee",
  permissions: defaultPermissionsFor("employee"),
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
    services: {
      name: string;
      startTime: string;
      endTime: string;
    }[];
    customerName: string | null;
  }[];
  monthly: { date: string; count: number }[];
  servedCustomers: number;
  rating: number;
  totalWorksThisMonth: number;
};

export function EmployeesManager({ slug, locale, theme, employees: initial, services, businessName, roleOptions, maxEmployees = 5 }: Props) {
  const t = useTranslations("employees");
  const dt = useTranslations("dashboard");

  const [employees, setEmployees] = useState<ManagedEmployee[]>(initial);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
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

  const activeCount = employees.filter((e) => e.active).length;
  const isUnlimited = maxEmployees === null || maxEmployees === undefined;
  const limitReached = !isUnlimited && activeCount >= (maxEmployees as number);

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
    if (limitReached) {
      setError(t("limitReached", { max: maxEmployees as number }));
      return;
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setModal("create");
  };

  const openEdit = (e: ManagedEmployee) => {
    const accessRole: AccessRole =
      e.accessRole === "cashier" || e.accessRole === "manager" ? e.accessRole : "employee";
    const knownRole = Boolean(e.role && roleOptions.includes(e.role));
    setForm({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName ?? "",
      role: knownRole ? (e.role as string) : e.role ? "__custom" : "",
      customRole: knownRole ? "" : (e.role ?? ""),
      email: e.email ?? "",
      phone: e.phone ?? "",
      salary: e.salary ?? "",
      isGeneral: e.isGeneral,
      isBookable: e.isBookable,
      homeVisit: e.homeVisit ?? false,
      active: e.active,
      panelAccess: e.panelAccess,
      accessRole,
      permissions: e.permissions ?? defaultPermissionsFor(accessRole),
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
    return json.data as {
      id: string;
      displayName: string | null;
      invite?: { code: string; expiresAt: string } | null;
    };
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const isEdit = modal === "edit";
      // Client-side seat guard (server enforces too). Active creates consume a seat.
      if (!isEdit && form.active && limitReached) {
        throw new Error(t("limitReached", { max: maxEmployees as number }));
      }
      // Re-activating an inactive member also consumes a seat.
      if (isEdit && form.active && !isUnlimited) {
        const prev = employees.find((e) => e.id === editingId);
        if (prev && !prev.active && activeCount >= (maxEmployees as number)) {
          throw new Error(t("limitReached", { max: maxEmployees as number }));
        }
      }
      const roleValue = form.role === "__custom" ? form.customRole.trim() : form.role.trim();
      const payload = {
        id: isEdit ? editingId : undefined,
        firstName: form.firstName,
        lastName: form.lastName,
        role: roleValue,
        customRole: roleValue,
        email: form.email,
        phone: form.phone,
        salary: form.salary,
        isGeneral: form.isGeneral,
        homeVisit: form.homeVisit,
        isBookable: form.isBookable,
        active: form.active,
        panelAccess: form.panelAccess,
        accessRole: form.panelAccess ? form.accessRole : null,
        permissions: form.panelAccess ? form.permissions : undefined,
        serviceIds: form.serviceIds,
        workingHours: form.days.filter((d) => d.enabled).map((d) => ({ weekday: d.weekday, startTime: d.start, endTime: d.end })),
      };
      const result = await call(isEdit ? "update" : "create", payload);
      const full: ManagedEmployee = {
        id: result.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        displayName: result.displayName ?? `${form.firstName.trim()}${form.lastName.trim() ? " " + form.lastName.trim() : ""}`,
        role: roleValue || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        salary: form.salary === "" ? null : form.salary,
        bio: null,
        rating: null,
        isGeneral: form.isGeneral,
        homeVisit: form.homeVisit,
        isBookable: form.isBookable,
        active: form.active,
        userId: null,
        accessRole: form.panelAccess ? form.accessRole : null,
        panelAccess: form.panelAccess,
        permissions: form.panelAccess ? form.permissions : null,
        membershipActive: null,
        inviteExpiresAt: result.invite?.expiresAt ?? null,
        serviceIds: form.serviceIds,
        workingHours: form.days.filter((d) => d.enabled).map((d) => ({ weekday: d.weekday, startTime: d.start, endTime: d.end })),
      };
      if (isEdit) {
        setEmployees((prev) => prev.map((e) => (e.id === result.id ? { ...e, ...full, userId: e.userId, membershipActive: e.membershipActive } : e)));
      } else {
        setEmployees((prev) => [...prev, full]);
      }
      if (result.invite?.code) {
        setInviteLink(
          `${window.location.origin}/${locale}/staff/join?code=${encodeURIComponent(result.invite.code)}`
        );
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
    setForm((f) => {
      const checked = f.serviceIds.includes(serviceId);
      const serviceIds = checked
        ? f.serviceIds.filter((id) => id !== serviceId)
        : [...f.serviceIds, serviceId];
      const allSelected = serviceIds.length === services.length && services.length > 0;
      return { ...f, serviceIds, isGeneral: checked ? false : allSelected };
    });
  };

  const togglePermission = (permission: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permission)
        ? f.permissions.filter((p) => p !== permission)
        : [...f.permissions, permission],
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
          <p className="mt-1 text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
            {isUnlimited
              ? t("seatsUnlimited")
              : t("seatsUsed", { used: activeCount, max: maxEmployees as number })}
          </p>
          {limitReached && (
            <p className="mt-1 text-xs font-semibold" style={{ color: "#ba1a1a" }}>
              {t("limitReached", { max: maxEmployees as number })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={limitReached}
          title={limitReached ? t("limitReached", { max: maxEmployees as number }) : undefined}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
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
                    {e.panelAccess && (
                      <span
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: e.userId ? theme.primary : theme.surfaceContainerHigh,
                          color: e.userId ? theme.onPrimary : theme.secondary,
                        }}
                      >
                        <KeyRound className="h-3 w-3" />
                        {e.userId ? t("panelActive") : t("invitePending")}
                      </span>
                    )}
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
                {e.isGeneral && (
                  <span
                    className="mt-2 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                  >
                    <Star className="h-3 w-3" />
                    {t("generalWorker")}
                  </span>
                )}
                {e.homeVisit && (
                  <span
                    className="mt-2 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: "#e3f2fd", color: "#04519b" }}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {t("homeVisits")}
                  </span>
                )}

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
                      {t("salaryShort")}: <span className="whitespace-nowrap font-medium tabular-nums" style={{ color: theme.primary }}>{Number(e.salary).toLocaleString(locale)}</span>
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
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value, customRole: e.target.value === "__custom" ? form.customRole : "" })}
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  >
                    <option value="">{t("rolePlaceholder")}</option>
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value="__custom">{t("customRoleOption")}</option>
                  </select>
                  {form.role === "__custom" && (
                    <input
                      value={form.customRole}
                      onChange={(e) => setForm({ ...form, customRole: e.target.value })}
                      placeholder={t("customRolePlaceholder")}
                      className={`${inputClass} mt-2`}
                      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                    />
                  )}
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
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("email")}</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={t("emailPlaceholder")}
                  type="email"
                  dir="ltr"
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                />
              </div>
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: form.isBookable ? theme.primary : theme.outlineVariant, color: theme.onSurfaceVariant }}
              >
                <input
                  type="checkbox"
                  checked={form.isBookable}
                  onChange={(e) => setForm({ ...form, isBookable: e.target.checked })}
                />
                <span>
                  <span className="font-medium">{t("bookable")}</span>
                  <span className="block text-xs" style={{ color: theme.secondary }}>{t("bookableHint")}</span>
                </span>
              </label>
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
                <label
                  className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium"
                  style={{ borderColor: form.isGeneral ? theme.primary : theme.outlineVariant, backgroundColor: form.isGeneral ? theme.surfaceContainerLowest : "transparent", color: theme.onSurfaceVariant }}
                >
                  <input
                    type="checkbox"
                    checked={form.isGeneral}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => ({
                        ...f,
                        isGeneral: checked,
                        serviceIds: checked ? services.map((s) => s.id) : f.serviceIds,
                      }));
                    }}
                    className="h-4 w-4 shrink-0"
                    style={{ accentColor: theme.primary }}
                  />
                  <span>{t("generalWorker")}</span>
                </label>
                <p className="mb-2 mt-1.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                  {t("generalHint")}
                </p>
                <label
                  className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium"
                  style={{ borderColor: form.homeVisit ? theme.primary : theme.outlineVariant, color: theme.onSurfaceVariant }}
                >
                  <input
                    type="checkbox"
                    checked={form.homeVisit}
                    onChange={(e) => setForm((f) => ({ ...f, homeVisit: e.target.checked }))}
                    className="h-4 w-4 shrink-0"
                    style={{ accentColor: theme.primary }}
                  />
                  <span>{t("homeVisits")}</span>
                </label>
                <p className="mb-2 text-xs" style={{ color: theme.secondary }}>{t("homeVisitsHint")}</p>
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
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        {s.homeVisit && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "#e3f2fd", color: "#04519b" }}>
                            {t("homeVisit")}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: form.panelAccess ? theme.primary : theme.outlineVariant }}>
                <label className="flex cursor-pointer items-start gap-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
                  <input
                    type="checkbox"
                    checked={form.panelAccess}
                    onChange={(e) => setForm({ ...form, panelAccess: e.target.checked })}
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ accentColor: theme.primary }}
                  />
                  <span>
                    <span className="font-medium">{t("panelAccess")}</span>
                    <span className="block text-xs" style={{ color: theme.secondary }}>{t("panelAccessHint")}</span>
                  </span>
                </label>

                {form.panelAccess && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("panelRole")}</label>
                      <select
                        value={form.accessRole}
                        onChange={(e) => {
                          const accessRole = e.target.value as AccessRole;
                          setForm((f) => ({ ...f, accessRole, permissions: defaultPermissionsFor(accessRole) }));
                        }}
                        className={inputClass}
                        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                      >
                        <option value="employee">{t("panelRoles.employee")}</option>
                        <option value="cashier">{t("panelRoles.cashier")}</option>
                        <option value="manager">{t("panelRoles.manager")}</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("permissions")}</label>
                      <div className="space-y-2.5">
                        {PERMISSION_GROUPS.map((group) => (
                          <div key={group.key}>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>
                              {t(`permissionGroups.${group.key}`)}
                            </p>
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {group.permissions.map((permission) => (
                                <label key={permission.key} className="flex items-center gap-2 text-xs" style={{ color: theme.onSurfaceVariant }}>
                                  <input
                                    type="checkbox"
                                    checked={form.permissions.includes(permission.key)}
                                    onChange={() => togglePermission(permission.key)}
                                    className="h-3.5 w-3.5"
                                    style={{ accentColor: theme.primary }}
                                  />
                                  <span>{permission.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs" style={{ color: theme.onSurfaceVariant }}>
                      {form.id ? t("inviteHintEdit") : t("inviteHint")}
                    </p>
                  </div>
                )}
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

      {inviteLink && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setInviteLink(null)}>
          <div
            className="w-full rounded-t-2xl border p-5 shadow-xl sm:max-w-md sm:rounded-2xl md:p-6"
            style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("inviteTitle")}</h2>
              <button type="button" onClick={() => setInviteLink(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("inviteBody")}</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-xs"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                    setCopiedInvite(true);
                    setTimeout(() => setCopiedInvite(false), 1800);
                  } catch {
                    setCopiedInvite(false);
                  }
                }}
                className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-semibold"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {copiedInvite ? t("copied") : t("copy")}
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: theme.secondary }}>{t("inviteExpiry")}</p>
            <button
              type="button"
              onClick={() => setInviteLink(null)}
              className="mt-4 w-full rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
            >
              {t("done")}
            </button>
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
                          </p>
                          {a.services.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {a.services.map((s, i) => (
                                <li key={i} className="flex items-center gap-1.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                                  <span className="shrink-0 rounded bg-black/[0.04] px-1.5 py-0.5 font-medium" style={{ backgroundColor: theme.surfaceContainerHigh }}>
                                    {s.startTime}–{s.endTime}
                                  </span>
                                  <span className="truncate">{s.name}</span>
                                </li>
                              ))}
                            </ul>
                          )}
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
                    <span className="whitespace-nowrap tabular-nums">{detail.salary ? Number(detail.salary).toLocaleString(locale) : "—"}</span>
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
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start"
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