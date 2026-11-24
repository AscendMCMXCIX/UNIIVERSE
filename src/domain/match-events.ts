/*
  MATCH EVENTS: the kills and objectives of one game, from its timeline, as stored (the schema's
  ObjectiveKind) and as the timeline view reads them (server/accounts/match-timeline.ts). The gold chart's helpers that drew them (names, legend,
  marks in rows, the largest swings) went with the chart (23 Nov 2026).
*/

export type ObjectiveKind = "dragon" | "elder" | "baron" | "herald" | "grubs" | "atakhan" | "tower" | "inhibitor";

/** An objective or building, from the player's side: `own` when the player's team took it. */
export interface TimelineObjective {
  minute: number;
  own: boolean;
  kind: ObjectiveKind;
  /** A dragon's element (FIRE …); a building's lane and a tower's tier ("TOP OUTER"). */
  detail: string | null;
  /** Voidgrubs taken together count as one entry: how many. */
  count?: number;
}

export interface TimelineEventsView {
  objectives: TimelineObjective[];
  /** Every champion kill each team made, when every player's are kept (none removed); null otherwise. */
  kills: { own: number[]; enemy: number[] } | null;
  /** The player's own kills, deaths and assists. */
  you: { kills: number[]; deaths: number[]; assists: number[] } | null;
}

