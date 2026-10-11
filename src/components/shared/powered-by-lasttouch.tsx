"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Mail, Phone } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/components/shared/social-links";

type Props = {
  theme: ThemeTokens;
};

export function PoweredByLastTouch({ theme }: Props) {
  const t = useTranslations("footer");
  const locale = useLocale();

  return (
    <footer className="border-t bg-white/60" style={{ borderColor: theme.outlineVariant }}>
      <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-2.5 px-4 py-6 md:px-8">
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
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs" style={{ color: theme.onSurfaceVariant }}>
          <span className="font-semibold">{t("contactUs")}</span>
          <a href={SUPPORT_PHONE_HREF} dir="ltr" className="flex items-center gap-1.5 transition-opacity hover:opacity-75">
            <Phone className="h-3.5 w-3.5" />
            {SUPPORT_PHONE_DISPLAY}
          </a>
          <a href={SUPPORT_EMAIL_HREF} dir="ltr" className="flex items-center gap-1.5 transition-opacity hover:opacity-75">
            <Mail className="h-3.5 w-3.5" />
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}