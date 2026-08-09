/**
 * Seed script — provisions demo tenants from the config layer so the
 * platform is testable before real onboarding exists.
 *
 * Usage: npm run db:seed
 * Requires DATABASE_URL (or a local Postgres on localhost:5432/lasttouch).
 * Idempotent: skips tenants whose slug already exists.
 */
import { db } from "@/db";
import {
  employees,
  employeeServices,
  memberships,
  organizations,
  serviceCategories,
  services,
  tenants,
  workingHours,
} from "@/db/schema";
import { getBusinessTypeConfig } from "@/config/business-types";
import { eq } from "drizzle-orm";

const OWNER_USER_ID = process.env.SEED_OWNER_USER_ID ?? "demo-owner";

const DEMO_TENANTS = [
  {
    slug: "the-cut-lab",
    businessName: "The Cut Lab",
    businessType: "barber_shop" as const,
    tagline: "Precision grooming for the modern gentleman.",
    description: "Precision grooming for the modern gentleman. Experience unmatched technical skill in a refined, minimalist environment.",
    phone: "+20 100 000 0000",
    email: "hello@thecutlab.example",
    employees: [
      { firstName: "Ahmed", lastName: "M.", yearsExperience: 8 },
      { firstName: "Omar", lastName: "K.", yearsExperience: 5 },
    ],
  },
  {
    slug: "luxe-studio",
    businessName: "Luxe Studio",
    businessType: "hair_salon" as const,
    tagline: "Soft, radiant hair artistry.",
    description: "Soft, radiant hair artistry. Personalized color, cuts and treatments in a serene, premium studio.",
    phone: "+20 100 000 0001",
    email: "hello@luxestudio.example",
    employees: [
      { firstName: "Sara", lastName: "L.", yearsExperience: 10 },
      { firstName: "Mona", lastName: "R.", yearsExperience: 6 },
    ],
  },
];

async function main() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "LastTouch Demo", slug: "lasttouch-demo", ownerUserId: OWNER_USER_ID })
    .onConflictDoNothing()
    .returning();

  const organizationId = org?.id;

  for (const demo of DEMO_TENANTS) {
    const existing = await db.select().from(tenants).where(eq(tenants.slug, demo.slug)).limit(1);
    if (existing.length > 0) {
      console.log(`[skip] tenant '${demo.slug}' already exists`);
      continue;
    }

    const biz = getBusinessTypeConfig(demo.businessType);

    const [tenant] = await db
      .insert(tenants)
      .values({
        organizationId,
        slug: demo.slug,
        businessName: demo.businessName,
        businessType: demo.businessType,
        subscriptionPlan: "pro",
        theme: biz.theme,
        employeeLabel: biz.employeeLabel,
        tagline: demo.tagline,
        description: demo.description,
        phone: demo.phone,
        email: demo.email,
      })
      .returning();

    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: OWNER_USER_ID,
      role: "owner",
    });

    // Categories
    const categoryRows = await db
      .insert(serviceCategories)
      .values(
        biz.defaultCategories.map((c) => ({ tenantId: tenant.id, name: c.name, icon: c.icon }))
      )
      .returning();
    const catByName = new Map(categoryRows.map((c) => [c.name, c.id]));

    // Services
    await db.insert(services).values(
      biz.defaultServices.map((s) => ({
        tenantId: tenant.id,
        categoryId: catByName.get(biz.defaultCategories[0]?.name) ?? null,
        name: s.name,
        description: s.description ?? null,
        durationMinutes: s.durationMinutes,
        price: s.price,
      }))
    );
    const serviceRows = await db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenant.id));

    // Employees + working hours + service links
    for (const emp of demo.employees) {
      const [row] = await db
        .insert(employees)
        .values({
          tenantId: tenant.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          displayName: `${emp.firstName} ${emp.lastName}`,
          yearsExperience: emp.yearsExperience,
        })
        .returning();

      // Mon–Sat 10:00–20:00
      for (let day = 1; day <= 6; day++) {
        await db.insert(workingHours).values({
          employeeId: row.id,
          weekday: day,
          startTime: "10:00",
          endTime: "20:00",
        });
      }

      for (const svc of serviceRows) {
        await db
          .insert(employeeServices)
          .values({ employeeId: row.id, serviceId: svc.id })
          .onConflictDoNothing();
      }
    }

    console.log(`[ok] tenant '${demo.slug}' seeded (${serviceRows.length} services, ${demo.employees.length} employees)`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});