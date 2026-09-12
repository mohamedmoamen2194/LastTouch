"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";
import type { BillingPeriod, SubscriptionPlan } from "@/db/schema";

type PlanKey = "basic" | "pro" | "custom";
type DbPlan = Exclude<SubscriptionPlan, "free">;

const PLAN_DB: Record<PlanKey, DbPlan> = { basic: "pro", pro: "ai", custom: "enterprise" };

const CARDS: Record<
  PlanKey,
  { features: readonly string[]; basePrice: number | null; popular?: boolean }
> = {
  basic: {
    features: ["management", "booking", "appointments", "customers", "analytics", "team5"],
    basePrice: 800,
  },
  pro: {
    features: ["included", "ads", "performance", "aiAssistant", "campaigns", "team5"],
    basePrice: 1200,
    popular: true,
  },
  custom: {
    features: ["everything", "tailored", "support", "flexible", "teamCustom"],
    basePrice: null,
  },
};

const PERIODS: { key: "period1m" | "period6m" | "period1y"; value: BillingPeriod; off: number }[] = [
  { key: "period1m", value: "monthly", off: 0 },
  { key: "period6m", value: "semiannual", off: 0.2 },
  { key: "period1y", value: "annual", off: 0.4 },
];

function monthlyPrice(base: number | null, off: number): number | null {
  if (base === null) return null;
  return Math.round(base * (1 - off));
}

export function SubscriptionPlans({
  slug,
  theme,
  currentPlan,
  isOwner,
}: {
  slug: string;
  theme: ThemeTokens;
  currentPlan: SubscriptionPlan;
  isOwner: boolean;
}) {
  const t = useTranslations("subscription");
  const tp = useTranslations("pricing");
  const locale = useLocale();
  const router = useRouter();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0]);
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const choose = async (key: PlanKey) => {
    if (!isOwner || busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, plan: PLAN_DB[key], billingPeriod: period.value }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="subscription" className="scroll-mt-24">
      <div className="mb-4 md:mb-6">
        <h2 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>
          {t("title")}
        </h2>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {t("subtitle")}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#fff" }}>
          {error}
        </div>
      )}
      {done && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#e1f3e2", color: "#1d6e2f" }}>
          {t("activated")}
        </div>
      )}

      {/* Billing period toggle */}
      <div className="mb-5 flex flex-col items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.onSurfaceVariant }}>
          {t("period")}
        </span>
        <div
          className="flex w-fit max-w-full items-center gap-1.5 overflow-x-auto rounded-full border p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
        >
          {PERIODS.map((p) => {
            const active = period.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p)}
                className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm"
                style={{
                  backgroundColor: active ? theme.primary : "transparent",
                  color: active ? theme.onPrimary : theme.onSurfaceVariant,
                }}
              >
                {t(p.key)}
                {p.off > 0 && (
                  <span className="ms-1" style={{ color: active ? "#a7f3d0" : "#047857" }}>
                    −{Math.round(p.off * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!isOwner && (
        <p
          className="mb-4 rounded-lg px-4 py-3 text-center text-xs sm:text-sm"
          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
        >
          {t("askOwner")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        {(Object.keys(CARDS) as PlanKey[]).map((key) => {
          const card = CARDS[key];
          const dbPlan = PLAN_DB[key];
          const isCurrent = currentPlan === dbPlan;
          const price = monthlyPrice(card.basePrice, period.off);
          return (
            <div
              key={key}
              className="relative flex flex-col rounded-2xl border p-4 sm:p-5"
              style={{
                borderColor: card.popular ? theme.primary : theme.outlineVariant,
                backgroundColor: card.popular ? theme.primary : theme.surfaceContainerLowest,
                color: card.popular ? theme.onPrimary : undefined,
              }}
            >
              {isCurrent && (
                <span
                  className="absolute end-4 top-4 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    backgroundColor: card.popular ? theme.onPrimary : theme.primary,
                    color: card.popular ? theme.primary : theme.onPrimary,
                  }}
                >
                  {t("currentPlan")}
                </span>
              )}
              <h3
                className="text-sm font-semibold uppercase tracking-wide sm:text-base"
                style={{ color: card.popular ? theme.onPrimary : theme.primary }}
              >
                {tp(`plans.${key}.name`)}
              </h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                {price === null ? (
                  <span
                    className="text-2xl font-bold sm:text-3xl"
                    style={{ color: card.popular ? theme.onPrimary : theme.primary }}
                  >
                    {tp(`plans.${key}.priceLabel`)}
                  </span>
                ) : (
                  <>
                    <span
                      dir="ltr"
                      className="whitespace-nowrap text-2xl font-bold tabular-nums sm:text-3xl"
                      style={{ color: card.popular ? theme.onPrimary : theme.primary }}
                    >
                      {price.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}
                    </span>
                    <span
                      className="text-xs sm:text-sm"
                      style={{ color: card.popular ? theme.onPrimary : theme.onSurfaceVariant }}
                    >
                      {tp("billed")}
                    </span>
                  </>
                )}
              </div>
              <p
                className="mt-2 text-xs leading-relaxed sm:text-sm"
                style={{ color: card.popular ? theme.onPrimary : theme.onSurfaceVariant }}
              >
                {tp(`plans.${key}.description`)}
              </p>
              <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                {card.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs sm:text-sm">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      strokeWidth={3}
                      style={{ color: card.popular ? theme.onPrimary : theme.primary }}
                    />
                    <span style={{ color: card.popular ? theme.onPrimary : theme.onSurfaceVariant }}>
                      {tp(`plans.${key}.features.${f}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => choose(key)}
                disabled={!isOwner || busy !== null || isCurrent}
                className="mt-4 w-full rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: card.popular ? theme.onPrimary : theme.primary,
                  color: card.popular ? theme.primary : theme.onPrimary,
                }}
              >
                {isCurrent ? t("currentPlan") : busy === key ? t("activating") : t("activate")}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
