import { formatCount, percent } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MIN_CHOICE_GAMES, MIN_PERFORMER_GAMES, MIN_SECTION_GAMES, type BuildChoice, type FullBuildValue, type RoleBuilds } from "./champion-builds";

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
/** The "Highest win rate" view, explained. */
export const HIGHEST_TIP = `Among choices made in at least ${MIN_PERFORMER_GAMES} games, the one that won most allowing for its number of games. Shown only where it differs.`;

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

/** The queues as the source line names them: "Draft and Ranked", "Ranked", "Draft, Ranked and Clash". */
export function queueWords(queues: readonly number[]): string {
  const names = [queues.includes(400) ? "Draft" : null, queues.some((q) => q === 420 || q === 440) ? "Ranked" : null, queues.includes(700) ? "Clash" : null].filter((x): x is string => !!x);
  if (!names.length) return "Draft and Ranked";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export const QUEUE_TIP = "Normal Draft, Ranked Solo/Duo, Ranked Flex and Clash games count. Swiftplay, Quickplay, Blind Pick and ARAM do not.";

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

/** The whole source line in words ("From 143 games in the team's matches · patch 26.23 · all ranks · Draft and Ranked"), as the section shows it. */
export function sourceWords(b: Pick<RoleBuilds, "games" | "patches" | "currentGames" | "queues">): string {
  return `${gamesWords(b)} in the team's matches · ${patchWords(b)} · all ranks · ${queueWords(b.queues)}`;
}

/** One choice's record in plain words: how often it won, in how many games, and how many of the part's games made it. */
export function choiceTip(part: BuildPartKey, c: Pick<BuildChoice<unknown>, "winRate" | "games" | "share" | "total">): string {
  const noun = PART_NOUN[part];
  return `Won ${pct(c.winRate)} of the ${games(c.games)} with ${noun.choice}; ${pct(c.share)} of the ${games(c.total)} ${noun.recorded} made it.`;
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

/** The empty section, honestly: the current patch has too few games of this champion in any role. */
export function fewWords(currentPatch: string): string {
  return `Not enough games on patch ${currentPatch} in the team's matches yet`;
}

export function fewTip(games: number, role: Role | null): string {
  const seen = role && games > 0 ? `${formatCount(games)} as ${ROLE_LABELS[role]} on this patch and the one before` : "none on this patch or the one before";
  return `Builds show from ${MIN_SECTION_GAMES} games of a champion in one role. The team's matches have ${seen}.`;
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
