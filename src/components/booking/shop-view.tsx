"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Minus, Package, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ShopProduct = {
  id: string;
  name: string;
  nameAr: string | null;
  category: string | null;
  description: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  sellPrice: string;
  quantity: number;
};

type Props = {
  slug: string;
  locale: string;
  currency: string;
  theme: ThemeTokens;
  products: ShopProduct[];
  initialCustomer: { name: string; phone: string } | null;
};

function money(value: string | number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

export function ShopView({ slug, locale, currency, theme, products, initialCustomer }: Props) {
  const t = useTranslations("shop");
  const pick = (en: string, ar: string | null) => (locale === "ar" && ar ? ar : en);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState(initialCustomer?.name ?? "");
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ reference: string; total: string } | null>(null);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const product = products.find((p) => p.id === id);
          return product ? { product, quantity } : null;
        })
        .filter((line): line is { product: ShopProduct; quantity: number } => Boolean(line)),
    [cart, products]
  );

  const total = lines.reduce((sum, line) => sum + Number(line.product.sellPrice) * line.quantity, 0);

  const add = (product: ShopProduct, delta: number) => {
    setCart((current) => {
      const next = Math.min((current[product.id] ?? 0) + delta, product.quantity);
      const copy = { ...current };
      if (next <= 0) delete copy[product.id];
      else copy[product.id] = next;
      return copy;
    });
  };

  const submit = async () => {
    if (lines.length === 0) return;
    if (!name.trim() || !phone.trim()) {
      setError(t("contactRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/order?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          customerName: name,
          customerPhone: phone,
          notes,
          paymentMethod: "cash",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? t("orderFailed"));
      setPlaced({ reference: json.data.reference, total: json.data.total });
      setCart({});
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orderFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <section className="mx-auto max-w-lg px-2 py-10 text-center">
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
        >
          <Check className="h-8 w-8" />
        </span>
        <h2 className="mt-5 text-xl font-bold" style={{ color: theme.primary }}>
          {t("orderPlaced")}
        </h2>
        <p className="mt-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {t("orderPlacedBody")}
        </p>
        <div className="mt-4 rounded-2xl p-4 text-sm" style={{ backgroundColor: theme.surface, border: `1px solid ${theme.outlineVariant}` }}>
          <p style={{ color: theme.secondary }}>{t("reference")}</p>
          <p className="font-mono text-lg font-semibold" style={{ color: theme.tertiary }}>
            {placed.reference}
          </p>
          <p className="mt-2" style={{ color: theme.secondary }}>
            {t("total")}: <span style={{ color: theme.tertiary }}>{money(placed.total, locale, currency)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPlaced(null)}
          className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {t("continueShopping")}
        </button>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <div className="mb-4">
          <h2 className="text-xl font-bold" style={{ color: theme.primary }}>
            {t("title")}
          </h2>
          <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
            {t("subtitle")}
          </p>
        </div>
        {products.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: theme.secondary }}>
            {t("empty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <article
                key={product.id}
                className="flex flex-col overflow-hidden rounded-2xl min-w-0"
                style={{ backgroundColor: theme.surface, border: `1px solid ${theme.outlineVariant}` }}
              >
                <div className="flex h-36 items-center justify-center" style={{ backgroundColor: theme.background }}>
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={pick(product.name, product.nameAr)} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-10 w-10" style={{ color: theme.secondary }} />
                  )}
                </div>
                  <div className="flex flex-1 flex-col gap-2 p-4 min-w-0">
                  <div>
                    <h3 className="text-sm font-semibold truncate" style={{ color: theme.tertiary }}>
                      {pick(product.name, product.nameAr)}
                    </h3>
                    {product.category && (
                      <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
                        {product.category}
                      </p>
                    )}
                  </div>
                  {(product.description || product.descriptionAr) && (
                    <p className="line-clamp-2 text-xs" style={{ color: theme.onSurfaceVariant }}>
                      {pick(product.description ?? "", product.descriptionAr)}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold" style={{ color: theme.primary }}>
                      {money(product.sellPrice, locale, currency)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {cart[product.id] ? (
                        <>
                          <button
                            type="button"
                            onClick={() => add(product, -1)}
                            className="rounded-lg p-1.5"
                            style={{ border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-5 text-center text-xs" style={{ color: theme.tertiary }}>
                            {cart[product.id]}
                          </span>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={product.quantity <= 0}
                        onClick={() => add(product, 1)}
                        className="rounded-lg p-1.5 disabled:opacity-40"
                        style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: product.quantity <= 0 ? "#dc2626" : theme.secondary }}>
                    {product.quantity > 0 ? t("inStock", { count: product.quantity }) : t("outOfStock")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <aside
        className="h-fit min-w-0 rounded-2xl p-4 lg:sticky lg:top-24"
        style={{ backgroundColor: theme.surface, border: `1px solid ${theme.outlineVariant}` }}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.tertiary }}>
          <ShoppingBag className="h-4 w-4" /> {t("cart")}
        </h2>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: theme.secondary }}>
            {t("emptyCart")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {lines.map(({ product, quantity }) => (
              <li key={product.id} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate" style={{ color: theme.tertiary }}>
                  {quantity}× {pick(product.name, product.nameAr)}
                </span>
                <span className="shrink-0" style={{ color: theme.secondary }}>{money(Number(product.sellPrice) * quantity, locale, currency)}</span>
                <button type="button" className="shrink-0" onClick={() => add(product, -quantity)} style={{ color: "#dc2626" }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-semibold" style={{ borderColor: theme.outlineVariant, color: theme.tertiary }}>
          <span>{t("total")}</span>
          <span>{money(total, locale, currency)}</span>
        </div>

        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("yourName")}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: theme.background, border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("yourPhone")}
            inputMode="tel"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: theme.background, border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
          />
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: theme.background, border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
          />
        </div>

        {error && (
          <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={submit}
          className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {busy ? t("placing") : t("placeOrder")}
        </button>
        <p className="mt-2 text-center text-[11px]" style={{ color: theme.secondary }}>
          {t("payOnPickup")}
        </p>
      </aside>
    </div>
  );
}
