import { after } from "next/server";
import { Lock } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { developmentFreshness } from "@/server/ops/freshness";
import { SESSION_REFRESH_AFTER_MS } from "@/domain/account-status";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";
import { DevelopmentAreaNav } from "@/components/development/area-nav";
import { DevelopmentNeedsProfile } from "@/components/development/needs-profile";

export const dynamic = "force-dynamic";

/**
 * RANKED DEVELOPMENT, a private section of My Profile: Overview (before and after a game),
 * Sessions, and Development (the objective library). Everything here is the signed-in player's own
 * (the owner comes from the session, never from the address), and no other member can reach it.
 *
 * The page keeps itself current through the private "development" freshness scope: every two
 * minutes while a session runs (and a sync when the last one is over five minutes old, so a game
 * just finished joins without a reload), and the profile's slower pace otherwise.
 */
export default async function RankedDevelopmentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.playerId) return <DevelopmentNeedsProfile />;
  const playerId = session.playerId;
  const db = await getAppDb();
  const { freshness, sessionActive } = await developmentFreshness(db, playerId, { visit: true });
  if (sessionActive) after(() => refreshPlayerAccountsIfDue(db, playerId, { refreshAfterMs: SESSION_REFRESH_AFTER_MS }));
  return (
    <div className="space-y-4" data-testid="ranked-development">
      <FreshnessWatcher scope={{ kind: "development", playerId }} version={freshness} />
      <DevelopmentAreaNav />
      <p className="flex items-start gap-1.5 text-xs text-fg-muted">
        <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        Private: only you can see your objectives, sessions and reviews. They never appear on your profile for others or in team statistics.
      </p>
      {children}
    </div>
  );
}
