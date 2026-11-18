import type { ReactNode } from "react";
import { ChevronRight, Flame, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { BOARD_PANEL, DataGroup, DataHead, DataList, DataRow, FigureCell, MemberCell, ROW_PAD_X, RowLink } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { BoardPlayer, MilestoneGroup, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { BoardTitle } from "./board-title";
import { SeasonChoice } from "./season-choice";
import { SECTIONS } from "./sections";

/*
  THE SEASON'S RECORDS AND ACHIEVEMENTS (docs/TEAM_LEADERBOARDS.md), the Leaderboards page's
  sections after Recent form: single games, multikills and milestones, which reward playing more,
  and say so (in the records' ⓘ). Three boards, each a section the page places by its own width
  (leaderboards-dashboard.tsx), each laid out by its own width, not the window's:
    Season records   seven cells in one panel: one column, then two from a 44rem panel (the last,
                     the streak, across both); each cell measures itself (@container/list), so a
                     record reads the same wherever it is placed (RecordRow);
    Multikills       a row per member, rarest first;
    Milestones       games on one champion this season, and all-time mastery: a row per member,
                     the champions as chips.
  Neutral, as Recent form: no colour marks a figure; the milestones' chips carry their rarities
  (violet, gold), as everywhere.
*/

/** A record's definition and the rules every record keeps, in the records' one ⓘ (D6). */
function Definitions({ records }: { records: RecordView[] }) {
  return (
    <>
      <span className="block">Records reward playing more: every game is another chance.</span>
      {records
        .filter((r) => r.definition)
        .map((r) => (
          <span key={r.id} className="mt-1 block">
            <span className="font-semibold">{r.label}:</span> {r.definition}
          </span>
        ))}
      <span className="mt-1 block">A tie goes to whoever set it first.</span>
    </>
  );
}

// ── Season records ─────────────────────────────────────────────────────────────────────────────

/*
  The records' cells, by the panel's width: a column of cells, two columns from 44rem, the seventh
  (the streak) across both, so no cell stands empty. A hairline between neighbours: above every
  cell but the first row's, and right of each left-hand cell. Each cell (an li) is its own
  @container/list and holds its column template (BOOK_COLS), so its row picks its layout by the
  cell's width: two lines beside the picture from 36rem (the desktop's side column from 1920 × 1080
  with the sidebar folded, and the streak across two columns), three lines under it (a phone, a
  tablet's two columns, the side column at 1920 × 1080 with the sidebar open), one column under
  16rem (a phone at 150% or 200% text).
*/
const RECORD_CELLS = "grid grid-cols-[minmax(0,1fr)] border-t border-border/70 @min-[44rem]/list:grid-cols-2";
const RECORD_CELL =
  "@container/list min-w-0 border-border/60 [&:not(:first-child)]:border-t @min-[44rem]/list:[&:nth-child(2)]:border-t-0 @min-[44rem]/list:[&:nth-child(odd):not(:last-child)]:border-r @min-[44rem]/list:[&:last-child:nth-child(odd)]:col-span-2";

/*
  A cell's columns, by its own width (DataList's tiers):
    narrow  picture · text · figure, three lines beside the 48px picture: the record and its
            qualifier; the holder, with the value and its unit at the line's end; the champion, role,
            K/D/A and date; your best under them (a fourth line). The holder keeps at least 5rem: on
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
const BOOK_COLS = "[--dl-cols:3rem_minmax(5rem,1fr)_auto] @max-[16rem]/list:[--dl-cols:minmax(0,1fr)] @min-[36rem]/list:[--dl-cols:3rem_minmax(0,1fr)_auto_1rem]";

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
          aside={<InfoTip label="How these records count" text={<Definitions records={records.records} />} testId="records-definitions" />}
          // The season, only where there are two to choose from.
          end={records.seasons.length > 1 ? <SeasonChoice seasons={records.seasons} current={records.season} /> : null}
          note={`${records.seasonLabel} · All supported games · ${formatCount(records.games)} games`}
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
      Your best: <span className="font-semibold tabular-nums text-fg">{record.yours.value}</span>
      {record.yours.when ? ` · ${record.yours.when}` : ""}
    </>
  );
}

/**
 * One season record, a cell of the panel (see BOOK_COLS): the champion it was set on (48px), the
 * record with its qualifier, who holds it (their picture and name as their card shows them; in a
 * narrow cell the name alone, so it keeps a line's room beside the figure), the champion, role,
 * K/D/A and date, the value with its unit, and the viewer's own best. The whole cell opens the game
 * in the holder's Match History (`?match=`); the streak, set over several games, and the public
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
        className="h-full @max-[36rem]/list:py-2.5"
        lead={<RecordPicture record={record} holder={holder} champion={c} />}
        // Named by the record, so speech control finds it by the words on the row; the visible words are then not read twice.
        link={
          href ? (
            <RowLink href={href} testId="record-open">
              {record.label}: open the game
            </RowLink>
          ) : null
        }
        figures={
          holder ? (
            <>
              {/* The value with its unit: at the holder's line's end in a narrow cell, beside the record from 36rem, a line of its own (wrapping) under 16rem. */}
              <span data-testid="record-figure" className="col-[3/4] row-[2/3] flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[5/6] @max-[16rem]/list:justify-start @min-[36rem]/list:row-[1/2] @min-[36rem]/list:gap-x-1.5 @min-[36rem]/list:self-end">
                {/* 18px on a 20px line, so beside the record's 20px line it adds no height to the row. */}
                <FigureCell testId="record-value" size={null} emphasis="strong" className="text-lg leading-5">
                  {holder.value}
                </FigureCell>
                <span data-testid="record-unit" className="min-w-0 text-xs text-fg-muted [overflow-wrap:anywhere]">
                  {holder.unit}
                </span>
              </span>
              {yours ? (
                <span data-testid="record-yours" className="col-[2/-1] row-[4/5] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[6/7] @min-[36rem]/list:col-[3/4] @min-[36rem]/list:row-[2/3] @min-[36rem]/list:self-start @min-[36rem]/list:justify-self-end @min-[36rem]/list:text-right">
                  {yours}
                </span>
              ) : null}
            </>
          ) : null
        }
        trail={href ? <ChevronRight aria-hidden className="hidden size-4 text-fg-subtle transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-fg-muted @min-[36rem]/list:col-[4/5] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:block @min-[36rem]/list:self-center" /> : null}
      >
        {/* The record and its qualifier: across the text and the figure in a narrow cell, the first line beside the figure from 36rem. The
            two are shifted left by a separator's room inside a clipped edge: the qualifier's "·" shows beside the record, and is cut
            off with that room when the qualifier starts a line of its own. */}
        <span className="col-[2/-1] row-[1/2] min-w-0 overflow-hidden text-sm @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[2/3] @min-[36rem]/list:col-[2/3] @min-[36rem]/list:self-end" data-testid="record-title">
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
            <span data-testid="record-context" className="col-[2/-1] row-[3/4] min-w-0 text-xs text-fg-muted @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[4/5]">
              {[c?.name, holder.role ? ROLE_LABELS[holder.role] : null, holder.kda, holder.when].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className="col-[2/-1] row-[2/3] text-sm text-fg-subtle @max-[16rem]/list:col-[1/-1] @max-[16rem]/list:row-[3/4] @min-[36rem]/list:col-[2/3] @min-[36rem]/list:self-start" data-testid="record-none">
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

const KINDS = ["penta", "quadra", "triple"] as const;
const KIND_HEAD = { penta: "Penta", quadra: "Quadra", triple: "Triple" } as const;
const KIND_SPOKEN = { penta: "pentakills", quadra: "quadra kills", triple: "triple kills" } as const;
/** Each count's column from 21rem (literal classes, so Tailwind sees them). */
const KIND_COL = { penta: "@min-[21rem]/list:col-[2/3]", quadra: "@min-[21rem]/list:col-[3/4]", triple: "@min-[21rem]/list:col-[4/5]" } as const;
/** Member · penta · quadra · triple on one line from 21rem; under it the member's line, then the three counts, each with its name. */
const MULTI_COLS = "[--dl-cols:minmax(0,1fr)] @min-[21rem]/list:[--dl-cols:minmax(0,1fr)_repeat(3,3.5rem)]";

/** Multikills this season, rarest first, a row per member; `className` places it on the page. */
export function Multikills({ records, player, className }: { records: RecordsView; player: (id: string) => BoardPlayer; className?: string }) {
  const rows = records.multikills;
  return (
    <section id={SECTIONS.multikills} aria-labelledby="multikills-title" className={cn("min-w-0", className)}>
      <DataList
        columns={MULTI_COLS}
        testId="records-multikills"
        title={
          <BoardTitle id="multikills-title" icon={<Flame className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />} note={records.multikillNote} noteTestId="multikill-note">
            Multikills · {records.seasonLabel}
          </BoardTitle>
        }
        headsClassName="hidden @min-[21rem]/list:grid"
        heads={
          rows.length ? (
            <>
              <DataHead>Member</DataHead>
              {KINDS.map((k) => (
                <DataHead key={k} align="end">
                  {KIND_HEAD[k]}
                </DataHead>
              ))}
            </>
          ) : undefined
        }
      >
        {rows.length ? (
          <DataGroup label="Multikills, rarest first" testId="multikill-rows">
            {rows.map((m) => {
              const p = player(m.playerId);
              return (
                <DataRow
                  key={m.playerId}
                  testId="multikill-row"
                  data-player-id={m.playerId}
                  data-penta={m.penta}
                  data-quadra={m.quadra}
                  data-triple={m.triple}
                  density="dense"
                  link={p.profileHref ? <RowLink href={p.profileHref}>{p.name}</RowLink> : null}
                  figures={
                    // The counts: a line under the member, each with its name, under 21rem; their columns from it (display: contents).
                    <span className="col-[1/-1] row-[2/3] flex min-w-0 flex-wrap items-baseline gap-x-3 text-sm @min-[21rem]/list:contents">
                      {KINDS.map((k) => (
                        <span key={k} data-testid="multikill-count" data-kind={k} className={cn("flex items-baseline gap-1 tabular-nums @min-[21rem]/list:row-[1/2] @min-[21rem]/list:justify-end", KIND_COL[k])}>
                          <span aria-hidden className="text-xs text-fg-muted @min-[21rem]/list:hidden">
                            {KIND_HEAD[k]}
                          </span>
                          <span className={m[k] ? "font-semibold text-fg" : "text-fg-subtle"}>{m[k] ? formatCount(m[k]) : "—"}</span>
                          <span className="sr-only"> {KIND_SPOKEN[k]}</span>
                        </span>
                      ))}
                    </span>
                  }
                >
                  <MemberCell look={p.look} name={p.name} avatarUrl={p.avatarUrl} avatar="xs" readName={!p.profileHref} nameTestId="board-member-name" className="col-[1/-1] row-[1/2] @min-[21rem]/list:col-[1/2]" />
                </DataRow>
              );
            })}
          </DataGroup>
        ) : (
          <EmptyState variant="row" testId="multikills-empty" title="No triple kills or better this season yet." />
        )}
      </DataList>
    </section>
  );
}

// ── Milestones ─────────────────────────────────────────────────────────────────────────────────

/** A milestone's tier, as the system marks rarities: plain, raised, violet, gold (never a state colour). */
const TIER_CLASS = ["border-border bg-surface-2/60", "border-border-strong bg-surface-2", "border-violet/50 bg-violet/10", "border-gold/60 bg-gold/10"] as const;
/** The member, then their chips: one line from 40rem; a line each under it. */
const MILESTONE_COLS = "[--dl-cols:minmax(0,1fr)] @min-[40rem]/list:[--dl-cols:minmax(8rem,11rem)_minmax(0,1fr)]";

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
        <MilestoneKind title="Mastery on one champion · all-time" hint="Riot's champion mastery over each member's linked accounts: 100K, 500K and 1M points. The best three are shown; every champion is on the member's profile." empty="Nobody has 100K mastery points on one champion yet." groups={records.mastery} player={player} champ={champ} testId="milestones-mastery" />
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
 * A member's milestones: their picture and name, then one line of chips (the champion's portrait,
 * its name from 32rem, and the figure, "486K"), the rest counted, "+3 more", on their profile. On a
 * phone the chips show no champion's name (D6): the portrait says which, and screen readers hear it.
 * The whole row opens the member's profile; its tooltip names each chip's milestone, as the chips'
 * own titles do on the public boards, which link nowhere.
 */
