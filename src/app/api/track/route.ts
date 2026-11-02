import { NextResponse } from "next/server";
import { and, asc, count, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { appointmentEmployees, appointmentServices, appointments, customers, employees } from "@/db/schema";
import { withApi } from "@/lib/api";
import { ok } from "@/lib/response";
import { ValidationAppError, NotFoundError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";

function maskName(name: string | null | undefined) {
  if (!name) return "Guest";
  const trimmed = name.trim();
  return trimmed ? `${trimmed.slice(0, 1)}***` : "Guest";
}

function maskPhone(phone: string | null | undefined) {
  if (!phone) return "—";
  const digits = phone.replace(/\s+/g, "");
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function parseMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new ValidationAppError("Invalid month");
  const [y, m] = value.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1), year: y, month: m };
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationAppError("Invalid date");
  const [y, m, d] = value.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return { start, end };
}

/** GET /api/track?slug=...&month=YYYY-MM | &date=YYYY-MM-DD | &code=LT-... */
export async function GET(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    rateLimit(`track:${clientIp(req)}`, 60);

    const tenant = await resolveTenantForBooking(slug);
    const month = url.searchParams.get("month");
    const date = url.searchParams.get("date");
    const code = url.searchParams.get("code");

    if (code) {
      rateLimit(`track-code:${clientIp(req)}`, 20);
      const [appt] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            eq(appointments.trackingNumber, code.trim().toUpperCase())
          )
        )
        .limit(1);
      if (!appt) throw new NotFoundError("Tracking number not found");

      const [customer] = appt.customerId
        ? await db.select().from(customers).where(eq(customers.id, appt.customerId)).limit(1)
        : [];
      const svcRows = await db
        .select()
        .from(appointmentServices)
        .where(eq(appointmentServices.appointmentId, appt.id))
        .orderBy(appointmentServices.sortOrder);
      const assignmentRows = await db
        .select({ employeeId: appointmentEmployees.employeeId })
        .from(appointmentEmployees)
        .where(eq(appointmentEmployees.appointmentId, appt.id));
      const workerIds = [...new Set([appt.employeeId, ...assignmentRows.map((a) => a.employeeId)])].filter(
        (id): id is string => Boolean(id)
      );
      const workers = workerIds.length
        ? await db
            .select({ id: employees.id, displayName: employees.displayName, firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.tenantId, tenant.id))
        : [];
      const workerById = new Map(workers.map((w) => [w.id, w]));

      return NextResponse.json(
        ok(
          {
            appointment: {
              trackingNumber: appt.trackingNumber,
              appointmentDate: appt.appointmentDate.toISOString().slice(0, 10),
              startTime: appt.startTime,
              endTime: appt.endTime,
              durationMinutes: appt.durationMinutes,
              status: appt.status,
              price: appt.price,
              notes: appt.notes,
              customer: customer
                ? { name: `${customer.firstName} ${customer.lastName ?? ""}`.trim(), phone: customer.phone }
                : null,
              services: svcRows.map((s) => ({
                name: s.serviceNameSnapshot,
                durationMinutes: s.durationSnapshot,
                price: s.priceSnapshot,
              })),
              workers: workerIds.map((id) => {
                const w = workerById.get(id);
                return w ? (w.displayName ?? `${w.firstName} ${w.lastName ?? ""}`.trim()) : null;
              }).filter((name): name is string => Boolean(name)),
            },
          },
          "Appointment"
        )
      );
    }

    if (date) {
      const { start, end } = parseDay(date);
      const rows = await db
        .select({
          id: appointments.id,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          status: appointments.status,
          firstName: customers.firstName,
          phone: customers.phone,
          price: appointments.price,
        })
        .from(appointments)
        .leftJoin(customers, eq(customers.id, appointments.customerId))
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            gte(appointments.appointmentDate, start),
            lt(appointments.appointmentDate, end),
            or(
              eq(appointments.status, "pending"),
              eq(appointments.status, "confirmed"),
              eq(appointments.status, "completed")
            )
          )
        )
        .orderBy(asc(appointments.startTime));

      return NextResponse.json(
        ok(
          {
            date,
            slots: rows.map((r) => ({
              id: r.id,
              startTime: r.startTime,
              endTime: r.endTime,
              status: r.status,
              customerName: maskName(r.firstName),
              customerPhone: maskPhone(r.phone),
            })),
          },
          "Day"
        )
      );
    }

    if (month) {
      const { start, end, year, month: monthNum } = parseMonth(month);
      const rows = await db
        .select({ appointmentDate: appointments.appointmentDate, value: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            gte(appointments.appointmentDate, start),
            lt(appointments.appointmentDate, end),
            or(
              eq(appointments.status, "pending"),
              eq(appointments.status, "confirmed"),
              eq(appointments.status, "completed")
            )
          )
        )
        .groupBy(appointments.appointmentDate);
      return NextResponse.json(
        ok(
          {
            year,
            month: monthNum,
            days: rows.map((r) => ({
              date: r.appointmentDate.toISOString().slice(0, 10),
              count: Number(r.value),
            })),
          },
          "Calendar"
        ),
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    throw new ValidationAppError("Provide month, date or tracking code");
  });
}
