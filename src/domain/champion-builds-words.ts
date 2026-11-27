import { formatCount, percent, percentRange } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { FIRM_WIN_RATE_GAMES, MIN_CHOICE_GAMES, MIN_PERFORMER_GAMES, MIN_SECTION_GAMES, type BuildChoice, type BuildQueueKey, type FullBuildValue, type RoleBuilds } from "./champion-builds";

/*
  Champion Intel's builds in words (docs/CHAMPION_INTEL.md, "Builds and runes"): the section's
  visible source line and every ⓘ, each one plain idea of at most about 25 words
  (champion-builds-words.test.ts counts them as tip-length.test.ts does). Factual: what was counted
  and how often it won, never advice, a verdict or "best"; nothing "verified" or "tracked".
*/

export const BUILDS_TITLE = "Builds and runes";
export const MOST_COMMON = "Most common";
export const HIGHEST_WIN_RATE = "Highest win rate";

/** What the source line's "in the team's matches" explains. */
export const SOURCE_TIP = "Counted from the games of the team's stored matches (both teams). Not a global sample of League players.";
/** What "all ranks" explains. */
export const RANK_TIP = "Riot's game records hold no rank, so these games are not filtered by rank.";
/** The "Most common" view, explained. */
export const MOST_COMMON_TIP = `The choice made in the most games, among those made in at least ${MIN_CHOICE_GAMES} games and a tenth of them.`;
/** The "Highest win rate" view, explained (D6: a choice is said to win more only where chance is ruled out at 99%). */
export const HIGHEST_TIP = `Among choices of ${MIN_PERFORMER_GAMES} games or more, one that won clearly more than the most common, 99% sure not by chance. Shown only then.`;
/** The "Win rate" column heading's ⓘ: why some are quieter, and where each one's likely range is. */
export const WIN_RATE_TIP = `Win rates from fewer than ${FIRM_WIN_RATE_GAMES} games are greyed: they swing a lot. Each one's ⓘ gives its likely range.`;
/** Said to a screen reader after a win rate from fewer than FIRM_WIN_RATE_GAMES games (drawn quieter). */
export const SMALL_SAMPLE_WORDS = "(small sample)";

export type BuildPartKey = "runes" | "shards" | "spells" | "skills" | "start" | "boots" | "core";

/** Each part's row label. */
export const PART_LABELS: Record<BuildPartKey | "full", string> = {
  runes: "Runes",
  shards: "Stat shards",
  spells: "Summoner spells",
  skills: "Skill order",
  start: "Starting items",
  boots: "Boots",
  core: "Core items",
  full: "Full build",
};

/**
 * What one game of each part is, in a sentence ("the 87 games with this keystone and secondary
 * tree"): what was counted together, so a figure never claims more than it counts. A rune choice is
 * its keystone and secondary tree (its minor runes vary; the row shows the most common page), core
 * items are the three in any order (the row shows their most common order), a skill order is the
 * order the skills were maxed in (its first points vary; the row says the most common).
 */
const PART_NOUN: Record<BuildPartKey, { choice: string; recorded: string }> = {
  runes: { choice: "this keystone and secondary tree", recorded: "with a full rune page recorded" },
  shards: { choice: "these stat shards", recorded: "with stat shards recorded" },
  spells: { choice: "these summoner spells", recorded: "with summoner spells recorded" },
  skills: { choice: "this skill order", recorded: "with a skill order recorded" },
  start: { choice: "these starting items", recorded: "with starting items recorded" },
  boots: { choice: "this choice of boots", recorded: "with boots or three items recorded" },
  core: { choice: "these core items in any order", recorded: "with three completed items recorded" },
};

const pct = (x: number) => percent(x, 0);
const games = (n: number) => `${formatCount(n)} game${n === 1 ? "" : "s"}`;

/** The queues as the page names them (the queue choice; src/server/players/match-history.ts names them the same, copied here because a page's module may not import a server one). */
export const QUEUE_LABELS: Record<BuildQueueKey, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex", draft: "Normal Draft", clash: "Clash" };

/** The queue choice's ⓘ (D5: one queue at a time, never pooled). */
export const QUEUE_TIP = "Each queue is counted on its own and never mixed. Swiftplay, Quickplay, Blind Pick and ARAM are not counted.";

/** The queue choice's accessible name. */
export function queueSelectLabel(championName: string): string {
  return `${championName}'s builds: queue`;
}

/**
 * "patch 26.22", or "patches 26.21–26.22" with the previous patch added; where the current patch has
 * no game yet (the first days of a patch), the previous patch alone, said as that: "patch 26.21, none
 * yet on 26.22", never a range that would put the current patch in the sample.
 */
export function patchWords(b: Pick<RoleBuilds, "patches" | "currentGames">): string {
  if (b.patches.length < 2) return `patch ${b.patches[0]}`;
  return b.currentGames > 0 ? `patches ${b.patches.at(-1)}–${b.patches[0]}` : `patch ${b.patches[1]}, none yet on ${b.patches[0]}`;
}

export function patchTip(b: Pick<RoleBuilds, "patches" | "games" | "currentGames">): string {
  if (b.patches.length < 2) return `Only games on the current patch, ${b.patches[0]}.`;
  if (b.currentGames === 0) return `Patch ${b.patches[0]} has no games yet, so only the ${games(b.games)} on ${b.patches[1]} are counted.`;
  return `Patch ${b.patches[0]} has ${games(b.currentGames)} so far, fewer than ${MIN_SECTION_GAMES}, so the ${formatCount(b.games - b.currentGames)} on ${b.patches[1]} are counted too.`;
}

