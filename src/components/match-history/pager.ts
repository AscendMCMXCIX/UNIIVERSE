/**
 * Match History's pager, as data: which pages it offers and how it folds on a narrow phone. Shared
 * since 27 Nov 2026 (ui/pager-data.ts, the component `Pager` in ui/pager.tsx); re-exported here so Match
 * History's imports and its tests stand.
 */
import { budgetPageOf } from "@/lib/list-per";

export { pageList, pagerFold, pagerItems, pagerRem, widestItems, type PagerItem } from "@/components/ui/pager-data";

/**
 * The page of `per` cards a new budget shows (pure, for its unit test): the one holding the game open (`open`, where it is on
 * the page shown), else, with no game open, the one holding the page's first card, as usePagedList does for another budget
 * (ui/row-budget.ts). Null while the game open is not on the page shown (a link to a game on another page): the page is left
 * out of the address, and the server takes the one holding it (lib/list-per.ts, budgetPageOf and pageHolding).
 */
export function budgetPage(page: { page: number; per: number; rows: ReadonlyArray<{ matchId: string }> }, open: string | null, per: number): number | null {
  return budgetPageOf({ offset: (page.page - 1) * page.per, ids: page.rows.map((r) => r.matchId) }, open, per);
}
