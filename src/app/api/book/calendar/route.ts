import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { resolveTenantForBooking, listEligibleEmployees } from "@/modules/booking/domain/catalog";
import { listWorkingDays } from "@/modules/availability/domain/engine";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  slug: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  employeeId: z.string().uuid().optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

/**
 * POST /api/book/calendar
 * Returns the days of a month on which the employee (or the "any available"
 * eligible pool for the selected services) is working and not on time-off.
 * With `employeeIds` (multi-worker packages) every listed worker must be
 * working that day. The widget greys out every other day.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`book:calendar:${clientIp(req)}`, 120);
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
          inArray(services.id, input.data.serviceIds)
        )
      );
    if (rows.length !== input.data.serviceIds.length) {
      throw new ValidationAppError("One or more services are unavailable");
    }

    const [year, month] = input.data.month.split("-").map(Number);

    let employeeIds: string[];
    let requireAll = false;
    if (input.data.employeeId) {
      employeeIds = [input.data.employeeId];
    } else if (input.data.employeeIds && input.data.employeeIds.length > 0) {
      employeeIds = [...new Set(input.data.employeeIds)];
      requireAll = true;
    } else {
      const eligible = await listEligibleEmployees(tenant.id, input.data.serviceIds);
      employeeIds = eligible.map((e) => e.id);
    }

    const days = await listWorkingDays({ employeeIds, year, month: (month ?? 1) - 1, requireAll });

    return NextResponse.json(ok({ days }, "Calendar ready"), { status: HttpStatus.Ok });
  });
}