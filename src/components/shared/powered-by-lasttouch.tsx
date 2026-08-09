"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ThemeTokens } from "@/config/business-types";

type Props = {
  theme: ThemeTokens;
};

export function PoweredByLastTouch({ theme }: Props) {
  const t = useTranslations("footer");
  const locale = useLocale();

  return (
    <footer className="border-t bg-white/60" style={{ borderColor: theme.outlineVariant }}>
      <div className="mx-auto flex max-w-screen-xl items-center justify-center gap-3 px-4 py-6 md:px-8">
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          aria-label={t("poweredBy")}
        >
          <img src="/logo.svg" alt="LastTouch" className="h-5 w-auto sm:h-6" />
          <span className="whitespace-nowrap text-xs font-medium sm:text-sm" style={{ color: theme.onSurfaceVariant }}>
            {t("poweredBy")}
          </span>
        </Link>
      </div>
    </footer>
  );
}