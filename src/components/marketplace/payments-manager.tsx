"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, Plus, Trash2 } from "lucide-react";

export type SavedMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
  isDefault: boolean;
};

function detectBrand(digits: string): string {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6/.test(digits)) return "discover";
  return "card";
}

/**
 * Saved cards. The full PAN never leaves the browser: brand/last4/expiry
 * are derived locally and only those reach the API.
 */
export function PaymentsManager({ initial }: { initial: SavedMethod[] }) {
  const t = useTranslations("client");
  const router = useRouter();
  const [methods, setMethods] = useState(initial);
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = number.replace(/[^0-9]/g, "");

  const add = async () => {
    setError(null);
    if (digits.length < 15 || digits.length > 16) return setError(t("cardNumber"));
    let expMonth: number | null = null;
    let expYear: number | null = null;
    const m = expiry.match(/^\s*(0[1-9]|1[0-2])\s*\/\s*(\d{2})\s*$/);
    if (m) {
      expMonth = Number(m[1]);
      expYear = 2000 + Number(m[2]);
    } else if (expiry.trim() !== "") {
      return setError(t("expiry"));
    }
    setBusy(true);
    try {
      const res = await fetch("/api/client/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // last4 + brand + expiry ONLY — the full number stays on-device.
        body: JSON.stringify({
          brand: detectBrand(digits),
          last4: digits.slice(-4),
          expMonth,
          expYear,
          holderName: holder.trim() || null,
          isDefault: methods.length === 0,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setMethods((prev) => [...prev, json.data.method as SavedMethod]);
      setNumber("");
      setHolder("");
      setExpiry("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("removeCard") + "?")) return;
    await fetch("/api/client/payments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMethods((prev) => prev.filter((m) => m.id !== id));
    router.refresh();
  };

  const input =
    "w-full rounded-xl border border-[#c5c6cd]/70 bg-white px-3.5 py-2.5 text-sm text-[#091426]";

  return (
    <div className="flex flex-col gap-3">
      {methods.length === 0 && !open && (
        <p className="text-sm text-[#45474c]">{t("paymentsEmpty")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl bg-[#f7f9fb] px-3.5 py-3">
            <span className="mp-solid flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white">
              <CreditCard className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold tabular-nums text-[#091426]">
                <span className="uppercase">{m.brand}</span> ···· {m.last4}
                {m.isDefault && (
                  <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {t("defaultBadge")}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-[#45474c]">
                {[m.holderName, m.expMonth && m.expYear ? `${String(m.expMonth).padStart(2, "0")}/${String(m.expYear).slice(2)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(m.id)}
              aria-label={t("removeCard")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 rounded-full border border-[#c5c6cd]/70 bg-white px-5 py-2.5 text-sm font-semibold text-[#091426]"
        >
          <Plus className="h-4 w-4" />
          {t("addCard")}
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#c5c6cd]/60 p-4">
          <label className="text-xs font-semibold text-[#45474c]">
            {t("cardNumber")}
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^0-9 ]/g, "").slice(0, 19))}
              inputMode="numeric"
              dir="ltr"
              placeholder="4111 1111 1111 1111"
              className={`${input} mt-1 tabular-nums`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-xs font-semibold text-[#45474c]">
              {t("cardHolder")}
              <input value={holder} onChange={(e) => setHolder(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-[#45474c]">
              {t("expiry")}
              <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" dir="ltr" className={`${input} mt-1`} />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-[#9aa0a6]">{t("cardNote")}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={busy}
              className="mp-solid flex-1 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("saving") : t("addCard")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2.5 text-sm text-[#45474c]">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
