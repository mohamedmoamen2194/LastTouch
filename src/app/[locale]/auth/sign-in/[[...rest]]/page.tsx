import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured, getOptionalUserId } from "@/lib/auth/session";
import { getUserFirstTenant, tenantHomePath } from "@/lib/tenant/home";
import { isPlatformAdminByUserId } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { locale } = await params;
  const { redirect_url } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const redirectUrl = safeRedirect(redirect_url);
  const afterAuth = redirectUrl ?? `/${locale}/auth/welcome`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fb] px-4 py-10 md:px-6 md:py-6">
      {/* Non-blocking: streams with the response, redirects signed-in users
           once resolved — never holds up first paint (avoids DB cold starts). */}
      <Suspense fallback={null}>
        <AlreadySignedInRedirect locale={locale} redirectUrl={redirectUrl} />
      </Suspense>
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#091426]">{t("signIn")}</h1>
        <div className="mt-6 rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-8">
          {!isClerkConfigured() ? (
            <p className="rounded-lg bg-[#fff8e1] px-4 py-3 text-sm text-[#5d4037]">
              Authentication is not configured on this deployment. Set
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, then
              redeploy.
            </p>
          ) : (
          <SignIn
            routing="path"
            path={`/${locale}/auth/sign-in`}
            signUpUrl={`/${locale}/auth/sign-up${redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""}`}
            fallbackRedirectUrl={afterAuth}
            signUpFallbackRedirectUrl={afterAuth}
          />
          )}
        </div>
      </div>
    </main>
  );
}

async function AlreadySignedInRedirect({
  locale,
  redirectUrl,
}: {
  locale: string;
  redirectUrl: string | null;
}) {
  const userId = await getOptionalUserId();
  if (userId) {
    if (redirectUrl) redirect(redirectUrl);
    // Platform admins go straight to the admin panel.
    if (await isPlatformAdminByUserId(userId)) redirect(`/${locale}/platform`);
    const home = await getUserFirstTenant(userId);
    // Members land on their role panel; everyone else goes through the
    // welcome router (finished profiles bounce home, new users get the
    // client info form — nobody lands anywhere unfinished).
    redirect(home ? tenantHomePath(locale, home.slug, home.role) : `/${locale}/auth/welcome`);
  }
  return null;
}

/** Only same-site absolute paths are allowed as post-auth redirects. */
function safeRedirect(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}