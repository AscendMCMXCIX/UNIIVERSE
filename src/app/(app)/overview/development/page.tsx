import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadOverview } from "@/server/development/page-data";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { BeforeYouQueue } from "@/components/development/before-queue";
import { DevelopmentNeedsProfile } from "@/components/development/needs-profile";
import { ConfirmationNotice, LastSession, LearningPriorities, ProgressSummary, SessionSnapshot } from "@/components/development/overview-panels";
import { PendingReviews, RecentReviews } from "@/components/development/reviews-panels";

export const dynamic = "force-dynamic";

/**
 * RANKED DEVELOPMENT → OVERVIEW, in the order a ranked sitting goes: before you queue (the objective,
 * why it matters, the If–Then plan, Start or Continue), after a game (reviews waiting), the session
 * (in progress, or the last one's summary and the choice for the next), then progress on the
 * objective (Riot's figures and the player's own reviews, kept apart), learning priorities and the
 * latest reviews. Wide screens put the last three beside the first.
 */
export default async function DevelopmentOverviewPage() {
  const session = await getSession();
  if (!session?.playerId) return <DevelopmentNeedsProfile />;
  const owner = session.playerId;
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [data, lookups] = await Promise.all([loadOverview(db, owner), loadJournalLookups(db, team.id, owner, [])]);
  const plans = Object.fromEntries(data.library.map((o) => [o.id, o.plan ? { ifText: o.plan.ifText, thenText: o.plan.thenText } : null]));
  const hasPrimary = !!data.primary;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" data-testid="development-overview">
      <div className="min-w-0 space-y-4">
        <BeforeYouQueue primary={data.primary?.objective ?? null} library={data.library} active={data.active?.session ?? null} lookups={lookups} />
        <ConfirmationNotice confirmations={data.confirmations} />
        <PendingReviews games={data.pending} plans={plans} lookups={lookups} />
        {data.active ? <SessionSnapshot detail={data.active} lookups={lookups} /> : data.last ? <LastSession detail={data.last} library={data.library} lookups={lookups} /> : null}
      </div>
      <div className="min-w-0 space-y-4">
        {data.primary ? <ProgressSummary progress={data.primary} lookups={lookups} /> : null}
        <LearningPriorities others={data.others} uncovered={data.uncovered} lookups={lookups} hasPrimary={hasPrimary} />
        <RecentReviews reviews={data.reviews} lookups={lookups} />
      </div>
    </div>
  );
}
