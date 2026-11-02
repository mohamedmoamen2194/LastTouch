"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Minus, Package, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type SaleProduct = {
  id: string;
  name: string;
  nameAr: string | null;
  imageUrl: string | null;
  sellPrice: string;
  quantity: number;
  active: boolean;
};

export type SaleCustomer = { id: string; name: string; phone: string | null };

export type SaleRecord = {
  id: string;
  reference: string;
  channel: string;
  status: string;
  paymentMethod: string;
  subtotal: string;
  discount: string;
  total: string;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

type Props = {
  slug: string;
  locale: string;
  currency: string;
  theme: ThemeTokens;
  products: SaleProduct[];
  customers: SaleCustomer[];
  sales: SaleRecord[];
};

const PAYMENT_METHODS = ["cash", "card", "wallet"] as const;

function money(value: string | number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SalesManager({ slug, locale, currency, theme, products: initialProducts, customers, sales: initialSales }: Props) {
  const t = useTranslations("sales");
  const [products, setProducts] = useState(initialProducts);
  const [sales, setSales] = useState(initialSales);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.active) return false;
      if (!term) return true;
      return [p.name, p.nameAr].some((v) => v?.toLowerCase().includes(term));
    });
  }, [products, query]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const product = products.find((p) => p.id === id);
          return product ? { product, quantity } : null;
        })
        .filter((line): line is { product: SaleProduct; quantity: number } => Boolean(line)),
    [cart, products]
  );

  const subtotal = lines.reduce((sum, line) => sum + Number(line.product.sellPrice) * line.quantity, 0);
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.max(0, subtotal - discountValue);

  const todayKey = new Date().toDateString();
  const todaySales = sales.filter((s) => new Date(s.createdAt).toDateString() === todayKey && s.status !== "cancelled");
  const todayRevenue = todaySales.reduce((sum, s) => sum + (["paid", "completed"].includes(s.status) ? Number(s.total) : 0), 0);

  const call = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/sales?slug=${encodeURIComponent(slug)}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Request failed");
    return json.data;
  };

  const addToCart = (product: SaleProduct, quantity = 1) => {
    setError(null);
    setCart((current) => {
      const next = Math.min((current[product.id] ?? 0) + quantity, product.quantity);
      if (next <= 0) {
        const copy = { ...current };
        delete copy[product.id];
        return copy;
      }
      return { ...current, [product.id]: next };
    });
  };

  const setQuantity = (product: SaleProduct, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => {
        const copy = { ...current };
        delete copy[product.id];
        return copy;
      });
      return;
    }
    setCart((current) => ({ ...current, [product.id]: Math.min(quantity, product.quantity) }));
  };

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((c) => c.id === id);
    setCustomerName(customer?.name ?? "");
    setCustomerPhone(customer?.phone ?? "");
  };

  const checkout = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await call("create", {
        items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        discount: discountValue,
        paymentMethod: payment,
        customerId: customerId || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        notes: notes || null,
      });
      const sale = data.sale as Omit<SaleRecord, "createdAt" | "items"> & {
        createdAt: string;
        items?: SaleRecord["items"];
      };
      setSales((current) => [{ ...sale, items: sale.items ?? [] }, ...current]);
      setProducts((current) =>
        current.map((p) => {
          const sold = cart[p.id] ?? 0;
          return sold ? { ...p, quantity: Math.max(0, p.quantity - sold) } : p;
        })
      );
      setCart({});
      setDiscount("");
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setNotice(t("saleSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await call("status", { id, status });
      setSales((current) => current.map((s) => (s.id === id ? { ...s, ...data.sale } : s)));
      setNotice(t("statusUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const panel: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: 18,
  };

  const input: React.CSSProperties = {
    background: theme.background,
    border: `1px solid ${theme.outlineVariant}`,
    color: theme.tertiary,
    borderRadius: 10,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: theme.tertiary }}>
            {t("title")}
          </h1>
          <p className="mt-1 text-sm" style={{ color: theme.secondary }}>
            {t("subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl px-4 py-2" style={{ background: theme.surface, border: `1px solid ${theme.outlineVariant}` }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
              {t("todaySales")}
            </p>
            <p className="text-lg font-semibold" style={{ color: theme.tertiary }}>
              {todaySales.length}
            </p>
          </div>
          <div className="rounded-xl px-4 py-2" style={{ background: theme.surface, border: `1px solid ${theme.outlineVariant}` }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
              {t("todayRevenue")}
            </p>
            <p className="text-lg font-semibold" style={{ color: theme.tertiary }}>
              {money(todayRevenue, locale, currency)}
            </p>
          </div>
        </div>
      </div>

      {(error || notice) && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: error ? `${"#dc2626"}18` : `${theme.primary}18`,
            color: error ? "#dc2626" : theme.primary,
          }}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="p-4" style={panel}>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.secondary }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchProducts")}
              className="w-full py-2.5 pe-3 ps-9 text-sm outline-none"
              style={input}
            />
          </div>

          {visibleProducts.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: theme.secondary }}>
              {t("noProducts")}
            </p>
          ) : (
            <div className="grid max-h-[30rem] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.map((product) => {
                const out = product.quantity <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(product)}
                    className="group flex flex-col overflow-hidden rounded-xl text-start transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: `1px solid ${theme.outlineVariant}`, background: theme.background }}
                  >
                    <div className="flex h-24 items-center justify-center" style={{ background: theme.surface }}>
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-8 w-8" style={{ color: theme.secondary }} />
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-1 text-sm font-medium" style={{ color: theme.tertiary }}>
                        {product.name}
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold" style={{ color: theme.primary }}>
                          {money(product.sellPrice, locale, currency)}
                        </span>
                        <span style={{ color: out ? "#dc2626" : theme.secondary }}>{t("stockLeft", { count: product.quantity })}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col p-4" style={panel}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.tertiary }}>
              <ShoppingCart className="h-4 w-4" /> {t("cart")}
            </h2>
            {lines.length > 0 && (
              <button type="button" onClick={() => setCart({})} className="text-xs" style={{ color: theme.secondary }}>
                {t("clear")}
              </button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: theme.secondary }}>
              {t("emptyCart")}
            </p>
          ) : (
            <ul className="space-y-2">
              {lines.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-center gap-2 rounded-xl p-2" style={{ border: `1px solid ${theme.outlineVariant}` }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: theme.tertiary }}>
                      {product.name}
                    </p>
                    <p className="text-xs" style={{ color: theme.secondary }}>
                      {money(Number(product.sellPrice) * quantity, locale, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(product, quantity - 1)}
                      className="rounded-lg p-1.5"
                      style={{ border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm" style={{ color: theme.tertiary }}>
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="rounded-lg p-1.5"
                      style={{ border: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => setQuantity(product, 0)} className="ms-1" style={{ color: "#dc2626" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="text-xs" style={{ color: theme.secondary }}>
              {t("customer")}
              <select
                value={customerId}
                onChange={(event) => selectCustomer(event.target.value)}
                className="mt-1 w-full p-2 text-sm"
                style={input}
              >
                <option value="">{t("walkIn")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `· ${customer.phone}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs" style={{ color: theme.secondary }}>
              {t("payment")}
              <select
                value={payment}
                onChange={(event) => setPayment(event.target.value as (typeof PAYMENT_METHODS)[number])}
                className="mt-1 w-full p-2 text-sm"
                style={input}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`paymentMethods.${method}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs" style={{ color: theme.secondary }}>
              {t("customerName")}
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 w-full p-2 text-sm" style={input} />
            </label>
            <label className="text-xs" style={{ color: theme.secondary }}>
              {t("customerPhone")}
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className="mt-1 w-full p-2 text-sm"
                style={input}
              />
            </label>
          </div>

          <label className="mt-2 block text-xs" style={{ color: theme.secondary }}>
            {t("notes")}
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full p-2 text-sm" style={input} />
          </label>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span style={{ color: theme.secondary }}>{t("discount")}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="w-28 p-2 text-sm"
              style={input}
            />
          </div>

          <div className="mt-3 space-y-1 border-t pt-3 text-sm" style={{ borderColor: theme.outlineVariant }}>
            <div className="flex justify-between" style={{ color: theme.secondary }}>
              <span>{t("subtotal")}</span>
              <span>{money(subtotal, locale, currency)}</span>
            </div>
            <div className="flex justify-between" style={{ color: theme.secondary }}>
              <span>{t("discount")}</span>
              <span>-{money(discountValue, locale, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold" style={{ color: theme.tertiary }}>
              <span>{t("total")}</span>
              <span>{money(total, locale, currency)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={checkout}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: theme.primary }}
          >
            {busy ? t("saving") : t("completeSale")}
          </button>
        </section>
      </div>

      <section className="p-4" style={panel}>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: theme.tertiary }}>
          {t("recentSales")}
        </h2>
        {sales.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: theme.secondary }}>
            {t("noSales")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="text-start text-xs uppercase" style={{ color: theme.secondary }}>
                  <th className="pb-2 text-start font-medium">{t("reference")}</th>
                  <th className="pb-2 text-start font-medium">{t("date")}</th>
                  <th className="pb-2 text-start font-medium">{t("customer")}</th>
                  <th className="pb-2 text-start font-medium">{t("items")}</th>
                  <th className="pb-2 text-end font-medium">{t("total")}</th>
                  <th className="pb-2 text-end font-medium">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 40).map((sale) => (
                  <tr key={sale.id} style={{ borderTop: `1px solid ${theme.outlineVariant}`, color: theme.tertiary }}>
                    <td className="py-2 font-mono text-xs">{sale.reference}</td>
                    <td className="py-2 text-xs" style={{ color: theme.secondary }}>
                      {formatDate(sale.createdAt, locale)}
                    </td>
                    <td className="py-2 text-xs">{sale.customerName ?? t("walkIn")}</td>
                    <td className="py-2 text-xs">
                      {sale.items.map((item) => `${item.quantity}× ${item.productNameSnapshot}`).join(", ")}
                    </td>
                    <td className="py-2 text-end font-medium">{money(sale.total, locale, currency)}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ background: `${theme.primary}18`, color: theme.primary }}
                        >
                          {t(`statuses.${sale.status}`)}
                        </span>
                        {sale.status === "pending" && (
                          <>
                            <button
                              type="button"
                              title={t("markPaid")}
                              onClick={() => updateStatus(sale.id, "paid")}
                              disabled={busy}
                              className="rounded p-1"
                              style={{ color: theme.primary }}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title={t("cancel")}
                              onClick={() => updateStatus(sale.id, "cancelled")}
                              disabled={busy}
                              className="rounded p-1"
                              style={{ color: "#dc2626" }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {sale.status === "paid" && (
                          <button
                            type="button"
                            title={t("cancel")}
                            onClick={() => updateStatus(sale.id, "cancelled")}
                            disabled={busy}
                            className="rounded p-1"
                            style={{ color: "#dc2626" }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
