"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, QrCode, Star } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type Tab = "booking" | "scan" | "ratings";

/**
 * Bottom tab bar for the public booking page: Booking | Scan | Ratings.
 * Same height language as the dashboard mobile nav; all panels stay mounted
 * (hidden) so booking progress survives tab switches.
 */
export function BookingTabs({
  theme,
  booking,
  scan,
  ratings,
}: {
  theme: ThemeTokens;
  booking: ReactNode;
  scan: ReactNode;
  ratings: ReactNode;
}) {
  const t = useTranslations("booking");
  const [tab, setTab] = useState<Tab>("booking");

  const items: { key: Tab; label: string; icon: typeof CalendarCheck }[] = [
    { key: "booking", label: t("tabBooking"), icon: CalendarCheck },
    { key: "scan", label: t("tabScan"), icon: QrCode },
    { key: "ratings", label: t("tabRatings"), icon: Star },
  ];

  const pick = (key: Tab) => {
    setTab(key);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <div className={tab === "booking" ? undefined : "hidden"}>{booking}</div>
      <div className={tab === "scan" ? undefined : "hidden"}>{scan}</div>
      <div className={tab === "ratings" ? undefined : "hidden"}>{ratings}</div>

      <div
        className="fixed inset-x-2 bottom-2 z-40 md:inset-x-4 md:bottom-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav
          role="tablist"
          aria-label="booking"
          className="mx-auto flex max-w-xl items-center gap-0.5 rounded-2xl p-1.5 shadow-lg"
          style={{ backgroundColor: theme.primary }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => pick(item.key)}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium leading-tight"
                style={{
                  color: active ? theme.onPrimary : theme.surfaceContainerHigh,
                  backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="max-w-full truncate px-0.5">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
      {/* Spacer so the floating bar never covers content */}
      <div className="h-20 md:h-24" aria-hidden />
    </>
  );
}
