import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveTenantForBooking } from "@/modules/booking/domain/catalog";
import { createPublicReview } from "@/modules/reviews/application/reviews";

const bodySchema = z.object({
  slug: z.string().min(1),
  visitId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

/** POST /api/reviews — public rating after a completed visit. */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`reviews:${clientIp(req)}`, 10);
    const parsed = bodySchema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) throw new ValidationAppError("Invalid review");
    const tenant = await resolveTenantForBooking(parsed.data.slug);
    const result = await createPublicReview(tenant.id, parsed.data);
    return NextResponse.json(ok(result, result.created ? "Review submitted" : "Review already submitted"), {
      status: result.created ? HttpStatus.Created : HttpStatus.Ok,
    });
  });
}
