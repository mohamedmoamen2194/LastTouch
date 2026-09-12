import { and, asc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, customers, employees, employeeServices, services } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant/context";
import { getDashboardStats } from "@/modules/analytics/application/dashboard";
import { isWriteTool, requestWrite } from "@/lib/ai/write-actions";
import { REPORT_TYPES, type ReportType } from "@/lib/ai/reports";
import type { ToolDef } from "@/lib/ai/client";

/**
 * v1 assistant tools — READ-ONLY by design. Every executor is scoped to
 * ctx.tenantId, so the model can never see another store. Write tools
 * (complete/cancel/adjust) land next, behind YES-confirmations.
 */
export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    name: "today_schedule",
    description: "Today's appointments (Cairo day) with customer, worker, time and status.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "upcoming_appointments",
    description: "Upcoming appointments from now on. Optional days window (default 7, max 30).",
    parameters: {
      type: "OBJECT",
      properties: { days: { type: "NUMBER", description: "How many days ahead" } },
    },
  },
  {
    name: "revenue_stats",
    description: "Dashboard figures: today's/upcoming appointments, revenue today, new customers, top services.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "team_list",
    description:
      "Team members with role, active flag, and the EXACT services each one performs (use this — not the role title — to say who does what; a general worker does everything).",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "customer_search",
    description: "Find customers by name or phone fragment (max 5).",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING", description: "Name or phone fragment" } },
      required: ["query"],
    },
  },
  {
    name: "list_services",
    description: "All services with id, name, price and duration. Use ids from here when building a package.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "generate_report",
    description:
      "Build a downloadable CSV report: revenue (per-day, needs no confirmation), appointments (upcoming), team, services, or customers. Optional days window 1-90 (default 30, applies to revenue). Executes immediately — the download button appears automatically.",
    parameters: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", description: "One of: revenue, appointments, team, services, customers" },
        days: { type: "NUMBER", description: "Window in days for revenue (1-90)" },
      },
      required: ["type"],
    },
  },
  {
    name: "complete_appointment",
    description:
      "STAGE completing an appointment (does NOT complete yet). Call with the appointmentId from today_schedule/upcoming_appointments, then tell the user to press Confirm. Only for pending/confirmed appointments.",
    parameters: {
      type: "OBJECT",
      properties: { appointmentId: { type: "STRING", description: "Appointment UUID from a list tool" } },
      required: ["appointmentId"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "STAGE cancelling an appointment (does NOT cancel yet). Call with the appointmentId from a list tool plus optional reason, then tell the user to press Confirm. Only for pending/confirmed appointments.",
    parameters: {
      type: "OBJECT",
      properties: {
        appointmentId: { type: "STRING", description: "Appointment UUID from a list tool" },
        reason: { type: "STRING", description: "Optional cancellation reason" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "create_service",
    description:
      "STAGE adding a service (does NOT create yet). Ask for any missing name/price/duration first, then call and tell the user to press Confirm.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Service name" },
        price: { type: "NUMBER", description: "Price in EGP" },
        durationMinutes: { type: "NUMBER", description: "Duration 5-600 minutes" },
        description: { type: "STRING", description: "Optional description" },
      },
      required: ["name", "price", "durationMinutes"],
    },
  },
  {
    name: "create_package",
    description:
      "STAGE adding a package (does NOT create yet). Resolve service names to ids via list_services first, then call and tell the user to press Confirm.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Package name" },
        price: { type: "NUMBER", description: "Price in EGP" },
        serviceIds: {
          type: "ARRAY",
          description: "Service UUIDs from list_services",
          items: { type: "STRING" },
        },
        description: { type: "STRING", description: "Optional description" },
      },
      required: ["name", "price"],
    },
  },
];

export function buildAssistantSystem(ctx: {
  businessName: string;
  locale: string;
  todayYmd: string;
}): string {
  return [
    `You are the assistant for "${ctx.businessName}" (a beauty/grooming business dashboard). Today is ${ctx.todayYmd} (Africa/Cairo).`,
    "Answer in the user's language (Arabic or English). Keep answers short and formatted with numbers from the tools.",
    "RULES: Use tools for every factual question — never invent appointments, revenue or staff. You only see this one store. SKILLS: to say who performs a service, read each worker's services list from team_list — role titles are generic and often identical. WRITES: complete/cancel/create only STAGE the action — call with exact ids (appointmentId from list tools, serviceIds from list_services), collect any missing name/price/duration by asking first, then tell the user to press the Confirm button. Never claim an action is done until the user confirms it. REPORTS: generate_report needs no confirmation — the download button appears automatically.",
  ].join("\n");
}

