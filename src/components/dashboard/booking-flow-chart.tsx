"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import type { ThemeTokens } from "@/config/business-types";

type Point = { key: string; value: number };
type FlowData = { daily: Point[]; weekly: Point[]; monthly: Point[] };
type Period = "week" | "month" | "threeMonths" | "sixMonths" | "year";

const PERIODS: Period[] = ["week", "month", "threeMonths", "sixMonths", "year"];

const PERIOD_KEY: Record<Period, string> = {
  week: "periodWeek",
  month: "periodMonth",
  threeMonths: "periodThreeMonths",
  sixMonths: "periodSixMonths",
  year: "periodYear",
};

type Props = {
  locale: string;
  theme: ThemeTokens;
  data: FlowData;
};

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function pickPoints(period: Period, data: FlowData): Point[] {
  switch (period) {
    case "week":
      return data.daily.slice(-7);
    case "month":
      return data.weekly.slice(-4);
    case "threeMonths":
      return data.monthly.slice(-3);
    case "sixMonths":
      return data.monthly.slice(-6);
    case "year":
      return data.monthly.slice(-12);
  }
}

function fmtLabel(locale: string, period: Period, key: string): string {
  if (period === "week") {
    return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { weekday: "short" });
  }
  if (period === "month") {
    return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  }
  return new Date(`${key}-01T12:00:00`).toLocaleDateString(locale, { month: "short" });
}

export function BookingFlowChart({ locale, theme, data }: Props) {
  const t = useTranslations("dashboard");
  const [period, setPeriod] = useState<Period>("week");
  const { ref, width } = useContainerWidth<HTMLDivElement>();

  const points = useMemo(() => pickPoints(period, data), [period, data]);
  const total = useMemo(() => points.reduce((s, p) => s + p.value, 0), [points]);

  const height = 248;
  const PAD = { top: 30, right: 8, bottom: 30, left: 8 };
  const innerW = Math.max(width - PAD.left - PAD.right, 0);
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const slot = n > 0 ? innerW / n : 0;
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const small = n >= 10 && width < 380;
  const valueFont = n >= 10 ? (small ? 9 : 11) : 12;
  const labelFont = n >= 10 ? (small ? 9 : 11) : 12;

  return (
    <section
      className="rounded-xl border p-4 md:p-6"
      style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: theme.primary }}>{t("flowTitle")}</h2>
          <p className="mt-0.5 text-xs sm:text-sm" style={{ color: theme.onSurfaceVariant }}>
            {t("flowSubtitle", { count: total })}
          </p>
        </div>
        {/* Period toggle — wraps on mobile, never overlaps */}
        <div className="flex flex-wrap gap-1.5 md:justify-end">
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: active ? theme.primary : theme.surfaceContainerHigh,
                  color: active ? theme.onPrimary : theme.onSurfaceVariant,
                }}
              >
                {t(PERIOD_KEY[p])}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={ref} className="mt-4 w-full md:mt-5">
        {width > 0 && total === 0 ? (
          <div
            className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed text-sm"
            style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
          >
            {t("noData")}
          </div>
        ) : (
          width > 0 && (
            <svg width={width} height={height} role="img" aria-label={t("flowTitle")}>
              {/* horizontal gridlines */}
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <line
                  key={f}
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={PAD.top + innerH - innerH * f}
                  y2={PAD.top + innerH - innerH * f}
                  stroke={theme.surfaceContainerHigh}
                  strokeWidth={1}
                />
              ))}

              {points.map((p, i) => {
                const cx = PAD.left + slot * i + slot / 2;
                const h = Math.max((p.value / maxVal) * innerH, p.value > 0 ? 3 : 1.5);
                const x = cx - Math.min(slot * 0.58, 56) / 2;
                const w = Math.min(slot * 0.58, 56);
                const y = PAD.top + innerH - h;
                return (
                  <g key={p.key}>
                    <motion.rect
                      rx={5}
                      fill={theme.primary}
                      initial={{ height: 0, y: PAD.top + innerH }}
                      animate={{ height: h, y }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      x={x}
                      width={w}
                    />
                    {p.value > 0 && (
                      <text
                        x={cx}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize={valueFont}
                        fontWeight={600}
                        fill={theme.onSurfaceVariant}
                      >
                        {p.value}
                      </text>
                    )}
                    <text
                      x={cx}
                      y={height - 9}
                      textAnchor="middle"
                      fontSize={labelFont}
                      fill={theme.onSurfaceVariant}
                    >
                      {fmtLabel(locale, period, p.key)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )
        )}
      </div>
    </section>
  );
}