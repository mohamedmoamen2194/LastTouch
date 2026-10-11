"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";

/** Owner toggle: appear (or hide) this store on the public marketplace. */
export function MarketplaceToggle({ slug, initial }: { slug: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, marketplaceEnabled: !on }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setOn(!on);
      router.refresh();
    } catch {
      // keep state
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-[#c5c6cd]/60 bg-white px-3 py-3 text-start disabled:opacity-50 sm:px-4"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <Store className="h-4 w-4 shrink-0 text-[#091426]" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#091426]">Marketplace listing</span>
          <span className="block truncate text-xs text-[#45474c]">
            {on ? "Visible to clients" : "Hidden from clients"}
          </span>
        </span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "start-[22px]" : "start-0.5"}`}
        />
      </span>
    </button>
  );
}
