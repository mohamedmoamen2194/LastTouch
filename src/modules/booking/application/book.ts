import { db } from "@/db";
import { appointmentServices, appointments, customers, services, type AppointmentSource } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationAppError } from "@/lib/errors";
import { buildDaySlots } from "../../availability/domain/engine";
import { listEligibleEmployees } from "@/modules/booking/domain/catalog";

export type CreateBookingInput = {
  tenantId: string;
  slug: string;
  serviceIds: string[];
  employeeId?: string;
  appointmentDate: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  customer: {
    firstName: string;
    phone: string;
    email?: string;
    notes?: string;
    marketingConsent?: boolean;
  };
  source?: AppointmentSource;
};

export type BookingAvailability = {
  employeeId: string;
  endTime: string;
  durationMinutes: number;
  price: string;
};

function parseBookingDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Validates the requested slot is open for the given services + employee.
 * Called before any appointment is created (spec section 23).
 * Never trusts client input — re-validates service ownership and availability.
 */
export async function validateBookingAvailability(args: {
  tenantId: string;
  serviceIds: string[];
  employeeId?: string;
  appointmentDate: Date;
  startTime: string;
}): Promise<BookingAvailability> {
  if (args.serviceIds.length === 0) throw new ValidationAppError("Select at least one service");

  let durationMinutes = 0;
  let priceNum = 0;
  for (const serviceId of args.serviceIds) {
    const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!svc || svc.tenantId !== args.tenantId) throw new NotFoundError("Service not found");
    if (!svc.active) throw new ConflictError("Service is not active");
    durationMinutes += svc.durationMinutes;
    priceNum += Number(svc.price);
  }

  let employeeId = args.employeeId;
  if (!employeeId) {
    const staff = await listEligibleEmployees(args.tenantId, args.serviceIds);
    for (const emp of staff) {
      const slots = await buildDaySlots({
        employeeId: emp.id,
        date: args.appointmentDate,
        serviceDurationMinutes: durationMinutes,
      });
      if (slots.some((s) => s.start === args.startTime && s.available)) {
        employeeId = emp.id;
        break;
      }
    }
  }

  if (!employeeId) throw new ConflictError("No employee available at the selected time");

  // Never trust the client: a specific worker must be eligible for the services too.
  if (args.employeeId) {
    const eligible = await listEligibleEmployees(args.tenantId, args.serviceIds);
    if (!eligible.some((e) => e.id === args.employeeId)) {
      throw new NotFoundError("This staff member does not offer the selected service");
    }
  }

  const slots = await buildDaySlots({
    employeeId,
    date: args.appointmentDate,
    serviceDurationMinutes: durationMinutes,
  });
  const slot = slots.find((s) => s.start === args.startTime);
  if (!slot) throw new ValidationAppError("The selected time is unavailable");
  if (!slot.available) throw new ConflictError("The selected time is no longer available");

  return { employeeId, endTime: slot.end, durationMinutes, price: priceNum.toFixed(2) };
}

/**
 * Creates (or reuses) the customer, then creates the appointment + snapshots.
 * Single entry point for booking from website, AI, WhatsApp, or dashboard.
 */
export async function createBooking(input: CreateBookingInput) {
  const appointmentDate = parseBookingDay(input.appointmentDate);

  const availability = await validateBookingAvailability({
    tenantId: input.tenantId,
    serviceIds: input.serviceIds,
    employeeId: input.employeeId,
    appointmentDate,
    startTime: input.startTime,
  });

  let customerId: string | null = null;
  if (input.customer.firstName) {
    const existing = await db.query.customers.findFirst({
      where: (c, { and, eq: op }) =>
        and(op(c.tenantId, input.tenantId), op(c.phone, input.customer.phone)),
    });

    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const [created] = await db
        .insert(customers)
        .values({
          tenantId: input.tenantId,
          firstName: input.customer.firstName,
          phone: input.customer.phone,
          email: input.customer.email ?? null,
          notes: input.customer.notes ?? null,
          marketingConsent: input.customer.marketingConsent ?? false,
        })
        .returning();
      id = created.id;
    }
    customerId = id;
  }

  const [appt] = await db
    .insert(appointments)
    .values({
      tenantId: input.tenantId,
      customerId,
      employeeId: availability.employeeId,
      appointmentDate,
      startTime: input.startTime,
      endTime: availability.endTime,
      durationMinutes: availability.durationMinutes,
      price: availability.price,
      status: "pending",
      source: input.source ?? "website",
      notes: input.customer.notes ?? null,
    })
    .returning();

  // Persist snapshot rows for immutable history (spec section 18).
  for (const serviceId of input.serviceIds) {
    const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (svc) {
      await db.insert(appointmentServices).values({
        appointmentId: appt.id,
        serviceId: svc.id,
        serviceNameSnapshot: svc.name,
        durationSnapshot: svc.durationMinutes,
        priceSnapshot: svc.price,
      });
    }
  }

  return { appointment: appt, customerId };
}