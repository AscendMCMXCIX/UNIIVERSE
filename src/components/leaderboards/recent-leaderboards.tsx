import { TrendingUp } from "lucide-react";
import { CardAvatar } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { DataGroup, DataHead, DataList, DataRow, FigureCell, MemberCell, Place, ROW_STATES, tieRuns, type TiePosition } from "@/components/ui/data-list";
import { PeekRowLink } from "./leaderboards-peek";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { QuietBar } from "@/components/ui/quiet-bar";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatOrdinal } from "@/lib/format";
import type { BoardPlayer, FormRow, FormView } from "@/server/leaderboards/recent-view";
import { BoardTitle } from "./board-title";
import { SECTIONS } from "./sections";

/*
  RECENT FORM (docs/LEADERBOARDS_MODEL.md), the Leaderboards page's first section and its lead
  card: one board, everyone on the same 20 recent games, ranked by win rate. Every row says what
  counts: the record (also as a bar of 20 games, wins first), the dates and the main role, and the
  gap to the place above in wins. Styling is neutral on purpose: no red for a cold streak (unlike win
  rates elsewhere), only the first place's crown and your own row are marked. The season's records
  and achievements follow it on the same page (./records.tsx).
*/

// ── Recent form ─────────────────────────────────────────────────────────────────────────────────

/*
  The board's columns, by its own width (DataList's tiers). Each template fits where its tier
  starts: the tracks' minimums, the gaps and the padding come to 34.75rem against 36, 56.25rem
  against 58. From 36rem the picture is 32px (a 2rem track) and each row 40px (DataRow's compact:
  the one-screen board of Release 16; 52px and 48px before), on phones 40px and 64px as ever.
    narrow  place · picture · name · win rate, then the second line under the name and rate:
            record · dates, and the gap at the line's right end, under the win rate (on a line of
            its own, still at the right, when it does not fit); the bar is the 2px line along the
            row's foot.
    medium  place · picture · name over the dates (from 40rem the main role's name before them)
            · bar and win rate · record · gap.
    wide    place · picture · name · bar and win rate · record · gap · main role · dates. The name
            stops at 18rem; the bar takes the rest.
  With large text a narrow board is narrower in rem than on any phone at 100% (a 320px phone's is
  17.9rem at 100%, 13.9rem at 125%, 11.25rem at 150% and 7.9rem at 200%), and beside the place,
  the picture and the win rate the name kept a few letters a line, one at 175% and 200%. So the
  row reflows there (nothing changes at 100%):
    under 17.5rem  the record and the dates take a line each, without the "·" between them, which
                   would end the first (together they take up to 9.8rem; a 320px phone's line has
                   10.6rem at 100%, a 375px phone's 9.4rem at 125%);
    under 16.5rem  the win rate takes a line of its own under the name, so the name has the text
                   column's whole width (6.25rem or more; beside a win rate it had about 6rem at
                   16.5rem);
    under 13.5rem  the place and the picture take the first line, and the name, the win rate and
                   the second line take the row's whole width under them (6.4rem at 200% on a
                   320px phone). The tie bracket steps aside, since the names run under it; the
                   "=" still says the tie.
  Names wrap only between their words there, and nothing is cut (the gap, "1 win behind", ran 32px
  past the board at 200% on a 320px phone). In your own row "You" drops under your name where your
  name's longest word would not fit beside it (MemberCell's youWraps: below 36rem, so at 100% too,
  where a 320px phone's line broke a name of 9 letters or more), and stays beside it where it fits.
  An inline "·" (the captions, the "Not enough recent games" rows) is held to the words either side
  of it by no-break spaces, so it never ends or starts a line.
*/
const FORM_COLS =
  "[--dl-cols:2rem_2.5rem_minmax(0,1fr)_auto] @max-[16.5rem]/list:[--dl-cols:2rem_2.5rem_minmax(0,1fr)] " +
  "@min-[36rem]/list:[--dl-cols:2.5rem_2rem_minmax(6.5rem,1fr)_minmax(8rem,1fr)_4rem_6.5rem] " +
  "@min-[58rem]/list:[--dl-cols:3rem_2rem_minmax(9rem,18rem)_minmax(9rem,1fr)_4rem_9.5rem_5.5rem_7rem]";
