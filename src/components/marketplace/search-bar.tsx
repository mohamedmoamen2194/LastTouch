"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MarketplaceStore } from "@/lib/marketplace/stores";

type Props = {
  /** Current search params that must survive a search (filters/sort/nearby). */
  keep?: { type?: string; city?: string; sort?: string; nearby?: string; lat?: string; lng?: string };
};

/**
 * Marketplace search: instant suggestion dropdown while typing + a results
 * panel rendered directly under the search bar on submit (Enter / button).
 * All URL updates use `scroll: false` so the page never jumps to the top.
 */
export function MarketplaceSearch({ keep = {} }: Props) {
  const t = useTranslations("marketplace");
  const router = useRouter();
  const sp = useSearchParams();
  const initialQ = sp.get("q") ?? "";

  const [value, setValue] = useState(initialQ);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<MarketplaceStore[]>([]);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input in sync when URL changes via chips/filters (back/forward).
  useEffect(() => {
    setValue(sp.get("q") ?? "");
  }, [sp]);

  // Load the public catalog once for instant client-side suggestions.
  useEffect(() => {
    let alive = true;
    fetch("/api/marketplace/stores")
      .then((r) => r.json())
      .then((json) => {
        if (alive) setCatalog((json.data?.stores ?? []) as MarketplaceStore[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Close dropdown on outside tap / Escape.
  useEffect(() => {
    if (!open && submitted == null) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSubmitted(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, submitted]);

  const q = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return [];
    return catalog
      .filter((s) => `${s.businessName} ${s.city ?? ""} ${s.businessType}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [catalog, q]);

  const submittedResults = useMemo(() => {
    if (submitted == null) return null;
    const sq = submitted.trim().toLowerCase();
    if (!sq) return null;
    return catalog
      .filter((s) => `${s.businessName} ${s.city ?? ""} ${s.businessType}`.toLowerCase().includes(sq))
      .slice(0, 8);
  }, [catalog, submitted]);

  const applySearch = (nextQ: string) => {
    const p = new URLSearchParams(sp.toString());
    if (nextQ.trim()) p.set("q", nextQ.trim());
    else p.delete("q");
    // Preserve active filters/sort/nearby.
    if (keep.type) p.set("type", keep.type);
    if (keep.city) p.set("city", keep.city);
    if (keep.sort && keep.sort !== "recommended") p.set("sort", keep.sort);
    if (keep.nearby) {
      p.set("nearby", keep.nearby);
      if (keep.lat) p.set("lat", keep.lat);
      if (keep.lng) p.set("lng", keep.lng);
    }
    const qs = p.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    setSubmitted(nextQ.trim() ? nextQ.trim() : null);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applySearch(value);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a6]" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setSubmitted(null);
            }}
            onFocus={() => setOpen(true)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            autoComplete="off"
            className="w-full rounded-full border border-[#c5c6cd]/60 bg-white py-3 pe-10 ps-10 text-sm outline-none placeholder:text-[#9aa0a6] focus:border-[#091426]"
          />
          {value && (
            <button
              type="button"
              aria-label="clear"
              onClick={() => {
                setValue("");
                setSubmitted(null);
                applySearch("");
                inputRef.current?.focus();
              }}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#9aa0a6] hover:text-[#091426]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="submit" className="mp-solid shrink-0 rounded-full px-5 py-3 text-sm font-semibold text-white">
          {t("searchPlaceholder").split("…")[0]}
        </button>
      </form>

      {/* Instant suggestions dropdown */}
      {open && q.length > 0 && submitted == null && (
        <div className="absolute start-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-xl shadow-black/10">
          {suggestions.length === 0 ? (
            <p className="px-4 py-3.5 text-xs text-[#45474c]">{t("noStores")}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/book/${s.slug}`}
                    scroll={false}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[#f7f9fb]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-sm font-bold text-[#091426]">
                      {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-full w-full object-cover" /> : s.businessName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#091426]">{s.businessName}</span>
                      <span className="block truncate text-xs text-[#45474c]">
                        {[s.city, t(`type_${s.businessType}` as never)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#091426]">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : t("new")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => applySearch(value)}
            className={cn("w-full border-t border-[#c5c6cd]/50 px-4 py-2.5 text-center text-xs font-bold text-[#091426] hover:bg-[#f7f9fb]")}
          >
            {t("searchAllResults")}
          </button>
        </div>
      )}

      {/* Results panel directly under the search bar (on Enter / Search) */}
      {submittedResults != null && (
        <div className="absolute start-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-white shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-2 border-b border-[#c5c6cd]/50 px-4 py-2.5">
            <p className="truncate text-xs font-bold text-[#091426]">
              {t("searchResultsTitle", { count: submittedResults.length })}
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(null)}
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#45474c] hover:text-[#091426]"
            >
              <X className="h-3.5 w-3.5" />
              {t("closeResults")}
            </button>
          </div>
          {submittedResults.length === 0 ? (
            <p className="px-4 py-4 text-center text-xs text-[#45474c]">{t("noStores")}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto p-1.5">
              {submittedResults.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/book/${s.slug}`}
                    scroll={false}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[#f7f9fb]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff1f3] text-sm font-bold text-[#091426]">
                      {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-full w-full object-cover" /> : s.businessName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#091426]">{s.businessName}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-[#45474c]">
                        {s.city && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {s.city}
                          </span>
                        )}
                        <span>· {t(`type_${s.businessType}` as never)}</span>
                      </span>
                    </span>
                    <span className="mp-solid shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold text-white">{t("book")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
