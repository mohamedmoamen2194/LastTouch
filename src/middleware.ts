import type { NextFetchEvent, NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Public routes that never require auth. Everything else is protected
// (dashboards, onboarding, settings, etc.). The public booking flow and
// landing + ALL auth pages (sign-in, sign-up, sso-callback, factor pages)
// stay open. Using a single `/auth(.*)` matcher avoids OAuth loops where
// Clerk's `.../sso-callback` sub-route would otherwise be treated as
// protected and bounced back to sign-in.
const isPublicRoute = createRouteMatcher([
  "/",
  "/:locale",
  "/:locale/auth(.*)",
  "/:locale/book(.*)",
]);

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
) {
  const pathname = req.nextUrl.pathname;

  // Clerk's app-origin proxy (required for production on `*.vercel.app`,
  // where no CNAME can be added). Must be handled purely by Clerk — never
  // auth.protect() and never next-intl rewriting.
  if (pathname.startsWith("/__clerk")) {
    return clerkMiddleware(
      () => undefined,
      { frontendApiProxy: { enabled: true } },
    )(req, event);
  }

  // API routes are handled by their own handlers (withApi → 401). We only
  // need clerkMiddleware to run so `auth()` is available inside route.ts, and
  // we must NOT run next-intl rewriting or protection on them.
  if (pathname.startsWith("/api")) {
    return clerkMiddleware(() => undefined)(req, event);
  }

  // Protected routes (dashboards, onboarding, settings) require a session.
  if (!isPublicRoute(req)) {
    return clerkMiddleware((auth, request) => {
      auth.protect();
      return intlMiddleware(request);
    })(req, event);
  }

  // Public routes must never be blocked by a Clerk configuration problem
  // (e.g. missing keys would throw and abort the `/` → `/en` locale redirect,
  // surfacing as a platform 404 on the bare root). Fall back to next-intl.
  try {
    return await clerkMiddleware((_auth, request) =>
      intlMiddleware(request)
    )(req, event);
  } catch {
    return intlMiddleware(req);
  }
}

export const config = {
  // Include /api so clerkMiddleware can set auth for route handlers, and
  // /__clerk so the Frontend API proxy is handled. Skip static assets and
  // internal Next paths.
  matcher: ["/((?!trpc|_next|_vercel|.*\\..*).*)", "/__clerk/(.*)"],
};