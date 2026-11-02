import type { MetadataRoute } from "next";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { DEFAULT_BRANDING, DEFAULT_COLOURS } from "@/domain/branding";

// Read per request: the installed app takes its name and colours from Admin → Branding, so a new
// install shows its own name (never built in at build time, when no database is reachable).
export const dynamic = "force-dynamic";

/** The main pages, named as in the navigation (Team → Overview reads "Team Overview" out of context). */
const SHORTCUTS = [
  { name: "Team Overview", url: "/team" },
  { name: "My Profile", url: "/overview" },
  { name: "Matches", url: "/matches" },
  { name: "Leaderboards", url: "/leaderboards" },
] as const;

/**
 * The web app manifest: the app installs to a phone's home screen or a desktop, opens without
 * browser bars and starts on the home page (which sends each account to its own start). Public,
 * like the sign-in page: it holds only the app's name, colours, icons and the addresses of its main
 * pages (each page still checks who may open it).
 *
 * Installed on a computer (Chrome and Edge on Windows, macOS, Linux, ChromeOS):
 * - `shortcuts`: the main pages in the icon's menu (right-click on the Windows taskbar or Start,
 *   long-press on Android);
 * - `launch_handler`: opening the app again, or one of those shortcuts, uses the window already
 *   open and goes to that page, instead of opening another window.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppDb()
    .then(getBranding)
    .catch(() => DEFAULT_BRANDING);
  const background = branding.background ?? DEFAULT_COLOURS.background;
  return {
    id: "/",
    name: branding.productName,
    short_name: branding.shortName || branding.productName,
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
    shortcuts: SHORTCUTS.map(({ name, url }) => ({ name, short_name: name, url, icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] })),
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
  };
}
