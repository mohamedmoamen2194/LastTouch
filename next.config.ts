import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "pub-*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Deny embedding in any frame; prevents clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Reduce referrer leakage to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Limit what browser features pages can request.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // Force HTTPS and enable preload once the site is on a stable domain.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // CSP: allow same-origin + the external services the app relies on.
          // - scripts: self + Clerk (accounts.dev). 'unsafe-inline'/'unsafe-eval'
            //   are required by Clerk + Next dev in some paths; revisit with a
            //   strict nonce-based CSP before production hardening.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' blob: data: https://images.unsplash.com https://img.clerk.com https://*.r2.dev https://pub-*.r2.dev https://*.r2.cloudflarestorage.com https://lh3.googleusercontent.com https://*.public.blob.vercel-storage.com",
              "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
              "frame-src 'self' https://*.clerk.accounts.dev",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);