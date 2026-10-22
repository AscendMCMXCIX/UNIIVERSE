import type { MatchFrames, MatchParticipantDetail, MatchTimelineParticipant } from "@/server/db/schema";
import type { ParticipantIdentity } from "./ledger";

/*
  What a stored Riot game keeps of a player whose personal data was erased. The game itself can
  stay for the other players it belongs to, but nothing about the erased player: their place
  becomes a "Removed player" with only the side they played on and the game's result (facts about
  the team, not the person). Their name, Riot ID, PUUID, champion, position, items, runes, spells
  and figures are gone, and so are their timeline entries. Riot still publishes every game it
  hosts; this is about what UNIIVERSE keeps.
*/

export const REMOVED_PLAYER_LABEL = "Removed player";

export function isRemoved(p: Pick<MatchParticipantDetail, "removed">): boolean {
  return p.removed === true;
}

/** The placeholder that takes an erased player's place in a stored game. */
export function removedParticipant(p: Pick<MatchParticipantDetail, "teamId" | "win">): MatchParticipantDetail {
  return {
    puuid: "",
    name: null,
    teamId: p.teamId,
    championId: null,
    championKey: 0,
    champLevel: null,
    position: null,
    win: p.win,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: null,
    gold: null,
    damage: null,
    damageTaken: null,
    vision: null,
    wardsPlaced: null,
    items: null,
    spells: null,
    runes: null,
    removed: true,
  };
}

/** A stored game's players with every erased player replaced (order kept: Riot's participant order). */
export function redactParticipants(participants: readonly MatchParticipantDetail[], erased: (p: ParticipantIdentity) => boolean): { participants: MatchParticipantDetail[]; removed: number } {
  let removed = 0;
  const out = participants.map((p) => {
    if (isRemoved(p)) return p;
    if (!erased({ puuid: p.puuid, name: p.name })) return p;
    removed++;
    return removedParticipant(p);
  });
  return { participants: out, removed };
}

/** A stored timeline without the entries `keep` refuses (purchases, skills and per-frame figures alike). */
export function redactTimeline<T extends { participants: MatchTimelineParticipant[]; frames?: MatchFrames | null }>(row: T, keep: (puuid: string) => boolean): T {
  const participants = row.participants.filter((p) => keep(p.puuid));
  const frames = row.frames ? { t: row.frames.t, p: Object.fromEntries(Object.entries(row.frames.p).filter(([puuid]) => keep(puuid))) } : row.frames;
  return { ...row, participants, frames };
}
