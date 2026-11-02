import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { machineMaintenance, machines } from "@/db/schema";
import { NotFoundError, ValidationAppError } from "@/lib/errors";
import { Permission } from "@/lib/permissions";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";

export const MACHINE_STATUSES = ["operational", "maintenance", "retired"] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export type MachineInput = {
  name?: string;
  nameAr?: string | null;
  serialNumber?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  purchaseDate?: string | null;
  warrantyExpiry?: string | null;
  expiryDate?: string | null;
  maintenanceIntervalDays?: number;
  lastMaintenanceAt?: string | null;
  nextMaintenanceAt?: string | null;
  status?: MachineStatus;
  notes?: string | null;
  active?: boolean;
};

function clean(value: string | null | undefined, max = 500): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (text.length > max) throw new ValidationAppError("Text is too long");
  return text;
}

function dateValue(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) throw new ValidationAppError(`${field} is not a valid date`);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function validateMachineInput(input: unknown, partial = false): MachineInput {
  const v = input as Record<string, unknown> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid machine payload");

  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!partial && !name) throw new ValidationAppError("Machine name is required");
  if (name.length > 200) throw new ValidationAppError("Machine name is too long");

  const interval = v.maintenanceIntervalDays === undefined ? undefined : Number(v.maintenanceIntervalDays);
  if (interval !== undefined && (!Number.isInteger(interval) || interval < 0)) {
    throw new ValidationAppError("Maintenance interval must be a whole number of days");
  }

  const status = v.status;
  if (status !== undefined && !MACHINE_STATUSES.includes(status as MachineStatus)) {
    throw new ValidationAppError("Invalid machine status");
  }

  return {
    name: name || undefined,
    nameAr: clean(v.nameAr as string | null | undefined, 200),
    serialNumber: clean(v.serialNumber as string | null | undefined, 120),
    category: clean(v.category as string | null | undefined, 120),
    description: clean(v.description as string | null | undefined, 2000),
    imageUrl: clean(v.imageUrl as string | null | undefined, 500),
    purchaseDate: v.purchaseDate === undefined ? undefined : dateValue(v.purchaseDate as string | null, "Purchase date")?.toISOString() ?? null,
    warrantyExpiry: v.warrantyExpiry === undefined ? undefined : dateValue(v.warrantyExpiry as string | null, "Warranty expiry")?.toISOString() ?? null,
    expiryDate: v.expiryDate === undefined ? undefined : dateValue(v.expiryDate as string | null, "Expiry date")?.toISOString() ?? null,
    maintenanceIntervalDays: interval,
    lastMaintenanceAt: v.lastMaintenanceAt === undefined ? undefined : dateValue(v.lastMaintenanceAt as string | null, "Last maintenance")?.toISOString() ?? null,
    nextMaintenanceAt: v.nextMaintenanceAt === undefined ? undefined : dateValue(v.nextMaintenanceAt as string | null, "Next maintenance")?.toISOString() ?? null,
    status: status as MachineStatus | undefined,
    notes: clean(v.notes as string | null | undefined, 2000),
    active: typeof v.active === "boolean" ? v.active : undefined,
  };
}

export async function listMachines(ctx: TenantContext) {
  assertPermission(ctx, Permission["inventory.read"]);
  return db
    .select()
    .from(machines)
    .where(and(eq(machines.tenantId, ctx.tenantId), isNull(machines.deletedAt)))
    .orderBy(desc(machines.active), asc(machines.name));
}

export async function getMachine(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["inventory.read"]);
  const [row] = await db
    .select()
    .from(machines)
    .where(and(eq(machines.id, id), eq(machines.tenantId, ctx.tenantId), isNull(machines.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("Machine not found");
  return row;
}

export async function createMachine(ctx: TenantContext, raw: unknown) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const input = validateMachineInput(raw);
  const last = input.lastMaintenanceAt ? new Date(input.lastMaintenanceAt) : null;
  const interval = input.maintenanceIntervalDays ?? 0;
  const next = input.nextMaintenanceAt
    ? new Date(input.nextMaintenanceAt)
    : last && interval > 0
      ? addDays(last, interval)
      : null;

  const [created] = await db
    .insert(machines)
    .values({
      tenantId: ctx.tenantId,
      name: input.name!,
      nameAr: input.nameAr ?? null,
      serialNumber: input.serialNumber ?? null,
      category: input.category ?? null,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      warrantyExpiry: input.warrantyExpiry ? new Date(input.warrantyExpiry) : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      maintenanceIntervalDays: interval,
      lastMaintenanceAt: last,
      nextMaintenanceAt: next,
      status: input.status ?? "operational",
      notes: input.notes ?? null,
      active: input.active ?? true,
    })
    .returning();
  return created;
}

export async function updateMachine(ctx: TenantContext, id: string, raw: unknown) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const existing = await getMachine(ctx, id);
  const input = validateMachineInput(raw, true);

  const last = input.lastMaintenanceAt !== undefined
    ? input.lastMaintenanceAt
      ? new Date(input.lastMaintenanceAt)
      : null
    : existing.lastMaintenanceAt;
  const interval = input.maintenanceIntervalDays ?? existing.maintenanceIntervalDays;
  const next = input.nextMaintenanceAt !== undefined
    ? input.nextMaintenanceAt
      ? new Date(input.nextMaintenanceAt)
      : null
    : input.lastMaintenanceAt !== undefined && last && interval > 0
      ? addDays(last, interval)
      : existing.nextMaintenanceAt;

  const [updated] = await db
    .update(machines)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null } : {}),
      ...(input.warrantyExpiry !== undefined ? { warrantyExpiry: input.warrantyExpiry ? new Date(input.warrantyExpiry) : null } : {}),
      ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null } : {}),
      ...(input.maintenanceIntervalDays !== undefined ? { maintenanceIntervalDays: interval } : {}),
      ...(input.lastMaintenanceAt !== undefined ? { lastMaintenanceAt: last } : {}),
      ...(input.nextMaintenanceAt !== undefined ? { nextMaintenanceAt: next } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(machines.id, id), eq(machines.tenantId, ctx.tenantId)))
    .returning();
  return updated;
}

