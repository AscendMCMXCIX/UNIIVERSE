import * as React from "react";
import type { PlayerOverviewData } from "@/server/players/overview";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo, statsQuery } from "@/domain/season-stats";
import type { StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS } from "@/domain/roles";
import Link from "next/link";
import type { PortraitChampion } from "@/components/champion-portrait";
import { ChevronRight } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { WIN_RATE_MIN_GAMES, winRateTone, type WinRateTone } from "@/domain/stats/win-rate";
import { MULTIKILL_KINDS, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";
import type { DataStatus } from "@/domain/data-status";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";

/** A season win rate is coloured only on enough games (see domain/stats/win-rate). */
const TONE_CLASS: Record<WinRateTone, string> = { good: "text-good", plain: "text-fg", muted: "text-fg-subtle" };

export const fmt = {
  kda: (p: PerformanceSummary) => (p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)),
  int: (v: number | null) => (v === null ? "—" : formatCount(v)),
  one: (v: number | null) => (v === null ? "—" : v.toFixed(1)),
  /** CS per minute, one decimal. */
  csm: (p: PerformanceSummary) => (p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)),
};

/*
  Season performance as one card in three bands, read in order of importance:
    headline    win rate, KDA and games: the largest figures on the page;
    supporting  CS/min, damage/min and vision: the same reading, a size smaller;
    kills       total kills and the four multikill kinds in one row, all alike.
  Each figure reads label, number, context (the quietest grey). Colour only where it says
  something: a season win rate with enough games, and the record bar's wins and losses. The card's
  own width decides the layout (a container query), so the open or folded sidebar is allowed for.
  Larger text makes the card narrower in rem (17.9rem on a 320px phone at 100%, 13.9rem at 125%,
  11.25rem at 150%, 7.9rem at 200%), and a third of it no longer held a cell's widest word: the
  games' "champions" ran 21px past the card at 150% on a 320px phone (63px at 200%), the win rate
  ran over the line beside it and "Damage/" under its ⓘ. So under 17.5rem each band goes two across
  (a third of the card holds "By champion" with its arrow, and "Damage/" with its ⓘ, from 17.34rem),
  its third figure across both columns (games, vision); and under 11.75rem one across, each figure
  a row from 9rem: its label (and context) at the left, the number at the right, so six figures
  take three quarters of the height they took stacked (913px on a 320px phone at 150%: UM.PO1);
  stacked under 9rem (200% text), where a number beside the label would push it under its ⓘ.
  Nothing changes at 100% text.
*/

/** One across (9 to 11.75rem of card): a figure's cell as a row, the number at its right across its lines. */
const ROW_CELL = "@min-[9rem]/perf:@max-[11.75rem]/perf:grid @min-[9rem]/perf:@max-[11.75rem]/perf:grid-cols-[minmax(0,1fr)_auto] @min-[9rem]/perf:@max-[11.75rem]/perf:items-center @min-[9rem]/perf:@max-[11.75rem]/perf:gap-x-3";
const ROW_VALUE = "@min-[9rem]/perf:@max-[11.75rem]/perf:col-start-2 @min-[9rem]/perf:@max-[11.75rem]/perf:row-span-3 @min-[9rem]/perf:@max-[11.75rem]/perf:row-start-1 @min-[9rem]/perf:@max-[11.75rem]/perf:mt-0";

/** A band's columns (see above): three, two under 17.5rem of card, one under 11.75rem. */
const BAND_COLUMNS = "@max-[17.5rem]/perf:grid-cols-2 @max-[11.75rem]/perf:grid-cols-1";
/** A three-figure band's first figure: no line after it where the band is one across. */
const BAND_FIRST = "@max-[11.75rem]/perf:border-e-0";
/** Its second: at the band's right edge two across (no line there), under the first one across. */
const BAND_SECOND = "@max-[17.5rem]/perf:border-e-0 @max-[11.75rem]/perf:border-t";
/** Its third: across the band, under the first two, wherever the band is narrower than three. */
const BAND_THIRD = "@max-[17.5rem]/perf:col-span-full @max-[17.5rem]/perf:border-t @max-[17.5rem]/perf:border-border/60";

/**
 * A figure's label with a line break allowed after each "/" ("Damage/min" wraps as "Damage/" "min"
 * in a narrow cell rather than running under its ⓘ, with no extra height for the band): a <wbr>,
 * so nothing is added to the text, copied or read out. Never overflow-wrap:anywhere, which breaks
 * inside the word ("Damage/mi" "n"). The ⓘ is named from the label as written.
 */
