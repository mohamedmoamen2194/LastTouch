"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ManagedMachine = {
  id: string;
  name: string;
  nameAr: string | null;
  serialNumber: string | null;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  expiryDate: string | null;
  maintenanceIntervalDays: number;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  status: "operational" | "maintenance" | "retired";
  notes: string | null;
  active: boolean;
};

export type MaintenanceRow = {
  id: string;
  machineId: string;
  type: string;
  scheduledFor: string;
  completedAt: string | null;
  notes: string | null;
  cost: string;
};

type Props = {
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  theme: ThemeTokens;
  machines: ManagedMachine[];
};

type MachineForm = {
  id?: string;
  name: string;
  nameAr: string;
  serialNumber: string;
  category: string;
  description: string;
  imageUrl: string;
  purchaseDate: string;
  warrantyExpiry: string;
  expiryDate: string;
  maintenanceIntervalDays: string;
  lastMaintenanceAt: string;
  nextMaintenanceAt: string;
  status: ManagedMachine["status"];
  notes: string;
  active: boolean;
};

const EMPTY_FORM: MachineForm = {
  name: "",
  nameAr: "",
  serialNumber: "",
  category: "",
  description: "",
  imageUrl: "",
  purchaseDate: "",
  warrantyExpiry: "",
  expiryDate: "",
  maintenanceIntervalDays: "0",
  lastMaintenanceAt: "",
  nextMaintenanceAt: "",
  status: "operational",
  notes: "",
  active: true,
};

