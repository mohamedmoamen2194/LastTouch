import { db } from "@/db";
import {
  employees,
  memberships,
  serviceCategories,
  services,
  subscriptions,
  tenants,
  type BusinessType,
  type ThemeName,
} from "@/db/schema";
import { getBusinessTypeConfig } from "@/config/business-types";
import { slugify } from "@/lib/utils";
import { ConflictError, ValidationAppError } from "@/lib/errors";
import { eq } from "drizzle-orm";

export type CreateTenantInput = {
  userId: string;
  organizationId?: string;
  businessName: string;
  businessType: BusinessType;
  theme?: ThemeName;
  employeeLabel?: string;
  slug?: string;
  tagline?: string;
  phone?: string;
  currency?: string;
};

/**
 * Creates a tenant plus its seed catalog (categories, services, one employee)
 * and an owner membership (spec section 10). Single entrypoint for onboarding.
 */
export async function createTenant(input: CreateTenantInput) {
  const name = input.businessName?.trim();
  if (!name) throw new ValidationAppError("Business name is required");

  const biz = getBusinessTypeConfig(input.businessType);
  const slug = input.slug?.trim()
    ? slugify(input.slug)
    : `${slugify(name)}-${Math.floor(Math.random() * 1000)}`;

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing) throw new ConflictError("That store address is already taken");

  const [tenant] = await db
    .insert(tenants)
    .values({
      organizationId: input.organizationId ?? null,
      slug,
      businessName: name,
      businessType: input.businessType,
      subscriptionPlan: "free",
      theme: input.theme ?? biz.theme,
      employeeLabel: input.employeeLabel ?? biz.employeeLabel,
      tagline: biz.label,
      phone: input.phone ?? null,
      currency: input.currency ?? "EGP",
    })
    .returning();

  await db.insert(memberships).values({
    tenantId: tenant.id,
    userId: input.userId,
    role: "owner",
    active: true,
  });

  // Default free subscription so the plan + renewal dates are always defined.
  await db.insert(subscriptions).values({
    tenantId: tenant.id,
    plan: "free",
    status: "active",
    renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const catRows = await db
    .insert(serviceCategories)
    .values(biz.defaultCategories.map((c) => ({ tenantId: tenant.id, name: c.name, icon: c.icon })))
    .returning();
  const firstCat = catRows[0]?.id ?? null;

  await db.insert(services).values(
    biz.defaultServices.map((s) => ({
      tenantId: tenant.id,
      categoryId: firstCat,
      name: s.name,
      description: s.description ?? null,
      durationMinutes: s.durationMinutes,
      price: s.price,
    }))
  );

  // A single starter employee so booking is usable immediately.
  await db.insert(employees).values({
    tenantId: tenant.id,
    firstName: "Team",
    lastName: "Member",
    displayName: "Team Member",
  });

  return tenant;
}