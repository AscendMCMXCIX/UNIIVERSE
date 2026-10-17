import * as React from "react";
import type { PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo } from "@/domain/season-stats";
import type { StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS } from "@/domain/roles";
import type { PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { OverviewFilters } from "./overview-filters";
import { WIN_RATE_MIN_GAMES, winRateTone, type WinRateTone } from "@/domain/stats/win-rate";

/** A season win rate is highlighted only on enough games (see domain/stats/win-rate). */
const HERO_TONE: Record<WinRateTone, "good" | "muted" | undefined> = { good: "good", plain: undefined, muted: "muted" };

export const fmt = {
  kda: (p: PerformanceSummary) => (p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)),
  int: (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en")),
  one: (v: number | null) => (v === null ? "—" : v.toFixed(1)),
  /** CS per minute, one decimal. */
  csm: (p: PerformanceSummary) => (p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)),
};

/** How many games a figure is based on, when not every game carries it. */
function sampleNote(n: number, of: number): string | null {
  if (of === 0 || n === of) return null;
  return n === 0 ? "details not collected yet" : `from ${n} of ${of} games`;
}

function HeroFigure({ label, value, sub, info, tone, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; tone?: "good" | "muted"; testId?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface px-3 py-3 sm:px-4 sm:py-3.5" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        <span className="min-w-0 leading-tight">{label}</span> {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl", tone === "good" ? "text-good" : tone === "muted" ? "text-fg-muted" : "text-fg")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-fg-muted">{sub}</div> : null}
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
      <AutoRefresh active={data.accounts.some((a) => a.sync.state === "pending" || a.sync.state === "verified" || a.sync.state === "syncing")} />
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:pt-1">
          <h2 id="season-stats" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          <p className="text-sm text-fg-muted" data-testid="stats-population">
            {scopeLabel(data, nameOf)}
          </p>
        </div>
        <OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6" data-testid="season-figures">
        <HeroFigure label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={HERO_TONE[winRateTone(rec.winRate, rec.games, WIN_RATE_MIN_GAMES.season)]} testId="stat-winrate" />
        <HeroFigure label="Games" value={<span data-testid="season-record">{rec.games ? rec.games : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? undefined : "muted"} testId="stat-games" />
        <HeroFigure label="KDA ratio" value={fmt.kda(perf)} sub={kdaSub} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : undefined} testId="stat-kda" />
        <HeroFigure label="CS / min" value={fmt.csm(perf)} sub={sampleNote(perf.csMinuteGames, rec.games) ?? (rec.games ? "minions + monsters" : undefined)} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." tone={perf.csPerMinute === null ? "muted" : undefined} testId="stat-cs" />
        <HeroFigure label="Damage / min" value={fmt.int(perf.damagePerMinute)} sub={sampleNote(perf.damageMinuteGames, rec.games) ?? (rec.games ? "to champions" : undefined)} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." tone={perf.damagePerMinute === null ? "muted" : undefined} testId="stat-damage" />
        <HeroFigure label="Vision score" value={fmt.int(perf.visionPerGame)} sub={sampleNote(perf.visionGames, rec.games) ?? (rec.games ? "per game" : undefined)} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." tone={perf.visionPerGame === null ? "muted" : undefined} testId="stat-vision" />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1" data-testid="season-coverage">
          <span className={cn("h-1.5 w-1.5 rounded-full", data.completeness.complete ? "bg-good" : "bg-warn")} aria-hidden />
          {data.completeness.label}
          <InfoTip text={data.completeness.detail} label="About this season's data" />
        </span>
        <span>Updated {data.lastSyncAt ? timeAgo(data.lastSyncAt) : "never"}</span>
        {data.summary.unknownRole > 0 ? <span data-testid="unknown-role-note">{data.summary.unknownRole} game{data.summary.unknownRole === 1 ? "" : "s"} without a recorded position not counted for this role</span> : null}
      </p>
    </section>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How much this player has played a champion in that role, from their games on every linked account: how many (recent ones count more), whether they were in this role, and their results. It measures experience, not skill. Main needs 15+ games in the role and Comfortable 6+; mastery helps only a little, and only for roles they actually play the champion in. The draft engine uses the same rating.";