function breakable(label: string): React.ReactNode {
  const parts = label.split("/");
  return parts.map((part, i) =>
    i < parts.length - 1 ? (
      <React.Fragment key={i}>
        {part}/<wbr />
      </React.Fragment>
    ) : (
      part
    ),
  );
}

/**
 * The ⓘ after a figure's label hangs into the cell's padding by its last 8px (`-mr-2`): its 16px
 * mark keeps its place beside the label, and the label gets that room. On a 320px phone "Damage/"
 * needs about 51px and had 50 (it ran 1px into its ⓘ, which newer Chromium builds round to 2px);
 * it now has about 54. Where the label is short, the row ends after the ⓘ and nothing moves.
 */
const LABEL_TIP = "-mr-2";

/** A headline figure: its label, the number at the size of the page's main figures, its context. */
function Headline({ label, value, sub, info, tone = "plain", testId, className, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; tone?: WinRateTone; testId: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 px-3 py-3 @min-[34rem]/perf:px-5 @min-[34rem]/perf:py-4", ROW_CELL, className)} data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        <span className="min-w-0 leading-tight">{breakable(label)}</span> {info ? <InfoTip text={info} label={`About ${label}`} className={LABEL_TIP} /> : null}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums @min-[34rem]/perf:text-figure", ROW_VALUE, TONE_CLASS[tone])} data-testid={`${testId}-value`}>
        {value}
      </div>
      {children}
      {/* Its context wraps rather than ends cut short ("4.0 / 4.0 / 4.0" on a 320px phone's third of the card). */}
      {sub ? <div className="mt-1.5 text-xs leading-snug text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

/** A supporting figure: the same reading as a headline one, a size smaller, its context beside it where there is room. */
function Supporting({ label, value, sub, info, muted, testId, className }: { label: string; value: React.ReactNode; sub?: string; info?: string; muted?: boolean; testId: string; className?: string }) {
  return (
    <div className={cn("min-w-0 px-3 py-2.5 @min-[34rem]/perf:px-5", ROW_CELL, className)} data-testid={testId}>
      <div className="flex items-center gap-1 text-xs text-fg-muted">
        <span className="min-w-0 leading-tight">{breakable(label)}</span> {info ? <InfoTip text={info} label={`About ${label}`} className={LABEL_TIP} /> : null}
      </div>
      <div className={cn("mt-1 flex min-w-0 items-baseline gap-2", ROW_VALUE)}>
        <span className={cn("text-lg font-semibold leading-tight tabular-nums", muted ? "text-fg-subtle" : "text-fg")} data-testid={`${testId}-value`}>
          {value}
        </span>
        {sub ? <span className="hidden min-w-0 truncate text-xs text-fg-subtle @min-[40rem]/perf:inline">{sub}</span> : null}
      </div>
    </div>
  );
}

/** Wins and losses as one bar (blue and red, the colours of a game's result); the numbers under it say the same in words. */
function RecordBar({ wins, losses }: { wins: number; losses: number }) {
  const games = wins + losses;
  if (!games) return null;
  return (
    <span className="mt-2.5 flex h-1.5 w-full max-w-[10rem] gap-px overflow-hidden rounded-full bg-surface-3" aria-hidden data-testid="season-record-bar">
      {wins ? <span className="h-full bg-blue" style={{ width: `${(wins / games) * 100}%` }} /> : null}
      {losses ? <span className="h-full flex-1 bg-red/85" /> : null}
    </span>
  );
}

/**
 * The kills band as one line under the season's figures: total kills, then the four multikill kinds
 * ("Kills 312 · Double 19 · Triple 3 · Quadra 1 · Penta 0"), every count in the same colour and
 * weight (no kind is highlighted for being rare), and the champions behind them one quiet link away
 * at the line's end. It was a band of five tiles with how often each came (three by two on a phone,
 * about 150px); the line is one row (two on the narrowest phones and at large text, where it wraps
 * between counts, never inside one). Total kills adds up each game's own kill count over the same
 * games as the figures above; the multikills add up Riot's counts. Whether every game has its counts
 * is the page's status, never a mark here. A count no game has yet is a dash, never 0. Screen
 * readers get a heading, with which counts come from only some of the games.
 */
function KillsBand({ perf, m, byChampionHref }: { perf: PerformanceSummary; m: MultikillSummary; byChampionHref: string }) {
  const unknown = m.counted === 0;
  const partial = !unknown && m.counted < m.games;
  const killsPartial = perf.totalKills !== null && perf.detailedGames < perf.games;
  // What screen readers hear with the heading: which counts come from only some of the games.
  const notes = [killsPartial ? `kills counted in ${formatCount(perf.detailedGames)} of ${formatCount(perf.games)} games` : null, partial ? `multikills counted in ${formatCount(m.counted)} of ${formatCount(m.games)} games` : null].filter(Boolean);
  const kinds: Record<keyof MultikillCounts, string> = { double: "Double", triple: "Triple", quadra: "Quadra", penta: "Penta" };
  const spoken: Record<keyof MultikillCounts, string> = { double: "Double kills", triple: "Triple kills", quadra: "Quadra kills", penta: "Pentakills" };
  const notYet = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">not counted yet</span>
    </>
  );
  const counts: { key: string; label: string; spoken: string; value: React.ReactNode; muted: boolean; testId: string }[] = [
    { key: "kills", label: "Kills", spoken: "Total kills", value: perf.totalKills === null ? notYet : formatCount(perf.totalKills), muted: perf.totalKills === null, testId: "stat-total-kills" },
    ...MULTIKILL_KINDS.map((k) => ({ key: k.key, label: kinds[k.key], spoken: spoken[k.key], value: unknown ? notYet : formatCount(m[k.key]), muted: unknown, testId: `multikill-${k.key}` })),
  ];
  return (
    <section aria-labelledby="multikills-heading" className="border-t border-border/70" data-testid="multikills" data-coverage={unknown ? "none" : partial ? "partial" : "complete"}>
      <h3 id="multikills-heading" className="sr-only">
        Kills and multikills{notes.length ? ` (${notes.join("; ")})` : ""}
      </h3>
      <div className="flex items-center gap-x-2 px-3 py-2 @min-[34rem]/perf:px-5" data-testid="multikill-tiles">
        <dl className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
          {counts.map((c, i) => (
            <div key={c.key} className="flex min-w-0 flex-wrap items-baseline gap-x-1" data-testid={c.testId}>
              <dt className="text-xs text-fg-muted">
                <span aria-hidden>{c.label}</span>
                <span className="sr-only">{c.spoken}</span>
              </dt>
              <dd className={cn("font-semibold tabular-nums", c.muted ? "text-fg-subtle" : "text-fg")}>
                <span data-testid={`${c.testId}-value`}>{c.value}</span>
                {/* The separator ends a line where the line wraps, never starts the next. */}
                {i < counts.length - 1 ? (
                  <span aria-hidden className="ms-1.5 font-normal text-fg-subtle">
                    ·
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        {/* A small link; on touch screens a 44px target (as wide as a finger, the area above and below the line). */}
        <Link href={byChampionHref} className="touch-target ms-auto inline-flex min-h-6 items-center justify-end gap-0.5 whitespace-nowrap rounded-md text-xs font-medium text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-w-11" aria-label="Multikills by champion, in All Champions" data-testid="multikills-by-champion">
          {/* The words from 34rem of card; on a phone the chevron alone, so the counts keep one line. */}
          <span className="@max-[34rem]/perf:sr-only">By champion</span> <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** The season's figures as one card (see above), labelled by Season performance's heading. */
function PerformanceCard({ data, basePath }: { data: PlayerOverviewData; basePath: string }) {
  const rec = data.summary.record;
  const perf = data.summary.performance;
  const kda = perf.detailedGames ? (
    <>
      {fmt.one(perf.kills)} / {fmt.one(perf.deaths)} / {fmt.one(perf.assists)}
      <span className="@max-[34rem]/perf:hidden"> per game</span>
      {perf.perfectKda ? " · no deaths" : ""}
    </>
  ) : rec.games ? (
    "details not collected yet"
  ) : undefined;
  return (
    <section aria-labelledby="season-stats" className="@container/perf relative h-full overflow-hidden rounded-card border border-border bg-surface panel-featured" data-testid="season-figures">
      {/* The brand's line along the top edge (panel-featured adds a faint wash of its light in the corner): the card the page leads with. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/80 via-accent-2/60 to-transparent" />
      <div className={cn("grid grid-cols-3 divide-x divide-border/60", BAND_COLUMNS)} data-testid="season-headline">
        <Headline label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={winRateTone(rec.winRate, rec.games, WIN_RATE_MIN_GAMES.season)} testId="stat-winrate" className={BAND_FIRST}>
          <RecordBar wins={rec.wins} losses={rec.losses} />
        </Headline>
        <Headline label="KDA" value={fmt.kda(perf)} sub={kda} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : "plain"} testId="stat-kda" className={BAND_SECOND} />
        <Headline label="Games" value={<span data-testid="season-record">{rec.games ? fmt.int(rec.games) : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? "plain" : "muted"} testId="stat-games" className={BAND_THIRD} />
      </div>
      <div className={cn("grid grid-cols-3 divide-x divide-border/60 border-t border-border/70 bg-bg/25", BAND_COLUMNS)} data-testid="season-supporting">
        <Supporting label="CS/min" value={fmt.csm(perf)} sub={rec.games ? "minions + monsters" : undefined} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." muted={perf.csPerMinute === null} testId="stat-cs" className={BAND_FIRST} />
        <Supporting label="Damage/min" value={fmt.int(perf.damagePerMinute)} sub={rec.games ? "to champions" : undefined} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." muted={perf.damagePerMinute === null} testId="stat-damage" className={BAND_SECOND} />
        <Supporting label="Vision score" value={fmt.int(perf.visionPerGame)} sub={rec.games ? "per game" : undefined} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." muted={perf.visionPerGame === null} testId="stat-vision" className={BAND_THIRD} />
      </div>
      {/* The kills over the same games; per champion in All Champions (same filters, sorted by multikills). */}
      {rec.games > 0 ? <KillsBand perf={perf} m={data.summary.multikills} byChampionHref={`${basePath}/champions?${statsQuery({ season: data.filter.season, mode: data.filter.mode, role: data.filter.role, accountId: data.filter.accountId }, { sort: "multikills" })}`} /> : null}
      {rec.games === 0 && data.filter.mode !== "all" && data.modes.elsewhere.length ? (
        <div className="border-t border-border/70 px-3 pb-3 @min-[34rem]/perf:px-5">
          <ModeElsewhere basePath={basePath} filter={data.filter} elsewhere={data.modes.elsewhere} />
        </div>
      ) : null}
    </section>
  );
}

/*
  The Overview's dashboard, under Season performance's heading (whose filters and Refresh govern
  the season's card, recent form and the pools). The window and the dashboard's own width decide
  the arrangement (a container query, so the sidebar is allowed for):
    2×2 (a window 1440px or wider, and a dashboard of 68rem or more: 1440 with the sidebar open and
                   wider; the owner's choice of 8 Nov 2026, never forced onto smaller screens)
                   the season's card and recent form side by side, level; under them the champion
                   pools beside ranked progress, each at the top of its cell, in a rail of 40% of
                   the dashboard within 20–30rem: 28rem at 1440 with the sidebar open, 30rem wider
                   (the floor never applies, the 2×2 needing 68rem), where ranked progress draws
                   its chart in full. Without recent form, ranked progress takes the whole rail
                   beside the season's card and the pools; without ranked progress, the pools span
                   the width as below;
    wide (58rem+)  the season's card and recent form side by side, level; under them ranked
                   progress across the whole width (a year on one time axis needs it), then the
                   champion pools across the whole width;
    narrower       one column in that same order.
  The markup's order (a phone's, and a screen reader's) is always season, form, ranked, pools.
  A card without data is left out (fewer than five games: no recent form; no linked account: no
  ranked progress), and the others close up: nothing is padded out to keep a shape.
*/
const GRID_2X2 = "min-[90rem]:@min-[68rem]/ov:grid-cols-[minmax(0,1fr)_clamp(20rem,40%,30rem)]";
function OverviewDashboard({ perf, form, ranked, pools }: { perf: React.ReactNode; form?: React.ReactNode; ranked?: React.ReactNode; pools?: React.ReactNode }) {
  const wide = form ? "@min-[58rem]/ov:col-span-2" : undefined;
  // 2×2: only with ranked progress (else the 58rem arrangement stays); the pools go under the
  // season's card, ranked progress into the rail (under recent form, or its whole height without it).
  // The classes are written out whole, for Tailwind to find them.
  const two = !!ranked;
  return (
    <div className="@container/ov" data-testid="overview-dashboard">
      {/* In the 2×2 the rail (recent form, then ranked progress straight under it) spans both rows:
          recent form ends at its content (UD.PO2) and ranked progress follows it, whatever the
          season card's height; the second row takes whatever height the rail has beyond that card,
          so the card never stretches and the pools stay put. Elsewhere the rail's box is
          display:contents, so its cards are the grid's own items. */}
      <div className={cn("grid grid-cols-[minmax(0,1fr)] items-start gap-3 sm:gap-4", form && "@min-[58rem]/ov:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]", two && GRID_2X2, two && "min-[90rem]:@min-[68rem]/ov:grid-rows-[auto_1fr]")}>
        <div className={cn("min-w-0 self-stretch", two && "min-[90rem]:@min-[68rem]/ov:col-start-1 min-[90rem]:@min-[68rem]/ov:row-start-1 min-[90rem]:@min-[68rem]/ov:self-start")}>{perf}</div>
        <div className={cn("contents", two && "min-[90rem]:@min-[68rem]/ov:col-start-2 min-[90rem]:@min-[68rem]/ov:row-span-2 min-[90rem]:@min-[68rem]/ov:row-start-1 min-[90rem]:@min-[68rem]/ov:flex min-[90rem]:@min-[68rem]/ov:min-w-0 min-[90rem]:@min-[68rem]/ov:flex-col min-[90rem]:@min-[68rem]/ov:gap-4 min-[90rem]:@min-[68rem]/ov:self-start")}>
          {form ? (
            <div className="min-w-0 self-start min-[90rem]:@min-[68rem]/ov:self-auto" data-testid="overview-form">
              {form}
            </div>
          ) : null}
          {ranked ? (
            <div className={cn("min-w-0", wide)} data-testid="overview-ranked">
              {ranked}
            </div>
          ) : null}
        </div>
        {pools ? <div className={cn("min-w-0", wide, two && "min-[90rem]:@min-[68rem]/ov:col-span-1 min-[90rem]:@min-[68rem]/ov:col-start-1 min-[90rem]:@min-[68rem]/ov:row-start-2 min-[90rem]:@min-[68rem]/ov:self-start")} data-testid="overview-pools">{pools}</div> : null}
      </div>
    </div>
  );
}

/** Which games the figures count, in words: "All champions · All accounts · Season 2026 · All supported games". */
export function scopeLabel(data: PlayerOverviewData, nameOf: (id: string) => string): string {
  const f: StatsFilter = data.filter;
  return [
    f.scope === "champion" && f.championId ? nameOf(f.championId) : f.scope === "pool" ? (f.role ? `Configured ${ROLE_LABELS[f.role]} champions` : "Configured champions") : "All champions",
    f.role ? `played ${ROLE_LABELS[f.role]}` : "all roles",
    f.accountId ? (data.accountOptions.find((a) => a.id === f.accountId)?.riotId ?? "one account") : data.accounts.length > 1 ? `all ${data.accounts.length} accounts` : data.accounts.length === 1 ? "linked account" : null,
    seasonLabel(data.season),
    seasonModeInfo(data.mode).label,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The refinements in effect (role played, champions, account) in words, or null when there are
 * none: "Top · Rakan · Name#TAG". Recent form shows it, since the same filters narrow it.
 */
export function refinementLabel(data: PlayerOverviewData, nameOf: (id: string) => string): string | null {
  const f: StatsFilter = data.filter;
  const parts = [
    f.role ? ROLE_LABELS[f.role] : null,
    f.scope === "champion" && f.championId ? nameOf(f.championId) : f.scope === "pool" ? "Configured pool" : null,
    f.accountId ? (data.accountOptions.find((a) => a.id === f.accountId)?.riotId ?? "One account") : null,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ") : null;
}

/** What the Refine filters narrow on Overview (ranked progress and the champion pools keep their own scope). */
export const REFINE_SCOPE = "Applies to Season performance, its multikills and Recent form.";

/**
 * Season performance: the heading (what the figures count, with the page's data status beside it,
 * and the toolbar: the filters, then Refresh) over the Overview's dashboard (OverviewDashboard): the
 * season's card, recent form, ranked progress and the champion pools, which the same filters narrow
 * where they apply. By default it counts every champion, every linked account and every supported
 * mode this season. How complete the figures are is in the status, not in a banner.
 */
export function SeasonSummary({ data, basePath, championsById, status, refresh, form, ranked, pools }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null; /** Recent form's card, when there are enough games. */ form?: React.ReactNode; /** Ranked progress's card, when an account is linked. */ ranked?: React.ReactNode; /** The roles and champion pools. */ pools?: React.ReactNode }) {
  const nameOf = (id: string) => championsById[id]?.name ?? id;
  const champions = data.championOptions.map((c) => ({ id: c.id, name: nameOf(c.id), games: c.games, portraitUrl: championsById[c.id]?.portraitUrl }));
  return (
    <div className="space-y-3" data-testid="season-summary">
      {/* The profile's one heading layout (as All Champions and Match History). */}
      <SectionHeader
        id="season-stats"
        title="Season performance"
        description={
          <p className="text-sm text-fg-muted" data-testid="stats-population">
            {scopeLabel(data, nameOf)}
          </p>
        }
        statusAfterText
        toolbarBesideScope
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh} /> : null}
        controls={<OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} modeCounts={data.modes.counts} refineScope={REFINE_SCOPE} />}
      />
      <OverviewDashboard perf={<PerformanceCard data={data} basePath={basePath} />} form={form} ranked={ranked} pools={pools} />
    </div>
  );
}
