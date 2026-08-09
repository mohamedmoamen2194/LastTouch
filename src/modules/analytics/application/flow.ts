import { and, eq, inArray, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, type AppointmentStatus } from "@/db/schema";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";

const COUNTED: AppointmentStatus[] = ["pending", "confirmed", "completed"];
const TZ = "Africa/Cairo";

export type FlowPoint = { key: string; value: number };
export type BookingFlow = {
  /** Last 14 Cairo calendar days, keyed as YYYY-MM-DD. */
  daily: FlowPoint[];
  /** Last 8 weeks, keyed by the Monday of each week (YYYY-MM-DD). */
  weekly: FlowPoint[];
  /** Last 12 calendar months, keyed as YYYY-MM. */
  monthly: FlowPoint[];
};

/**
 * Bookings flow for the dashboard chart. Buckets are computed in the tenant
 * timezone on the DB, then zero-filled in JS so every period has a complete,
 * aligned series regardless of sparse data.
 */
export async function getBookingFlow(ctx: TenantContext): Promise<BookingFlow> {
  assertPermission(ctx, Permission["analytics.read"]);
  const now = new Date();

  const [dailyCounts, weeklyCounts, monthlyCounts] = await Promise.all([
    groupedCounts(ctx.tenantId, "day", new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)),
    groupedCounts(ctx.tenantId, "week", new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000)),
    groupedCounts(ctx.tenantId, "month", new Date(now.getFullYear() - 2, now.getMonth(), 1)),
  ]);

  return {
    daily: buildDaily(now, dailyCounts),
    weekly: buildWeekly(now, weeklyCounts),
    monthly: buildMonthly(now, monthlyCounts),
  };
}

async function groupedCounts(
  tenantId: string,
  granularity: "day" | "week" | "month",
  from: Date
): Promise<Map<string, number>> {
  const fmt = granularity === "month" ? "'YYYY-MM'" : "'YYYY-MM-DD'";
  const bucket = sql<string>`to_char(date_trunc(${sql.raw(`'${granularity}'`)}, ${appointments.createdAt} at time zone ${sql.raw(`'${TZ}'`)}), ${sql.raw(fmt)})`;

  const rows = await db
    .select({ bucket, value: sql<number>`count(*)::int` })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.createdAt, from),
        inArray(appointments.status, COUNTED)
      )
    )
    .groupBy(bucket);

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.bucket, r.value);
  return map;
}

function cairoYMD(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function buildDaily(now: Date, counts: Map<string, number>): FlowPoint[] {
  const out: FlowPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    const key = cairoYMD(d);
    out.push({ key, value: counts.get(key) ?? 0 });
  }
  return out;
}

function buildWeekly(now: Date, counts: Map<string, number>): FlowPoint[] {
  const seen = new Set<string>();
  const mondays: string[] = [];
  for (let i = 84; i >= 0 && mondays.length < 8; i--) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    const monday = mondayOf(cairoYMD(d));
    if (!seen.has(monday)) {
      seen.add(monday);
      mondays.push(monday);
    }
  }
  return mondays.map((m) => ({ key: m, value: counts.get(m) ?? 0 }));
}

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  let cur = new Date(Date.UTC(y, m - 1, d, 12));
  for (let i = 0; i < 8; i++) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(cur);
    if (wd === "Mon") return cairoYMD(cur);
    cur = new Date(cur.getTime() - 86400000);
  }
  return cairoYMD(cur);
}

function buildMonthly(now: Date, counts: Map<string, number>): FlowPoint[] {
  const parts = cairoYMD(now).split("-").map(Number);
  const currentIdx = parts[0] * 12 + (parts[1] - 1);
  const out: FlowPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = currentIdx - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, value: 0 });
  }
  for (const p of out) p.value = counts.get(p.key) ?? 0;
  return out;
}