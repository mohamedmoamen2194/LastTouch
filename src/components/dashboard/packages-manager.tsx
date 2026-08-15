"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ManagedPackage = {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  price: string;
  active: boolean;
  serviceIds: string[];
};

export type ManagedServiceRef = {
  id: string;
  name: string;
};

type Props = {
  slug: string;
  locale: string;
  theme: ThemeTokens;
  packages: ManagedPackage[];
  services: ManagedServiceRef[];
};

type FormState = {
  id?: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: string;
  active: boolean;
  serviceIds: string[];
};

const EMPTY_FORM: FormState = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  price: "",
  active: true,
  serviceIds: [],
};

export function PackagesManager({ slug, locale, theme, packages: initial, services }: Props) {
  const t = useTranslations("packages");
  const dt = useTranslations("dashboard");

  const [packages, setPackages] = useState<ManagedPackage[]>(initial);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (v: string) => Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setModal("create");
  };

  const openEdit = (p: ManagedPackage) => {
    setForm({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr ?? "",
      description: p.description ?? "",
      descriptionAr: p.descriptionAr ?? "",
      price: Number(p.price).toString(),
      active: p.active,
      serviceIds: p.serviceIds,
    });
    setEditingId(p.id);
    setError(null);
    setModal("edit");
  };

  const call = async (action: "create" | "update" | "delete", payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/packages?slug=${encodeURIComponent(slug)}&action=${action}`, {
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
        nameAr: form.nameAr,
        description: form.description,
        descriptionAr: form.descriptionAr,
        price: form.price,
        active: form.active,
        serviceIds: form.serviceIds,
      });
      const full: ManagedPackage = {
        id: result.id,
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        description: form.description.trim() || null,
        descriptionAr: form.descriptionAr.trim() || null,
        price: form.price === "" ? "0" : form.price,
        active: result.active,
        serviceIds: form.serviceIds,
      };
      if (isEdit) {
        setPackages((prev) => prev.map((p) => (p.id === result.id ? { ...p, ...full } : p)));
      } else {
        setPackages((prev) => [...prev, full]);
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
      setPackages((prev) => prev.filter((p) => p.id !== id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleService = (id: string) =>
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id)
        ? f.serviceIds.filter((s) => s !== id)
        : [...f.serviceIds, id],
    }));

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#091426]";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold md:text-xl" style={{ color: theme.primary }}>{t("title")}</h2>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("subtitle")}</p>
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

      {packages.length === 0 ? (
        <div
          className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center md:min-h-[220px] md:p-10"
          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
            style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.primary }}
          >
            +
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: theme.primary }}>{t("emptyTitle")}</p>
            <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("emptyBody")}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {packages.map((p) => (
            <div
              key={p.id}
              className="flex h-full flex-col rounded-xl border p-4 md:p-5"
              style={{
                borderColor: theme.outlineVariant,
                backgroundColor: theme.surfaceContainerLowest,
                opacity: p.active ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-semibold md:text-lg" style={{ color: theme.primary }}>{p.name}</h3>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}>
                  {p.active ? t("active") : t("inactive")}
                </span>
              </div>
              {p.description && (
                <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>{p.description}</p>
              )}
              {p.serviceIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.serviceIds.map((sid) => (
                    <span
                      key={sid}
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
                    >
                      {serviceName(sid)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm md:mt-auto" style={{ borderColor: theme.outlineVariant }}>
                <span className="text-xs" style={{ color: theme.secondary }}>
                  {p.serviceIds.length} {t("servicesCount")}
                </span>
                <span className="font-semibold" style={{ color: theme.primary }}>{money(p.price)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: theme.outlineVariant, color: theme.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(p.id)}
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
                {modal === "create" ? t("addTitle") : t("editTitle")}
              </h2>
              <button type="button" onClick={() => !busy && setModal(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("nameAr")}</label>
                  <input
                    value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                    placeholder={t("nameArPlaceholder")}
                    dir="rtl"
                    className={inputClass}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("descriptionAr")}</label>
                  <textarea
                    value={form.descriptionAr}
                    onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                    placeholder={t("descriptionArPlaceholder")}
                    rows={3}
                    dir="rtl"
                    className={`${inputClass} resize-none`}
                    style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant }}
                  />
                </div>
              </div>
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
                <label className="mb-2 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("services")}</label>
                {services.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                    {t("noServicesHint")}
                  </p>
                ) : (
                  <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2" style={{ borderColor: theme.outlineVariant }}>
                    {services.map((s) => {
                      const checked = form.serviceIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm"
                          style={{ backgroundColor: checked ? theme.surfaceContainerHigh : "transparent", color: theme.onSurfaceVariant }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleService(s.id)}
                            className="h-4 w-4 shrink-0"
                            style={{ accentColor: theme.primary }}
                          />
                          <span className="truncate">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
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
                  disabled={busy || !form.name.trim() || form.serviceIds.length === 0}
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