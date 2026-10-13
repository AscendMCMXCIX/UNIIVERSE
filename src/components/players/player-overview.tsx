import Link from "next/link";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import { GAME_MODES, PATCH_WINDOWS, overviewQuery, type GameRecord } from "@/domain/player-stats";
import { TIER_DESCRIPTIONS, type ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Info, Metric, MetricLabel, SourceLine } from "@/components/ui/metric";
import { metricTooltip } from "@/domain/metrics";
import { percent, timeAgo } from "@/lib/format";
import { OverviewFilters } from "./overview-filters";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

function recordText(r: GameRecord): string {
  if (r.games === 0) return "No games";
  return `${r.wins}W ${r.losses}L · ${percent(r.winRate ?? 0, 0)} win rate`;
}

function gamesText(r: GameRecord): string {
  if (r.games === 0) return "—";
  return `${r.games} game${r.games === 1 ? "" : "s"} · ${percent(r.winRate ?? 0, 0)} win rate`;
}

function ChampionCardView({ card, champion, modeLabel, mode }: { card: OverviewCard; champion: PortraitChampion; modeLabel: string; mode: PlayerOverviewData["mode"] }) {
  return (
    <li className="rounded-md border border-border bg-bg-elevated p-2.5" data-testid="champion-card" data-champion={card.championId}>
      <div className="flex items-center gap-2">
        <ChampionPortrait champion={champion} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{champion.name}</div>
          <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
            <RoleIcon role={card.role} className="h-3 w-3" /> {ROLE_LABELS[card.role]} · {card.inPool === "primary" ? "primary pool" : card.inPool === "secondary" ? "secondary pool" : "not in a pool"}
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-fg-muted" title={metricTooltip("proficiency-tier")}>
          Proficiency <Badge tone={TIER_TONE[card.tier]} title={TIER_DESCRIPTIONS[card.tier]}>{card.tierLabel}</Badge>
        </span>
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{modeLabel}</dt>
          <dd className="font-medium text-fg">{gamesText(card.selected)}</dd>
        </div>
        {mode !== "solo" ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">Solo/Duo</dt>
            <dd className="text-fg">{gamesText(card.solo)}</dd>
          </div>
        ) : null}
        {mode !== "flex" ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">Ranked Flex</dt>
            <dd className="text-fg">{gamesText(card.flex)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">
            <MetricLabel id="recent-ranked-games">Recent ranked games (3 patches)</MetricLabel>
          </dt>
          <dd className="text-fg">{card.recentThreePatches.games}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * PLAYER OVERVIEW: quick reference, then one card per configured pool champion with labelled
 * Solo/Duo and Flex figures for the selected game mode and patch window. Used for the player's own
 * Overview page and, as a teammate view, on every profile.
 */
export function PlayerOverview({ data, player, championsById, basePath, selfView, editHref }: { data: PlayerOverviewData; player: { displayName: string; primaryRole: Role; secondaryRole: Role | null }; championsById: Record<string, PortraitChampion>; basePath: string; selfView: boolean; editHref: string | null }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const modeLabel = GAME_MODES.find((m) => m.key === data.mode)?.label ?? "Ranked";
  const windowLabel = PATCH_WINDOWS.find((w) => w.key === data.window)?.label ?? "";
  const whose = selfView ? "your" : `${player.displayName}'s`;
  const othersHref = `${basePath}?${overviewQuery(data.mode, data.window, !data.othersRequested)}`;
  return (
    <div className="space-y-4" id="overview" data-testid="player-overview">
      <Panel>
        <PanelHeader title="QUICK REFERENCE" subtitle={`Roles, rank and ranked results from ${whose} linked Riot accounts. Records follow the patch window; the rank is as last synced.`} />
        <PanelBody className="space-y-3">
          <OverviewFilters basePath={basePath} mode={data.mode} window={data.window} others={data.othersRequested} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                Roles <Info text="Primary role and, when set, secondary role on the player profile. The lineup may assign either." />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-fg">
                <span className="inline-flex items-center gap-1">
                  <RoleIcon role={player.primaryRole} className="h-4 w-4 text-accent" /> {ROLE_LABELS[player.primaryRole]}
                </span>
                {player.secondaryRole ? (
                  <span className="inline-flex items-center gap-1 text-fg-muted">
                    <RoleIcon role={player.secondaryRole} className="h-3.5 w-3.5" /> {ROLE_LABELS[player.secondaryRole]}
                  </span>
                ) : null}
              </div>
            </div>
            <Metric id="rank" value={data.rank?.text ?? (data.accounts.length === 0 ? "No Riot account linked" : "Unranked or not synced yet")} valueClassName={data.rank ? undefined : "text-fg-muted"} />
            <Metric id="solo-record" value={recordText(data.solo)} showUnit={false} valueClassName={data.solo.games ? undefined : "text-fg-muted"} />
            <Metric id="flex-record" value={recordText(data.flex)} showUnit={false} valueClassName={data.flex.games ? undefined : "text-fg-muted"} />
            <Metric id="ranked-patch-games" value={data.currentPatchGames} showUnit={false} />
            <Metric id="last-sync" value={data.lastSyncAt ? timeAgo(data.lastSyncAt) : "never"} valueClassName={data.lastSyncAt ? undefined : "text-fg-muted"} />
          </div>
          <SourceLine source="Stored Riot match history for every linked account (each game counted once) and the ranked tier from Riot's league entries" population={`${data.accounts.length} linked account${data.accounts.length === 1 ? "" : "s"} · ${windowLabel.toLowerCase()}${data.currentPatch ? ` · current patch ${data.currentPatch}` : ""}`} updated={data.lastSyncAt ? timeAgo(data.lastSyncAt) : null} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="CHAMPION POOL"
          subtitle={`${selfView ? "Your" : "The"} configured pool champions, which are the only champions UNIIVERSE drafts for ${selfView ? "you" : player.displayName}. Showing ${modeLabel.toLowerCase()} · ${windowLabel.toLowerCase()}.`}
          actions={
            editHref ? (
              <Link href={editHref} className="text-xs text-accent hover:underline">
                Edit roles &amp; champions →
              </Link>
            ) : null
          }
        />
        <PanelBody className="space-y-3">
          {data.cards.length === 0 ? <p className="text-sm text-fg-muted">No champions configured yet.{editHref ? " Add up to six for the primary role and three for the secondary role." : ""}</p> : null}
          {data.cards.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="pool-cards">
              {data.cards.map((c) => (
                <ChampionCardView key={c.championId} card={c} champion={champ(c.championId)} modeLabel={modeLabel} mode={data.mode} />
              ))}
            </ul>
          ) : null}
          {!data.hasHistory ? <p className="text-xs text-fg-muted">{data.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync completes (a few minutes after linking, then every few hours)."}</p> : null}
          {data.hasHistory ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Link href={othersHref} className="text-accent hover:underline" scroll={false}>
                {data.othersRequested ? "Hide other champions played" : "Show other champions played (outside the pools) →"}
              </Link>
            </div>
          ) : null}
          {data.othersRequested ? (
            data.others.length === 0 ? (
              <p className="text-xs text-fg-muted">No ranked games on champions outside the pools in this window.</p>
            ) : (
              <div data-testid="other-cards">
                <p className="mb-2 text-xs text-fg-muted">Other champions played: ranked games in this window on champions outside the configured pools. They are never recommended until added to a pool.</p>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {data.others.map((c) => (
                    <ChampionCardView key={c.championId} card={c} champion={champ(c.championId)} modeLabel={modeLabel} mode={data.mode} />
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
