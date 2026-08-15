import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  createPackage,
  deletePackage,
  updatePackage,
  validatePackageInput,
} from "@/modules/booking/application/packages";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/admin/packages
 * Manages the tenant's service packages: create / update / delete (soft).
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
      const input = validatePackageInput(body);
      const created = await createPackage(ctx, input);
      return NextResponse.json(
        ok({ id: created.id, active: created.active }, "Package created"),
        { status: HttpStatus.Created }
      );
    }

    if (action === "update") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid package payload");
      const input = validatePackageInput(body);
      const updated = await updatePackage(ctx, parsed.data.id, input);
      return NextResponse.json(ok({ id: updated.id, active: updated.active }, "Package updated"));
    }

    if (action === "delete") {
      const body = await readJson<unknown>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid package payload");
      await deletePackage(ctx, parsed.data.id);
      return NextResponse.json(ok({ id: parsed.data.id }, "Package deleted"));
    }

    throw new ValidationAppError("Unknown action");
  });
}