function MilestoneRow({ group, p, champ }: { group: MilestoneGroup; p: BoardPlayer; champ: (id: string | null) => PortraitChampion | null }) {
  const linked = !!p.profileHref;
  const items = group.items.map((m) => ({ ...m, name: champ(m.championId)?.name ?? m.championId }));
  const said = (m: (typeof items)[number]) => `${m.name}: ${m.value} (${m.milestone} milestone)`;
  const more = formatCount(group.more);
  const hint = [...items.map(said), group.more ? `${more} more on the profile` : null].filter(Boolean).join(". ");
  return (
    <DataRow testId="milestone-member" data-player-id={group.playerId} density="dense" className="@max-[40rem]/list:py-1.5" link={linked ? <RowLink href={p.profileHref!} hint={hint}>{p.name}</RowLink> : null}>
      <MemberCell look={p.look} name={p.name} avatarUrl={p.avatarUrl} avatar="xs" readName={!linked} className="col-[1/-1] row-[1/2] @min-[40rem]/list:col-[1/2]" />
      <ul aria-label={`${p.name}'s milestones`} className="col-[1/-1] row-[2/3] flex min-w-0 flex-wrap items-center gap-1 @min-[40rem]/list:col-[2/3] @min-[40rem]/list:row-[1/2]">
        {items.map((m) => (
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
        {group.more ? (
          <li className="px-1 text-xs text-fg-muted" data-testid="milestone-more">
            <span aria-hidden>+{more} more</span>
            <span className="sr-only">and {more} more on their profile</span>
          </li>
        ) : null}
      </ul>
    </DataRow>
  );
}
