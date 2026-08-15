import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { createBooking } from "@/modules/booking/application/book";
import { db } from "@/db";
import { appointmentServices, appointmentEmployees, employees } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  slug: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
  employeeAssignments: z
    .array(z.object({ serviceId: z.string().uuid(), employeeId: z.string().uuid() }))
    .optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  customer: z.object({
    firstName: z.string().min(1).max(120),
    phone: z.string().min(6).max(30),
    email: z.string().email().optional().or(z.literal("")),
    notes: z.string().max(2000).optional().or(z.literal("")),
    marketingConsent: z.boolean().optional(),
  }),
});

/**
 * POST /api/book/confirm
 * Creates the appointment. Server re-validates ownership + availability
 * before inserting (never trusts the client).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`book:confirm:${clientIp(req)}`, 10);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid booking request");

    const tenant = await resolveTenantForBooking(input.data.slug);

    const result = await createBooking({
      tenantId: tenant.id,
      slug: tenant.slug,
      serviceIds: input.data.serviceIds,
      employeeId: input.data.employeeId,
      employeeAssignments: input.data.employeeAssignments,
      appointmentDate: input.data.appointmentDate,
      startTime: input.data.startTime,
      customer: {
        firstName: input.data.customer.firstName,
        phone: input.data.customer.phone,
        email: input.data.customer.email || undefined,
        notes: input.data.customer.notes || undefined,
        marketingConsent: input.data.customer.marketingConsent ?? false,
      },
      source: "website",
    });

    const appt = result.appointment;

    const [worker] = appt.employeeId
      ? await db.select().from(employees).where(eq(employees.id, appt.employeeId)).limit(1)
      : [];

    const snapshots = await db
      .select()
      .from(appointmentServices)
      .where(eq(appointmentServices.appointmentId, appt.id))
      .orderBy(appointmentServices.sortOrder);

    const assignments = await db
      .select()
      .from(appointmentEmployees)
      .where(eq(appointmentEmployees.appointmentId, appt.id))
      .orderBy(appointmentEmployees.sortOrder);

    const assignedWorkers = assignments.length
      ? await db
          .select({ id: employees.id, displayName: employees.displayName, firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(inArray(employees.id, [...new Set(assignments.map((a) => a.employeeId))]))
      : [];
    const workerById = new Map(assignedWorkers.map((w) => [w.id, w]));

    return NextResponse.json(
      ok(
        {
          appointmentId: appt.id,
          startTime: appt.startTime,
          endTime: appt.endTime,
          appointmentDate: appt.appointmentDate,
          employee: worker
            ? { id: worker.id, displayName: worker.displayName, firstName: worker.firstName, lastName: worker.lastName }
            : null,
          services: snapshots.map((s) => ({
            name: s.serviceNameSnapshot,
            price: String(s.priceSnapshot),
            durationMinutes: s.durationSnapshot,
          })),
          assignedWorkers: assignments.map((a) => {
            const w = workerById.get(a.employeeId);
            return {
              serviceId: a.serviceId,
              employeeId: a.employeeId,
              employeeName: w ? (w.displayName ?? `${w.firstName} ${w.lastName ?? ""}`.trim()) : null,
            };
          }),
        },
        "Appointment confirmed"
      ),
      { status: HttpStatus.Created }
    );
  });
}