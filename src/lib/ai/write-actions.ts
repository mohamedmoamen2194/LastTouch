import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPendingActions, appointments, customers, employees } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationAppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { assertPermission } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";
import { cancelAppointment, completeAppointment } from "@/modules/appointments/application/appointments";

const PENDING_TTL_MS = 10 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PendingSummary = { pendingId: string; tool: string; summary: string };

/** Write tools the brain may call. Execution ALWAYS goes via request→confirm. */
export const WRITE_TOOLS = [
  "complete_appointment",
  "cancel_appointment",
  "create_service",
  "create_package",
] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

export function isWriteTool(name: string): name is WriteTool {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}

async function describeAppointment(tenantId: string, id: string): Promise<string> {
  const [a] = await db
    .select({
      date: appointments.appointmentDate,
      time: appointments.startTime,
      status: appointments.status,
      customerId: appointments.customerId,
      employeeId: appointments.employeeId,
    })
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)))
    .limit(1);
  if (!a) throw new NotFoundError("Appointment not found");
  if (a.status !== "pending" && a.status !== "confirmed") {
    throw new ValidationAppError(`Appointment is already ${a.status.replace("_", " ")}`);
  }
  const date = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date);
  let who = "";
  if (a.customerId) {
    const [c] = await db
      .select({ firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(eq(customers.id, a.customerId))
      .limit(1);
    if (c) who = ` — ${c.firstName}${c.lastName ? " " + c.lastName : ""}`;
  }
  let worker = "";
  if (a.employeeId) {
    const [e] = await db
      .select({ displayName: employees.displayName, firstName: employees.firstName })
      .from(employees)
      .where(eq(employees.id, a.employeeId))
      .limit(1);
    if (e) worker = ` with ${e.displayName ?? e.firstName}`;
  }
  return `${date} ${a.time}${who}${worker}`;
}

function requireUuid(id: unknown): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new ValidationAppError("A valid appointment is required");
  return id;
}

/**
 * Stage a write: validates NOW (exists, right tenant, right status / valid
 * input) and stores a single-use pending row. Nothing is mutated.
 */
export async function requestWrite(
  ctx: TenantContext,
  tool: WriteTool,
  args: Record<string, unknown>,
): Promise<PendingSummary> {
  let summary: string;
  let stored: Record<string, unknown>;

  if (tool === "complete_appointment" || tool === "cancel_appointment") {
    assertPermission(ctx, Permission["appointments.update"]);
    const appointmentId = requireUuid(args.appointmentId);
    const detail = await describeAppointment(ctx.tenantId, appointmentId);
    if (tool === "complete_appointment") {
      summary = `Complete appointment ${detail}`;
      stored = { appointmentId };
    } else {
      const reason = typeof args.reason === "string" && args.reason.trim() ? ` (reason: ${args.reason.trim().slice(0, 200)})` : "";
      summary = `Cancel appointment ${detail}${reason}`;
      stored = {
        appointmentId,
        ...(typeof args.reason === "string" ? { reason: args.reason.trim().slice(0, 500) } : {}),
      };
    }
  } else if (tool === "create_service") {
    assertPermission(ctx, Permission["services.manage"]);
    // Dynamic import avoids a hard dependency cycle at module load.
    const { validateServiceInput } = await import("@/modules/booking/application/services");
    const clean = validateServiceInput({
      name: args.name,
      price: args.price,
      durationMinutes: args.durationMinutes,
      description: typeof args.description === "string" ? args.description : undefined,
    });
    summary = `Add service "${clean.name}" — ${clean.price} EGP, ${clean.durationMinutes} min`;
    stored = { ...clean };
  } else {
    assertPermission(ctx, Permission["services.manage"]);
    const { validatePackageInput } = await import("@/modules/booking/application/packages");
    const { listTenantServicesForAdmin } = await import("@/modules/booking/domain/catalog");
    const clean = validatePackageInput({
      name: args.name,
      price: args.price,
      serviceIds: args.serviceIds,
      description: typeof args.description === "string" ? args.description : undefined,
    });
    // Resolve ids back to names for a readable summary (unknown ids dropped).
    const catalog = await listTenantServicesForAdmin(ctx.tenantId);
    const names = new Map(catalog.map((s) => [s.id, s.name]));
    const picked = clean.serviceIds?.filter((id) => names.has(id)) ?? [];
    clean.serviceIds = picked;
    summary = `Add package "${clean.name}" — ${clean.price} EGP${
      picked.length > 0 ? `, includes: ${picked.map((id) => names.get(id)).join(", ")}` : " (no services linked)"
    }`;
    stored = { ...clean };
  }

  const [row] = await db
    .insert(agentPendingActions)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      tool,
      args: stored,
      summary,
      status: "pending",
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    })
    .returning();
  return { pendingId: row.id, tool, summary };
}

