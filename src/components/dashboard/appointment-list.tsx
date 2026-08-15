"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeTokens } from "@/config/business-types";
import { AppointmentActions } from "./appointment-actions";

export type AppointmentCardRow = {
  id: string;
  dateTime: Date | string;
  startTime: string;
  endTime: string;
  status: string;
  price: string;
  source: string;
  employeeId: string | null;
  employeeFirstName: string | null;
  employeeLastName: string | null;
  customerId: string | null;
  durationMinutes: number | null;
  services: {
    serviceId: string | null;
    name: string;
    durationMinutes: number;
    sortOrder: number;
    startTime: string;
    endTime: string;
    worker: { employeeId: string; name: string } | null;
  }[];
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#fff4e5", fg: "#9a6b00" },
  confirmed: { bg: "#e3f2fd", fg: "#04519b" },
  completed: { bg: "#e1f3e2", fg: "#1d6e2f" },
  cancelled: { bg: "#fdeaea", fg: "#a12b2b" },
  no_show: { bg: "#f0e9fb", fg: "#6a3bb0" },
};

export function AppointmentList({
  rows,
  slug,
  theme,
}: {
  rows: AppointmentCardRow[];
  slug: string;
  theme: ThemeTokens;
}) {
  const t = useTranslations("dashboard");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 md:rounded-lg md:border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
      {/* Header row — hidden on small screens, shown md+ */}
      <div
        className="hidden grid-cols-12 items-center gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide md:grid"
        style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
      >
        <div className="col-span-4">{t("appointmentDate")}</div>
        <div className="col-span-2">{t("appointmentStatus")}</div>
        <div className="col-span-2 text-right">{t("appointmentPrice")}</div>
        <div className="col-span-4 text-right">{t("appointmentActions")}</div>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
        {rows.map((r) => {
          const open = openId === r.id;
          return (
            <div key={r.id}>
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-4 transition-colors md:grid md:grid-cols-12 md:items-center md:rounded-none md:border-x-0 md:border-t md:border-b-0 md:px-4 md:py-3",
                  open && "md:bg-black/[0.03]"
                )}
                style={{
                  borderColor: theme.outlineVariant,
                  backgroundColor: theme.surfaceContainerLowest,
                }}
              >
                {/* Date + time + worker — clickable to expand details */}
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="text-left md:col-span-4"
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} style={{ color: theme.secondary }} />
                    <span className="text-sm font-semibold" style={{ color: theme.primary }}>{displayDate(r.dateTime)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: theme.onSurfaceVariant }}>
                    {r.startTime}–{r.endTime}
                  </span>
                  {r.services.length > 0 && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: theme.secondary }}>
                      <Clock size={12} className="shrink-0" />
                      {r.services.length} {r.services.length === 1 ? t("service") : t("services")}
                    </span>
                  )}
                </button>

                {/* Status */}
                <div className="flex items-center justify-between gap-3 md:contents">
                  <StatusBadge status={r.status} theme={theme} />

                  {/* Price */}
                  <div className="text-sm font-semibold md:col-span-2 md:w-auto md:text-right" style={{ color: theme.primary }}>
                    {r.price}
                  </div>
                </div>

                {/* Actions */}
                <div className="md:col-span-4 md:justify-self-end">
                  <AppointmentActions slug={slug} appointmentId={r.id} status={r.status} />
                </div>
              </div>

              {/* Expandable detail */}
              {open && (
                <div className="border-t px-4 py-4 md:px-4" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>
                        {t("appointmentServices")}
                      </h4>
                      {r.services.length > 0 ? (
                        <ul className="space-y-2">
                          {r.services.map((s) => (
                            <li
                              key={`${s.serviceId ?? "svc"}-${s.sortOrder}`}
                              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                              style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" style={{ color: theme.onSurfaceVariant }}>{s.name}</p>
                                <p className="mt-0.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
                                  {s.startTime}–{s.endTime}
                                  {s.durationMinutes > 0 ? ` · ${s.durationMinutes}m` : ""}
                                </p>
                              </div>
                              {s.worker ? (
                                <span className="flex shrink-0 items-center gap-1 text-xs font-medium" style={{ color: theme.secondary }}>
                                  <User size={12} />
                                  {s.worker.name}
                                </span>
                              ) : (
                                <span className="shrink-0 text-xs" style={{ color: theme.outlineVariant }}>—</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-lg border border-dashed p-4 text-center text-xs" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
                          {t("noData")}
                        </p>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>
                        {t("appointmentDetails")}
                      </h4>
                      <div className="space-y-1.5 rounded-lg border px-3 py-3 text-sm" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}>
                        <DetailRow label={t("appointmentDate")} value={displayDate(r.dateTime)} theme={theme} />
                        <DetailRow label={t("appointmentTime")} value={`${r.startTime}–${r.endTime}`} theme={theme} />
                        <DetailRow
                          label={t("appointmentDuration")}
                          value={r.durationMinutes != null ? `${r.durationMinutes} ${t("minutes")}` : "—"}
                          theme={theme}
                        />
                        <DetailRow
                          label={t("appointmentStatus")}
                          value={r.status.replace("_", " ")}
                          theme={theme}
                        />
                        <DetailRow label={t("appointmentSource")} value={r.source} theme={theme} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, value, theme }: { label: string; value: string; theme: ThemeTokens }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: theme.secondary }}>{label}</span>
      <span className="text-xs font-medium capitalize" style={{ color: theme.onSurfaceVariant }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status, theme }: { status: string; theme: ThemeTokens }) {
  const colors = STATUS_COLORS[status] ?? { bg: theme.surfaceContainerHigh, fg: theme.onSurfaceVariant };
  return (
    <span
      className="inline-block rounded-md px-2.5 py-1 text-xs font-medium capitalize"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function displayDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}