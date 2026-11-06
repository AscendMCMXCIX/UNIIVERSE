import { formatCount } from "@/lib/format";

/*
  A game's figures as its cards and windows write them. A module of its own, so a window that shows
  a game (the match window, opened from Team → Matches, a champion's matchups or Encounters) does
  not bring the whole Match History page's code with it.
*/

/** A game's length, "31:28"; "—" when unknown. */
export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
/** A figure to `digits` decimals; "—" when unknown. */
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
/** A whole count; "—" when unknown. */
export const fmtInt = (v: number | null) => (v === null ? "—" : formatCount(v));
