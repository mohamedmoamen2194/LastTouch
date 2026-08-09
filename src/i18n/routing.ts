import { defineRouting } from "next-intl/routing";

/**
 * Supported locales. The platform is bilingual (en/ar) with RTL for Arabic,
 * per the spec. `localePrefix: "always"` keeps locale usage explicit.
 * `localeDetection` stays on so visitors get their preferred locale.
 */
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];