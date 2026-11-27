import { patchFromVersion } from "@/domain/patch";
import type { HighEloObservation } from "@/domain/high-elo/counts";
import { laneOf, observeBuild } from "@/domain/champion-builds-observe";
import type { ItemClasses, SkillRanks } from "@/domain/champion-builds";
import { participantDetail } from "@/server/accounts/match-details";
import { timelineParticipants } from "@/server/accounts/match-timeline";
import type { RiotMatch, RiotMatchTimeline } from "@/server/riot/api/schemas";

/*
  The high-elo observations (docs/HIGH_ELO_EVIDENCE.md, "How games are chosen", step 7): what one
  fetched Ranked Solo/Duo game says about each of its Master+ players' builds, by the builds' own
  rules (domain/champion-builds-observe observeBuild, held equal to the team's statement). The
  game's other players are left out: their rank is not known. Nothing returned names a player or
  the game; the PUUIDs read here stay in this function.
*/

/** Ranked Solo/Duo. */
export const HIGH_ELO_QUEUE = 420;
/** A game shorter than this is a remake and counts nowhere (the builds' rule). */
export const REMAKE_S = 300;

/**
 * Each Master+ player's observation of one game, with the weight `weightFor` gives a game with that
 * many Master+ players; null for a game that counts nowhere (another queue, a remake, an unreadable
 * version, no Master+ player in it).
 */
export function observeGame(input: {
  match: RiotMatch;
  timeline: RiotMatchTimeline | null;
  /** The server's Challenger, Grandmaster and Master players just read (in memory only). */
  masterPlus: ReadonlySet<string>;
  keyToId: Map<number, string>;
  items: ItemClasses;
  /** Each champion's ability ranks (its skill order), or null. */
  ranksOf: (champion: string) => SkillRanks | null;
  weightFor: (inGame: number) => number;
}): { patch: string; observations: HighEloObservation[] } | null {
  const { info } = input.match;
  if (info.queueId !== HIGH_ELO_QUEUE || !(info.gameDuration >= REMAKE_S)) return null;
  if (info.endOfGameResult && info.endOfGameResult !== "GameComplete") return null;
  const patch = patchFromVersion(info.gameVersion);
  if (!patch) return null;
  const parts = info.participants.map((p) => participantDetail(p, input.keyToId));
  const seats = parts.filter((p) => input.masterPlus.has(p.puuid));
  if (!seats.length) return null;
  const weight = input.weightFor(seats.length);
  if (!(weight > 0)) return null;
  const timeline = input.timeline ? timelineParticipants(input.timeline) : [];
  const observations: HighEloObservation[] = [];
  for (const me of seats) {
    const lane = laneOf(me.position);
    if (!lane || !me.championId) continue;
    const tl = timeline.find((t) => t.puuid === me.puuid) ?? null;
    observations.push({ lane, champion: me.championId, win: me.win === true, values: observeBuild(me, tl, input.items, input.ranksOf(me.championId)), weight });
  }
  return { patch, observations };
}
