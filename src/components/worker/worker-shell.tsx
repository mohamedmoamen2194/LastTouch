import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ExternalLink } from "lucide-react";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";
import { Logo } from "@/components/booking/logo";
import type { ThemeTokens } from "@/config/business-types";

type Props = {
  slug: string;
  locale: string;
  businessName: string;
  logoUrl?: string | null;
  theme: ThemeTokens;
  children: React.ReactNode;
};

export function WorkerShell({ slug, locale, businessName, logoUrl, theme, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur" style={{ borderColor: theme.outlineVariant }}>
        <div className="mx-auto flex h-16 w-full max-w-xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href={`/${locale}/worker/${slug}`} className="shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} className="h-8 w-auto max-w-[130px] object-contain" />
              ) : (
                <Logo />
              )}
            </Link>
            <span className="hidden truncate text-sm font-semibold sm:block" style={{ color: theme.primary }}>
              {businessName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LangSwitcher />
            <Link
              href={`/${locale}/book/${slug}`}
              target="_blank"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold sm:flex"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              Store
              <ExternalLink className="h-3 w-3" />
            </Link>
            <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">{children}</main>
      <PoweredByLastTouch theme={theme} />
    </div>
  );
}
