import { RateLimitError } from "@/lib/errors";

/**
 * Minimal in-memory fixed-window rate limiter for public endpoints.
 *
 * NOTE: This is process-local state. On multi-instance/serverless
 * deployments each isolate keeps its own counter, so it bounds abuse
 * per instance but is not a global quota. Replace with a shared store
 * (Upstash Redis, Vercel KV, etc.) for production-grade enforcement.
 */
const WINDOW_MS = 60_000;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function prune() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
}

/**
 * Throws RateLimitError when `key` exceeds `limit` requests within the
 * sliding fixed window. Pass the client IP + route to build the key.
 */
export function rateLimit(key: string, limit: number) {
  if (limit <= 0) return;

  const now = Date.now();
  if (buckets.size > 10_000) prune();

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) throw new RateLimitError("Too many requests, please try again later");
}

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}