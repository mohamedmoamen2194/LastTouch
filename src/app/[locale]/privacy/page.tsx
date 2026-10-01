import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketplaceTopbar } from "@/components/marketplace/topbar";
import { MarketplaceTabs } from "@/components/marketplace/tabs";
import { MarketplaceFooter } from "@/components/marketplace/footer";
import { getOptionalUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return {
    title: t("privacyTitle"),
    description: t("privacyIntro"),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const userId = await getOptionalUserId();

  const sections = [1, 2, 3, 4, 5].map((n) => ({
    t: t(`privacyS${n}T` as never),
    b: t(`privacyS${n}B` as never),
  }));

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col text-[#191c1e]">
      <MarketplaceTopbar signedIn={Boolean(userId)} />
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-10 pt-6 md:min-h-[calc(100vh-4rem)] md:min-h-[calc(100dvh-4rem)] md:px-8">
        <div>
          <h1 className="text-2xl font-bold text-[#091426] md:text-3xl">{t("privacyTitle")}</h1>
          <p className="mt-1 text-xs text-[#45474c]">{t("privacyUpdated")}</p>
        </div>
        <section className="rounded-3xl border border-[#c5c6cd]/60 bg-white p-6 md:p-8">
          <p className="text-sm leading-relaxed text-[#45474c] md:text-base">{t("privacyIntro")}</p>
          <div className="mt-2 flex flex-col">
            {sections.map((s, i) => (
              <div key={s.t} className="flex gap-4 border-t border-[#c5c6cd]/50 py-5 first:border-t-0">
                <span className="shrink-0 text-2xl font-bold tabular-nums text-[#c5c6cd]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#091426] md:text-base">{s.t}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#45474c] md:text-sm">{s.b}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <MarketplaceFooter locale={locale} />
      <MarketplaceTabs />
    </main>
  );
}
