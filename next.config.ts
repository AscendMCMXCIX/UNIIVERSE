import type { NextConfig } from "next";

/*
  PGlite (about 19 MB of WASM and data) is only loaded when no DATABASE_URL is set: local
  development, the in-memory demo and the browser tests. A build that has a DATABASE_URL (Vercel
  production, and any preview given one) connects to Postgres and can never reach that code, so its
  functions leave PGlite out. Without this, all 67 server routes carried their own copy: about
  1.3 GB of the 1.5 GB traced per deployment.
*/
const usesPostgres = !!process.env.DATABASE_URL;

// Sent with every response: pages may be framed only by UNIIVERSE itself (the admin preview
// studio frames its own pages), content types are never guessed, and the browser's camera,
// microphone, location, payment and USB features stay off. HSTS is set by Vercel.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
// Pages only: forms post back to UNIIVERSE and plugins never load. No script-src, so Next's inline
// scripts and the libraries the app loads keep working. API routes are left out because Next keeps
// a header set here over the same header set by a route, and the routes serving stored images send
// their own stricter policy (SVG logos are sandboxed).
const PAGE_CSP = "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: PAGE_CSP }] },
    ];
  },
  reactStrictMode: true,
  ...(usesPostgres ? { outputFileTracingExcludes: { "*": ["node_modules/@electric-sql/pglite/**", "node_modules/.pnpm/@electric-sql+pglite@*/**"] } } : {}),
  // PGlite (embedded Postgres used in local/demo mode) ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  images: {
    remotePatterns: [
      // Champion portraits are served straight from Riot's Data Dragon CDN. The version
      // segment is resolved at runtime from the synchronised patch, never hard-coded.
      { protocol: "https", hostname: "ddragon.leagueoflegends.com", pathname: "/cdn/**" },
    ],
  },
  typedRoutes: false,
  // Branding uploads (a GIF background up to 2 MB plus its still frame) travel as data URLs;
  // Vercel itself caps a request at 4.5 MB, which the branding limits stay under.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
