"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { MarketplaceStore } from "@/lib/marketplace/stores";

const KEY = "lt-recent-stores";
const MAX = 8;

/** Remember a visited store slug (most recent first, deduped). */
export function RecordRecentStore({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
      const next = [slug, ...raw.filter((s) => s !== slug)].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode etc. — browsing still works
    }
  }, [slug]);
  return null;
}

/** "Continue where you left off" — recently viewed stores carousel. */
export function ContinueRow() {
  const t = useTranslations("marketplace");
  const [stores, setStores] = useState<MarketplaceStore[] | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      const slugs = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
      if (slugs.length === 0) {
        setStores([]);
        return;
      }
      void fetch("/api/marketplace/stores")
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const all = (j.data?.stores ?? []) as MarketplaceStore[];
          const bySlug = new Map(all.map((s) => [s.slug, s]));
          setStores(slugs.map((s) => bySlug.get(s)).filter((s): s is MarketplaceStore => Boolean(s)));
        })
        .catch(() => alive && setStores([]));
    } catch {
      setStores([]);
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!stores || stores.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-[#091426]">{t("continueTitle")}</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stores.map((s) => (
          <Link
            key={s.id}
            href={`/book/${s.slug}`}
            className="flex w-44 shrink-0 snap-start items-center gap-2.5 rounded-2xl border border-[#c5c6cd]/60 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-base font-bold text-[#091426]">
              {s.logoUrl ? (
                <img src={s.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                s.businessName.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[#091426]">{s.businessName}</span>
              <span className="block truncate text-[11px] text-[#45474c]">{s.city ?? ""}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
