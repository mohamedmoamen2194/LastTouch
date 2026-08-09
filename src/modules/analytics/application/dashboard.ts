import { and, count, desc, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { db } from "@/db";
import { appointmentServices, appointments, customers, type AppointmentStatus } from "@/db/schema";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";

const OPEN: AppointmentStatus[] = ["confirmed", "pending"];
const COUNTED: AppointmentStatus[] = ["completed", "confirmed"];

export type DashboardStats = {
  todayAppointments: number;
  upcomingAppointments: number;
  revenueToday: number;
  revenueMonth: number;
  newCustomers30d: number;
  topServices: Array<{ name: string; count: number; revenue: number }>;
};

/**
 * Dashboard analytics (spec section 30). All figures scoped to ctx.tenantId.
 */
export async function getDashboardStats(ctx: TenantContext): Promise<DashboardStats> {
  assertPermission(ctx, Permission["analytics.read"]);
  const ctxId = ctx.tenantId;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  const daysAgo = new Date(now);
  daysAgo.setDate(now.getDate() - 30);

  const [todayRow] = await db
    .select({ value: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctxId),
        gte(appointments.appointmentDate, dayStart),
        lte(appointments.appointmentDate, dayEnd),
        inArray(appointments.status, OPEN)
      )
    );

  const [upcomingRow] = await db
    .select({ value: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctxId),
        gte(appointments.appointmentDate, now),
        inArray(appointments.status, OPEN)
      )
    );

  const [revTodayRow] = await db
    .select({ value: sum(appointments.price) })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctxId),
        gte(appointments.appointmentDate, dayStart),
        lte(appointments.appointmentDate, dayEnd),
        inArray(appointments.status, COUNTED)
      )
    );

  const [revMonthRow] = await db
    .select({ value: sum(appointments.price) })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctxId),
        gte(appointments.appointmentDate, monthStart),
        lte(appointments.appointmentDate, monthEnd),
        inArray(appointments.status, COUNTED)
      )
    );

  const [newCustRow] = await db
    .select({ value: count() })
    .from(customers)
    .where(and(eq(customers.tenantId, ctxId), gte(customers.createdAt, daysAgo)));

  const topServiceRows = await db
    .select({
      name: appointmentServices.serviceNameSnapshot,
      count: count(appointmentServices.id),
      revenue: sum(appointmentServices.priceSnapshot),
    })
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.tenantId, ctxId),
        gte(appointments.appointmentDate, monthStart),
        inArray(appointments.status, COUNTED)
      )
    )
    .groupBy(appointmentServices.serviceNameSnapshot)
    .orderBy(desc(count(appointmentServices.id)))
    .limit(5);

  return {
    todayAppointments: todayRow?.value ?? 0,
    upcomingAppointments: upcomingRow?.value ?? 0,
    revenueToday: Number(revTodayRow?.value ?? 0),
    revenueMonth: Number(revMonthRow?.value ?? 0),
    newCustomers30d: newCustRow?.value ?? 0,
    topServices: topServiceRows.map((r) => ({
      name: r.name,
      count: Number(r.count),
      revenue: Number(r.revenue ?? 0),
    })),
  };
}