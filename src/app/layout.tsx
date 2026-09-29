import "./globals.css";

export const metadata = {
  title: "UNIIVERSE",
  description: "UNIIVERSE team draft tools",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
