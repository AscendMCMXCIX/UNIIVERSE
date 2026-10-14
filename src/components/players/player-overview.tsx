import Link from "next/link";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { GameRecord } from "@/domain/player-stats";
import { seasonModeInfo, seasonQuery } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { TIER_DESCRIPTIONS, type ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Info, Metric, SourceLine } from "@/components/ui/metric";
import { InfoTip } from "@/components/ui/info-tip";
import { percent, timeAgo } from "@/lib/format";
import { OverviewFilters } from "./overview-filters";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

function recordText(r: GameRecord): string {
  if (r.games === 0) return "No games";
  return `${r.wins}W ${r.losses}L · ${percent(r.winRate ?? 0, 0)}`;
}

function gamesText(r: GameRecord): string {
  if (r.games === 0) return "No games";
  return `${r.games} game${r.games === 1 ? "" : "s"} · ${r.wins}W ${r.losses}L · ${percent(r.winRate ?? 0, 0)}`;
}

function points(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
}

function MasteryLine({ card }: { card: OverviewCard }) {
  const m = card.mastery;
  if (!m) return <dd className="text-fg-muted">No mastery recorded</dd>;
  const label = `${points(m.points)} pts · level ${m.level}`;
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
              {a.account}: {a.points.toLocaleString("en")} pts (level {a.level})
            </li>
          ))}
        </ul>
      </details>
    </dd>
  );
}

function ChampionCardView({ card, champion, mode }: { card: OverviewCard; champion: PortraitChampion; mode: PlayerOverviewData["mode"] }) {
  const modeLabel = seasonModeInfo(mode).label;
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
        <span className="flex items-center gap-1 text-[11px] text-fg-muted">
          <Badge tone={TIER_TONE[card.tier]}>{card.tierLabel}</Badge>
          <InfoTip text={`Proficiency: ${TIER_DESCRIPTIONS[card.tier]}`} label={`What ${card.tierLabel} means`} />
        </span>
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">Mastery</dt>
          <MasteryLine card={card} />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{modeLabel}</dt>
          <dd className="font-medium text-fg">{gamesText(card.selected)}</dd>
        </div>
        {mode === "all" && card.selected.games > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">By mode</dt>
            <dd className="text-fg">
              Solo {card.solo.games} · Flex {card.flex.games} · Normal {card.normal.games}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">Last played</dt>
          <dd className="text-fg">{card.selected.lastPlayedAt ? timeAgo(card.selected.lastPlayedAt) : card.mastery?.lastPlayedAt ? `${timeAgo(card.mastery.lastPlayedAt)} (mastery)` : "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * MY OVERVIEW / teammate profile statistics: quick reference for the selected season, then one card
 * per configured pool champion with combined mastery, season games in the selected game mode and
 * the proficiency label. Used for the player's own page and, read-only, on every profile.
 */
export function PlayerOverview({ data, player, championsById, basePath, selfView, editHref }: { data: PlayerOverviewData; player: { displayName: string; primaryRole: Role; secondaryRole: Role | null }; championsById: Record<string, PortraitChampion>; basePath: string; selfView: boolean; editHref: string | null }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const mode = seasonModeInfo(data.mode);
  const whose = selfView ? "your" : `${player.displayName}'s`;
  const othersHref = `${basePath}?${seasonQuery(data.season, data.mode, !data.othersRequested)}`;
  const seasonName = seasonLabel(data.season);
  return (
    <div className="space-y-4" id="overview" data-testid="player-overview">
      <Panel>
        <PanelHeader title="QUICK REFERENCE" subtitle={`${seasonName} from ${whose} linked Riot accounts. The rank is as last synced.`} />
        <PanelBody className="space-y-3">
          <OverviewFilters basePath={basePath} season={data.season} seasons={data.seasons} currentSeason={data.currentSeason} mode={data.mode} others={data.othersRequested} />
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
            <Metric id="season-record" value={<span data-testid="season-record">{recordText(data.record)}</span>} showUnit={false} valueClassName={data.record.games ? undefined : "text-fg-muted"} />
            <Metric id="season-modes" value={`Solo ${data.byMode.solo.games} · Flex ${data.byMode.flex.games} · Normal ${data.byMode.normal.games}`} showUnit={false} />
            <div className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5" data-testid="season-coverage">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                Season data <Info text={data.completeness.detail} />
              </div>
              <div className={data.completeness.complete ? "text-sm font-semibold text-good" : "text-sm font-semibold text-warn"}>{data.completeness.label}</div>
            </div>
            <Metric id="last-sync" value={data.lastSyncAt ? timeAgo(data.lastSyncAt) : "never"} valueClassName={data.lastSyncAt ? undefined : "text-fg-muted"} />
          </div>
          <SourceLine source="Stored Riot games for every linked account (each game counted once), champion mastery and the ranked tier from Riot" population={`${data.accounts.length} linked account${data.accounts.length === 1 ? "" : "s"} · ${seasonName} · ${mode.description}`} updated={data.lastSyncAt ? timeAgo(data.lastSyncAt) : null} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="CHAMPION POOL"
          subtitle={`${selfView ? "Your" : "The"} configured pool champions, which are the champions UNIIVERSE drafts for ${selfView ? "you" : player.displayName}. Showing ${mode.label.toLowerCase()} · ${seasonName}.`}
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
                <ChampionCardView key={c.championId} card={c} champion={champ(c.championId)} mode={data.mode} />
              ))}
            </ul>
          ) : null}
          {!data.hasHistory ? <p className="text-xs text-fg-muted">{data.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync (a few minutes after linking, then every few hours)."}</p> : null}
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
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
