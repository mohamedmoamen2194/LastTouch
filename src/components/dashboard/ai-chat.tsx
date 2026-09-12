"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Download, Send } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type Msg = { role: "user" | "model"; text: string };
type Pending = { pendingId: string; tool: string; summary: string } | null;

/**
 * Owner/manager test console for the assistant brain (read-only v1).
 * Same tool path WhatsApp will use later — only the transport differs.
 */
export function AiChat({
  slug,
  theme,
  businessName,
}: {
  slug: string;
  theme: ThemeTokens;
  businessName: string;
}) {
  const t = useTranslations("ai");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [report, setReport] = useState<{ type: string; days: number; label: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll INSIDE the chat box only — never moves the page, so the input
  // stays put while messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, pending, report]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, message: text, history: next.slice(-20) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setMessages([...next, { role: "model", text: String(json.data.reply ?? "") }]);
      setPending((json.data.pending as Pending) ?? null);
      setReport((json.data.report as { type: string; days: number; label: string } | null) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = async () => {
    if (!report || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, type: report.type, days: report.days }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? "Request failed");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const name = disp.match(/filename="([^"]+)"/)?.[1] ?? `${report.type}-report.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setReport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const settle = async (confirm: boolean) => {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pendingId: pending.pendingId, confirm }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Request failed");
      setMessages((prev) => [
        ...prev,
        { role: "model", text: confirm ? t("consoleDone") : t("consoleDismissed") },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}
        >
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>
            {t("assistantTitle")}
          </h1>
          <p className="truncate text-xs" style={{ color: theme.onSurfaceVariant }}>
            {businessName} · {t("consoleHint")}
          </p>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex h-[55vh] flex-col gap-3 overflow-y-auto rounded-2xl border p-4 md:h-[60vh] md:p-5"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>
            {t("consoleEmpty")}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              style={
                m.role === "user"
                  ? { backgroundColor: theme.primary, color: theme.onPrimary }
                  : { backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-2.5 text-sm"
              style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
            >
              …
            </div>
          </div>
        )}
        {report && !busy && !pending && (
          <button
            type="button"
            onClick={() => void downloadReport()}
            className="flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            <Download className="h-4 w-4" />
            {t("consoleDownload")} ({report.type})
          </button>
        )}
        {pending && !busy && (
          <div
            className="rounded-2xl border-2 p-4"
            style={{ borderColor: theme.primary, backgroundColor: theme.surfaceContainerLowest }}
          >
            <p className="text-sm font-semibold" style={{ color: theme.primary }}>
              {pending.summary}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void settle(true)}
                className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold"
                style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
              >
                {t("consoleConfirm")}
              </button>
              <button
                type="button"
                onClick={() => void settle(false)}
                className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold"
                style={{ border: `2px solid ${theme.outlineVariant}`, color: theme.onSurfaceVariant }}
              >
                {t("consoleDismiss")}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "#ba1a1a", color: "#fff" }}>
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("consolePlaceholder")}
          className="min-w-0 flex-1 rounded-full border px-4 py-3 text-base outline-none"
          style={{
            borderColor: theme.outlineVariant,
            backgroundColor: theme.surfaceContainerLowest,
            color: theme.onSurfaceVariant,
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          aria-label={t("consoleSend")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
