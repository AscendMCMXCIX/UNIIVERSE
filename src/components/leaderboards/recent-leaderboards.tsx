import type { PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { DataGroup, DataHead, DataList, DataRow, FigureCell, MemberCell, Place, ROW_STATES, RowLink, tieRuns, type TiePosition } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { QuietBar } from "@/components/ui/quiet-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { DataStatusNote } from "@/components/ui/data-status";
import type { DataStatus } from "@/domain/data-status";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount, formatDateTime, formatOrdinal } from "@/lib/format";
import type { BoardPlayer, FormRow, FormView, RecentLeaderboardView } from "@/server/leaderboards/recent-view";
import { LeaderboardsRoot } from "./leaderboards-root";
import { LeaderboardsViews } from "./leaderboards-views";
import { Records } from "./records";
import { SeasonChoice } from "./season-choice";

/*
  TEAM LEADERBOARDS (docs/LEADERBOARDS_MODEL.md): two views of equal weight as
  secondary tabs under the Team tabs, as Match History's Games and Encounters are under a profile's.
    Recent form              one board, everyone on the same 20 recent games, ranked by win rate.
                             Every row says what counts: the record (also as a bar of 20 games,
                             wins first), the dates and the main role, and the gap to the place
                             above in wins. Styling is neutral on purpose: no red for a cold streak
                             (unlike win rates elsewhere), only the first place's crown and your own
                             row are marked.
    Records & achievements   single games and milestones, which reward playing more, and say so
                             (./records.tsx).
*/

export function RecentLeaderboards({ view, champions, status }: { view: RecentLeaderboardView; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  const members = `${view.playerCount} member${view.playerCount === 1 ? "" : "s"}`;
  // What the figures count, part by part; the last part and the data status stay together.
  const parts =
    view.tab === "form" && view.form
      ? [`Latest ${view.form.window.games} games from the last ${view.form.window.days} days`, "Summoner's Rift, 5 minutes or longer", members]
      : view.records
        ? [view.records.seasonLabel, "All supported games", `${formatCount(view.records.games)} games`, members]
        : [members];
  return (
    <LeaderboardsRoot className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4">
      <h1 className="sr-only">Team Leaderboards</h1>
      <SectionHeader
        id="leaderboards-view-title"
        title={view.tab === "form" ? "Recent form" : "Records & achievements"}
        nav={<LeaderboardsViews current={view.tab} hrefs={view.tabs} />}
        description={
          <p className="text-sm text-fg-muted" data-testid="scope-label">
            {parts.slice(0, -1).map((t) => `${t} · `).join("")}
            {/* The last part and the status as one unit: they move to the next line together, so the ⓘ never stands on a line alone. */}
            <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2">
              <span data-testid="scope-count">{parts.at(-1)}</span>
              {status ? <DataStatusNote status={status} testId="leaderboards-status" /> : null}
            </span>
          </p>
        }
        status={
          status ? undefined : (
            <p className="text-xs text-fg-subtle" data-testid="last-updated">
              {updated ? `Updated from the last account sync: ${updated}` : "No account sync yet"}
            </p>
          )
        }
        // The season, only where there are two to choose from (an empty toolbar would still take its row's gap).
        controls={view.records && view.records.seasons.length > 1 ? <SeasonChoice seasons={view.records.seasons} current={view.records.season} /> : null}
      />
      {view.playerCount === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-fg-muted" data-testid="leaderboards-empty">
          No team members to compare yet. Members appear here as soon as they join the team.
        </p>
      ) : view.form ? (
        <RecentForm form={view.form} player={player} viewer={view.viewer} />
      ) : view.records ? (
        <Records records={view.records} player={player} champ={champ} viewer={view.viewer} />
      ) : null}
    </LeaderboardsRoot>
  );
}

// ── Recent form ─────────────────────────────────────────────────────────────────────────────────

