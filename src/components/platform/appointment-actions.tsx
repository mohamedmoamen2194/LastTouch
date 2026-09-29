"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Platform rescue: reopen a mistakenly completed booking (claws back points). */
export function ReopenAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm("Reopen this completed booking? Its spend points will be removed.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", appointmentId }),
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
    <button
      type="button"
      disabled={busy}
      onClick={run}
      className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50"
    >
      Reopen
    </button>
  );
}
