import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeOverview,
  validateEmployeeInput,
} from "@/modules/booking/application/employees";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/admin/employees
 * Manages the tenant's staff: create / update / delete (soft).
 * All paths enforce `employees.manage` and tenant ownership server-side.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");

    const action = url.searchParams.get("action");
    const ctx = await getDashboardAccess(slug);

    if (action === "create") {
      const body = await readJson<unknown>(req);
      const input = validateEmployeeInput(body);
      const created = await createEmployee(ctx, input);
      return NextResponse.json(
        ok({ id: created.id, displayName: created.displayName }, "Employee created"),
        { status: HttpStatus.Created }
      );
    }

    if (action === "update") {
      const body = await readJson<Record<string, unknown>>(req);
      const id = typeof body.id === "string" ? body.id : "";
      if (!z.string().uuid().safeParse(id).success) throw new ValidationAppError("Invalid employee payload");
      const input = validateEmployeeInput(body);
      const updated = await updateEmployee(ctx, id, input);
      return NextResponse.json(ok({ id: updated.id, displayName: updated.displayName }, "Employee updated"));
    }

    if (action === "delete") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid employee payload");
      await deleteEmployee(ctx, parsed.data.id);
      return NextResponse.json(ok({ id: parsed.data.id }, "Employee removed"));
    }

    if (action === "overview") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid employee payload");
      const overview = await getEmployeeOverview(ctx, parsed.data.id);
      return NextResponse.json(ok(overview, "Employee overview"));
    }

    throw new ValidationAppError("Unknown action");
  });
}