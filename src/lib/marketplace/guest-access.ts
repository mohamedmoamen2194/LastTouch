import { createHmac, timingSafeEqual } from "node:crypto";

type GuestScope = "store" | "global";
type GuestPayload = {
  aid: string; // appointment id
  tid?: string; // tenant id (store scope)
  s: GuestScope;
  exp: number;
};

function secret() {
  return process.env.PLATFORM_SESSION_SECRET?.trim() || process.env.CLERK_SECRET_KEY?.trim() || null;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function mintGuestBookingToken(payload: Omit<GuestPayload, "exp">, ttlMs = 2 * 60 * 60 * 1000): string | null {
  const sec = secret();
  if (!sec) return null;
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = b64url(createHmac("sha256", sec).update(body).digest());
  return `${body}.${sig}`;
}

export function readGuestBookingToken(token: string | null | undefined): GuestPayload | null {
  const sec = secret();
  if (!sec || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = b64url(createHmac("sha256", sec).update(body).digest());
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(unb64url(body).toString("utf8")) as GuestPayload;
    if (!p?.aid || !p?.s || typeof p.exp !== "number" || p.exp <= Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
