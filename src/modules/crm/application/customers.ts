import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/context";
import { Permission } from "@/lib/permissions";

export type ListCustomersArgs = {
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * List & search customers within a tenant (spec section 28).
 */
export async function listCustomers(ctx: TenantContext, args: ListCustomersArgs = {}) {
  assertPermission(ctx, Permission["customers.read"]);

  const conditions: SQL[] = [eq(customers.tenantId, ctx.tenantId)];
  if (args.search) {
    conditions.push(
      or(
        ilike(customers.firstName, `%${args.search}%`),
        ilike(customers.lastName, `%${args.search}%`),
        ilike(customers.phone, `%${args.search}%`),
        ilike(customers.email, `%${args.search}%`)
      )!
    );
  }

  return db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(desc(customers.visitCount))
    .limit(args.limit ?? 50)
    .offset(args.offset ?? 0);
}

export async function getCustomer(ctx: TenantContext, id: string) {
  assertPermission(ctx, Permission["customers.read"]);

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
    .limit(1);
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

export type UpdateCustomerInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  birthday?: string | null;
  gender?: string;
  notes?: string;
  marketingConsent?: boolean;
  emailConsent?: boolean;
  smsConsent?: boolean;
  whatsappConsent?: boolean;
  tags?: string[];
};

export async function updateCustomer(ctx: TenantContext, id: string, input: UpdateCustomerInput) {
  assertPermission(ctx, Permission["customers.update"]);

  const [existing] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new NotFoundError("Customer not found");

  const [updated] = await db
    .update(customers)
    .set({
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName === undefined ? existing.lastName : input.lastName,
      phone: input.phone === undefined ? existing.phone : input.phone,
      email: input.email === undefined ? existing.email : input.email,
      birthday: input.birthday === undefined ? existing.birthday : input.birthday ? new Date(input.birthday) : null,
      gender: input.gender === undefined ? existing.gender : input.gender,
      notes: input.notes === undefined ? existing.notes : input.notes,
      marketingConsent: input.marketingConsent ?? existing.marketingConsent,
      emailConsent: input.emailConsent ?? existing.emailConsent,
      smsConsent: input.smsConsent ?? existing.smsConsent,
      whatsappConsent: input.whatsappConsent ?? existing.whatsappConsent,
      tags: input.tags ?? existing.tags,
    })
    .where(eq(customers.id, id))
    .returning();

  return updated;
}