/*
  The board's columns, by its own width (DataList's tiers). Each template fits where its tier
  starts: the tracks' minimums, the gaps and the padding come to 35.25rem against 36, 56.75rem
  against 58.
    narrow  place · picture · name · win rate, then the second line under the name and rate:
            record · dates, and the gap at the line's right end, under the win rate (on a line of
            its own, still at the right, when it does not fit); the bar is the 2px line along the
            row's foot.
    medium  place · picture · name over the dates (from 40rem the main role's name before them)
            · bar and win rate · record · gap.
    wide    place · picture · name · bar and win rate · record · gap · main role · dates. The name
            stops at 18rem; the bar takes the rest.
*/
const FORM_COLS =
  "[--dl-cols:2rem_2.5rem_minmax(0,1fr)_auto] " +
  "@min-[36rem]/list:[--dl-cols:2.5rem_2.5rem_minmax(6.5rem,1fr)_minmax(8rem,1fr)_4rem_6.5rem] " +
  "@min-[58rem]/list:[--dl-cols:3rem_2.5rem_minmax(9rem,18rem)_minmax(9rem,1fr)_4rem_9.5rem_5.5rem_7rem]";
/** A cell beside both of a row's lines below 58rem, on its one line from 58rem. */
const BOTH_LINES = "row-[1/span_2] self-center @min-[58rem]/list:row-[1/2]";

const HEADS = (
  <>
    <DataHead align="end" className="pr-1">
      #
    </DataHead>
    <DataHead className="col-span-2">Member</DataHead>
    <DataHead>Win rate</DataHead>
    <DataHead align="end">Record</DataHead>
    {/* "To the place above" needs 9.1rem in label-caps: the medium gap column has 6.5rem. The
        padding sets the gap apart from the record before it (20px on a medium board, 16px on a wide one). */}
    <DataHead className="@min-[36rem]/list:pl-2 @min-[58rem]/list:pl-1">
      <span className="@min-[58rem]/list:hidden">Gap</span>
      <span className="hidden @min-[58rem]/list:inline">To the place above</span>
    </DataHead>
    <DataHead className="hidden @min-[58rem]/list:block">Main role</DataHead>
    <DataHead align="end" className="hidden @min-[58rem]/list:block">
      Games from
    </DataHead>
  </>
);

/** Recent form's board; exported for its markup test (the states the demo cannot reach). */
export function RecentForm({ form, player, viewer }: { form: FormView; player: (id: string) => BoardPlayer; viewer: string | null }) {
  const ranked = form.rows.filter((r) => r.status === "established");
  const provisional = form.rows.filter((r) => r.status === "provisional");
  const ties = tieRuns(ranked.map((r) => r.place));
  return (
    // At most the measure wide, at the page's left edge: one edge with the header.
    <section aria-labelledby="form-board-title" className="flex min-w-0 max-w-[var(--measure)] flex-col gap-3" data-testid="form">
      <h3 id="form-board-title" className="sr-only">
        Ranked by win rate over each member&apos;s latest {form.window.games} games
      </h3>
      <DataList surface="lead" columns={FORM_COLS} testId="form-board" headsTestId="form-heads" headsClassName="hidden @min-[36rem]/list:grid" heads={form.rows.length ? HEADS : undefined}>
        {form.rows.length === 0 ? (
          <EmptyState variant="row" testId="form-empty" title={`Nobody has ${form.window.provisionalFrom} games in the last ${form.window.days} days yet.`}>
            Members appear here from their {formatOrdinal(form.window.provisionalFrom)} recent game.
          </EmptyState>
        ) : null}
        {ranked.length ? (
          // Under 36rem each row's bar is the line along its foot: no hairline as well.
          <DataGroup label="Ranking" testId="form-rows" className="@max-[36rem]/list:divide-y-0">
            {ranked.map((r, i) => (
              <FormRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={ties[i] ?? null} window={form.window} />
            ))}
          </DataGroup>
        ) : null}
        {provisional.length ? (
          <DataGroup
            label="Provisional"
            testId="form-provisional"
            captionTestId="form-provisional-head"
            className="@max-[36rem]/list:divide-y-0"
            caption={
              <>
                <span className="font-semibold text-fg">Provisional</span> · {form.window.provisionalFrom} to {form.window.games - 1} recent games, listed after every full window
              </>
            }
          >
            {provisional.map((r) => (
              <FormRowItem key={r.playerId} r={r} p={player(r.playerId)} tie={null} window={form.window} />
            ))}
          </DataGroup>
        ) : null}
        {form.notEnough.length ? (
          // The board's last group: rows on a narrow board, chips from 36rem.
          <DataGroup
            as="ul"
            label="Not enough recent games"
            testId="form-not-enough"
            captionTestId="form-not-enough-head"
            className="[--dl-cols:2rem_2.5rem_minmax(0,1fr)] @min-[36rem]/list:flex @min-[36rem]/list:flex-wrap @min-[36rem]/list:gap-2 @min-[36rem]/list:divide-y-0 @min-[36rem]/list:px-3 @min-[36rem]/list:py-3 @min-[58rem]/list:px-4"
            caption={
              <>
                <span className="font-semibold text-fg">Not enough recent games</span> · {form.window.provisionalFrom} needed in the last {form.window.days} days
              </>
            }
          >
            {form.notEnough.map((n) => (
              <NotEnoughMember key={n.playerId} n={n} p={player(n.playerId)} you={n.playerId === viewer} />
            ))}
          </DataGroup>
        ) : null}
      </DataList>
      <p className="px-1 text-xs text-fg-muted" data-testid="form-footnote">
        {form.window.games} games is a short sample: places within 2 wins of each other are close. The gaps assume the players above don&apos;t play in the meantime. Each bar counts the window&apos;s games, wins first, not the order they were played. Every linked account counts, a game seen from two accounts once; remakes are left out.
      </p>
    </section>
  );
}

