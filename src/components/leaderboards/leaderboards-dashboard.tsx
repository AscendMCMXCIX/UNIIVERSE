import type { PortraitChampion } from "@/components/champion-portrait";
import { DataStatusNote } from "@/components/ui/data-status";
import { SectionIndex } from "@/components/ui/section-index";
import type { DataStatus } from "@/domain/data-status";
import { formatDateTime } from "@/lib/format";
import type { LeaderboardsView } from "@/server/leaderboards/recent-view";
import { LeaderboardsRoot, RetiredViewLanding } from "./leaderboards-root";
import { RecentForm } from "./recent-leaderboards";
import { Milestones, Multikills, SeasonRecords } from "./records";
import { SECTIONS } from "./sections";

/*
  TEAM LEADERBOARDS (docs/TEAM_LEADERBOARDS.md, docs/LEADERBOARDS_MODEL.md): one page, no views to
  switch between. Recent form leads (the ranking: how members are doing lately); the season's
  records and achievements follow (what they have done, which rewards playing more). Four boards,
  read in this order and placed by the page's own width (@container/dash), never the window's:
    under 59rem   one column: the header, the index of the sections below Recent form (on a long
                  page: phones upright and sideways, tablets), Recent form, the season records (two
                  columns of cells from a 34rem panel, under 86rem), the multikills, the milestones;
    from 59rem    Recent form across the page (at most the measure), the season records beside the
                  multikills (21–24rem), the milestones across (1280 and 1440 wide);
    from 86rem    Recent form (58–61rem) beside the season records (26.5–38.5rem), the multikills
                  (22–25rem) under Recent form's start and the milestones beside them, to the page's
                  end (1920, 2560 and 3440 wide: Recent form and every record on the first screen).
  Each board keeps its own height (items-start): a short board never stretches beside a tall one.
  The page's lead card is Recent form's board (surface-lead), the others plain panels; every board's
  first row is its title (BoardTitle), with what it counts under it and its explanations behind an
  ⓘ, never a paragraph on the page.
*/

/** The page's grid at each tier (literal classes, so Tailwind sees them). */
const GRID =
  "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 " +
  "@min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,24rem)] @min-[59rem]/dash:gap-6 " +
  "@min-[86rem]/dash:grid-cols-[minmax(22rem,25rem)_minmax(34.5rem,1fr)_minmax(26.5rem,38.5rem)]";
/** Across the first two tracks: Recent form from 59rem (across the page there), the milestones from 86rem (beside the multikills). */
const ACROSS = "@min-[59rem]/dash:col-span-2";

export function LeaderboardsDashboard({ view, champions, status }: { view: LeaderboardsView; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  return (
    <LeaderboardsRoot className="@container/dash mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4">
      {/* The title and who is on the boards, with how current they are (the members' page) or when they were last read (the public one). */}
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* One long word: at 200% text on a 320px phone it is wider than the screen, so there (only) it breaks, hyphenated where the browser can. */}
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-fg hyphens-auto [overflow-wrap:anywhere]">Leaderboards</h1>
        <p className="text-sm text-fg-muted" data-testid="scope-label">
          {/* The count and the status as one unit: they move to the next line together, so the ⓘ never stands on a line alone. */}
          <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2">
            <span data-testid="scope-count">
              {view.playerCount} member{view.playerCount === 1 ? "" : "s"}
            </span>
            {status ? <DataStatusNote status={status} testId="leaderboards-status" /> : null}
          </span>
        </p>
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
            items={[
              { id: SECTIONS.records, label: "Season records" },
              { id: SECTIONS.multikills, label: "Multikills" },
              { id: SECTIONS.milestones, label: "Milestones" },
            ]}
          />
          <div className={GRID} data-testid="leaderboards-grid">
            <RecentForm form={view.form} player={player} viewer={view.viewer} className={ACROSS} />
            <SeasonRecords records={view.records} player={player} champ={champ} viewer={view.viewer} className="@min-[86rem]/dash:col-start-3 @min-[86rem]/dash:row-start-1" />
            <Multikills records={view.records} player={player} />
            <Milestones records={view.records} player={player} champ={champ} className={ACROSS} />
          </div>
        </>
      )}
      <RetiredViewLanding />
    </LeaderboardsRoot>
  );
}
