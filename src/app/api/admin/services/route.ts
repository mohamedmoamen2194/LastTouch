import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  createService,
  updateService,
  deleteService,
  validateServiceInput,
} from "@/modules/booking/application/services";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/admin/services
 * Manages the tenant's service catalog: create / update / delete.
 * All paths enforce `services.manage` and tenant ownership server-side.
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
      const input = validateServiceInput(body);
      const created = await createService(ctx, input);
      return NextResponse.json(ok({ id: created.id, active: created.active }, "Service created"), {
        status: HttpStatus.Created,
      });
    }

    if (action === "update") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid service payload", parsed.error.issues.map((e) => ({ path: e.path.join("."), message: e.message })));
      const input = validateServiceInput(parsed.data);
      const updated = await updateService(ctx, parsed.data.id, input);
      return NextResponse.json(ok({ id: updated.id, active: updated.active }, "Service updated"));
    }

    if (action === "delete") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid service payload");
      await deleteService(ctx, parsed.data.id);
      return NextResponse.json(ok({ id: parsed.data.id }, "Service deleted"));
    }

    throw new ValidationAppError("Unknown action");
  });
}