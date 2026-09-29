import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { History, Star } from "lucide-react";
import { getOptionalUserId } from "@/lib/auth/session";
import { getClientBookings, getClientProfile, getClientPointsTotal, clientAccentForGender } from "@/lib/marketplace/client";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { MarketplaceFooter } from "@/components/marketplace/footer";
import { BookingsList } from "@/components/marketplace/bookings-list";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("client");

  const userId = await getOptionalUserId();
  const bookings = userId ? await getClientBookings(userId, "history") : [];
  const profile = userId ? await getClientProfile(userId) : null;
  const points = userId ? await getClientPointsTotal(userId) : 0;

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col text-[#191c1e]" style={{ "--mp-accent": clientAccentForGender(profile?.gender) } as Record<string, string>}>
      <MarketplaceTopbar signedIn={Boolean(userId)} />
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-1 flex-col gap-4 px-4 pb-10 pt-6 md:min-h-[calc(100vh-4rem)] md:min-h-[calc(100dvh-4rem)] md:px-8">
        <div>
          <h1 className="text-2xl font-bold text-[#091426]">{t("historyTitle")}</h1>
          <p className="mt-0.5 text-sm text-[#45474c]">{t("historySubtitle")}</p>
        </div>
        {!userId ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#c5c6cd]/60 bg-white px-6 py-10 text-center shadow-sm">
            <span className="mp-solid flex h-14 w-14 items-center justify-center rounded-full text-white">
              <History className="h-6 w-6" />
            </span>
            <p className="max-w-sm text-sm font-bold text-[#091426]">{t("guestHistoryTitle")}</p>
            <p className="max-w-sm text-xs leading-relaxed text-[#45474c]">{t("guestHistoryBody")}</p>
            <Link
              href={`/auth/sign-in?redirect_url=/${locale}/history`}
              className="mp-solid rounded-full px-8 py-2.5 text-sm font-semibold text-white"
            >
              {t("guestLoginCta")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mp-solid flex items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
                <Star className="h-5 w-5 fill-amber-300 text-amber-300" />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none">{points.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}</p>
                <p className="mt-1 text-xs text-white/75">{t("pointsTotal")}</p>
              </div>
            </div>
            <BookingsList
              bookings={bookings}
              rebook
              emptyHint={
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#c5c6cd] bg-white px-5 py-10 text-center">
                  <p className="text-sm text-[#45474c]">{t("noHistory")}</p>
                  <Link href="/" className="mp-solid rounded-full px-6 py-2.5 text-sm font-semibold text-white">
                    {t("browseStores")}
                  </Link>
                </div>
              }
            />
          </>
        )}
      </div>

      <MarketplaceFooter locale={locale} />

      <MarketplaceTabs guest={!userId} />
    </main>
  );
}
