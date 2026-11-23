/*
  The overview of a Leaderboards board on the desktop's one-screen board (Release 16,
  docs/TEAM_LEADERBOARDS.md → One screen): how many of its rows show before its "Show all", by the
  window's height, and the classes that fold the rest. Plain values (no "use client"), so the server
  boards and the client button read the same strings, and every class is a literal Tailwind sees.

  Four heights (globals.css): under board-at-mid the lowest (1440 × 780), board-at-mid (1920 × 950,
  the owner's browser at 1920 × 1080 with the sidebar folded), board-at-short (1440 × 900),
  board-at-tall (1920 × 1080); board-below-* are their complements. Only from a 59rem page
  (@min-[59rem]/dash, the two columns): under it the page is one column and every row shows, with no
  button. A row folds while its board's fold is closed (group-data-[fold=closed]/fold:
  BoardFoldSection).
*/

/** How many rows a board shows before its Show all, in each window height. */
export interface OverviewCounts {
  low: number;
  mid: number;
  short: number;
  tall: number;
}
export type Tier = keyof OverviewCounts;
export const TIERS: readonly Tier[] = ["low", "mid", "short", "tall"];

/** The multikill score's ranking (with the four tiles): two rows at 1440 × 780, three at 1920 × 950, four at 1440 × 900, five at 1920 × 1080. */
export const MULTIKILL_OVERVIEW: OverviewCounts = { low: 2, mid: 3, short: 4, tall: 5 };
/** The milestones, both kinds together (each kind keeping at least one row, two where the budget allows): two, four, five and seven rows. */
export const MILESTONE_OVERVIEW: OverviewCounts = { low: 2, mid: 4, short: 5, tall: 7 };

/** Folded in every window while the board is closed (a row past the tallest count). */
const FOLD_ALWAYS = "@min-[59rem]/dash:group-data-[fold=closed]/fold:hidden";
/** Folded below a height: a row the next taller tier shows. */
const FOLD_BELOW: Record<Exclude<Tier, "low">, string> = {
  mid: "@min-[59rem]/dash:board-below-mid:group-data-[fold=closed]/fold:hidden",
  short: "@min-[59rem]/dash:board-below-short:group-data-[fold=closed]/fold:hidden",
  tall: "@min-[59rem]/dash:board-below-tall:group-data-[fold=closed]/fold:hidden",
};
/** Each tier as a media condition, for what shows in it alone (the Show all). */
export const IN_TIER_FLEX: Record<Tier, string> = {
  low: "@min-[59rem]/dash:board-below-mid:flex",
  mid: "@min-[59rem]/dash:board-at-mid:board-below-short:flex",
  short: "@min-[59rem]/dash:board-at-short:board-below-tall:flex",
  tall: "@min-[59rem]/dash:board-at-tall:flex",
};
/** A count's words, drawn in its tier only (inline, within the Show all). */
export const IN_TIER_TEXT: Record<Tier, string> = {
  low: "board-at-mid:hidden",
  mid: "hidden board-at-mid:board-below-short:inline",
  short: "hidden board-at-short:board-below-tall:inline",
  tall: "hidden board-at-tall:inline",
};

/** The fold's class for a row, from the number of rows each tier shows of its list: undefined for one every tier shows. */
function foldFor(index: number, shown: Record<Tier, number>): string | undefined {
  if (index >= shown.tall) return FOLD_ALWAYS;
  if (index >= shown.short) return FOLD_BELOW.tall;
  if (index >= shown.mid) return FOLD_BELOW.short;
  if (index >= shown.low) return FOLD_BELOW.mid;
  return undefined;
}

/** The fold's class for the row at `index` (0-based, in the board's reading order), or undefined for one that always shows. */
export function foldClass(index: number, counts: OverviewCounts): string | undefined {
  return foldFor(index, counts);
}

/** How many rows fold in each window height (what the Show all says). */
export type OverviewMore = Record<Tier, number>;

/** What folds of a board of `total` rows in one list (the multikill ranking and the members not placed yet). */
export function moreOf(total: number, counts: OverviewCounts): OverviewMore {
  return { low: Math.max(0, total - counts.low), mid: Math.max(0, total - counts.mid), short: Math.max(0, total - counts.short), tall: Math.max(0, total - counts.tall) };
}

/** The Show all's display: drawn (flex) exactly in the heights where some row folds, never elsewhere. */
export function showAllClass(more: OverviewMore): string {
  return ["hidden", ...TIERS.filter((t) => more[t] > 0).map((t) => IN_TIER_FLEX[t])].join(" ");
}

/**
 * Splits a board's overview between its groups (the milestones' two kinds): each group first gets up
 * to `floor` of its rows (two, or one where the budget is under four), then what remains of the budget
 * goes to the groups in order. Returns, per group, how many rows it shows within `budget`. A group
 * with no rows shows its empty line, which counts as one.
 */
export function allot(sizes: readonly number[], budget: number, floor = budget >= 4 ? 2 : 1): number[] {
  const rows = sizes.map((n) => Math.max(1, n));
  const shown = rows.map((n) => Math.min(n, floor));
  let left = budget - shown.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rows.length && left > 0; i++) {
    const add = Math.min(left, rows[i]! - shown[i]!);
    shown[i]! += add;
    left -= add;
  }
  return shown;
}

/**
 * The fold class of each row of a board in groups (the milestones' kinds), per group, per row, and
 * what folds in each height. A group's rows past its share of a tier's overview fold there.
 */
export function groupFolds(sizes: readonly number[], counts: OverviewCounts): { classes: Array<Array<string | undefined>>; more: OverviewMore } {
  const per = Object.fromEntries(TIERS.map((t) => [t, allot(sizes, counts[t])])) as Record<Tier, number[]>;
  // A tier never shows fewer of a group than the tier under it (the variants nest).
  for (let i = 1; i < TIERS.length; i++) per[TIERS[i]!] = per[TIERS[i]!].map((n, g) => Math.max(n, per[TIERS[i - 1]!][g]!));
  const folded = (shown: number[]) => sizes.reduce((sum, n, g) => sum + Math.max(0, n - shown[g]!), 0);
  return {
    classes: sizes.map((n, g) => Array.from({ length: n }, (_, i) => foldFor(i, { low: per.low[g]!, mid: per.mid[g]!, short: per.short[g]!, tall: per.tall[g]! }))),
    more: { low: folded(per.low), mid: folded(per.mid), short: folded(per.short), tall: folded(per.tall) },
  };
}
