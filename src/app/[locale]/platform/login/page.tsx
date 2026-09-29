import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getPlatformEmail } from "@/lib/platform/session";
import { hasPlatformSession } from "@/lib/platform/admin";
import { PlatformLoginForm } from "@/components/platform/login-form";

export const dynamic = "force-dynamic";

/** Public owner login. Signed-in admins (either method) skip straight in. */
export default async function PlatformLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  try {
    const { requirePlatformAdmin } = await import("@/lib/platform/admin");
    await requirePlatformAdmin();
    redirect(`/${locale}/platform`);
  } catch {
    // not logged in — show the form below
  }

  const email = getPlatformEmail() ?? "";
  const next = sp.next?.startsWith("/") ? sp.next : `/${locale}/platform`;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f4f6f8] px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0b1526] font-black text-white">
            L
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-[#101828]">LastTouch · Owner Admin</p>
            <p className="text-[11px] text-gray-500">Restricted area</p>
          </div>
        </div>
        <div className="mt-4">
          <PlatformLoginForm email={email} next={next} />
        </div>
      </div>
    </div>
  );
}
