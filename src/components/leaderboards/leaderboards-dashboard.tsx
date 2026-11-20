import type { PortraitChampion } from "@/components/champion-portrait";
import { DataStatusNote } from "@/components/ui/data-status";
import { SectionIndex } from "@/components/ui/section-index";
import { SECTION_NAMED_TITLE } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import type { DataStatus } from "@/domain/data-status";
import { formatDateTime } from "@/lib/format";
import type { LeaderboardsView } from "@/server/leaderboards/recent-view";
import { LeaderboardsRoot, RetiredViewLanding } from "./leaderboards-root";
import { RecentForm } from "./recent-leaderboards";
import { Milestones, Multikills, SeasonRecords } from "./records";
import { SECTIONS } from "./sections";
import { LeaderboardsPinnedIndex } from "./leaderboards-index";
import { LeaderboardsPeek } from "./leaderboards-peek";

/** The page's sections after Recent form, for its index; the pinned copies add Recent form, to return to it. */
const INDEX = [
  { id: SECTIONS.records, label: "Season records" },
  { id: SECTIONS.multikills, label: "Multikills" },
  { id: SECTIONS.milestones, label: "Milestones" },
] as const;
const PINNED_INDEX = [{ id: SECTIONS.form, label: "Recent form" }, ...INDEX] as const;
const PHONE_INDEX = [
  { id: SECTIONS.form, label: "Form" },
  { id: SECTIONS.records, label: "Records" },
  { id: SECTIONS.multikills, label: "Multikills" },
  { id: SECTIONS.milestones, label: "Milestones" },
] as const;

/*
  TEAM LEADERBOARDS (docs/TEAM_LEADERBOARDS.md, docs/LEADERBOARDS_MODEL.md): one page, no views to
  switch between. Recent form leads (the ranking: how members are doing lately); the season's
  records and achievements follow (what they have done, which rewards playing more). Four boards,
  read in this order and placed by the page's own width (@container/dash), never the window's:
    under 59rem   one column: the header, the index of the sections below Recent form (on a long
                  page: phones upright and sideways, tablets), Recent form, the season records (two
                  columns of cells from a 40rem panel), the multikills, the milestones;
    from 59rem    Recent form across the page (at most the measure), the season records beside the
                  multikills (21–24rem) with the milestones under them in that column (1280 and 1440
                  wide): the records are the taller board, and the milestones filled the page's
                  width under both while about 155px under the multikills stood empty (UD.L2);
    from 86rem    two columns, each board under the one before it in its own column, whatever the
                  other column's heights (1920, 2560 and 3440 wide): Recent form (58.25–60rem), the
                  milestones under it; beside them the season records (26.25–38.5rem), the
                  multikills under them. Recent form and every record are on the first screen, and
                  the achievements start on it; a taller records panel (a member's own bests, a
                  line in each narrow cell; the public page's) lengthens its own column only, so
                  nothing waits under Recent form for it.
  Each board keeps its own height (items-start): a short board never stretches beside a tall one.
  The page's lead card is Recent form's board (surface-lead), the others plain panels; every board's
  first row is its title (BoardTitle): its icon and heading, with an ⓘ on Recent form's and Season
  records', and a line saying what it counts on every board but Milestones (whose two captions each
  carry an ⓘ); never a paragraph on the page.
*/

/*
  The page's grid at each tier (literal classes, so Tailwind sees them). From 86rem Recent form's
  column is at least 58.25rem: its board's tiers measure inside its 1px border, so its one-line rows
  (from 58rem of board) need the border's 2px more, and as much again so the fluid root's rounding
  never drops it a tier (a 58rem column gave a 57.875rem board, in its medium tier, in a 1512–1515px
  window with the sidebar folded). The records' column takes the page's growth first, up to 38.5rem
  (two-line cells from 36rem); Recent form's then, to 60rem on a 100rem page. Its minimum, 26.25rem,
  puts the tier's least page at 86rem exactly (58.25 + 1.5 + 26.25), so nothing is wider than the
  page where the tier starts. The second row is flexible (1fr): the column of the records and the
  multikills, which spans both rows, puts whatever it has beyond Recent form's height into that row,
  under the milestones, never between Recent form and them.
*/
const GRID =
  "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 " +
  "@min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,24rem)] @min-[59rem]/dash:grid-rows-[auto_auto_auto_1fr] @min-[59rem]/dash:gap-6 " +
  "@min-[86rem]/dash:grid-cols-[minmax(58.25rem,1fr)_minmax(26.25rem,38.5rem)] @min-[86rem]/dash:grid-rows-[auto_1fr]";
/** Recent form: across both tracks from 59rem (the page's width there); from 86rem the first column's first row. */
const FORM_PLACE = "@min-[59rem]/dash:col-span-2 @min-[86rem]/dash:col-[1/2] @min-[86rem]/dash:row-[1/2]";
/**
 * The season records and the multikills: two boards of the page's grid under 86rem (the wrapper is
 * display: contents, so the records stand beside the multikills from 59rem); from 86rem one column
 * beside Recent form and the milestones, across both rows, the records first.
 */
