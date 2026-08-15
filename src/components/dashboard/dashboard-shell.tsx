"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { PoweredByLastTouch } from "@/components/shared/powered-by-lasttouch";
import { LayoutDashboard, CalendarDays, Users, Scissors, Contact, Settings, ExternalLink } from "lucide-react";
import { Logo } from "@/components/booking/logo";

import type { ThemeTokens } from "@/config/business-types";

type Props = {
  slug: string;
  businessName: string;
  theme: ThemeTokens;
  logoUrl?: string | null;
  children: React.ReactNode;
};

export function DashboardShell({ slug, businessName, theme, logoUrl, children }: Props) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();

  const items = [
    { href: `/${locale}/${slug}/dashboard`, key: "dashboard", icon: LayoutDashboard },
    { href: `/${locale}/${slug}/appointments`, key: "appointments", icon: CalendarDays },
    { href: `/${locale}/${slug}/customers`, key: "customers", icon: Users },
    { href: `/${locale}/${slug}/services`, key: "services", icon: Scissors },
    { href: `/${locale}/${slug}/employees`, key: "employees", icon: Contact },
    { href: `/${locale}/${slug}/settings`, key: "settings", icon: Settings },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur-md" style={{ borderColor: theme.outlineVariant }}>
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Link href={`/${locale}/${slug}/dashboard`}>
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} className="h-9 w-auto max-w-[160px] object-contain" />
              ) : (
                <Logo />
              )}
            </Link>
            <span className="hidden text-sm font-semibold md:block" style={{ color: theme.primary }}>{businessName}</span>
          </div>
          <div className="flex items-center gap-3">
            <LangSwitcher />
            <a
              href={`/${locale}/book/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold sm:flex"
              style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
            >
              {t("bookPublic")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <UserButton
              afterSignOutUrl={`/${locale}`}
              appearance={{ elements: { avatarBox: { width: 36, height: 36 } } }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 gap-6 px-4 py-8 md:px-8">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-56 shrink-0 flex-col gap-1 md:flex">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? theme.primary : "transparent",
                  color: active ? theme.onPrimary : theme.onSurfaceVariant,
                }}
              >
                <Icon className="h-4 w-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </aside>

        {/* Mobile floating bottom nav */}
        <div className="fixed inset-x-2 bottom-2 z-40 md:hidden sm:inset-x-4 sm:bottom-4">
          <MobileNav
            items={items}
            bookHref={`/${locale}/book/${slug}`}
            isActive={isActive}
            activeColor={theme.onPrimary}
            inactiveColor={withAlpha(theme.onPrimary, 0.62)}
            navBg={theme.primary}
          />
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-28 md:pb-0">{children}</main>
      </div>

      <div className="pb-20 md:pb-0">
        <PoweredByLastTouch theme={theme} />
      </div>
    </div>
  );
}

function MobileNav({
  items,
  bookHref,
  isActive,
  activeColor,
  inactiveColor,
  navBg,
}: {
  items: { href: string; key: string; icon: React.ElementType }[];
  bookHref: string;
  isActive: (href: string) => boolean;
  activeColor: string;
  inactiveColor: string;
  navBg: string;
}) {
  const t = useTranslations("nav");
  return (
    <nav
      className="flex items-center justify-around gap-0.5 rounded-2xl p-1.5 shadow-lg"
      style={{ backgroundColor: navBg }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight"
            style={{
              color: active ? activeColor : inactiveColor,
              backgroundColor: active ? withAlpha(activeColor, 0.18) : "transparent",
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="max-w-full truncate px-0.5">{t(item.key)}</span>
          </Link>
        );
      })}
      <a
        href={bookHref}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight"
        style={{ color: inactiveColor }}
        aria-label={t("bookPublic")}
      >
        <ExternalLink className="h-4 w-4 shrink-0" />
        <span className="max-w-full truncate px-0.5">{t("bookPublic")}</span>
      </a>
    </nav>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}