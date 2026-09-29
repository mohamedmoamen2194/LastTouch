import { cookies } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { requireUserId } from "@/lib/auth/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { PLATFORM_COOKIE, getPlatformEmail, readPlatformSession } from "@/lib/platform/session";

/**
 * Platform (super-admin) gate — account-based.
 *
 * Only Clerk accounts listed in PLATFORM_ADMIN_EMAILS (or user ids in
 * PLATFORM_ADMIN_USER_IDS) can open /[locale]/platform and call
 * /api/platform/*. Everyone else gets 404 (pages) / 403 (API), so the
 * panel's existence isn't leaked to non-admins.
 */

export function getAdminEmails(): string[] {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // The password-gate email is an admin by definition, so a normal
  // Clerk sign-in with the same address is also an admin sign-in.
  // (Keeps a single source of truth: PLATFORM_ADMIN_EMAIL.)
  const single = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  if (single && !list.includes(single)) list.push(single);
  return list;
}

export function getAdminUserIds(): string[] {
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function checkAdmin(userId: string): Promise<{ userId: string; email: string | null }> {
  // Hard-coded user id allowlist always wins (works even if email changes).
  if (getAdminUserIds().includes(userId)) return { userId, email: null };

  const allowlist = getAdminEmails();
  if (allowlist.length === 0) {
    throw new ForbiddenError("Admin access is not configured");
  }

  let userEmails: string[] = [];
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    userEmails = (user.emailAddresses ?? []).map((e) => e.emailAddress.toLowerCase());
  } catch {
    throw new ForbiddenError("Not authorized");
  }

  const match = userEmails.find((e) => allowlist.includes(e));
  if (!match) throw new ForbiddenError("Not authorized");
  return { userId, email: match };
}

/** True when the request carries a valid platform password session. */
export async function hasPlatformSession(): Promise<boolean> {
  try {
    const jar = await cookies();
    return readPlatformSession(jar.get(PLATFORM_COOKIE)?.value);
  } catch {
    return false;
  }
}

/** Non-throwing admin check for post-login routing. */
export async function isPlatformAdminByUserId(userId: string): Promise<boolean> {
  try {
    await checkAdmin(userId);
    return true;
  } catch {
    return false;
  }
}

/** Page/layout guard. Password session first, Clerk allowlist second. */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string | null }> {
  if (await hasPlatformSession()) {
    return { userId: "platform-password", email: getPlatformEmail() };
  }
  const userId = await requireUserId().catch(() => {
    throw new UnauthorizedError("Sign in to access the admin panel");
  });
  return checkAdmin(userId);
}

/** API guard: same check for /api/platform/* route handlers. */
export async function assertPlatformApi(): Promise<string> {
  if (await hasPlatformSession()) return "platform-password";
  const userId = await requireUserId().catch(() => {
    throw new UnauthorizedError("Sign in required");
  });
  const admin = await checkAdmin(userId);
  return admin.userId;
}
