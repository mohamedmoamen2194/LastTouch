"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Copy, Search, User } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type Props = {
  slug: string;
  theme: ThemeTokens;
  currency: string;
  businessName: string;
  initialCode?: string;
};

type DaySummary = { date: string; count: number };
type Slot = { id: string; startTime: string; endTime: string; status: string; customerName: string; customerPhone: string };
type TrackedAppointment = {
  trackingNumber: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  price: string;
  notes: string | null;
  customer: { name: string; phone: string | null } | null;
  services: { name: string; durationMinutes: number; price: string }[];
  workers: string[];
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PublicTracker({ slug, theme, currency, businessName, initialCode }: Props) {
  const t = useTranslations("tracker");
  const locale = useLocale();
  const numTag = locale === "ar" ? "ar-EG" : "en-US";
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [days, setDays] = useState<DaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [code, setCode] = useState(initialCode ?? "");
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedAppointment | null>(null);
  const [copied, setCopied] = useState(false);

  const monthKey = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;

  const loadMonth = useCallback(async () => {
    try {
      const res = await fetch(`/api/track?slug=${encodeURIComponent(slug)}&month=${monthKey}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setDays(json.data.days as DaySummary[]);
    } catch {
      /* calendar is non-critical */
    }
  }, [slug, monthKey]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const search = useCallback(
    async (value?: string) => {
      const term = (value ?? code).trim();
      if (!term) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/track?slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(term)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.message ?? t("notFound"));
        setTracked(json.data.appointment as TrackedAppointment);
        setSelectedDate(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("notFound"));
        setTracked(null);
      } finally {
        setLoading(false);
      }
    },
    [code, slug, t]
  );

  useEffect(() => {
    if (initialCode) void search(initialCode);
  }, [initialCode, search]);

  const pickDay = async (date: string) => {
    setSelectedDate(date);
    setSlots([]);
    setSlotsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/track?slug=${encodeURIComponent(slug)}&date=${date}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setSlots(json.data.slots as Slot[]);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setSlotsLoading(false);
    }
  };

  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const pad = first.getDay();
    const cells: (string | null)[] = Array.from({ length: pad }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(`${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return cells;
  }, [cursor]);

  const countByDate = useMemo(() => new Map(days.map((d) => [d.date, d.count])), [days]);

  const moveMonth = (delta: number) => {
    setSelectedDate(null);
    setSlots([]);
    setCursor((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  };

  const formatDay = (date: string) =>
    new Intl.DateTimeFormat(numTag, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));

  const formatTime = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(numTag, { hour: "numeric", minute: "2-digit" }).format(
      new Date(2000, 0, 1, h, m)
    );
  };

  const money = (value: string) =>
    new Intl.NumberFormat(numTag, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));

  const monthLabel = new Intl.DateTimeFormat(numTag, { month: "long", year: "numeric" }).format(
    new Date(cursor.year, cursor.month - 1, 1)
  );

  const statusLabel = (status: string) => {
    const key = ["pending", "confirmed", "completed", "cancelled", "no_show"].includes(status) ? status : "pending";
    return t(`status.${key}` as never);
  };

  const card: React.CSSProperties = {
    backgroundColor: theme.surface,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: 20,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: theme.primary }}>
          {t("title")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: theme.onSurfaceVariant }}>
          {businessName} · {t("subtitle")}
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.secondary }} />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("codePlaceholder")}
            className="w-full rounded-full py-2.5 pe-3 ps-9 text-sm uppercase outline-none"
            style={{ backgroundColor: theme.surfaceContainerLowest, border: `1px solid ${theme.outlineVariant}`, color: theme.onSurfaceVariant }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="rounded-full px-5 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {loading ? t("searching") : t("track")}
        </button>
      </form>

      {error && (
        <p className="text-center text-sm" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      <AnimatePresence mode="wait">
        {tracked ? (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="p-5"
            style={card}
          >
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setTracked(null)} className="flex items-center gap-1 text-sm" style={{ color: theme.secondary }}>
                <ArrowLeft className="h-4 w-4" /> {t("back")}
              </button>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}>
                {statusLabel(tracked.status)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
                  {t("trackingNumber")}
                </p>
                <p dir="ltr" className="font-mono text-lg font-bold" style={{ color: theme.primary }}>
                  {tracked.trackingNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tracked.trackingNumber);
                    setCopied(true);
                  } catch {
                    /* noop */
                  }
                }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl p-3" style={{ backgroundColor: theme.background }}>
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
                  <CalendarDays className="h-3.5 w-3.5" /> {t("date")}
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: theme.primary }}>
                  {formatDay(tracked.appointmentDate)}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: theme.background }}>
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: theme.secondary }}>
                  <Clock className="h-3.5 w-3.5" /> {t("time")}
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: theme.primary }}>
                  {formatTime(tracked.startTime)} – {formatTime(tracked.endTime)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>
                {t("services")}
              </p>
              {tracked.services.map((service, index) => (
                <div key={`${service.name}-${index}`} className="flex justify-between gap-3 text-sm" style={{ color: theme.onSurfaceVariant }}>
                  <span>
                    {service.name} · {service.durationMinutes} {t("min")}
                  </span>
                  <span dir="ltr">{money(service.price)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm font-bold" style={{ borderColor: theme.outlineVariant, color: theme.primary }}>
                <span>{t("total")}</span>
                <span dir="ltr">{money(tracked.price)}</span>
              </div>
            </div>

            {tracked.workers.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: theme.onSurfaceVariant }}>
                <User className="h-4 w-4" />
                <span>{t("specialist")}: {tracked.workers.join(", ")}</span>
              </div>
            )}

            {tracked.customer && (
              <div className="mt-4 rounded-xl p-3 text-sm" style={{ backgroundColor: theme.background, color: theme.onSurfaceVariant }}>
                <p className="font-semibold" style={{ color: theme.primary }}>{tracked.customer.name}</p>
                {tracked.customer.phone && <p dir="ltr">{tracked.customer.phone}</p>}
              </div>
            )}

            {tracked.notes && (
              <p className="mt-3 text-sm" style={{ color: theme.onSurfaceVariant }}>
                {tracked.notes}
              </p>
            )}
          </motion.section>
        ) : (
          <motion.section
            key={`${monthKey}-${selectedDate ?? "calendar"}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="p-4 sm:p-5"
            style={card}
          >
            {selectedDate ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setSelectedDate(null)} className="flex items-center gap-1 text-sm" style={{ color: theme.secondary }}>
                    <ArrowLeft className="h-4 w-4" /> {t("back")}
                  </button>
                  <p className="text-sm font-semibold" style={{ color: theme.primary }}>
                    {formatDay(selectedDate)}
                  </p>
                </div>

                {slotsLoading ? (
                  <p className="py-10 text-center text-sm" style={{ color: theme.secondary }}>
                    {t("loading")}
                  </p>
                ) : slots.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: theme.secondary }}>
                    {t("noSlots")}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {slots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3"
                        style={{ backgroundColor: theme.background, border: `1px solid ${theme.outlineVariant}` }}
                      >
                        <div>
                          <p dir="ltr" className="text-sm font-semibold" style={{ color: theme.primary }}>
                            {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                          </p>
                          <p className="text-xs" style={{ color: theme.secondary }}>
                            {slot.customerName} · <span dir="ltr">{slot.customerPhone}</span>
                          </p>
                        </div>
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}>
                          {statusLabel(slot.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-center text-[11px]" style={{ color: theme.secondary }}>
                  {t("privacyNote")}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => moveMonth(-1)} className="rounded-full p-2" style={{ color: theme.primary }}>
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold" style={{ color: theme.primary }}>
                    {monthLabel}
                  </p>
                  <button type="button" onClick={() => moveMonth(1)} className="rounded-full p-2" style={{ color: theme.primary }}>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                  {WEEKDAYS.map((day) => (
                    <span key={day} className="py-1 text-[10px] font-semibold uppercase" style={{ color: theme.secondary }}>
                      {new Intl.DateTimeFormat(numTag, { weekday: "narrow" }).format(
                        new Date(2024, 0, 7 + WEEKDAYS.indexOf(day))
                      )}
                    </span>
                  ))}
                  {grid.map((date, index) => {
                    if (!date) return <span key={`empty-${index}`} />;
                    const dayNum = Number(date.slice(-2));
                    const booked = countByDate.get(date) ?? 0;
                    const isToday = date === ymd(new Date());
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => void pickDay(date)}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition hover:opacity-80"
                        style={{
                          backgroundColor: isToday ? theme.primaryContainer : theme.background,
                          border: `1px solid ${isToday ? theme.primary : theme.outlineVariant}`,
                          color: theme.primary,
                        }}
                      >
                        <span className="font-medium">{new Intl.NumberFormat(numTag).format(dayNum)}</span>
                        {booked > 0 && (
                          <span className="mt-0.5 flex items-center gap-0.5">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                            <span className="text-[9px]" style={{ color: theme.secondary }}>
                              {new Intl.NumberFormat(numTag).format(booked)}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-4 text-center text-[11px]" style={{ color: theme.secondary }}>
                  {t("pickDay")}
                </p>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
