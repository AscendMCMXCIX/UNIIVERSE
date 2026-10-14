import * as React from "react";
import Link from "next/link";
import { ChevronDown, Pencil } from "lucide-react";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import type { PerformanceSummary } from "@/domain/season-stats";
import { seasonModeInfo, seasonQuery } from "@/domain/season-stats";
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
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        {label} {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl", tone === "good" ? "text-good" : tone === "muted" ? "text-fg-muted" : "text-fg")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

function SecondaryFigure({ label, value, sub, info, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; info?: string; testId?: string }) {
  return (
    <div className="rounded-xl bg-bg-elevated px-3.5 py-2.5" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs text-fg-muted">
        {label} {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className="text-lg font-semibold tabular-nums text-fg">{value}</div>
      {sub ? <div className="text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

/**
 * Season statistics, most important first: win rate, games and KDA large; CS, damage and vision
 * below; completeness and freshness as a compact line. The population is the player's pool
 * champions in the selected season and game mode (said in words, so nobody has to guess).
 */
export function SeasonSummary({ data, basePath }: { data: PlayerOverviewData; basePath: string }) {
  const mode = seasonModeInfo(data.mode);
  const rec = data.pool.record;
  const perf = data.pool.performance;
  const kdaSub = perf.detailedGames ? `${fmt.one(perf.kills)} / ${fmt.one(perf.deaths)} / ${fmt.one(perf.assists)} per game${perf.perfectKda ? " · no deaths" : ""}` : rec.games ? "details not collected yet" : undefined;
  return (
    <section aria-labelledby="season-stats" className="space-y-3" data-testid="season-summary">
      <AutoRefresh active={data.accounts.some((a) => a.sync.state === "pending" || a.sync.state === "verified" || a.sync.state === "syncing")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="season-stats" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          <p className="text-sm text-fg-muted" data-testid="stats-population">
            Pool champions · {seasonLabel(data.season)} · {mode.label}
          </p>
        </div>
        <OverviewFilters basePath={basePath} season={data.season} seasons={data.seasons} currentSeason={data.currentSeason} mode={data.mode} others={data.othersRequested} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HeroFigure label="Win rate" value={rec.winRate === null ? "—" : percent(rec.winRate, 0)} sub={rec.games ? `${rec.wins}W ${rec.losses}L` : "No games yet"} tone={rec.winRate === null ? "muted" : rec.winRate >= 0.5 ? "good" : undefined} testId="stat-winrate" />
        <HeroFigure label="Games played" value={<span data-testid="season-record">{rec.games}</span>} sub={`${data.pool.champions} pool champion${data.pool.champions === 1 ? "" : "s"} · all champions: ${data.record.games}`} testId="stat-games" />
        <HeroFigure label="KDA ratio" value={fmt.kda(perf)} sub={kdaSub} info="(Kills + assists) ÷ deaths, added up over all the games, so one deathless game cannot make it infinite." tone={perf.kdaRatio === null ? "muted" : undefined} testId="stat-kda" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SecondaryFigure label="Average CS per game" value={fmt.int(perf.csPerGame)} sub={[perf.csPerMinute !== null ? `${perf.csPerMinute.toFixed(1)} per minute` : null, sampleNote(perf.csGames, rec.games)].filter(Boolean).join(" · ") || undefined} info="Lane minions plus jungle monsters killed." testId="stat-cs" />
        <SecondaryFigure label="Average champion damage per game" value={fmt.int(perf.damagePerGame)} sub={sampleNote(perf.damageGames, rec.games) ?? undefined} info="Total damage dealt to enemy champions." testId="stat-damage" />
        <SecondaryFigure label="Average vision score per game" value={fmt.int(perf.visionPerGame)} sub={sampleNote(perf.visionGames, rec.games) ?? undefined} info="Riot's vision score: wards placed and cleared, and time spent revealing enemies." testId="stat-vision" />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1" data-testid="season-coverage">
          <span className={cn("h-1.5 w-1.5 rounded-full", data.completeness.complete ? "bg-good" : "bg-warn")} aria-hidden />
          {data.completeness.label}
          <InfoTip text={data.completeness.detail} label="About this season's data" />
        </span>
        <span>Updated {data.lastSyncAt ? timeAgo(data.lastSyncAt) : "never"}</span>
        <span>
          {data.accounts.length} linked account{data.accounts.length === 1 ? "" : "s"}
        </span>
        <span>
          Solo {data.byMode.solo.games} · Flex {data.byMode.flex.games} · Normal {data.byMode.normal.games}
        </span>
      </p>
    </section>
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
            <span className="mt-0.5 inline-flex items-center gap-1">
              <Badge tone={TIER_TONE[card.tier]}>
                <span aria-hidden className="mr-0.5 text-[0.6rem]">
                  {TIER_MARK[card.tier]}
                </span>
                {card.tierLabel}
              </Badge>
              <InfoTip text={card.tierWhy} label={`Why ${card.tierLabel}`} />
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
              <dt className="text-xs text-fg-subtle">CS</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{fmt.int(p.csPerGame)}</dd>
            </div>
          </dl>
          <p className="flex flex-wrap justify-between gap-x-2 text-xs text-fg-muted">
            <span>{card.mastery ? `${points(card.mastery.points)} mastery${card.mastery.accounts.length > 1 ? ` · ${card.mastery.accounts.length} accounts` : ""}` : "No mastery recorded"}</span>
            <span>{r.lastPlayedAt ? `played ${timeAgo(r.lastPlayedAt)}` : ""}</span>
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
  const grid = showStats ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";
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
export function ChampionPools({ data, roles, championsById, basePath, showStats, editor, selfView, name }: { data: PlayerOverviewData; roles: Role[]; championsById: Record<string, PortraitChampion>; basePath: string; showStats: boolean; editor: React.ReactNode | null; selfView: boolean; name: string }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const othersHref = `${basePath}?${seasonQuery(data.season, data.mode, !data.othersRequested)}`;
  const empty = data.cards.length === 0;
  return (
    <section aria-labelledby="champion-pools" className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4 sm:p-5" data-testid="champion-pools">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="champion-pools" className="text-lg font-semibold text-fg">
            Champion pools
          </h2>
          <p className="text-sm text-fg-muted">{selfView ? "The champions UNIIVERSE drafts for you, in your order" : `The champions UNIIVERSE drafts for ${name}`}{showStats ? `, with ${seasonLabel(data.season)} statistics.` : "."}</p>
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
      {showStats && data.hasHistory ? (
        <div className="space-y-3 border-t border-border pt-3">
          <Link href={othersHref} className="text-sm text-accent hover:underline" scroll={false}>
            {data.othersRequested ? "Hide other champions played" : "Show other champions played (outside the pools) →"}
          </Link>
          {data.othersRequested ? (
            data.others.length === 0 ? (
              <p className="text-xs text-fg-muted">No games on champions outside the pools in this season and game mode.</p>
            ) : (
              <div data-testid="other-cards">
                <p className="mb-2 text-xs text-fg-muted">Other champions played this season. They are never recommended in a normal draft until added to a pool.</p>
                <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.others.map((c) => (
                    <ChampionStatCard key={c.championId} card={c} champion={champ(c.championId)} showStats />
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
