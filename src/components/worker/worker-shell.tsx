"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  Clock3,
  Contact,
  ExternalLink,
  Receipt,
  Scissors,
  ShoppingBag,
  Wrench,
} from "lucide-react";
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
  /** Effective permission keys for the signed-in worker. */
  permissions: string[];
  children: React.ReactNode;
};

type NavItem = {
  key: string;
  href: string;
  icon: React.ElementType;
  permission: string;
  exact?: boolean;
};

export function WorkerShell({
  slug,
  locale,
  businessName,
  logoUrl,
  theme,
  permissions,
  children,
}: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const granted = new Set(permissions);

  const items: NavItem[] = [
    {
      key: "attendance",
      href: `/${locale}/worker/${slug}`,
      icon: Clock3,
      permission: "attendance.use",
      exact: true,
    },
    {
      key: "appointments",
      href: `/${locale}/${slug}/appointments`,
      icon: CalendarDays,
      permission: "appointments.read",
    },
    {
      key: "customers",
      href: `/${locale}/${slug}/customers`,
      icon: Contact,
      permission: "customers.read",
    },
    {
      key: "services",
      href: `/${locale}/${slug}/services`,
      icon: Scissors,
      permission: "services.read",
    },
    {
      key: "products",
      href: `/${locale}/${slug}/products`,
      icon: ShoppingBag,
      permission: "inventory.read",
    },
    {
      key: "machines",
      href: `/${locale}/${slug}/machines`,
      icon: Wrench,
      permission: "inventory.read",
    },
    {
      key: "sales",
      href: `/${locale}/${slug}/sales`,
      icon: Receipt,
      permission: "sales.read",
    },
  ].filter((item) => granted.has(item.permission));

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: theme.background }}>
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur" style={{ borderColor: theme.outlineVariant }}>
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4">
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

        {items.length > 0 && (
          <div className="mx-auto w-full max-w-2xl px-3 pb-2">
            <nav
              className="flex items-center gap-1 overflow-x-auto rounded-xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.outlineVariant}` }}
            >
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="flex min-w-0 flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? theme.primary : "transparent",
                      color: active ? theme.onPrimary : theme.onSurfaceVariant,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{t(item.key)}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
      <PoweredByLastTouch theme={theme} />
    </div>
  );
}
