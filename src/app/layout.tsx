import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { Toaster } from "@/components/ui/toast";
import { DEFAULT_BRANDING } from "@/domain/branding";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { ServiceWorker } from "@/components/service-worker";
import { LegacyStorageCleanup } from "@/components/legacy-storage";
import { CAPTURE_INSTALL_SCRIPT } from "@/components/install/capture-script";
import { CAPTURE_IMAGE_ERRORS_SCRIPT } from "@/components/ui/image-errors";

/*
  Inter, served with the app and preloaded with the page. Until it arrives the text is drawn in a
  fallback sized to Inter's own measurements, so a name or heading does not change its line breaks
  (and move the page) when the font swaps in. The Latin set covers the interface and almost every
  name; other scripts are drawn by that fallback.
*/
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});

/** Every tab title ends with the app's own name (Admin → Branding). */
export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_BRANDING.productName;
  let shortName = DEFAULT_BRANDING.shortName;
  // The build prerenders the not-found page without a database: it keeps the neutral name.
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    try {
      const branding = await getBranding(await getAppDb());
      name = branding.productName;
      shortName = branding.shortName || branding.productName;
    } catch {
      // A page must still render when the database is unreachable.
    }
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Player-centred League of Legends team platform",
    // Installed on a phone's home screen, it opens full screen like an app (manifest.ts sets the
    // rest). The name under its icon on iPhone and iPad: the manifest's short name, as on Android.
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: shortName },
  };
}

export const viewport: Viewport = {
  themeColor: "#080c24",
  width: "device-width",
  initialScale: 1,
  // Lets the shell draw under the notch and home indicator; safe-area insets pad the bars.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <head>
        {/* First on the page: the browser can offer to install before the app's code loads, and an
            image that fails while the page loads is noted before any image can fail. */}
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_SCRIPT + CAPTURE_IMAGE_ERRORS_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-fg">
        {children}
        <Toaster />
        <ServiceWorker />
        <LegacyStorageCleanup />
      </body>
    </html>
  );
}