export async function deleteMachine(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["inventory.manage"]);
  await getMachine(ctx, id);
  const [removed] = await db
    .update(machines)
    .set({ active: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(machines.id, id), eq(machines.tenantId, ctx.tenantId)))
    .returning();
  return removed;
}

export async function listMaintenance(ctx: TenantContext, machineId?: string) {
  assertPermission(ctx, Permission["inventory.read"]);
  const conditions = [eq(machineMaintenance.tenantId, ctx.tenantId)];
  if (machineId) conditions.push(eq(machineMaintenance.machineId, machineId));
  return db
    .select()
    .from(machineMaintenance)
    .where(and(...conditions))
    .orderBy(asc(machineMaintenance.completedAt), asc(machineMaintenance.scheduledFor));
}

export async function scheduleMaintenance(
  ctx: TenantContext,
  machineId: string,
  raw: unknown
) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const machine = await getMachine(ctx, machineId);
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid maintenance payload");
  const scheduledFor = dateValue(typeof v.scheduledFor === "string" ? v.scheduledFor : null, "Scheduled date");
  if (!scheduledFor) throw new ValidationAppError("Choose a maintenance date");
  const cost = Number(v.cost ?? 0);
  if (!Number.isFinite(cost) || cost < 0) throw new ValidationAppError("Cost must be a positive number");

  const [created] = await db
    .insert(machineMaintenance)
    .values({
      tenantId: ctx.tenantId,
      machineId: machine.id,
      type: "scheduled",
      scheduledFor,
      notes: clean(v.notes as string | null | undefined, 2000),
      cost: cost.toFixed(2),
      createdByUserId: ctx.userId,
    })
    .returning();

  await db
    .update(machines)
    .set({
      nextMaintenanceAt: machine.nextMaintenanceAt && machine.nextMaintenanceAt < scheduledFor
        ? machine.nextMaintenanceAt
        : scheduledFor,
      updatedAt: new Date(),
    })
    .where(eq(machines.id, machine.id));

  return created;
}

/** Mark a scheduled maintenance complete and roll the machine's next date forward. */
export async function completeMaintenance(ctx: TenantContext, maintenanceId: string) {
  assertPermission(ctx, Permission["inventory.manage"]);
  const [row] = await db
    .select()
    .from(machineMaintenance)
    .where(and(eq(machineMaintenance.id, maintenanceId), eq(machineMaintenance.tenantId, ctx.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("Maintenance record not found");
  if (row.completedAt) return row;

  const now = new Date();
  const [updated] = await db
    .update(machineMaintenance)
    .set({ type: "completed", completedAt: now, updatedAt: now })
    .where(eq(machineMaintenance.id, maintenanceId))
    .returning();

  const machine = await getMachine(ctx, row.machineId);
  const next = machine.maintenanceIntervalDays > 0 ? addDays(now, machine.maintenanceIntervalDays) : null;
  await db
    .update(machines)
    .set({
      lastMaintenanceAt: now,
      nextMaintenanceAt: next,
      status: machine.status === "maintenance" ? "operational" : machine.status,
      updatedAt: now,
    })
    .where(eq(machines.id, machine.id));

  return updated;
}

export async function listMachineAlerts(ctx: TenantContext) {
  assertPermission(ctx, Permission["inventory.read"]);
  const all = await listMachines(ctx);
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  return {
    dueMaintenance: all.filter((m) => m.nextMaintenanceAt && m.nextMaintenanceAt <= soon),
    expiring: all.filter(
      (m) =>
        (m.expiryDate && m.expiryDate <= soon) ||
        (m.warrantyExpiry && m.warrantyExpiry <= soon)
    ),
    needsAttention: all.filter(
      (m) =>
        m.status === "maintenance" ||
        (m.nextMaintenanceAt && m.nextMaintenanceAt < now) ||
        (m.expiryDate && m.expiryDate < now)
    ),
  };
}
