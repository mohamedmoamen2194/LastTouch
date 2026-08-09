import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as the tenant's currency with proper locale. */
export function formatMoney(amount: number | string, currency = "EGP", locale = "en") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a duration in minutes to a human "2h 30m" string. */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? "s" : ""}`;
}

/** Generate a URL-safe slug from a string. */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Wrap an async handler so thrown AppErrors produce consistent JSON. */
export async function safeJson<T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: { message: string; status: number; code: string } | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return {
      data: null,
      error: {
        message: e.message ?? "Unexpected error",
        status: e.status ?? 500,
        code: e.code ?? "internal",
      },
    };
  }
}