import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, visits } from "@/db/schema";
import { NotFoundError, ValidationAppError } from "@/lib/errors";

export type VisitInput = {
  phone?: string | null;
  customerName?: string | null;
  deviceKey?: string | null;
};

/** The currently open visit for this device or phone number, if any. */
export async function getOpenVisit(tenantId: string, input: Pick<VisitInput, "deviceKey" | "phone">) {
  const deviceKey = input.deviceKey?.trim() || null;
  const phone = input.phone?.trim() || null;
  if (!deviceKey && !phone) return null;

  const [open] = await db
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.tenantId, tenantId),
        eq(visits.status, "checked_in"),
        deviceKey && phone
          ? and(eq(visits.deviceKey, deviceKey), eq(visits.phone, phone))
          : deviceKey
            ? eq(visits.deviceKey, deviceKey)
            : eq(visits.phone, phone!),
      ),
    )
    .orderBy(desc(visits.checkInAt))
    .limit(1);
  return open ?? null;
}

/**
 * Open a visit (idempotent: returns the existing open visit for this
 * device/phone). Links the customer row when the phone matches.
 */
export async function checkInVisit(tenantId: string, input: VisitInput) {
  const phone = input.phone?.trim() || null;
  const customerName = input.customerName?.trim() || null;
  const deviceKey = input.deviceKey?.trim() || null;
  if (phone && phone.length > 30) throw new ValidationAppError("Phone is too long");
  if (customerName && customerName.length > 200) throw new ValidationAppError("Name is too long");

  const existing = await getOpenVisit(tenantId, { deviceKey, phone });
  if (existing) return existing;

  let customerId: string | null = null;
  if (phone) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, phone)))
      .limit(1);
    customerId = customer?.id ?? null;
  }

  const [created] = await db
    .insert(visits)
    .values({ tenantId, customerId, customerName, phone, deviceKey, status: "checked_in" })
    .returning();
  return created;
}

/** Close an open visit (by id, or resolved via device/phone). */
export async function checkOutVisit(
  tenantId: string,
  input: Pick<VisitInput, "deviceKey" | "phone"> & { visitId?: string },
) {
  let open = null;
  if (input.visitId) {
    const [row] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.id, input.visitId), eq(visits.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError("Visit not found");
    if (row.status !== "checked_in") return row;
    open = row;
  } else {
    open = await getOpenVisit(tenantId, input);
    if (!open) throw new NotFoundError("No open visit found");
  }

  const [closed] = await db
    .update(visits)
    .set({ status: "checked_out", checkOutAt: new Date(), updatedAt: new Date() })
    .where(eq(visits.id, open.id))
    .returning();
  return closed;
}

export function validateVisitInput(input: unknown): VisitInput & { visitId?: string } {
  const v = input as Partial<VisitInput & { visitId?: string }> | null;
  if (!v || typeof v !== "object") throw new ValidationAppError("Invalid visit payload");
  const out: VisitInput & { visitId?: string } = {};
  if (typeof v.phone === "string" && v.phone.trim()) out.phone = v.phone.trim().slice(0, 30);
  if (typeof v.customerName === "string" && v.customerName.trim()) {
    out.customerName = v.customerName.trim().slice(0, 200);
  }
  if (typeof v.deviceKey === "string" && v.deviceKey.trim()) {
    out.deviceKey = v.deviceKey.trim().slice(0, 64);
  }
  if (typeof v.visitId === "string" && v.visitId.trim()) out.visitId = v.visitId.trim();
  return out;
}
