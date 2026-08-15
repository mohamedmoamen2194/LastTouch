import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { NotFoundError, ValidationAppError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";

export type ServiceInput = {
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  price: number | string;
  durationMinutes: number;
  active?: boolean;
};

/** Create a new service for the tenant. */
export async function createService(ctx: TenantContext, input: ServiceInput) {
  assertPermission(ctx, Permission["services.manage"]);

  const [created] = await db
    .insert(services)
    .values({
      tenantId: ctx.tenantId,
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || null,
      description: input.description?.trim() || null,
      descriptionAr: input.descriptionAr?.trim() || null,
      price: String(input.price),
      durationMinutes: input.durationMinutes,
      active: input.active ?? true,
    })
    .returning();

  return created;
}

/** Update an existing service owned by the tenant. */
export async function updateService(ctx: TenantContext, id: string, input: ServiceInput) {
  assertPermission(ctx, Permission["services.manage"]);

  const [existing] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Service not found");

  const [updated] = await db
    .update(services)
    .set({
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || null,
      description: input.description?.trim() || null,
      descriptionAr: input.descriptionAr?.trim() || null,
      price: String(input.price),
      durationMinutes: input.durationMinutes,
      active: input.active ?? existing.active,
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  return updated;
}

/** Soft-delete a service by marking it inactive. */
export async function deleteService(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["services.manage"]);

  const [existing] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Service not found");

  const [updated] = await db
    .update(services)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(services.id, id))
    .returning();

  return updated;
}

export function validateServiceInput(input: unknown): ServiceInput {
  const v = input as Partial<ServiceInput> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid service payload");

  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name) throw new ValidationAppError("Service name is required");
  if (name.length > 200) throw new ValidationAppError("Service name is too long");

  const price = Number(v.price);
  if (!Number.isFinite(price) || price < 0) throw new ValidationAppError("Price must be a positive number");

  const durationMinutes = Number(v.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) {
    throw new ValidationAppError("Duration must be between 5 and 600 minutes");
  }

  const description = typeof v.description === "string" ? v.description.trim() : "";
  const nameAr = typeof v.nameAr === "string" ? v.nameAr.trim() : "";
  const descriptionAr = typeof v.descriptionAr === "string" ? v.descriptionAr.trim() : "";

  return {
    name,
    nameAr: nameAr || null,
    description: description || null,
    descriptionAr: descriptionAr || null,
    price,
    durationMinutes,
    active: typeof v.active === "boolean" ? v.active : true,
  };
}