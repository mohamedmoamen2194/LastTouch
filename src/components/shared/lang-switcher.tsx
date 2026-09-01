"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ThemeTokens } from "@/config/business-types";

const LOCALES = ["en", "ar"] as const;
const LABELS: Record<string, string> = { en: "EN", ar: "عربى" };

export function LangSwitcher({ theme }: { theme?: ThemeTokens }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = detectLocale(pathname);

  const switchTo = (target: string) => {
    // Swap the first path segment (current locale) for the target locale,
    // keeping the rest of the route intact.
    const parts = pathname.split("/");
    parts[1] = target;
    const next = parts.join("/") || `/${target}`;
    router.push(next, { scroll: false });
  };

  const target = LOCALES.find((l) => l !== locale) ?? "en";

  return (
    <button
      type="button"
      onClick={() => switchTo(target)}
      className="whitespace-nowrap rounded-full border border-[#c5c6cd]/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-3 sm:text-sm"
      style={{
        backgroundColor: theme?.primary ?? "#091426",
        color: theme?.onPrimary ?? "#ffffff",
      }}
    >
      {LABELS[locale]}
    </button>
  );
}

function detectLocale(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return LOCALES.includes(seg as (typeof LOCALES)[number]) ? seg : "en";
}