const SIDE = "contents @min-[86rem]/dash:col-[2/3] @min-[86rem]/dash:row-[1/span_2] @min-[86rem]/dash:flex @min-[86rem]/dash:min-w-0 @min-[86rem]/dash:flex-col @min-[86rem]/dash:gap-6";
/**
 * From 59rem to 86rem: the records in the first column across the rows after Recent form's (the last
 * of them flexible, so whatever the records have beyond the multikills and the milestones goes there,
 * never between those two); the multikills, then the milestones, in the second column.
 */
const RECORDS_PLACE = "@min-[59rem]/dash:@max-[86rem]/dash:col-[1/2] @min-[59rem]/dash:@max-[86rem]/dash:row-[2/5]";
const MULTIKILLS_PLACE = "@min-[59rem]/dash:@max-[86rem]/dash:col-[2/3] @min-[59rem]/dash:@max-[86rem]/dash:row-[2/3]";
/** The milestones: under the multikills from 59rem; from 86rem under Recent form, in its column. */
const MILESTONES_PLACE = "@min-[59rem]/dash:col-[2/3] @min-[59rem]/dash:row-[3/4] @min-[86rem]/dash:col-[1/2] @min-[86rem]/dash:row-[2/3]";

export function LeaderboardsDashboard({ view, champions, status }: { view: LeaderboardsView; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  // The player Peek on member rows (members' page only: the public boards link nowhere): Recent form's order, then the rest.
  const linked = Object.values(view.players).filter((p) => p.profileHref);
  const formOrder = [...view.form.rows.map((r) => r.playerId), ...view.form.notEnough.map((r) => r.playerId)];
  const peekIds = [...new Set([...formOrder, ...linked.map((p) => p.id)])].filter((id) => view.players[id]?.profileHref);
  const peekNames = linked.map((p): [string, string] => [p.id, p.name]);
  return (
    <LeaderboardsRoot className="@container/dash mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4">
      {/* The title and who is on the boards, with how current they are (the members' page) or when they were last read (the public one). */}
      <header id="leaderboards-header" className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* One long word: at 200% text on a 320px phone it is wider than the screen, so there (only) it breaks, hyphenated where the browser can. */}
        {/* The members' page: on phones the sections row names it (SECTION_NAMED_TITLE); the public page keeps its title. */}
        <h1 className={cn("min-w-0 text-2xl font-semibold tracking-tight text-fg hyphens-auto [overflow-wrap:anywhere]", status && SECTION_NAMED_TITLE)}>Leaderboards</h1>
        <p className="text-sm text-fg-muted" data-testid="scope-label">
          {/* The count and the status as one unit: they move to the next line together, so the ⓘ never stands on a line alone. */}
          <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2">
            <span data-testid="scope-count">
              {view.playerCount} member{view.playerCount === 1 ? "" : "s"}
            </span>
            {status ? <DataStatusNote status={status} testId="leaderboards-status" /> : null}
          </span>
        </p>
        {/* The index at the header's end where the page is two columns under 86rem (1280 and 1440 wide: 1.8–2.3 screens; wider, the
            page is about one screen and Recent form, the records and the milestones all start on it). */}
        {view.playerCount ? <SectionIndex className="ml-auto hidden @min-[59rem]/dash:@max-[86rem]/dash:block" testId="header-section-index" items={INDEX} /> : null}
        {status ? null : (
          <p className="basis-full text-xs text-fg-subtle" data-testid="last-updated">
            {updated ? `Updated from the last account sync: ${updated}` : "No account sync yet"}
          </p>
        )}
      </header>
      {view.playerCount === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-fg-muted" data-testid="leaderboards-empty">
          No team members to compare yet. Members appear here as soon as they join the team.
        </p>
      ) : (
        <>
          {/* A long page's own sections (one column): Recent form is right below, so the index leads past it. On a page under
              18rem (a phone from 125% text) it no longer fits one line: no dots then, which would start lines, and room
              between the lines for each link's 44px target. */}
          <SectionIndex
            className="@min-[59rem]/dash:hidden"
            listClassName="@max-[18rem]/dash:gap-x-4 @max-[18rem]/dash:gap-y-3"
            separatorClassName="@max-[18rem]/dash:hidden"
            items={INDEX}
          />
          <LeaderboardsPinnedIndex anchorId="leaderboards-header" items={PINNED_INDEX} phoneItems={PHONE_INDEX} />
          <LeaderboardsPeek ids={peekIds} names={peekNames} viewerPlayerId={view.viewer}>
          <div className={GRID} data-testid="leaderboards-grid">
            <RecentForm form={view.form} player={player} viewer={view.viewer} className={FORM_PLACE} />
            <div className={SIDE} data-testid="leaderboards-side">
              <SeasonRecords records={view.records} player={player} champ={champ} viewer={view.viewer} className={RECORDS_PLACE} />
              <Multikills records={view.records} player={player} className={MULTIKILLS_PLACE} />
            </div>
            <Milestones records={view.records} player={player} champ={champ} className={MILESTONES_PLACE} />
          </div>
          </LeaderboardsPeek>
        </>
      )}
      <RetiredViewLanding />
    </LeaderboardsRoot>
  );
}
