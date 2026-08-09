import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { resolveTenantForBooking, listEligibleEmployees } from "@/modules/booking/domain/catalog";
import { buildDaySlots, parseDay } from "@/modules/availability/domain/engine";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ValidationAppError } from "@/lib/errors";

const bodySchema = z.object({
  slug: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/book/slots
 * Returns available start times for one employee (or the "any available"
 * union) for a given date and service selection.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid booking request");

    const tenant = await resolveTenantForBooking(input.data.slug);

    // Validate services belong to this tenant and sum their durations.
    const rows = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.tenantId, tenant.id),
          ...input.data.serviceIds.map((id) => eq(services.id, id))
        )
      );
    if (rows.length !== input.data.serviceIds.length) {
      throw new ValidationAppError("One or more services are unavailable");
    }
    const duration = rows.reduce((sum, s) => sum + s.durationMinutes, 0);

    const date = parseDay(input.data.date);

    const employeeId = input.data.employeeId;
    if (employeeId) {
      // Ensure the employee is active and belongs to this tenant and is
      // eligible for the requested services (linked to one of them, OR a
      // general worker with no service mapping — they take any service).
      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      const worker = eligible.find((e) => e.id === employeeId);
      if (!worker) throw new ValidationAppError("This staff member does not offer the selected service");

      const slots = await buildDaySlots({ employeeId, date, serviceDurationMinutes: duration });
      return NextResponse.json(ok({ slots, employeeId }), { status: HttpStatus.Ok });
    }

    // Any available: merge slots across eligible staff (service-mapped OR general).
    // Booked yet still-open times are kept but flagged unavailable so the UI can
    // render them greyed-out instead of hiding them.
    const staff = await listEligibleEmployees(tenant.id, input.data.serviceIds);
    const byStart = new Map<string, { start: string; end: string; available: boolean }>();
    for (const emp of staff) {
      const day = await buildDaySlots({
        employeeId: emp.id,
        date,
        serviceDurationMinutes: duration,
      });
      for (const s of day) {
        const existing = byStart.get(s.start);
        if (existing) {
          existing.available = existing.available || s.available;
        } else {
          byStart.set(s.start, { ...s });
        }
      }
    }
    const slots = Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start));
    return NextResponse.json(ok({ slots, employeeId: null }), { status: HttpStatus.Ok });
  });
}