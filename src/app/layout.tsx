import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { Toaster } from "@/components/ui/toast";
import { DEFAULT_BRANDING } from "@/domain/branding";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";

/** Every tab title ends with the app's own name (Admin → Branding). */
export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_BRANDING.productName;
  // The build prerenders the not-found page without a database: it keeps the neutral name.
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    try {
      name = (await getBranding(await getAppDb())).productName;
    } catch {
      // A page must still render when the database is unreachable.
    }
  }
  return { title: { default: name, template: `%s · ${name}` }, description: "Player-centred League of Legends team platform" };
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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-bg text-fg">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
