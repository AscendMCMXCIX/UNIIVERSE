/**
 * Where the viewer's own best stands in a season record's cell (records.tsx, RecordRow): a fourth
 * line across the text and the figure in a narrow cell, across the row under 16rem, and after the
 * holder and the champion on the second line in a two-line cell (record-two: the desktop's
 * one-screen board), wrapping to a line of its own only where that line has no room. It is the last
 * part of the row's `record-game`. A module of its own so the browser tests draw the same line into
 * the demo's cells (e2e/leaderboards-recent.spec.ts): the demo's viewer has no player profile, so no
 * best of its own, and a member's page is measured with it.
 */
export const RECORD_YOURS = "col-[2/4] row-[4/5] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[6/7]";

/** The figure inside it ("Your best: 9"). */
export const RECORD_YOURS_VALUE = "font-semibold tabular-nums text-fg";
