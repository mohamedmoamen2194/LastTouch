"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

/** Heart toggle on store cards (signed-in clients only). */
export function FavoriteButton({ tenantId, initial }: { tenantId: string; initial: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/client/favorites", {
        method: fav ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.status === 401) {
        router.push(`/${locale}/auth/sign-in`);
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error();
      setFav(!fav);
      router.refresh();
    } catch {
      // stay as-is
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="favorite"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-transform active:scale-90"
    >
      <Heart className={`h-4 w-4 ${fav ? "fill-red-500 text-red-500" : "text-[#45474c]"}`} />
    </button>
  );
}
