import { Fragment, type ReactNode } from "react";
import { ChevronRight, Flame, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardName, cardColourVars } from "@/components/players/card-look";
import { BOARD_PANEL, DataGroup, DataHead, DataList, DataRow, FigureCell, MemberCell, Place, ROW_PAD_X, ROW_STATES, RowLink, tieRuns, type TiePosition } from "@/components/ui/data-list";
import { BreakdownPopover } from "@/components/ui/breakdown-popover";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { LEADERBOARD_ACTIVE_DAYS } from "@/domain/leaderboards";
import { KDA_RECORD_MIN_TAKEDOWNS, RECORD_MIN_GAME_S } from "@/domain/leaderboard-records";
import { MULTIKILL_KEYS, type MultikillKey } from "@/domain/multikill-score";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { BoardPlayer, MilestoneItem, MultikillRow, MultikillsView, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { BoardTitle } from "./board-title";
import { MultikillBreakdownBody, RoleMark } from "./multikill-breakdown";
import { RECORD_YOURS, RECORD_YOURS_VALUE } from "./record-yours";
import { SECTIONS } from "./sections";
import { PeekRowLink } from "./leaderboards-peek";
import { RecordGameLink } from "./record-game";

/*
  THE SEASON'S RECORDS AND ACHIEVEMENTS (docs/TEAM_LEADERBOARDS.md), the Leaderboards page's
  boards beside and under Recent form: single games, multikills and milestones, which reward
  playing more. Three boards, each a section the page places (leaderboards-dashboard.tsx), each laid
  out by its own width, not the window's, each the active players' own (the 30-day rule, 25 Nov 2026):
    Season records   seven cells in one panel: one column, two from a 34rem panel (the desktop
                     board's, under Recent form; a tablet's), the last, the streak, across both; each
                     cell measures itself (@container/list), so a record reads the same wherever it
                     is placed (RecordRow);
    Multikills       the multikill score's table: a row per ranked player, the counts per kind and the
                     Score, a button that opens how it was worked out (the shared breakdown popover);
    Milestones       the most meaningful champion milestones of the active players, at most eight,
                     two columns of cells like the records', the rest on the profiles.
  Neutral, as Recent form: no colour marks a figure but first place's gold; the milestones carry their
  rarities (violet, gold), as everywhere. Nothing folds: every row and cell is on the page.
*/

// ── Season records ─────────────────────────────────────────────────────────────────────────────

/*
  The records' cells, by the panel's width: a column of cells, two columns from a 34rem panel (the
  desktop board's, under Recent form, 36–55rem: cells of 18–27rem, each in its two-line layout; a
  tablet's or a sideways phone's, cells of 19rem or more in the three-line layout). The seventh (the
  streak) goes across both columns, so no cell stands empty. A hairline between neighbours: above
  every cell but the first row's, and right of each left-hand cell. Each cell (an li) is its own
  @container/list and holds its column template (BOOK_COLS), so its row picks its layout by the
  cell's width, or by the page's from 59rem (the record-two variant, globals.css).
*/
const RECORD_CELLS = "grid grid-cols-[minmax(0,1fr)] border-t border-border/70 @min-[34rem]/list:grid-cols-2";
const RECORD_CELL =
  "@container/list min-w-0 border-border/60 [&:not(:first-child)]:border-t @min-[34rem]/list:[&:nth-child(2)]:border-t-0 @min-[34rem]/list:[&:nth-child(odd):not(:last-child)]:border-r @min-[34rem]/list:[&:last-child:nth-child(odd)]:col-span-2";
/** What the records count beyond their names, and whose they are: the records' ⓘ (the qualifiers stay on wider cells, and are read out). */
const RECORDS_TIP = `Records among players active in the last ${LEADERBOARD_ACTIVE_DAYS} days. Per-minute records need ${RECORD_MIN_GAME_S / 60}+ minute games; the KDA record ${KDA_RECORD_MIN_TAKEDOWNS} takedowns.`;

/*
  A cell's columns:
    narrow  (a phone, a tablet's two columns) picture · text · figure · chevron, three lines beside the
            48px picture: the record and its qualifier; the holder; the champion, role, K/D/A and
            date; your best under them (a fourth line); the chevron where the row opens its game. The
            value and its unit: from a 20rem cell (a phone at 393) at the record's line's top right,
            one value position in every cell whatever the qualifier's length (UD.L2); in a narrower
            cell (large text) at the holder's line's end, so the record's words keep the width. The
            holder keeps at least 5rem: on a 320px phone a long figure's unit wraps under its value
            (the figure is flex-wrap) rather than squeeze the name. Under 16rem (a phone at a large
            text size) one column: the picture, then the record, the holder, the game, the value with
            its unit (which wrap) and your best, each across the row, so nothing is held wider than
            the phone and no word is squeezed beside the picture.
    two     (record-two: a 36rem cell, or any cell from a 59rem page, the desktop's one-screen board,
            Release 16) picture · text · figure · chevron, two lines beside a 36px picture, 44px: the
            record in a few words (RECORD_SHORT, "Damage per min": the full label is its name) and,
            in a cell of 24rem or more, its qualifier (read out in a narrower one: the records' ⓘ says
            what they count); the holder and the champion, with your best after them ("Your best 9");
            the value over its unit at the right, across both lines. The game's role, K/D/A and date
            (and your best's date) are read out but not drawn: the cell opens the game, which shows
            them, so a record keeps two lines in an 18rem cell (two cells a row under Recent form).
  A qualifier that does not fit beside its record takes the next line whole, and its "·" stays
  behind (the title's clipped edge), so no line starts or ends with one.
*/
const BOOK_COLS = "[--dl-cols:3rem_minmax(5rem,1fr)_auto_1rem] @max-[16rem]/list:[--dl-cols:minmax(0,1fr)] record-two:[--dl-cols:2.25rem_minmax(0,1fr)_auto_1rem]";

/**
 * Season records: the season's seven records in one panel, its title saying what it counts (the
 * games, the ties) and whose they are (its ⓘ). The season is the page header's (the season's choice
 * there, where there are two). `className` places it on the page.
 */
export function SeasonRecords({ records, player, champ, viewer, className }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; /** The viewer's player, when they are on the board. */ viewer: string | null; className?: string }) {
  return (
    <section id={SECTIONS.records} aria-labelledby="season-records-title" className={cn("flex min-w-0 flex-col", className)} data-testid="records">
      <div className={cn(BOARD_PANEL, "flex-auto")} data-testid="records-book">
        <BoardTitle
          id="season-records-title"
          icon={<Trophy className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
          aside={<InfoTip label="Whose records, and what counts" text={RECORDS_TIP} testId="records-tip" />}
          note={`${formatCount(records.games)} games · ties: first to set it`}
          noteTestId="records-scope"
        >
          Season records
        </BoardTitle>
        <ul aria-label="Season records" className={RECORD_CELLS} data-testid="season-records">
          {records.records.map((r) => (
            <li key={r.id} className={RECORD_CELL}>
              <RecordRow record={r} player={player} champ={champ} viewer={viewer} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * "You hold this record", "Your best: 9 · 4 Oct 2026", or nothing: for a viewer off the board (no
 * profile of their own), on a record nobody holds yet, and for a viewer with no game that sets it (the
 * record cards said they held it). In a two-line cell the best's date is read out, not drawn.
 */
function yoursText(record: RecordView, viewer: string | null): ReactNode {
  if (!viewer || !record.holder) return null;
  if (record.holder.playerId === viewer) return <span className="font-medium text-fg">You hold this record</span>;
  if (!record.yours) return null;
  return (
    <>
      Your best: <span className={RECORD_YOURS_VALUE}>{record.yours.value}</span>
      {record.yours.when ? <span className="record-two:sr-only">{` · ${record.yours.when}`}</span> : ""}
    </>
  );
}

/**
 * One season record, a cell of the panel (see BOOK_COLS): the champion it was set on, the record
 * with its qualifier, who holds it (by name, in their colours: the row's picture is the champion's),
 * the champion, role, K/D/A and date (in a two-line cell the role, K/D/A and date for screen readers
 * only), the value with its unit, and the viewer's own best. The whole cell opens the game over the
 * board (`/leaderboards?match=`, RecordGamePeek), with the way to the holder's Match History inside;
 * the streak, set over several games, and the public boards open none. Inside its own li (the cell,
 * which measures itself), so it is a div. Exported for its markup test (the states the demo never
 * shows).
 */
export function RecordRow({ record, player, champ, viewer }: { record: RecordView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  const { holder } = record;
  const p = holder ? player(holder.playerId) : null;
  const c = holder ? champ(holder.championId) : null;
  const href = holder?.href ?? null;
  const yours = yoursText(record, viewer);
  const role = holder?.role ? ROLE_LABELS[holder.role] : null;
  return (
    // The cell's column template, read by its row (a container query cannot style its own container).
    <div className={cn(BOOK_COLS, "h-full")}>
      <DataRow
        as="div"
        testId="season-record"
        data-record={record.id}
        density="two-line"
        // Top-aligned: a grid row is as tall as its taller cell, and each cell starts at its top padding.
        align="start"
        className="h-full record-two:min-h-11 record-two:py-1 pointer-coarse:record-two:min-h-11"
        lead={<RecordPicture record={record} holder={holder} champion={c} />}
        // Named by the record, so speech control finds it by the words on the row; the visible words are then not read twice.
        // Not prefetched: on the one page every visit draws the seven cells, and a prefetch of each game's Match History in view
        // would be a server render of its own (Vercel Active CPU); the game loads in full on the click anyway.
        link={
          href ? (
            holder?.game ? (
              <RecordGameLink matchId={holder.game.matchId} href={href}>
                {record.label}: open the game
              </RecordGameLink>
            ) : (
              <RowLink href={href} prefetch={false} testId="record-open">
                {record.label}: open the game
              </RowLink>
            )
          ) : null
        }
        figures={
          holder ? (
            // The value with its unit: top right over each other from a 20rem cell and in a two-line cell (across both its lines), at
            // the holder's line's end in a narrower cell, a line of its own (wrapping) under 16rem.
            <span data-testid="record-figure" className="col-[3/4] row-[2/3] flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 @min-[20rem]/list:row-[1/span_2] @min-[20rem]/list:flex-col @min-[20rem]/list:items-end @min-[20rem]/list:gap-0 @min-[20rem]/list:self-start @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[5/6] @max-[16rem]/list:justify-start record-two:row-[1/span_2] record-two:flex-col record-two:items-end record-two:gap-0 record-two:self-center">
              {/* 18px on a 20px line, so beside the record's 20px line it adds no height to the row. */}
              <FigureCell testId="record-value" size={null} emphasis="strong" className="text-lg leading-5">
                {holder.value}
              </FigureCell>
              <span data-testid="record-unit" className="min-w-0 text-xs text-fg-muted @min-[20rem]/list:whitespace-nowrap">
                {/* A narrow cell breaks the unit after its "/" ("damage/" "min"), never inside a word. */}
                {holder.unit.split("/").map((part, i, all) => (i < all.length - 1 ? <Fragment key={i}>{part}/<wbr /></Fragment> : part))}
              </span>
            </span>
          ) : null
        }
        // The chevron on every row that opens a game (UD.L4: it showed only from 36rem, and hover was the only cue), never under 16rem.
        trail={href ? <ChevronRight aria-hidden className="col-[4/5] row-[1/span_3] size-4 self-center text-fg-subtle transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-fg-muted @max-[16rem]/list:hidden record-two:row-[1/span_2]" /> : null}
      >
        {/* The record and its qualifier: across the text and the figure in a cell under 20rem, the first line beside the figure from
            20rem. The two are shifted left by a separator's room inside a clipped edge: the qualifier's "·" shows beside the record,
            and is cut off with that room when the qualifier starts a line of its own. */}
        <span className="col-[2/4] row-[1/2] min-w-0 overflow-hidden text-sm @min-[20rem]/list:col-[2/3] @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[2/3] record-two:col-[2/3] record-two:self-end" data-testid="record-title">
          <span className="-ml-3 flex min-w-0 flex-wrap items-baseline">
            <span aria-hidden={href ? true : undefined} className="min-w-0 pl-3 font-semibold text-fg [overflow-wrap:anywhere]" data-testid="record-label">
              {/* The record in a few words in a two-line cell (the full label stays its name: the link's words, or read out here). */}
              <span className="record-two:hidden">{record.label}</span>
              <span className="hidden record-two:inline" aria-hidden>
                {record.short}
              </span>
              <span className="sr-only hidden record-two:inline">{record.label}</span>
            </span>
            {record.qualifier ? (
              <span className="relative min-w-0 pl-3 text-xs text-fg-muted [overflow-wrap:anywhere] record-two:@max-[24rem]/list:sr-only" data-testid="record-qualifier">
                <span aria-hidden className="absolute left-1">
                  ·
                </span>
                <span className="sr-only">, </span>
                {record.qualifier}
              </span>
            ) : null}
          </span>
        </span>
        {holder && p ? (
          // Who holds it, then the game and your best: a line each in a narrow cell (the holder beside the figure, the game and your
          // best across the row), one line in a two-line cell (the game's role, K/D/A and date read out there, not drawn).
          <span data-testid="record-game" className="contents record-two:col-[2/3] record-two:row-[2/3] record-two:flex record-two:min-w-0 record-two:flex-wrap record-two:items-baseline record-two:gap-x-1.5 record-two:self-start">
            <MemberCell look={p.look} name={p.name} avatar={false} nameTestId="record-holder" nameClassName="record-two:text-xs record-two:font-semibold" className="col-[2/3] row-[2/3] @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[3/4] record-two:text-xs" />
            {/* In a two-line cell the champion follows the holder (the streak, set over several games, has none: no "·" then); in one
                under 22rem (two cells a row under Recent form at 1366 and 1440) its portrait says which, and its name is read out. */}
            {c?.name ? (
              <span aria-hidden className="hidden text-xs text-fg-subtle record-two:inline record-two:@max-[22rem]/list:hidden">
                ·
              </span>
            ) : null}
            <span data-testid="record-context" className={cn("col-[2/4] row-[3/4] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[4/5]", c?.name ? "record-two:@max-[22rem]/list:sr-only" : "record-two:sr-only")}>
              {c?.name ?? null}
              {[role, holder.kda, holder.when].filter(Boolean).map((part, i) => (
                <span key={i} className="record-two:sr-only">
                  {c?.name || i > 0 ? " · " : ""}
                  {part}
                </span>
              ))}
            </span>
            {yours ? (
              <>
                <span aria-hidden className="hidden text-xs text-fg-subtle record-two:inline">
                  ·
                </span>
                <span data-testid="record-yours" className={RECORD_YOURS}>
                  {yours}
                </span>
              </>
            ) : null}
          </span>
        ) : (
          <span className="col-[2/4] row-[2/3] text-sm text-fg-subtle @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[3/4] record-two:col-[2/3] record-two:text-xs record-two:self-start" data-testid="record-none">
            No game sets this record yet this season.
          </span>
        )}
      </DataRow>
    </div>
  );
}

/**
 * The row's picture: the champion the record was set on (48px, 36px in a two-line cell); the streak,
 * set over several games, a tile with its mark; a dashed tile while nobody holds the record.
 * Decorative: the row names the champion in words.
 */
function RecordPicture({ record, holder, champion }: { record: RecordView; holder: RecordHolder | null; champion: PortraitChampion | null }) {
  return (
    <span aria-hidden className="col-[1/2] row-[1/span_3] self-start @max-[16rem]/list:row-[1/2] record-two:row-[1/span_2] record-two:self-center record-two:[&>*]:size-9!" data-testid="record-picture">
      {holder && champion ? (
        <ChampionPortrait champion={champion} size="md" className="ring-1 ring-border-strong/60" />
      ) : holder && record.id === "win-streak" ? (
        <span className="grid size-12 place-items-center rounded-md border border-border bg-surface-2 text-fg-subtle">
          <TrendingUp className="size-5" />
        </span>
      ) : (
        <ChampionPortrait champion={null} size="md" />
      )}
    </span>
  );
}

// ── Multikills ─────────────────────────────────────────────────────────────────────────────────

/*
  The multikill table (docs/TEAM_LEADERBOARDS.md, "The multikill score"): one panel, a row per
  active player with a place (20 or more games with counts), nobody else (25 Nov 2026: no "not
  placed yet" group, no "most of each" tiles: the kinds' columns show them). Its title says what the
  score is ranked by, its ⓘ what earns points, and its foot how to read a score (below 100, 100,
  above 100). By the board's own width:
    table   (from 26rem: the desktop board's column, a tablet) place · player and the most-played
            role's icon · games with counts · doubles · triples · quadras · pentas · Score; the kinds'
            headings "2×"–"5×", their words ("Doubles"…) from a 40rem board; 40px rows (44 on touch);
    narrow  (a phone) place · player and icon · Score on the first line; the games and the kinds made
            in words across the line under it ("46 games · 32 doubles · 7 triples · 5 quadras · 2 pentas",
            a kind with none left out), so nothing is wider than the phone and no figure is microscopic.
  The Score is a button (the shared breakdown popover): how the score was worked out, from its own
  parts (multikill-breakdown.tsx). The role icon's ⓘ (hover, focus, tap) gives every position's
  share of the score's games. The row itself opens the player Peek; the name, the role and the Score
  keep their own presses above it (ROW_CONTROL). Places are plain numbers, first in gold, a shared
  place "4=" with its bracket, as on Recent form.
*/
const MK_COLS =
  "flex h-full flex-col [--dl-cols:1.75rem_minmax(0,1fr)_auto] " +
  "@min-[26rem]/list:[--dl-cols:1.75rem_minmax(0,1fr)_2.5rem_repeat(4,1.75rem)_3.25rem] " +
  "@min-[40rem]/list:[--dl-cols:2rem_minmax(0,1fr)_3rem_repeat(4,3.25rem)_4rem]";
/** A cell of the table's own columns (hidden on a narrow board, where the line of words says the same). */
const TABLE_CELL = "hidden @min-[26rem]/list:block";
const KIND_HEAD: Record<MultikillKey, { short: string; word: string; spoken: string }> = {
  double: { short: "2×", word: "Doubles", spoken: "double kills" },
  triple: { short: "3×", word: "Triples", spoken: "triple kills" },
  quadra: { short: "4×", word: "Quadras", spoken: "quadra kills" },
  penta: { short: "5×", word: "Pentas", spoken: "pentakills" },
};
const KIND_WORDS: Record<MultikillKey, [string, string]> = { double: ["double", "doubles"], triple: ["triple", "triples"], quadra: ["quadra", "quadras"], penta: ["penta", "pentas"] };

const MK_HEADS = (
  <>
    <DataHead align="end" className="pr-1">
      #
    </DataHead>
    <DataHead>Player</DataHead>
    <DataHead align="end">Games</DataHead>
    {MULTIKILL_KEYS.map((k) => (
      <DataHead key={k} align="end">
        <span className="@min-[40rem]/list:hidden">{KIND_HEAD[k].short}</span>
        <span className="hidden @min-[40rem]/list:inline">{KIND_HEAD[k].word}</span>
      </DataHead>
    ))}
    <DataHead align="end" className="pr-1.5">
      Score
    </DataHead>
  </>
);

/** The season's multikill table; `className` places it on the page. */
export function Multikills({ records, player, champions, className }: { records: RecordsView; player: (id: string) => BoardPlayer; /** The champions the breakdowns name, by id. */ champions: Readonly<Record<string, PortraitChampion>>; className?: string }) {
  const board = records.multikills;
  const ties = tieRuns(board.rows.map((r) => r.place));
  return (
    <section id={SECTIONS.multikills} aria-labelledby="multikills-title" className={cn("flex min-w-0 flex-col", className)} data-testid="multikills">
      <DataList
        columns={MK_COLS}
        className="flex-auto"
        testId="records-multikills"
        headsTestId="multikill-heads"
        headsClassName="hidden @min-[26rem]/list:grid"
        heads={board.rows.length ? MK_HEADS : undefined}
        title={
          <BoardTitle id="multikills-title" icon={<Flame className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />} aside={<InfoTip label="How the multikill score works" text={board.explain} testId="multikill-explain" />} note={<span data-testid="multikill-basis">{board.basis}</span>} noteTestId="multikill-note-line">
            Multikills
          </BoardTitle>
        }
      >
        {board.rows.length === 0 ? <EmptyState variant="row" testId="multikills-empty" title={`No active player has ${board.rankedFrom} games with multikill counts this season yet.`} /> : null}
        {board.rows.length ? (
          <DataGroup label="Multikill score ranking" testId="multikill-rows">
            {board.rows.map((r, i) => (
              <MultikillRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={ties[i] ?? null} board={board} champions={champions} />
            ))}
          </DataGroup>
        ) : null}
        {/* How to read a score, always in view (at the panel's foot: a shorter table leaves its room above this line). */}
        <p className={cn("mt-auto flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-xs text-fg-muted", ROW_PAD_X)} data-testid="multikill-legend" data-counting-rule={board.rule} data-counting-shown={board.ruleShown}>
          <span>
            <span className="font-medium text-fg">Below 100</span> below typical
          </span>
          <span>
            <span className="font-medium text-fg">100</span> typical
          </span>
          <span>
            <span className="font-medium text-fg">Above 100</span> above typical
          </span>
          {records.multikillShort ? (
            <span className="ml-auto text-fg-subtle" data-testid="multikill-short">
              {records.multikillShort}
            </span>
          ) : null}
        </p>
      </DataList>
    </section>
  );
}

/** The most-played role's icon with its ⓘ (hover, focus or tap: every position's share), named by what it says; "role unknown" read out when no game recorded one. */
function RoleTip({ role }: { role: MultikillRow["role"] }) {
  if (role.kind === "unknown")
    return (
      <span className="sr-only" data-testid="multikill-role" data-role-kind="unknown">
        {role.label}
      </span>
    );
  return (
    <InfoTip
      label={role.label}
      testId="multikill-role"
      className="relative z-[2] shrink-0 no-underline pointer-coarse:-m-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
      text={
        <>
          {role.rows.map((r) => (
            <span key={r.role ?? "unknown"} className="block tabular-nums">
              {r.text}
            </span>
          ))}
        </>
      }
    >
      <RoleMark role={role} />
    </InfoTip>
  );
}

/**
 * One ranked player's row (MK_COLS): the place, the name with the role's icon, the games and the
 * kinds (each multikill once, at its largest), and the Score button. The whole row opens the
 * player's Peek; screen readers hear the place, the name, the role, the games, each kind and the score.
 */
function MultikillRowItem({ r, p, tie, board, champions }: { r: MultikillRow; p: BoardPlayer; tie: TiePosition | null; board: MultikillsView; champions: Readonly<Record<string, PortraitChampion>> }) {
  const linked = !!p.profileHref;
  // A phone's line: the games, then each kind made (none of a kind is left out there; the table's columns and the words read out say every kind).
  const words = [`${r.gamesText} ${r.counted === 1 ? "game" : "games"}`, ...MULTIKILL_KEYS.filter((k) => r.counts[k] > 0).map((k) => `${formatCount(r.counts[k])} ${KIND_WORDS[k][r.counts[k] === 1 ? 0 : 1]}`)];
  return (
    <DataRow
      testId="multikill-row"
      data-player-id={r.playerId}
      data-place={r.place}
      data-status={r.status}
      data-score={r.score}
      data-double={r.counts.double}
      data-triple={r.counts.triple}
      data-quadra={r.counts.quadra}
      data-penta={r.counts.penta}
      data-riot={`${r.riot.double},${r.riot.triple},${r.riot.quadra},${r.riot.penta}`}
      data-counted={r.counted}
      data-games={r.games}
      data-you={r.you || undefined}
      own={r.you}
      density="compact"
      className="gap-y-0!"
      lead={<Place place={r.place} tie={tie} leader={r.place === 1} testId="multikill-place" className="col-[1/2] row-[1/2] self-center" />}
      link={linked ? <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref!} /> : null}
      figures={
        <>
          <span className={cn(TABLE_CELL, "col-[3/4] row-[1/2] text-right text-sm tabular-nums text-fg")} data-testid="multikill-games">
            <span aria-hidden>{r.gamesText}</span>
            <span className="sr-only">{r.gamesSpoken}</span>
          </span>
          {MULTIKILL_KEYS.map((k, i) => (
            <span key={k} className={cn(TABLE_CELL, "row-[1/2] text-right text-sm tabular-nums", r.counts[k] ? "text-fg" : "text-fg-subtle", ["col-[4/5]", "col-[5/6]", "col-[6/7]", "col-[7/8]"][i])} data-testid="multikill-kind" data-kind={k}>
              {formatCount(r.counts[k])}
              <span className="sr-only"> {KIND_HEAD[k].spoken}</span>
            </span>
          ))}
          <span className="col-[3/4] row-[1/2] flex justify-end self-center @min-[26rem]/list:col-[8/9]" data-testid="multikill-score-cell">
            <BreakdownPopover
              trigger={
                <span className="text-lg font-semibold leading-6 text-fg" data-testid="multikill-score">
                  {r.score}
                </span>
              }
              triggerLabel={`Score ${r.score}: how it was worked out`}
              title={`${p.name} · multikill score`}
              testId="multikill-score-open"
              panelTestId="multikill-breakdown"
            >
              <MultikillBreakdownBody breakdown={r.breakdown} board={board} champions={champions} />
            </BreakdownPopover>
          </span>
        </>
      }
    >
      {/* The player as their card names them, and the role they mostly played in the score's games (its ⓘ: every position's share). */}
      <span className="col-[2/3] row-[1/2] flex min-w-0 items-center gap-1.5 self-center" data-testid="multikill-player">
        <MemberCell look={p.look} name={p.name} avatar={false} you={r.you} readName={!linked} nameHref={p.profileHref ?? undefined} nameTestId="board-member-name" className="min-w-0" />
        <RoleTip role={r.role} />
      </span>
      {/* A phone's line of words under the name: the games and every kind (the table's columns say these from 26rem). */}
      <span aria-hidden className="col-[2/4] row-[2/3] flex min-w-0 flex-wrap gap-x-1.5 self-start text-xs tabular-nums text-fg-muted @min-[26rem]/list:hidden" data-testid="multikill-words">
        {words.map((w, i) => (
          <span key={i} className="whitespace-nowrap">
            {i ? <span className="text-fg-subtle">· </span> : null}
            {w}
          </span>
        ))}
      </span>
      <span className="sr-only @min-[26rem]/list:hidden">{`${r.gamesSpoken}, ${MULTIKILL_KEYS.map((k) => `${formatCount(r.counts[k])} ${KIND_HEAD[k].spoken}`).join(", ")}`}</span>
    </DataRow>
  );
}

// ── Milestones ─────────────────────────────────────────────────────────────────────────────────

/** A milestone's step, as the system marks rarities: plain, raised, violet, gold (never a state colour), on the champion's portrait. */
const TIER_RING = ["ring-1 ring-border", "ring-1 ring-border-strong", "ring-2 ring-violet/70", "ring-2 ring-gold/80"] as const;
/** The cells: one column, two from a 26rem panel (the desktop board's column beside the records); a hairline between neighbours, as the records'. */
const MILESTONE_CELLS = "grid grid-cols-[minmax(0,1fr)] border-t border-border/70 @min-[26rem]/list:grid-cols-2";
const MILESTONE_CELL = "relative isolate flex min-h-11 min-w-0 items-center gap-2.5 border-border/60 py-1 [&:not(:first-child)]:border-t @min-[26rem]/list:[&:nth-child(2)]:border-t-0 @min-[26rem]/list:[&:nth-child(odd)]:border-r";

/**
 * The milestones: the active players' most meaningful champion milestones (the highest step first,
 * each player's best before anyone's second, at most eight), as two-line cells like the records':
 * the champion's portrait ringed in the step's rarity, the player over the champion and the figure;
 * the rest counted, on the players' profiles. One presentation for both kinds (games on a champion
 * this season, mastery all-time), no fold.
 */
export function Milestones({ records, player, champ, className }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; className?: string }) {
  const { items, more } = records.milestones;
  return (
    <section id={SECTIONS.milestones} aria-labelledby="milestones-title" className={cn("flex min-w-0 flex-col", className)} data-testid="milestones">
      <div className={cn(BOARD_PANEL, "flex flex-auto flex-col")} data-testid="records-milestones">
        <BoardTitle id="milestones-title" icon={<Sparkles className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />} note="25+ games this season · 100K+ mastery" noteTestId="milestones-scope">
          Milestones
        </BoardTitle>
        {items.length ? (
          <ul aria-label="Milestones" className={MILESTONE_CELLS} data-testid="milestones-list">
            {items.map((m) => (
              <MilestoneCell key={`${m.kind}|${m.playerId}|${m.championId}`} m={m} p={player(m.playerId)} champion={champ(m.championId)} />
            ))}
          </ul>
        ) : (
          <div className="border-t border-border/70">
            <EmptyState variant="row" testId="milestones-empty" title="No milestones among the active players yet." />
          </div>
        )}
        {more ? (
          <p className={cn("mt-auto border-t border-border/70 py-1.5 text-xs text-fg-muted", ROW_PAD_X)} data-testid="milestones-more">
            {formatCount(more)} more on the players&apos; profiles
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** One milestone: the champion's portrait in the step's ring, the player (in their colours) over the champion and the figure. The cell opens the player's Peek. */
function MilestoneCell({ m, p, champion }: { m: MilestoneItem; p: BoardPlayer; champion: PortraitChampion | null }) {
  const linked = !!p.profileHref;
  const name = champion?.name ?? m.championId;
  return (
    <li className={cn(MILESTONE_CELL, ROW_PAD_X, linked && ROW_STATES)} data-testid="milestone" data-tier={m.tier} data-kind={m.kind} data-player-id={m.playerId}>
      {linked ? <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref!} /> : null}
      <span aria-hidden className={cn("flex shrink-0 rounded-md", TIER_RING[Math.min(m.tier, 3)])} data-testid="milestone-portrait">
        <ChampionPortrait champion={champion} size="sm" className="size-8!" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col" style={cardColourVars(p.look)}>
        <span className="min-w-0 text-sm leading-5 text-fg" aria-hidden={linked || undefined} data-testid="milestone-player">
          <CardName look={p.look} name={p.name} />
        </span>
        <span className="min-w-0 text-xs leading-4 text-fg-muted" data-testid="milestone-champion">
          {name} · <span className="tabular-nums text-fg">{m.short}</span> {m.unit}
          <span className="sr-only">
            , {m.value}, {m.milestone} milestone
          </span>
        </span>
      </span>
    </li>
  );
}
