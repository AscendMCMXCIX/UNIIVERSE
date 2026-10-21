import { nameKey } from "./text";
import { TIERS } from "./edit";
import type { MasteryChampion, RankInfo, RankedChampion, ScoutPlayer } from "./types";

/*
  Who is behind a name. Clash's screens show names, not tags, and a name alone can belong to
  several accounts, so a player is one of three things:

  - Verified: Riot confirmed the exact Riot ID (name and tag) a member typed or confirmed
    (ACCOUNT-V1, signed by the server). Only a verified player is linked to a profile.
  - Potential match: an account UNIIVERSE already knows, from data it holds lawfully (an earlier
    scout in which a member verified it, or the members' recorded games, where it played), whose
    current Riot ID (asked of Riot by its PUUID) has exactly this name on this server. Its
    statistics are compared with what the screenshots show; agreement makes it worth checking,
    never proof. A member confirms it (Riot then checks the Riot ID) or dismisses it.
  - Unresolved: nothing UNIIVERSE holds names this account. A member can type the full Riot ID.

  Nothing else is searched: Riot offers no lookup by name without the tag, its Clash API needs
  Riot's review before a product may use it, and tags are never guessed or tried. No historic Riot
  ID is ever shown: a candidate is shown under the Riot ID Riot gives for it now.
*/

/** What a scout's screenshots show about a player, as compared with what is known of an account. */
export interface Evidence {
  rank: RankInfo | null;
  totalMastery: number | null;
  ranked: Array<Pick<RankedChampion, "championId" | "games">>;
  mastery: Array<Pick<MasteryChampion, "championId" | "points" | "level">>;
}

/** A player's evidence: only champions recognised or chosen (a suggestion still to check does not count). */
export function evidenceOf(p: Pick<ScoutPlayer, "rank" | "totalMastery" | "ranked" | "mastery">): Evidence {
  const known = (c: { championId: string | null; championCertainty?: string }) => !!c.championId && c.championCertainty !== "low";
  return {
    rank: p.rank,
    totalMastery: p.totalMastery ?? null,
    ranked: p.ranked.filter(known).map((c) => ({ championId: c.championId, games: c.games })),
    mastery: p.mastery.filter(known).map((c) => ({ championId: c.championId, points: c.points, level: c.level })),
  };
}

/** One account offered for a name, as the page sees it (never a PUUID). */
export interface CandidateView {
  /** Its Riot ID as Riot gives it now. */
  riotId: string;
  /** How much the evidence agrees: a match worth confirming, a possible one, or a name only. */
  strength: "strong" | "some" | "name";
  /** What agrees (and what does not), in a few words each. */
  facts: string[];
}

export interface ScoutSighting {
  opponentName: string;
  scoutedAt: Date;
  evidence: Evidence;
}

export interface GameSightings {
  games: number;
  lastPlayedAt: Date;
  /** Champions it played in those games, most played first. */
  champions: string[];
}

/** Everything known of one candidate account. */
export interface CandidateEvidence {
  riotId: string;
  scouts: ScoutSighting[];
  games: GameSightings | null;
}

const DAY = 86_400_000;
const tierIndex = (rank: RankInfo | null) => (rank ? TIERS.indexOf(rank.tier) : -1);
const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Mastery points never go down, and grow at most so fast; the screenshots round them ("175.4k"),
 * so a little below still agrees.
 */
export function pointsAgree(now: number, then: number, days: number): boolean {
  return now >= then * 0.99 - 200 && now <= then + 50_000 + 6_000 * Math.max(0, days);
}

/**
 * How what the screenshots show now compares with an earlier scout of the same account: mastery
 * champions and their points (the strongest sign: a set of champions with points that only grow),
 * total mastery (never lower), rank (rarely more than a tier apart). Returns 0–1 and the facts.
 */
