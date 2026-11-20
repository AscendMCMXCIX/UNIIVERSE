import { formatCount } from "./format";

/*
  Tooltip and title texts built from a template, kept here so each is tested on its own
  (tip-words.test.ts). Each reads right on anyone's page: the player's own, or a teammate's
  (the tooltip inventory's wrong items H12 and H22 said "your" on other players' pages).
*/

/** How a player was met in recorded games: "3 against, 1 on the same team". */
export function metSides(met: { opponent: number; ally: number }): string {
  return [met.opponent ? `${formatCount(met.opponent)} against` : null, met.ally ? `${formatCount(met.ally)} on the same team` : null].filter(Boolean).join(", ");
}

/** The "Met 4×" chip's name on a scoreboard. */
export function metText(met: { games: number; opponent: number; ally: number }): string {
  return `Met in ${formatCount(met.games)} recorded games, this one included (${metSides(met)}). Opens those games.`;
}

/** A game's "Best" chip: "Best vision/min in the last 22 ranked games as Support: 1.9 (previous best 1.6)". */
export function standoutText({ label, games, queue, role, value, top }: { label: string; games: number; queue: string; role: string | null; value: string; top: string }): string {
  return `Best ${label} in the last ${formatCount(games)} ${queue} games${role ? ` as ${role}` : ""}: ${value} (previous best ${top})`;
}
