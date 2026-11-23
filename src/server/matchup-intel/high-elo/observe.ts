import { matchPrep, type PrepItemInfo, type PrepTimeline } from "@/domain/matchup-intel/prep";
import type { HighEloObservation } from "@/domain/matchup-intel/high-elo/counts";
import { patchFromVersion } from "@/domain/patch";
import { participantDetail } from "@/server/accounts/match-details";
import { timelineEvents, timelineFrames, timelineParticipants } from "@/server/accounts/match-timeline";
import type { RiotMatch, RiotMatchTimeline } from "@/server/riot/api/schemas";

/*
  MATCHUP INTEL's high-elo observations (docs/HIGH_ELO_EVIDENCE.md, "How games are chosen", step 7):
  what one fetched Solo/Duo game says about each of its Master+ players, by the team evidence's own
  rules (domain/matchup-intel/prep.ts: the lane, the lane opponent only where Riot's positions
  confirm it, the keystone, spells, starting items, first completed item, skill order and the
  lane's end). The game's other players are left out: their rank is not known. Nothing returned
  names a player or the game; the PUUIDs read here stay in this function.
*/

/** Ranked Solo/Duo. */
export const HIGH_ELO_QUEUE = 420;
/** A game shorter than this is a remake and counts nowhere (the app's rule: domain/lp-attribution REMAKE_MAX_S). */
export const REMAKE_S = 300;

/** The compact timeline the team evidence reads, made from Riot's timeline as the account sync makes it. */
export function prepTimelineOf(t: RiotMatchTimeline): PrepTimeline {
  return { participants: timelineParticipants(t), salesKept: true, frames: timelineFrames(t), events: timelineEvents(t) };
}

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
  items: Readonly<Record<string, PrepItemInfo>> | null;
  weightFor: (inGame: number) => number;
}): { patch: string; observations: HighEloObservation[] } | null {
  const { info } = input.match;
  if (info.queueId !== HIGH_ELO_QUEUE || !(info.gameDuration >= REMAKE_S)) return null;
  if (info.endOfGameResult && info.endOfGameResult !== "GameComplete") return null;
  const patch = patchFromVersion(info.gameVersion);
  if (!patch) return null;
  const parts = info.participants.map((p) => ({ ...participantDetail(p, input.keyToId), removed: false }));
  const seats = parts.flatMap((p, slot) => (input.masterPlus.has(p.puuid) ? [slot] : []));
  if (!seats.length) return null;
  const weight = input.weightFor(seats.length);
  if (!(weight > 0)) return null;
  const timeline = input.timeline ? prepTimelineOf(input.timeline) : null;
  const observations: HighEloObservation[] = [];
  for (const slot of seats) {
    const me = parts[slot]!;
    const prep = matchPrep(parts, slot, timeline, input.items);
    if (!prep?.lane || !me.championId) continue;
    const first = prep.items?.split(">")[0];
    observations.push({
      role: prep.lane,
      champion: me.championId,
      opponent: prep.rule === "confirmed" && prep.vs ? prep.vs : null,
      win: me.win === true,
      choices: {
        ...(prep.ks !== undefined ? { ks: String(prep.ks) } : {}),
        ...(prep.spells ? { spells: prep.spells } : {}),
        ...(prep.start ? { start: prep.start } : {}),
        ...(first ? { item1: first } : {}),
        ...(prep.skills ? { skills: prep.skills } : {}),
        ...(prep.max ? { max: prep.max } : {}),
      },
      ...(prep.end !== undefined ? { end: prep.end } : {}),
      weight,
    });
  }
  return { patch, observations };
}
