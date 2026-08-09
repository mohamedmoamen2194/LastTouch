"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ManagedService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  active: boolean;
};

type Props = {
  slug: string;
  locale: string;
  theme: ThemeTokens;
  services: ManagedService[];
  businessName: string;
};

type FormState = {
  id?: string;
  name: string;
  price: string;
  durationMinutes: string;
  description: string;
  active: boolean;
};

const EMPTY_FORM: FormState = { name: "", price: "", durationMinutes: "30", description: "", active: true };

export function ServicesManager({ slug, locale, theme, services: initial, businessName }: Props) {
  const t = useTranslations("services");
  const dt = useTranslations("dashboard");

  const [services, setServices] = useState<ManagedService[]>(initial);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (v: string) => Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setModal("create");
  };

  const openEdit = (s: ManagedService) => {
    setForm({
      id: s.id,
      name: s.name,
      price: Number(s.price).toString(),
      durationMinutes: String(s.durationMinutes),
      description: s.description ?? "",
      active: s.active,
    });
    setEditingId(s.id);
    setError(null);
    setModal("edit");
  };

  const call = async (action: "create" | "update" | "delete", payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/services?slug=${encodeURIComponent(slug)}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Request failed");
    return json.data as { id: string; active: boolean };
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const isEdit = modal === "edit";
      const result = await call(isEdit ? "update" : "create", {
        id: isEdit ? editingId : undefined,
        name: form.name,
        price: form.price,
        durationMinutes: Number(form.durationMinutes),
        description: form.description,
        active: form.active,
      });
      const full: ManagedService = {
        id: result.id,
        name: form.name.trim(),
        price: form.price === "" ? "0" : form.price,
        durationMinutes: Number(form.durationMinutes),
        description: form.description.trim() || null,
        active: result.active,
      };
      if (isEdit) {
        setServices((prev) => prev.map((s) => (s.id === result.id ? { ...s, ...full } : s)));
      } else {
        setServices((prev) => [...prev, full]);
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
      setServices((prev) => prev.filter((s) => s.id !== id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#091426]";

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{dt("topServices")}</h1>
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

      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm md:p-10" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {dt("noData")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex h-full flex-col rounded-xl border p-4 md:p-5"
              style={{
                borderColor: theme.outlineVariant,
                backgroundColor: theme.surfaceContainerLowest,
                opacity: s.active ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-semibold md:text-lg" style={{ color: theme.primary }}>{s.name}</h3>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>
                  {s.active ? t("active") : t("inactive")}
                </span>
              </div>
              {s.description && (
                <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>{s.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm md:mt-auto" style={{ borderColor: theme.outlineVariant }}>
                <span style={{ color: theme.secondary }}>{s.durationMinutes} min</span>
                <span className="font-semibold" style={{ color: theme.primary }}>{money(s.price)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: theme.outlineVariant, color: theme.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(s.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: theme.outlineVariant, color: "#ba1a1a" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !busy && setModal(null)}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-md sm:rounded-2xl md:p-6"
            style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>
                {modal === "create" ? t("add") : t("editTitle")}
              </h2>
              <button type="button" onClick={() => !busy && setModal(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("name")}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("namePlaceholder")}
                  className={inputClass}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("price")}</label>
                  <input
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("durationMinutes")}</label>
                  <input
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                    type="number"
                    inputMode="numeric"
                    min="5"
                    step="5"
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("description")}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t("descriptionPlaceholder")}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                />
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
                  disabled={busy || !form.name.trim()}
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