/**
 * The gap to the place above, short (D5): "1 win behind", "Next win: 3=" (the place one win would
 * share), "14 of 20 games" for a provisional window, "—" for first place. The sentence (FormRow.note)
 * stays: it is read out, and it is the row's tooltip. A change of wording ("A win ties 3rd") is a
 * change here only.
 */
export function gapToken(gap: FormRow["gap"], window: FormView["window"]): string {
  if (!gap) return "—";
  if (gap.kind === "level") return `Next win: ${gap.place}=`;
  if (gap.kind === "behind") return `${gap.wins} ${gap.wins === 1 ? "win" : "wins"} behind`;
  return `${gap.games} of ${window.games} games`;
}

/*
  One member's row. Every fact is one element, placed per tier of the board's width (see
  FORM_COLS), read in this order: the place, the link (the member's name), "You", the win rate, the
  record, the dates, the gap's sentence, the main role. Things positioned on the row (the tie
  bracket, the role badge, the bar's line, the link) are its direct children with both grid lines
  set, so their box is that grid area and the row's padding box, never the whole row by accident.
*/
function FormRowItem({ r, p, tie, window }: { r: FormRow; p: BoardPlayer; tie: TiePosition | null; window: FormView["window"] }) {
  const leader = r.place === 1;
  const roleTitle = r.role ? `${ROLE_LABELS[r.role.role]}: ${r.role.games} of ${r.games} games` : "No role recorded";
  const tieWords = tie && r.place !== null ? `Tied for ${formatOrdinal(r.place)}` : null;
  return (
    <DataRow
      testId="form-row"
      data-place={r.place ?? undefined}
      data-status={r.status}
      data-player-id={r.playerId}
      data-win-rate={r.winRate}
      data-games={r.games}
      data-wins={r.wins}
      data-you={r.you || undefined}
      data-tied={r.tied || undefined}
      own={r.you}
      density={{ narrow: "two-line", medium: "regular", wide: "dense" }}
      lead={
        <>
          <Place place={r.place} tie={tie} crown={leader} testId="form-place" className={cn("col-[1/2]", BOTH_LINES)} />
          <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="md" className={cn("col-[2/3] justify-self-start", BOTH_LINES)} />
        </>
      }
      // The row's tooltip, shown anywhere on it (under the link no cell's own title shows): the tie, the gap's sentence, the role's games.
      // The public board has no link, so no row tooltip: its cells keep their own titles.
      link={
        p.profileHref ? (
          <RowLink href={p.profileHref} hint={[tieWords, r.note, roleTitle].filter(Boolean).join(". ")}>
            {p.name}
          </RowLink>
        ) : null
      }
      figures={
        <>
          <QuietBar value={r.wins} segments={window.games} known={r.games} variant="row" testId="form-bar" className="col-[3/-1] @min-[36rem]/list:col-[4/5] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:mr-12 @min-[36rem]/list:self-center @min-[58rem]/list:row-[1/2]" />
          <FigureCell testId="form-win-rate" size="lg" emphasis="strong" label=" win rate" className="col-[4/5] row-[1/2] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:min-w-10 @min-[36rem]/list:self-center @min-[36rem]/list:justify-self-end @min-[36rem]/list:text-base @min-[58rem]/list:row-[1/2]">
            {r.winRate}%
          </FigureCell>
          {/* The second line under 36rem; from 36rem its cells are the row's own (display: contents), still in its small muted text.
              Under 36rem its parts may wrap inside (only one wider than the whole line does, with large text), so none runs past the board's edge. */}
          <span data-testid="form-meta" className="col-[3/-1] row-[2/3] flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs tabular-nums text-fg-muted @min-[36rem]/list:contents">
            <FigureCell testId="form-record" spoken={`${r.wins} wins, ${r.losses} losses`} size={null} align="start" className="@min-[36rem]/list:col-[5/6] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:self-center @min-[36rem]/list:whitespace-nowrap @min-[36rem]/list:text-right @min-[36rem]/list:text-sm @min-[58rem]/list:row-[1/2]">
              {r.wins}W {r.losses}L
            </FigureCell>
            <span aria-hidden className="@min-[36rem]/list:hidden">
              ·
            </span>
            <span data-testid="form-dates" className="@min-[36rem]/list:col-[3/4] @min-[36rem]/list:row-[2/3] @min-[36rem]/list:self-start @min-[36rem]/list:whitespace-nowrap @min-[58rem]/list:col-[8/9] @min-[58rem]/list:row-[1/2] @min-[58rem]/list:self-center @min-[58rem]/list:text-right @min-[58rem]/list:text-sm">
              {/* The main role's name before the dates on a 40–58rem board, where the badge alone was the only sign of it; read once, from form-role. */}
              {r.role ? (
                <span aria-hidden className="hidden @min-[40rem]/list:inline @min-[58rem]/list:hidden">
                  {ROLE_LABELS[r.role.role]}
                  {" · "}
                </span>
              ) : null}
              <span className="sr-only">Games from </span>
              {r.dates}
            </span>
            {/* The gap at the line's right end, under the win rate: when it does not fit, it takes a line of its own, still at the right, never after a dangling "·". */}
            <span className={cn("@max-[36rem]/list:ml-auto @min-[36rem]/list:col-[6/7] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:self-center @min-[36rem]/list:pl-2 @min-[36rem]/list:text-sm @min-[58rem]/list:row-[1/2] @min-[58rem]/list:pl-1", leader && "@max-[36rem]/list:hidden")}>
              <span aria-hidden data-testid="form-gap" title={r.note ?? undefined} className={r.gap?.kind === "level" ? "font-medium text-fg" : !r.gap ? "text-fg-subtle" : undefined}>
                {gapToken(r.gap, window)}
              </span>
              {r.note ? (
                <span className="sr-only" data-testid="form-note">
                  {r.note}
                </span>
              ) : null}
            </span>
          </span>
          {/* The main role: a badge on the picture's lower right below 58rem, its own column from 58rem. RoleIcon's own h-4 w-4 would win over a smaller size given to it, so the badge sizes it. */}
          <span
            data-testid="form-role"
            title={roleTitle}
            className={cn(
              r.role ? "absolute col-[2/3] -right-1 bottom-[calc(50%-1.5rem)] grid size-4.5 place-items-center rounded-full bg-surface-3 text-fg-muted ring-2 ring-surface [&>[data-role-icon]]:size-2.5 @min-[58rem]/list:[&>[data-role-icon]]:size-3.5" : "sr-only @min-[58rem]/list:not-sr-only",
              "@min-[58rem]/list:static @min-[58rem]/list:col-[7/8] @min-[58rem]/list:row-[1/2] @min-[58rem]/list:flex @min-[58rem]/list:size-auto @min-[58rem]/list:min-w-0 @min-[58rem]/list:items-center @min-[58rem]/list:gap-1.5 @min-[58rem]/list:rounded-none @min-[58rem]/list:bg-transparent @min-[58rem]/list:text-sm @min-[58rem]/list:ring-0",
            )}
          >
            {r.role ? (
              <>
                <RoleIcon role={r.role.role} decorative />
                <span className="sr-only @min-[58rem]/list:not-sr-only">{ROLE_LABELS[r.role.role]}</span>
                <span className="sr-only">
                  {" "}
                  main role ({r.role.games} of {r.games} games)
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="text-fg-subtle">
                  —
                </span>
                <span className="sr-only">No role recorded</span>
              </>
            )}
          </span>
        </>
      }
    >
      <MemberCell look={p.look} name={p.name} avatar={false} you={r.you} readName={!p.profileHref} nameTestId="board-member-name" nameClassName="text-md leading-snug @min-[36rem]/list:text-sm" className="col-[3/4] row-[1/2] @min-[36rem]/list:self-end @min-[58rem]/list:self-center" />
    </DataRow>
  );
}