/** "From 143 games": the section's sample. */
export function gamesWords(b: Pick<RoleBuilds, "games">): string {
  return `From ${games(b.games)}`;
}

/** What the sample holds: which parts come from every game, which from the games with a timeline, and the team's own share. */
export function gamesTip(b: Pick<RoleBuilds, "games" | "timelineGames" | "teamGames">): string {
  return `Runes and spells come from all ${formatCount(b.games)} games; items and skills from the ${formatCount(b.timelineGames)} with a timeline. ${formatCount(b.teamGames)} are the team's own.`;
}

/** The whole source line in words ("From 143 games in the team's matches · patch 26.23 · all ranks"), as the section shows it: its queue is the queue choice beside it. */
export function sourceWords(b: Pick<RoleBuilds, "games" | "patches" | "currentGames">): string {
  return `${gamesWords(b)} in the team's matches · ${patchWords(b)} · all ranks`;
}

/** One choice's record in plain words: how often it won, in how many games, its likely range, and how many of the part's games made it. */
export function choiceTip(part: BuildPartKey, c: Pick<BuildChoice<unknown>, "winRate" | "games" | "share" | "total" | "range">): string {
  const noun = PART_NOUN[part];
  return `Won ${pct(c.winRate)} of ${games(c.games)} with ${noun.choice}, likely ${percentRange(c.range.low, c.range.high)}. ${pct(c.share)} of ${games(c.total)} ${noun.recorded} made it.`;
}

/** Whether a choice's win rate is firm enough to draw in the figures' colour (else quieter, said so). */
export function firmWinRate(c: Pick<BuildChoice<unknown>, "games">): boolean {
  return c.games >= FIRM_WIN_RATE_GAMES;
}

/** The win rate and the pick rate as a row shows them. */
export function choiceFigures(c: Pick<BuildChoice<unknown>, "winRate" | "share">): { win: string; pick: string } {
  return { win: pct(c.winRate), pick: pct(c.share) };
}

/** A part that cannot name a choice: too few games record it, or none of its choices is common enough. */
export function partEmptyWords(state: "few" | "varied", total: number): string {
  return state === "few" ? `Too few recorded yet (${games(total)})` : `No common choice in ${games(total)}`;
}

/**
 * The full build, a composition: each later item's own share. `highest`: the "Highest win rate"
 * view, whose full build starts from the core items with the highest win rate, not the most common.
 */
export function fullTip(f: FullBuildValue, highest = false): string {
  const fourth = `${pct(f.fourth.games / f.fourth.total)} of ${games(f.fourth.total)}`;
  const core = highest ? "The core items with the highest win rate" : "The most common core items";
  return f.fifth
    ? `${core}, then ${highest ? "those" : "the items"} most often bought fourth (${fourth}) and fifth (${pct(f.fifth.games / f.fifth.total)} of ${formatCount(f.fifth.total)}) after them.`
    : `${core}, then the item most often bought fourth after them (${fourth}).`;
}

/** The empty section, honestly: the current patch has too few games of this champion in any role of the queue. */
export function fewWords(queue: BuildQueueKey, currentPatch: string): string {
  return `Not enough ${QUEUE_LABELS[queue]} games on patch ${currentPatch} in the team's matches yet`;
}

export function fewTip(games: number, role: Role | null, queue: BuildQueueKey): string {
  const seen = role && games > 0 ? `${formatCount(games)} as ${ROLE_LABELS[role]} on this patch and the one before` : "none on this patch or the one before";
  return `Builds need ${MIN_SECTION_GAMES} games in one role and queue. The team's ${QUEUE_LABELS[queue]} games have ${seen}.`;
}

/** The offer of another queue that has builds, where the chosen one has too few ("Show Ranked Flex (34 games as Support)"): the reader chooses, nothing switches on its own. */
export function otherQueueWords(offer: { queue: BuildQueueKey; role: Role; games: number }): string {
  return `Show ${QUEUE_LABELS[offer.queue]} (${games(offer.games)} as ${ROLE_LABELS[offer.role]})`;
}

export const UNAVAILABLE_WORDS = "Builds can't be loaded right now.";
/** The full build where no fourth item after the core is common enough to name. */
export const FULL_EMPTY_WORDS = "No common fourth item yet";
/** The boots part's choice where games completed three items without boots. */
export const NO_BOOTS = "No boots";
/** For a screen reader, beside a row the "Highest win rate" view changed. */
export const DIFFERS_WORDS = "(not the most common)";
/** For a screen reader, before a rune choice's icons: its minor runes are the commonest page of its keystone and secondary tree. */
export const RUNE_PAGE_WORDS = "The most common page with this keystone and secondary tree:";
/** For a screen reader, before the core items' icons: the three are counted in any order. */
export const CORE_ORDER_WORDS = "In their most common order:";
/** Beside a skill order's keys, before its first three points: the most common among the games maxing in that order ("most often first Q E W"). */
export const FIRST_POINTS_WORDS = "most often first";

/** The role switch's name. */
export function roleSwitchLabel(championName: string): string {
  return `${championName}'s builds by role`;
}
