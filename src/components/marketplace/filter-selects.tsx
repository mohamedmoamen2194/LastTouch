"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type DropdownOption = { value: string; label: string };

/**
 * Design-system dropdown: pill button with rotating chevron + floating
 * option list. Fully responsive (flex-1 on phones, auto width on desktop),
 * closes on outside tap / Escape, RTL-safe.
 */
export function Dropdown({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={rootRef} className={cn("relative min-w-0 flex-1 sm:flex-none", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        suppressHydrationWarning
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-full border border-[#c5c6cd]/60 bg-white px-4 py-2 text-xs font-semibold text-[#45474c] transition-colors hover:border-[#091426] sm:w-auto sm:min-w-[10rem]"
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute start-0 top-full z-50 mt-2 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-2xl border border-[#c5c6cd]/60 bg-white p-1.5 shadow-xl shadow-black/10 sm:w-auto"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value || "all"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors",
                    active ? "bg-[#eff1f3] text-[#091426]" : "text-[#45474c] hover:bg-[#f7f9fb]",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** City + sort dropdowns on the marketplace home (URL-driven). */
export function FilterSelects({ cities }: { cities: string[] }) {
  const t = useTranslations("marketplace");
  const router = useRouter();
  const sp = useSearchParams();

  const set = (key: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    const qs = p.toString();
    // replace + scroll:false keeps the user exactly where they are.
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  };

  return (
    <>
      <Dropdown
        label={t("allCities")}
        value={sp.get("city") ?? ""}
        onChange={(v) => set("city", v)}
        options={[{ value: "", label: t("allCities") }, ...cities.map((c) => ({ value: c, label: c }))]}
      />
      <Dropdown
        label={t("sortRecommended")}
        value={sp.get("sort") ?? "recommended"}
        onChange={(v) => set("sort", v)}
        options={[
          { value: "recommended", label: t("sortRecommended") },
          { value: "rating", label: t("sortRating") },
          { value: "name", label: t("sortName") },
        ]}
      />
    </>
  );
}
