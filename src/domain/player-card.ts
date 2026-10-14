import { legalRolesFor, poolFor } from "./roster/eligibility";
import type { PlayerProfile } from "./roster/types";

/** Card accents a player may pick; "default" is the theme accent. Kept to a handful on purpose. */
export const CARD_ACCENTS = ["default", "gold", "teal", "violet", "rose"] as const;
export type CardAccent = (typeof CARD_ACCENTS)[number];

export function isCardAccent(v: unknown): v is CardAccent {
  return typeof v === "string" && (CARD_ACCENTS as readonly string[]).includes(v);
}

/** Every champion the player may feature: anything in any of their pools. */
export function featurableChampions(player: PlayerProfile): string[] {
  return [...new Set(legalRolesFor(player).flatMap((r) => poolFor(player, r)))];
}

/** The champion on the card: their own choice while it is still in a pool, else their first primary champion. */
export function featuredChampion(player: PlayerProfile & { featuredChampionId?: string | null }): string | null {
  const allowed = featurableChampions(player);
  if (player.featuredChampionId && allowed.includes(player.featuredChampionId)) return player.featuredChampionId;
  return player.primaryPool[0] ?? allowed[0] ?? null;
}

/** Official Data Dragon loading-screen art (portrait crop, a few dozen KB): the card background. */
export function championCardArtUrl(championId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${encodeURIComponent(championId)}_0.jpg`;
}
