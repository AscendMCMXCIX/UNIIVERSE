import { ROLE_LABELS, ROLES, type Role } from "../roles";
import { estimateProficiency, type ChampionHistoryEvidence, type MasteryEvidence, type ProficiencyTier } from "../proficiency";
import type { ChampionInfo, StatsProvider } from "./types";

/*
  Enemy pick tendencies for ONE draft ("session scouting").

  Raw facts per enemy player come from Riot (games, wins, recency, mastery per champion). This
  module turns them into an honest estimate of "how likely is this player to pick this
  champion?", with a confidence that says how much the engine may lean on it. Nothing here is
  certain: a tendency with low confidence barely moves a ban or a pick.
*/

export interface EnemyLikelyPick {
  championId: string;
  /** 0..1 share of this player's likely picks (sums to at most 1 across the list). */
  probability: number;
  games: number;
  recentGames: number;
  patchGames: number;
  tier: ProficiencyTier;
  /** High ≥ 0.3, Moderate ≥ 0.15, otherwise Low. */
  likelihood: "high" | "moderate" | "low";
}

export interface EnemyTendency {
  role: Role;
  /** How the player was entered (Riot ID or name). */
  label: string;
  /** 0..1 how much to trust this: identity, sample size and recency. */
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  /** Why confidence is what it is, in plain words. */
  factors: string[];
  picks: EnemyLikelyPick[];
  gamesAnalysed: number;
  rank: string | null;
}

export type EnemyTendencies = Partial<Record<Role, EnemyTendency>>;

