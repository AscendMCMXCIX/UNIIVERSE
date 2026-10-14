import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoStillSrc } from "@/domain/branding";
import { getBranding } from "@/server/repositories/branding";
import { AppShell } from "@/components/app-shell";
import { getAuthState, needsSetup } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getShellStatus } from "@/server/ops/shell";

export const dynamic = "force-dynamic";

/** A custom logo becomes the tab icon (its still frame: browsers do not animate favicons reliably). */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const branding = await getBranding(await getAppDb());
    if (!branding.assets.logo) return {};
    const icon = logoStillSrc(branding);
    return { icons: { icon, apple: icon } };
  } catch {
    return {};
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (!auth.session) redirect("/login");
  // First-time setup is mandatory: nothing in the app opens until it is finished.
  if (needsSetup(auth.session)) redirect("/welcome");
  const status = await getShellStatus(db, auth);
  return <AppShell status={status}>{children}</AppShell>;
}
