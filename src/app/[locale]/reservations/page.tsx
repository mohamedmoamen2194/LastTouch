import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CalendarCheck } from "lucide-react";
import { getOptionalUserId } from "@/lib/auth/session";
import { getClientBookings, getClientProfile, clientAccentForGender } from "@/lib/marketplace/client";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { MarketplaceFooter } from "@/components/marketplace/footer";
import { BookingsList } from "@/components/marketplace/bookings-list";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";

export const dynamic = "force-dynamic";

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("client");
  const tm = await getTranslations("marketplace");

  const userId = await getOptionalUserId();
  const bookings = userId ? await getClientBookings(userId, "upcoming") : [];
  const profile = userId ? await getClientProfile(userId) : null;

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col text-[#191c1e]" style={{ "--mp-accent": clientAccentForGender(profile?.gender) } as Record<string, string>}>
      <MarketplaceTopbar signedIn={Boolean(userId)} />
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-1 flex-col gap-4 px-4 pb-10 pt-6 md:min-h-[calc(100vh-4rem)] md:min-h-[calc(100dvh-4rem)] md:px-8">
        <div>
          <h1 className="text-2xl font-bold text-[#091426]">{t("bookingsTitle")}</h1>
          <p className="mt-0.5 text-sm text-[#45474c]">{t("bookingsSubtitle")}</p>
        </div>
        {!userId ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#c5c6cd]/60 bg-white px-6 py-10 text-center shadow-sm">
            <span className="mp-solid flex h-14 w-14 items-center justify-center rounded-full text-white">
              <CalendarCheck className="h-6 w-6" />
            </span>
            <p className="max-w-sm text-sm font-bold text-[#091426]">{t("guestBookingsTitle")}</p>
            <p className="max-w-sm text-xs leading-relaxed text-[#45474c]">{t("guestBookingsBody")}</p>
            <Link
              href={`/auth/sign-in?redirect_url=/${locale}/reservations`}
              className="mp-solid rounded-full px-8 py-2.5 text-sm font-semibold text-white"
            >
              {t("guestLoginCta")}
            </Link>
          </div>
        ) : (
          <BookingsList
            bookings={bookings}
            emptyHint={
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#c5c6cd] bg-white px-5 py-10 text-center">
                <p className="text-sm text-[#45474c]">{t("noUpcoming")}</p>
                <Link href="/" className="mp-solid rounded-full px-6 py-2.5 text-sm font-semibold text-white">
                  {t("browseStores")}
                </Link>
              </div>
            }
          />
        )}
        <Link href="/history" className="text-center text-xs font-semibold text-[#45474c] underline">
          {tm("tabsHistory")} →
        </Link>
      </div>

      <MarketplaceFooter locale={locale} />

      <MarketplaceTabs guest={!userId} />
    </main>
  );
}
