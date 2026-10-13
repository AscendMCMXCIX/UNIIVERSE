import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "UNIIVERSE", template: "%s · UNIIVERSE" },
  description: "Player-centred League of Legends tournament drafting platform",
};

export const viewport: Viewport = { themeColor: "#080c24" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-bg text-fg">{children}</body>
    </html>
  );
}
