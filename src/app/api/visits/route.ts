import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { assertBookingOpen } from "@/lib/subscriptions";
import {
  checkInVisit,
  checkOutVisit,
  getOpenVisit,
  validateVisitInput,
} from "@/modules/visits/application/visits";

/**
 * POST /api/visits?slug=...&action=status|checkin|checkout
 * Public check-in/out for shop visitors (QR scan or phone fallback).
 * Same subscription gate as booking: unsubscribed stores stay closed.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    const action = url.searchParams.get("action");
    if (!z.enum(["status", "checkin", "checkout"]).safeParse(action).success) {
      throw new ValidationAppError("Unknown action");
    }

    const tenant = await resolveTenantForBooking(slug);
    await assertBookingOpen(tenant.id);

    const body = await readJson<unknown>(req);
    const input = validateVisitInput(body);

    if (action === "status") {
      const open = await getOpenVisit(tenant.id, input);
      return NextResponse.json(ok({ open }, "Visit status"));
    }

    if (action === "checkin") {
      const visit = await checkInVisit(tenant.id, input);
      return NextResponse.json(ok({ visit }, "Checked in"), { status: HttpStatus.Created });
    }

    const visit = await checkOutVisit(tenant.id, input);
    return NextResponse.json(ok({ visit }, "Checked out"));
  });
}
