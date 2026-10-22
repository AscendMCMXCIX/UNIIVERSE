import { nameKey } from "./text";
import { inferPrecision } from "./mastery-input";
import type { Judgement, ShownPlayer } from "./mastery-match";
import type { MasteryChampion, RankInfo, RankedChampion, ScoutPlayer } from "./types";

/*
  Who is behind a name. Clash's screens show names, not tags, and a name alone can belong to
  several accounts, so a player is one of three things:

  - Verified: Riot confirmed the exact Riot ID (name and tag) a member typed or confirmed
    (ACCOUNT-V1, signed by the server). Only a verified player is linked to a profile.
  - Possible match: an account UNIIVERSE already knows, from data it holds lawfully (an earlier
    scout in which a member verified it, or the members' recorded games, where it played), whose
    current Riot ID (asked of Riot by its PUUID) has exactly this name on this server. Its mastery
    now, and what earlier scouts showed of it, are compared with the screenshots by the rules in
    mastery-match.ts: agreement makes it worth checking, never proof. A member confirms it (Riot
    then checks the Riot ID) or dismisses it.
  - Not identified: nothing UNIIVERSE holds names this account. A member can type the full Riot ID.

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

/**
 * The screenshots' mastery as the matching rules read it: the champions in the order shown, each
 * figure as precise as the client writes it ("175.4K"), taken now (a scout is read while it is
 * on screen).
 */
export function shownFromEvidence(e: Evidence, capturedAt: number): ShownPlayer {
  return {
    champions: e.mastery.filter((c) => c.championId).map((c) => ({ championId: c.championId!, points: c.points, precision: c.points === null ? 0 : inferPrecision(c.points) })),
    totalScore: e.totalMastery,
    capturedAt,
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

/** The card's words for a judgement: strong, some (partial), or the name only (it differs, or nothing to compare). */
export function candidateView(riotId: string, judgement: Judgement, sources: string[]): CandidateView {
  const strength = judgement.strength === "strong" ? "strong" : judgement.strength === "partial" ? "some" : "name";
  return { riotId, strength, facts: [...judgement.contradictions, ...judgement.facts.filter((f) => f !== "No mastery known for this account"), ...sources].slice(0, 5) };
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
