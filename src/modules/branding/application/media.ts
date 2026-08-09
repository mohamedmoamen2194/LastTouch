import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";

async function getTenant(ctx: TenantContext) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return tenant;
}

/** Replace the store logo with a Blob URL (null clears it). Returns the previous logo URL. */
export async function setTenantLogo(ctx: TenantContext, url: string | null) {
  assertPermission(ctx, Permission["branding.manage"]);
  const tenant = await getTenant(ctx);
  await db
    .update(tenants)
    .set({ logoUrl: url, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));
  return tenant.logoUrl;
}

/** Append a shop image Blob URL to the tenant gallery. Returns the new list. */
export async function addTenantImage(ctx: TenantContext, url: string) {
  assertPermission(ctx, Permission["gallery.manage"]);
  const tenant = await getTenant(ctx);
  const images = tenant.shopImages ?? [];
  const next = images.includes(url) ? images : [...images, url];
  await db
    .update(tenants)
    .set({ shopImages: next, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));
  return next;
}

/** Remove a shop image URL from the gallery. Returns the new list. */
export async function removeTenantImage(ctx: TenantContext, url: string) {
  assertPermission(ctx, Permission["gallery.manage"]);
  const tenant = await getTenant(ctx);
  const next = (tenant.shopImages ?? []).filter((u) => u !== url);
  await db
    .update(tenants)
    .set({ shopImages: next, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));
  return next;
}