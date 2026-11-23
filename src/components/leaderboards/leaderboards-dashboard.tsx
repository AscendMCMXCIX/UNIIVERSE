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
import { RecordGamePeek, type RecordGame } from "./record-game";

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
    under 59rem   one column: the header, the index of the sections below Recent form (phones
                  upright and sideways, tablets), Recent form, the season records (two columns of
                  cells from a 40rem panel), the multikills, the milestones; every row shown;
    from 59rem    one screen (Release 16, the owner's request of 23 Nov 2026: at 1440 × 900 and
                  1920 × 1080 every board within the window): two columns, each board under the one
                  before it in its own column, whatever the other column's heights. Recent form,
                  the milestones under it; beside them the season records, the multikills under
                  them. The records are compact cells (overview of a record, its game one press
                  away), and the multikills and the milestones show their first rows by the window's
                  height, the rest behind "Show all · N more" at their foot (overview.ts), so all
                  four end on the first screen. Before, from 59rem to 86rem Recent form went across
                  the page with the records and the multikills under it, and the page ran 1.9
                  screens at 1440 × 900 (1,751px), 1.3 at 1920 × 1080 (1,443px).
  Each board keeps its own height (items-start): a short board never stretches beside a tall one.
  The page's lead card is Recent form's board (surface-lead), the others plain panels; every board's
  first row is its title (BoardTitle): its icon and heading, with an ⓘ where there is more to say,
  and a line saying what it counts, beside the heading where the row has room; never a paragraph on
  the page.
*/

/*
  The page's grid at each tier (literal classes, so Tailwind sees them). From 59rem two columns:
  Recent form's at least 36rem (its board's medium tier: the name over the role and dates), the
  records' 21–27rem (27rem at 1440 with the sidebar open, leaving Recent form 42rem). From 86rem
  Recent form's column is at least 58.25rem: its board's tiers measure inside its 1px border, so its
  one-line rows (from 58rem of board) need the border's 2px more, and as much again so the fluid
  root's rounding never drops it a tier (a 58rem column gave a 57.875rem board, in its medium tier, in
  a 1512–1515px window with the sidebar folded). The records' column takes the page's growth first, up
  to 38.5rem; Recent form's then, to 60rem on a 100rem page. Its minimum, 26.25rem, puts the tier's
  least page under 86rem (58.25 + 1 + 26.25 = 85.5), so nothing is wider than the page where the
  tier starts. The second row is flexible (1fr): the column of the records and the
  multikills, which spans both rows, puts whatever it has beyond Recent form's height into that row,
  under the milestones, never between Recent form and them. The gap is 16px: the one-screen board's
  room, as the panels' own padding.
*/
const GRID =
  "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 " +
  "@min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,27rem)] @min-[59rem]/dash:grid-rows-[auto_1fr] " +
  "@min-[86rem]/dash:grid-cols-[minmax(58.25rem,1fr)_minmax(26.25rem,38.5rem)]";
/** Recent form: from 59rem the first column's first row. */
const FORM_PLACE = "@min-[59rem]/dash:col-[1/2] @min-[59rem]/dash:row-[1/2]";
/**
 * The season records and the multikills: two boards of the page's one column under 59rem (the
 * wrapper is display: contents); from 59rem one column beside Recent form and the milestones,
 * across both rows, the records first.
 */
const SIDE = "contents @min-[59rem]/dash:col-[2/3] @min-[59rem]/dash:row-[1/span_2] @min-[59rem]/dash:flex @min-[59rem]/dash:min-w-0 @min-[59rem]/dash:flex-col @min-[59rem]/dash:gap-4";
/** The milestones: from 59rem under Recent form, in its column. */
const MILESTONES_PLACE = "@min-[59rem]/dash:col-[1/2] @min-[59rem]/dash:row-[2/3]";

export function LeaderboardsDashboard({ view, champions, status, peekable }: { view: LeaderboardsView; /** The members' page: who has a player Peek (a main role chosen); the other rows open the profile. */ peekable?: readonly string[]; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  // The player Peek on member rows (members' page only: the public boards link nowhere): Recent form's order, then the rest.
  const linked = Object.values(view.players).filter((p) => p.profileHref);
  const formOrder = [...view.form.rows.map((r) => r.playerId), ...view.form.notEnough.map((r) => r.playerId)];
  const peekIds = [...new Set([...formOrder, ...linked.map((p) => p.id)])].filter((id) => view.players[id]?.profileHref && (peekable ?? []).includes(id));
  const peekNames = linked.map((p): [string, string] => [p.id, p.name]);
  // A record's game over the board (members' page only: the public boards carry no game), in the records' order.
  const recordGames: RecordGame[] = view.records.records.flatMap((r) => (r.holder?.game ? [{ matchId: r.holder.game.matchId, playerId: r.holder.playerId, historyHref: r.holder.game.historyHref, title: `${r.label} · ${view.players[r.holder.playerId]?.name ?? "Member"}` }] : []));
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
        {/* No index here: from 59rem every board is on the first screen (Release 16; until then the index stood at the header's end
            at 1280 and 1440, where the page ran 1.8–2.3 screens). Once the header has scrolled away (a board opened in full) the
            pinned row holds it. */}
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
          <LeaderboardsPeek ids={peekIds} names={peekNames} viewerPlayerId={view.viewer} multikills={Object.fromEntries(view.records.multikills.rows.map((r) => [r.playerId, r.detail]))} seasonLabel={view.records.seasonLabel}>
          <RecordGamePeek games={recordGames} championsById={champions}>
          <div className={GRID} data-testid="leaderboards-grid">
            <RecentForm form={view.form} player={player} viewer={view.viewer} className={FORM_PLACE} />
            <div className={SIDE} data-testid="leaderboards-side">
              <SeasonRecords records={view.records} player={player} champ={champ} viewer={view.viewer} />
              <Multikills records={view.records} player={player} />
            </div>
            <Milestones records={view.records} player={player} champ={champ} className={MILESTONES_PLACE} />
          </div>
          </RecordGamePeek>
          </LeaderboardsPeek>
        </>
      )}
      <RetiredViewLanding />
    </LeaderboardsRoot>
  );
}
