import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { resolveTenantForBooking, listEligibleEmployees } from "@/modules/booking/domain/catalog";
import { listWorkingDays } from "@/modules/availability/domain/engine";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const bodySchema = z.object({
  slug: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

/**
 * POST /api/book/calendar
 * Returns the days of a month on which the employee (or the "any available"
 * eligible pool for the selected services) is working and not on time-off.
 * The widget greys out every other day.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid calendar request");

    const tenant = await resolveTenantForBooking(input.data.slug);

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

    let employeeIds: string[];
    if (input.data.employeeId) {
      employeeIds = [input.data.employeeId];
    } else {
      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      employeeIds = eligible.map((e) => e.id);
    }

    const [year, month] = input.data.month.split("-").map(Number);
    const days = await listWorkingDays({ employeeIds, year, month: (month ?? 1) - 1 });

    return NextResponse.json(ok({ days }, "Calendar ready"), { status: HttpStatus.Ok });
  });
}