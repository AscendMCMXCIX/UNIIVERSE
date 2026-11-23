/*
  The overview of a Leaderboards board on the desktop's one-screen board (Release 16,
  docs/TEAM_LEADERBOARDS.md → Layout): how many of its rows show before its "Show all", by the
  window's height, and the classes that fold the rest. Plain values (no "use client"), so the server
  boards and the client button read the same strings, and every class is a literal Tailwind sees.

  Two heights (the board-short and board-tall variants, globals.css): 1440 × 900 is short, 1920 × 1080
  tall. Only from a 59rem page (@min-[59rem]/dash, the two columns): under it the page is one column
  and every row shows, with no button. A row folds while its board's fold is closed
  (group-data-[fold=closed]/fold: BoardFoldSection).
*/

/** How many rows a board shows before its Show all: in a short window, and a tall one. */
export interface OverviewCounts {
  short: number;
  tall: number;
}

/** The multikill score's ranking: its first four in a short window (with the four tiles), five in a tall one. */
export const MULTIKILL_OVERVIEW: OverviewCounts = { short: 4, tall: 5 };
/** The milestones, both kinds together (at least two of each kind with that many members): five rows in a short window, seven in a tall one. */
export const MILESTONE_OVERVIEW: OverviewCounts = { short: 5, tall: 7 };

/** Folded in every window while the board is closed (a row past the tall count). */
const FOLD_ALWAYS = "@min-[59rem]/dash:group-data-[fold=closed]/fold:hidden";
/** Folded in a short window only (a row between the two counts). */
const FOLD_SHORT = "@min-[59rem]/dash:board-short:group-data-[fold=closed]/fold:hidden";

/** The fold's class for the row at `index` (0-based, in the board's reading order), or undefined for one that always shows. */
export function foldClass(index: number, counts: OverviewCounts): string | undefined {
  if (index >= counts.tall) return FOLD_ALWAYS;
  if (index >= counts.short) return FOLD_SHORT;
  return undefined;
}

/** How many rows fold in a short window and in a tall one (what the Show all says). */
export interface OverviewMore {
  short: number;
  tall: number;
}

/** What folds of a board of `total` rows in one list (the multikill ranking and the members not placed yet). */
export function moreOf(total: number, counts: OverviewCounts): OverviewMore {
  return { short: Math.max(0, total - counts.short), tall: Math.max(0, total - counts.tall) };
}

/** The Show all row's display: drawn (flex) exactly where some row folds, never elsewhere. */
export function showAllClass(more: OverviewMore): string {
  if (more.short && more.tall) return "hidden @min-[59rem]/dash:flex";
  if (more.short) return "hidden @min-[59rem]/dash:board-short:flex";
  if (more.tall) return "hidden @min-[59rem]/dash:board-tall:flex";
  return "hidden";
}

/**
 * Splits a board's overview between its groups (the milestones' two kinds): each group first gets up
 * to `floor` of its rows, then what remains of the budget goes to the groups in order. Returns, per
 * group, how many rows it shows within `budget`. A group with no rows shows its empty line, which
 * counts as one.
 */
export function allot(sizes: readonly number[], budget: number, floor = 2): number[] {
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
 * The fold class of each row of a board in groups (the milestones' kinds), by the overview's two
 * counts: per group, per row. A group's rows past its share of the short (or tall) overview fold
 * there.
 */
export function groupFolds(sizes: readonly number[], counts: OverviewCounts): { classes: Array<Array<string | undefined>>; more: OverviewMore } {
  const short = allot(sizes, counts.short);
  const tall = allot(sizes, counts.tall);
  // A group's empty line always shows (allot counts it as one row of its share).
  const folded = (shown: number[]) => sizes.reduce((sum, n, g) => sum + Math.max(0, n - shown[g]!), 0);
  return {
    classes: sizes.map((n, g) => Array.from({ length: n }, (_, i) => (i >= Math.max(short[g]!, tall[g]!) ? FOLD_ALWAYS : i >= short[g]! ? FOLD_SHORT : undefined))),
    more: { short: folded(short), tall: folded(tall) },
  };
}