/**
 * A cell beside all of a row's lines below 58rem (two, three under 16.5rem), on its one line from
 * 58rem; on the first line, over the rest, under 13.5rem (FORM_COLS).
 */
const BESIDE_LINES = "row-[1/span_2] self-center @max-[16.5rem]/list:row-[1/span_3] @max-[13.5rem]/list:row-[1/2] @min-[58rem]/list:row-[1/2]";
/** The row's picture: 40px on a narrow board, 32px from 36rem (the compact rows; CardAvatar's own size would win over a class on its frame, so the picture inside takes it). */
const AVATAR_32 = "@min-[36rem]/list:[&>*]:size-8!";
/** A cell across the text column, the row's whole width under 13.5rem (FORM_COLS). */
const ACROSS_TEXT = "col-[3/-1] @max-[13.5rem]/list:col-[1/-1]";

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

/**
 * What the board's figures can and cannot say, behind the ⓘ in its title (they were a footnote under
 * the board): a short sample, the gaps' assumption, what a bar counts, which games count.
 */
function caveats(window: FormView["window"]): string {
  return `${window.games} games is a small sample, so places within 2 wins are close. Bars show wins first, not the order the games were played.`;
}

/**
 * Recent form's board, the page's lead card (surface-lead): its title row (what it counts, and its
 * caveats behind the ⓘ), the column headings from 36rem, the ranking, the provisional windows and the
 * members without enough recent games. `className` places it on the page; it is never wider than
 * the measure. Exported for its markup test (the states the demo cannot reach).
 */
export function RecentForm({ form, player, viewer, className }: { form: FormView; player: (id: string) => BoardPlayer; viewer: string | null; className?: string }) {
  const ranked = form.rows.filter((r) => r.status === "established");
  const provisional = form.rows.filter((r) => r.status === "provisional");
  const ties = tieRuns(ranked.map((r) => r.place));
  return (
    // At most the measure wide, at the page's left edge: one edge with the header.
    <section id={SECTIONS.form} aria-labelledby="form-board-title" className={cn("flex min-w-0 max-w-[var(--measure)] flex-col", className)} data-testid="form">
      <DataList
        surface="lead"
        columns={FORM_COLS}
        testId="form-board"
        title={
          <BoardTitle
            id="form-board-title"
            icon={<TrendingUp className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
            aside={<InfoTip label="How Recent form counts" text={caveats(form.window)} testId="form-footnote" />}
            note={`Latest ${form.window.games} games from the last ${form.window.days} days · Summoner's Rift, 5 minutes or longer`}
            noteTestId="form-scope"
          >
            Recent form<span className="sr-only">, ranked by win rate over each member&apos;s latest {form.window.games} games</span>
          </BoardTitle>
        }
        headsTestId="form-heads"
        headsClassName="hidden @min-[36rem]/list:grid"
        heads={form.rows.length ? HEADS : undefined}
      >
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
                <span className="font-semibold text-fg">Provisional</span>&nbsp;·&nbsp;{form.window.provisionalFrom} to {form.window.games - 1} recent games, listed after every full window
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
            className="[--dl-cols:2rem_2.5rem_minmax(0,1fr)] @min-[36rem]/list:flex @min-[36rem]/list:flex-wrap @min-[36rem]/list:gap-2 @min-[36rem]/list:divide-y-0 @min-[36rem]/list:px-3 @min-[36rem]/list:py-2 @min-[58rem]/list:px-4"
            caption={
              <>
                <span className="font-semibold text-fg">Not enough recent games</span>&nbsp;·&nbsp;{form.window.provisionalFrom} needed in the last {form.window.days} days
              </>
            }
          >
            {form.notEnough.map((n) => (
              <NotEnoughMember key={n.playerId} n={n} p={player(n.playerId)} you={n.playerId === viewer} />
            ))}
          </DataGroup>
        ) : null}
      </DataList>
    </section>
  );
}