export async function executeAssistantTool(
  ctx: TenantContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Write tools never execute here — they stage a pending confirmation.
  if (isWriteTool(name)) {
    const { summary, pendingId } = await requestWrite(ctx, name, args);
    return { needsConfirmation: true, pendingId, summary };
  }
  if (name === "generate_report") {
    const raw = String(args.type ?? "").toLowerCase();
    const reportType = (REPORT_TYPES as readonly string[]).includes(raw) ? (raw as ReportType) : null;
    if (!reportType) return { error: "Report type must be one of: revenue, appointments, team, services, customers" };
    const days = Math.min(Math.max(Number(args.days ?? 30) || 30, 1), 90);
    return { reportReady: true, type: reportType, days };
  }
  switch (name) {
    case "today_schedule": {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return db
        .select({
          id: appointments.id,
          time: appointments.startTime,
          end: appointments.endTime,
          status: appointments.status,
          customerId: appointments.customerId,
          employeeId: appointments.employeeId,
        })
        .from(appointments)
        .where(
          and(eq(appointments.tenantId, ctx.tenantId), gte(appointments.appointmentDate, start), lte(appointments.appointmentDate, end)),
        )
        .orderBy(asc(appointments.startTime))
        .limit(50)
        .then(async (rows) => ({
          count: rows.length,
          items: await Promise.all(
            rows.map(async (r) => ({
              appointmentId: r.id,
              time: `${r.time}–${r.end}`,
              status: r.status,
              customer: r.customerId ? await nameOf("customer", r.customerId) : null,
              worker: r.employeeId ? await nameOf("employee", r.employeeId) : null,
            })),
          ),
        }));
    }
    case "upcoming_appointments": {
      const days = Math.min(Math.max(Number(args.days ?? 7) || 7, 1), 30);
      const now = new Date();
      const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          id: appointments.id,
          date: appointments.appointmentDate,
          time: appointments.startTime,
          status: appointments.status,
          customerId: appointments.customerId,
          employeeId: appointments.employeeId,
        })
        .from(appointments)
        .where(and(eq(appointments.tenantId, ctx.tenantId), gte(appointments.appointmentDate, now), lte(appointments.appointmentDate, until)))
        .orderBy(asc(appointments.appointmentDate))
        .limit(30);
      return {
        count: rows.length,
        items: await Promise.all(
          rows.map(async (r) => ({
            appointmentId: r.id,
            date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
            time: r.time,
            status: r.status,
            customer: r.customerId ? await nameOf("customer", r.customerId) : null,
            worker: r.employeeId ? await nameOf("employee", r.employeeId) : null,
          })),
        ),
      };
    }
    case "revenue_stats":
      return getDashboardStats(ctx);
    case "team_list": {
      const staff = await db
        .select({
          id: employees.id,
          name: employees.displayName,
          firstName: employees.firstName,
          role: employees.role,
          active: employees.active,
          isGeneral: employees.isGeneral,
        })
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId))
        .orderBy(asc(employees.displayName))
        .limit(50);
      // Service links: the source of truth for "who does what" (role titles
      // are free text and often identical while skills differ).
      const ids = staff.map((s) => s.id);
      const byEmployee = new Map<string, string[]>();
      if (ids.length > 0) {
        const links = await db
          .select({ employeeId: employeeServices.employeeId, name: services.name })
          .from(employeeServices)
          .innerJoin(services, eq(services.id, employeeServices.serviceId))
          .where(inArray(employeeServices.employeeId, ids));
        for (const l of links) {
          byEmployee.set(l.employeeId, [...(byEmployee.get(l.employeeId) ?? []), l.name]);
        }
      }
      return staff.map((r) => {
        const role = r.role?.trim();
        return {
          name: r.name ?? r.firstName,
          role: role ? role.charAt(0).toUpperCase() + role.slice(1) : null,
          active: r.active,
          general: r.isGeneral,
          services: r.isGeneral ? ["all services"] : (byEmployee.get(r.id) ?? []),
        };
      });
    }
    case "list_services": {
      const { listTenantServicesForAdmin } = await import("@/modules/booking/domain/catalog");
      const catalog = await listTenantServicesForAdmin(ctx.tenantId);
      return catalog.map((s) => ({
        serviceId: s.id,
        name: s.name,
        price: String(s.price),
        durationMinutes: s.durationMinutes,
        active: s.active,
      }));
    }
    case "customer_search": {
      const q = String(args.query ?? "").trim().slice(0, 60);
      if (!q) return [];
      const rows = await db
        .select({ firstName: customers.firstName, lastName: customers.lastName, phone: customers.phone, visitCount: customers.visitCount })
        .from(customers)
        .where(and(eq(customers.tenantId, ctx.tenantId), or(ilike(customers.firstName, `%${q}%`), ilike(customers.phone, `%${q}%`))))
        .limit(5);
      return rows;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function nameOf(kind: "customer" | "employee", id: string): Promise<string | null> {
  if (kind === "customer") {
    const [c] = await db
      .select({ firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return c ? `${c.firstName}${c.lastName ? " " + c.lastName : ""}` : null;
  }
  const [e] = await db
    .select({ displayName: employees.displayName, firstName: employees.firstName })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  return e ? (e.displayName ?? e.firstName) : null;
}
