import type { Db } from "@/server/db/types";
import { deriveDraft } from "@/domain/draft";
import { mergeEngineConfig, type EngineConfig } from "@/domain/engine";
import { enemyTeamProfile } from "@/domain/engine/evaluate";
import type { SearchContext } from "@/domain/engine/search";
import { buildPreDraftPlan, type PreDraftPlan } from "@/domain/predraft";
import { getChampionMap } from "@/server/engine/service";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { lineupToProfiles, toDraftState, type DraftRecord } from "@/server/repositories/drafts";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadStatsProvider } from "@/server/stats/loader";

export async function preDraftForDraft(db: Db, draft: DraftRecord): Promise<{ plan: PreDraftPlan }> {
  const players = lineupToProfiles(draft);
  const [champions, stats, team, proficiency] = await Promise.all([getChampionMap(db), loadStatsProvider(db), getOrCreateTeam(db), getProficiencyLookup(db, players.map((p) => p.id))]);
  const derived = deriveDraft(toDraftState(draft));
  const ctx: SearchContext = {
    players: new Map(players.map((p) => [p.id, p])),
    champions,
    stats,
    config: mergeEngineConfig({ ...(team.engineConfig as Partial<EngineConfig>), ...(draft.overrides.engine as Partial<EngineConfig> | undefined) }),
    enemy: [],
    enemyProfile: enemyTeamProfile([], champions),
    memo: new Map(),
    proficiency,
    unavailable: derived.unavailableChampionIds,
  };
  // Opponent scouting was retired: the plan is built from our lineup, pools, proficiency and the
  // current meta alone, which is exactly what a blind draft needs.
  const plan = buildPreDraftPlan({ mode: draft.mode, players, assignment: draft.currentAssignments, ctx, opponents: [] });
  return { plan };
}
