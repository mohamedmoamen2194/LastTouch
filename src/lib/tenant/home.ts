import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns the slug of the user's first active tenant, or null when the user
 * hasn't onboarded yet. Used to send already-signed-in users to their
 * dashboard instead of bouncing them back through the auth pages.
 */
export async function getUserFirstTenantSlug(userId: string): Promise<string | null> {
  const rows = await db
    .select({ slug: tenants.slug })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true), eq(tenants.active, true)))
    .orderBy(memberships.createdAt)
    .limit(1);

  return rows[0]?.slug ?? null;
}