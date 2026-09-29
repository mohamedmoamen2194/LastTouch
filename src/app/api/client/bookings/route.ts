import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import { cancelClientBooking, getClientBookings } from "@/lib/marketplace/client";

/** GET /api/client/bookings?scope=upcoming|history — my bookings everywhere. */
export async function GET(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const scope = new URL(req.url).searchParams.get("scope") === "history" ? "history" : "upcoming";
    const bookings = await getClientBookings(userId, scope);
    return NextResponse.json(ok({ bookings }), { status: HttpStatus.Ok });
  });
}

const patchSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/client/bookings — cancel my booking. */
export async function PATCH(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await readJson<unknown>(req);
    const input = patchSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }
    try {
      await cancelClientBooking(userId, input.data.id);
    } catch (e) {
      return NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : "Cannot cancel" },
        { status: HttpStatus.BadRequest },
      );
    }
    return NextResponse.json(ok({ id: input.data.id }), { status: HttpStatus.Ok });
  });
}