/**
 * The gap to the place above, short (D5): "1 win behind", "A win ties 3rd" (the place one win would
 * share; it was "Next win: 3=", a token to decode, UD.L5), "14 of 20 games" for a provisional
 * window, "—" for first place. The sentence (FormRow.note) stays: it is read out.
 */
/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st (English ordinals; places are small whole numbers). */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export function gapToken(gap: FormRow["gap"], window: FormView["window"]): string {
  if (!gap) return "—";
  if (gap.kind === "level") return `A win ties ${ordinal(gap.place)}`;
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
      density={{ narrow: "two-line", medium: "compact", wide: "compact" }}
      lead={
        <>
          <Place place={r.place} tie={tie} crown={leader} testId="form-place" className={cn("col-[1/2]", BESIDE_LINES)} bracketClassName="@max-[13.5rem]/list:hidden" />
          <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="md" className={cn("col-[2/3] justify-self-start", AVATAR_32, BESIDE_LINES)} />
        </>
      }
      // The row's tooltip, shown anywhere on it (under the link no cell's own title shows): the tie, the gap's sentence, the role's games.
      // The public board has no link, so no row tooltip: its cells keep their own titles.
      link={
        p.profileHref ? (
          <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref} hint={[tieWords, r.note, roleTitle].filter(Boolean).join(". ")} />
        ) : null
      }
      figures={
        <>
          <QuietBar value={r.wins} segments={window.games} known={r.games} variant="row" testId="form-bar" className={cn(ACROSS_TEXT, "@min-[36rem]/list:col-[4/5] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:mr-12 @min-[36rem]/list:self-center @min-[58rem]/list:row-[1/2]")} />
          <FigureCell testId="form-win-rate" size="lg" emphasis="strong" label=" win rate" className="col-[4/5] row-[1/2] @max-[16.5rem]/list:col-[3/-1] @max-[16.5rem]/list:row-[2/3] @max-[16.5rem]/list:text-left @max-[13.5rem]/list:col-[1/-1] @max-[13.5rem]/list:row-[3/4] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:min-w-10 @min-[36rem]/list:self-center @min-[36rem]/list:justify-self-end @min-[36rem]/list:text-base @min-[58rem]/list:row-[1/2]">
            {r.winRate}%
          </FigureCell>
          {/* The second line under 36rem; from 36rem its cells are the row's own (display: contents), still in its small muted text.
              Under 36rem its parts may wrap inside (only one wider than the whole line does, with large text), so none runs past the board's edge.
              Under 17.5rem (large text), where the record and the dates may not fit one line, they take a line each and the "·"
              between them steps aside, so no line ends with one (FORM_COLS). */}
          <span data-testid="form-meta" className={cn(ACROSS_TEXT, "row-[2/3] @max-[16.5rem]/list:row-[3/4] @max-[13.5rem]/list:row-[4/5] flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs tabular-nums text-fg-muted @min-[36rem]/list:contents")}>
            <FigureCell testId="form-record" spoken={`${r.wins} wins, ${r.losses} losses`} size={null} align="start" className="@max-[17.5rem]/list:basis-full @min-[36rem]/list:col-[5/6] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:self-center @min-[36rem]/list:whitespace-nowrap @min-[36rem]/list:text-right @min-[36rem]/list:text-sm @min-[58rem]/list:row-[1/2]">
              {r.wins}W {r.losses}L
            </FigureCell>
            <span aria-hidden className="@max-[17.5rem]/list:hidden @min-[36rem]/list:hidden">
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
              r.role ? "absolute col-[2/3] -right-1 bottom-[calc(50%-1.5rem)] @min-[36rem]/list:bottom-[calc(50%-1.25rem)] @max-[13.5rem]/list:row-[1/2] grid size-4.5 place-items-center rounded-full bg-surface-3 text-fg-muted ring-2 ring-surface [&>[data-role-icon]]:size-2.5 @min-[58rem]/list:[&>[data-role-icon]]:size-3.5" : "sr-only @min-[58rem]/list:not-sr-only",
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
      <MemberCell look={p.look} name={p.name} avatar={false} you={r.you} youWraps readName={!p.profileHref} nameHref={p.profileHref ?? undefined} nameTestId="board-member-name" nameClassName="text-md leading-snug @min-[36rem]/list:text-sm" className="col-[3/4] row-[1/2] @max-[13.5rem]/list:col-[1/-1] @max-[13.5rem]/list:row-[2/3] @min-[36rem]/list:self-end @min-[58rem]/list:self-center" />
    </DataRow>
  );
}

