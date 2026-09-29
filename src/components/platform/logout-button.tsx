"use client";

import { useRouter } from "next/navigation";

/** Clears the platform password session (and does nothing to Clerk). */
export function PlatformLogoutButton({ locale }: { locale: string }) {
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch("/api/platform/login", { method: "DELETE" });
    } finally {
      router.push(`/${locale}/platform/login`);
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      Log out
    </button>
  );
}
