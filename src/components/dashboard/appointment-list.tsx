"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Clock, Home, MapPin, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeTokens } from "@/config/business-types";
import { AppointmentActions } from "./appointment-actions";

export type CatalogService = {
  id: string;
  name: string;
  homeVisit: boolean;
  durationMinutes: number;
  price: string;
};

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
  customerFirstName?: string | null;
  customerPhone?: string | null;
  durationMinutes: number | null;
  homeVisit?: boolean;
  homeAddress?: string | null;
  homeCity?: string | null;
  homeLatitude?: string | null;
  homeLongitude?: string | null;
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
  canManage = true,
  catalogServices = [],
  canCreate = false,
}: {
  rows: AppointmentCardRow[];
  slug: string;
  theme: ThemeTokens;
  canManage?: boolean;
  catalogServices?: CatalogService[];
  canCreate?: boolean;
}) {
  const t = useTranslations("dashboard");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "home" | "store">("all");
  const [attachId, setAttachId] = useState<string | null>(null);
  const [attachSelected, setAttachSelected] = useState<string[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const attachServices = async (appointmentId: string) => {
    if (attachSelected.length === 0) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const res = await fetch(`/api/admin/appointments?slug=${encodeURIComponent(slug)}&action=attach-services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, serviceIds: attachSelected }),
      });
      const json = await res.json().catch(() => ({ success: false, message: t("error") }));
      if (!json.success) throw new Error(json.message ?? t("error"));
      setAttachId(null);
      setAttachSelected([]);
      // Keep openId so the detail stays expanded with fresh data.
      window.location.reload();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : t("error"));
    } finally {
      setAttachBusy(false);
    }
  };

  const counts = {
    all: rows.length,
    home: rows.filter((r) => r.homeVisit).length,
    store: rows.filter((r) => !r.homeVisit).length,
  };
  const visibleRows =
    view === "home" ? rows.filter((r) => r.homeVisit) : view === "store" ? rows.filter((r) => !r.homeVisit) : rows;

  const tabs: { key: "all" | "home" | "store"; label: string; count: number }[] = [
    { key: "all", label: t("all"), count: counts.all },
    { key: "home", label: t("homeVisits"), count: counts.home },
    { key: "store", label: t("inStore"), count: counts.store },
  ];

  return (
    <div className="flex flex-col gap-3 md:rounded-lg md:border" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
      {counts.home > 0 && (
        <div className="flex gap-1.5 overflow-x-auto p-2 pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                aria-pressed={active}
                className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: active ? theme.primary : theme.outlineVariant,
                  backgroundColor: active ? theme.primary : theme.surfaceContainerLowest,
                  color: active ? theme.onPrimary : theme.onSurfaceVariant,
                }}
              >
                {tab.key === "home" && <Home className="h-3.5 w-3.5" />}
                {tab.label}
                <span className="tabular-nums opacity-75">{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* Header row — hidden on small screens, shown md+ */}
      <div
        className="hidden grid-cols-12 items-center gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide md:grid"
        style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}
      >
        <div className="col-span-4">{t("appointmentDate")}</div>
        <div className="col-span-2">{t("appointmentStatus")}</div>
        <div className="col-span-2 text-end">{t("appointmentPrice")}</div>
        <div className="col-span-4 text-end">{t("appointmentActions")}</div>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: theme.outlineVariant }}>
        {visibleRows.map((r) => {
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
                  className="text-start md:col-span-4"
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} style={{ color: theme.secondary }} />
                    <span className="text-sm font-semibold" style={{ color: theme.primary }}>{displayDate(r.dateTime)}</span>
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap text-xs tabular-nums" style={{ color: theme.onSurfaceVariant }}>
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={r.status} theme={theme} />
                    {r.homeVisit && (
                      <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: "#e3f2fd", color: "#04519b" }}>
                        <Home className="h-3 w-3" />
                        {t("homeVisit")}
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="whitespace-nowrap text-sm font-semibold tabular-nums md:col-span-2 md:w-auto md:text-end" style={{ color: theme.primary }}>
                    {r.price}
                  </div>
                </div>

                {/* Actions */}
                <div className="md:col-span-4 md:justify-self-end">
                  {canManage ? (
                    <AppointmentActions slug={slug} appointmentId={r.id} status={r.status} />
                  ) : (
                    <span className="text-xs" style={{ color: theme.outlineVariant }}>—</span>
                  )}
                </div>
              </div>

              {/* Expandable detail */}
              {open && (
                <div className="border-t px-4 py-4 md:px-4" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: theme.secondary }}>
                        <span>{t("appointmentServices")}</span>
                        {canCreate && catalogServices.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAttachId(attachId === r.id ? null : r.id);
                              setAttachSelected([]);
                              setAttachError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold normal-case"
                            style={{ borderColor: theme.outlineVariant, color: theme.primary }}
                          >
                            <Plus className="h-3 w-3" />
                            {t("addServices")}
                          </button>
                        )}
                      </h4>
                      {attachId === r.id && (
                        <div className="mb-2 rounded-lg border p-3" style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surface }}>
                          <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                            {catalogServices.map((s) => {
                              const checked = attachSelected.includes(s.id);
                              return (
                                <label key={s.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: checked ? theme.primary : theme.outlineVariant, color: theme.onSurfaceVariant }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setAttachSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                                    }
                                    className="h-3.5 w-3.5"
                                    style={{ accentColor: theme.primary }}
                                  />
                                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                </label>
                              );
                            })}
                          </div>
                          {attachError && <p className="mt-2 text-xs" style={{ color: "#a12b2b" }}>{attachError}</p>}
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setAttachId(null)}
                              className="rounded-full px-3 py-1.5 text-xs font-semibold"
                              style={{ color: theme.onSurfaceVariant }}
                            >
                              {t("cancel")}
                            </button>
                            <button
                              type="button"
                              onClick={() => attachServices(r.id)}
                              disabled={attachBusy || attachSelected.length === 0}
                              className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
                            >
                              {attachBusy ? t("processing") : t("save")}
                            </button>
                          </div>
                        </div>
                      )}
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
                        {r.customerFirstName && (
                          <DetailRow label={t("customer")} value={r.customerFirstName} theme={theme} />
                        )}
                        {r.customerPhone && (
                          <DetailRow label={t("phone")} value={r.customerPhone} theme={theme} />
                        )}
                        {r.homeVisit && r.homeAddress && (
                          <div className="pt-2">
                            <div className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.secondary }} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium" style={{ color: theme.onSurfaceVariant }}>
                                  {r.homeAddress}{r.homeCity ? `, ${r.homeCity}` : ""}
                                </p>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    r.homeLatitude && r.homeLongitude
                                      ? `${Number(r.homeLatitude)},${Number(r.homeLongitude)}`
                                      : [r.homeAddress, r.homeCity].filter(Boolean).join(", ")
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block text-xs font-semibold underline"
                                  style={{ color: theme.primary }}
                                >
                                  {t("getDirections")}
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visibleRows.length === 0 && (
          <p className="rounded-none border-dashed p-8 text-center text-sm md:rounded-lg md:border" style={{ borderColor: theme.outlineVariant, color: theme.onSurfaceVariant }}>
            {t("noData")}
          </p>
        )}
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