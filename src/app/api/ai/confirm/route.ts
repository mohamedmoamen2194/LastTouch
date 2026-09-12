import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ForbiddenError, ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertFeature } from "@/lib/tenant/context";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import { settlePending } from "@/lib/ai/write-actions";

const bodySchema = z.object({
  slug: z.string().min(1),
  pendingId: z.string().uuid(),
  confirm: z.boolean(),
});

/**
 * POST /api/ai/confirm — settles a staged write (Confirm/Dismiss).
 * Same gates as chat: owner/manager, active subscription, ai_assistant flag.
 * Single-use + 10-minute expiry enforced in settlePending.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid confirmation payload");

    const ctx = await getDashboardAccess(input.data.slug);
    if (ctx.role !== "owner" && ctx.role !== "manager") throw new ForbiddenError();
    await assertSubscriptionAccess(ctx.tenantId);
    assertFeature(ctx, "ai_assistant");

    const result = await settlePending(ctx, input.data.pendingId, input.data.confirm);
    return NextResponse.json(
      ok(result, result.done ? "Action completed" : "Action dismissed"),
    );
  });
}
