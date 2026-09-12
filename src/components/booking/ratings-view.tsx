import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ThemeTokens } from "@/config/business-types";

/**
 * Public ratings panel: store aggregate + per-worker scores.
 * Server-rendered from live review/employee rows.
 */
export async function RatingsView({
  theme,
  storeRating,
  workers,
}: {
  theme: ThemeTokens;
  storeRating: { avg: number; count: number } | null;
  workers: { name: string; role: string | null; rating: number }[];
}) {
  const t = await getTranslations("booking");

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: theme.primary }}>
          {t("ratingsTitle")}
        </h2>
      </div>

      <div
        className="flex items-center justify-between gap-3 rounded-2xl border p-5"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <span className="text-sm font-medium" style={{ color: theme.onSurfaceVariant }}>
          {t("storeRating")}
        </span>
        {storeRating && storeRating.count > 0 ? (
          <span className="text-start">
            <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums" style={{ color: theme.primary }}>
              <Star className="h-5 w-5" />
              {storeRating.avg.toFixed(1)}
            </span>
            <span className="mt-0.5 block text-xs tabular-nums" style={{ color: theme.secondary }}>
              {t("ratingsCount", { count: storeRating.count })}
            </span>
          </span>
        ) : (
          <span className="text-sm" style={{ color: theme.secondary }}>
            {t("noRatings")}
          </span>
        )}
      </div>

      {workers.length > 0 && (
        <ul
          className="divide-y rounded-2xl border"
          style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
        >
          {workers.map((w) => (
            <li key={w.name} className="flex items-center gap-3 px-5 py-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.primary }}
              >
                {w.name.trim().charAt(0).toUpperCase() || "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" style={{ color: theme.primary }}>
                  {w.name}
                </span>
                {w.role && (
                  <span className="block truncate text-xs" style={{ color: theme.secondary }}>
                    {w.role}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" style={{ color: theme.primary }}>
                <Star className="h-4 w-4" />
                {w.rating > 0 ? w.rating.toFixed(1) : "–"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
