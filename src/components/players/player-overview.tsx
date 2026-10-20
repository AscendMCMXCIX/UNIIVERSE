import * as React from "react";
import type { PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { syncRefreshInterval } from "@/domain/account-status";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo } from "@/domain/season-stats";
import type { StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { ChevronDown } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { WIN_RATE_MIN_GAMES, winRateTone, type WinRateTone } from "@/domain/stats/win-rate";
import { MULTIKILL_KINDS, multikillCoverage, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";
import { accountShortNames } from "@/domain/account-names";

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
    <div className="min-w-0 rounded-card border border-border bg-surface px-3 py-2.5 sm:px-4" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        <span className="min-w-0 leading-tight">{label}</span> {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums leading-tight tracking-tight sm:text-[1.75rem]", tone === "good" ? "text-good" : tone === "muted" ? "text-fg-muted" : "text-fg")}>{value}</div>
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
  const refreshEvery = syncRefreshInterval(data.accounts.map((a) => a.sync.state));
  return (
    <section aria-labelledby="season-stats" className="space-y-2.5" data-testid="season-summary">
      <AutoRefresh active={refreshEvery !== null} intervalMs={refreshEvery ?? undefined} />
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:flex-1 xl:pt-1">
          <h2 id="season-stats" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          {/* What the figures count, how complete the season is and when it was updated, on one line. */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-fg-muted">
            <span data-testid="stats-population">{scopeLabel(data, nameOf)}</span>
            <span className="inline-flex items-center gap-1 text-xs" data-testid="season-coverage">
              <span className={cn("h-1.5 w-1.5 rounded-full", data.completeness.complete ? "bg-good" : "bg-warn")} aria-hidden />
              {data.completeness.label}
              <InfoTip text={data.completeness.detail} label="About this season's data" />
            </span>
            <span className="text-xs">Updated {data.lastSyncAt ? timeAgo(data.lastSyncAt) : "never"}</span>
          </p>
        </div>
        <div className="xl:shrink-0">
          <OverviewFilters basePath={basePath} filter={data.filter} seasons={data.seasons} currentSeason={data.currentSeason} champions={champions} accounts={data.accountOptions} modeCounts={data.modes.counts} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6" data-testid="season-figures">
        <HeroFigure label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={HERO_TONE[winRateTone(rec.winRate, rec.games, WIN_RATE_MIN_GAMES.season)]} testId="stat-winrate" />
        <HeroFigure label="Games" value={<span data-testid="season-record">{rec.games ? fmt.int(rec.games) : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? undefined : "muted"} testId="stat-games" />
        <HeroFigure label="KDA ratio" value={fmt.kda(perf)} sub={kdaSub} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : undefined} testId="stat-kda" />
        <HeroFigure label="CS / min" value={fmt.csm(perf)} sub={sampleNote(perf.csMinuteGames, rec.games) ?? (rec.games ? "minions + monsters" : undefined)} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." tone={perf.csPerMinute === null ? "muted" : undefined} testId="stat-cs" />
        <HeroFigure label="Damage / min" value={fmt.int(perf.damagePerMinute)} sub={sampleNote(perf.damageMinuteGames, rec.games) ?? (rec.games ? "to champions" : undefined)} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." tone={perf.damagePerMinute === null ? "muted" : undefined} testId="stat-damage" />
        <HeroFigure label="Vision score" value={fmt.int(perf.visionPerGame)} sub={sampleNote(perf.visionGames, rec.games) ?? (rec.games ? "per game" : undefined)} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." tone={perf.visionPerGame === null ? "muted" : undefined} testId="stat-vision" />
      </div>
      {rec.games > 0 ? <Multikills data={data} championsById={championsById} /> : null}
      {rec.games === 0 ? <ModeElsewhere basePath={basePath} filter={data.filter} elsewhere={data.modes.elsewhere} /> : null}
      {data.summary.unknownRole > 0 ? (
        <p className="text-xs text-fg-muted" data-testid="unknown-role-note">
          {data.summary.unknownRole} game{data.summary.unknownRole === 1 ? "" : "s"} without a recorded position not counted for this role
        </p>
      ) : null}
    </section>
  );
}

const MULTIKILL_HELP =
  "Double, triple, quadra and pentakills as Riot recorded them in each game, added up over the games counted above. Riot's records of games stored before Team Leaderboards did not keep these counts; those games' records are being fetched again, a few each hour, and the totals grow as they arrive. A game without counts is left out, never counted as zero.";

const n = (v: number) => v.toLocaleString("en");

// Rarer is louder: the double kill plain, the pentakill in gold.
const KIND_TONE: Record<keyof MultikillCounts, string> = {
  double: "text-fg",
  triple: "text-fg",
  quadra: "text-[#c4a1ff]",
  penta: "text-[#f5c451]",
};
const KIND_SHORT: Record<keyof MultikillCounts, string> = { double: "Double", triple: "Triple", quadra: "Quadra", penta: "Penta" };

/** "1 penta · 2 quadra · 9 triple · 31 double": a breakdown's counts, the rarest first, kinds without any left out. */
function MultikillChips({ m }: { m: MultikillSummary }) {
  const kinds = [...MULTIKILL_KINDS].reverse().filter((k) => m[k.key] > 0);
  if (!kinds.length) return <span className="text-xs text-fg-subtle">None</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {kinds.map((k) => (
        <span key={k.key} className="inline-flex items-baseline gap-1 rounded-full border border-border bg-bg/40 px-2 py-0.5 text-xs" title={`${m[k.key]} ${k.label.toLowerCase()}`}>
          <span className={cn("font-semibold tabular-nums", KIND_TONE[k.key])}>{m[k.key]}</span>{" "}
          <span className="text-fg-muted">{KIND_SHORT[k.key].toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * A breakdown behind a small expander: closed, one short line beside the others; open, its list
 * takes the section's whole width (two columns on wider screens).
 */
function Breakdown({ title, count, testId, children }: { title: string; count: string; testId: string; children: React.ReactNode }) {
  return (
    <details className="group/breakdown min-w-0 open:basis-full" data-testid={testId}>
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-fg-subtle">· {count}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/breakdown:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <ul className="mt-1.5 rounded-lg border border-border bg-bg/40 px-3 py-0.5 sm:grid sm:grid-cols-2 sm:gap-x-6 [&>li+li]:border-t sm:[&>li:nth-child(2)]:border-t-0 [&>li]:border-border/60">{children}</ul>
    </details>
  );
}

/**
 * Multikills in the games the figures above count (same filters), with how complete their counts
 * are: the line beside the totals says how many of those games have counts and, while some are
 * still to come (or Riot no longer has them), a bar and a note say so, so a partial total is never
 * read as the season's (it grows on its own as counts arrive). Phones: four tiles; wider screens:
 * one line. The rarest kinds are the loudest. By champion and by linked account (a game two
 * accounts shared counts once in the totals) open below.
 */
function Multikills({ data, championsById }: { data: PlayerOverviewData; championsById: Record<string, PortraitChampion> }) {
  const m = data.summary.multikills;
  const coverage = multikillCoverage(m);
  const names = accountShortNames(data.accountOptions);
  const perAccount = data.multikillsByAccount.filter((a) => a.multikills.games > 0);
  const champions = data.multikillsByChampion;
  const pct = (v: number) => `${(v / Math.max(1, m.games)) * 100}%`;
  return (
    <section aria-labelledby="multikills-title" className="rounded-card border border-border bg-surface px-3 py-2.5 sm:px-4" data-testid="multikills" data-coverage={coverage.state}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h3 id="multikills-title" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          Multikills <InfoTip text={MULTIKILL_HELP} label="About multikills" />
          {coverage.state !== "complete" ? (
            <span className="rounded-full border border-warn/40 bg-warn/10 px-1.5 py-px text-[0.6875rem] font-semibold text-warn" data-testid="multikill-partial">
              {coverage.state === "partial" ? "Partial" : "Not yet"}
            </span>
          ) : null}
        </h3>
        {m.counted ? (
          <dl className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1" data-testid="multikill-tiles">
            {MULTIKILL_KINDS.map((k) => (
              // The kind comes before its count (a list's order); the count shows first.
              <div key={k.key} className={cn("flex min-w-0 flex-col-reverse items-center rounded-lg border px-1.5 py-1.5 text-center sm:flex-row-reverse sm:items-baseline sm:gap-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0", k.key === "penta" && m.penta > 0 ? "border-[#f5c451]/40 bg-[#f5c451]/[0.07]" : "border-border bg-bg/40")} data-testid={`multikill-${k.key}`}>
                <dt className="truncate text-[0.6875rem] font-medium text-fg-muted sm:text-xs">
                  {KIND_SHORT[k.key]}
                  <span className="max-sm:sr-only">{k.key === "penta" ? "kills" : " kills"}</span>
                </dt>
                <dd className={cn("text-lg font-bold leading-tight tabular-nums", m[k.key] ? KIND_TONE[k.key] : "text-fg-subtle")}>{n(m[k.key])}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-xs text-fg-muted tabular-nums sm:ml-auto" data-testid="multikill-sample">
          {coverage.label}
        </p>
      </div>
      {coverage.state !== "complete" ? (
        <div className="mt-2 space-y-1" data-testid="multikill-coverage">
          {/* Games with counts, games Riot no longer provides, and the rest still to fetch. */}
          <div className="flex h-1 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${coverage.label}${m.unavailable ? `; ${n(m.unavailable)} no longer available from Riot` : ""}`}>
            <span className="h-full bg-good/80" style={{ width: pct(m.counted) }} />
            <span className="h-full bg-fg-subtle/40" style={{ width: pct(m.unavailable) }} />
          </div>
          {coverage.note ? <p className="text-xs text-fg-muted" data-testid="multikill-coverage-note">{coverage.note}</p> : null}
        </div>
      ) : null}
      {m.counted && (champions.length || perAccount.length > 1) ? (
        <div className="-mx-1.5 mt-1.5 flex flex-wrap items-start gap-x-1 gap-y-0.5">
          {champions.length ? (
            <Breakdown title="By champion" count={`${champions.length} champion${champions.length === 1 ? "" : "s"}`} testId="multikills-by-champion">
              {champions.map((c) => {
                const champion = championsById[c.championId] ?? { id: c.championId, name: c.championId, portraitUrl: "" };
                return (
                  <li key={c.championId} className="flex items-center gap-3 py-2" data-testid="multikill-champion">
                    <ChampionPortrait champion={champion} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{champion.name}</span>
                      <span className="block text-xs text-fg-subtle tabular-nums">
                        in {n(c.multikills.counted)} game{c.multikills.counted === 1 ? "" : "s"}
                      </span>
                    </span>
                    <MultikillChips m={c.multikills} />
                  </li>
                );
              })}
            </Breakdown>
          ) : null}
          {perAccount.length > 1 ? (
            <Breakdown title="By account" count={`${perAccount.length} accounts`} testId="multikills-by-account">
              {perAccount.map((a) => {
                const own = multikillCoverage(a.multikills);
                return (
                  <li key={a.accountId} className="flex items-center gap-3 py-2" data-testid="multikill-account">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg" title={data.accountOptions.find((o) => o.id === a.accountId)?.riotId}>
                        {names.get(a.accountId) ?? "Linked account"}
                      </span>
                      <span className="block text-xs text-fg-subtle tabular-nums">{own.label}</span>
                    </span>
                    {a.multikills.counted ? <MultikillChips m={a.multikills} /> : <span className="text-xs text-fg-subtle">No counts yet</span>}
                  </li>
                );
              })}
            </Breakdown>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How much this player has played a champion in that role, from their games on every linked account: how many (recent ones count more), whether they were in this role, and their results. It measures experience, not skill. Main needs 15+ games in the role and Comfortable 6+; mastery helps only a little, and only for roles they actually play the champion in.";

