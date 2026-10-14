import * as React from "react";
import Link from "next/link";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import type { GameRecord } from "@/domain/player-stats";
import { seasonModeInfo, seasonQuery } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { TIER_DESCRIPTIONS, type ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { OverviewFilters } from "./overview-filters";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

function recordText(r: GameRecord): string {
  if (r.games === 0) return "No games";
  return `${r.wins}W ${r.losses}L · ${percent(r.winRate ?? 0, 0)}`;
}


function points(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
}

function MasteryLine({ card }: { card: OverviewCard }) {
  const m = card.mastery;
  if (!m) return <dd className="text-fg-muted">No mastery recorded</dd>;
  const label = `${points(m.points)} pts`;
  if (m.accounts.length <= 1) return <dd className="text-fg">{label}</dd>;
  return (
    <dd className="text-right text-fg">
      <details className="inline-block">
        <summary className="cursor-pointer list-none">
          {label} <span className="text-fg-subtle">· {m.accounts.length} accounts ▾</span>
        </summary>
        <ul className="mt-1 space-y-0.5 text-left text-[11px] text-fg-muted" data-testid="mastery-breakdown">
          {m.accounts.map((a) => (
            <li key={a.accountId}>
              {a.account}: {a.points.toLocaleString("en")} pts
            </li>
          ))}
        </ul>
      </details>
    </dd>
  );
}

function ChampionCardView({ card, champion, mode }: { card: OverviewCard; champion: PortraitChampion; mode: PlayerOverviewData["mode"] }) {
  const r = card.selected;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong" data-testid="champion-card" data-champion={card.championId}>
      <div className="flex items-center gap-3">
        <ChampionPortrait champion={champion} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-fg">{champion.name}</div>
          <div className="flex items-center gap-1 text-xs text-fg-subtle">
            <RoleIcon role={card.role} className="h-3.5 w-3.5" /> {ROLE_LABELS[card.role]} · {card.inPool === "primary" ? "primary pool" : card.inPool === "secondary" ? "secondary pool" : "not in a pool"}
          </div>
          <span className="mt-1 inline-flex items-center gap-1">
            <Badge tone={TIER_TONE[card.tier]}>{card.tierLabel}</Badge>
            <InfoTip text={`Proficiency: ${TIER_DESCRIPTIONS[card.tier]}`} label={`What ${card.tierLabel} means`} />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-elevated px-2 py-1.5">
          <div className="text-lg font-semibold tabular-nums text-fg">{r.games}</div>
          <div className="text-[11px] text-fg-subtle">Games</div>
        </div>
        <div className="rounded-lg bg-bg-elevated px-2 py-1.5">
          <div className="text-lg font-semibold tabular-nums text-fg">{r.games ? `${r.wins}–${r.losses}` : "—"}</div>
          <div className="text-[11px] text-fg-subtle">W–L</div>
        </div>
        <div className="rounded-lg bg-bg-elevated px-2 py-1.5">
          <div className={r.winRate === null ? "text-lg font-semibold text-fg-muted" : r.winRate >= 0.5 ? "text-lg font-semibold tabular-nums text-good" : "text-lg font-semibold tabular-nums text-fg"}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</div>
          <div className="text-[11px] text-fg-subtle">Win rate</div>
        </div>
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">Mastery</dt>
          <MasteryLine card={card} />
        </div>
        {mode === "all" && r.games > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">By mode</dt>
            <dd className="text-fg">
              Solo {card.solo.games} · Flex {card.flex.games} · Normal {card.normal.games}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">Last played</dt>
          <dd className="text-fg">{r.lastPlayedAt ? timeAgo(r.lastPlayedAt) : card.mastery?.lastPlayedAt ? `${timeAgo(card.mastery.lastPlayedAt)} (mastery)` : "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

/** A labelled figure in the summary row. */
function StatTile({ label, value, sub, tone, testId, info }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "muted"; testId?: string; info?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs font-medium text-fg-subtle">
        {label} {info ? <InfoTip text={info} label={`About ${label}`} /> : null}
      </div>
      <div className={tone === "good" ? "mt-0.5 text-lg font-semibold text-good" : tone === "warn" ? "mt-0.5 text-lg font-semibold text-warn" : tone === "muted" ? "mt-0.5 text-lg font-semibold text-fg-muted" : "mt-0.5 text-lg font-semibold text-fg"}>{value}</div>
      {sub ? <div className="text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

/**
 * MY OVERVIEW / teammate profile statistics: quick reference for the selected season, then one card
 * per configured pool champion with combined mastery, season games in the selected game mode and
 * the proficiency label. Used for the player's own page and, read-only, on every profile.
 */
export function PlayerOverview({ data, player, championsById, basePath, selfView, editHref, poolTitle = "Champion pool" }: { data: PlayerOverviewData; player: { displayName: string; primaryRole: Role; secondaryRole: Role | null }; championsById: Record<string, PortraitChampion>; basePath: string; selfView: boolean; editHref: string | null; poolTitle?: string }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const mode = seasonModeInfo(data.mode);
  const othersHref = `${basePath}?${seasonQuery(data.season, data.mode, !data.othersRequested)}`;
  const seasonName = seasonLabel(data.season);
  return (
    <div className="space-y-4" id="overview" data-testid="player-overview">
      <AutoRefresh active={data.accounts.some((a) => a.sync.state === "pending" || a.sync.state === "verified" || a.sync.state === "syncing")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <OverviewFilters basePath={basePath} season={data.season} seasons={data.seasons} currentSeason={data.currentSeason} mode={data.mode} others={data.othersRequested} />
        <p className="text-xs text-fg-subtle">
          {seasonName} · {mode.label} · {data.accounts.length} linked account{data.accounts.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Season record" value={<span data-testid="season-record">{recordText(data.record)}</span>} sub={data.record.games ? `${data.record.games} games · ${mode.label}` : mode.label} tone={data.record.games ? undefined : "muted"} />
        <StatTile label="By game mode" value={`${data.byMode.solo.games + data.byMode.flex.games + data.byMode.normal.games} games`} sub={`Solo ${data.byMode.solo.games} · Flex ${data.byMode.flex.games} · Normal ${data.byMode.normal.games}`} />
        <StatTile label="Season data" value={data.completeness.label} tone={data.completeness.complete ? "good" : "warn"} testId="season-coverage" info={data.completeness.detail} />
        <StatTile label="Last update" value={data.lastSyncAt ? timeAgo(data.lastSyncAt) : "Never"} sub={data.rank ? data.rank.text.split(" · ").slice(0, 2).join(" · ") : data.accounts.length === 0 ? "No Riot account linked" : "Unranked"} tone={data.lastSyncAt ? undefined : "muted"} />
      </div>
      <Panel>
        <PanelHeader
          title={poolTitle}
          subtitle={`The champions UNIIVERSE drafts for ${selfView ? "you" : player.displayName} · ${mode.label} · ${seasonName}.`}
          actions={
            editHref ? (
              <Link href={editHref} className="text-sm text-accent hover:underline">
                Edit champions →
              </Link>
            ) : null
          }
        />
        <PanelBody className="space-y-3">
          {data.cards.length === 0 ? <p className="text-sm text-fg-muted">No champions configured yet.{editHref ? " Add up to six for the primary role and three for the secondary role." : ""}</p> : null}
          {data.cards.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="pool-cards">
              {data.cards.map((c) => (
                <ChampionCardView key={c.championId} card={c} champion={champ(c.championId)} mode={data.mode} />
              ))}
            </ul>
          ) : null}
          {!data.hasHistory ? <p className="text-xs text-fg-muted">{data.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync, a few minutes after linking; this page updates by itself."}</p> : null}
          {data.hasHistory ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Link href={othersHref} className="text-accent hover:underline" scroll={false}>
                {data.othersRequested ? "Hide other champions played" : "Show other champions played (outside the pools) →"}
              </Link>
            </div>
          ) : null}
          {data.othersRequested ? (
            data.others.length === 0 ? (
              <p className="text-xs text-fg-muted">No games on champions outside the pools in this season and game mode.</p>
            ) : (
              <div data-testid="other-cards">
                <p className="mb-2 text-xs text-fg-muted">Other champions played this season. They are never recommended in a normal draft until added to a pool.</p>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.others.map((c) => (
                    <ChampionCardView key={c.championId} card={c} champion={champ(c.championId)} mode={data.mode} />
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}
