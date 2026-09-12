import { GoogleGenerativeAI, type Content, type Part } from "@google/generative-ai";

/**
 * Gemini brain client (server-only — never import from client components).
 * Key lives in GEMINI_API_KEY env, never in code. v1 model:
 * gemini-3.5-flash-lite (stable current-gen; older Flash models 404 for new
 * API accounts. Strong Arabic, native function calling, free tier).
 */
const MODEL = "gemini-3.5-flash-lite";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

export type ChatTurn = { role: "user" | "model"; text: string };
export type ToolDef = {
  name: string;
  description: string;
  // JSON-schema-ish declaration passed straight to the model.
  parameters: { type: "OBJECT"; properties: Record<string, unknown>; required?: string[] };
};

export type BrainResult = {
  text: string;
  calls: { name: string; args: Record<string, unknown> }[];
  totalTokens: number;
};

/**
 * Runs one agentic turn: model → (tool calls → execute → feed back) × N →
 * final text. `execute` runs server-side with the tenant context.
 */
export async function runBrainTurn(args: {
  system: string;
  history: ChatTurn[];
  message: string;
  tools: ToolDef[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
}): Promise<BrainResult> {
  const gen = new GoogleGenerativeAI(apiKey());
  const model = gen.getGenerativeModel({
    model: MODEL,
    systemInstruction: args.system,
    tools: [{ functionDeclarations: args.tools as never[] }],
  });

  const textPart = (text: string): Part => ({ text }) as Part;
  const contents: Content[] = [
    ...args.history.map((t) => ({
      role: t.role === "model" ? "model" : "user",
      parts: [textPart(t.text)],
    })),
    { role: "user", parts: [textPart(args.message)] },
  ];

  const calls: BrainResult["calls"] = [];
  let totalTokens = 0;
  const rounds = args.maxRounds ?? 5;

  for (let i = 0; i < rounds; i++) {
    const res = await model.generateContent({ contents });
    const response = res.response;
    totalTokens += response.usageMetadata?.totalTokenCount ?? 0;
    const fnCalls = response.functionCalls() ?? [];
    if (fnCalls.length === 0) {
      return { text: response.text(), calls, totalTokens };
    }
    const responseParts: Part[] = [];
    for (const c of fnCalls) {
      const cArgs = (c.args ?? {}) as Record<string, unknown>;
      calls.push({ name: c.name, args: cArgs });
      let result: unknown;
      try {
        result = await args.execute(c.name, cArgs);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" };
      }
      responseParts.push({ functionResponse: { name: c.name, response: { result } } } as Part);
    }
    // Echo the model's ORIGINAL parts verbatim (thought signatures are
    // required); tool results ride as "user" (no "function" role exists).
    const modelParts = response.candidates?.[0]?.content?.parts ?? [];
    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: responseParts });
  }

  // Out of rounds: force a text close-out.
  const res = await model.generateContent({
    contents: [...contents, { role: "user", parts: [textPart("Summarize what you found so far in one short message.")] }],
  });
  totalTokens += res.response.usageMetadata?.totalTokenCount ?? 0;
  return { text: res.response.text(), calls, totalTokens };
}

export const BRAIN_MODEL = MODEL;
