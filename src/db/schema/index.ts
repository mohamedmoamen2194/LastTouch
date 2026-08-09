import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  varchar,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Shared helpers
 */
export const id = uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`);
export const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull();
export const deletedAt = timestamp("deleted_at", { withTimezone: true });

/**
 * Core enums (stored as varchar to remain config-driven and migration-friendly)
 */
export const BUSINESS_TYPES = [
  "barber_shop",
  "hair_salon",
  "nail_studio",
  "beauty_center",
  "spa",
  "makeup_studio",
  "wellness_center",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const THEMES = [
  "modern_men",
  "luxury_women",
  "scandinavian",
  "minimal",
  "elegant_white",
  "premium_black",
  "coffee",
  "emerald",
] as const;
export type ThemeName = (typeof THEMES)[number];

export const SUBSCRIPTION_PLANS = ["free", "pro", "ai", "enterprise"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const ROLES = ["owner", "manager", "employee", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_SOURCES = [
  "dashboard",
  "website",
  "whatsapp",
  "ai",
  "marketplace",
  "walk_in",
] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

export const NOTIFICATION_CHANNELS = ["email", "in_app", "whatsapp", "sms", "push"] as const;
export const NOTIFICATION_STATUSES = ["pending", "sent", "delivered", "opened", "failed"] as const;

export const REVIEW_STATUSES = ["pending", "published", "hidden", "reported"] as const;

export const PAYMENT_METHODS = ["cash", "card", "wallet", "online", "split"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "partial", "refunded", "failed"] as const;

/**
 * Future-proof grouping entity. Initially every tenant belongs to one organization.
 */
export const organizations = pgTable("organizations", {
  id,
  name: text("name").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  ownerUserId: text("owner_user_id"),
  createdAt,
  updatedAt,
});

/**
 * Represents one business (tenant).
 */
export const tenants = pgTable(
  "tenants",
  {
    id,
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    businessName: text("business_name").notNull(),
    businessType: varchar("business_type", { length: 40 }).$type<BusinessType>().notNull(),
    subscriptionPlan: varchar("subscription_plan", { length: 20 }).$type<SubscriptionPlan>().default("free").notNull(),
    theme: varchar("theme", { length: 40 }).$type<ThemeName>().default("modern_men").notNull(),
    employeeLabel: text("employee_label").default("Professional"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    shopImages: jsonb("shop_images").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    phone: varchar("phone", { length: 30 }),
    email: text("email"),
    whatsapp: varchar("whatsapp", { length: 30 }),
    website: text("website"),
    description: text("description"),
    tagline: text("tagline"),
    timezone: varchar("timezone", { length: 60 }).default("Africa/Cairo").notNull(),
    locale: varchar("locale", { length: 10 }).default("en").notNull(),
    currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
    marketplaceEnabled: boolean("marketplace_enabled").default(false).notNull(),
    marketplaceVisibility: varchar("marketplace_visibility", { length: 20 }).default("private").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("tenants_slug_unique").on(t.slug),
    index("tenants_org_idx").on(t.organizationId),
    index("tenants_type_idx").on(t.businessType),
  ]
);

/**
 * Physical branches.
 */
export const locations = pgTable(
  "locations",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    address: text("address"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    city: text("city"),
    governorate: text("governorate"),
    postalCode: varchar("postal_code", { length: 20 }),
    phone: varchar("phone", { length: 30 }),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("locations_tenant_idx").on(t.tenantId)]
);

/**
 * Maps platform users to tenants with a role.
 */
export const memberships = pgTable(
  "memberships",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull(), // Clerk user id
    role: varchar("role", { length: 20 }).$type<Role>().default("employee").notNull(),
    active: boolean("active").default(true).notNull(),
    invitedBy: text("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("memberships_user_tenant_unique").on(t.userId, t.tenantId),
    index("memberships_tenant_idx").on(t.tenantId),
  ]
);

/**
 * Generic employee table. Never hardcode "barber".
 */
export const employees = pgTable(
  "employees",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    userId: text("user_id"), // optional link to a Clerk account (employee login)
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    displayName: text("display_name"),
    role: text("role"), // job role, e.g. "Barber", "Receptionist" — free text per tenant
    salary: numeric("salary", { precision: 12, scale: 2 }), // optional monthly pay
    bio: text("bio"),
    imageUrl: text("image_url"),
    phone: varchar("phone", { length: 30 }),
    email: text("email"),
    yearsExperience: integer("years_experience").default(0),
    hireDate: timestamp("hire_date", { withTimezone: true }),
    rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("employees_tenant_idx").on(t.tenantId),
    index("employees_tenant_active_idx").on(t.tenantId, t.active),
  ]
);

/**
 * Many-to-many: which services an employee may perform.
 */
export const employeeServices = pgTable(
  "employee_services",
  {
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    serviceId: uuid("service_id")
      .references(() => services.id, { onDelete: "cascade" })
      .notNull(),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.serviceId] })]
);

/**
 * Weekly availability per employee. One record per weekday.
 */
export const workingHours = pgTable(
  "working_hours",
  {
    id,
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    weekday: integer("weekday").notNull(), // 0 = Sunday
    startTime: text("start_time").notNull(), // "09:00"
    endTime: text("end_time").notNull(), // "22:00"
  },
  (t) => [
    index("wh_employee_idx").on(t.employeeId),
    uniqueIndex("wh_employee_weekday_unique").on(t.employeeId, t.weekday),
  ]
);

/**
 * Daily breaks (lunch, prayer, etc).
 */
export const breaks = pgTable(
  "breaks",
  {
    id,
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    weekday: integer("weekday").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (t) => [index("breaks_employee_idx").on(t.employeeId)]
);

/**
 * Vacation / sick leave / holidays.
 */
export const timeOff = pgTable(
  "time_off",
  {
    id,
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    type: varchar("type", { length: 20 }).default("vacation").notNull(),
    reason: text("reason"),
  },
  (t) => [index("time_off_employee_idx").on(t.employeeId)]
);

/**
 * Customers (owned by tenant).
 */
export const customers = pgTable(
  "customers",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    phone: varchar("phone", { length: 30 }),
    email: text("email"),
    birthday: timestamp("birthday", { withTimezone: true }),
    gender: varchar("gender", { length: 20 }),
    notes: text("notes"),
    marketingConsent: boolean("marketing_consent").default(false).notNull(),
    emailConsent: boolean("email_consent").default(false).notNull(),
    smsConsent: boolean("sms_consent").default(false).notNull(),
    whatsappConsent: boolean("whatsapp_consent").default(false).notNull(),
    loyaltyPoints: integer("loyalty_points").default(0).notNull(),
    lifetimePoints: integer("lifetime_points").default(0).notNull(),
    redeemedPoints: integer("redeemed_points").default(0).notNull(),
    preferredEmployeeId: uuid("preferred_employee_id").references(() => employees.id, { onDelete: "set null" }),
    totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).default("0").notNull(),
    visitCount: integer("visit_count").default(0).notNull(),
    noShowCount: integer("no_show_count").default(0).notNull(),
    cancellationCount: integer("cancellation_count").default(0).notNull(),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`),
    aiSummary: text("ai_summary"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenantId),
    uniqueIndex("customers_tenant_phone_unique").on(t.tenantId, t.phone),
  ]
);

