import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { lastSeriesEnemyPlayers, listResumableDrafts } from "@/server/repositories/drafts";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getSetupLineup } from "@/server/team/setup-lineup";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { enemyNameList } from "@/domain/scouting/enemy-slots";
import { canStartGame } from "@/server/series/repository";
import { competitionModeLabel } from "@/domain/competition";
import { NewDraftForm, type NextGameContext } from "@/components/draft/new-draft-form";
import { ChampionPortrait } from "@/components/champion-portrait";
import { PageHeader } from "@/components/ui/page-header";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

/** DRAFT: start a draft (mode, lineup, optional enemy Riot IDs) or continue one in progress. */
export default async function DraftSetupPage({ searchParams }: { searchParams: Promise<{ series?: string }> }) {
  const session = await requirePageAccess("create-draft");
  const { series: seriesParam } = await searchParams;
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  // Unfinished drafts stay one click away; finished games live in Matches.
  const [lineup, inProgress, champions] = await Promise.all([getSetupLineup(db, team.id), listResumableDrafts(db, team.id), listChampions(db)]);
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  let nextGame: NextGameContext | null = null;
  let nextGameError: string | null = null;
  let reuseEnemies: string[] = [];
  if (seriesParam) {
    const next = await canStartGame(db, seriesParam);
    if (next.ok && next.series.teamId === team.id) {
      nextGame = { seriesId: next.series.id, mode: next.series.mode, eventName: next.series.eventName, opponentName: next.series.opponentName, bestOf: next.series.bestOf, gameNumber: next.gameNumber };
      reuseEnemies = enemyNameList(await lastSeriesEnemyPlayers(db, next.series.id));
    } else nextGameError = next.ok ? "Series not found." : next.error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={nextGame ? "Next game" : "Draft"} description="Choose the mode, check the lineup, add enemy Riot IDs if you know them, and start." />
      {nextGameError ? <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{nextGameError} Starting a normal draft instead.</p> : null}
      {inProgress.length > 0 && !nextGame ? (
        <section className="space-y-2" aria-label="Drafts in progress" data-testid="drafts-in-progress">
          <h2 className="text-sm font-semibold text-fg-muted">Continue a draft</h2>
          <ul className="grid gap-2 md:grid-cols-3">
            {inProgress.map((d) => (
              <li key={d.id}>
                <Link href={`/draft/${d.id}`} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent/50">
                  <span className={d.side === "blue" ? "h-9 w-1 rounded-full bg-blue" : "h-9 w-1 rounded-full bg-red"} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {competitionModeLabel(d.mode)}
                      {d.opponentName ? ` vs ${d.opponentName}` : ""}
                      {d.isTheorycraft ? " · theorycraft" : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                      {d.progress}/20 · {timeAgo(d.createdAt)}
                      <span className="flex -space-x-1">
                        {d.ourPicks.slice(0, 5).map((id) => (
                          <ChampionPortrait key={id} champion={byId.get(id) ?? { id, name: id, portraitUrl: "" }} size="xs" />
                        ))}
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <NewDraftForm lineup={lineup.slots} lineupReady={lineup.complete} canManageLineup={hasPermission(session, "manage-lineup")} formats={Object.values(BUILTIN_FORMATS)} nextGame={nextGame} reuseEnemies={reuseEnemies} />
    </div>
  );
}
