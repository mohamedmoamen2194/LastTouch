import type { BusinessType, Role, SubscriptionPlan, ThemeName } from "@/db/schema";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { hasPermission, type Permission } from "@/lib/permissions";
import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * TenantContext — created once per authenticated request and reused
 * through the entire request lifecycle (spec section 10).
 */
export type TenantContext = {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: Role;
  slug: string;
  businessName: string;
  businessType: BusinessType;
  theme: ThemeName;
  subscriptionPlan: SubscriptionPlan;
  enabledFeatures: Set<string>;
};

/**
 * Resolves a tenant by slug (public booking context).
 * Never falls back to another tenant. Returns null if not found/inactive.
 */
export async function resolveTenantBySlug(slug: string) {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.active, true)))
    .limit(1);
  return tenant ?? null;
}

/**
 * Builds the authenticated TenantContext for a user within a tenant.
 * Enforces tenant membership on the server (spec section 37).
 */
export async function getTenantContext(args: {
  userId: string;
  tenantId?: string;
  slug?: string;
}): Promise<TenantContext> {
  if (!args.userId) throw new UnauthorizedError();

  let tenantId = args.tenantId;

  // Resolve by slug when only the slug is available (public route → dashboard nav).
  if (!tenantId && args.slug) {
    const tenant = await resolveTenantBySlug(args.slug);
    if (!tenant) throw new ForbiddenError("Tenant not found");
    tenantId = tenant.id;
  }

  if (!tenantId) throw new ForbiddenError("Tenant context missing");

  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.userId, args.userId),
        eq(memberships.active, true)
      )
    )
    .limit(1);

  if (!membership) throw new ForbiddenError("You are not a member of this business");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant || !tenant.active) throw new ForbiddenError("This business is unavailable");

  return {
    tenantId: tenant.id,
    userId: args.userId,
    membershipId: membership.id,
    role: membership.role,
    slug: tenant.slug,
    businessName: tenant.businessName,
    businessType: tenant.businessType,
    theme: tenant.theme,
    subscriptionPlan: tenant.subscriptionPlan,
    enabledFeatures: new Set(featuresForPlan(tenant.subscriptionPlan)),
  };
}

/**
 * Authorization guard. Call inside services/route handlers:
 *   assertPermission(ctx, Permission.customersRead);
 */
export function assertPermission(ctx: Pick<TenantContext, "role">, permission: Permission) {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/** Feature flags controlled by subscription (spec section 13). */
const FEATURES_BY_PLAN: Record<SubscriptionPlan, string[]> = {
  free: ["booking", "appointments.basic", "customers.list", "dashboard.basic"],
  pro: [
    "booking",
    "customers",
    "crm",
    "employees",
    "gallery",
    "reviews",
    "analytics",
    "exports",
    "whatsapp",
    "promotions",
    "branding.advanced",
  ],
  ai: [
    "booking",
    "customers",
    "crm",
    "employees",
    "gallery",
    "reviews",
    "analytics",
    "exports",
    "whatsapp",
    "promotions",
    "branding.advanced",
    "ai_receptionist",
    "ai_assistant",
    "ai_insights",
    "ai_customer_summaries",
    "ai_marketing",
    "ai_review_replies",
    "ai_campaigns",
    "ai_faq",
  ],
  enterprise: [
    "booking",
    "customers",
    "crm",
    "employees",
    "gallery",
    "reviews",
    "analytics",
    "exports",
    "whatsapp",
    "promotions",
    "branding.advanced",
    "ai_receptionist",
    "ai_assistant",
    "ai_insights",
    "custom_domain",
    "multi_location",
    "marketplace",
    "loyalty",
    "coupons",
    "marketing",
  ],
};

export function featuresForPlan(plan: SubscriptionPlan): string[] {
  return FEATURES_BY_PLAN[plan] ?? FEATURES_BY_PLAN.free;
}

export function hasFeature(ctx: Pick<TenantContext, "enabledFeatures">, feature: string): boolean {
  return ctx.enabledFeatures.has(feature);
}

export function assertFeature(ctx: Pick<TenantContext, "enabledFeatures">, feature: string) {
  if (!hasFeature(ctx, feature)) {
    throw new ForbiddenError(`Feature "${feature}" is not enabled for this subscription`);
  }
}