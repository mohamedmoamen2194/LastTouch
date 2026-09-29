"use client";

import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";

/** Small sign-out pill for the marketplace topbar (signed-in clients). */
export function TopbarSignOut() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => {
        void signOut().finally(() => router.refresh());
      }}
      className="flex items-center gap-1.5 rounded-full border border-[#c5c6cd]/60 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#091426]"
    >
      <LogOut className="h-3.5 w-3.5" />
      {t("signOut")}
    </button>
  );
}
