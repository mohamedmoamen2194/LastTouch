import { getTenantContext, type TenantContext } from "@/lib/tenant/context";
import { requireUserId } from "@/lib/auth/session";

/**
 * Resolves the dashboard tenant context for the given slug using the real,
 * signed-in Clerk user. Enforces tenant membership on the server.
 *
 * Throws `UnauthorizedError` when no user is signed in (layouts redirect to
 * the sign-in page) and `ForbiddenError` when the user is not a member of the
 * requested tenant.
 */
export async function getDashboardAccess(slug: string): Promise<TenantContext> {
  const userId = await requireUserId();
  return getTenantContext({ userId, slug });
}