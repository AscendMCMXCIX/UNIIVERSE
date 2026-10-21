import { opggProfileUrl } from "@/domain/opgg";
import type { ScoutPlayer } from "./types";

/*
  Looking players up. A direct OP.GG profile needs the full Riot ID (game name and tag), so it is
  offered only for an account Riot verified (the shared builder in domain/opgg); a name alone
  could belong to several accounts, and a tag is never guessed. "Open all 5 profiles" opens these,
  one tab each (components/clash/open-profiles.tsx); a player not identified is searched on OP.GG
  by the name copied (OP.GG publishes no link that searches by name), or identified first.
*/

/** The verified player's OP.GG profile, or null when the account is not verified. */
export function verifiedProfileUrl(player: Pick<ScoutPlayer, "verification" | "riotId">, platform: string): string | null {
  if (player.verification !== "verified" || !player.riotId) return null;
  return opggProfileUrl(player.riotId, platform);
}

/** A Riot ID prefilled for checking: the name and "#", the tag left for the member to type. */
export function riotIdDraft(player: Pick<ScoutPlayer, "name" | "riotId">): string {
  return player.riotId ?? (player.name.includes("#") ? player.name : `${player.name}#`);
}
