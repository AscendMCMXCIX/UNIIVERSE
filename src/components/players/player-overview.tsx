import * as React from "react";
import type { PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { syncRefreshInterval } from "@/domain/account-status";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo } from "@/domain/season-stats";
import type { StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS } from "@/domain/roles";
import type { PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { WIN_RATE_MIN_GAMES, winRateTone, type WinRateTone } from "@/domain/stats/win-rate";
import { MULTIKILL_KINDS, type MultikillSummary } from "@/domain/multikills";
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
        <HeroFigure label="Games" value={<span data-testid="season-record">{rec.games ? rec.games : "—"}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : "No games yet"} tone={rec.games ? undefined : "muted"} testId="stat-games" />
        <HeroFigure label="KDA ratio" value={fmt.kda(perf)} sub={kdaSub} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : undefined} testId="stat-kda" />
        <HeroFigure label="CS / min" value={fmt.csm(perf)} sub={sampleNote(perf.csMinuteGames, rec.games) ?? (rec.games ? "minions + monsters" : undefined)} info="Lane minions plus jungle monsters: total CS ÷ total minutes played, over the games with both recorded (remakes under five minutes left out)." tone={perf.csPerMinute === null ? "muted" : undefined} testId="stat-cs" />
        <HeroFigure label="Damage / min" value={fmt.int(perf.damagePerMinute)} sub={sampleNote(perf.damageMinuteGames, rec.games) ?? (rec.games ? "to champions" : undefined)} info="Damage dealt to enemy champions: total damage ÷ total minutes played, over the games with both recorded (remakes left out)." tone={perf.damagePerMinute === null ? "muted" : undefined} testId="stat-damage" />
        <HeroFigure label="Vision score" value={fmt.int(perf.visionPerGame)} sub={sampleNote(perf.visionGames, rec.games) ?? (rec.games ? "per game" : undefined)} info="Average Riot vision score per game: wards placed and cleared, and time spent revealing enemies." tone={perf.visionPerGame === null ? "muted" : undefined} testId="stat-vision" />
      </div>
      {rec.games > 0 ? <Multikills data={data} /> : null}
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
  "Double, triple, quadra and pentakills as Riot recorded them in each game, added up over the games counted above. UNIIVERSE keeps these counts only for games stored since Team Leaderboards were added; older games are left out rather than counted as zero, so this is not a career total.";

/** "from all 42 games" · "from 37 of 42 games": which games the multikill totals come from. */
function multikillSample(m: MultikillSummary): string {
  return m.counted === m.games ? `from all ${m.games} game${m.games === 1 ? "" : "s"}` : `from ${m.counted} of ${m.games} games`;
}

/**
 * Multikills in the games the figures above count (same filters), with how many of those games
 * have the counts. With several linked accounts and none chosen, each account's own counts are
 * behind "By account"; a game two of them shared counts once in the total.
 */
function Multikills({ data }: { data: PlayerOverviewData }) {
  const m = data.summary.multikills;
  const names = accountShortNames(data.accountOptions);
  const perAccount = data.multikillsByAccount.filter((a) => a.multikills.games > 0);
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2 sm:px-4" data-testid="multikills">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
          Multikills <InfoTip text={MULTIKILL_HELP} label="About multikills" />
        </span>
        {m.counted ? (
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {MULTIKILL_KINDS.map((k) => (
              <div key={k.key} className="flex items-baseline gap-1.5" data-testid={`multikill-${k.key}`}>
                <dt className="text-xs text-fg-muted">{k.label}</dt>
                <dd className={cn("text-sm font-semibold tabular-nums", m[k.key] ? "text-fg" : "text-fg-subtle")}>{m[k.key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-xs text-fg-muted">Not recorded for these games</span>
        )}
        <span className="text-xs text-fg-subtle" data-testid="multikill-sample">
          {m.counted ? multikillSample(m) : `none of the ${m.games} game${m.games === 1 ? "" : "s"} has the counts`}
        </span>
      </div>
      {m.counted && perAccount.length > 1 ? (
        <details className="mt-1.5 text-xs" data-testid="multikills-by-account">
          <summary className="w-fit cursor-pointer rounded-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">By account</summary>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left tabular-nums">
              <thead className="text-fg-subtle">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Account</th>
                  {MULTIKILL_KINDS.map((k) => (
                    <th key={k.key} scope="col" className="px-2 py-1 text-right font-medium">
                      {k.label}
                    </th>
                  ))}
                  <th scope="col" className="py-1 pl-3 text-right font-medium">Games</th>
                </tr>
              </thead>
              <tbody>
                {perAccount.map((a) => (
                  <tr key={a.accountId} className="border-t border-border" data-testid="multikill-account">
                    <th scope="row" className="max-w-[10rem] truncate py-1 pr-3 font-medium text-fg" title={data.accountOptions.find((o) => o.id === a.accountId)?.riotId}>
                      {names.get(a.accountId) ?? "Linked account"}
                    </th>
                    {MULTIKILL_KINDS.map((k) => (
                      <td key={k.key} className={cn("px-2 py-1 text-right", a.multikills[k.key] ? "text-fg" : "text-fg-subtle")}>
                        {a.multikills.counted ? a.multikills[k.key] : "—"}
                      </td>
                    ))}
                    <td className="py-1 pl-3 text-right text-fg-subtle">{a.multikills.counted === a.multikills.games ? a.multikills.games : `${a.multikills.counted} of ${a.multikills.games}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How much this player has played a champion in that role, from their games on every linked account: how many (recent ones count more), whether they were in this role, and their results. It measures experience, not skill. Main needs 15+ games in the role and Comfortable 6+; mastery helps only a little, and only for roles they actually play the champion in.";

