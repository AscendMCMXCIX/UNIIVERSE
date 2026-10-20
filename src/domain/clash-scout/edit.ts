import { parseRiotId } from "@/domain/opgg";
import { nameKey } from "./text";
import type { MasteryChampion, RankInfo, RankedChampion, ScoutContent, ScoutPlayer } from "./types";

/*
  The changes a member makes to a scout in the workspace, as pure functions (the same in a draft
  and in a saved scout). A value a member typed or chose becomes "manual", which a later
  screenshot never overwrites. Verification belongs to one exact Riot ID on one server: changing
  the name to something else, or the opponents' server, makes the player unverified again.
*/

function withPlayer(content: ScoutContent, slot: number, change: (p: ScoutPlayer) => ScoutPlayer): ScoutContent {
  return { ...content, players: content.players.map((p) => (p.slot === slot ? change(p) : p)) };
}

const unverified = (p: ScoutPlayer): ScoutPlayer => ({ ...p, verification: "unverified", riotId: null, puuid: null, proof: null });

export function setPlayerName(content: ScoutContent, slot: number, name: string): ScoutContent {
  return withPlayer(content, slot, (p) => {
    const next = { ...p, name, nameCertainty: "manual" as const };
    const gameName = p.riotId ? parseRiotId(p.riotId)?.gameName : null;
    return p.verification === "verified" && gameName !== name.trim() ? unverified(next) : next;
  });
}

/** The member confirmed the name as read (it stays as it is, now trusted). */
export function confirmPlayerName(content: ScoutContent, slot: number): ScoutContent {
  return withPlayer(content, slot, (p) => ({ ...p, nameCertainty: "manual" }));
}

/** Riot confirmed this Riot ID: the name becomes Riot's own spelling of it. */
export function applyVerification(content: ScoutContent, slot: number, account: { riotId: string; puuid: string; proof: string }): ScoutContent {
  const gameName = parseRiotId(account.riotId)?.gameName ?? null;
  return withPlayer(content, slot, (p) => ({ ...p, name: gameName ?? p.name, nameCertainty: "manual", verification: "verified", riotId: account.riotId, puuid: account.puuid, proof: account.proof }));
}

export function removeVerification(content: ScoutContent, slot: number): ScoutContent {
  return withPlayer(content, slot, unverified);
}

/** A different server: every verification was for the previous one, so none is kept. */
export function setPlatform(content: ScoutContent, platform: string): { content: ScoutContent; cleared: number } {
  if (platform === content.platform) return { content, cleared: 0 };
  const cleared = content.players.filter((p) => p.verification === "verified").length;
  return { content: { ...content, platform, players: content.players.map((p) => (p.verification === "verified" ? unverified(p) : p)) }, cleared };
}

export function setRank(content: ScoutContent, slot: number, rank: RankInfo | null): ScoutContent {
  return withPlayer(content, slot, (p) => ({ ...p, rank, rankCertainty: "manual" }));
}

/** The member's version of a list of champion rows: the rows they added or changed become theirs ("manual"); untouched rows stay as read. */
function edited<T extends RankedChampion | MasteryChampion>(before: readonly T[], after: readonly T[]): T[] {
  return after.map((c) => (before.includes(c) ? c : { ...c, certainty: "manual" as const }));
}

export function setRankedChampions(content: ScoutContent, slot: number, ranked: RankedChampion[]): ScoutContent {
  return withPlayer(content, slot, (p) => ({ ...p, ranked: edited(p.ranked, ranked) }));
}

export function setMasteryChampions(content: ScoutContent, slot: number, mastery: MasteryChampion[]): ScoutContent {
  return withPlayer(content, slot, (p) => ({ ...p, mastery: edited(p.mastery, mastery) }));
}

export function setOpponentName(content: ScoutContent, opponentName: string): ScoutContent {
  return { ...content, opponentName, opponentCertainty: "manual" };
}

/**
 * What still deserves a look: a name or rank read with low confidence, champion rows whose figures
 * were not all read surely, and champions not recognised (left for the member to pick).
 */
export function needsCheck(p: ScoutPlayer): { name: boolean; rank: boolean; rows: number; champions: number } {
  const rows = [...p.ranked, ...p.mastery];
  return {
    name: !!p.name && p.nameCertainty === "low" && p.verification !== "verified",
    rank: !!p.rank && p.rankCertainty === "low",
    rows: rows.filter((c) => c.certainty === "low").length,
    champions: rows.filter((c) => !c.championId).length,
  };
}

/**
 * Where the name shown comes from: Riot (verified), the screenshots (read clearly, or to check), or
 * a member (confirmed as read, corrected, or entered with nothing read).
 */
export type NameSource = "verified" | "read" | "check" | "confirmed" | "corrected" | "entered" | "none";

export function nameSource(p: ScoutPlayer): NameSource {
  if (!p.name.trim()) return "none";
  if (p.verification === "verified") return "verified";
  if (p.nameCertainty === "high") return "read";
  if (p.nameCertainty === "low") return "check";
  const reads = Object.values(p.nameReads ?? {}).filter((r) => !!r?.text);
  if (!reads.length) return "entered";
  return reads.some((r) => nameKey(r!.text) === nameKey(p.name)) ? "confirmed" : "corrected";
}

/** What the screenshots read that differs from the name shown, surest first: the one-tap corrections. */
export function nameAlternatives(p: ScoutPlayer): string[] {
  const seen = new Set([nameKey(p.name)]);
  const out: string[] = [];
  for (const r of Object.values(p.nameReads ?? {}).sort((a, b) => b!.confidence - a!.confidence)) {
    if (!r?.text || seen.has(nameKey(r.text))) continue;
    seen.add(nameKey(r.text));
    out.push(r.text);
  }
  return out;
}

/** Whether a scout holds anything worth saving (or discarding). */
export function hasContent(content: ScoutContent): boolean {
  return !!content.opponentName.trim() || content.players.some((p) => p.name.trim() || p.rank || p.ranked.length || p.mastery.length);
}

const TIER_LABEL: Record<string, string> = { UNRANKED: "Unranked", IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum", EMERALD: "Emerald", DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "Grandmaster", CHALLENGER: "Challenger" };

/** "Gold II · 54 LP", "Master · 213 LP", "Unranked". */
export function formatRank(rank: RankInfo | null): string | null {
  if (!rank) return null;
  const name = [TIER_LABEL[rank.tier] ?? rank.tier, rank.division].filter(Boolean).join(" ");
  return rank.lp !== null && rank.tier !== "UNRANKED" ? `${name} · ${rank.lp} LP` : name;
}

/** Mastery points, short, the way the client prints them: 175,400 → "175.4k", 95,000 → "95k", 1,204,400 → "1.2M". */
export function formatPoints(points: number | null): string | null {
  if (points === null) return null;
  const short = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (points >= 1_000_000) return `${short(points / 1_000_000)}M`;
  if (points >= 1_000) return `${short(points / 1_000)}k`;
  return String(points);
}

export const TIERS = Object.keys(TIER_LABEL);
export const tierLabel = (tier: string) => TIER_LABEL[tier] ?? tier;
