import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { PlatformLogoutButton } from "@/components/platform/logout-button";

/** Never prerender: every request must check the signed-in admin account. */
export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Session read outside try/catch: prerendering an auth gate must bail out
  // to dynamic rendering instead of baking a redirect into static HTML.
  await cookies();

  try {
    await requirePlatformAdmin();
  } catch (e: unknown) {
    // No valid session of either kind → owner login form. Signed-in
    // non-admins get 404 so the panel stays invisible to them.
    if (e instanceof Error && e.message.includes("Sign in")) {
      redirect(`/${locale}/platform/login`);
    }
    notFound();
  }

  const base = `/${locale}/platform`;
  const links = [
    { href: base, label: "Overview" },
    { href: `${base}/tenants`, label: "Tenants" },
    { href: `${base}/subscriptions`, label: "Subscriptions" },
    { href: `${base}/revenue`, label: "Revenue" },
    { href: `${base}/invoices`, label: "Invoices" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#101828]">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#0b1526] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-black text-[#0b1526]">
              L
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">LastTouch · Owner Admin</p>
              <p className="text-[11px] text-white/60">Owner only — signed in as admin</p>
            </div>
          </div>
          <nav className="ms-auto flex flex-wrap items-center gap-1.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
            <PlatformLogoutButton locale={locale} />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
