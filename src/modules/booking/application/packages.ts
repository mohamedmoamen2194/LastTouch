import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { packages, packageServices, services } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";
import { listTenantServicesForAdmin } from "@/modules/booking/domain/catalog";

export type PackageInput = {
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  price: number | string;
  active?: boolean;
  serviceIds?: string[];
};

export type ManagedPackage = {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  price: string;
  active: boolean;
  serviceIds: string[];
};

/** List a tenant's packages, enriched with their linked service ids. */
export async function listTenantPackages(ctx: TenantContext): Promise<ManagedPackage[]> {
  const rows = await db
    .select()
    .from(packages)
    .where(eq(packages.tenantId, ctx.tenantId))
    .orderBy(packages.name);

  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.id);
  const links = await db
    .select()
    .from(packageServices)
    .where(inArray(packageServices.packageId, ids));

  const byPackage = new Map<string, string[]>();
  for (const l of links) {
    byPackage.set(l.packageId, [...(byPackage.get(l.packageId) ?? []), l.serviceId]);
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    nameAr: p.nameAr ?? null,
    description: p.description ?? null,
    descriptionAr: p.descriptionAr ?? null,
    price: String(p.price),
    active: p.active,
    serviceIds: byPackage.get(p.id) ?? [],
  }));
}

/** Validates every serviceId belongs to the tenant; returns deduped ids. */
async function validateServiceIds(ctx: TenantContext, serviceIds?: string[]): Promise<string[]> {
  if (!serviceIds || serviceIds.length === 0) return [];
  const catalog = await listTenantServicesForAdmin(ctx.tenantId);
  const owned = new Set(catalog.map((s) => s.id));
  return [...new Set(serviceIds)].filter((id) => owned.has(id));
}

/** Create a package and link its services. */
export async function createPackage(ctx: TenantContext, input: PackageInput) {
  assertPermission(ctx, Permission["services.manage"]);

  const [created] = await db
    .insert(packages)
    .values({
      tenantId: ctx.tenantId,
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || null,
      description: input.description?.trim() || null,
      descriptionAr: input.descriptionAr?.trim() || null,
      price: String(input.price),
      active: input.active ?? true,
    })
    .returning();

  const serviceIds = await validateServiceIds(ctx, input.serviceIds);
  if (serviceIds.length > 0) {
    await db.insert(packageServices).values(
      serviceIds.map((serviceId, idx) => ({ packageId: created.id, serviceId, sortOrder: idx }))
    );
  }

  return created;
}

/** Update a package owned by the tenant and resync its linked services. */
export async function updatePackage(ctx: TenantContext, id: string, input: PackageInput) {
  assertPermission(ctx, Permission["services.manage"]);

  const [existing] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, id), eq(packages.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Package not found");

  const [updated] = await db
    .update(packages)
    .set({
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || null,
      description: input.description?.trim() || null,
      descriptionAr: input.descriptionAr?.trim() || null,
      price: String(input.price),
      active: input.active ?? existing.active,
      updatedAt: new Date(),
    })
    .where(eq(packages.id, id))
    .returning();

  if (input.serviceIds) {
    const serviceIds = await validateServiceIds(ctx, input.serviceIds);
    await db.delete(packageServices).where(eq(packageServices.packageId, id));
    if (serviceIds.length > 0) {
      await db.insert(packageServices).values(
        serviceIds.map((serviceId, idx) => ({ packageId: id, serviceId, sortOrder: idx }))
      );
    }
  }

  return updated;
}

/** Soft-delete a package by marking it inactive. */
export async function deletePackage(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["services.manage"]);

  const [existing] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, id), eq(packages.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Package not found");

  const [updated] = await db
    .update(packages)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(packages.id, id))
    .returning();

  return updated;
}

export function validatePackageInput(input: unknown): PackageInput {
  const v = input as Partial<PackageInput> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid package payload");

  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name) throw new ValidationAppError("Package name is required");
  if (name.length > 200) throw new ValidationAppError("Package name is too long");

  const price = Number(v.price);
  if (!Number.isFinite(price) || price < 0) throw new ValidationAppError("Price must be a positive number");

  const nameAr = typeof v.nameAr === "string" ? v.nameAr.trim() : "";
  const description = typeof v.description === "string" ? v.description.trim() : "";
  const descriptionAr = typeof v.descriptionAr === "string" ? v.descriptionAr.trim() : "";

  const serviceIds = Array.isArray(v.serviceIds)
    ? v.serviceIds.filter((s): s is string => typeof s === "string" && Boolean(s))
    : [];

  return {
    name,
    nameAr: nameAr || null,
    description: description || null,
    descriptionAr: descriptionAr || null,
    price,
    active: typeof v.active === "boolean" ? v.active : true,
    serviceIds,
  };
}

export type PublicPackage = {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  price: string;
  serviceIds: string[];
  serviceNames: string[];
};

/**
 * List active packages for the public booking page, enriched with the linked
 * active services (names + ids). Packages with no active services are omitted.
 */
export async function listActivePackagesForBooking(tenantId: string): Promise<PublicPackage[]> {
  const rows = await db
    .select()
    .from(packages)
    .where(and(eq(packages.tenantId, tenantId), eq(packages.active, true)))
    .orderBy(packages.name);

  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.id);
  const links = await db
    .select()
    .from(packageServices)
    .where(inArray(packageServices.packageId, ids))
    .orderBy(packageServices.sortOrder);

  const byPackage = new Map<string, string[]>();
  for (const l of links) {
    byPackage.set(l.packageId, [...(byPackage.get(l.packageId) ?? []), l.serviceId]);
  }

  const allServiceIds = [...new Set(links.map((l) => l.serviceId))];
  const serviceRows = allServiceIds.length
    ? await db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(and(inArray(services.id, allServiceIds), eq(services.tenantId, tenantId), eq(services.active, true)))
    : [];
  const nameById = new Map(serviceRows.map((s) => [s.id, s.name]));

  return rows
    .map((p) => {
      const serviceIds = (byPackage.get(p.id) ?? []).filter((id) => nameById.has(id));
      return {
        id: p.id,
        name: p.name,
        nameAr: p.nameAr ?? null,
        description: p.description ?? null,
        descriptionAr: p.descriptionAr ?? null,
        price: String(p.price),
        serviceIds,
        serviceNames: serviceIds.map((id) => nameById.get(id) ?? ""),
      };
    })
    .filter((p) => p.serviceIds.length > 0);
}

/**
 * Resolves a package's services for booking (public context). Verifies the
 * package belongs to the tenant, is active, and returns its active services.
 * Throws when the package has no active services.
 */
export async function resolvePackageForBooking(tenantId: string, packageId: string) {
  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.tenantId, tenantId)))
    .limit(1);
  if (!pkg || !pkg.active) throw new NotFoundError("Package not found");

  const links = await db
    .select()
    .from(packageServices)
    .where(eq(packageServices.packageId, pkg.id))
    .orderBy(packageServices.sortOrder);

  const serviceRows = links.length
    ? await db
        .select()
        .from(services)
        .where(
          and(
            inArray(services.id, links.map((l) => l.serviceId)),
            eq(services.tenantId, tenantId),
            eq(services.active, true)
          )
        )
    : [];

  if (serviceRows.length === 0) {
    throw new ConflictError("This package has no active services");
  }

  return {
    package: pkg,
    services: serviceRows,
  };
}