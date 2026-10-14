import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { COMPETITION_MODE_INFO } from "@/domain/competition";
import { seriesLabel } from "@/domain/series";
import { ROLE_LABELS } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, getSession } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getDraft } from "@/server/repositories/drafts";
import { preDraftForDraft } from "@/server/predraft/service";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { getSeries } from "@/server/series/repository";
import { ProPatternsPanel } from "@/components/predraft/pro-patterns";
import { PlanView } from "@/components/predraft/plan-view";
import { EnemyTendenciesPanel } from "@/components/draft/enemy-tendencies-panel";
import { enemyRiotIds, listEnemyScouting, loadEnemyTendencies } from "@/server/scouting/session";
import { loadStatsProvider } from "@/server/stats/loader";
import { getChampionMap } from "@/server/engine/service";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/** Pre-draft preparation: blind bans and the plan for our lineup; optional enemy names for organised play. */
export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [draft, session, champions] = await Promise.all([getDraft(db, id), getSession(), listChampions(db)]);
  if (!draft) notFound();
  const [{ plan }, patterns, series] = await Promise.all([preDraftForDraft(db, draft), loadProDraftPatterns(db), draft.seriesId ? getSeries(db, draft.seriesId) : Promise.resolve(null)]);
  const scouted = enemyRiotIds(draft.enemyPlayers).length > 0;
  const [scouting, tendencies] = scouted ? await Promise.all([listEnemyScouting(db, draft.id), (async () => loadEnemyTendencies(db, draft.id, await loadStatsProvider(db), await getChampionMap(db)))()]) : [[], null];
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const playerNames = Object.fromEntries(draft.lineup.map((p) => [p.id, p.displayName]));
  const info = COMPETITION_MODE_INFO[draft.mode];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Before the draft"
        title={`${info.label}${draft.opponentName ? ` vs ${draft.opponentName}` : ""}`}
        description={`Lineup: ${draft.lineup.map((p) => `${p.displayName} (${ROLE_LABELS[(Object.entries(draft.currentAssignments).find(([, pid]) => pid === p.id)?.[0] ?? p.primaryRole) as keyof typeof ROLE_LABELS]})`).join(" · ")}`}
        actions={
          <>
            {series ? <Badge tone="info">Game {draft.gameNumber} · {seriesLabel(series.bestOf)}</Badge> : null}
            <Badge tone={draft.side === "blue" ? "blue" : "red"}>{draft.side} side</Badge>
            {draft.isTheorycraft ? <Badge tone="accent">Theorycraft</Badge> : null}
            <Link href={`/draft/${draft.id}`} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
              Open draft room <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      />
      {scouted ? <EnemyTendenciesPanel draftId={draft.id} tendencies={tendencies} scouting={scouting} championsById={championsById} canEdit={canControlDraft(session, draft)} /> : null}

      <PlanView plan={plan} championsById={championsById} playerNames={playerNames} />
      {draft.mode === "tournament" || draft.mode === "scrim" || draft.mode === "custom" || draft.mode === "practice" || draft.mode === "other" || patterns.games > 0 ? <ProPatternsPanel patterns={patterns} championsById={championsById} /> : null}
    </div>
  );
}
