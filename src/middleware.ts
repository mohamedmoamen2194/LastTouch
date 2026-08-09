import type { NextFetchEvent, NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Public routes that never require auth. Everything else is protected
// (dashboards, onboarding, settings, etc.). The public booking flow and
// landing + auth pages stay open.
const isPublicRoute = createRouteMatcher([
  "/",
  "/:locale",
  "/:locale/auth/sign-in(.*)",
  "/:locale/auth/sign-up(.*)",
  "/:locale/book(.*)",
]);

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
) {
  const pathname = req.nextUrl.pathname;

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
  // Include /api so clerkMiddleware can set auth for route handlers, but skip
  // static assets and internal Next paths.
  matcher: ["/((?!trpc|_next|_vercel|.*\\..*).*)"],
};