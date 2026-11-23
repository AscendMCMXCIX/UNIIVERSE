import { Fragment, type ReactNode } from "react";
import { ChevronRight, Flame, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { BOARD_PANEL, DataGroup, DataList, DataRow, FigureCell, MemberCell, Place, ROW_PAD_X, RowLink, tieRuns, type TiePosition } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { BoardPlayer, MilestoneGroup, MultikillRow, MultikillsView, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { BoardTitle } from "./board-title";
import { RECORD_YOURS, RECORD_YOURS_VALUE } from "./record-yours";
import { SeasonChoice } from "./season-choice";
import { SECTIONS } from "./sections";
import { PeekRowLink } from "./leaderboards-peek";
import { RecordGameLink } from "./record-game";

/*
  THE SEASON'S RECORDS AND ACHIEVEMENTS (docs/TEAM_LEADERBOARDS.md), the Leaderboards page's
  sections after Recent form: single games, multikills and milestones, which reward playing more,
  and say so (in the records' ⓘ). Three boards, each a section the page places by its own width
  (leaderboards-dashboard.tsx), each laid out by its own width, not the window's:
    Season records   seven cells in one panel: one column, then two from a 40rem panel under
                     Recent form, never in the column beside it from 86rem (the last, the
                     streak, across both); each cell measures itself (@container/list), so a
                     record reads the same wherever it is placed (RecordRow);
    Multikills       the multikill score's ranking, a row per member, then the most of each kind;
    Milestones       games on one champion this season, and all-time mastery: a row per member,
                     the champions as chips.
  Neutral, as Recent form: no colour marks a figure; the milestones' chips carry their rarities
  (violet, gold), as everywhere.
*/

// ── Season records ─────────────────────────────────────────────────────────────────────────────

/*
  The records' cells, by the panel's width and the page's: a column of cells, two columns from a
  40rem panel (cells of at least 19.25rem, a phone's room for the three-line layout: narrower, as in
  1280's 36rem panel, the holders' names wrap mid-name) while the page is under 86rem (a tablet
  either way round, a phone held sideways, 1440 wide); from 86rem the panel heads the column beside
  Recent form (26.25–38.5rem, under 40rem, so one column of cells), the multikills under it, so a
  taller panel (a member's own bests) lengthens that column alone. The seventh (the
  streak) goes across both columns, so no cell stands empty. A hairline between neighbours: above every
  cell but the first row's, and right of each left-hand cell. Each cell (an li) is its own
  @container/list and holds its column template (BOOK_COLS), so its row picks its layout by the
  cell's width: two lines beside the picture from 36rem (the desktop's side column from 1920 × 1080
  with the sidebar folded, and the streak across two columns), three lines under it (a phone, a
  tablet's two columns, the side column at 1920 × 1080 with the sidebar open), one column under
  16rem (a phone at 150% or 200% text).
*/
const RECORD_CELLS = "grid grid-cols-[minmax(0,1fr)] border-t border-border/70 @min-[40rem]/list:@max-[86rem]/dash:grid-cols-2";
const RECORD_CELL =
  "@container/list min-w-0 border-border/60 [&:not(:first-child)]:border-t @min-[40rem]/list:@max-[86rem]/dash:[&:nth-child(2)]:border-t-0 @min-[40rem]/list:@max-[86rem]/dash:[&:nth-child(odd):not(:last-child)]:border-r @min-[40rem]/list:@max-[86rem]/dash:[&:last-child:nth-child(odd)]:col-span-2";

/*
  A cell's columns, by its own width (DataList's tiers):
    narrow  picture · text · figure · chevron, three lines beside the 48px picture: the record and
            its qualifier; the holder; the champion, role, K/D/A and date; your best under them (a
            fourth line); the chevron where the row opens its game. The value and its unit: from a
            20rem cell (1440's two columns, a phone at 393) at the record's line's top right, one
            value position in every cell whatever the qualifier's length, as from 36rem (UD.L2: at
            1440 it sat on the holder's line or the third, as the qualifier wrapped); in a narrower
            cell (large text) at the holder's line's end, so the record's words keep the width. The holder keeps at least 5rem: on
            a 320px phone a long figure's unit wraps under its value (the figure is flex-wrap) rather
            than squeeze the name. Under 16rem (a phone at a large text size) one
            column: the picture, then the record, the holder, the game, the value with its unit (which
            wrap) and your best, each across the row, so nothing is held wider than the phone and no
            word is squeezed beside the picture.
    medium  picture · text · figure · chevron, two lines beside the picture: the record and its
            qualifier over the holder, champion, role, K/D/A and date; the value with its unit over
            your best; the chevron where the row opens its game.
  A qualifier that does not fit beside its record takes the next line whole, and its "·" stays
  behind (the title's clipped edge), so no line starts or ends with one.
*/
const BOOK_COLS = "[--dl-cols:3rem_minmax(5rem,1fr)_auto_1rem] @max-[16rem]/list:[--dl-cols:minmax(0,1fr)] @min-[36rem]/list:[--dl-cols:3rem_minmax(0,1fr)_auto_1rem]";

/**
 * Season records: the season's seven records in one panel, its title with the one ⓘ holding every
 * definition, what it counts (the season, its games) and, where there are two seasons to choose
 * from, the season. `className` places it on the page.
 */
export function SeasonRecords({ records, player, champ, viewer, className }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; /** The viewer's player, when they are on the board. */ viewer: string | null; className?: string }) {
  return (
    <section id={SECTIONS.records} aria-labelledby="season-records-title" className={cn("min-w-0", className)} data-testid="records">
      <div className={BOARD_PANEL} data-testid="records-book">
        <BoardTitle
          id="season-records-title"
          icon={<Trophy className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
          // The season, only where there are two to choose from.
          end={records.seasons.length > 1 ? <SeasonChoice seasons={records.seasons} current={records.season} /> : null}
          note={`${records.seasonLabel} · All supported games · ${formatCount(records.games)} games · ties: first to set it`}
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
 * record cards said they held it).
 */
function yoursText(record: RecordView, viewer: string | null): ReactNode {
  if (!viewer || !record.holder) return null;
  if (record.holder.playerId === viewer) return <span className="font-medium text-fg">You hold this record</span>;
  if (!record.yours) return null;
  return (
    <>
      Your best: <span className={RECORD_YOURS_VALUE}>{record.yours.value}</span>
      {record.yours.when ? ` · ${record.yours.when}` : ""}
    </>
  );
}

/**
 * One season record, a cell of the panel (see BOOK_COLS): the champion it was set on (48px), the
 * record with its qualifier, who holds it (their picture and name as their card shows them; in a
 * narrow cell the name alone, so it keeps a line's room beside the figure), the champion, role,
 * K/D/A and date, the value with its unit, and the viewer's own best. The whole cell opens the game
 * over the board (`/leaderboards?match=`, RecordGamePeek), with the way to the holder's Match History inside; the streak, set over several games, and the public
 * boards open none. Inside its own li (the cell, which measures itself), so it is a div. Exported
 * for its markup test (the states the demo never shows).
 */
export function RecordRow({ record, player, champ, viewer }: { record: RecordView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  const { holder } = record;
  const p = holder ? player(holder.playerId) : null;
  const c = holder ? champ(holder.championId) : null;
  const href = holder?.href ?? null;
  const yours = yoursText(record, viewer);
  return (
    // The cell's column template, read by its row (a container query cannot style its own container).
    <div className={cn(BOOK_COLS, "h-full")}>
      <DataRow
        as="div"
        testId="season-record"
        data-record={record.id}
        density={{ narrow: "two-line", medium: "two-line" }}
        // Top-aligned: a grid row is as tall as its taller cell, and each cell starts at its top padding.
        align="start"
        className="h-full"
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
            <>
              {/* The value with its unit: top right over each other from a 20rem cell (the record's words keep the width), beside the
                record from 36rem, at the holder's line's end in a narrower cell, a line of its own (wrapping) under 16rem. */}
              <span data-testid="record-figure" className="col-[3/4] row-[2/3] flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 @min-[20rem]/list:row-[1/span_2] @min-[20rem]/list:@max-[36rem]/list:flex-col @min-[20rem]/list:@max-[36rem]/list:items-end @min-[20rem]/list:@max-[36rem]/list:gap-0 @min-[20rem]/list:self-start @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[5/6] @max-[16rem]/list:justify-start @min-[36rem]/list:row-[1/2] @min-[36rem]/list:gap-x-1.5 @min-[36rem]/list:self-end">
                {/* 18px on a 20px line, so beside the record's 20px line it adds no height to the row. */}
                <FigureCell testId="record-value" size={null} emphasis="strong" className="text-lg leading-5">
                  {holder.value}
                </FigureCell>
                <span data-testid="record-unit" className="min-w-0 text-xs text-fg-muted @min-[20rem]/list:@max-[36rem]/list:whitespace-nowrap">
                  {/* A narrow cell breaks the unit after its "/" ("damage/" "min"), never inside a word. */}
                  {holder.unit.split("/").map((part, i, all) => (i < all.length - 1 ? <Fragment key={i}>{part}/<wbr /></Fragment> : part))}
                </span>
              </span>
              {yours ? (
                <span data-testid="record-yours" className={RECORD_YOURS}>
                  {yours}
                </span>
              ) : null}
            </>
          ) : null
        }
        // The chevron on every row that opens a game (UD.L4: it showed only from 36rem, and hover was the only cue), never under 16rem.
        trail={href ? <ChevronRight aria-hidden className="col-[4/5] row-[1/span_3] size-4 self-center text-fg-subtle transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-fg-muted @max-[16rem]/list:hidden @min-[36rem]/list:row-[1/span_2]" /> : null}
      >
        {/* The record and its qualifier: across the text and the figure in a narrow cell, the first line beside the figure from 36rem. The
            two are shifted left by a separator's room inside a clipped edge: the qualifier's "·" shows beside the record, and is cut
            off with that room when the qualifier starts a line of its own. */}
        <span className="col-[2/4] row-[1/2] min-w-0 overflow-hidden text-sm @min-[20rem]/list:col-[2/3] @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[2/3] @min-[36rem]/list:self-end" data-testid="record-title">
          <span className="-ml-3 flex min-w-0 flex-wrap items-baseline">
            <span aria-hidden={href ? true : undefined} className="min-w-0 pl-3 font-semibold text-fg [overflow-wrap:anywhere]" data-testid="record-label">
              {record.label}
            </span>
            {record.qualifier ? (
              <span className="relative min-w-0 pl-3 text-xs text-fg-muted [overflow-wrap:anywhere]" data-testid="record-qualifier">
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
          // Who holds it, then the game: a line each in a narrow cell (the holder beside the figure, the game across the row), one line from 36rem.
          <span data-testid="record-game" className="contents @min-[36rem]/list:col-[2/3] @min-[36rem]/list:row-[2/3] @min-[36rem]/list:flex @min-[36rem]/list:min-w-0 @min-[36rem]/list:flex-wrap @min-[36rem]/list:items-center @min-[36rem]/list:gap-x-1.5 @min-[36rem]/list:self-start">
            <MemberCell look={p.look} name={p.name} avatarUrl={p.avatarUrl} avatar="xs" avatarClassName="@max-[36rem]/list:hidden" nameTestId="record-holder" className="col-[2/3] row-[2/3] @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[3/4]" />
            <span aria-hidden className="hidden text-xs text-fg-subtle @min-[36rem]/list:inline">
              ·
            </span>
            <span data-testid="record-context" className="col-[2/4] row-[3/4] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[4/5]">
              {[c?.name, holder.role ? ROLE_LABELS[holder.role] : null, holder.kda, holder.when].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className="col-[2/4] row-[2/3] text-sm text-fg-subtle @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[3/4] @min-[36rem]/list:col-[2/3] @min-[36rem]/list:self-start" data-testid="record-none">
            No game sets this record yet this season.
          </span>
        )}
      </DataRow>
    </div>
  );
}

/**
 * The row's picture, 48px: the champion the record was set on; the streak, set over several games,
 * a tile with its mark; a dashed tile while nobody holds the record. Decorative: the row names the
 * champion in words.
 */
function RecordPicture({ record, holder, champion }: { record: RecordView; holder: RecordHolder | null; champion: PortraitChampion | null }) {
  return (
    <span aria-hidden className="col-[1/2] row-[1/span_3] self-start @max-[16rem]/list:row-[1/2] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:self-center" data-testid="record-picture">
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
  The multikill board (docs/TEAM_LEADERBOARDS.md, "The multikill score"): one panel, by its own
  width, the same at every width but for the tiles' columns:
    the ranking   a row per member: the place (the crown on first), the picture, the name over the
                  kinds they made in words, rarest first ("1 quadra 6 triples 21 doubles", each
                  multikill once, at its largest: the score's own events), the score at the row's end
                  over the games behind it. The player Peek the row opens shows each kind made
                  against the usual (MultikillPeekDetail), on every device. Two short lines
                  (44–48px; a member with all four kinds wraps a third on a phone), no column
                  headings, nothing to decode; the score's sentence (each kind against what was
                  expected) is the row's tooltip and is read out.
    provisional   10–19 games with counts: listed after every ranked member, place "–";
    too few       under 10: the board's last group, the games they have, no score;
    most of each  four compact tiles (two by two under 30rem, one row of four from it): the most
                  double, triple, quadra and pentakills, each count with its holder (every holder of a
                  shared one, by name), so the kinds stay records of their own.
  The board's one ⓘ says how the score works in a few plain sentences; its line, what it is.
*/

/**
 * Place · picture · name over kinds · score over games. Under 20rem (a phone at a large text size)
 * the place, the picture and the score with its games take the first line, and the name and the
 * kinds each the row's whole width under them, so no name is squeezed to a letter a line; under
 * 14rem (a 320px phone at 175–200% text) the score and its games take a line of their own under the
 * name, the place and the picture alone on the first.
 */
const MULTI_COLS = "[--dl-cols:1.75rem_2rem_minmax(0,1fr)_auto] @max-[20rem]/list:[--dl-cols:1.75rem_2rem_minmax(0,1fr)]";
const NARROW = {
  lead: "row-[1/span_2] @max-[20rem]/list:row-[1/2]",
  score: "col-[4/5] row-[1/span_2] flex-col items-end text-right @max-[20rem]/list:col-[3/4] @max-[20rem]/list:row-[1/2] @max-[20rem]/list:flex-row @max-[20rem]/list:flex-wrap @max-[20rem]/list:items-baseline @max-[20rem]/list:gap-x-1.5 @max-[20rem]/list:text-left @max-[14rem]/list:col-[1/-1] @max-[14rem]/list:row-[3/4]",
  name: "col-[3/4] @max-[20rem]/list:col-[1/-1] @max-[20rem]/list:row-[2/3]",
  kinds: "col-[3/4] row-[2/3] @max-[20rem]/list:col-[1/-1] @max-[20rem]/list:row-[3/4] @max-[14rem]/list:row-[4/5]",
};
/** The tiles: two by two, a row of four from a 30rem panel, one column under 14rem (large text); a hairline between neighbours. */
const MOST_GRID = "grid grid-cols-2 @max-[14rem]/list:grid-cols-1 @min-[30rem]/list:grid-cols-4";
const MOST_CELL =
  "min-w-0 border-border/60 px-3 py-1 [&:nth-child(odd)]:border-r [&:nth-child(n+3)]:border-t @max-[14rem]/list:border-r-0 @max-[14rem]/list:[&:not(:first-child)]:border-t @min-[30rem]/list:border-r @min-[30rem]/list:[&:nth-child(n+3)]:border-t-0 @min-[30rem]/list:last:border-r-0";

/** The season's multikill board: the score's ranking, then the most of each kind; `className` places it on the page. */
export function Multikills({ records, player, className }: { records: RecordsView; player: (id: string) => BoardPlayer; className?: string }) {
  const board = records.multikills;
  const ranked = board.rows.filter((r) => r.status === "ranked");
  const provisional = board.rows.filter((r) => r.status === "provisional");
  const few = board.rows.filter((r) => r.status === "not-enough");
  const ties = tieRuns(ranked.map((r) => r.place));
  // One ⓘ: how the score works in three short points, then which games the counts come from when not all carry them.
  const explain = <ExplainPoints points={records.multikillNote ? [...board.explain, records.multikillNote] : board.explain} />;
  return (
    <section id={SECTIONS.multikills} aria-labelledby="multikills-title" className={cn("min-w-0", className)}>
      <DataList
        columns={MULTI_COLS}
        testId="records-multikills"
        title={
          <BoardTitle
            id="multikills-title"
            icon={<Flame className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
            aside={<InfoTip label="How the multikill score works" text={explain} testId="multikill-explain" />}
            note={
              <>
                <span data-testid="multikill-basis">{board.basis}</span>
                {records.multikillShort ? (
                  <>
                    &nbsp;·{" "}
                    <span className="@min-[20rem]/list:whitespace-nowrap" data-testid="multikill-short">
                      {records.multikillShort}
                    </span>
                  </>
                ) : null}
              </>
            }
            noteTestId="multikill-note-line"
          >
            Multikills · {records.seasonLabel}
          </BoardTitle>
        }
      >
        {board.rows.length === 0 ? <EmptyState variant="row" testId="multikills-empty" title="No games with multikill counts this season yet." /> : null}
        {ranked.length ? (
          <DataGroup label="Multikill score ranking" testId="multikill-rows">
            {ranked.map((r, i) => (
              <MultikillRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={ties[i] ?? null} />
            ))}
          </DataGroup>
        ) : null}
        {provisional.length ? (
          <DataGroup
            label="Provisional"
            testId="multikill-provisional"
            captionTestId="multikill-provisional-head"
            caption={
              <>
                <span className="font-semibold text-fg">Provisional</span>&nbsp;·&nbsp;{board.provisionalFrom} to {board.rankedFrom - 1} games with multikill counts
              </>
            }
          >
            {provisional.map((r) => (
              <MultikillRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={null} />
            ))}
          </DataGroup>
        ) : null}
        {few.length ? (
          <DataGroup
            as="ul"
            label="Too few games for a score"
            testId="multikill-few"
            captionTestId="multikill-few-head"
            caption={
              <>
                <span className="font-semibold text-fg">Too few games for a score</span>&nbsp;·&nbsp;{board.provisionalFrom} needed
              </>
            }
          >
            {few.map((r) => (
              <MultikillRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={null} />
            ))}
          </DataGroup>
        ) : null}
        {board.rows.length ? <MostOfEach most={board.most} player={player} /> : null}
      </DataList>
    </section>
  );
}

/**
 * One member's row: the place, picture, name over the kinds made (each multikill once, at its largest), and the
 * score over the games behind it. The whole row opens the member's player Peek, its tooltip the
 * score's sentence; screen readers hear the place, name, score, kinds and the sentence.
 */
function MultikillRowItem({ r, p, tie }: { r: MultikillRow; p: BoardPlayer; tie: TiePosition | null }) {
  const linked = !!p.profileHref;
  return (
    <DataRow
      testId="multikill-row"
      data-player-id={r.playerId}
      data-place={r.place ?? undefined}
      data-status={r.status}
      data-score={r.score ?? undefined}
      data-double={r.counts.double}
      data-triple={r.counts.triple}
      data-quadra={r.counts.quadra}
      data-penta={r.counts.penta}
      data-riot={`${r.riot.double},${r.riot.triple},${r.riot.quadra},${r.riot.penta}`}
      data-counted={r.counted}
      data-you={r.you || undefined}
      own={r.you}
      density="dense"
      lead={
        <>
          {r.status === "not-enough" ? <span aria-hidden className={cn("col-[1/2]", NARROW.lead)} /> : <Place place={r.place} tie={tie} crown={r.place === 1} testId="multikill-place" className={cn("col-[1/2] self-center", NARROW.lead)} bracketClassName="@max-[20rem]/list:hidden" />}
          <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" className={cn("col-[2/3] self-center justify-self-start", NARROW.lead)} />
        </>
      }
      link={linked ? <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref!} hint={r.breakdown} /> : null}
      figures={
        <span className={cn("flex self-center", NARROW.score)} data-testid="multikill-score-cell">
          {r.score !== null ? (
            <FigureCell testId="multikill-score" size={null} emphasis={r.status === "ranked" ? "strong" : "muted"} label=" multikill score" className="text-lg leading-5">
              {r.score}
            </FigureCell>
          ) : null}
          {/* One line: "46 games", or "21/43 games" when older games have no counts (said in words to screen readers). */}
          <span className="whitespace-nowrap text-xs tabular-nums text-fg-muted" data-testid="multikill-games">
            <span aria-hidden>{r.gamesText}</span>
            <span className="sr-only">{r.gamesSpoken}</span>
          </span>
        </span>
      }
    >
      <MemberCell look={p.look} name={p.name} avatar={false} you={r.you} readName={!linked} nameHref={p.profileHref ?? undefined} nameTestId="board-member-name" className={cn("min-w-0 row-[1/2]", NARROW.name)} />
      {/* Riot's counts in words on every row, a member with too few games for a score included: the kinds are records of their own. */}
      <span className={cn("flex min-w-0 flex-wrap gap-x-1.5 text-xs tabular-nums text-fg-muted", NARROW.kinds)} data-testid="multikill-kinds">
        {r.kinds.length ? r.kinds.map((k) => <span key={k.key} data-kind={k.key} className="whitespace-nowrap">{k.text}</span>) : <span>No multikills yet</span>}
      </span>
      {/* The score in a sentence, for screen readers (the row's tooltip shows it on hover). */}
      <span className="sr-only">{r.breakdown}</span>
    </DataRow>
  );
}

/** The board's ⓘ as short points, each a line of its own (spans: the bubble and its screen-reader copy are phrasing content). */
function ExplainPoints({ points }: { points: readonly string[] }) {
  return (
    <>
      {points.map((point, i) => (
        <span key={i} className="block pl-3 -indent-3 [&:not(:first-child)]:mt-1.5" data-testid="multikill-explain-point">
          <span aria-hidden>• </span>
          {point}{" "}
        </span>
      ))}
    </>
  );
}

/**
 * The most of each kind, double to penta: each tile its label ("Most pentas"), the count, and who
 * holds it, by name (every holder of a shared one, each named), or "None yet". Not links: each
 * holder's row above opens their Peek.
 */
function MostOfEach({ most, player }: { most: MultikillsView["most"]; player: (id: string) => BoardPlayer }) {
  return (
    <div data-testid="multikill-most">
      <h3 className="sr-only">Most of each kind</h3>
      <ul aria-label="Most of each kind" className={MOST_GRID}>
        {most.map((m) => {
          const names = m.holders.map((id) => player(id).name);
          return (
            <li key={m.key} className={MOST_CELL} data-testid="multikill-most-kind" data-kind={m.key} data-count={m.count ?? undefined}>
              <p className="text-xs text-fg-muted">{m.label}</p>
              {m.count ? (
                <p className="flex min-w-0 items-baseline gap-x-1.5">
                  <span className="text-base leading-5 font-semibold tabular-nums text-fg" data-testid="multikill-most-count">
                    {m.count}
                  </span>
                  <span className="min-w-0 text-xs font-medium text-fg [overflow-wrap:anywhere]" data-testid="multikill-most-holders">
                    {names.join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-sm leading-5 text-fg-subtle">None yet</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Milestones ─────────────────────────────────────────────────────────────────────────────────

/** A milestone's tier, as the system marks rarities: plain, raised, violet, gold (never a state colour). */
const TIER_CLASS = ["border-border bg-surface-2/60", "border-border-strong bg-surface-2", "border-violet/50 bg-violet/10", "border-gold/60 bg-gold/10"] as const;
/** The member, then their top milestone and "+N", on one line; under the name in a list under 18rem (a phone at large text), so no name is squeezed. */
const MILESTONE_COLS = "[--dl-cols:minmax(0,1fr)_auto] @max-[18rem]/list:[--dl-cols:minmax(0,1fr)]";

/** The milestones: games on one champion this season, then all-time mastery; `className` places it on the page. */
export function Milestones({ records, player, champ, className }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; className?: string }) {
  return (
    <section id={SECTIONS.milestones} aria-labelledby="milestones-title" className={cn("min-w-0", className)}>
      <DataList
        columns={MILESTONE_COLS}
        testId="records-milestones"
        title={
          <BoardTitle id="milestones-title" icon={<Sparkles className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}>
            Milestones
          </BoardTitle>
        }
      >
        <MilestoneKind title={`Games on one champion · ${records.seasonLabel}`} hint="Champions with 25, 50 or 100 games this season." empty="Nobody has 25 games on one champion this season yet." groups={records.championGames} player={player} champ={champ} testId="milestones-games" />
        <MilestoneKind title="Mastery on one champion · all-time" hint="100K, 500K or 1M mastery points on one champion, added up over their Riot accounts. Each member's best is shown; the rest are on their profile." empty="Nobody has 100K mastery points on one champion yet." groups={records.mastery} player={player} champ={champ} testId="milestones-mastery" />
      </DataList>
    </section>
  );
}

/** One kind of milestone: its caption (title, with what counts behind its ⓘ), then a row per member, the best first. */
function MilestoneKind({ title, hint, empty, groups, player, champ, testId }: { title: string; hint: string; empty: string; groups: MilestoneGroup[]; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; testId: string }) {
  return (
    <div className="divide-y divide-border/70" data-testid={testId}>
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 bg-surface-2/40 py-2 text-xs", ROW_PAD_X)}>
        <h3 className="min-w-0 font-semibold text-fg">{title}</h3>
        <InfoTip label={`What counts: ${title}`} text={hint} testId={`${testId}-hint`} />
      </div>
      {groups.length ? (
        <ul className="divide-y divide-border/60" data-testid={`${testId}-list`}>
          {groups.map((g) => (
            <MilestoneRow key={g.playerId} group={g} p={player(g.playerId)} champ={champ} />
          ))}
        </ul>
      ) : (
        <EmptyState variant="row" title={empty} />
      )}
    </div>
  );
}

/**
 * A member's milestones: their picture and name, then their top milestone as a chip (the champion's
 * portrait, its name from 32rem, and the figure, "486K") and the rest counted, "+3", on their profile
 * (UM.L1: a row of three chips took a second line on a phone, and the board ran 1.3 screens). On a
 * phone the chip shows no champion's name (D6): the portrait says which, and screen readers hear it.
 * The whole row opens the member's profile; its tooltip names each chip's milestone, as the chips'
 * own titles do on the public boards, which link nowhere.
 */
function MilestoneRow({ group, p, champ }: { group: MilestoneGroup; p: BoardPlayer; champ: (id: string | null) => PortraitChampion | null }) {
  const linked = !!p.profileHref;
  const items = group.items.map((m) => ({ ...m, name: champ(m.championId)?.name ?? m.championId }));
  const said = (m: (typeof items)[number]) => `${m.name}: ${m.value} (${m.milestone} milestone)`;
  const [top] = items;
  const rest = items.length - 1 + group.more;
  const more = formatCount(rest);
  const hint = [...items.map(said), group.more ? `${formatCount(group.more)} more on the profile` : null].filter(Boolean).join(". ");
  return (
    <DataRow testId="milestone-member" data-player-id={group.playerId} density="dense" link={linked ? <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref!} hint={hint} /> : null}>
      <MemberCell look={p.look} name={p.name} avatarUrl={p.avatarUrl} avatar="xs" readName={!linked} nameHref={p.profileHref ?? undefined} className="col-[1/2] row-[1/2]" />
      <ul aria-label={`${p.name}'s milestones`} className="col-[2/3] row-[1/2] flex min-w-0 items-center justify-end gap-1 @max-[18rem]/list:col-[1/-1] @max-[18rem]/list:row-[2/3] @max-[18rem]/list:justify-start">
        {(top ? [top] : []).map((m) => (
          <li key={m.championId} className={cn("flex min-w-0 items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-2 text-xs", TIER_CLASS[Math.min(m.tier, 3)])} title={linked ? undefined : said(m)} data-testid="milestone" data-tier={m.tier}>
            <span aria-hidden className="flex shrink-0">
              <ChampionPortrait champion={champ(m.championId)} size="xs" className="size-6!" />
            </span>
            <span className="min-w-0 truncate font-medium text-fg @max-[32rem]/list:sr-only" data-testid="milestone-champion">
              {m.name}
            </span>
            <span aria-hidden className="shrink-0 tabular-nums text-fg-muted" data-testid="milestone-figure">
              {m.short}
            </span>
            <span className="sr-only">
              {" "}
              {m.value}, {m.milestone} milestone
            </span>
          </li>
        ))}
        {rest ? (
          <li className="px-1 text-xs tabular-nums text-fg-muted" data-testid="milestone-more">
            <span aria-hidden>+{more}</span>
            <span className="sr-only">and {more} more on their profile</span>
          </li>
        ) : null}
      </ul>
    </DataRow>
  );
}
