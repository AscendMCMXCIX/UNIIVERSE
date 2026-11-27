import type * as React from "react";
import type { PortraitChampion } from "@/components/champion-portrait";
import { DataStatusNote } from "@/components/ui/data-status";
import { SectionIndex } from "@/components/ui/section-index";
import { SECTION_NAMED_TITLE } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import type { DataStatus } from "@/domain/data-status";
import { formatCount, formatDateTime } from "@/lib/format";
import { InfoTip } from "@/components/ui/info-tip";
import { LEADERBOARD_ACTIVE_DAYS } from "@/domain/leaderboards";
import type { LeaderboardsView } from "@/server/leaderboards/recent-view";
import { LeaderboardsRoot, RetiredViewLanding } from "./leaderboards-root";
import { RecentForm } from "./recent-leaderboards";
import { Milestones, Multikills, SeasonRecords } from "./records";
import { SECTIONS } from "./sections";
import { LeaderboardsPinnedIndex } from "./leaderboards-index";
import { LeaderboardsPeek } from "./leaderboards-peek";
import { RecordGamePeek, type RecordGame } from "./record-game";
import { SeasonChoice } from "./season-choice";

/** The page's sections after Recent form, for its index (in the order a one-column page reads them); the pinned copies add Recent form, to return to it. */
const INDEX = [
  { id: SECTIONS.multikills, label: "Multikills" },
  { id: SECTIONS.records, label: "Season records" },
  { id: SECTIONS.milestones, label: "Milestones" },
] as const;
const PINNED_INDEX = [{ id: SECTIONS.form, label: "Recent form" }, ...INDEX] as const;
const PHONE_INDEX = [
  { id: SECTIONS.form, label: "Form" },
  { id: SECTIONS.multikills, label: "Multikills" },
  { id: SECTIONS.records, label: "Records" },
  { id: SECTIONS.milestones, label: "Milestones" },
] as const;
/** Who the boards show, in one sentence (the header's ⓘ beside the count). */
const ACTIVE_TIP = `Players with a game and a data update in the last ${LEADERBOARD_ACTIVE_DAYS} days.`;

/*
  TEAM LEADERBOARDS (docs/TEAM_LEADERBOARDS.md, docs/LEADERBOARDS_MODEL.md): one competitive
  dashboard, no views to switch between and nothing folded (25 Nov 2026, the owner's requirements:
  no Show all, no expandable sections, no inner scrollbars, no empty or placeholder rows). Four
  boards, read in this order and placed by the page's own width (@container/dash), never the window's:
    under 59rem   one column: the header, the index of the sections below Recent form (phones
                  upright and sideways, tablets), Recent form, the multikills, the season records
                  (two columns of cells from a 34rem panel), the milestones; a short natural scroll;
    from 59rem    one screen: a 2 × 2 grid whose rows the two boards in them share (each board as tall
                  as its neighbour, never a hole between boards; the shorter one's rows share its
                  spare room, board-fill.ts): the two rankings first, Recent form | Multikills, then the achievements,
                  Season records | Milestones (two columns of 44px cells each). At 1366 × 768,
                  1440 × 900 and 1920 × 1080 all four end within the window with the demo's seven
                  active players; a full nine-player team at 1366 × 768 may scroll a little
                  (readability first: docs/TEAM_LEADERBOARDS.md, One screen).
  Only active players are shown (a counted game and a successful data update in the last 30 days),
  on every board alike; the header counts them, its ⓘ says the rule. The season (the records', the
  multikills' and the milestones' games; Recent form counts the last 60 days) is the header's, with
  its choice there where two are offered. The page's lead card is Recent form's board
  (surface-lead), the others plain panels; every board's first row is its title (BoardTitle).
*/

/*
  The grid (literal classes, so Tailwind sees them). From 59rem two columns: Recent form's at least
  36.25rem (its board's medium tier, the name over the role and dates, inside its 1px border), the
  multikills' at least 21.75rem, so the two fit from 59rem; the rest shared 1.25 : 1 (at 1280 with
  the sidebar open 36.25 and 22.75rem: the multikills' two-line rows, a short scroll; at 1366 36.25
  and 28.15rem, the table's eight columns from a 26rem board; at 1440 38.3 and 30.7, at 1920 48.3 and
  38.7, on a 100rem page 55 and 44). Rows stretch: the boards in a row share its height. The gap is
  16px, as the panels' own padding.
*/
const GRID = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[59rem]/dash:grid-cols-[minmax(36.25rem,1.25fr)_minmax(21.75rem,1fr)]";

/*
  The rankings' row height follows the roster (Release 19, the owner's request of 26 Nov 2026: the
  full active roster of eight or nine on one screen, without tiny text): 40px for up to seven ranked
  players (the boards as approved in Release 18), 38px for eight, 36px for nine or more, for Recent
  form's and the multikills' rows alike (DataRow's `rank` density reads it). The text keeps its size
  (names 14px, dates and figures' units 12px): only the rows' padding goes. 44px on a touch screen.
  With nine players the two rankings end in the window at 1366 × 768 and all four boards at 1440 ×
  900, 1920 × 950 and 1920 × 1080 with room to spare (docs/TEAM_LEADERBOARDS.md, One screen).
*/
export function rankRow(rows: number): string {
  return rows <= 7 ? "2.5rem" : rows === 8 ? "2.375rem" : "2.25rem";
}

