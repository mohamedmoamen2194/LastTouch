import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/errors";

/** True when Clerk is configured (both keys present). */
export function isClerkConfigured(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    Boolean(process.env.CLERK_SECRET_KEY)
  );
}

/**
 * Returns the current Clerk user id, throwing if unauthenticated.
 * Server-only.
 */
export async function requireUserId(): Promise<string> {
  if (!isClerkConfigured()) throw new UnauthorizedError("Authentication is not configured");
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

/**
 * Returns the current Clerk user id, or null when unauthenticated or when
 * Clerk isn't configured yet. Server-only. Use in public/optional routes.
 */
export async function getOptionalUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;
  const { userId } = await auth();
  return userId ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getOptionalUserId()) !== null;
}