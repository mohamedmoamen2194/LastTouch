import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import {
  completeMaintenance,
  createMachine,
  deleteMachine,
  getMachine,
  listMaintenance,
  listMachines,
  scheduleMaintenance,
  updateMachine,
} from "@/modules/inventory/application/machines";

const idSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/machines?slug=...&action=... */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    const action = url.searchParams.get("action");

    const ctx = await getDashboardAccess(slug);
    await assertSubscriptionAccess(ctx.tenantId);

    if (action === "create") {
      const machine = await createMachine(ctx, await readJson<unknown>(req));
      return NextResponse.json(ok({ machine }, "Machine created"), { status: HttpStatus.Created });
    }

    if (action === "update") {
      const body = await readJson<Record<string, unknown>>(req);
      const parsed = idSchema.safeParse(body);
      if (!parsed.success) throw new ValidationAppError("Invalid machine payload");
      const machine = await updateMachine(ctx, parsed.data.id, body);
      return NextResponse.json(ok({ machine }, "Machine updated"));
    }

    if (action === "delete") {
      const parsed = idSchema.safeParse(await readJson<unknown>(req));
      if (!parsed.success) throw new ValidationAppError("Invalid machine payload");
      await deleteMachine(ctx, parsed.data.id);
      return NextResponse.json(ok({ id: parsed.data.id }, "Machine deleted"));
    }

    if (action === "get") {
      const parsed = idSchema.safeParse(await readJson<unknown>(req));
      if (!parsed.success) throw new ValidationAppError("Invalid machine payload");
      const machine = await getMachine(ctx, parsed.data.id);
      return NextResponse.json(ok({ machine }, "Machine"));
    }

    if (action === "list") {
      const machines = await listMachines(ctx);
      return NextResponse.json(ok({ machines }, "Machines"));
    }

    if (action === "maintenance-list") {
      const body = await readJson<{ machineId?: unknown }>(req);
      const machineId = typeof body.machineId === "string" ? body.machineId : undefined;
      const rows = await listMaintenance(ctx, machineId);
      return NextResponse.json(ok({ maintenance: rows }, "Maintenance"));
    }

    if (action === "maintenance-schedule") {
      const body = await readJson<{ machineId?: unknown }>(req);
      if (typeof body.machineId !== "string") throw new ValidationAppError("Missing machine");
      const row = await scheduleMaintenance(ctx, body.machineId, body);
      return NextResponse.json(ok({ maintenance: row }, "Maintenance scheduled"), { status: HttpStatus.Created });
    }

    if (action === "maintenance-complete") {
      const parsed = idSchema.safeParse(await readJson<unknown>(req));
      if (!parsed.success) throw new ValidationAppError("Invalid maintenance payload");
      const row = await completeMaintenance(ctx, parsed.data.id);
      return NextResponse.json(ok({ maintenance: row }, "Maintenance completed"));
    }

    throw new ValidationAppError("Unknown action");
  });
}
