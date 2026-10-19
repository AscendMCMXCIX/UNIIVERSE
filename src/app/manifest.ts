import type { MetadataRoute } from "next";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { DEFAULT_BRANDING, DEFAULT_COLOURS } from "@/domain/branding";

// Read per request: the installed app takes the team's name and colours from Admin → Branding, so a
// new install shows its own name (never built in at build time, when no database is reachable).
export const dynamic = "force-dynamic";

/**
 * The web app manifest: UNIIVERSE installs to a phone's home screen or a desktop like an app, opens
 * without browser bars and starts on the home page (which sends each account to its own start).
 * Public, like the sign-in page: it holds only the team's name, colours and the app icons.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppDb()
    .then(getBranding)
    .catch(() => DEFAULT_BRANDING);
  const background = branding.background ?? DEFAULT_COLOURS.background;
  return {
    id: "/",
    name: branding.teamName,
    short_name: branding.shortName || branding.teamName,
    description: "Team platform for League of Legends: lineup, players, matches and statistics.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: background,
    theme_color: background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
