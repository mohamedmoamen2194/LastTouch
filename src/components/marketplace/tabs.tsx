"use client";

import { CalendarCheck, History, Home, Store, User } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Floating pill tab bar. Guests get Partners instead of Account;
 * signed-in users get Account instead of Partners.
 */
export function MarketplaceTabs({ guest = false }: { guest?: boolean }) {
  const t = useTranslations("marketplace");
  const pathname = usePathname();
  const locale = useLocale();

  const tabs = [
    { href: "/", label: t("tabsHome"), icon: Home, active: pathname === `/${locale}` || pathname === "/" },
    { href: "/reservations", label: t("tabsBookings"), icon: CalendarCheck, active: pathname.includes("/reservations") },
    { href: "/history", label: t("tabsHistory"), icon: History, active: pathname.includes("/history") },
    ...(guest
      ? [{ href: "/partners", label: t("tabsPartners"), icon: Store, active: pathname.includes("/partners") }]
      : [{ href: "/account", label: t("tabsAccount"), icon: User, active: pathname.includes("/account") }]),
  ];

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-6 sm:bottom-5"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="marketplace"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-full border border-black/5 bg-white/95 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-md">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition-colors",
              tab.active ? "mp-solid text-white" : "text-[#45474c] hover:text-[#091426]",
            )}
          >
            <tab.icon className="h-5 w-5" strokeWidth={tab.active ? 2.5 : 2} />
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
