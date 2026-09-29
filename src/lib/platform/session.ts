import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const PLATFORM_COOKIE = "platform_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Password gate for /platform (owner-only, no Clerk account needed).
 *
 * Env:
 *   PLATFORM_ADMIN_EMAIL          — shown + enforced on the login form
 *   PLATFORM_ADMIN_PASSWORD_HASH  — scrypt hash (see scripts/make-platform-password.ts)
 *   PLATFORM_SESSION_SECRET       — signs the session cookie
 */

export function getPlatformEmail(): string | null {
  const e = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  return e || null;
}

function getSessionSecret(): string | null {
  const s = process.env.PLATFORM_SESSION_SECRET?.trim();
  return s || null;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

/** Verify a password attempt against PLATFORM_ADMIN_PASSWORD_HASH. */
export async function verifyPlatformPassword(attempt: string): Promise<boolean> {
  const expected = process.env.PLATFORM_ADMIN_PASSWORD_HASH?.trim();
  if (!expected || !attempt) return false; // never accept when unconfigured
  // NOTE: the hash uses `:` separators (NOT `$`) because Next.js expands
  // `$VAR`-style references when loading .env files, which would corrupt
  // the stored value.
  const parts = expected.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  try {
    const derived = scryptSync(attempt, b64urlDecode(saltB64), 64, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: 64 * 1024 * 1024,
    });
    const want = b64urlDecode(hashB64);
    if (derived.length !== want.length) return false;
    return timingSafeEqual(derived, want);
  } catch {
    return false;
  }
}

/** Mint a signed session token (payload.exp in ms). */
export function mintPlatformSession(now = Date.now()): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const payload = b64urlEncode(Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS })));
  const sig = b64urlEncode(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Validate a session token from the cookie. */
export function readPlatformSession(token: string | null | undefined): boolean {
  const secret = getSessionSecret();
  if (!secret || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const want = b64urlEncode(createHmac("sha256", secret).update(payload).digest());
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  } catch {
    return false;
  }
  try {
    const { exp } = JSON.parse(b64urlDecode(payload).toString("utf8")) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
