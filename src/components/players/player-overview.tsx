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
*/

/** A headline figure: its label, the number at the size of the page's main figures, its context. */
function Headline({ label, value, sub, info, tone = "plain", testId, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; tone?: WinRateTone; testId: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3 @min-[34rem]/perf:px-5 @min-[34rem]/perf:py-4" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        <span className="min-w-0 truncate leading-tight">{label}</span> {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums @min-[34rem]/perf:text-figure", TONE_CLASS[tone])} data-testid={`${testId}-value`}>
        {value}
      </div>
      {children}
      {sub ? <div className="mt-1.5 truncate text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

/** A supporting figure: the same reading as a headline one, a size smaller, its context beside it where there is room. */
function Supporting({ label, value, sub, info, muted, testId }: { label: string; value: React.ReactNode; sub?: string; info?: string; muted?: boolean; testId: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5 @min-[34rem]/perf:px-5" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs text-fg-muted">
        <span className="min-w-0 truncate leading-tight">{label}</span> {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <span className={cn("text-lg font-semibold leading-tight tabular-nums", muted ? "text-fg-subtle" : "text-fg")} data-testid={`${testId}-value`}>
          {value}
        </span>
        {sub ? <span className="hidden min-w-0 truncate text-xs text-fg-subtle @min-[44rem]/perf:inline">{sub}</span> : null}
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

/** How often a multikill came, over the games that have counts: "1 every 8 games". */
function multikillRate(count: number, counted: number): string {
  if (count === 0) return "None yet";
  const every = Math.max(1, Math.round(counted / count));
  return every === 1 ? `${count >= counted ? "Every game" : "About every game"}` : `1 every ${formatCount(every)} games`;
}

/** One count in the kills row: its label, the number, how often (or its context). */
function KillCount({ label, value, sub, muted, testId, className }: { label: string; value: React.ReactNode; sub: string; muted?: boolean; testId: string; className?: string }) {
  return (
    <div className={cn("min-w-0 px-3 py-2.5", className)} data-testid={testId}>
      <div className="truncate text-xs text-fg-muted">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold leading-tight tabular-nums", muted ? "text-fg-subtle" : "text-fg")} data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="truncate text-2xs text-fg-subtle" title={sub}>
        {sub}
      </div>
    </div>
  );
}

/**
 * The kills band: Total kills, then the four multikill kinds, every count in the same colour, size
 * and weight (no kind is highlighted for being rare), with no visible heading of its own since each
 * count names itself (screen readers get one). Total kills adds up each game's own kill count over
 * the same games as the figures above; the multikills add up Riot's counts. Whether every game has
 * its counts is the page's status, beside the scope line under the title, never a mark here. A
 * count no game has yet is a dash, never 0. The champions behind them are one quiet link away, at
 * the row's end. Phones: Total kills across the top, then two by two.
 */
function KillsBand({ perf, m, byChampionHref }: { perf: PerformanceSummary; m: MultikillSummary; byChampionHref: string }) {
  const unknown = m.counted === 0;
  const partial = !unknown && m.counted < m.games;
  const killsPartial = perf.totalKills !== null && perf.detailedGames < perf.games;
  // What screen readers hear with the heading: which counts come from only some of the games.
  const notes = [killsPartial ? `kills counted in ${formatCount(perf.detailedGames)} of ${formatCount(perf.games)} games` : null, partial ? `multikills counted in ${formatCount(m.counted)} of ${formatCount(m.games)} games` : null].filter(Boolean);
  const kinds: Record<keyof MultikillCounts, string> = { double: "Double kills", triple: "Triple kills", quadra: "Quadra kills", penta: "Pentakills" };
  const notYet = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">not counted yet</span>
    </>
  );
  return (
    <section aria-labelledby="multikills-heading" className="border-t border-border/70" data-testid="multikills" data-coverage={unknown ? "none" : partial ? "partial" : "complete"}>
      <h3 id="multikills-heading" className="sr-only">
        Kills and multikills{notes.length ? ` (${notes.join("; ")})` : ""}
      </h3>
      <div className="grid grid-cols-2 @min-[34rem]/perf:grid-cols-5 @min-[48rem]/perf:grid-cols-[repeat(5,minmax(0,1fr))_auto]" data-testid="multikill-tiles">
        <KillCount label="Total kills" value={perf.totalKills === null ? notYet : formatCount(perf.totalKills)} muted={perf.totalKills === null} sub={perf.totalKills === null ? "Not counted yet" : `${fmt.one(perf.kills)} a game`} testId="stat-total-kills" className="col-span-2 @min-[34rem]/perf:col-span-1" />
        {MULTIKILL_KINDS.map((k) => (
          <KillCount key={k.key} label={kinds[k.key]} value={unknown ? notYet : formatCount(m[k.key])} muted={unknown} sub={unknown ? "Not counted yet" : multikillRate(m[k.key], m.counted)} testId={`multikill-${k.key}`} className="@min-[34rem]/perf:border-l @min-[34rem]/perf:border-border/60" />
        ))}
        <p className="col-span-2 flex items-center justify-end px-3 pb-2 @min-[34rem]/perf:col-span-5 @min-[34rem]/perf:-mt-1 @min-[48rem]/perf:col-span-1 @min-[48rem]/perf:mt-0 @min-[48rem]/perf:pb-0 @min-[48rem]/perf:pl-1 @min-[48rem]/perf:pr-4">
          {/* A small link with a finger-sized area on touch screens that takes no room of its own. */}
          <Link href={byChampionHref} className="relative inline-flex min-h-6 items-center gap-0.5 whitespace-nowrap rounded-md text-xs font-medium text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:-left-3 pointer-coarse:after:right-0 pointer-coarse:after:content-['']" aria-label="Multikills by champion, in All Champions" data-testid="multikills-by-champion">
            By champion <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
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
      <div className="grid grid-cols-3 divide-x divide-border/60" data-testid="season-headline">
        <Headline label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={winRateTone(rec.winRate, rec.games, WIN_RATE_MIN_GAMES.season)} testId="stat-winrate">
          <RecordBar wins={rec.wins} losses={rec.losses} />
        </Headline>
        <Headline label="KDA" value={fmt.kda(perf)} sub={kda} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : "plain"} testId="stat-kda" />
        <Headline label="Games" value={<span data-testid="season-record">{rec.games ? fmt.int(rec.games) : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? "plain" : "muted"} testId="stat-games" />
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/70 bg-bg/25" data-testid="season-supporting">
        <Supporting label="CS/min" value={fmt.csm(perf)} sub={rec.games ? "minions + monsters" : undefined} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." muted={perf.csPerMinute === null} testId="stat-cs" />
        <Supporting label="Damage/min" value={fmt.int(perf.damagePerMinute)} sub={rec.games ? "to champions" : undefined} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." muted={perf.damagePerMinute === null} testId="stat-damage" />
        <Supporting label="Vision score" value={fmt.int(perf.visionPerGame)} sub={rec.games ? "per game" : undefined} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." muted={perf.visionPerGame === null} testId="stat-vision" />
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
  the season's card, recent form and the pools). Its own width decides the arrangement (a
  container query, so the sidebar is allowed for):
    wide (58rem+)  the season's card and recent form side by side, level; under them ranked
                   progress across the whole width (a year on one time axis needs it), then the
                   champion pools across the whole width;
    narrower       one column in that same order.
  A card without data is left out (fewer than five games: no recent form; no linked account: no
  ranked progress), and the others close up: nothing is padded out to keep a shape.
*/
function OverviewDashboard({ perf, form, ranked, pools }: { perf: React.ReactNode; form?: React.ReactNode; ranked?: React.ReactNode; pools?: React.ReactNode }) {
  const wide = form ? "@min-[58rem]/ov:col-span-2" : undefined;
  return (
    <div className="@container/ov" data-testid="overview-dashboard">
      <div className={cn("grid grid-cols-[minmax(0,1fr)] items-start gap-3 sm:gap-4", form && "@min-[58rem]/ov:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]")}>
        <div className="min-w-0 self-stretch">{perf}</div>
        {form ? (
          <div className="min-w-0 self-stretch" data-testid="overview-form">
            {form}
          </div>
        ) : null}
        {ranked ? (
          <div className={cn("min-w-0", wide)} data-testid="overview-ranked">
            {ranked}
          </div>
        ) : null}
        {pools ? <div className={cn("min-w-0", wide)}>{pools}</div> : null}
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
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh} /> : null}
        controls={<OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} modeCounts={data.modes.counts} refineScope={REFINE_SCOPE} />}
      />
      <OverviewDashboard perf={<PerformanceCard data={data} basePath={basePath} />} form={form} ranked={ranked} pools={pools} />
    </div>
  );
}
