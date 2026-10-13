import type { Db } from "@/server/db/types";
import { getChampionProfile } from "@/domain/champion-model";
import { parseOverrides, recommend, whyNot, type ChampionInfo, type EngineConfig, type EngineInput, type RecommendationResult, type WhyNotComparison } from "@/domain/engine";
import type { Role } from "@/domain/roles";
import { buildPlaybook, type Playbook } from "@/domain/playbook";
import { deriveDraft } from "@/domain/draft";
import { listChampions } from "@/server/repositories/champions";
import { getDraft, lineupToProfiles, toDraftState, type DraftRecord } from "@/server/repositories/drafts";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadStatsProvider } from "@/server/stats/loader";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { enemyRiotIds, loadEnemyTendencies } from "@/server/scouting/session";

declare global {
  var __uniiverseChampionMap: { key: string; map: Map<string, ChampionInfo>; loadedAt: number } | undefined;
}

/** Champion map (id → name + profile) built from the synchronised roster; cached briefly. */
export async function getChampionMap(db: Db): Promise<Map<string, ChampionInfo>> {
  const cached = globalThis.__uniiverseChampionMap;
  if (cached && Date.now() - cached.loadedAt < 60_000) return cached.map;
  const list = await listChampions(db);
  const map = new Map<string, ChampionInfo>();
  for (const c of list) {
    map.set(c.id, { id: c.id, name: c.name, profile: getChampionProfile(c.id, { tags: c.tags, attackRange: c.attackRange }) });
  }
  globalThis.__uniiverseChampionMap = { key: String(list.length), map, loadedAt: Date.now() };
  return map;
}

export function invalidateChampionMap() {
  globalThis.__uniiverseChampionMap = undefined;
}

async function engineInputFor(db: Db, draft: DraftRecord): Promise<EngineInput> {
  const players = lineupToProfiles(draft);
  const [champions, stats, team, proficiency] = await Promise.all([getChampionMap(db), loadStatsProvider(db), getOrCreateTeam(db), getProficiencyLookup(db, players.map((p) => p.id))]);
  // Session scouting only costs a query when an enemy Riot ID was entered for this draft.
  const tendencies = enemyRiotIds(draft.enemyPlayers).length > 0 ? await loadEnemyTendencies(db, draft.id, stats, champions) : null;
  return {
    players,
    draft: toDraftState(draft),
    champions,
    stats,
    config: { ...(team.engineConfig as Partial<EngineConfig>), ...(draft.overrides.engine as Partial<EngineConfig> | undefined) },
    proficiency,
    overrides: parseOverrides(draft.overrides.coach),
    tendencies,
  };
}

declare global {
  var __uniiverseRecommendationCache: Map<string, { result: RecommendationResult; at: number }> | undefined;
}

const RECOMMENDATION_TTL_MS = 10 * 60_000;
const RECOMMENDATION_CACHE_SIZE = 40;

/**
 * Recommendation for a draft record, remembered per (draft, version, overrides) for a few
 * minutes: the room load, the action snapshot and the live-stream refetch all ask for the same
 * state, and the engine never runs twice for it on the same instance. Any change bumps the
 * draft version, so a stale answer cannot be served.
 */
export async function recommendForDraft(db: Db, draft: DraftRecord): Promise<RecommendationResult> {
  const key = `${draft.id}|${draft.version}|${draft.actions.length}|${JSON.stringify(draft.overrides)}|${JSON.stringify(draft.currentAssignments)}`;
  const cache = (globalThis.__uniiverseRecommendationCache ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RECOMMENDATION_TTL_MS) return hit.result;
  const result = recommend(await engineInputFor(db, draft));
  cache.set(key, { result, at: Date.now() });
  if (cache.size > RECOMMENDATION_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return result;
}

export function invalidateRecommendationCache(): void {
  globalThis.__uniiverseRecommendationCache = undefined;
}

/** "Why not X?" for the next pick; null when X is not a legal option right now. */
export async function whyNotForDraft(db: Db, draft: DraftRecord, alternative: { championId: string; role?: Role | null }): Promise<WhyNotComparison | null> {
  return whyNot(await engineInputFor(db, draft), alternative);
}

export async function recommendForDraftId(db: Db, draftId: string): Promise<RecommendationResult | null> {
  const draft = await getDraft(db, draftId);
  if (!draft) return null;
  return recommendForDraft(db, draft);
}

/** Match Playbook v2 for a completed draft (null while the draft is still open). */
export async function playbookForDraft(db: Db, draft: DraftRecord): Promise<Playbook | null> {
  const derived = deriveDraft(toDraftState(draft));
  if (!derived.isComplete) return null;
  const [champions, stats, team] = await Promise.all([getChampionMap(db), loadStatsProvider(db), getOrCreateTeam(db)]);
  const ours = derived.ourPicks.filter((p) => p.playerId && p.role).map((p) => ({ playerId: p.playerId!, role: p.role!, championId: p.championId }));
  const coach = parseOverrides(draft.overrides.coach);
  return buildPlaybook({
    ours,
    enemyChampionIds: derived.enemyPicks.map((p) => p.championId),
    players: lineupToProfiles(draft),
    champions,
    stats,
    config: team.engineConfig as Partial<EngineConfig>,
    coachNote: coach?.note ?? null,
  });
}
