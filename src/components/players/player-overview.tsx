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
import { DataRefresh, type DataStatusRefresh } from "@/components/ui/data-status";

/** A season win rate is highlighted only on enough games (see domain/stats/win-rate). */
const HERO_TONE: Record<WinRateTone, "good" | "muted" | undefined> = { good: "good", plain: undefined, muted: "muted" };

export const fmt = {
  kda: (p: PerformanceSummary) => (p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)),
  int: (v: number | null) => (v === null ? "—" : formatCount(v)),
  one: (v: number | null) => (v === null ? "—" : v.toFixed(1)),
  /** CS per minute, one decimal. */
  csm: (p: PerformanceSummary) => (p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)),
};

/** One figure as a card: its name, the number, and a short line of context. */
function HeroFigure({ label, value, sub, info, tone, testId, className, valueClassName }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; tone?: "good" | "muted"; testId?: string; className?: string; valueClassName?: string }) {
  return (
    <div className={cn("min-w-0 rounded-card border border-border bg-surface px-3 py-2.5 sm:px-4", className)} data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        <span className="min-w-0 leading-tight">{label}</span> {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums leading-tight tracking-tight sm:text-figure", tone === "good" ? "text-good" : tone === "muted" ? "text-fg-muted" : "text-fg", valueClassName)} data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

/** How often a multikill came, over the games that have counts: "1 every 8 games". */
function multikillRate(count: number, counted: number): string {
  if (count === 0) return "None yet";
  const every = Math.max(1, Math.round(counted / count));
  return every === 1 ? `${count >= counted ? "Every game" : "About every game"}` : `1 every ${formatCount(every)} games`;
}

/**
 * The four multikill kinds as cards like the season's other figures, straight under them: every
 * count in the same colour, size and weight (no kind is highlighted for being rare), and no
 * heading of their own, since each card names its kind (the heading is for screen readers). They
 * add up Riot's counts over the same games as the figures above; whether every game has counts is
 * the page's status, one ⓘ beside Refresh (components/ui/data-status.tsx), never a mark on a card.
 * A count no game has yet is a dash, never 0. The champions behind them are one quiet link away.
 */
function MultikillCards({ m, byChampionHref }: { m: MultikillSummary; byChampionHref: string }) {
  const unknown = m.counted === 0;
  const partial = !unknown && m.counted < m.games;
  const kinds: Record<keyof MultikillCounts, string> = { double: "Double kills", triple: "Triple kills", quadra: "Quadra kills", penta: "Pentakills" };
  return (
    <section aria-labelledby="multikills-heading" data-testid="multikills" data-coverage={unknown ? "none" : partial ? "partial" : "complete"}>
      <h3 id="multikills-heading" className="sr-only">
        Multikills{partial ? `, counted in ${formatCount(m.counted)} of ${formatCount(m.games)} games` : ""}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" data-testid="multikill-tiles">
        {MULTIKILL_KINDS.map((k) => (
          <HeroFigure
            key={k.key}
            label={kinds[k.key]}
            value={
              unknown ? (
                <>
                  <span aria-hidden>—</span>
                  <span className="sr-only">not counted yet</span>
                </>
              ) : (
                formatCount(m[k.key])
              )
            }
            tone={unknown ? "muted" : undefined}
            sub={unknown ? "Not counted yet" : multikillRate(m[k.key], m.counted)}
            testId={`multikill-${k.key}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-end">
        {/* A small link with a finger-sized area on touch screens that takes no room of its own (it
            grows up, down and inwards, never past the cards' right edge). */}
        <Link href={byChampionHref} className="relative inline-flex min-h-6 items-center gap-0.5 rounded-md text-xs font-medium text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:-left-3 pointer-coarse:after:right-0 pointer-coarse:after:content-['']" aria-label="Multikills by champion, in All Champions" data-testid="multikills-by-champion">
          By champion <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
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
 * Season performance, most important first: win rate, games, KDA, CS/min, damage/min and vision
 * side by side; then the champions behind the numbers. By default it counts every champion, every
 * linked account and every supported mode this season; the filters narrow it down and the line
 * under the title always says exactly which games are counted. Under that line, Refresh (the
 * player's and an admin's; a real read from Riot) with the page's data status one ⓘ beside it:
 * how complete the figures are is there, not in a banner above the section.
 */
export function SeasonSummary({ data, basePath, championsById, status, refresh }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts. */ refresh?: DataStatusRefresh | null }) {
  const nameOf = (id: string) => championsById[id]?.name ?? id;
  const rec = data.summary.record;
  const perf = data.summary.performance;
  const kdaSub = perf.detailedGames ? `${fmt.one(perf.kills)} / ${fmt.one(perf.deaths)} / ${fmt.one(perf.assists)} per game${perf.perfectKda ? " · no deaths" : ""}` : rec.games ? "details not collected yet" : undefined;
  const champions = data.championOptions.map((c) => ({ id: c.id, name: nameOf(c.id), games: c.games, portraitUrl: championsById[c.id]?.portraitUrl }));
  return (
    <section aria-labelledby="season-stats" className="space-y-3" data-testid="season-summary">
      {/* Phones: the title, Refresh, then the filter bar. Tablets: the title, then Refresh and the
          filters on one row at either end. Wide: the filters beside the title, Refresh under it. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-y-2.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-x-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:pt-1">
          <h2 id="season-stats" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          {/* What the figures count; how complete they are is under the ⓘ beside Refresh. */}
          <p className="text-sm text-fg-muted" data-testid="stats-population">
            {scopeLabel(data, nameOf)}
          </p>
        </div>
        {status ? <DataRefresh status={status} refresh={refresh} className="md:min-h-9 xl:row-start-2" /> : null}
        <div className="min-w-0 md:col-start-2 xl:row-span-2 xl:row-start-1">
          <OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} modeCounts={data.modes.counts} refineScope={REFINE_SCOPE} />
        </div>
      </div>
      {/* The figures, then the multikills right under them, as far apart as the figures' own rows. */}
      <div className="space-y-2 sm:space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6" data-testid="season-figures">
          <HeroFigure label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={HERO_TONE[winRateTone(rec.winRate, rec.games, WIN_RATE_MIN_GAMES.season)]} testId="stat-winrate" />
          <HeroFigure label="Games" value={<span data-testid="season-record">{rec.games ? fmt.int(rec.games) : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? undefined : "muted"} testId="stat-games" />
          <HeroFigure label="KDA ratio" value={fmt.kda(perf)} sub={kdaSub} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : undefined} testId="stat-kda" />
          <HeroFigure label="CS / min" value={fmt.csm(perf)} sub={rec.games ? "minions + monsters" : undefined} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." tone={perf.csPerMinute === null ? "muted" : undefined} testId="stat-cs" />
          <HeroFigure label="Damage / min" value={fmt.int(perf.damagePerMinute)} sub={rec.games ? "to champions" : undefined} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." tone={perf.damagePerMinute === null ? "muted" : undefined} testId="stat-damage" />
          <HeroFigure label="Vision score" value={fmt.int(perf.visionPerGame)} sub={rec.games ? "per game" : undefined} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." tone={perf.visionPerGame === null ? "muted" : undefined} testId="stat-vision" />
        </div>
        {/* Multikills over the same games, as figures of their own; per champion in All Champions (same filters, sorted by multikills). */}
        {rec.games > 0 ? <MultikillCards m={data.summary.multikills} byChampionHref={`${basePath}/champions?${statsQuery({ season: data.filter.season, mode: data.filter.mode, role: data.filter.role, accountId: data.filter.accountId }, { sort: "multikills" })}`} /> : null}
      </div>
      {rec.games === 0 ? <ModeElsewhere basePath={basePath} filter={data.filter} elsewhere={data.modes.elsewhere} /> : null}
    </section>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How much this player has played a champion in that role, from their games on every linked account: how many (recent ones count more), whether they were in this role, and their results. It measures experience, not skill. Main needs 15+ games in the role and Comfortable 6+; mastery helps only a little, and only for roles they actually play the champion in.";

