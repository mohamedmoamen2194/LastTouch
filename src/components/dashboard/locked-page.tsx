"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Contact, Lock, Scissors, Users } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type LockedPageKey = "appointments" | "customers" | "services" | "employees";

const ICONS = {
  appointments: CalendarDays,
  customers: Users,
  services: Scissors,
  employees: Contact,
} as const;

const TITLE_KEYS: Record<LockedPageKey, "lockedAppointmentsTitle" | "lockedCustomersTitle" | "lockedServicesTitle" | "lockedEmployeesTitle"> = {
  appointments: "lockedAppointmentsTitle",
  customers: "lockedCustomersTitle",
  services: "lockedServicesTitle",
  employees: "lockedEmployeesTitle",
};

const BODY_KEYS: Record<LockedPageKey, "lockedAppointmentsBody" | "lockedCustomersBody" | "lockedServicesBody" | "lockedEmployeesBody"> = {
  appointments: "lockedAppointmentsBody",
  customers: "lockedCustomersBody",
  services: "lockedServicesBody",
  employees: "lockedEmployeesBody",
};

/**
 * Locked empty state for dashboard pages when the store has no active
 * subscription. Same pages, same nav — content unlocks after subscribing.
 */
export function LockedPage({
  page,
  slug,
  theme,
}: {
  page: LockedPageKey;
  slug: string;
  theme: ThemeTokens;
}) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const Icon = ICONS[page];

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>
          {t(TITLE_KEYS[page])}
        </h1>
      </div>

      <div
        className="flex flex-col items-center rounded-2xl border border-dashed px-5 py-10 text-center sm:px-8 md:py-14"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
        >
          <Lock className="h-6 w-6" />
        </span>
        <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: theme.onSurfaceVariant }}>
          {t(BODY_KEYS[page])}
        </p>
        <Link
          href={`/${locale}/${slug}/dashboard#subscription`}
          className="mt-6 w-full rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {t("lockedCta")}
        </Link>
      </div>
    </div>
  );
}
