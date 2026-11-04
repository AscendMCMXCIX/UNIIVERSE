import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { WebVitals } from "@/components/web-vitals";
import { fieldMetricsEnabled } from "@/server/observability/web-vitals";
import { getAuthState, needsSetup } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getShellStatus } from "@/server/ops/shell";
import { shellMetadata } from "@/server/ops/shell-metadata";
import { runTickIfDue } from "@/server/jobs/background";
import { preconnect } from "react-dom";
import { DATA_DRAGON_ORIGIN } from "@/domain/player-card";

export const dynamic = "force-dynamic";
/** Room for the background refresh a visit may start after the page is sent (see runTickIfDue). */
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  return shellMetadata();
}

/** PLAYER MODE: every signed-in page outside /admin (Admin Mode has its own layout, src/app/(admin)). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (!auth.session) redirect("/login");
  // First-time setup is mandatory: nothing in the app opens until it is finished.
  if (needsSetup(auth.session)) redirect("/welcome");
  const [status, jar] = await Promise.all([getShellStatus(db, auth, "player"), cookies()]);
  status.sidebarCollapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";
  // Keeps data fresh while the team uses the site; the page never waits for it.
  after(() => runTickIfDue(db));
  // Champion art and portraits come from Data Dragon: the browser opens that connection while the
  // page's own data is still on its way (docs/PERFORMANCE.md, "Team Overview's first card").
  preconnect(DATA_DRAGON_ORIGIN);
  return (
    <>
      <AppShell status={status}>{children}</AppShell>
      {fieldMetricsEnabled() ? <WebVitals /> : null}
    </>
  );
}
