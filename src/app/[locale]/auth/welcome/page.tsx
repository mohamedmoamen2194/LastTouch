import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getOptionalUserId } from "@/lib/auth/session";
import { getClientProfile, isProfileComplete } from "@/lib/marketplace/client";
import { getUserFirstTenantSlug } from "@/lib/tenant/home";
import { isPlatformAdminByUserId } from "@/lib/platform/admin";
import { Link } from "@/i18n/navigation";
import { WelcomeForm } from "@/components/marketplace/welcome-form";
import { Logo } from "@/components/booking/logo";

export const dynamic = "force-dynamic";

/**
 * Post-sign-up router for client accounts. Business members bounce to
 * their dashboard; finished profiles go home; everyone else completes
 * name / phone / gender here.
 */
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("client");

  const userId = await getOptionalUserId();
  if (!userId) redirect(`/${locale}/auth/sign-in?redirect_url=/${locale}/auth/welcome`);

  // Platform admins go straight to the admin panel.
  if (await isPlatformAdminByUserId(userId)) redirect(`/${locale}/platform`);

  const slug = await getUserFirstTenantSlug(userId);
  if (slug) redirect(`/${locale}/${slug}/dashboard`);

  const profile = await getClientProfile(userId);
  if (isProfileComplete(profile)) redirect(`/${locale}`);

  let clerkEmail = profile?.email ?? "";
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    clerkEmail = user.emailAddresses?.[0]?.emailAddress ?? clerkEmail;
  } catch {
    // fall back to stored email
  }

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col items-center px-4 py-10">
      <Logo className="h-7 w-auto" />
      <div className="mt-6 w-full max-w-md rounded-3xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-6">
        <h1 className="text-xl font-bold text-[#091426]">{t("welcomeTitle")}</h1>
        <p className="mt-1 text-sm text-[#45474c]">{t("welcomeSubtitle")}</p>
        <div className="mt-4">
          <WelcomeForm initialEmail={clerkEmail} />
        </div>
        <p className="mt-4 text-center text-xs text-[#45474c]">
          {t("welcomeOwnerHint")}{" "}
          <Link href="/onboard" className="font-semibold text-[#091426] underline">
            {t("welcomeOwnerCta")}
          </Link>
        </p>
      </div>
    </main>
  );
}