function day(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function MachinesManager({ slug, locale, timezone, currency, theme, machines: initial }: Props) {
  const t = useTranslations("machines");
  const [machines, setMachines] = useState(initial);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MachineForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [maintenanceFor, setMaintenanceFor] = useState<ManagedMachine | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [mDate, setMDate] = useState("");
  const [mNotes, setMNotes] = useState("");
  const [mCost, setMCost] = useState("0");
  const fileRef = useRef<HTMLInputElement>(null);

  const now = Date.now();
  const soon = now + 30 * 24 * 60 * 60 * 1000;
  const due = machines.filter((m) => m.nextMaintenanceAt && new Date(m.nextMaintenanceAt).getTime() <= soon);
  const expiring = machines.filter(
    (m) =>
      (m.expiryDate && new Date(m.expiryDate).getTime() <= soon) ||
      (m.warrantyExpiry && new Date(m.warrantyExpiry).getTime() <= soon)
  );
  const attention = machines.filter((m) => m.status === "maintenance");

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return machines;
    return machines.filter((m) =>
      [m.name, m.nameAr, m.serialNumber, m.category].some((v) => v?.toLowerCase().includes(term))
    );
  }, [machines, query]);

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: timezone }).format(
          new Date(iso)
        )
      : "—";

  const call = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/machines?slug=${encodeURIComponent(slug)}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Request failed");
    return json.data;
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (m: ManagedMachine) => {
    setForm({
      id: m.id,
      name: m.name,
      nameAr: m.nameAr ?? "",
      serialNumber: m.serialNumber ?? "",
      category: m.category ?? "",
      description: m.description ?? "",
      imageUrl: m.imageUrl ?? "",
      purchaseDate: day(m.purchaseDate),
      warrantyExpiry: day(m.warrantyExpiry),
      expiryDate: day(m.expiryDate),
      maintenanceIntervalDays: String(m.maintenanceIntervalDays),
      lastMaintenanceAt: day(m.lastMaintenanceAt),
      nextMaintenanceAt: day(m.nextMaintenanceAt),
      status: m.status,
      notes: m.notes ?? "",
      active: m.active,
    });
    setError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await call(form.id ? "update" : "create", {
        id: form.id,
        name: form.name,
        nameAr: form.nameAr,
        serialNumber: form.serialNumber,
        category: form.category,
        description: form.description,
        imageUrl: form.imageUrl || null,
        purchaseDate: form.purchaseDate || null,
        warrantyExpiry: form.warrantyExpiry || null,
        expiryDate: form.expiryDate || null,
        maintenanceIntervalDays: form.maintenanceIntervalDays,
        lastMaintenanceAt: form.lastMaintenanceAt || null,
        nextMaintenanceAt: form.nextMaintenanceAt || null,
        status: form.status,
        notes: form.notes,
        active: form.active,
      });
      const machine = data.machine as ManagedMachine;
      setMachines((prev) => (form.id ? prev.map((m) => (m.id === machine.id ? machine : m)) : [...prev, machine]));
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save machine");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await call("delete", { id });
      setMachines((prev) => prev.filter((m) => m.id !== id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete machine");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/inventory/upload?slug=${encodeURIComponent(slug)}&folder=machines`, {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Upload failed");
      setForm((f) => ({ ...f, imageUrl: json.data.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  };

  const openMaintenance = async (m: ManagedMachine) => {
    setMaintenanceFor(m);
    setLoadingMaintenance(true);
    setMDate(day(m.nextMaintenanceAt) || day(new Date().toISOString()));
    setMNotes("");
    setMCost("0");
    try {
      const data = await call("maintenance-list", { machineId: m.id });
      setMaintenance(data.maintenance as MaintenanceRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load maintenance");
    } finally {
      setLoadingMaintenance(false);
    }
  };

  const schedule = async () => {
    if (!maintenanceFor) return;
    setBusy(true);
    setError(null);
    try {
      const data = await call("maintenance-schedule", {
        machineId: maintenanceFor.id,
        scheduledFor: mDate,
        notes: mNotes,
        cost: mCost,
      });
      setMaintenance((prev) => [...prev, data.maintenance as MaintenanceRow]);
      setMNotes("");
      setMCost("0");
      setMachines((prev) =>
        prev.map((m) =>
          m.id === maintenanceFor.id && (!m.nextMaintenanceAt || new Date(mDate) < new Date(m.nextMaintenanceAt))
            ? { ...m, nextMaintenanceAt: new Date(mDate).toISOString() }
            : m
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule maintenance");
    } finally {
      setBusy(false);
    }
  };

  const complete = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await call("maintenance-complete", { id });
      setMaintenance((prev) =>
        prev.map((row) => (row.id === id ? { ...row, type: "completed", completedAt: new Date().toISOString() } : row))
      );
      if (maintenanceFor) {
        const data = await call("get", { id: maintenanceFor.id });
        const machine = data.machine as ManagedMachine;
        setMaintenanceFor(machine);
        setMachines((prev) => prev.map((m) => (m.id === machine.id ? machine : m)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete maintenance");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none";
  const inputStyle = { borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant };
  const statusStyle: Record<ManagedMachine["status"], { bg: string; fg: string }> = {
    operational: { bg: "#e1f3e2", fg: "#1d6e2f" },
    maintenance: { bg: "#fff4e5", fg: "#7a4100" },
    retired: { bg: "#eef1f5", fg: "#45474c" },
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("title")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("subtitle")}</p>
        </div>
        <button type="button" onClick={openCreate} className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t("stats.due"), value: due.length, icon: CalendarClock, color: "#7a4100" },
          { label: t("stats.expiring"), value: expiring.length, icon: AlertTriangle, color: "#ba1a1a" },
          { label: t("stats.attention"), value: attention.length, icon: Wrench, color: theme.primary },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border px-3 py-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
              <Icon className="h-4 w-4" style={{ color: stat.color }} />
              <p className="mt-1.5 text-lg font-bold leading-none" style={{ color: theme.primary }}>{stat.value}</p>
              <p className="mt-1 text-[11px]" style={{ color: theme.onSurfaceVariant }}>{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.onSurfaceVariant }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} className={`${inputClass} ps-9`} style={inputStyle} />
      </div>

      {error && !formOpen && !maintenanceFor && (
        <p className="rounded-xl px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => {
            const overdue = m.nextMaintenanceAt && new Date(m.nextMaintenanceAt).getTime() < now;
            return (
              <article key={m.id} className="flex flex-col overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, opacity: m.active ? 1 : 0.6 }}>
                <div className="flex gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ backgroundColor: theme.surfaceContainerHigh }}>
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={{ color: theme.secondary }}>
                        <Wrench className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate text-sm font-semibold" style={{ color: theme.primary }}>{m.name}</h3>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: statusStyle[m.status].bg, color: statusStyle[m.status].fg }}>
                        {t(`status.${m.status}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs" style={{ color: theme.secondary }}>
                      {[m.category, m.serialNumber].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: overdue ? "#ba1a1a" : theme.onSurfaceVariant }}>
                      <CalendarClock className="h-3 w-3" />
                      {t("nextMaintenance")}: {formatDate(m.nextMaintenanceAt)}
                    </p>
                    {(m.warrantyExpiry || m.expiryDate) && (
                      <p className="mt-0.5 text-[11px]" style={{ color: theme.onSurfaceVariant }}>
                        {[m.warrantyExpiry ? `${t("warranty")}: ${formatDate(m.warrantyExpiry)}` : null, m.expiryDate ? `${t("expiry")}: ${formatDate(m.expiryDate)}` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: theme.outlineVariant }}>
                  <button type="button" onClick={() => void openMaintenance(m)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold" style={{ borderColor: theme.outlineVariant, color: theme.primary }}>
                    <Settings2 className="h-3.5 w-3.5" />
                    {t("maintenance")}
                  </button>
                  <button type="button" onClick={() => openEdit(m)} className="rounded-lg border p-1.5" style={{ borderColor: theme.outlineVariant, color: theme.primary }} aria-label={t("edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setPendingDelete(m.id)} className="rounded-lg border p-1.5" style={{ borderColor: theme.outlineVariant, color: "#ba1a1a" }} aria-label={t("delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !busy && setFormOpen(false)}>
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6" style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{form.id ? t("editTitle") : t("addTitle")}</h2>
              <button type="button" onClick={() => !busy && setFormOpen(false)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}><X className="h-5 w-5" /></button>
            </div>
            {error && <p className="mb-3 rounded-lg px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</p>}

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerHigh }}>
                  {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center" style={{ color: theme.secondary }}><ImagePlus className="h-6 w-6" /></div>}
                </div>
                <div className="space-y-1.5">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: theme.outlineVariant, color: theme.primary }}>{uploading ? t("uploading") : t("uploadImage")}</button>
                  {form.imageUrl && <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })} className="block text-xs font-medium" style={{ color: "#ba1a1a" }}>{t("removeImage")}</button>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("name")}</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("nameAr")}</label>
                  <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("serial")}</label>
                  <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} dir="ltr" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("category")}</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("purchaseDate")}</label>
                  <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("warranty")}</label>
                  <input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("expiry")}</label>
                  <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("interval")}</label>
                  <input type="number" min="0" value={form.maintenanceIntervalDays} onChange={(e) => setForm({ ...form, maintenanceIntervalDays: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("lastMaintenance")}</label>
                  <input type="date" value={form.lastMaintenanceAt} onChange={(e) => setForm({ ...form, lastMaintenanceAt: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("nextMaintenance")}</label>
                  <input type="date" value={form.nextMaintenanceAt} onChange={(e) => setForm({ ...form, nextMaintenanceAt: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("statusLabel")}</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ManagedMachine["status"] })} className={inputClass} style={inputStyle}>
                    <option value="operational">{t("status.operational")}</option>
                    <option value="maintenance">{t("status.maintenance")}</option>
                    <option value="retired">{t("status.retired")}</option>
                  </select>
                </div>
                <label className="mt-5 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ accentColor: theme.primary }} />
                  {t("active")}
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("notes")}</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} disabled={busy} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={{ color: theme.onSurfaceVariant }}>{t("cancel")}</button>
                <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>{busy ? "…" : t("save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {maintenanceFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !busy && setMaintenanceFor(null)}>
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6" style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("maintenance")}</h2>
                <p className="text-xs" style={{ color: theme.secondary }}>{maintenanceFor.name}</p>
              </div>
              <button type="button" onClick={() => !busy && setMaintenanceFor(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}><X className="h-5 w-5" /></button>
            </div>
            {error && <p className="mb-3 rounded-lg px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</p>}

            <div className="rounded-xl border p-3" style={{ borderColor: theme.outlineVariant }}>
              <p className="mb-2 text-xs font-semibold" style={{ color: theme.onSurfaceVariant }}>{t("scheduleTitle")}</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputClass} style={inputStyle} />
                <input type="number" min="0" step="0.01" value={mCost} onChange={(e) => setMCost(e.target.value)} placeholder={t("cost")} className={inputClass} style={inputStyle} />
              </div>
              <input value={mNotes} onChange={(e) => setMNotes(e.target.value)} placeholder={t("notes")} className={`${inputClass} mt-2`} style={inputStyle} />
              <button type="button" onClick={() => void schedule()} disabled={busy || !mDate} className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>{t("schedule")}</button>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold" style={{ color: theme.onSurfaceVariant }}>{t("history")}</p>
              {loadingMaintenance ? (
                <p className="text-sm" style={{ color: theme.onSurfaceVariant }}>…</p>
              ) : maintenance.length === 0 ? (
                <p className="text-sm" style={{ color: theme.onSurfaceVariant }}>{t("noHistory")}</p>
              ) : (
                <ul className="space-y-2">
                  {maintenance.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.outlineVariant }}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold" style={{ color: theme.onSurfaceVariant }}>{formatDate(row.scheduledFor)}</p>
                        {row.notes && <p className="truncate text-[11px]" style={{ color: theme.secondary }}>{row.notes}</p>}
                        {Number(row.cost) > 0 && (
                          <p className="text-[11px]" style={{ color: theme.secondary }}>
                            {new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(row.cost))}
                          </p>
                        )}
                      </div>
                      {row.completedAt ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("completed")}
                        </span>
                      ) : (
                        <button type="button" onClick={() => void complete(row.id)} disabled={busy} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>
                          {t("markComplete")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("confirmDelete")}</h2>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ color: theme.onSurfaceVariant }}>{t("cancel")}</button>
              <button type="button" onClick={() => void remove(pendingDelete)} disabled={busy} className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#ba1a1a" }}>{busy ? "…" : t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
