import { setRequestLocale } from "next-intl/server";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

/**
 * OAuth completion handler (Google, etc.).
 *
 * Without this dedicated route, `routing="path"` on <SignUp>/<SignIn> tries
 * to complete OAuth inside the sign-up page itself, which loops when the
 * locale prefix is involved. Clerk redirects here after Google, finalizes
 * the session, then sends the user to `/{locale}/onboard`.
 */
export default async function SSOCallbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fb] px-4">
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={`/${locale}/onboard`}
        signUpFallbackRedirectUrl={`/${locale}/onboard`}
      />
      <p className="mt-4 text-sm text-[#45474c]">Finishing sign-in…</p>
    </main>
  );
}
