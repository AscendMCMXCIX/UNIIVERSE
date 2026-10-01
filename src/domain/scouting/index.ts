import { ROLES, ROLE_LABELS, type Role } from "../roles";
import { estimateProficiency, type ChampionHistoryEvidence, type MasteryEvidence, type ProficiencyEstimate } from "../proficiency";
import type { ChampionInfo, StatsProvider } from "../engine/types";

export type ScoutingConfidence = "high" | "medium" | "low" | "unknown";

export interface ScoutedPlayer {
  id: string;
  label: string;
  likelyRole: Role | null;
  altRole: Role | null;
  /** Identity confidence entered by the scout. */
  identityConfidence: ScoutingConfidence;
  accountsTotal: number;
  accountsResolved: number;
  lastSyncAt: Date | null;
  history: ChampionHistoryEvidence[];
  mastery: MasteryEvidence[];
  rank: { tier: string | null; division: string | null; lp: number | null; wins: number | null; losses: number | null } | null;
  notes: string;
}

export interface ScoutingAssessment {
  playerId: string;
  confidence: ScoutingConfidence;
  /** 0..1 weight applied to this player's evidence. */
  weight: number;
  factors: string[];
  likelyPicks: Array<{ championId: string; role: Role; weight: number; proficiency: ProficiencyEstimate }>;
  anomaly: { level: "none" | "possible" | "likely"; notes: string[] };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Confidence that evidence about this player is about the right person, recent and sufficient. */
export function assessScouting(player: ScoutedPlayer, options: { now?: Date } = {}): Omit<ScoutingAssessment, "likelyPicks"> {
  const now = options.now ?? new Date();
  const factors: string[] = [];
  const identity = { high: 1, medium: 0.75, low: 0.45, unknown: 0.2 }[player.identityConfidence];
  if (player.identityConfidence === "unknown") factors.push("Identity not confirmed");
  const totalGames = player.history.reduce((s, h) => s + h.games, 0);
  const sample = clamp01(totalGames / 40);
  if (totalGames === 0) factors.push("No match history yet");
  else if (totalGames < 15) factors.push(`Small sample (${totalGames} games)`);
  const newest = player.history.reduce<Date | null>((m, h) => (h.lastPlayedAt && (!m || h.lastPlayedAt > m) ? h.lastPlayedAt : m), null);
  const daysSince = newest ? (now.getTime() - newest.getTime()) / 86_400_000 : null;
  const recency = daysSince === null ? 0.3 : daysSince <= 14 ? 1 : daysSince <= 45 ? 0.8 : daysSince <= 120 ? 0.55 : 0.35;
  if (daysSince !== null && daysSince > 45) factors.push(`Last seen ${Math.round(daysSince)} days ago`);
  const accounts = player.accountsTotal === 0 ? 0 : player.accountsResolved / player.accountsTotal;
  if (player.accountsTotal === 0) factors.push("No accounts known");
  else if (player.accountsResolved < player.accountsTotal) factors.push(`${player.accountsTotal - player.accountsResolved} account(s) not resolved`);
  if (!player.likelyRole) factors.push("Role unknown");

  const weight = clamp01(identity * (0.35 + 0.4 * sample + 0.25 * recency) * (0.5 + 0.5 * accounts));
  const confidence: ScoutingConfidence = player.accountsTotal === 0 && totalGames === 0 ? "unknown" : weight >= 0.65 ? "high" : weight >= 0.4 ? "medium" : "low";
  return { playerId: player.id, confidence, weight, factors, anomaly: performanceAnomaly(player) };
}

/**
 * Cautious "visible rank vs performance" signal. Never claims smurfing; only notes when recent
 * results look stronger than the visible rank would suggest, which raises threat confidence.
 */
export function performanceAnomaly(player: ScoutedPlayer): { level: "none" | "possible" | "likely"; notes: string[] } {
  const notes: string[] = [];
  let points = 0;
  const games = player.history.reduce((s, h) => s + h.games, 0);
  const wins = player.history.reduce((s, h) => s + h.wins, 0);
  if (games >= 20) {
    const wr = wins / games;
    if (wr >= 0.62) {
      points += 2;
      notes.push(`Recent win rate ${Math.round(wr * 100)}% over ${games} games`);
    } else if (wr >= 0.57) {
      points += 1;
      notes.push(`Strong recent form (${Math.round(wr * 100)}% over ${games} games)`);
    }
  }
  if (player.rank && player.rank.wins !== null && player.rank.losses !== null) {
    const rg = player.rank.wins + player.rank.losses;
    const rwr = rg > 0 ? player.rank.wins / rg : 0;
    if (rg >= 30 && rwr >= 0.6) {
      points += 1;
      notes.push(`Ranked record ${player.rank.wins}-${player.rank.losses} this season`);
    }
    if (rg > 0 && rg < 40 && rwr >= 0.65) {
      points += 1;
      notes.push("Few ranked games with a very high win rate");
    }
  }
  // Champion-specific dominance.
  const byChampion = new Map<string, { g: number; w: number }>();
  for (const h of player.history) {
    const e = byChampion.get(h.championId) ?? { g: 0, w: 0 };
    e.g += h.games;
    e.w += h.wins;
    byChampion.set(h.championId, e);
  }
  for (const [c, e] of byChampion) {
    if (e.g >= 12 && e.w / e.g >= 0.68) {
      points += 1;
      notes.push(`${c}: ${e.w}-${e.g - e.w} recently`);
      break;
    }
  }
  const level = points >= 3 ? "likely" : points >= 1 ? "possible" : "none";
  if (level !== "none") notes.unshift("Recent performance appears stronger than visible rank suggests");
  return { level, notes };
}

/** Likely picks for a scouted player: proficiency × recency, lightly weighted by current meta strength. */
export function likelyPicks(player: ScoutedPlayer, stats: StatsProvider, champions: Map<string, ChampionInfo>, limit = 6): ScoutingAssessment["likelyPicks"] {
  const role = player.likelyRole;
  const ids = new Set<string>([...player.history.map((h) => h.championId), ...player.mastery.map((m) => m.championId)]);
  const baseline = (() => {
    const g = player.history.reduce((s, h) => s + h.games, 0);
    const w = player.history.reduce((s, h) => s + h.wins, 0);
    return g > 0 ? w / g : 0.5;
  })();
  const out: ScoutingAssessment["likelyPicks"] = [];
  for (const championId of ids) {
    if (!champions.has(championId)) continue;
    const roles: Role[] = role ? [role, ...(player.altRole ? [player.altRole] : [])] : ROLES.slice();
    for (const r of roles) {
      const prof = estimateProficiency(championId, r, player.history, player.mastery.find((m) => m.championId === championId) ?? null, { playerBaselineWinRate: baseline });
      if (prof.games === 0 && !player.mastery.some((m) => m.championId === championId)) continue;
      const recent = prof.recentGames;
      const meta = stats.strength(championId, r).estimate - 0.5;
      const roleShare = stats.roleShare(championId, r).share || champions.get(championId)?.profile.rolePrior[r] || 0.05;
      const weight = (prof.score * 0.6 + Math.min(1, prof.games / 25) * 0.25 + Math.min(1, recent / 8) * 0.15) * (0.7 + 0.3 * Math.min(1, roleShare * 2)) * (1 + meta * 2);
      out.push({ championId, role: r, weight, proficiency: prof });
      if (role) break;
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

export interface BanDamageCandidate {
  championId: string;
  score: number;
  reasons: string[];
  targetPlayerId: string | null;
  role: Role | null;
}

/**
 * Ban damage against a scouted opponent team: how much does removing this champion hurt their
 * likely draft? Combines the target's proficiency on it, how much of their pool remains, meta
 * strength, flexibility, priority and whether we can simply answer it in lane instead.
 */
export function banDamage(
  team: Array<{ player: ScoutedPlayer; assessment: ScoutingAssessment }>,
  stats: StatsProvider,
  champions: Map<string, ChampionInfo>,
  ourAnswers: (championId: string, role: Role) => string[],
  limit = 8,
): BanDamageCandidate[] {
  const out = new Map<string, BanDamageCandidate>();
  for (const { player, assessment } of team) {
    if (assessment.likelyPicks.length === 0) continue;
    const totalWeight = assessment.likelyPicks.reduce((s, p) => s + p.weight, 0) || 1;
    for (const pick of assessment.likelyPicks) {
      const share = pick.weight / totalWeight;
      // Depth: with this champion removed, how good is their next option?
      const others = assessment.likelyPicks.filter((p) => p.championId !== pick.championId);
      const next = others[0]?.weight ?? 0;
      const depthLoss = Math.max(0, pick.weight - next) / Math.max(pick.weight, 0.01);
      const meta = stats.strength(pick.championId, pick.role).estimate - 0.5;
      const presence = stats.presence(pick.championId);
      const flex = (Object.values(champions.get(pick.championId)?.profile.rolePrior ?? {}) as number[]).filter((v) => v >= 0.2).length;
      const answers = ourAnswers(pick.championId, pick.role);
      let score = assessment.weight * (share * 0.6 + depthLoss * 0.3 + Math.max(0, meta) * 2 + presence.proPresence * 0.1 + (flex > 1 ? 0.05 : 0));
      const reasons: string[] = [];
      reasons.push(`${player.label}: ${pick.proficiency.tier === "unknown" ? "known pick" : pick.proficiency.tier.replace("-", " ")} (${pick.proficiency.games} games${pick.proficiency.recentGames ? `, ${pick.proficiency.recentGames} recent` : ""})`);
      if (depthLoss > 0.5) reasons.push("Their next option is much weaker: real pool damage");
      else if (depthLoss < 0.15) reasons.push("They have a comparable fallback; limited pool damage");
      if (meta > 0.01) reasons.push(`Strong this patch (${Math.round((meta + 0.5) * 100)}% in ${ROLE_LABELS[pick.role]})`);
      if (answers.length >= 2) {
        score *= 0.6;
        reasons.push(`We can answer it with ${answers.slice(0, 2).join(", ")} instead`);
      }
      if (assessment.anomaly.level !== "none") {
        score *= assessment.anomaly.level === "likely" ? 1.25 : 1.1;
        reasons.push("Player form above visible rank: ban confidence up");
      }
      if (assessment.confidence === "low") reasons.push("Low scouting confidence: weigh against current meta evidence");
      const existing = out.get(pick.championId);
      if (!existing || existing.score < score) out.set(pick.championId, { championId: pick.championId, score, reasons: reasons.slice(0, 4), targetPlayerId: player.id, role: pick.role });
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
