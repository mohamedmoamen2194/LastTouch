import Link from "next/link";
import { Bot, Lock, Sparkles } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

export type ComingSoonIcon = "insights" | "assistant";

const ICONS = { insights: Sparkles, assistant: Bot } as const;

/**
 * Placeholder for plan-gated features that haven't shipped yet (Phase-5 AI).
 * Two modes, same size and shape so swapping to the real page needs no layout:
 * - mode "soon": tenant is on the right plan, feature is being finished.
 * - mode "upgrade": tenant's plan doesn't include the feature → plan CTA.
 */
export function ComingSoon({
  locale,
  slug,
  theme,
  icon,
  title,
  body,
  badge,
  mode,
  cta,
}: {
  locale: string;
  slug: string;
  theme: ThemeTokens;
  icon: ComingSoonIcon;
  title: string;
  body: string;
  badge: string;
  mode: "soon" | "upgrade";
  cta: string;
}) {
  const Icon = ICONS[icon];
  const soon = mode === "soon";

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold md:text-2xl" style={{ color: theme.primary }}>
            {title}
          </h1>
          <span
            className="mt-1 inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.secondary }}
          >
            {badge}
          </span>
        </div>
      </div>

      <div
        className="flex flex-col items-center rounded-2xl border border-dashed px-5 py-10 text-center sm:px-8 md:py-14"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
        >
          {soon ? <Icon className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </span>
        <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: theme.onSurfaceVariant }}>
          {body}
        </p>
        {!soon && (
          <Link
            href={`/${locale}/${slug}/dashboard#subscription`}
            className="mt-6 w-full rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            {cta}
          </Link>
        )}
      </div>
    </div>
  );
}
