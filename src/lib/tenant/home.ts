import { db } from "@/db";
import { memberships, tenants, type Role } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type TenantHome = { slug: string; role: Role };

/** Landing path for a member, based on their role in the tenant. */
export function tenantHomePath(locale: string, slug: string, role: Role | string): string {
  if (role === "cashier") return `/${locale}/desk/${slug}`;
  if (role === "employee") return `/${locale}/worker/${slug}`;
  if (role === "customer") return `/${locale}`;
  return `/${locale}/${slug}/dashboard`;
}

/** First active tenant + role for a signed-in user. */
export async function getUserFirstTenant(userId: string): Promise<TenantHome | null> {
  const rows = await db
    .select({ slug: tenants.slug, role: memberships.role })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true), eq(tenants.active, true)))
    .orderBy(memberships.createdAt)
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Returns the slug of the user's first active tenant, or null when the user
 * hasn't onboarded yet. Kept for callers that only need the slug.
 */
export async function getUserFirstTenantSlug(userId: string): Promise<string | null> {
  const home = await getUserFirstTenant(userId);
  return home?.slug ?? null;
}
