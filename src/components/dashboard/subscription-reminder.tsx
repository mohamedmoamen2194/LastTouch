"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BellRing, X } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

/**
 * Ending-soon popup: appears once per browser session when ≤5 days remain.
 * Mobile-first bottom sheet, centered dialog on desktop. RTL-aware.
 */
export function SubscriptionReminder({
  tenantId,
  slug,
  theme,
  daysLeft,
}: {
  tenantId: string;
  slug: string;
  theme: ThemeTokens;
  daysLeft: number;
}) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(`lt-sub-reminded-${tenantId}`)) return;
    } catch {
      // storage unavailable — still show once per mount
    }
    setOpen(true);
  }, [tenantId]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(`lt-sub-reminded-${tenantId}`, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("reminderTitle")}
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6"
        style={{ backgroundColor: theme.surfaceContainerLowest }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
          >
            <BellRing className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("reminderLater")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-3 text-lg font-bold" style={{ color: theme.primary }}>
          {t("reminderTitle")}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>
          {t("reminderBody", { days: daysLeft })}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/${locale}/${slug}/dashboard#subscription`}
            onClick={dismiss}
            className="flex-1 rounded-full px-5 py-2.5 text-center text-sm font-semibold"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            {t("reminderCta")}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-full border px-5 py-2.5 text-sm font-semibold"
            style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
          >
            {t("reminderLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
