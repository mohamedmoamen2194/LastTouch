import { db } from "@/db";
import { employeeServices, employees, serviceCategories, services, tenants, workingHours } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";

/** Resolve a public tenant by slug (active only). */
export async function resolveTenantForBooking(slug: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant || !tenant.active) throw new NotFoundError("Business not found");
  return tenant;
}

/** List active employees of a tenant (public/booking view). */
export async function listTenantEmployees(tenantId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(employees.tenantId, tenantId), eq(employees.active, true))
    : eq(employees.tenantId, tenantId);
  return db
    .select()
    .from(employees)
    .where(where)
    .orderBy(employees.displayName);
}

/** Active employees with the services they are mapped to (for the booking widget). */
export async function listTenantEmployeesWithServices(tenantId: string): Promise<Array<typeof employees.$inferSelect & { serviceIds: string[] }>> {
  const staff = await listTenantEmployees(tenantId, true);
  if (staff.length === 0) return [];

  const links = await db
    .select()
    .from(employeeServices)
    .where(inArray(employeeServices.employeeId, staff.map((s) => s.id)));
  const byEmployee = new Map<string, string[]>();
  for (const l of links) {
    byEmployee.set(l.employeeId, [...(byEmployee.get(l.employeeId) ?? []), l.serviceId]);
  }

  return staff.map((e) => ({ ...e, serviceIds: byEmployee.get(e.id) ?? [] }));
}

/**
 * Active employees that may take the given services.
 * A worker qualifies if they are mapped to at least one of the requested
 * services OR they have no service mappings at all (general staff who take
 * any service). Used for "any available" unions and auto-assignment.
 */
export async function listEligibleEmployees(tenantId: string, serviceIds: string[]) {
  const staff = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.active, true)));

  if (serviceIds.length === 0) return staff;
  if (staff.length === 0) return staff;

  const links = await db
    .select()
    .from(employeeServices)
    .where(
      and(
        inArray(employeeServices.employeeId, staff.map((s) => s.id)),
        inArray(employeeServices.serviceId, serviceIds)
      )
    );
  const mapped = new Set(links.map((l) => l.employeeId));

  const allLinks = await db
    .select()
    .from(employeeServices)
    .where(inArray(employeeServices.employeeId, staff.map((s) => s.id)));
  const anyMapping = new Set(allLinks.map((l) => l.employeeId));

  return staff.filter((e) => mapped.has(e.id) || !anyMapping.has(e.id));
}

/** List active services of a tenant. */
export async function listTenantServices(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.active, true)))
    .orderBy(services.sortOrder, services.name);
}

/** List every service of a tenant (including inactive) for dashboard management. */
export async function listTenantServicesForAdmin(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(eq(services.tenantId, tenantId))
    .orderBy(services.sortOrder, services.name);
}

/**
 * Workers for the admin team page, enriched with their service links
 * and weekly working hours (needed to render/edit the availability editor).
 */
export async function listTenantTeam(tenantId: string) {
  const staff = await db
    .select()
    .from(employees)
    .where(eq(employees.tenantId, tenantId))
    .orderBy(employees.active, employees.displayName);

  if (staff.length === 0) return [];

  const ids = staff.map((e) => e.id);
  const [links, hours] = await Promise.all([
    db.select().from(employeeServices).where(inArray(employeeServices.employeeId, ids)),
    db.select().from(workingHours).where(inArray(workingHours.employeeId, ids)),
  ]);

  const linksByEmployee = new Map<string, string[]>();
  for (const l of links) {
    linksByEmployee.set(l.employeeId, [...(linksByEmployee.get(l.employeeId) ?? []), l.serviceId]);
  }
  const hoursByEmployee = new Map<string, { weekday: number; startTime: string; endTime: string }[]>();
  for (const h of hours) {
    hoursByEmployee.set(h.employeeId, [
      ...(hoursByEmployee.get(h.employeeId) ?? []),
      { weekday: h.weekday, startTime: h.startTime, endTime: h.endTime },
    ]);
  }

  return staff.map((e) => ({
    ...e,
    serviceIds: linksByEmployee.get(e.id) ?? [],
    workingHours: hoursByEmployee.get(e.id) ?? [],
  }));
}

/** List categories, with active services attached. */
export async function listTenantCatalog(tenantId: string) {
  const cats = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, tenantId))
    .orderBy(serviceCategories.sortOrder);
  const svc = await listTenantServices(tenantId);
  return cats.map((cat) => ({
    ...cat,
    services: svc.filter((s) => s.categoryId === cat.id),
  }));
}