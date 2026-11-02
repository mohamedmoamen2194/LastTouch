import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  employees,
  memberships,
  staffInvites,
  tenants,
  type Role,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationAppError,
} from "@/lib/errors";
import { resolvePermissions, type Permission } from "@/lib/permissions";
import type { TenantContext } from "@/lib/tenant/context";

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STAFF_INVITE_ROLES = ["manager", "cashier", "employee"] as const;
export type StaffInviteRole = (typeof STAFF_INVITE_ROLES)[number];

export function isStaffInviteRole(value: unknown): value is StaffInviteRole {
  return typeof value === "string" && (STAFF_INVITE_ROLES as readonly string[]).includes(value);
}

/** Invite codes are high-entropy and only their hash is persisted. */
export function generateInviteCode(): string {
  const raw = randomBytes(6).toString("hex").toUpperCase();
  return `ST-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** Effective permission snapshot for an invite (owner overrides or role defaults). */
export function invitePermissions(role: StaffInviteRole, overrides?: readonly string[] | null): Permission[] {
  return [...resolvePermissions(role as Role, overrides)];
}

/**
 * Create a fresh 7-day single-use invite for an employee. Any previous
 * unused invite for the same employee is removed first so only the newest
 * link can be claimed.
 */
export async function createStaffInvite(args: {
  tenantId: string;
  employeeId: string;
  accessRole: StaffInviteRole;
  permissions?: readonly string[] | null;
  createdByUserId: string;
}): Promise<{ code: string; expiresAt: Date }> {
  await db
    .delete(staffInvites)
    .where(and(eq(staffInvites.employeeId, args.employeeId), isNull(staffInvites.usedAt)));

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);
  await db.insert(staffInvites).values({
    tenantId: args.tenantId,
    employeeId: args.employeeId,
    codeHash: hashInviteCode(code),
    accessRole: args.accessRole,
    permissions: invitePermissions(args.accessRole, args.permissions),
    expiresAt,
    createdByUserId: args.createdByUserId,
  });

  return { code, expiresAt };
}

export async function revokeStaffInvites(employeeId: string): Promise<void> {
  await db
    .delete(staffInvites)
    .where(and(eq(staffInvites.employeeId, employeeId), isNull(staffInvites.usedAt)));
}

/** Latest unused, unexpired invite for an employee (used by the team list). */
export async function getActiveStaffInvite(employeeId: string) {
  const [row] = await db
    .select({
      id: staffInvites.id,
      accessRole: staffInvites.accessRole,
      expiresAt: staffInvites.expiresAt,
    })
    .from(staffInvites)
    .where(
      and(
        eq(staffInvites.employeeId, employeeId),
        isNull(staffInvites.usedAt),
        // expiresAt > now()
      )
    )
    .orderBy(desc(staffInvites.createdAt))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/** Public invite details for the join page. Never returns the hash. */
export async function getStaffInvitePreview(code: string) {
  const codeHash = hashInviteCode(code);
  const [row] = await db
    .select({
      id: staffInvites.id,
      tenantId: staffInvites.tenantId,
      employeeId: staffInvites.employeeId,
      accessRole: staffInvites.accessRole,
      expiresAt: staffInvites.expiresAt,
      usedAt: staffInvites.usedAt,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeDisplayName: employees.displayName,
      employeeRole: employees.role,
      tenantName: tenants.businessName,
      tenantSlug: tenants.slug,
    })
    .from(staffInvites)
    .innerJoin(employees, eq(employees.id, staffInvites.employeeId))
    .innerJoin(tenants, eq(tenants.id, staffInvites.tenantId))
    .where(eq(staffInvites.codeHash, codeHash))
    .limit(1);

  if (!row) return null;
  if (row.usedAt) return { ...row, state: "used" as const };
  if (row.expiresAt.getTime() <= Date.now()) return { ...row, state: "expired" as const };
  return { ...row, state: "valid" as const };
}

/**
 * Redeem an invite for the authenticated Clerk user. Idempotent: claiming
 * the same invite twice with the same account succeeds and returns the same
 * destination. Existing client accounts are upgraded in place; an owner
 * membership is never downgraded.
 */
export async function claimStaffInvite(userId: string, rawCode: string) {
  const code = rawCode?.trim();
  if (!code) throw new ValidationAppError("Enter your invite code");
  const codeHash = hashInviteCode(code);

  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(staffInvites)
      .where(eq(staffInvites.codeHash, codeHash))
      .limit(1);
    if (!invite) throw new NotFoundError("This invite code is not valid");

    const [tenant] = await tx
      .select({ id: tenants.id, slug: tenants.slug, businessName: tenants.businessName })
      .from(tenants)
      .where(eq(tenants.id, invite.tenantId))
      .limit(1);
    if (!tenant) throw new NotFoundError("Store not found");

    // Idempotent replay by the same account.
    if (invite.usedAt) {
      if (invite.usedByUserId !== userId) {
        throw new ConflictError("This invite has already been used");
      }
      const [mine] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, invite.tenantId)))
        .limit(1);
      return { tenant, role: (mine?.role ?? invite.accessRole) as Role };
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new ValidationAppError("This invite has expired — ask your manager for a new link");
    }

    const [employee] = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.id, invite.employeeId), eq(employees.tenantId, invite.tenantId)))
      .limit(1);
    if (!employee) throw new NotFoundError("This team member no longer exists");
    if (!employee.active) throw new ForbiddenError("This team member is inactive");
    if (employee.userId && employee.userId !== userId) {
      throw new ConflictError("This team member already has a linked account");
    }

    const [existing] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, invite.tenantId)))
      .limit(1);

    let role = invite.accessRole as Role;
    if (existing?.role === "owner") {
      // Never downgrade the store owner if they redeem a staff link.
      role = "owner";
    } else if (existing) {
      await tx
        .update(memberships)
        .set({
          role: invite.accessRole as Role,
          permissions: invite.permissions ?? invitePermissions(invite.accessRole as StaffInviteRole),
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, existing.id));
    } else {
      await tx.insert(memberships).values({
        tenantId: invite.tenantId,
        userId,
        role: invite.accessRole as Role,
        permissions: invite.permissions ?? invitePermissions(invite.accessRole as StaffInviteRole),
        active: true,
      });
    }

    await tx
      .update(employees)
      .set({
        userId,
        accessRole: invite.accessRole as Role,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));

    await tx
      .update(staffInvites)
      .set({ usedAt: new Date(), usedByUserId: userId, updatedAt: new Date() })
      .where(eq(staffInvites.id, invite.id));

    return { tenant, role };
  });
}

/** The active employee row linked to a signed-in staff user in a tenant. */
export async function getStaffEmployee(ctx: TenantContext) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, ctx.tenantId),
        eq(employees.userId, ctx.userId),
        eq(employees.active, true)
      )
    )
    .limit(1);
  return employee ?? null;
}

/** The membership role for a user in a tenant (used by staff routing). */
export async function getMembershipRole(userId: string, tenantId: string) {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.tenantId, tenantId),
        eq(memberships.active, true)
      )
    )
    .limit(1);
  return row?.role ?? null;
}

/** Explicit permission array for a membership (null = role defaults). */
export async function setMembershipPermissions(
  userId: string,
  tenantId: string,
  permissions: string[] | null
) {
  await db
    .update(memberships)
    .set({ permissions, updatedAt: new Date() })
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
}
