import { z } from "zod";

export const phoneSchema = z
  .string()
  .min(10, "Phone number is invalid")
  .max(25, "Phone number is invalid")
  .regex(/^[+0-9 ()-]{10,25}$/, "Enter a valid phone number");

export const nullablePhoneSchema = z
  .union([z.string().min(5), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

export const emailSchema = z.string().email().optional().or(z.literal(""));

export const idSchema = z.string().uuid();

export const localeSchema = z.enum(["en", "ar"]);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().optional(),
});

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Parses a Zod error into a friendly field/issue list. */
export type ValidationError = { path: string; message: string };

export function parseZodError(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function isLocale(value: unknown): value is "en" | "ar" {
  return value === "en" || value === "ar";
}