/**
 * Service categories (owner-defined).
 */
export const serviceCategories = pgTable(
  "service_categories",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("sc_tenant_idx").on(t.tenantId)]
);

/**
 * Services - every service created by tenant, nothing hardcoded.
 */
export const services = pgTable(
  "services",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferBefore: integer("buffer_before").default(0).notNull(),
    bufferAfter: integer("buffer_after").default(0).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("services_tenant_idx").on(t.tenantId),
    index("services_tenant_cat_idx").on(t.tenantId, t.categoryId),
  ]
);

/**
 * Packages combine multiple services.
 */
export const packages = pgTable(
  "packages",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [index("packages_tenant_idx").on(t.tenantId)]
);

export const packageServices = pgTable(
  "package_services",
  {
    packageId: uuid("package_id")
      .references(() => packages.id, { onDelete: "cascade" })
      .notNull(),
    serviceId: uuid("service_id")
      .references(() => services.id, { onDelete: "cascade" })
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.serviceId] })]
);

/**
 * Add-ons (optional extras).
 */
export const addons = pgTable(
  "addons",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    durationMinutes: integer("duration_minutes").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("addons_tenant_idx").on(t.tenantId)]
);

/**
 * Appointments - the heart of the platform.
 */
export const appointments = pgTable(
  "appointments",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
    appointmentDate: timestamp("appointment_date", { withTimezone: true }).notNull(),
    startTime: text("start_time").notNull(), // "10:00"
    endTime: text("end_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: varchar("status", { length: 20 }).$type<AppointmentStatus>().default("pending").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    notes: text("notes"),
    source: varchar("source", { length: 20 }).$type<AppointmentSource>().default("website").notNull(),
    cancelledBy: text("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    rescheduledFrom: timestamp("rescheduled_from", { withTimezone: true }),
    rescheduledBy: text("rescheduled_by"),
    rescheduledAt: timestamp("rescheduled_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("appointments_tenant_idx").on(t.tenantId),
    index("appointments_tenant_date_idx").on(t.tenantId, t.appointmentDate),
    index("appointments_tenant_status_idx").on(t.tenantId, t.status),
    index("appointments_tenant_employee_idx").on(t.tenantId, t.employeeId),
    index("appointments_tenant_customer_idx").on(t.tenantId, t.customerId),
  ]
);

/**
 * Snapshot of services within an appointment (multi-service bookings).
 */
export const appointmentServices = pgTable(
  "appointment_services",
  {
    id,
    appointmentId: uuid("appointment_id")
      .references(() => appointments.id, { onDelete: "cascade" })
      .notNull(),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    durationSnapshot: integer("duration_snapshot").notNull(),
    priceSnapshot: numeric("price_snapshot", { precision: 12, scale: 2 }).default("0").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("appt_services_appt_idx").on(t.appointmentId)]
);

export const appointmentAddons = pgTable(
  "appointment_addons",
  {
    id,
    appointmentId: uuid("appointment_id")
      .references(() => appointments.id, { onDelete: "cascade" })
      .notNull(),
    addonId: uuid("addon_id").references(() => addons.id, { onDelete: "set null" }),
    addonNameSnapshot: text("addon_name_snapshot").notNull(),
    priceSnapshot: numeric("price_snapshot", { precision: 12, scale: 2 }).default("0").notNull(),
  },
  (t) => [index("appt_addons_appt_idx").on(t.appointmentId)]
);

/**
 * Payments (future-ready).
 */
export const payments = pgTable(
  "payments",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    method: varchar("method", { length: 20 }).$type<(typeof PAYMENT_METHODS)[number]>().default("cash").notNull(),
    status: varchar("status", { length: 20 }).$type<(typeof PAYMENT_STATUSES)[number]>().default("pending").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    remainingAmount: numeric("remaining_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).default("0").notNull(),
    tax: numeric("tax", { precision: 12, scale: 2 }).default("0").notNull(),
    tip: numeric("tip", { precision: 12, scale: 2 }).default("0").notNull(),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index("payments_tenant_idx").on(t.tenantId), index("payments_appt_idx").on(t.appointmentId)]
);

/**
 * Coupons.
 */
export const coupons = pgTable(
  "coupons",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 60 }).notNull(),
    type: varchar("type", { length: 20 }).default("percentage").notNull(), // fixed | percentage
    value: numeric("value", { precision: 10, scale: 2 }).default("0").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses").default(0).notNull(),
    perCustomerLimit: integer("per_customer_limit").default(0).notNull(),
    minSpend: numeric("min_spend", { precision: 12, scale: 2 }).default("0").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("coupons_tenant_idx").on(t.tenantId),
    uniqueIndex("coupons_tenant_code_unique").on(t.tenantId, t.code),
  ]
);