export function LeaderboardsDashboard({ view, champions, status, peekable }: { view: LeaderboardsView; /** The members' page: who has a player Peek (a main role chosen); the other rows open the profile. */ peekable?: readonly string[]; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  // The player Peek on member rows (members' page only: the public boards link nowhere): Recent form's order, then the rest.
  const linked = Object.values(view.players).filter((p) => p.profileHref);
  const formOrder = view.form.rows.map((r) => r.playerId);
  const peekIds = [...new Set([...formOrder, ...linked.map((p) => p.id)])].filter((id) => view.players[id]?.profileHref && (peekable ?? []).includes(id));
  const peekNames = linked.map((p): [string, string] => [p.id, p.name]);
  // A record's game over the board (members' page only: the public boards carry no game), in the records' order.
  const recordGames: RecordGame[] = view.records.records.flatMap((r) => (r.holder?.game ? [{ matchId: r.holder.game.matchId, playerId: r.holder.playerId, historyHref: r.holder.game.historyHref, title: `${r.label} · ${view.players[r.holder.playerId]?.name ?? "Member"}` }] : []));
  const { records } = view;
  return (
    <LeaderboardsRoot className="@container/dash mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4">
      {/* The title, who is on the boards (the active players, the rule behind the ⓘ), the season and how current they are (the members' page) or when they were last read (the public one). */}
      <header id="leaderboards-header" className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* One long word: at 200% text on a 320px phone it is wider than the screen, so there (only) it breaks, hyphenated where the browser can. */}
        {/* The members' page: on phones the sections row names it (SECTION_NAMED_TITLE); the public page keeps its title. */}
        <h1 className={cn("min-w-0 text-2xl font-semibold tracking-tight text-fg hyphens-auto [overflow-wrap:anywhere]", status && SECTION_NAMED_TITLE)}>Leaderboards</h1>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-fg-muted" data-testid="scope-label">
          {/* The count and its ⓘ as one unit: the ⓘ beside the count's last line, never on a line of its own. Where the line
              is too narrow for the whole count (a 320px phone at 200% text with a two-digit count) the count's words wrap
              inside the unit, rather than the unit running past the screen (a break before an inline ⓘ would leave it
              alone on the next line, so the two are flex items, the ⓘ at the foot of the count's box). */}
          <span className="flex min-w-0 max-w-full items-end gap-x-1.5">
            <span className="min-w-0 text-fg" data-testid="scope-count" data-count={view.playerCount}>
              {formatCount(view.playerCount)} active player{view.playerCount === 1 ? "" : "s"}
            </span>
            <InfoTip label="Who is shown" text={ACTIVE_TIP} testId="scope-tip" />
          </span>
          {/* The season of the records, the multikills and the milestones (its choice where two are offered), then the data
              status, as one unit: where the line has no room for both after the count (a phone, a status in words such as
              "Syncing"), they take the next line together, so the status always ends a line with the season and never stands
              on a line of its own. At a large text size the season's words wrap beside the status rather than past the screen. */}
          <div className="flex min-w-0 max-w-full items-baseline gap-x-3" data-testid="scope-season-status">
            {records.seasons.length > 1 ? (
              <SeasonChoice seasons={records.seasons} current={records.season} />
            ) : (
              <span className="min-w-0" data-testid="records-season-label">{records.seasonLabel}</span>
            )}
            {status ? <DataStatusNote status={status} testId="leaderboards-status" className="shrink-0" /> : null}
          </div>
        </div>
        {status ? null : (
          <p className="basis-full text-xs text-fg-subtle" data-testid="last-updated">
            {updated ? `Updated from the last account sync: ${updated}` : "No account sync yet"}
          </p>
        )}
      </header>
      {view.playerCount === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-fg-muted" data-testid="leaderboards-empty">
          {view.memberCount === 0 ? "No team members to compare yet. Members appear here as soon as they join the team." : `No player has a game and a data update in the last ${LEADERBOARD_ACTIVE_DAYS} days. Players appear here again with their next game.`}
        </p>
      ) : (
        <>
          {/* A long page's own sections (one column): Recent form is right below, so the index leads past it. On a page under
              18rem (a phone from 125% text) it no longer fits one line: no dots then, which would start lines; each link is
              44px tall on a touch screen (SectionIndex), so the lines need no gap of their own for the targets. */}
          <SectionIndex
            className="@min-[59rem]/dash:hidden"
            listClassName="@max-[18rem]/dash:gap-x-4"
            separatorClassName="@max-[18rem]/dash:hidden"
            items={INDEX}
          />
          <LeaderboardsPinnedIndex anchorId="leaderboards-header" items={PINNED_INDEX} phoneItems={PHONE_INDEX} />
          <LeaderboardsPeek ids={peekIds} names={peekNames} viewerPlayerId={view.viewer} multikills={Object.fromEntries(records.multikills.rows.map((r) => [r.playerId, r.breakdown]))} seasonLabel={records.seasonLabel}>
          <RecordGamePeek games={recordGames} championsById={champions}>
          <div className={GRID} style={{ "--rank-row": rankRow(Math.max(view.form.rows.length, records.multikills.rows.length)) } as React.CSSProperties} data-testid="leaderboards-grid" data-rank-rows={Math.max(view.form.rows.length, records.multikills.rows.length)}>
            <RecentForm form={view.form} player={player} />
            <Multikills records={records} player={player} champions={champions} />
            <SeasonRecords records={records} player={player} champ={champ} viewer={view.viewer} />
            <Milestones records={records} player={player} champ={champ} />
          </div>
          </RecordGamePeek>
          </LeaderboardsPeek>
        </>
      )}
      <RetiredViewLanding />
    </LeaderboardsRoot>
  );
}
