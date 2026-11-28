/**
 * Match History's pager, as data: which pages it offers and how it folds on a narrow phone. Shared
 * since 27 Nov 2026 (ui/pager-data.ts, the component `Pager` in ui/pager.tsx); re-exported here so Match
 * History's imports and its tests stand.
 */
export { pageList, pagerFold, pagerItems, pagerRem, widestItems, type PagerItem } from "@/components/ui/pager-data";

/**
 * The page of `per` cards a new budget shows (pure, for its unit test): the one holding the game open (`open`, where it is on
 * the page shown), else the one holding the page's first card, as usePagedList does for another budget (ui/row-budget.ts).
 */
export function budgetPage(page: { page: number; per: number; rows: ReadonlyArray<{ matchId: string }> }, open: string | null, per: number): number {
  const at = open ? page.rows.findIndex((r) => r.matchId === open) : -1;
  return Math.floor(((page.page - 1) * page.per + Math.max(0, at)) / per) + 1;
}