export function compareWithScout(now: Evidence, then: ScoutSighting, at: Date, championName: (id: string) => string): { score: number; facts: string[]; contradicts: boolean } {
  const days = Math.max(0, (at.getTime() - then.scoutedAt.getTime()) / DAY);
  const facts: string[] = [];
  let agree = 0, total = 0, contradicts = false;
  const nowMastery = new Map(now.mastery.filter((c) => c.championId).map((c) => [c.championId!, c]));
  const same: string[] = [];
  for (const c of then.evidence.mastery) {
    if (!c.championId) continue;
    const m = nowMastery.get(c.championId);
    if (!m) continue;
    total++;
    if (m.points !== null && c.points !== null) {
      if (pointsAgree(m.points, c.points, days)) {
        agree++;
        same.push(championName(c.championId));
      } else contradicts = true;
    } else same.push(championName(c.championId));
  }
  const shared = then.evidence.mastery.filter((c) => c.championId && nowMastery.has(c.championId)).length;
  const of = Math.max(now.mastery.length, then.evidence.mastery.length);
  if (shared) facts.push(`${shared} of ${of} mastery champions as in your scout of ${then.opponentName} (${dateText(then.scoutedAt)})${same.length ? `: ${same.slice(0, 3).join(", ")}${same.length > 3 ? "…" : ""}` : ""}`);
  else if (of) facts.push(`Mastery champions differ from your scout of ${then.opponentName} (${dateText(then.scoutedAt)})`);
  if (contradicts) facts.push("Some mastery points are lower than before: probably another account");
  if (now.totalMastery !== null && then.evidence.totalMastery !== null) {
    total++;
    if (now.totalMastery >= then.evidence.totalMastery - 1) agree++;
    else {
      contradicts = true;
      facts.push(`Total mastery ${now.totalMastery}, ${then.evidence.totalMastery} before`);
    }
  }
  const a = tierIndex(now.rank), b = tierIndex(then.evidence.rank);
  if (a > 0 && b > 0) {
    total++;
    if (Math.abs(a - b) <= 1) agree++;
  }
  const score = total ? Math.max(0, agree - (contradicts ? 2 : 0)) / total : 0;
  return { score, facts, contradicts };
}

/** How the screenshots' champions compare with the champions the account played in the members' recorded games. */
export function compareWithGames(now: Evidence, games: GameSightings, championName: (id: string) => string): { score: number; facts: string[] } {
  const shown = new Set([...now.ranked, ...now.mastery].map((c) => c.championId).filter((id): id is string => !!id));
  const both = games.champions.filter((id) => shown.has(id));
  const facts = [`Played with or against your team in ${games.games} recorded ${games.games === 1 ? "game" : "games"} (last ${dateText(games.lastPlayedAt)})${both.length ? `, on ${both.slice(0, 3).map(championName).join(", ")}` : ""}`];
  return { score: shown.size && games.champions.length ? both.length / Math.min(shown.size, games.champions.length) : 0, facts };
}

/** One candidate, judged on everything known of it. A strong match still needs a member's confirmation. */
export function judgeCandidate(now: Evidence, c: CandidateEvidence, at: Date, championName: (id: string) => string): CandidateView & { score: number } {
  const facts: string[] = [];
  let best = 0, contradicted = false;
  for (const s of c.scouts.slice(0, 2)) {
    const r = compareWithScout(now, s, at, championName);
    facts.push(...r.facts);
    best = Math.max(best, r.score);
    contradicted ||= r.contradicts;
  }
  if (c.games) {
    const r = compareWithGames(now, c.games, championName);
    facts.push(...r.facts);
    best = Math.max(best, r.score * 0.8);
  }
  const strength = !contradicted && best >= 0.75 ? "strong" : !contradicted && best >= 0.3 ? "some" : "name";
  return { riotId: c.riotId, strength, facts, score: contradicted ? best / 2 : best };
}

/** Candidates for a name, best first; ambiguity (several of similar strength) is left for the member to settle. */
export function rankCandidates(views: Array<CandidateView & { score: number }>): CandidateView[] {
  return [...views].sort((a, b) => b.score - a.score).map(({ score: _score, ...v }) => v);
}

/** The key names are compared by: the same as the screenshots' (case and spacing ignored). */
export const candidateKey = (name: string) => nameKey(name);

/** Where a player stands: verified, a potential match to check, unresolved, or no name at all. */
export type IdentityState = "verified" | "possible" | "unresolved" | "none";

export function identityState(p: Pick<ScoutPlayer, "name" | "verification">, candidates: readonly CandidateView[] | undefined): IdentityState {
  if (p.verification === "verified") return "verified";
  if (!p.name.trim()) return "none";
  return candidates?.length ? "possible" : "unresolved";
}
