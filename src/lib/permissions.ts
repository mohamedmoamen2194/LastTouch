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
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",
  "employees.read",
  "employees.manage",
  "services.read",
  "services.manage",
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
    Permission["customers.read"],
    Permission["customers.create"],
    Permission["customers.update"],
    Permission["employees.read"],
    Permission["employees.manage"],
    Permission["services.read"],
    Permission["services.manage"],
    Permission["analytics.read"],
    Permission["reviews.read"],
    Permission["reviews.manage"],
  ]),
  employee: new Set<Permission>([
    Permission["appointments.read"],
    Permission["appointments.update"],
    Permission["customers.read"],
    Permission["customers.update"],
  ]),
  customer: new Set<Permission>([Permission["appointments.create"]]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Business "owner-like" roles that manage billing + subscription. */
export function canManageBilling(role: Role): boolean {
  return role === "owner";
}

/** Employees cannot touch tenant settings. */
export function canEditSettings(role: Role): boolean {
  return role === "owner";
}