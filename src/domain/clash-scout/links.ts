import { opggProfileUrl } from "@/domain/opgg";
import type { ScoutPlayer } from "./types";

/*
  Looking players up. A direct OP.GG profile needs the full Riot ID (game name and tag), so it is
  offered only for an account Riot verified; a name alone could belong to several accounts, and a
  tag is never guessed. For names, Clash Scout copies them exactly (any script) and opens OP.GG's
  Multi-Search, where they are pasted: OP.GG documents Multi-Search as a paste box (names
  separated by commas); it does not document a link format that pre-fills it.
*/

export const OPGG_MULTISEARCH_URL = "https://op.gg/lol/multisearch";

/** The verified player's OP.GG profile, or null when the account is not verified. */
export function verifiedProfileUrl(player: Pick<ScoutPlayer, "verification" | "riotId">, platform: string): string | null {
  if (player.verification !== "verified" || !player.riotId) return null;
  return opggProfileUrl(player.riotId, platform);
}

/** What Multi-Search should receive for these players: verified Riot IDs where known, names otherwise, comma separated. */
export function multiSearchText(players: ReadonlyArray<Pick<ScoutPlayer, "name" | "riotId" | "verification">>): string {
  return players
    .map((p) => (p.verification === "verified" && p.riotId ? p.riotId : p.name.trim()))
    .filter(Boolean)
    .join(", ");
}

/** A Riot ID prefilled for checking: the name and "#", the tag left for the member to type. */
export function riotIdDraft(player: Pick<ScoutPlayer, "name" | "riotId">): string {
  return player.riotId ?? (player.name.includes("#") ? player.name : `${player.name}#`);
}
