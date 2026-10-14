import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { lastSeriesEnemyPlayers, loadFearless } from "@/server/repositories/drafts";
import { listUnfinishedDrafts } from "@/server/drafts/unfinished";
import { canControlDraft } from "@/server/auth/permissions";
import { UnfinishedDrafts } from "@/components/draft/unfinished-drafts";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getSetupLineup } from "@/server/team/setup-lineup";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { enemyNameList } from "@/domain/scouting/enemy-slots";
import { canStartGame } from "@/server/series/repository";
import { competitionModeLabel } from "@/domain/competition";
import { NewDraftForm, type NextGameContext } from "@/components/draft/new-draft-form";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** DRAFT: start a draft (mode, lineup, optional enemy Riot IDs), or resume / abandon / delete an unfinished one. Finished games live in Matches. */
export default async function DraftSetupPage({ searchParams }: { searchParams: Promise<{ series?: string }> }) {
  const session = await requirePageAccess("create-draft");
  const { series: seriesParam } = await searchParams;
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  // Unfinished drafts stay one click away; finished games live in Matches.
  const [lineup, unfinished, champions] = await Promise.all([getSetupLineup(db, team.id), listUnfinishedDrafts(db, team.id), listChampions(db)]);
  let nextGame: NextGameContext | null = null;
  let nextGameError: string | null = null;
  let reuseEnemies: string[] = [];
  if (seriesParam) {
    const next = await canStartGame(db, seriesParam);
    if (next.ok && next.series.teamId === team.id) {
      const fearless = await loadFearless(db, next.series.id, next.gameNumber);
      nextGame = { seriesId: next.series.id, mode: next.series.mode, eventName: next.series.eventName, opponentName: next.series.opponentName, bestOf: next.series.bestOf, gameNumber: next.gameNumber, draftRules: next.series.draftRules, fearlessLocked: fearless.locks.length };
      reuseEnemies = enemyNameList(await lastSeriesEnemyPlayers(db, next.series.id));
    } else nextGameError = next.ok ? "Series not found." : next.error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={nextGame ? "Next game" : "Draft"} description="Choose the mode, check the lineup, add enemy Riot IDs if you know them, and start." />
      {nextGameError ? <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{nextGameError} Starting a normal draft instead.</p> : null}
      {unfinished.length > 0 && !nextGame ? (
        <UnfinishedDrafts
          championsById={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))}
          drafts={unfinished.map((d) => ({
            id: d.id,
            title: `${competitionModeLabel(d.mode)}${d.opponentName ? ` vs ${d.opponentName}` : ""}${d.seriesId ? ` · Game ${d.gameNumber}` : ""}${d.isTheorycraft ? " · theorycraft" : ""}`,
            detail: `Started ${formatDate(d.createdAt)} · ${d.progress}/${d.steps} actions`,
            side: d.side,
            progress: d.progress,
            steps: d.steps,
            ourPicks: d.ourPicks,
            canManage: canControlDraft(session, d),
          }))}
        />
      ) : null}
      <NewDraftForm lineup={lineup.slots} lineupReady={lineup.complete} canManageLineup={hasPermission(session, "manage-lineup")} formats={Object.values(BUILTIN_FORMATS)} nextGame={nextGame} reuseEnemies={reuseEnemies} />
    </div>
  );
}
