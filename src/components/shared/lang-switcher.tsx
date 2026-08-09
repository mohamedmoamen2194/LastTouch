"use client";

import { usePathname, useRouter } from "next/navigation";

const LOCALES = ["en", "ar"] as const;
const LABELS: Record<string, string> = { en: "EN", ar: "عربى" };

export function LangSwitcher() {
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
      className="rounded-full border border-[#c5c6cd]/60 bg-white/60 px-3 py-1 font-semibold uppercase tracking-wide transition-colors"
      style={{
        backgroundColor: "#091426",
        color: "#ffffff",
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