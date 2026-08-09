import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { getOptionalUserId } from "@/lib/auth/session";
import { getUserFirstTenantSlug } from "@/lib/tenant/home";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fb] px-4 py-10 md:px-6 md:py-6">
      {/* Non-blocking: streams with the response, redirects signed-in users
          once resolved — never holds up first paint (avoids DB cold starts). */}
      <Suspense fallback={null}>
        <AlreadySignedInRedirect locale={locale} />
      </Suspense>
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#091426]">{t("signIn")}</h1>
        <div className="mt-6 rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-8">
          <SignIn
            routing="path"
            path={`/${locale}/auth/sign-in`}
            signUpUrl={`/${locale}/auth/sign-up`}
            afterSignInUrl={`/${locale}/onboard`}
          />
        </div>
      </div>
    </main>
  );
}

async function AlreadySignedInRedirect({ locale }: { locale: string }) {
  const userId = await getOptionalUserId();
  if (userId) {
    const slug = await getUserFirstTenantSlug(userId);
    redirect(slug ? `/${locale}/${slug}/dashboard` : `/${locale}/onboard`);
  }
  return null;
}