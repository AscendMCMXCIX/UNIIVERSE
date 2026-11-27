import { formatCount } from "@/lib/format";
import { publicPatchName } from "@/domain/patch";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { KitChange } from "./early-kit";
import { MIN_LANE_GAMES, type LaneQueueEvidence, type LaneShare, type LaneWindow } from "./lane-evidence";
import type { NoteFreshness } from "./notes";
import { QUEUE_LABELS, type LaneQueueKey } from "./queues";

/*
  MATCHUP INTEL's band in words (docs/MATCHUP_INTEL.md; docs/HELP_TEXT.md, "Matchup Intel"): every
  fixed sentence and ⓘ of the early-lane band, each ⓘ one or two plain sentences of at most about
  25 words (words.test.ts counts them as tip-length.test.ts does), none with a refused word
  (refused-words.ts): observations with their sample, never advice, a verdict or "you". The band is
  opened for any pair, teammates' included, so nothing says "your".
*/

export const BAND_TITLE = "Matchup Intel";
export const BAND_SUBTITLE = "Early lane";
export const NOTES_TITLE = "Reviewed notes";
export const TEAM_TITLE = "In the team's matches";
export const RIOT_TITLE = "From Riot's data";
export const RIOT_SUBTITLE = "Level 1";
export const PLAYING_LABEL = "Playing";
export const AGAINST_LABEL = "Against";
export const NO_LANE = "No lane";

export const NOTES_TIP = "Written and checked by a team administrator from the sources shown. Observations about the two kits, not advice.";
export const TEAM_TIP = "Counted in the team's stored matches, both teams, with a timeline to 10:00. Not a global sample; high-elo games are not collected.";
export const RIOT_TIP = "Riot's level 1 numbers side by side, the same quantity only. Riot's data cannot show every balance change; cooldowns are in the rows below.";
export const FEW_TIP = `A few games can lean either way by chance, so figures show from ${MIN_LANE_GAMES} games with a timeline.`;
const RANGE_FIRST = "The likely range of the share over many more such games (95%).";
export const RANGE_TIP = `${RANGE_FIRST} A range that includes 50% shows no difference beyond chance.`;
export const UNAVAILABLE_WORDS = "Lane figures can't be loaded right now.";
export const MIRROR_WORDS = "A champion is picked only once in a draft game, so no game has this pair.";

/** The lane control's accessible name. */
export const laneControlLabel = (a: string, b: string) => `Lane matchup for ${a} and ${b}`;
/** The queue choice's accessible name. */
export const QUEUE_SELECT_LABEL = "Lane figures: queue";

/** The band's name for screen readers: "Matchup Intel, Top: Riven against Darius". */
export function bandLabel(role: Role, a: string, b: string): string {
  return `${BAND_TITLE}, ${ROLE_LABELS[role]}: ${a} against ${b}`;
}

/** A signed whole number, a true minus sign: "+180", "−220", "0". */
export function signed(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${formatCount(Math.abs(r))}`;
}

/** A share as the band writes it: "64%". */
export const pct = (v: number) => `${formatCount(v * 100)}%`;

/** "9 of 14 · 64% (39–84%)". */
export function shareWords(s: LaneShare): string {
  return `${formatCount(s.n)} of ${formatCount(s.of)} · ${pct(s.share)} (${formatCount(s.low * 100)}–${pct(s.high)})`;
}

/** "9 of 14 games, 64 percent, 95% range 39 to 84 percent" (read out). */
export function shareSpoken(s: LaneShare): string {
  return `${formatCount(s.n)} of ${formatCount(s.of)} games, ${formatCount(s.share * 100)} percent, 95% range ${formatCount(s.low * 100)} to ${formatCount(s.high * 100)} percent`;
}

/** Whether a share's 95% range takes in an even split. */
export const evenInRange = (s: LaneShare) => s.low <= 0.5 && s.high >= 0.5;

/** The ⓘ of a share: its range, and where it includes 50%, that the games show no difference beyond chance. */
export function shareTip(s: LaneShare): string {
  return evenInRange(s) ? `${RANGE_FIRST} It includes 50%: these games don't show a difference beyond chance.` : RANGE_TIP;
}

/** The sample line: "14 games · Season 2026 · since 26.22" (the queue is the choice beside it). */
export function sampleWords(e: LaneQueueEvidence, season: number): string {
  const parts = [`${formatCount(e.games)} ${e.games === 1 ? "game" : "games"}`, seasonLabel(season)];
  if (e.window.kind === "since-change") parts.push(`since ${publicPatchName(e.window.change.patch)}`);
  return parts.join(" · ");
}

/** The sample's ⓘ: the window, the games before Riot's latest change, the current patch, the games without a timeline. */
export function sampleTip(e: LaneQueueEvidence, currentPatch: string | null): string {
  const out: string[] = [];
  const w: LaneWindow = e.window;
  if (w.kind === "since-change") out.push(`Only games since Riot's latest change to ${w.change.champions.join(" and ")}, on ${publicPatchName(w.change.patch)}.`);
  else if (w.change && w.before > 0) out.push(`Riot changed ${w.change.champions.join(" and ")} on ${publicPatchName(w.change.patch)}: ${formatCount(w.before)} of these games came before it.`);
  else if (w.comparedFrom) out.push(`Riot's data before ${publicPatchName(w.comparedFrom)} was not compared.`);
  if (currentPatch) out.push(`${formatCount(e.currentPatchGames)} on patch ${publicPatchName(currentPatch)}; ${formatCount(e.noTimeline)} more without a timeline.`);
  return out.join(" ");
}

