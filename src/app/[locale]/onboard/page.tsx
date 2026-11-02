import { Suspense } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { OnboardForm } from "@/components/onboarding/onboard-form";
import { getOptionalUserId } from "@/lib/auth/session";
import { getUserFirstTenant, tenantHomePath } from "@/lib/tenant/home";

export const dynamic = "force-dynamic";

export default async function OnboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const userId = await getOptionalUserId();
  if (!userId) redirect(`/${locale}/auth/sign-in`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f4f6] p-6 py-16">
      {/* Streams the form immediately; redirects users who already have a
          store in the background so a slow DB (Neon cold start) never blocks. */}
      <Suspense fallback={null}>
        <TenantRedirect locale={locale} userId={userId} />
      </Suspense>
      <OnboardForm />
    </main>
  );
}

async function TenantRedirect({ locale, userId }: { locale: string; userId: string }) {
  const home = await getUserFirstTenant(userId);
  if (home) redirect(tenantHomePath(locale, home.slug, home.role));
  return null;
}