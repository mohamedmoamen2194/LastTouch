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

export default clerkMiddleware((auth, req) => {
  // API routes are handled by their own handlers (withApi → 401). We only
  // need clerkMiddleware to run so `auth()` is available inside route.ts, and
  // we must NOT run next-intl rewriting or protection on them.
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api")) return;

  if (!isPublicRoute(req)) auth.protect();

  return intlMiddleware(req);
});

export const config = {
  // Include /api so clerkMiddleware can set auth for route handlers, but skip
  // static assets and internal Next paths.
  matcher: ["/((?!trpc|_next|_vercel|.*\\..*).*)"],
};