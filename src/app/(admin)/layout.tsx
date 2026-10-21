import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { getAuthState, needsSetup } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";
import { getAppDb } from "@/server/bootstrap";
import { getShellStatus } from "@/server/ops/shell";
import { shellMetadata } from "@/server/ops/shell-metadata";
import { runTickIfDue } from "@/server/jobs/background";

export const dynamic = "force-dynamic";
/** Room for the background refresh a visit may start after the page is sent (see runTickIfDue). */
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  return shellMetadata();
}

/**
 * ADMIN MODE: every page under /admin, with its own navigation (Dashboard, Users & Permissions,
 * Platform Settings, Data & Integrations, System Health, Audit Logs) and none of the player pages.
 * Administrators only: anyone else, including someone whose administrator access was just
 * removed or who typed an /admin address, is sent to Player Mode through the switch route, which
 * also forgets any saved preference for Admin Mode. Every page and action beneath checks its own
 * administrator permission again; this layout is not the only lock.
 */
export default async function AdminModeLayout({ children }: { children: React.ReactNode }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (!auth.session) redirect("/login");
  if (needsSetup(auth.session)) redirect("/welcome");
  if (!canUseAdminArea(auth.session)) redirect("/api/mode?to=player");
  const [status, jar] = await Promise.all([getShellStatus(db, auth, "admin"), cookies()]);
  status.sidebarCollapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";
  after(() => runTickIfDue(db));
  return <AppShell status={status}>{children}</AppShell>;
}
