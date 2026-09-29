"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubQuickActions({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState(1);

  const run = async (action: "extend" | "cancel" | "reactivate" | "expire" | "renew" | "toggle_renew") => {
    if (!confirm(`Run "${action}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action, months }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="number"
        min={1}
        max={36}
        value={months}
        onChange={(e) => setMonths(Number(e.target.value))}
        className="w-14 rounded-lg border px-1.5 py-1 text-xs"
        title="Months to extend"
      />
      {(["extend", "renew", "reactivate", "cancel", "expire", "toggle_renew"] as const).map((a) => (
        <button
          key={a}
          disabled={busy}
          onClick={() => run(a)}
          className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {a}
        </button>
      ))}
    </div>
  );
}
