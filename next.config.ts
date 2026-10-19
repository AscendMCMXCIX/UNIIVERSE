import type { NextConfig } from "next";

/*
  PGlite (about 19 MB of WASM and data) is only loaded when no DATABASE_URL is set: local
  development, the in-memory demo and the browser tests. A build that has a DATABASE_URL (Vercel
  production, and any preview given one) connects to Postgres and can never reach that code, so its
  functions leave PGlite out. Without this, all 67 server routes carried their own copy: about
  1.3 GB of the 1.5 GB traced per deployment.
*/
const usesPostgres = !!process.env.DATABASE_URL;

const nextConfig: NextConfig = {
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
