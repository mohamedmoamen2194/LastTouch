import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { Scissors, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { isClerkConfigured, getOptionalUserId } from "@/lib/auth/session";
import { getUserFirstTenantSlug } from "@/lib/tenant/home";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  // ?as=business (partners CTA) keeps the owner flow; ?as=client starts the
  // client flow; no param shows the role chooser first.
  const role = sp.as === "business" ? "business" : sp.as === "client" ? "client" : null;
  const afterAuth = role === "business" ? `/${locale}/onboard` : role === "client" ? `/${locale}/auth/welcome` : `/${locale}`;

  if (!role) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fb] px-4 py-10 md:px-6">
        <Suspense fallback={null}>
          <AlreadySignedInRedirect locale={locale} forBusiness={false} />
        </Suspense>
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-center text-2xl font-bold text-[#091426]">{t("joinTitle")}</h1>
          <p className="mb-6 text-center text-sm text-[#45474c]">{t("joinSubtitle")}</p>
          <div className="flex flex-col gap-3">
            <Link
              href="/auth/sign-up?as=client"
              className="flex items-center gap-4 rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eff1f3]">
                <Sparkles className="h-5 w-5 text-[#091426]" />
              </span>
              <span>
                <span className="block font-bold text-[#091426]">{t("joinClientTitle")}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#45474c]">{t("joinClientBody")}</span>
              </span>
            </Link>
            <Link
              href="/auth/sign-up?as=business"
              className="flex items-center gap-4 rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#091426]">
                <Scissors className="h-5 w-5 text-white" />
              </span>
              <span>
                <span className="block font-bold text-[#091426]">{t("joinBusinessTitle")}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#45474c]">{t("joinBusinessBody")}</span>
              </span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fb] px-4 py-10 md:px-6 md:py-6">
      {/* Non-blocking: streams with the response, redirects signed-in users
           once resolved — never holds up first paint (avoids DB cold starts). */}
      <Suspense fallback={null}>
        <AlreadySignedInRedirect locale={locale} forBusiness={role === "business"} />
      </Suspense>
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#091426]">
          {role === "client" ? t("signUpClientTitle") : t("signUp")}
        </h1>
        <div className="mt-6 rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-8">
          {!isClerkConfigured() ? (
            <p className="rounded-lg bg-[#fff8e1] px-4 py-3 text-sm text-[#5d4037]">
              Authentication is not configured on this deployment. Set
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, then
              redeploy.
            </p>
          ) : (
          <SignUp
            routing="path"
            path={`/${locale}/auth/sign-up`}
            signInUrl={`/${locale}/auth/sign-in`}
            fallbackRedirectUrl={afterAuth}
            signInFallbackRedirectUrl={afterAuth}
            unsafeMetadata={{ role }}
          />
          )}
        </div>
      </div>
    </main>
  );
}

async function AlreadySignedInRedirect({ locale, forBusiness }: { locale: string; forBusiness: boolean }) {
  const userId = await getOptionalUserId();
  if (userId) {
    const slug = await getUserFirstTenantSlug(userId);
    // Business members go to their dashboard; new owners (partners CTA)
    // go to onboarding; everyone else lands on the marketplace home.
    redirect(slug ? `/${locale}/${slug}/dashboard` : forBusiness ? `/${locale}/onboard` : `/${locale}`);
  }
  return null;
}