/**
 * Reviews - only from completed appointments.
 */
export const reviews = pgTable(
  "reviews",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(), // 1..5
    comment: text("comment"),
    status: varchar("status", { length: 20 }).$type<(typeof REVIEW_STATUSES)[number]>().default("pending").notNull(),
    ownerReply: text("owner_reply"),
    pinned: boolean("pinned").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("reviews_tenant_idx").on(t.tenantId), index("reviews_customer_idx").on(t.customerId)]
);

/**
 * Internal notification center.
 */
export const notifications = pgTable(
  "notifications",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    recipientUserId: text("recipient_user_id"),
    channel: varchar("channel", { length: 20 }).$type<(typeof NOTIFICATION_CHANNELS)[number]>().default("in_app").notNull(),
    status: varchar("status", { length: 20 }).$type<(typeof NOTIFICATION_STATUSES)[number]>().default("pending").notNull(),
    category: text("category"),
    priority: varchar("priority", { length: 10 }).default("normal").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    deepLink: text("deep_link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    retryCount: integer("retry_count").default(0).notNull(),
    providerResponse: text("provider_response"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("notifications_recipient_idx").on(t.recipientUserId),
  ]
);

/**
 * Customer timeline events.
 */
export const timelineEvents = pgTable(
  "timeline_events",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // created | booked | completed | reviewed | coupon_redeemed | campaign_sent ...
    title: text("title").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [
    index("timeline_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("timeline_tenant_created_idx").on(t.tenantId, t.createdAt),
  ]
);

/**
 * Audit log - every sensitive operation recorded.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id,
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: uuid("entity_id"),
    previousValue: jsonb("previous_value").$type<Record<string, unknown>>(),
    newValue: jsonb("new_value").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [
    index("audit_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_actor_idx").on(t.actorUserId),
  ]
);

/**
 * Subscriptions.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    plan: varchar("plan", { length: 20 }).$type<SubscriptionPlan>().default("free").notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(), // active | trial | expired | cancelled | grace
    renewalDate: timestamp("renewal_date", { withTimezone: true }),
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    autoRenew: boolean("auto_renew").default(true).notNull(),
    paymentProvider: text("payment_provider"),
    providerReference: text("provider_reference"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("subscriptions_tenant_unique").on(t.tenantId)]
);

/**
 * Invoices.
 */
export const invoices = pgTable(
  "invoices",
  {
    id,
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    plan: varchar("plan", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
    tax: numeric("tax", { precision: 12, scale: 2 }).default("0").notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).default("0").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    paymentMethod: text("payment_method"),
    issueDate: timestamp("issue_date", { withTimezone: true }).defaultNow().notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index("invoices_tenant_idx").on(t.tenantId)]
);

/**
 * AI interaction logs.
 */
export const aiLogs = pgTable(
  "ai_logs",
  {
    id,
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    userId: text("user_id"),
    assistantType: text("assistant_type"), // receptionist | crm | analytics | marketing | consultant
    provider: text("provider"),
    model: text("model"),
    prompt: text("prompt"),
    response: text("response"),
    tokensUsed: integer("tokens_used").default(0),
    latencyMs: integer("latency_ms").default(0),
    toolCalls: jsonb("tool_calls").$type<unknown[]>(),
    error: text("error"),
    createdAt,
  },
  (t) => [
    index("ai_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("ai_logs_user_idx").on(t.userId),
  ]
);

/**
 * Feature flags / announcements (platform-level).
 */
export const featureFlags = pgTable("feature_flags", {
  id,
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  scope: varchar("scope", { length: 20 }).default("global").notNull(), // global | plan | tenant
  plan: varchar("plan", { length: 20 }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  description: text("description"),
  updatedAt,
});

export const announcements = pgTable("announcements", {
  id,
  title: text("title").notNull(),
  body: text("body"),
  category: text("category"),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow(),
  createdAt,
});