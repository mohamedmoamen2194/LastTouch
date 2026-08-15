import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { resolveTenantForBooking, listEligibleEmployees } from "@/modules/booking/domain/catalog";
import { buildDaySlots, buildSequentialChainSlots, addMinutesToHHMM, parseDay } from "@/modules/availability/domain/engine";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ValidationAppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  slug: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  employeeAssignments: z
    .array(z.object({ serviceId: z.string().uuid(), employeeId: z.string().uuid() }))
    .optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/book/slots
 * Returns available start times for one employee, a multi-worker package
 * (services run back-to-back, each worker doing their own service), or the
 * "any available" union — for a given date and service selection.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`book:slots:${clientIp(req)}`, 120);
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
          inArray(services.id, input.data.serviceIds)
        )
      );
    if (rows.length !== input.data.serviceIds.length) {
      throw new ValidationAppError("One or more services are unavailable");
    }
    const duration = rows.reduce((sum, s) => sum + s.durationMinutes, 0);
    const durationByService = new Map(rows.map((s) => [s.id, s.durationMinutes]));

    const date = parseDay(input.data.date);

    const employeeId = input.data.employeeId;
    if (employeeId) {
      // Ensure the employee is active and belongs to this tenant and is
      // eligible for the requested services (general, mapped, or unmapped).
      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      const worker = eligible.find((e) => e.id === employeeId);
      if (!worker) throw new ValidationAppError("This staff member does not offer the selected service");

      const slots = await buildDaySlots({ employeeId, date, serviceDurationMinutes: duration });
      return NextResponse.json(ok({ slots, employeeId }), { status: HttpStatus.Ok });
    }

    if (input.data.employeeAssignments && input.data.employeeAssignments.length > 0) {
      // Multi-worker package: each service has its own worker, and the
      // services run back-to-back in the requested order. A start time is
      // bookable when every worker can host their own service at its offset.
      const byService = new Map(input.data.employeeAssignments.map((a) => [a.serviceId, a.employeeId]));
      const assignments = input.data.serviceIds.map((serviceId) => {
        const workerId = byService.get(serviceId);
        const serviceDurationMinutes = durationByService.get(serviceId);
        if (!workerId || serviceDurationMinutes === undefined) {
          throw new ValidationAppError("Every service needs a selected staff member");
        }
        return { employeeId: workerId, serviceDurationMinutes };
      });

      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      if (!assignments.every((a) => eligible.some((e) => e.id === a.employeeId))) {
        throw new ValidationAppError("One of the selected staff members does not offer the selected service");
      }

      const slots = await buildSequentialChainSlots({ assignments, date });
      return NextResponse.json(ok({ slots, assignments }), { status: HttpStatus.Ok });
    }

    if (input.data.employeeIds && input.data.employeeIds.length > 0) {
      // Multi-worker package: a start time is bookable only when EVERY
      // assigned worker is available for the full appointment window.
      const unique = [...new Set(input.data.employeeIds)];
      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      if (!unique.every((id) => eligible.some((e) => e.id === id))) {
        throw new ValidationAppError("One of the selected staff members does not offer the selected service");
      }

      const perWorker = await Promise.all(
        unique.map(async (id) => {
          const day = await buildDaySlots({ employeeId: id, date, serviceDurationMinutes: duration });
          return new Map(day.map((s) => [s.start, s.available]));
        })
      );

      const allStarts = new Set<string>();
      for (const map of perWorker) for (const start of map.keys()) allStarts.add(start);

      const slots = Array.from(allStarts)
        .map((start) => ({
          start,
          end: addMinutesToHHMM(start, duration),
          available: perWorker.every((map) => map.get(start) === true),
        }))
        .sort((a, b) => a.start.localeCompare(b.start));

      return NextResponse.json(ok({ slots, employeeIds: unique }), { status: HttpStatus.Ok });
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