/** Latest still-pending action for this user (drives "reply YES" on WhatsApp later). */
export async function latestPending(ctx: TenantContext) {
  const [row] = await db
    .select()
    .from(agentPendingActions)
    .where(
      and(
        eq(agentPendingActions.tenantId, ctx.tenantId),
        eq(agentPendingActions.userId, ctx.userId),
        eq(agentPendingActions.status, "pending"),
      ),
    )
    .orderBy(agentPendingActions.createdAt)
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/**
 * Execute (or dismiss) a pending action. Re-validates everything at run
 * time; single-use — the row is flipped before the mutation runs.
 */
export async function settlePending(
  ctx: TenantContext,
  pendingId: string,
  confirm: boolean,
): Promise<{ tool: string; summary: string; done: boolean }> {
  // Per-tool permissions are asserted in each branch below (appointments vs
  // catalog), so a role with only one area can't settle the other.
  if (!UUID_RE.test(pendingId)) throw new ValidationAppError("Invalid confirmation");

  const [row] = await db
    .select()
    .from(agentPendingActions)
    .where(and(eq(agentPendingActions.id, pendingId), eq(agentPendingActions.tenantId, ctx.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("Confirmation not found");
  if (row.status !== "pending" || row.expiresAt.getTime() < Date.now()) {
    if (row.status === "pending") {
      await db.update(agentPendingActions).set({ status: "expired" }).where(eq(agentPendingActions.id, row.id));
    }
    throw new ValidationAppError("This confirmation has expired — please ask again");
  }
  if (!isWriteTool(row.tool)) throw new ValidationAppError("Unknown action");
  // Owners may settle anyone's row; others only their own.
  if (row.userId && row.userId !== ctx.userId && ctx.role !== "owner") {
    throw new ForbiddenError();
  }

  if (!confirm) {
    await db.update(agentPendingActions).set({ status: "cancelled" }).where(eq(agentPendingActions.id, row.id));
    return { tool: row.tool, summary: row.summary, done: false };
  }

  // Flip first: even if the mutation below throws, the row can't be replayed.
  await db.update(agentPendingActions).set({ status: "confirmed" }).where(eq(agentPendingActions.id, row.id));

  const args = row.args as Record<string, unknown>;
  if (row.tool === "complete_appointment" || row.tool === "cancel_appointment") {
    assertPermission(ctx, Permission["appointments.update"]);
    const appointmentId = requireUuid(args.appointmentId);
    if (row.tool === "complete_appointment") {
      await completeAppointment(ctx, appointmentId);
    } else {
      await cancelAppointment(ctx, appointmentId, typeof args.reason === "string" ? args.reason : undefined);
    }
  } else if (row.tool === "create_service") {
    assertPermission(ctx, Permission["services.manage"]);
    const { createService, validateServiceInput } = await import("@/modules/booking/application/services");
    await createService(ctx, validateServiceInput(args));
  } else {
    assertPermission(ctx, Permission["services.manage"]);
    const { createPackage, validatePackageInput } = await import("@/modules/booking/application/packages");
    await createPackage(ctx, validatePackageInput(args));
  }
  return { tool: row.tool, summary: row.summary, done: true };
}
