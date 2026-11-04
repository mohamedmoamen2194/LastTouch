import type { Role } from "@/db/schema";

/**
 * Granular permissions (spec section 15). Extensible for custom roles.
 * Never rely solely on role names — always check permissions.
 */
export const PERMISSION_LIST = [
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.delete",
  "appointments.confirm",
  "appointments.complete",
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",
  "employees.read",
  "employees.manage",
  "services.read",
  "services.manage",
  "inventory.read",
  "inventory.manage",
  "sales.read",
  "sales.create",
  "attendance.use",
  "attendance.read",
  "attendance.request",
  "attendance.manage",
  "billing.read",
  "billing.manage",
  "analytics.read",
  "settings.update",
  "ai.use",
  "branding.manage",
  "tenant.delete",
  "subscription.manage",
  "ownership.transfer",
  "reviews.read",
  "reviews.manage",
  "gallery.manage",
  "exports.create",
  "marketing.manage",
] as const;

export type Permission = (typeof PERMISSION_LIST)[number];

export const Permission: Record<Permission, Permission> = Object.fromEntries(
  PERMISSION_LIST.map((p) => [p, p])
) as Record<Permission, Permission>;

/**
 * Role -> permissions mapping. Grants are additive; future custom roles
 * extend the same shape.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSION_LIST),
  manager: new Set<Permission>([
    Permission["appointments.read"],
    Permission["appointments.create"],
    Permission["appointments.update"],
    Permission["appointments.delete"],
    Permission["appointments.confirm"],
    Permission["appointments.complete"],
    Permission["customers.read"],
    Permission["customers.create"],
    Permission["customers.update"],
    Permission["employees.read"],
    Permission["employees.manage"],
    Permission["services.read"],
    Permission["services.manage"],
    Permission["inventory.read"],
    Permission["inventory.manage"],
    Permission["sales.read"],
    Permission["sales.create"],
    Permission["attendance.use"],
    Permission["attendance.read"],
    Permission["attendance.request"],
    Permission["attendance.manage"],
    Permission["analytics.read"],
    Permission["reviews.read"],
    Permission["reviews.manage"],
  ]),
  cashier: new Set<Permission>([
    Permission["appointments.read"],
    Permission["appointments.create"],
    Permission["appointments.update"],
    Permission["appointments.confirm"],
    Permission["appointments.complete"],
    Permission["customers.read"],
    Permission["customers.create"],
    Permission["customers.update"],
    Permission["services.read"],
    Permission["inventory.read"],
    Permission["sales.read"],
    Permission["sales.create"],
    Permission["reviews.read"],
    Permission["attendance.use"],
    Permission["attendance.read"],
    Permission["attendance.request"],
  ]),
  employee: new Set<Permission>([
    Permission["appointments.read"],
    Permission["appointments.update"],
    Permission["appointments.confirm"],
    Permission["appointments.complete"],
    Permission["customers.read"],
    Permission["customers.update"],
    Permission["services.read"],
    Permission["inventory.read"],
    Permission["attendance.use"],
    Permission["attendance.read"],
    Permission["attendance.request"],
  ]),
  customer: new Set<Permission>([Permission["appointments.create"]]),
};

/**
 * Resolve the effective permissions for a membership.
 * - Owners always have everything.
 * - An explicit array (even empty) overrides the role defaults.
 * - NULL/undefined falls back to the role defaults.
 */
export function resolvePermissions(
  role: Role,
  overrides?: readonly string[] | null
): Set<Permission> {
  if (role === "owner") return new Set(PERMISSION_LIST);
  if (Array.isArray(overrides)) {
    const valid = new Set<Permission>(PERMISSION_LIST);
    return new Set(
      overrides.filter((p): p is Permission => valid.has(p as Permission))
    );
  }
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function hasPermission(
  role: Role,
  permission: Permission,
  overrides?: readonly string[] | null
): boolean {
  return resolvePermissions(role, overrides).has(permission);
}

/** Business "owner-like" roles that manage billing + subscription. */
export function canManageBilling(role: Role): boolean {
  return role === "owner";
}

/** Employees cannot touch tenant settings. */
export function canEditSettings(role: Role): boolean {
  return role === "owner";
}