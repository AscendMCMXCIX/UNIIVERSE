import type { CSSProperties } from "react";

/*
  THE SHORTER BOARD'S SPARE ROOM (25 Nov 2026, the review): the desktop's 2 × 2 grid
  (leaderboards-dashboard.tsx) stretches the two boards of a row to one height, the taller one's. The
  shorter board's rows share the difference, each growing by an equal share up to 3.5rem on average
  (FILL_ROW_MAX_REM: 56px at 1366 to 1536, 62px at 1920), its content centred in it (a cell of the
  records keeps its top line, level with its neighbour's), rather than leaving one blank band in the
  panel (it was up to 95px under the multikills at 1920 × 1080). What is left beyond that goes under
  the board's last line: a foot (the multikills' legend) stays right under the last row. Where a board
  stands alone (a phone, a tablet: one column) nothing is spare and nothing grows.

  How. The rows' list is a flex item of its board's body (a flex column the board's height: the
  boards' `flex h-full flex-col`, or the panel's `flex flex-col`) that grows into the spare room
  (`flex-auto`) up to its rows' count × 3.5rem (`--fill-rows`, set where the rows are drawn), never
  shorter than its content (`min-height: min-content` wins over the cap, so a row that needs more, a
  long name on two lines or a large text size, is never cut). Inside it the rows share its height: a
  list's rows grow by equal shares (`flex-auto`); a grid's rows stretch (its auto tracks, the grid's
  `align-content: normal`). Taller than its neighbour, a board's list is its content's height and no
  row grows. (A grid whose tracks are `minmax(min-content, 3.5rem)` was tried first: with no definite
  height every track takes its maximum, so every board grew, the taller one too.)
*/

/** A row's most height, on average, when it grows into its board's spare room (literal in the classes below, so Tailwind sees them). */
export const FILL_ROW_MAX_REM = 3.5;

/** A board's list (an ol of DataRows) growing into its board's spare room, up to `--fill-rows` × 3.5rem; its rows take FILL_ROW. */
export const FILL_LIST = "flex flex-auto flex-col min-h-min max-h-[calc(var(--fill-rows)*3.5rem)]";
/** A row of FILL_LIST: its equal share of the list's spare room (its content centred: DataRow's `content-center`). */
export const FILL_ROW = "flex-auto";
/** A board's grid of cells growing into its board's spare room: its rows stretch, up to `--fill-rows` × 3.5rem, or `--fill-rows-wide` × 3.5rem where the cells stand two to a row (the board's own classes say from which width). */
export const FILL_GRID = "flex-auto min-h-min max-h-[calc(var(--fill-rows)*3.5rem)]";

/** FILL_LIST's or FILL_GRID's row count (one column), and a grid's rows where its cells stand two to a row, as the style its element takes. */
export const fillRows = (rows: number, wide?: number) => ({ "--fill-rows": rows, ...(wide === undefined ? {} : { "--fill-rows-wide": wide }) }) as CSSProperties;
