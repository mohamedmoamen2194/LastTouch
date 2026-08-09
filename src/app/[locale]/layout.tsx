import { setRequestLocale, getMessages } from "next-intl/server";
import { Inter, Space_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { AppProviders } from "@/components/providers";
import "../globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata = {
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

const dirs: Record<string, string> = { en: "ltr", ar: "rtl" };
const langs: Record<string, string> = { en: "en", ar: "ar" };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();

  setRequestLocale(locale);
  const dir = dirs[locale] ?? "ltr";
  const messages = await getMessages();

  return (
    <html lang={langs[locale]} dir={dir} className={cn(inter.variable, grotesk.variable)}>
      <body>
        <AppProviders locale={locale} messages={messages}>{children}</AppProviders>
      </body>
    </html>
  );
}