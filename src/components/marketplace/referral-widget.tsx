"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Gift, Users, X } from "lucide-react";

type ReferralRow = {
  id: string;
  businessName: string;
  amount: number;
  status: string;
  createdAt: string;
};

type Stats = {
  code: string | null;
  balance: number;
  totalEarnings: number;
  referrals: ReferralRow[];
};

/** Referral balance + code + popup ledger on the account page. */
export function ReferralWidget() {
  const t = useTranslations("client");
  const locale = useLocale();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const money = (v: number) => v.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");

  useEffect(() => {
    let alive = true;
    void fetch("/api/client/referrals")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.success) setStats(j.data as Stats);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return null;

  const copy = async () => {
    if (!stats.code) return;
    try {
      await navigator.clipboard.writeText(stats.code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = stats.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const act = async (referralId: string, action: "convert" | "request") => {
    setBusyId(referralId);
    try {
      const res = await fetch("/api/client/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, referralId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      const fresh = await fetch("/api/client/referrals").then((r) => r.json());
      if (fresh.success) setStats(fresh.data as Stats);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "earned") return null;
    const label =
      s === "converted" ? t("refConverted") : s === "requested" ? t("refAwaiting") : t("refPaid");
    const cls =
      s === "converted"
        ? "bg-blue-100 text-blue-700"
        : s === "requested"
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-700";
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
  };

  return (
    <>
      <section className="mp-solid flex items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Gift className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold tabular-nums leading-none">
            {money(stats.balance)} <span className="text-xs font-semibold">{t("egp")}</span>
          </p>
          <p className="mt-1 text-xs text-white/75">{t("refBalance")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#091426]"
        >
          <Users className="h-3.5 w-3.5" />
          {t("viewReferrals")}
        </button>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#091426]">{t("refTitle")}</h3>
                <p className="mt-0.5 text-xs text-[#45474c]">
                  {t("refTotalEarnings")}: <b className="tabular-nums">{money(stats.totalEarnings)} {t("egp")}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eff1f3] text-[#45474c]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {stats.code && (
              <button
                type="button"
                onClick={copy}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-[#c5c6cd] bg-[#f7f9fb] px-4 py-3"
              >
                <span className="min-w-0 text-start">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
                    {t("refCode")}
                  </span>
                  <span dir="ltr" className="block truncate font-mono text-sm font-bold text-[#091426]">
                    {stats.code}
                  </span>
                </span>
                <span className="mp-solid flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("copied") : t("copy")}
                </span>
              </button>
            )}

            <ul className="mt-3 flex flex-col gap-2">
              {stats.referrals.length === 0 && (
                <li className="rounded-2xl bg-[#f7f9fb] px-4 py-6 text-center text-xs text-[#45474c]">
                  {t("refEmpty")}
                </li>
              )}
              {stats.referrals.map((r) => (
                <li key={r.id} className="rounded-2xl bg-[#f7f9fb] px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[#091426]">{r.businessName}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-[#091426]">
                      {money(r.amount)} {t("egp")}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] tabular-nums text-[#9aa0a6]">
                    {new Date(r.createdAt).toLocaleDateString(locale)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {statusBadge(r.status)}
                    {r.status === "earned" && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => act(r.id, "convert")}
                          className="mp-solid flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {t("refConvertCta")}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => act(r.id, "request")}
                          className="flex-1 rounded-full border border-[#c5c6cd] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#091426] disabled:opacity-50"
                        >
                          {t("refRequestCta")}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
