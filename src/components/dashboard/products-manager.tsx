"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, ImagePlus, Package, Pencil, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ManagedProduct = {
  id: string;
  name: string;
  nameAr: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  costPrice: string;
  sellPrice: string;
  quantity: number;
  lowStockThreshold: number;
  expiryDate: string | null;
  listedOnline: boolean;
  active: boolean;
};

type Props = {
  slug: string;
  locale: string;
  currency: string;
  theme: ThemeTokens;
  products: ManagedProduct[];
};

type FormState = {
  id?: string;
  name: string;
  nameAr: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  descriptionAr: string;
  imageUrl: string;
  costPrice: string;
  sellPrice: string;
  quantity: string;
  lowStockThreshold: string;
  expiryDate: string;
  listedOnline: boolean;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  nameAr: "",
  sku: "",
  barcode: "",
  category: "",
  description: "",
  descriptionAr: "",
  imageUrl: "",
  costPrice: "0",
  sellPrice: "0",
  quantity: "0",
  lowStockThreshold: "5",
  expiryDate: "",
  listedOnline: false,
  active: true,
};

function money(value: string, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

export function ProductsManager({ slug, locale, currency, theme, products: initial }: Props) {
  const t = useTranslations("inventory");
  const [products, setProducts] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring" | "online">("all");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const now = Date.now();
  const soon = now + 30 * 24 * 60 * 60 * 1000;
  const lowStock = products.filter((p) => p.quantity <= p.lowStockThreshold);
  const expiring = products.filter((p) => p.expiryDate && new Date(p.expiryDate).getTime() <= soon);
  const online = products.filter((p) => p.listedOnline);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "low" && p.quantity > p.lowStockThreshold) return false;
      if (filter === "expiring" && (!p.expiryDate || new Date(p.expiryDate).getTime() > soon)) return false;
      if (filter === "online" && !p.listedOnline) return false;
      if (!term) return true;
      return [p.name, p.nameAr, p.sku, p.barcode, p.category].some((v) => v?.toLowerCase().includes(term));
    });
  }, [products, query, filter, soon]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setModal("create");
  };

  const openEdit = (p: ManagedProduct) => {
    setForm({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr ?? "",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      category: p.category ?? "",
      description: p.description ?? "",
      descriptionAr: p.descriptionAr ?? "",
      imageUrl: p.imageUrl ?? "",
      costPrice: p.costPrice,
      sellPrice: p.sellPrice,
      quantity: String(p.quantity),
      lowStockThreshold: String(p.lowStockThreshold),
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
      listedOnline: p.listedOnline,
      active: p.active,
    });
    setError(null);
    setModal("edit");
  };

  const call = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/products?slug=${encodeURIComponent(slug)}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Request failed");
    return json.data;
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        id: form.id,
        name: form.name,
        nameAr: form.nameAr,
        sku: form.sku,
        barcode: form.barcode,
        category: form.category,
        description: form.description,
        descriptionAr: form.descriptionAr,
        imageUrl: form.imageUrl || null,
        costPrice: form.costPrice,
        sellPrice: form.sellPrice,
        quantity: form.quantity,
        lowStockThreshold: form.lowStockThreshold,
        expiryDate: form.expiryDate || null,
        listedOnline: form.listedOnline,
        active: form.active,
      };
      const data = await call(form.id ? "update" : "create", payload);
      const product = data.product as ManagedProduct;
      setProducts((prev) =>
        form.id ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product]
      );
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await call("delete", { id });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete product");
    } finally {
      setBusy(false);
    }
  };

  const toggleOnline = async (p: ManagedProduct) => {
    try {
      const data = await call("update", { id: p.id, listedOnline: !p.listedOnline });
      const product = data.product as ManagedProduct;
      setProducts((prev) => prev.map((item) => (item.id === product.id ? product : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update product");
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(
        `/api/admin/inventory/upload?slug=${encodeURIComponent(slug)}&folder=products`,
        { method: "POST", body }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Upload failed");
      setForm((f) => ({ ...f, imageUrl: json.data.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  };

  const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none";
  const inputStyle = { borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, color: theme.onSurfaceVariant };
  const chip = (active: boolean) => ({
    borderColor: active ? theme.primary : theme.outlineVariant,
    backgroundColor: active ? theme.primary : "transparent",
    color: active ? theme.onPrimary : theme.onSurfaceVariant,
  });

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>{t("title")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: "all", label: t("stats.total"), value: products.length, icon: Package },
          { key: "low", label: t("stats.low"), value: lowStock.length, icon: AlertTriangle },
          { key: "expiring", label: t("stats.expiring"), value: expiring.length, icon: CalendarClock },
          { key: "online", label: t("stats.online"), value: online.length, icon: ShoppingBag },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => setFilter(stat.key as typeof filter)}
              className="rounded-xl border px-3 py-3 text-start"
              style={chip(filter === stat.key)}
            >
              <Icon className="h-4 w-4 opacity-80" />
              <p className="mt-1.5 text-lg font-bold leading-none">{stat.value}</p>
              <p className="mt-1 text-[11px] opacity-80">{stat.label}</p>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.onSurfaceVariant }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${inputClass} ps-9`}
          style={inputStyle}
        />
      </div>

      {error && !modal && (
        <p className="rounded-xl px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const out = p.quantity <= 0;
            const low = !out && p.quantity <= p.lowStockThreshold;
            const expiringSoon = p.expiryDate && new Date(p.expiryDate).getTime() <= soon;
            return (
              <article
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border"
                style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest, opacity: p.active ? 1 : 0.6 }}
              >
                <div className="flex gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ backgroundColor: theme.surfaceContainerHigh }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={{ color: theme.secondary }}>
                        <Package className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate text-sm font-semibold" style={{ color: theme.primary }}>{p.name}</h3>
                      <span className="shrink-0 text-sm font-bold" style={{ color: theme.primary }}>{money(p.sellPrice, locale, currency)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs" style={{ color: theme.secondary }}>
                      {[p.category, p.sku].filter(Boolean).join(" · ") || t("noSku")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                        backgroundColor: out ? "#ffdad6" : low ? "#fff4e5" : theme.surfaceContainerHigh,
                        color: out ? "#93000a" : low ? "#7a4100" : theme.secondary,
                      }}>
                        {out ? t("outOfStock") : t("inStock", { count: p.quantity })}
                      </span>
                      {expiringSoon && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fff4e5] px-2 py-0.5 text-[10px] font-semibold text-[#7a4100]">
                          <CalendarClock className="h-2.5 w-2.5" />
                          {t("expiringBadge")}
                        </span>
                      )}
                      {p.listedOnline && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "#e3f2fd", color: "#04519b" }}>
                          {t("onlineBadge")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: theme.outlineVariant }}>
                  <button
                    type="button"
                    onClick={() => void toggleOnline(p)}
                    className="flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold"
                    style={{ borderColor: theme.outlineVariant, color: p.listedOnline ? "#04519b" : theme.onSurfaceVariant }}
                  >
                    {p.listedOnline ? t("unlist") : t("listOnline")}
                  </button>
                  <button type="button" onClick={() => openEdit(p)} className="rounded-lg border p-1.5" style={{ borderColor: theme.outlineVariant, color: theme.primary }} aria-label={t("edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setPendingDelete(p.id)} className="rounded-lg border p-1.5" style={{ borderColor: theme.outlineVariant, color: "#ba1a1a" }} aria-label={t("delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
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
              <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{modal === "create" ? t("addTitle") : t("editTitle")}</h2>
              <button type="button" onClick={() => !busy && setModal(null)} className="rounded-md p-1" style={{ color: theme.onSurfaceVariant }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && <p className="mb-3 rounded-lg px-4 py-2.5 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</p>}

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerHigh }}>
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ color: theme.secondary }}>
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = "";
                    }}
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: theme.outlineVariant, color: theme.primary }}>
                    {uploading ? t("uploading") : t("uploadImage")}
                  </button>
                  {form.imageUrl && (
                    <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })} className="block text-xs font-medium" style={{ color: "#ba1a1a" }}>
                      {t("removeImage")}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("name")}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("nameAr")}</label>
                  <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("category")}</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("sku")}</label>
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} dir="ltr" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("barcode")}</label>
                  <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} dir="ltr" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("costPrice")}</label>
                  <input value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("sellPrice")}</label>
                  <input value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("quantity")}</label>
                  <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} type="number" min="0" step="1" inputMode="numeric" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("lowStockThreshold")}</label>
                  <input value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} type="number" min="0" step="1" inputMode="numeric" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("expiryDate")}</label>
                <input value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} type="date" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>{t("description")}</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputClass} style={inputStyle} />
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: form.listedOnline ? theme.primary : theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  <input type="checkbox" checked={form.listedOnline} onChange={(e) => setForm({ ...form, listedOnline: e.target.checked })} style={{ accentColor: theme.primary }} />
                  {t("listOnline")}
                </label>
                <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ accentColor: theme.primary }} />
                  {t("active")}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} disabled={busy} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={{ color: theme.onSurfaceVariant }}>{t("cancel")}</button>
                <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: theme.primary, color: theme.onPrimary }}>
                  {busy ? "…" : t("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ backgroundColor: theme.surfaceContainerLowest, borderColor: theme.outlineVariant }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("confirmDelete")}</h2>
            <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>{t("confirmDeleteBody")}</p>
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
