import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ClientBooking } from "@/lib/marketplace/client";
import type { MarketplaceStore } from "@/lib/marketplace/stores";

function Row({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-[#091426]">{title}</h2>
      {children}
    </section>
  );
}

/** Nearest upcoming appointment with a shortcut to manage/scan it. */
export async function UpNextCard({ booking }: { booking: ClientBooking }) {
  const t = await getTranslations("marketplace");
  return (
    <Row title={t("upNextTitle")}>
      <Link
        href="/reservations"
        className="flex items-center gap-3 rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-lg font-bold text-[#091426]">
          {booking.logoUrl ? (
            <img src={booking.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            booking.businessName.charAt(0).toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[#091426]">{booking.businessName}</span>
          <span className="mt-0.5 block truncate text-xs text-[#45474c]">
            {booking.services.join(" · ")} ·{" "}
            <span dir="ltr" className="tabular-nums">
              {booking.startTime}
            </span>
          </span>
        </span>
        <span className="mp-solid shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white">
          {t("manageBooking")}
        </span>
      </Link>
    </Row>
  );
}

/** Points + referral balance in one compact strip. */
export async function NumbersStrip({
  points,
  referralBalance,
  locale,
}: {
  points: number;
  referralBalance: number;
  locale: string;
}) {
  const t = await getTranslations("client");
  const moneyLocale = locale === "ar" ? "ar-EG" : "en-US";
  const cards = [
    { value: points.toLocaleString(moneyLocale), label: t("pointsTotal"), href: "/history" as const },
    {
      value: `${referralBalance.toLocaleString(moneyLocale)} ${t("egp")}`,
      label: t("refBalance"),
      href: "/account" as const,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="text-xl font-bold tabular-nums text-[#091426]">{c.value}</p>
          <p className="mt-0.5 text-xs text-[#45474c]">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}

/** Most-visited stores as one-tap rebook shortcuts. */
export async function QuickRebookRow({ items }: { items: ClientBooking[] }) {
  const t = await getTranslations("marketplace");
  if (items.length === 0) return null;
  return (
    <Row title={t("quickRebookTitle")}>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((b) => (
          <Link
            key={b.id}
            href={`/book/${b.slug}?rebook=${b.id}`}
            className="flex w-44 shrink-0 snap-start items-center gap-2.5 rounded-2xl border border-[#c5c6cd]/60 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-base font-bold text-[#091426]">
              {b.logoUrl ? (
                <img src={b.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                b.businessName.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[#091426]">{b.businessName}</span>
              <span className="block truncate text-[11px] text-[#45474c]">{b.services[0] ?? "—"}</span>
            </span>
          </Link>
        ))}
      </div>
    </Row>
  );
}

/** Top-rated unvisited stores, compact horizontal cards. */
export async function ForYouRow({
  stores,
  locale,
}: {
  stores: MarketplaceStore[];
  locale: string;
}) {
  const t = await getTranslations("marketplace");
  const moneyLocale = locale === "ar" ? "ar-EG" : "en-US";
  if (stores.length === 0) return null;
  return (
    <Row title={t("forYouTitle")}>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stores.map((s) => (
          <Link
            key={s.id}
            href={`/book/${s.slug}`}
            className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex h-20 items-center justify-center bg-gradient-to-br from-[#1e293b] to-[#091426] text-xl font-bold text-white">
              {s.logoUrl ? (
                <img src={s.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                s.businessName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2.5">
              <p className="truncate text-xs font-bold text-[#091426]">{s.businessName}</p>
              <p className="flex items-center gap-1 text-[11px] text-[#45474c]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : t("new")}
                {s.priceFrom != null && (
                  <span className="ms-auto tabular-nums" dir="ltr">
                    {s.priceFrom.toLocaleString(moneyLocale)}
                  </span>
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </Row>
  );
}
