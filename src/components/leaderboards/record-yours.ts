/**
 * Where the viewer's own best stands in a season record's cell (records.tsx, RecordRow): a fourth
 * line across the text and the figure in a narrow cell, across the row under 16rem, under the value
 * from 36rem. A module of its own so the browser tests draw the same line into the demo's cells
 * (e2e/leaderboards-recent.spec.ts): the demo's viewer has no player profile, so no best of its own,
 * and a member's page is measured with it.
 */
export const RECORD_YOURS =
  "col-[2/-1] row-[4/5] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[6/7] @min-[36rem]/list:col-[3/4] @min-[36rem]/list:row-[2/3] @min-[36rem]/list:self-start @min-[36rem]/list:justify-self-end @min-[36rem]/list:text-right";

/** The figure inside it ("Your best: 9"). */
export const RECORD_YOURS_VALUE = "font-semibold tabular-nums text-fg";