/**
 * A member without enough recent games, in the board's last group: a row on a narrow board (the
 * place column says "–": they have none), a chip from 36rem. With their picture and name as their
 * card shows them, the games they still need and their last game, and, for members, the way to
 * their profile. Not a DataRow: as a chip it drops the row's padding and height.
 */
function NotEnoughMember({ n, p, you }: { n: FormView["notEnough"][number]; p: BoardPlayer; you: boolean }) {
  return (
    <li
      data-testid="form-not-enough-member"
      data-player-id={n.playerId}
      className={cn(
        "relative isolate grid grid-cols-(--dl-cols) items-center gap-x-2.5 min-h-16 px-3 py-2",
        // The chip's edge is an inset ring, not a border, so the overlay link covers the whole chip: 40px, 44px on touch screens.
        "@min-[36rem]/list:flex @min-[36rem]/list:min-h-10 @min-[36rem]/list:gap-x-2 @min-[36rem]/list:overflow-clip @min-[36rem]/list:rounded-lg @min-[36rem]/list:ring-1 @min-[36rem]/list:ring-inset @min-[36rem]/list:ring-border @min-[36rem]/list:py-1 @min-[36rem]/list:pl-1 @min-[36rem]/list:pr-3 pointer-coarse:@min-[36rem]/list:min-h-11",
        you && "bg-accent/5",
        p.profileHref ? ROW_STATES : null,
      )}
    >
      {you ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
      <span aria-hidden className="justify-self-end pr-1 text-sm font-bold text-fg-subtle @min-[36rem]/list:hidden">
        –
      </span>
      {/* In the ranked rows' picture column, so the names make one edge down the board. */}
      <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" className="justify-self-center" />
      {/* Not prefetched: these names linked nowhere before, so they add no server render (Vercel Active CPU). */}
      {p.profileHref ? (
        <RowLink href={p.profileHref} prefetch={false}>
          {p.name}
        </RowLink>
      ) : null}
      <span className="flex min-w-0 flex-col @min-[36rem]/list:flex-row @min-[36rem]/list:flex-wrap @min-[36rem]/list:items-baseline @min-[36rem]/list:gap-x-2">
        <MemberCell look={p.look} name={p.name} avatar={false} you={you} readName={!p.profileHref} nameClassName="text-md leading-snug @min-[36rem]/list:text-sm" />
        <span className="text-xs text-fg-muted">
          Needs {n.needed} more game{n.needed === 1 ? "" : "s"}
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {n.lastGame ? `last game ${n.lastGame}` : "no games yet"}
        </span>
      </span>
    </li>
  );
}
