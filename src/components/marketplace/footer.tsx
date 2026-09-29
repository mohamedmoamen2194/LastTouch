import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/booking/logo";

/**
 * Marketplace footer: brand, explore links, business links, and the
 * "Powered by" TAB.svg mark in its native 176:245 ratio.
 */
export async function MarketplaceFooter({ locale }: { locale: string }) {
  const t = await getTranslations("marketplace");
  void locale;

  return (
    <footer className="w-full border-t border-black/10 bg-[#fbfaf8] text-[#091426]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 p-6 sm:grid-cols-3 md:p-8">
        <div>
          <Logo className="h-6 w-auto" />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-[#45474c]">{t("subtitle")}</p>
        </div>
        <nav aria-label="explore">
          <p className="text-xs font-bold uppercase tracking-widest text-[#9aa0a6]">{t("footerExplore")}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm font-medium">
            <li><Link href="/" className="text-[#45474c] hover:text-[#091426]">{t("tabsHome")}</Link></li>
            <li><Link href="/reservations" className="text-[#45474c] hover:text-[#091426]">{t("tabsBookings")}</Link></li>
            <li><Link href="/history" className="text-[#45474c] hover:text-[#091426]">{t("tabsHistory")}</Link></li>
            <li><Link href="/account" className="text-[#45474c] hover:text-[#091426]">{t("tabsAccount")}</Link></li>
          </ul>
        </nav>
        <nav aria-label="business">
          <p className="text-xs font-bold uppercase tracking-widest text-[#9aa0a6]">{t("footerBusiness")}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm font-medium">
            <li><Link href="/partners" className="text-[#45474c] hover:text-[#091426]">{t("openPartners")}</Link></li>
            <li><Link href="/auth/sign-up?as=business" className="text-[#45474c] hover:text-[#091426]">{t("footerListStore")}</Link></li>
            <li><Link href="/auth/sign-in" className="text-[#45474c] hover:text-[#091426]">{t("signInCta")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-black/10">
        {/* Exact clearance for the floating pill (76px) + the phone's
            bottom safe-area, so the row sits just above the menu — never
            floating high, never covered. */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-6 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4 sm:flex-row md:px-8">
          <p className="text-xs text-[#45474c]">© 2026 LastTouch. {t("footerRights")}</p>
          <p className="flex items-center gap-2 text-xs font-medium text-[#45474c]">
            {t("footerPoweredBy")}
            {/* TAB.svg is 176×245 — fixed height keeps the ratio exact. */}
            <img src="/TAB.svg" alt="LastTouch" className="h-8 w-auto" />
          </p>
        </div>
      </div>
    </footer>
  );
}
