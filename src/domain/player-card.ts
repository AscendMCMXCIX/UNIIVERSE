import { legalRolesFor, poolFor } from "./roster/eligibility";
import type { RosterPlayer } from "./roster/types";

/*
  A player's card identity, one setting used everywhere (Team, Players, the profile header):
  a featured champion, optionally one of its skins, and an accent colour. Stored on the player
  (featured_champion_id, featured_skin_num, card_accent); every view reads the same fields.
  The art is Riot's official Data Dragon artwork; choosing a skin is decoration only and says
  nothing about owning it.
*/

/** Card accents a player may pick; "default" is the theme accent. Kept to a handful on purpose. */
export const CARD_ACCENTS = ["default", "gold", "teal", "violet", "rose"] as const;
export type CardAccent = (typeof CARD_ACCENTS)[number];

export const ACCENT_COLOR: Record<CardAccent, string> = { default: "var(--color-accent)", gold: "#e8b04a", teal: "#2dd4bf", violet: "#a78bfa", rose: "#fb7185" };
export const ACCENT_LABEL: Record<CardAccent, string> = { default: "UNIIVERSE cyan", gold: "Gold", teal: "Teal", violet: "Violet", rose: "Rose" };

export function isCardAccent(v: unknown): v is CardAccent {
  return typeof v === "string" && (CARD_ACCENTS as readonly string[]).includes(v);
}

/** The card's artwork: a champion and one of its skins (0 = the default skin). */
export interface CardArt {
  championId: string;
  skinNum: number;
}

/** Every champion in any of the player's pools, in preference order (listed first when choosing). */
export function featurableChampions(player: RosterPlayer): string[] {
  return [...new Set(legalRolesFor(player).flatMap((r) => poolFor(player, r)))];
}

/** The champion on the card: the player's own choice, else their first primary champion. */
export function featuredChampion(player: RosterPlayer & { featuredChampionId?: string | null }): string | null {
  if (player.featuredChampionId) return player.featuredChampionId;
  return player.primaryPool[0] ?? featurableChampions(player)[0] ?? null;
}

/** The card art: the featured champion with the chosen skin (the skin only applies to the champion it was chosen for). */
export function cardArt(player: RosterPlayer & { featuredChampionId?: string | null; featuredSkinNum?: number | null }): CardArt | null {
  const championId = featuredChampion(player);
  if (!championId) return null;
  const skinNum = player.featuredChampionId === championId && player.featuredSkinNum && player.featuredSkinNum > 0 ? player.featuredSkinNum : 0;
  return { championId, skinNum };
}

const DDRAGON = "https://ddragon.leagueoflegends.com/cdn/img/champion";

/**
 * Official art for a champion skin. "splash" is the landscape splash (about 1215×717, for the
 * Team card and the profile header); "loading" is the portrait loading-screen crop (308×560, a
 * few dozen KB: directory cards and skin thumbnails), so small cards never download a full splash.
 */
export function championArtUrl(art: CardArt, kind: "splash" | "loading"): string {
  const num = Number.isInteger(art.skinNum) && art.skinNum >= 0 ? art.skinNum : 0;
  return `${DDRAGON}/${kind}/${encodeURIComponent(art.championId)}_${num}.jpg`;
}

/** @deprecated Use championArtUrl. The default skin's loading art. */
export function championCardArtUrl(championId: string): string {
  return championArtUrl({ championId, skinNum: 0 }, "loading");
}
