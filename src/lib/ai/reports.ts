import { and, asc, count, desc, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  appointmentServices,
  appointments,
  customers,
  employees,
  employeeServices,
  services,
  type AppointmentStatus,
} from "@/db/schema";
import type { TenantContext } from "@/lib/tenant/context";

export const REPORT_TYPES = ["revenue", "appointments", "team", "services", "customers"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const COUNTED: AppointmentStatus[] = ["completed", "confirmed"];

function cairoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens Arabic correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

async function customerName(id: string | null): Promise<string> {
  if (!id) return "";
  const [c] = await db
    .select({ firstName: customers.firstName, lastName: customers.lastName })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return c ? `${c.firstName}${c.lastName ? " " + c.lastName : ""}` : "";
}

async function workerName(id: string | null): Promise<string> {
  if (!id) return "";
  const [e] = await db
    .select({ displayName: employees.displayName, firstName: employees.firstName })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  return e ? (e.displayName ?? e.firstName) : "";
}

/** Builds a CSV report scoped to the tenant. Read-only. */
export async function buildReportCsv(
  ctx: TenantContext,
  type: ReportType,
  days: number,
): Promise<{ filename: string; csv: string }> {
  const tenantId = ctx.tenantId;
  const today = cairoDay(new Date());
  const filename = `${type}-report-${today}.csv`;
  const windowDays = Math.min(Math.max(days || 30, 1), 90);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  if (type === "revenue") {
    const rows = await db
      .select({ date: appointments.appointmentDate, price: appointments.price })
      .from(appointments)
      .where(
        and(eq(appointments.tenantId, tenantId), gte(appointments.appointmentDate, since), inArray(appointments.status, COUNTED)),
      );
    const byDay = new Map<string, { n: number; sum: number }>();
    for (const r of rows) {
      const d = cairoDay(new Date(r.date));
      const e = byDay.get(d) ?? { n: 0, sum: 0 };
      e.n += 1;
      e.sum += Number(r.price ?? 0);
      byDay.set(d, e);
    }
    const out = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => [date, v.n, v.sum.toFixed(2)]);
    return { filename, csv: toCsv(["date", "appointments", "revenue"], out) };
  }

  if (type === "appointments") {
    const rows = await db
      .select({
        date: appointments.appointmentDate,
        time: appointments.startTime,
        status: appointments.status,
        price: appointments.price,
        customerId: appointments.customerId,
        employeeId: appointments.employeeId,
      })
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), gte(appointments.appointmentDate, new Date())))
      .orderBy(asc(appointments.appointmentDate))
      .limit(200);
    const out = await Promise.all(
      rows.map(async (r) => [
        cairoDay(new Date(r.date)),
        r.time,
        r.status,
        await customerName(r.customerId),
        await workerName(r.employeeId),
        Number(r.price ?? 0).toFixed(2),
      ]),
    );
    return { filename, csv: toCsv(["date", "time", "status", "customer", "worker", "price"], out) };
  }

  if (type === "team") {
    const staff = await db
      .select({
        id: employees.id,
        name: employees.displayName,
        firstName: employees.firstName,
        role: employees.role,
        active: employees.active,
        rating: employees.rating,
      })
      .from(employees)
      .where(eq(employees.tenantId, tenantId))
      .orderBy(asc(employees.displayName));
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const out = await Promise.all(
      staff.map(async (s) => {
        const links = await db
          .select({ name: services.name })
          .from(employeeServices)
          .innerJoin(services, eq(services.id, employeeServices.serviceId))
          .where(eq(employeeServices.employeeId, s.id));
        const [w] = await db
          .select({ value: count() })
          .from(appointments)
          .where(
            and(eq(appointments.tenantId, tenantId), eq(appointments.employeeId, s.id), gte(appointments.appointmentDate, monthStart)),
          );
        return [
          s.name ?? s.firstName,
          s.role ?? "",
          s.active ? "active" : "inactive",
          links.map((l) => l.name).join(" | "),
          w?.value ?? 0,
          Number(s.rating ?? 0).toFixed(1),
        ];
      }),
    );
    return { filename, csv: toCsv(["name", "role", "status", "services", "works_this_month", "rating"], out) };
  }

  if (type === "services") {
    const catalog = await db
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
        duration: services.durationMinutes,
        active: services.active,
      })
      .from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(asc(services.name));
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const out = await Promise.all(
      catalog.map(async (s) => {
        const perf = await db
          .select({ n: count(appointmentServices.id), sum: sum(appointmentServices.priceSnapshot) })
          .from(appointmentServices)
          .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
          .where(
            and(
              eq(appointments.tenantId, tenantId),
              eq(appointmentServices.serviceId, s.id),
              gte(appointments.appointmentDate, monthStart),
              inArray(appointments.status, COUNTED),
            ),
          );
        return [
          s.name,
          Number(s.price ?? 0).toFixed(2),
          s.duration,
          s.active ? "active" : "inactive",
          perf[0]?.n ?? 0,
          Number(perf[0]?.sum ?? 0).toFixed(2),
        ];
      }),
    );
    return {
      filename,
      csv: toCsv(["service", "price", "duration_min", "status", "bookings_this_month", "revenue_this_month"], out),
    };
  }

  // customers
  const rows = await db
    .select({
      firstName: customers.firstName,
      lastName: customers.lastName,
      phone: customers.phone,
      visits: customers.visitCount,
      spent: customers.totalSpent,
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(desc(customers.totalSpent))
    .limit(500);
  return {
    filename,
    csv: toCsv(
      ["name", "phone", "visits", "total_spent"],
      rows.map((r) => [
        `${r.firstName}${r.lastName ? " " + r.lastName : ""}`,
        r.phone ?? "",
        r.visits ?? 0,
        Number(r.spent ?? 0).toFixed(2),
      ]),
    ),
  };
}
