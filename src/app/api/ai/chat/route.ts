import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok } from "@/lib/response";
import { ForbiddenError, ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertFeature } from "@/lib/tenant/context";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import { BRAIN_MODEL, runBrainTurn, type ChatTurn } from "@/lib/ai/client";
import { ASSISTANT_TOOLS, buildAssistantSystem, executeAssistantTool } from "@/lib/ai/assistant-tools";
import { db } from "@/db";
import { aiLogs } from "@/db/schema";

const turnSchema = z.object({ role: z.enum(["user", "model"]), text: z.string().max(4000) });
const bodySchema = z.object({
  slug: z.string().min(1),
  message: z.string().min(1).max(2000),
  history: z.array(turnSchema).max(20).default([]),
});

function cairoToday(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

/**
 * POST /api/ai/chat — dashboard test console for the assistant brain.
 * Owner/manager only, active subscription + ai_assistant flag required.
 * v1 is read-only; every turn is logged to ai_logs (best-effort).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) throw new ValidationAppError("Invalid chat payload");

    const ctx = await getDashboardAccess(input.data.slug);
    if (ctx.role !== "owner" && ctx.role !== "manager") throw new ForbiddenError();
    await assertSubscriptionAccess(ctx.tenantId);
    assertFeature(ctx, "ai_assistant");

    const history: ChatTurn[] = input.data.history.map((t) => ({ role: t.role, text: t.text }));
    const system = buildAssistantSystem({
      businessName: ctx.businessName,
      locale: "auto",
      todayYmd: cairoToday(),
    });

    const started = Date.now();
    let staged: { pendingId: string; tool: string; summary: string } | null = null;
    let report: { type: string; days: number } | null = null;
    const result = await runBrainTurn({
      system,
      history,
      message: input.data.message,
      tools: ASSISTANT_TOOLS,
      execute: async (name, args) => {
        const out = (await executeAssistantTool(ctx, name, args)) as Record<string, unknown>;
        if (out && out.needsConfirmation === true && typeof out.pendingId === "string") {
          staged = {
            pendingId: out.pendingId,
            tool: String(out.tool ?? name),
            summary: String(out.summary ?? name),
          };
        }
        if (out && out.reportReady === true && typeof out.type === "string") {
          report = { type: out.type, days: typeof out.days === "number" ? out.days : 30 };
        }
        return out;
      },
    });

    // Best-effort audit log — chat must never fail because logging did.
    try {
      await db.insert(aiLogs).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        assistantType: "assistant",
        provider: "gemini",
        model: BRAIN_MODEL,
        prompt: input.data.message.slice(0, 4000),
        response: result.text.slice(0, 8000),
        tokensUsed: result.totalTokens,
        latencyMs: Date.now() - started,
        toolCalls: result.calls as unknown[],
      });
    } catch {
      /* noop */
    }

    return NextResponse.json(ok({ reply: result.text, pending: staged, report }, "Assistant reply"));
  });
}