/** No game of the pairing in the queue this season. */
export function noneWords(a: string, b: string, role: Role, queue: LaneQueueKey): string {
  return `No ${QUEUE_LABELS[queue]} games of ${a} vs ${b} in ${ROLE_LABELS[role]} in the team's matches yet.`;
}

/** Fewer games than figures need. */
export function fewWords(e: LaneQueueEvidence, season: number): string {
  return `${formatCount(e.games)} ${e.games === 1 ? "game" : "games"} in the team's matches (${QUEUE_LABELS[e.queue]}, ${seasonLabel(season)}). Figures show from ${MIN_LANE_GAMES}.`;
}

/** Games of the pairing stored, none with a timeline reaching 10:00. */
export function untimedWords(e: LaneQueueEvidence): string {
  return `${formatCount(e.stored)} ${e.stored === 1 ? "game" : "games"} in the team's matches, none with a timeline to 10:00 yet.`;
}

export const aheadLabel = (a: string) => `${a} ahead in gold at 10:00`;
export const MEDIAN_LABEL = "Median at 10:00";
export const KILLS_LABEL = "Kills on each other before 10:00";
export const FIRST_BLOOD_LABEL = "First blood";
export const wonLabel = (a: string) => `${a}'s side won`;

/** "gold +180 · CS +6 · XP +120" (CS left out for supports). */
export function medianWords(m: { gold: number; cs: number | null; xp: number }): string {
  return [`gold ${signed(m.gold)}`, m.cs === null ? null : `CS ${signed(m.cs)}`, `XP ${signed(m.xp)}`].filter(Boolean).join(" · ");
}

/** The medians read out: "180 more gold for Riven at 10:00, 6 more CS …". */
export function medianSpoken(m: { gold: number; cs: number | null; xp: number }, a: string, b: string): string {
  const one = (n: number, what: string) => (Math.round(n) === 0 ? `the same ${what}` : `${formatCount(Math.abs(n))} more ${what} for ${n > 0 ? a : b}`);
  return `In the middle game at 10:00: ${[one(m.gold, "gold"), m.cs === null ? null : one(m.cs, "CS"), one(m.xp, "experience")].filter(Boolean).join(", ")}.`;
}

/** The medians' ⓘ: what the sign means and the middle half of the gold. */
export function medianTip(a: string, b: string, gold: { low: number; high: number }): string {
  return `${a}'s figures minus ${b}'s in the middle game. The middle half ran from ${signed(gold.low)} to ${signed(gold.high)} gold.`;
}

/** "in 4 and 5 of the 12 games with kill times". */
export function killsTip(k: { games: number; gamesA: number; gamesB: number }, a: string, b: string): string {
  return `${a} took a kill on ${b} in ${formatCount(k.gamesA)} and ${b} on ${a} in ${formatCount(k.gamesB)} of the ${formatCount(k.games)} games with kill times.`;
}

/** The notes' heading meta and the hidden notes' line. */
export function freshnessWords(f: NoteFreshness, reviewedPatch: string | null, currentPatch: string | null, names: Readonly<Record<string, string>>): { meta: string | null; hidden: string | null } {
  const reviewed = reviewedPatch ? publicPatchName(reviewedPatch) : null;
  const current = currentPatch ? publicPatchName(currentPatch) : null;
  if (f.state === "fresh") return { meta: reviewed ? `Patch ${reviewed}` : null, hidden: null };
  if (f.state === "stale") return { meta: `Reviewed on ${reviewed ?? "an earlier patch"} · not re-checked for ${current ?? "this patch"}`, hidden: null };
  if (f.state === "hidden-changed") return { meta: null, hidden: `A reviewed note is hidden: Riot's data for ${f.changed.map((id) => names[id] ?? id).join(" and ")} changed after its review on ${reviewed ?? "an earlier patch"}.` };
  return { meta: null, hidden: f.distance === null ? "A reviewed note is hidden: its review patch is no longer listed." : `A reviewed note is hidden: its last review (${reviewed}) is ${formatCount(f.distance)} patches old.` };
}

/** No notes for the pair. */
export function noNotesWords(a: string, b: string, role: Role): string {
  return `No reviewed notes for ${a} vs ${b} in ${ROLE_LABELS[role]} yet.`;
}

/** "Riot's data for Darius changed since 26.22: E text and cooldowns, base stats." */
export function kitChangeWords(c: KitChange): string {
  return `Riot's data for ${c.champion} changed${c.sincePatch ? ` since ${c.sincePatch}` : ""}: ${c.parts.join(", ")}.`;
}

/** A source's credit line for a wiki page (the old page's credit). */
export const WIKI_CREDIT = "League of Legends Wiki contributors";
export const WIKI_LICENCE = "CC BY-SA 3.0";
export const WIKI_LICENCE_URL = "https://creativecommons.org/licenses/by-sa/3.0/";
