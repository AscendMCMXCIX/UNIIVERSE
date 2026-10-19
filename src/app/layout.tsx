import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "UNIIVERSE", template: "%s · UNIIVERSE" },
  description: "Player-centred League of Legends team platform",
};

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
