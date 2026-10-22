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
import { MULTIKILL_HELP, MULTIKILL_TONE } from "./multikill-summary";
import { MULTIKILL_KINDS, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";

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
 * The four multikill kinds as cards of their own, beside the season's other figures: the rarest
 * the loudest (quadra kills violet, pentakills gold). They add up Riot's counts over the same
 * games as the figures above; whether every game has counts is said once, in the page's status
 * (components/ui/data-status.tsx), not on each card. A count no game has yet is a dash, never 0.
 */
function MultikillCards({ m, byChampionHref }: { m: MultikillSummary; byChampionHref: string }) {
  const unknown = m.counted === 0;
  const kinds: Record<keyof MultikillCounts, string> = { double: "Double kills", triple: "Triple kills", quadra: "Quadra kills", penta: "Pentakills" };
  return (
    <section aria-labelledby="multikills-heading" className="space-y-2" data-testid="multikills" data-coverage={unknown ? "none" : m.counted < m.games ? "partial" : "complete"}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="multikills-heading" className="inline-flex items-center gap-1 text-sm font-semibold text-fg">
          Multikills <InfoTip text={MULTIKILL_HELP} label="About multikills" />
        </h3>
        <Link href={byChampionHref} className="inline-flex min-h-6 items-center gap-0.5 rounded-md text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" aria-label="Multikills by champion, in All Champions" data-testid="multikills-by-champion">
          By champion <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" data-testid="multikill-tiles">
        {MULTIKILL_KINDS.map((k) => {
          const count = m[k.key];
          return (
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
                  formatCount(count)
                )
              }
              valueClassName={cn(!unknown && count > 0 ? MULTIKILL_TONE[k.key] : "text-fg-muted")}
              sub={unknown ? "Not counted yet" : multikillRate(count, m.counted)}
              className={cn(k.key === "penta" && count > 0 && "border-gold/40 bg-gold/[0.07]")}
              testId={`multikill-${k.key}`}
            />
          );
        })}
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
 * under the title always says exactly which games are counted. Completeness is one quiet line.
 */
export function SeasonSummary({ data, basePath, championsById }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion> }) {
  const nameOf = (id: string) => championsById[id]?.name ?? id;
  const rec = data.summary.record;
  const perf = data.summary.performance;
  const kdaSub = perf.detailedGames ? `${fmt.one(perf.kills)} / ${fmt.one(perf.deaths)} / ${fmt.one(perf.assists)} per game${perf.perfectKda ? " · no deaths" : ""}` : rec.games ? "details not collected yet" : undefined;
  const champions = data.championOptions.map((c) => ({ id: c.id, name: nameOf(c.id), games: c.games, portraitUrl: championsById[c.id]?.portraitUrl }));
  return (
    <section aria-labelledby="season-stats" className="space-y-3" data-testid="season-summary">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:flex-1 xl:pt-1">
          <h2 id="season-stats" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          {/* What the figures count. How complete they are is the page's status line, above. */}
          <p className="text-sm text-fg-muted" data-testid="stats-population">
            {scopeLabel(data, nameOf)}
          </p>
        </div>
        <div className="xl:shrink-0">
          <OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} modeCounts={data.modes.counts} refineScope={REFINE_SCOPE} />
        </div>
      </div>
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
      {rec.games === 0 ? <ModeElsewhere basePath={basePath} filter={data.filter} elsewhere={data.modes.elsewhere} /> : null}
    </section>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How much this player has played a champion in that role, from their games on every linked account: how many (recent ones count more), whether they were in this role, and their results. It measures experience, not skill. Main needs 15+ games in the role and Comfortable 6+; mastery helps only a little, and only for roles they actually play the champion in.";

