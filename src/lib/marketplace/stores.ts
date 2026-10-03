import { and, avg, count, desc, eq, inArray, min, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  locations,
  packages,
  packageServices,
  reviews,
  services,
  subscriptions,
  tenants,
  BUSINESS_TYPES,
} from "@/db/schema";

export type MarketplaceStore = {
  id: string;
  slug: string;
  businessName: string;
  businessType: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  shopImages: string[];
  phone: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  ratingAvg: number;
  ratingCount: number;
  priceFrom: number | null;
  servicesCount: number;
};

const BOOKABLE_STATUSES = ["active", "trial", "grace"];

/** Ids of tenants visible on the marketplace (active + listed + subscribed). */
async function getVisibleTenantIds(): Promise<string[]> {
  const rows = await db
    .select({
      id: tenants.id,
      subPlan: subscriptions.plan,
      subStatus: subscriptions.status,
      subEnd: sql<Date | null>`COALESCE(${subscriptions.expirationDate}, ${subscriptions.renewalDate}, ${subscriptions.trialEnd})`,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .where(and(eq(tenants.active, true), eq(tenants.marketplaceEnabled, true)));

  const now = new Date();
  return rows
    .filter((t) => {
      if (!t.subPlan || t.subPlan === "free") return false;
      if (!t.subStatus || !BOOKABLE_STATUSES.includes(t.subStatus)) return false;
      if (t.subEnd && new Date(t.subEnd) < now) return false;
      return true;
    })
    .map((t) => t.id);
}

/**
 * All stores visible in the client marketplace: active, opted into the
 * marketplace, and holding a usable subscription (paid plan, not expired).
 * Aggregates rating, location and starting price in a handful of queries.
 */
export async function listMarketplaceStores(): Promise<MarketplaceStore[]> {
  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      businessName: tenants.businessName,
      businessType: tenants.businessType,
      tagline: tenants.tagline,
      description: tenants.description,
      logoUrl: tenants.logoUrl,
      coverUrl: tenants.coverUrl,
      shopImages: tenants.shopImages,
      phone: tenants.phone,
      subPlan: subscriptions.plan,
      subStatus: subscriptions.status,
      subEnd: sql<Date | null>`COALESCE(${subscriptions.expirationDate}, ${subscriptions.renewalDate}, ${subscriptions.trialEnd})`,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .where(and(eq(tenants.active, true), eq(tenants.marketplaceEnabled, true)));

  const now = new Date();
  const visible = tenantRows.filter((t) => {
    if (!t.subPlan || t.subPlan === "free") return false;
    if (!t.subStatus || !BOOKABLE_STATUSES.includes(t.subStatus)) return false;
    if (t.subEnd && new Date(t.subEnd) < now) return false;
    return true;
  });
  if (visible.length === 0) return [];

  const ids = visible.map((t) => t.id);

  const ratingRows = await db
    .select({
      tenantId: reviews.tenantId,
      avg: avg(reviews.rating),
      count: count(reviews.id),
    })
    .from(reviews)
    .where(
      and(
        sql`${reviews.tenantId} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
        eq(reviews.status, "published"),
      ),
    )
    .groupBy(reviews.tenantId);
  const ratingByTenant = new Map(ratingRows.map((r) => [r.tenantId, r]));

  const locRows = await db
    .select({
      tenantId: locations.tenantId,
      city: locations.city,
      latitude: locations.latitude,
      longitude: locations.longitude,
      active: locations.active,
    })
    .from(locations)
    .where(
      and(
        sql`${locations.tenantId} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
        eq(locations.active, true),
      ),
    );
  // Prefer a branch with coordinates; otherwise first active branch.
  const locByTenant = new Map<string, (typeof locRows)[number]>();
  for (const l of locRows) {
    const cur = locByTenant.get(l.tenantId);
    if (!cur) locByTenant.set(l.tenantId, l);
    else if (!cur.latitude && l.latitude) locByTenant.set(l.tenantId, l);
  }

  const priceRows = await db
    .select({
      tenantId: services.tenantId,
      from: min(services.price),
      count: count(services.id),
    })
    .from(services)
    .where(
      and(
        sql`${services.tenantId} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
        eq(services.active, true),
      ),
    )
    .groupBy(services.tenantId);
  const priceByTenant = new Map(priceRows.map((r) => [r.tenantId, r]));

  return visible.map((t) => {
    const rating = ratingByTenant.get(t.id);
    const loc = locByTenant.get(t.id);
    const price = priceByTenant.get(t.id);
    return {
      id: t.id,
      slug: t.slug,
      businessName: t.businessName,
      businessType: t.businessType,
      tagline: t.tagline,
      description: t.description,
      logoUrl: t.logoUrl,
      coverUrl: t.coverUrl,
      shopImages: (t.shopImages as string[] | null) ?? [],
      phone: t.phone,
      city: loc?.city ?? null,
      latitude: loc?.latitude != null ? Number(loc.latitude) : null,
      longitude: loc?.longitude != null ? Number(loc.longitude) : null,
      ratingAvg: rating ? Number(rating.avg ?? 0) : 0,
      ratingCount: rating ? Number(rating.count ?? 0) : 0,
      priceFrom: price?.from != null ? Number(price.from) : null,
      servicesCount: price ? Number(price.count ?? 0) : 0,
    };
  });
}

/** Distinct cities that have listed stores (for the city filter). */
export async function listMarketplaceCities(): Promise<string[]> {
  const stores = await listMarketplaceStores();
  return [...new Set(stores.map((s) => s.city).filter((c): c is string => Boolean(c)))].sort();
}

const MALE_FIRST = ["barber_shop", "hair_salon", "wellness_center", "spa", "beauty_center", "makeup_studio", "nail_studio"];
const FEMALE_FIRST = ["hair_salon", "nail_studio", "beauty_center", "spa", "makeup_studio", "wellness_center", "barber_shop"];

/** Business-type order follows the viewer: men see barbering first, women see salons first. */
export function orderedBusinessTypes(gender: string | null | undefined): string[] {
  const priority = gender === "female" ? FEMALE_FIRST : MALE_FIRST;
  const seen = new Set(priority);
  return [...priority, ...BUSINESS_TYPES.filter((b) => !seen.has(b))];
}

export type HotPackage = {
  id: string;
  name: string;
  price: number;
  fullPrice: number;
  serviceNames: string[];
  servicesCount: number;
  tenantId: string;
  slug: string;
  businessName: string;
  businessType: string;
  logoUrl: string | null;
  coverUrl: string | null;
  shopImage: string | null;
};

/** Active packages from listed stores — the "hot deals" ad space. */
export async function listHotPackages(limit = 8): Promise<HotPackage[]> {
  const ids = await getVisibleTenantIds();
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: packages.id,
      name: packages.name,
      price: packages.price,
      tenantId: packages.tenantId,
      slug: tenants.slug,
      businessName: tenants.businessName,
      businessType: tenants.businessType,
      logoUrl: tenants.logoUrl,
      coverUrl: tenants.coverUrl,
      shopImages: tenants.shopImages,
    })
    .from(packages)
    .innerJoin(tenants, eq(tenants.id, packages.tenantId))
    .where(
      and(
        sql`${packages.tenantId} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
        eq(packages.active, true),
      ),
    )
    .orderBy(desc(packages.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  // Linked services per package (for included-services list + full price).
  const pkgIds = rows.map((r) => r.id);
  const links = await db
    .select({ packageId: packageServices.packageId, serviceId: packageServices.serviceId })
    .from(packageServices)
    .where(inArray(packageServices.packageId, pkgIds));
  const serviceIds = [...new Set(links.map((l) => l.serviceId))];
  const svcRows = serviceIds.length
    ? await db
        .select({ id: services.id, name: services.name, price: services.price })
        .from(services)
        .where(inArray(services.id, serviceIds))
    : [];
  const svcById = new Map(svcRows.map((s) => [s.id, s]));
  const idsByPkg = new Map<string, string[]>();
  for (const l of links) {
    idsByPkg.set(l.packageId, [...(idsByPkg.get(l.packageId) ?? []), l.serviceId]);
  }

  return rows.map((r) => {
    const sids = idsByPkg.get(r.id) ?? [];
    const svcs = sids.map((id) => svcById.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const fullPrice = svcs.reduce((sum, s) => sum + Number(s.price ?? 0), 0);
    const images = (r.shopImages as string[] | null) ?? [];
    return {
      id: r.id,
      name: r.name,
      price: Number(r.price ?? 0),
      fullPrice,
      serviceNames: svcs.map((s) => s.name),
      servicesCount: svcs.length,
      tenantId: r.tenantId,
      slug: r.slug,
      businessName: r.businessName,
      businessType: r.businessType,
      logoUrl: r.logoUrl,
      coverUrl: r.coverUrl,
      shopImage: images[0] ?? null,
    };
  });
}

/** Haversine distance in km. */
export { distanceKm } from "@/lib/marketplace/geo";
