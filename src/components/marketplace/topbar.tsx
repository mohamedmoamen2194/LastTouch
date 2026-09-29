import { Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/booking/logo";
import { LangSwitcher } from "@/components/shared/lang-switcher";
import { TopbarSignOut } from "@/components/marketplace/topbar-signout";

/**
 * Shared top bar for all marketplace pages.
 * Guests: lang + own-a-store CTA + explicit Sign in button.
 * Signed-in clients: lang + sign out (no store CTA).
 */
export async function MarketplaceTopbar({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("marketplace");
  const ta = await getTranslations("auth");

  return (
    <header className="sticky top-0 z-40 border-b border-[#c5c6cd]/40 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4 md:h-16 md:px-8">
        <Link href="/" aria-label="home">
          <Logo className="h-5 w-auto md:h-6" />
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitcher />
          {!signedIn ? (
            <>
              <Link
                href="/partners"
                className="hidden items-center gap-1.5 rounded-full border border-[#c5c6cd]/60 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#091426] sm:flex"
              >
                <Store className="h-3.5 w-3.5" />
                {t("openPartners")}
              </Link>
              <Link
                href="/auth/sign-in"
                className="mp-solid rounded-full px-4 py-1.5 text-xs font-semibold text-white sm:px-5 sm:py-2 sm:text-sm"
              >
                {ta("signIn")}
              </Link>
            </>
          ) : (
            <TopbarSignOut />
          )}
        </div>
      </div>
    </header>
  );
}
