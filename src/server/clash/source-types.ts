import type { ClashPlayer, ClashTeam, ClashTournament } from "@/server/riot/api/schemas";

/* What Clash Scout asks Riot about Clash (server/clash/source.ts), and how a failure is told. */

export type ClashFailure = "forbidden" | "rate-limited" | "unavailable";

export class ClashApiError extends Error {
  constructor(
    public readonly kind: ClashFailure,
    message: string,
  ) {
    super(message);
    this.name = "ClashApiError";
  }
}

/** What the member is told when Riot's Clash data could not be had. */
export const CLASH_FAILURE_TEXT: Record<ClashFailure, string> = {
  forbidden: "Riot refused this request: the app's key is not allowed to use Riot's Clash data.",
  "rate-limited": "Riot asked the app to slow down. Try again in a minute.",
  unavailable: "Riot's Clash data is not available right now. Try again in a few minutes.",
};

export interface ClashSource {
  /** Active and upcoming tournaments on a server. */
  tournaments(platform: string): Promise<ClashTournament[]>;
  /** A player's active registrations (empty when none). */
  registrations(platform: string, puuid: string): Promise<ClashPlayer[]>;
  /** A registered team, or null when Riot has none by that id. */
  team(platform: string, teamId: string): Promise<ClashTeam | null>;
  /** The tournament a team is registered for, or null. */
  tournamentOfTeam(platform: string, teamId: string): Promise<ClashTournament | null>;
  /** An account's Riot ID now ("Name#TAG"), or null when the account no longer exists. */
  riotId(platform: string, puuid: string): Promise<string | null>;
  /** Requests that reached Riot (cache misses), for measurements. */
  readonly requests: number;
}