/**
 * A member without enough recent games, in the board's last group: a row on a narrow board (the
 * place column says "–": they have none), a chip from 36rem. With their picture and name as their
 * card shows them, the games they still need and their last game, and, for members, the way to
 * their profile. Not a DataRow: as a chip it drops the row's padding and height. Under 13.5rem
 * (large text) the "–" and the picture take the first line and the rest the row's whole width under
 * them, as on the ranked rows (FORM_COLS).
 */
function NotEnoughMember({ n, p, you }: { n: FormView["notEnough"][number]; p: BoardPlayer; you: boolean }) {
  return (
    <li
      data-testid="form-not-enough-member"
      data-player-id={n.playerId}
      className={cn(
        "relative isolate grid grid-cols-(--dl-cols) items-center gap-x-2.5 min-h-16 px-3 py-2",
        // The chip's edge is an inset ring, not a border, so the overlay link covers the whole chip: 40px, 44px on touch screens.
        "@min-[36rem]/list:flex @min-[36rem]/list:min-h-8 @min-[36rem]/list:gap-x-2 @min-[36rem]/list:overflow-clip @min-[36rem]/list:rounded-lg @min-[36rem]/list:ring-1 @min-[36rem]/list:ring-inset @min-[36rem]/list:ring-border @min-[36rem]/list:py-0.5 @min-[36rem]/list:pl-1 @min-[36rem]/list:pr-3 pointer-coarse:@min-[36rem]/list:min-h-11",
        you && "bg-accent/5",
        p.profileHref ? ROW_STATES : null,
      )}
    >
      {you ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
      <span aria-hidden className="justify-self-end pr-1 text-sm font-bold text-fg-subtle @min-[36rem]/list:hidden">
        –
      </span>
      {/* In the ranked rows' picture column, so the names make one edge down the board. */}
      <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" className="justify-self-center @min-[36rem]/list:[&>*]:size-6!" />
      {/* Not prefetched: these names linked nowhere before, so they add no server render (Vercel Active CPU). */}
      {p.profileHref ? (
        <PeekRowLink playerId={p.id} name={p.name} profileHref={p.profileHref} />
      ) : null}
      <span className="flex min-w-0 flex-col @max-[13.5rem]/list:col-[1/-1] @max-[13.5rem]/list:row-[2/3] @max-[13.5rem]/list:mt-0.5 @min-[36rem]/list:flex-row @min-[36rem]/list:flex-wrap @min-[36rem]/list:items-baseline @min-[36rem]/list:gap-x-2">
        <MemberCell look={p.look} name={p.name} avatar={false} you={you} youWraps readName={!p.profileHref} nameHref={p.profileHref ?? undefined} nameClassName="text-md leading-snug @min-[36rem]/list:text-sm" />
        {/* The "·" between the games needed and the last game held to both by no-break spaces (FORM_COLS): with large text it ended or started a line.
            On a 36–58rem board (the desktop's column beside the records at 1280 and 1440) the last game is read out, not drawn, so two
            chips share a line (each took one there, 40px of the one-screen board); the member's Peek shows their games. */}
        <span className="text-xs text-fg-muted">
          Needs {n.needed} more game{n.needed === 1 ? "" : "s"}
          <span className="@min-[36rem]/list:@max-[58rem]/list:sr-only" data-testid="form-not-enough-last">
            <span aria-hidden>&nbsp;·&nbsp;</span>
            <span className="sr-only">, </span>
            {n.lastGame ? `last game ${n.lastGame}` : "no games yet"}
          </span>
        </span>
      </span>
    </li>
  );
}
