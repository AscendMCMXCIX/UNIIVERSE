import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