export interface EnemyEvidenceInput {
  role: Role;
  label: string;
  history: ChampionHistoryEvidence[];
  mastery: MasteryEvidence[];
  rank: string | null;
  gamesAnalysed: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function likelihoodLabel(p: number): EnemyLikelyPick["likelihood"] {
  return p >= 0.3 ? "high" : p >= 0.15 ? "moderate" : "low";
}

/**
 * Pick likelihood for one enemy player in one role. Blends recent frequency (last ~30 days),
 * longer-term frequency, mastery and current meta relevance, keeps only champions the player
 * actually plays, and normalises to shares. Confidence grows with sample size and recency.
 */
export function buildEnemyTendency(input: EnemyEvidenceInput, stats: StatsProvider, champions: Map<string, ChampionInfo>, options: { now?: Date; limit?: number } = {}): EnemyTendency {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 6;
  const inRole = input.history.filter((h) => h.role === input.role || h.role === "UNKNOWN");
  const usable = inRole.length ? inRole : input.history;
  const totalGames = usable.reduce((s, h) => s + h.games, 0);
  const recentTotal = usable.reduce((s, h) => s + (h.lastPlayedAt && now.getTime() - h.lastPlayedAt.getTime() <= 30 * 86_400_000 ? h.games : 0), 0);
  const baseline = (() => {
    const g = input.history.reduce((s, h) => s + h.games, 0);
    const w = input.history.reduce((s, h) => s + h.wins, 0);
    return g > 0 ? w / g : 0.5;
  })();
  const ids = new Set<string>([...usable.map((h) => h.championId), ...input.mastery.map((m) => m.championId)]);
  const raw: Array<{ championId: string; weight: number; games: number; recentGames: number; patchGames: number; tier: ProficiencyTier }> = [];
  for (const championId of ids) {
    if (!champions.has(championId)) continue;
    const prof = estimateProficiency(championId, input.role, input.history, input.mastery.find((m) => m.championId === championId) ?? null, { playerBaselineWinRate: baseline });
    const games = usable.filter((h) => h.championId === championId).reduce((s, h) => s + h.games, 0);
    if (games === 0 && prof.mastery === null) continue;
    const recentShare = recentTotal > 0 ? prof.recentGames / recentTotal : 0;
    const overallShare = totalGames > 0 ? games / totalGames : 0;
    const masteryFamiliarity = prof.mastery ? Math.min(1, prof.mastery.points / 150_000) : 0;
    const roleShare = stats.roleShare(championId, input.role).share || champions.get(championId)?.profile.rolePrior[input.role] || 0.05;
    const meta = Math.max(0.8, Math.min(1.3, 1 + (stats.strength(championId, input.role).estimate - 0.5) * 2));
    const weight = (0.55 * recentShare + 0.3 * overallShare + 0.15 * masteryFamiliarity * (games > 0 ? 1 : 0.3)) * (0.6 + 0.4 * Math.min(1, roleShare * 2)) * meta;
    if (weight <= 0) continue;
    raw.push({ championId, weight, games, recentGames: prof.recentGames, patchGames: prof.patchGames, tier: prof.tier });
  }
  raw.sort((a, b) => b.weight - a.weight);
  const top = raw.slice(0, limit);
  const sum = raw.reduce((s, r) => s + r.weight, 0) || 1;
  const picks: EnemyLikelyPick[] = top.map((r) => {
    const probability = clamp01(r.weight / sum);
    return { championId: r.championId, probability, games: r.games, recentGames: r.recentGames, patchGames: r.patchGames, tier: r.tier, likelihood: likelihoodLabel(probability) };
  });

  const factors: string[] = [];
  const sample = clamp01(totalGames / 25);
  if (totalGames === 0) factors.push("No recent match history");
  else if (totalGames < 10) factors.push(`Small sample (${totalGames} games)`);
  const newest = input.history.reduce<Date | null>((m, h) => (h.lastPlayedAt && (!m || h.lastPlayedAt > m) ? h.lastPlayedAt : m), null);
  const daysSince = newest ? (now.getTime() - newest.getTime()) / 86_400_000 : null;
  const recency = daysSince === null ? 0.3 : daysSince <= 14 ? 1 : daysSince <= 45 ? 0.8 : daysSince <= 120 ? 0.55 : 0.35;
  if (daysSince !== null && daysSince > 30) factors.push(`Last game ${Math.round(daysSince)} days ago`);
  if (inRole.length === 0 && input.history.length > 0) factors.push(`No games recorded in ${ROLE_LABELS[input.role]}`);
  const confidence = clamp01((0.15 + 0.6 * sample + 0.25 * recency) * (inRole.length || !input.history.length ? 1 : 0.6) * (totalGames > 0 ? 1 : 0.2));
  const confidenceLabel = confidence >= 0.65 ? "high" : confidence >= 0.4 ? "medium" : "low";
  if (confidenceLabel === "low") factors.push("Low confidence: weighed lightly against current meta evidence");
  return { role: input.role, label: input.label, confidence, confidenceLabel, factors, picks, gamesAnalysed: input.gamesAnalysed, rank: input.rank };
}

export function buildEnemyTendencies(inputs: EnemyEvidenceInput[], stats: StatsProvider, champions: Map<string, ChampionInfo>, options: { now?: Date } = {}): EnemyTendencies {
  const out: EnemyTendencies = {};
  for (const input of inputs) {
    if (!ROLES.includes(input.role)) continue;
    out[input.role] = buildEnemyTendency(input, stats, champions, options);
  }
  return out;
}

/**
 * Probability (0..1) that a KNOWN enemy player picks this champion, discounted by confidence, in
 * the most plausible of the roles the champion is played in. Null when no known player plays it.
 */
export function knownPickProbability(tendencies: EnemyTendencies | null | undefined, championId: string, roleWeights?: Partial<Record<Role, number>>): { probability: number; role: Role; tendency: EnemyTendency; pick: EnemyLikelyPick } | null {
  if (!tendencies) return null;
  let best: { probability: number; role: Role; tendency: EnemyTendency; pick: EnemyLikelyPick } | null = null;
  for (const role of ROLES) {
    const t = tendencies[role];
    if (!t) continue;
    const pick = t.picks.find((p) => p.championId === championId);
    if (!pick) continue;
    const roleFactor = roleWeights ? Math.max(0.25, roleWeights[role] ?? 0.25) : 1;
    const probability = clamp01(pick.probability * t.confidence * roleFactor);
    if (!best || probability > best.probability) best = { probability, role, tendency: t, pick };
  }
  return best;
}

/**
 * Adjusts a global "will the enemy pick this?" probability for what the known enemy player in
 * the champion's likely role actually plays. The lift is the player's share of picks relative
 * to the champion's global pick rate, applied in proportion to scouting confidence; a champion
 * the known player never plays loses most of its ban value for that role. Returns the adjusted
 * probability and the matching tendency, if any.
 */
export function adjustForKnownPlayer(
  tendencies: EnemyTendencies | null | undefined,
  championId: string,
  likelyRole: Role,
  roleWeights: Partial<Record<Role, number>> | undefined,
  generic: number,
  globalPickRate: number,
): { probability: number; known: ReturnType<typeof knownPickProbability> } {
  const known = knownPickProbability(tendencies, championId, roleWeights);
  if (known) {
    const trust = known.tendency.confidence;
    const lift = Math.max(0.15, Math.min(4, known.pick.probability / Math.max(0.03, globalPickRate)));
    const factor = 1 + trust * (lift - 1);
    // A known comfort pick keeps at least its own (confidence-discounted) likelihood even when
    // global evidence is thin or absent.
    return { probability: clamp01(Math.max(generic * factor, known.probability * 0.8)), known };
  }
  const forRole = tendencies?.[likelyRole];
  if (forRole && forRole.picks.length >= 3) {
    // The player in that role is known and does not play this champion: much less likely.
    const factor = 1 - forRole.confidence * 0.85;
    return { probability: clamp01(generic * factor), known: null };
  }
  return { probability: clamp01(generic), known: null };
}

/** One sentence for a ban or pick explanation. */
export function describeTendency(t: EnemyTendency, pick: EnemyLikelyPick, championName: string): string {
  const freq = pick.recentGames > 0 ? `${pick.recentGames} of their last ${Math.max(pick.recentGames, Math.min(t.gamesAnalysed, 30))} games` : `${pick.games} recent games`;
  return `Enemy ${ROLE_LABELS[t.role]} (${t.label}) plays ${championName} often: ${freq}, ${pick.likelihood} likelihood${t.confidenceLabel === "low" ? ", low confidence" : ""}.`;
}
