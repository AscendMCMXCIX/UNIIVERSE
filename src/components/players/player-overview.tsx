import * as React from "react";
import { ChevronDown, Pencil } from "lucide-react";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo } from "@/domain/season-stats";
import type { StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import type { ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { OverviewFilters } from "./overview-filters";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };
/** A shape per tier as well as a colour, so the label never depends on colour alone. */
const TIER_MARK: Record<ProficiencyTier, string> = { core: "◆◆", strong: "◆", comfortable: "●", moderate: "○", rusty: "◇", unknown: "–" };
/** Cards shown per role before "Show all": large pools stay tidy. */
const CARDS_BEFORE_MORE = 9;

export const fmt = {
  kda: (p: PerformanceSummary) => (p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)),
  int: (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en")),
  one: (v: number | null) => (v === null ? "—" : v.toFixed(1)),
  /** CS per minute, one decimal. */
  csm: (p: PerformanceSummary) => (p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)),
};

function points(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
}

/** How many games a figure is based on, when not every game carries it. */
function sampleNote(n: number, of: number): string | null {
  if (of === 0 || n === of) return null;
  return n === 0 ? "details not collected yet" : `from ${n} of ${of} games`;
}

function HeroFigure({ label, value, sub, info, tone, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; tone?: "good" | "muted"; testId?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface px-3 py-3 sm:px-4 sm:py-3.5" data-testid={testId}>
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
  const champions = data.championOptions.map((c) => ({ id: c.id, name: nameOf(c.id), games: c.games }));
  return (
    <section aria-labelledby="season-stats" className="space-y-3" data-testid="season-summary">
      <AutoRefresh active={data.accounts.some((a) => a.sync.state === "pending" || a.sync.state === "verified" || a.sync.state === "syncing")} />
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
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
        <HeroFigure label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={rec.winRate === null ? "muted" : rec.winRate >= 0.5 ? "good" : undefined} testId="stat-winrate" />
        <HeroFigure label="Games" value={<span data-testid="season-record">{rec.games}</span>} sub={rec.games ? `${data.topChampions.length} champion${data.topChampions.length === 1 ? "" : "s"}` : undefined} testId="stat-games" />
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
      <ChampionTable cards={data.topChampions} championsById={championsById} />
    </section>
  );
}

const TOP_ROWS = 8;

/** The champions behind the figures: one compact row each, most played first. */
function ChampionTable({ cards, championsById }: { cards: OverviewCard[]; championsById: Record<string, PortraitChampion> }) {
  if (cards.length === 0) return null;
  const head = cards.slice(0, TOP_ROWS);
  const rest = cards.slice(TOP_ROWS);
  const row = (c: OverviewCard) => {
    const ch = championsById[c.championId] ?? { id: c.championId, name: c.championId, portraitUrl: "" };
    const r = c.selected;
    return (
      <li key={`${c.championId}-${c.role}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.6fr))_minmax(0,1fr)]" data-testid="top-champion">
        <span className="flex min-w-0 items-center gap-2.5">
          <ChampionPortrait champion={ch} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">{ch.name}</span>
            <span className="flex items-center gap-1 text-xs text-fg-subtle">
              <RoleIcon role={c.role} className="h-3.5 w-3.5" /> {ROLE_LABELS[c.role]}
              {c.inPool ? " · in pool" : ""}
            </span>
          </span>
        </span>
        <span className="text-right text-sm tabular-nums sm:text-left">
          <span className="font-semibold text-fg">{r.games}</span> <span className="text-xs text-fg-subtle sm:hidden">games</span>
        </span>
        <span className={cn("hidden text-sm font-semibold tabular-nums sm:block", r.winRate === null ? "text-fg-muted" : r.winRate >= 0.5 ? "text-good" : "text-fg")}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
        <span className="hidden text-sm tabular-nums text-fg sm:block">{fmt.kda(c.performance)}</span>
        <span className="hidden text-sm tabular-nums text-fg sm:block">{fmt.csm(c.performance)}</span>
        <span className="col-span-2 flex items-center gap-1 sm:col-span-1">
          <TierBadge card={c} />
          <span className="text-xs text-fg-subtle sm:hidden">
            {r.winRate === null ? "" : `${percent(r.winRate, 0)} won · KDA ${fmt.kda(c.performance)}`}
          </span>
        </span>
      </li>
    );
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" data-testid="top-champions">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.6fr))_minmax(0,1fr)] gap-x-3 border-b border-border px-3 py-2 text-xs font-medium text-fg-subtle sm:grid">
        <span>Champion</span>
        <span>Games</span>
        <span>Win rate</span>
        <span>KDA</span>
        <span title="Creep score per minute">CS/min</span>
        <span className="inline-flex items-center gap-1">
          Proficiency <InfoTip text={PROFICIENCY_HELP} label="How proficiency is rated" />
        </span>
      </div>
      <ul className="divide-y divide-border">{head.map(row)}</ul>
      {rest.length ? (
        <details className="group border-t border-border">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 px-3 text-sm font-medium text-accent hover:bg-accent/5">
            <span className="group-open:hidden">Show all {cards.length} champions</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-border border-t border-border">{rest.map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/** One short explanation of proficiency, shown from an (i) wherever a rating appears. */
export const PROFICIENCY_HELP =
  "How well this player knows a champion in that role, from their own games on every linked account: how many games (recent ones count more), whether they are played in this role, and results. Mastery points only help a little: Very strong needs 15+ games and Strong 6+. The draft engine uses the same rating.";

function TierBadge({ card }: { card: OverviewCard }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={TIER_TONE[card.tier]}>
        <span aria-hidden className="mr-0.5 text-[0.6rem]">
          {TIER_MARK[card.tier]}
        </span>
        {card.tierLabel}
      </Badge>
      <InfoTip text={card.tierWhy} label={`Why ${card.tierLabel}`} />
    </span>
  );
}

function ChampionStatCard({ card, champion, showStats }: { card: OverviewCard; champion: PortraitChampion; showStats: boolean }) {
  const r = card.selected;
  const p = card.performance;
  return (
    <li className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong" data-testid="champion-card" data-champion={card.championId}>
      <div className="flex items-center gap-3">
        <ChampionPortrait champion={champion} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{champion.name}</div>
          {showStats ? (
            <span className="mt-0.5 block">
              <TierBadge card={card} />
            </span>
          ) : null}
        </div>
      </div>
      {showStats ? (
        <>
          <dl className="grid grid-cols-4 gap-1 text-center">
            <div className="rounded-lg bg-bg-elevated px-1 py-1">
              <dt className="text-xs text-fg-subtle">Games</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{r.games}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-1 py-1">
              <dt className="text-xs text-fg-subtle">Win rate</dt>
              <dd className={cn("text-sm font-semibold tabular-nums", r.winRate === null ? "text-fg-muted" : r.winRate >= 0.5 ? "text-good" : "text-fg")}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-1 py-1">
              <dt className="text-xs text-fg-subtle">KDA</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{fmt.kda(p)}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-1 py-1">
              <dt className="text-xs text-fg-subtle" title="Creep score per minute">CS/min</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{fmt.csm(p)}</dd>
            </div>
          </dl>
          <p className="flex flex-wrap justify-between gap-x-2 text-xs text-fg-muted">
            <span>
              {card.allRoles !== undefined ? (card.allRoles > r.games ? `${r.games} as ${ROLE_LABELS[card.role]} · ${card.allRoles} in all roles` : `Games as ${ROLE_LABELS[card.role]}`) : null}
            </span>
            <span>{card.mastery ? `${points(card.mastery.points)} mastery` : "No mastery"}</span>
          </p>
        </>
      ) : null}
    </li>
  );
}

function RolePoolGroup({ title, role, cards, championsById, showStats, testId }: { title: string; role: Role; cards: OverviewCard[]; championsById: Record<string, PortraitChampion>; showStats: boolean; testId: string }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const head = cards.slice(0, CARDS_BEFORE_MORE);
  const rest = cards.slice(CARDS_BEFORE_MORE);
  const grid = showStats ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <section className="space-y-2.5" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <RoleIcon role={role} className="h-4 w-4 text-accent" /> {title}
        <span className="font-normal text-fg-subtle">
          {cards.length} champion{cards.length === 1 ? "" : "s"}
        </span>
      </h3>
      {cards.length === 0 ? <p className="text-sm text-fg-subtle">No champions for this role yet.</p> : null}
      <ul className={grid}>
        {head.map((c) => (
          <ChampionStatCard key={c.championId} card={c} champion={champ(c.championId)} showStats={showStats} />
        ))}
      </ul>
      {rest.length ? (
        <details className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10">
            <span className="group-open:hidden">Show all {cards.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className={cn(grid, "mt-2.5")}>
            {rest.map((c) => (
              <ChampionStatCard key={c.championId} card={c} champion={champ(c.championId)} showStats={showStats} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

const roleTitle = (index: number, role: Role) => `${index === 0 ? "Primary" : index === 1 ? "Secondary" : index === 2 ? "3rd role" : `${index + 1}th role`} · ${ROLE_LABELS[role]}`;

/**
 * Champion pools with each champion's own statistics beside it, grouped by configured role in
 * preference order. Editing (roles, champions, order) opens in place for whoever may edit.
 */
export function ChampionPools({ data, roles, championsById, showStats, editor, selfView, name }: { data: PlayerOverviewData; roles: Role[]; championsById: Record<string, PortraitChampion>; showStats: boolean; editor: React.ReactNode | null; selfView: boolean; name: string }) {
  const empty = data.cards.length === 0;
  return (
    <section aria-labelledby="champion-pools" className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4 sm:p-5" data-testid="champion-pools">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="champion-pools" className="flex items-center gap-1.5 text-lg font-semibold text-fg">
            Champion pools {showStats ? <InfoTip text={PROFICIENCY_HELP} label="How proficiency is rated" /> : null}
          </h2>
          <p className="text-sm text-fg-muted">{selfView ? "The champions UNIIVERSE drafts for you, in your order" : `The champions UNIIVERSE drafts for ${name}`}{showStats ? `, with ${seasonLabel(data.season)} statistics in each role. The same champion may be in several roles.` : ". The same champion may be in several roles."}</p>
        </div>
      </div>
      {editor ? (
        <details className="group rounded-xl border border-border bg-surface" open={empty} data-testid="pool-editor">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-fg hover:text-accent">
            <Pencil className="h-4 w-4" /> Edit roles & champions
            <ChevronDown className="ml-auto h-4 w-4 text-fg-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border p-3 sm:p-4">{editor}</div>
        </details>
      ) : null}
      <div className="space-y-5" data-testid="pool-cards">
        {roles.map((role, i) => (
          <RolePoolGroup key={role} title={roleTitle(i, role)} role={role} cards={data.cards.filter((c) => c.role === role)} championsById={championsById} showStats={showStats} testId={`pool-role-${role.toLowerCase()}`} />
        ))}
      </div>
      {showStats && !data.hasHistory ? <p className="text-xs text-fg-muted">{data.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync, a few minutes after linking; this page updates by itself."}</p> : null}
    </section>
  );
}
