import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ForbiddenError, ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertFeature } from "@/lib/tenant/context";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import { REPORT_TYPES, buildReportCsv, type ReportType } from "@/lib/ai/reports";

const bodySchema = z.object({
  slug: z.string().min(1),
  type: z.enum(REPORT_TYPES as unknown as [ReportType, ...ReportType[]]),
  days: z.number().int().min(1).max(90).default(30),
});

/**
 * POST /api/ai/report — downloads a CSV report (revenue, appointments,
 * team, services, customers). Same gates as chat: owner/manager, active
 * subscription, ai_assistant flag. Read-only.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid report request");

    const ctx = await getDashboardAccess(input.data.slug);
    if (ctx.role !== "owner" && ctx.role !== "manager") throw new ForbiddenError();
    await assertSubscriptionAccess(ctx.tenantId);
    assertFeature(ctx, "ai_assistant");

    const { filename, csv } = await buildReportCsv(ctx, input.data.type, input.data.days);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
