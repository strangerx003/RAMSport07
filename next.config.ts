import type { NextConfig } from "next";

/**
 * RAMSport server build.
 *
 * The browser calls the same-origin `/api/*` contract. Route handlers persist
 * accounts, project files, profiles and module snapshots on the server using
 * MongoDB when `MONGODB_URI` is configured (recommended for production) or a
 * local filesystem store during development.
 */
const isDevelopment = process.env.NODE_ENV !== "production";

// `unsafe-eval` is only needed by the development toolchain. Production builds
// run without it, which keeps the CSP meaningfully restrictive.
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  images: { unoptimized: true },
  // The MongoDB driver is a native Node package; keep it out of the bundler.
  serverExternalPackages: ["mongodb"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // API responses carry account data and must never be cached by a proxy.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
