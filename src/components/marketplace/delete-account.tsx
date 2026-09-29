"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

/** Danger zone: permanently delete the client account (double confirm). */
export function DeleteAccount() {
  const t = useTranslations("client");
  const router = useRouter();
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!confirm(t("deleteConfirm1"))) return;
    if (!confirm(t("deleteConfirm2"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client/account", { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      await signOut();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-bold text-red-700">
        <TriangleAlert className="h-4 w-4" />
        {t("deleteTitle")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-red-700/80">{t("deleteBody")}</p>
      {error && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-red-700">{error}</p>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="mt-3 w-full rounded-full border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
      >
        {busy ? t("deleting") : t("deleteCta")}
      </button>
    </div>
  );
}
