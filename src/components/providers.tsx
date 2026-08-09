"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";

const HAS_CLERK =
  typeof process !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_"));

type AppProvidersProps = {
  children: React.ReactNode;
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: Record<string, any>;
};

/**
 * Root providers. next-intl is always mounted (messages are passed down from
 * the server layout). Clerk is only mounted when the publishable key is set
 * so the app renders fine before Clerk is configured. The locale is passed in
 * as a prop because this provider sits above the next-intl context.
 */
export function AppProviders({ children, locale, messages }: AppProvidersProps) {
  const intl = (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Cairo">
      {children}
    </NextIntlClientProvider>
  );

  if (!HAS_CLERK) return intl;

  return (
    <ClerkProvider
      appearance={{ variables: { colorPrimary: "#091426" } }}
      // Keep the app locale in sync with the UI language.
      localization={locale === "ar" ? undefined : undefined}
    >
      {intl}
    </ClerkProvider>
  );
}