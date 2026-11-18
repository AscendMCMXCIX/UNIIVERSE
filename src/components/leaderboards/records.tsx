import type { ReactNode } from "react";
import { ChevronRight, Flame, Medal, Sparkles, TrendingUp } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { DataGroup, DataHead, DataList, DataRow, FigureCell, MemberCell, ROW_PAD_X, RowLink } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { SectionIndex } from "@/components/ui/section-index";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { BoardPlayer, MilestoneGroup, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";

/*
  RECORDS & ACHIEVEMENTS (docs/TEAM_LEADERBOARDS.md): single games, multikills and milestones,
  which reward playing more, and say so. Three boards of rows (ui/data-list), placed by the view's
  own width (@container/records), not the window's:
    under 36rem   one column: the volume note in one sentence, the page's sections as in-page links
                  (SectionIndex), then the record book, the multikills and the milestones;
    from 36rem    the same column without the index, the book's rows two lines beside the picture
                  (the record and its qualifier over the holder, champion, role, K/D/A and date;
                  64px where each fits its line);
    from 62rem    the book beside the multikills, the milestones under both, full width;
    from 98rem    three columns: the book, the multikills, the milestones (from 98rem the
                  milestones' column keeps the 32rem from which a chip names its champion).
  The book is the page's lead card (surface-lead): seven rows, each record's qualifier on its row
  and every definition in its title's one ⓘ (D6). Neutral, as Recent form: no colour marks a figure;
  the milestones' chips carry their rarities (violet, gold), as everywhere.
*/

/** The page's sections, for the index and their anchors. */
const SECTIONS = { book: "season-records", multikills: "multikills", milestones: "milestones" } as const;

export function Records({ records, player, champ, viewer }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; /** The viewer's player, when they are on the board. */ viewer: string | null }) {
  return (
    <div className="@container/records flex min-w-0 flex-col gap-3" data-testid="records">
      <p className="flex items-start gap-2 text-sm text-fg-muted" data-testid="records-volume-note">
        <Medal className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        {/* One sentence on a phone; where Recent form is, said beside it on wider screens (screen readers hear both everywhere). */}
        <span>
          Records and achievements reward playing more: every game is another chance.
          <span className="@max-[36rem]/records:sr-only"> How members are doing lately is on Recent form.</span>
        </span>
      </p>
      <SectionIndex
        className="@min-[36rem]/records:hidden"
        items={[
          { id: SECTIONS.book, label: "Season records" },
          { id: SECTIONS.multikills, label: "Multikills" },
          { id: SECTIONS.milestones, label: "Milestones" },
        ]}
      />
      {/* The boards. Each keeps its own height (items-start): a short board never stretches beside a tall one. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-4 @min-[62rem]/records:grid-cols-[minmax(0,1fr)_minmax(22rem,24rem)] @min-[98rem]/records:grid-cols-[minmax(0,1.2fr)_minmax(22rem,24rem)_minmax(0,1fr)]">
        <RecordBook records={records.records} player={player} champ={champ} viewer={viewer} />
        <Multikills records={records} player={player} />
        <Milestones records={records} player={player} champ={champ} className="@min-[62rem]/records:col-span-2 @min-[98rem]/records:col-span-1" />
      </div>
    </div>
  );
}

/** A board's title row: its h3 (named for the section's aria-labelledby), an ⓘ beside it, a note under it. */
function BoardTitle({ id, icon, aside, note, noteTestId, children }: { id: string; icon?: ReactNode; aside?: ReactNode; note?: ReactNode; noteTestId?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 py-2", ROW_PAD_X)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {/* The icon on the title's first line, however many lines a large text size gives it. */}
        <h3 id={id} className="flex min-w-0 items-start gap-1.5 text-base font-semibold text-fg [&>svg]:mt-[calc((1lh_-_1rem)/2)]">
          {icon}
          <span className="min-w-0">{children}</span>
        </h3>
        {aside}
      </div>
      {note ? (
        <p className="text-xs text-fg-muted" data-testid={noteTestId}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

// ── The record book ────────────────────────────────────────────────────────────────────────────

/*
  The book's columns, by its own width (DataList's tiers):
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

function RecordBook({ records, player, champ, viewer }: { records: RecordView[]; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  // Every definition in one place (D6), each record's qualifier on its row.
  const definitions = (
    <>
      {records
        .filter((r) => r.definition)
        .map((r) => (
          <span key={r.id} className="block">
            <span className="font-semibold">{r.label}:</span> {r.definition}
          </span>
        ))}
      <span className="mt-1 block">A tie goes to whoever set it first.</span>
    </>
  );
  return (
    <section id={SECTIONS.book} aria-labelledby="season-records-title" className="min-w-0">
      <DataList surface="lead" columns={BOOK_COLS} testId="records-book" title={<BoardTitle id="season-records-title" aside={<InfoTip label="How these records count" text={definitions} testId="records-definitions" />}>Season records</BoardTitle>}>
        <DataGroup as="ul" testId="season-records">
          {records.map((r) => (
            <RecordRow key={r.id} record={r} player={player} champ={champ} viewer={viewer} />
          ))}
        </DataGroup>
      </DataList>
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
 * One season record, a row of the book (see BOOK_COLS): the champion it was set on (48px), the
 * record with its qualifier, who holds it (their picture and name as their card shows them; on a
 * phone the name alone, so it keeps a line's room beside the figure), the champion, role, K/D/A and
 * date, the value with its unit, and the viewer's own best. The whole row
 * opens the game in the holder's Match History (`?match=`); the streak, set over several games, and
 * the public boards open none. Exported for its markup test (the states the demo never shows).
 */
export function RecordRow({ record, player, champ, viewer }: { record: RecordView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  const { holder } = record;
  const p = holder ? player(holder.playerId) : null;
  const c = holder ? champ(holder.championId) : null;
  const href = holder?.href ?? null;
  const yours = yoursText(record, viewer);
  return (
    <DataRow
      testId="season-record"
      data-record={record.id}
      density={{ narrow: "two-line", medium: "two-line" }}
      className="@max-[36rem]/list:py-3"
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
            {/* The value with its unit: at the holder's line's end on a phone, beside the record from 36rem, a line of its own (wrapping) under 16rem. */}
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
      {/* The record and its qualifier: across the text and the figure on a phone, the first line beside the figure from 36rem. The
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
        // Who holds it, then the game: a line each on a phone (the holder beside the figure, the game across the row), one line from 36rem.
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

function Multikills({ records, player }: { records: RecordsView; player: (id: string) => BoardPlayer }) {
  const rows = records.multikills;
  return (
    <section id={SECTIONS.multikills} aria-labelledby="multikills-title" className="min-w-0">
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

function Milestones({ records, player, champ, className }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; className?: string }) {
  return (
    <section id={SECTIONS.milestones} aria-labelledby="milestones-title" className={cn("min-w-0", className)}>
      <DataList
        columns={MILESTONE_COLS}
        testId="records-milestones"
        title={
          <BoardTitle id="milestones-title" icon={<Sparkles className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}>
            Lifetime and milestones
          </BoardTitle>
        }
      >
        <MilestoneKind title={`Games on one champion · ${records.seasonLabel}`} hint="Champions with 25, 50 or 100 games this season." empty="Nobody has 25 games on one champion this season yet." groups={records.championGames} player={player} champ={champ} testId="milestones-games" />
        <MilestoneKind title="Mastery on one champion · all-time" hint="Riot's champion mastery over each member's linked accounts: 100K, 500K and 1M points. The best three are shown; every champion is on the member's profile." empty="Nobody has 100K mastery points on one champion yet." groups={records.mastery} player={player} champ={champ} testId="milestones-mastery" />
      </DataList>
    </section>
  );
}

/** One kind of milestone: its caption (title and what counts), then a row per member, the best first. */
function MilestoneKind({ title, hint, empty, groups, player, champ, testId }: { title: string; hint: string; empty: string; groups: MilestoneGroup[]; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; testId: string }) {
  return (
    <div className="divide-y divide-border/70" data-testid={testId}>
      <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 bg-surface-2/40 py-2 text-xs", ROW_PAD_X)}>
        <h4 className="font-semibold text-fg">{title}</h4>
        <p className="text-fg-muted">{hint}</p>
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
