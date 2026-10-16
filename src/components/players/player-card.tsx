import * as React from "react";
import type { Role } from "@/domain/roles";
import type { CardLook } from "@/domain/card-style";
import type { ProficiencyTier } from "@/domain/proficiency";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { CardAvatar, CardName, CardTagline } from "./card-look";
import { RankInline, type CompactRank } from "./rank-emblem";
import { RoleStatusBadge } from "./role-status-badge";
import { TierBadge } from "./tier-badge";

/*
  The pieces every player card is made of, so the Team card, its detail panel, the Players
  directory and the Card Studio preview read as one object: the role chip, the identity block
  (avatar, tagline, name, rank, role status), the season figures, a small pool preview and the
  full pool rows. Each page arranges them for its purpose; the pieces themselves look the same.
*/

/** The role chip in the card's top-left corner. */
export function CardRoleChip({ role, label, className }: { role: Role | null; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-3 py-1 text-sm font-semibold uppercase tracking-[0.14em] text-fg", className)} data-testid="assigned-role">
      {role ? (
        <span style={{ color: "var(--card-accent)" }} className="inline-flex">
          <RoleIcon role={role} className="h-4 w-4" />
        </span>
      ) : (
        <span style={{ color: "var(--card-accent)" }} aria-hidden>
          ●
        </span>
      )}{" "}
      {label}
    </span>
  );
}

/** Avatar, tagline, name (and "You"), then rank and role status: the bottom of the card's artwork. */
/** `showRank={false}` leaves the rank out entirely (not "Unranked"): for viewers who may not see the player's statistics. */
export function CardIdentity({ look, name, avatarUrl, rank, showRank = true, isYou = false, status, role, size = "lg", nameClassName }: { look: CardLook | null | undefined; name: string; avatarUrl: string | null; rank: CompactRank | null; showRank?: boolean; isYou?: boolean; status?: "main" | "off" | null; role?: Role | null; size?: "md" | "lg"; nameClassName?: string }) {
  return (
    <span className="flex min-w-0 items-end gap-3">
      <CardAvatar look={look} name={name} src={avatarUrl} size={size} />
      <span className="min-w-0 pb-0.5">
        {/* The tagline sits above the name, so names and figures line up on every card. */}
        <CardTagline look={look} className="drop-shadow" />
        <span className="flex min-w-0 items-center gap-1.5">
          <CardName look={look} name={name} className={cn("truncate text-lg leading-tight text-fg drop-shadow", nameClassName)} />
          {isYou ? <Badge tone="accent">You</Badge> : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-muted" data-testid="card-fit">
          {showRank ? <RankInline rank={rank} /> : null}
          {status && role ? <RoleStatusBadge status={status} role={role} /> : null}
        </span>
      </span>
    </span>
  );
}

export interface SeasonFigures {
  games: number;
  winRate: number | null;
  kda: number | null;
  csPerMinute: number | null;
  visionPerGame: number | null;
}

/** Games, win rate, KDA and CS/min (average vision for Support): the card's four figures. */
export function SeasonTiles({ season, support, placeholder = false }: { season: SeasonFigures | null; support: boolean; placeholder?: boolean }) {
  const dash = "—";
  const tile = "rounded-lg bg-bg-elevated px-1 py-1.5";
  return (
    <dl className="grid grid-cols-4 gap-1.5 text-center" data-testid="card-season">
      <div className={tile}>
        <dt className="text-xs text-fg-subtle">Games</dt>
        <dd className="text-base font-semibold tabular-nums text-fg">{placeholder ? dash : (season?.games ?? 0)}</dd>
      </div>
      <div className={tile}>
        <dt className="whitespace-nowrap text-xs tracking-tight text-fg-subtle">Win rate</dt>
        <dd className={cn("text-base font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(season?.winRate, season?.games, WIN_RATE_MIN_GAMES.season)])} title={winRateSampleNote(season?.winRate, season?.games, WIN_RATE_MIN_GAMES.season) ?? undefined}>
          {placeholder || season?.winRate == null ? dash : `${Math.round(season.winRate * 100)}%`}
        </dd>
      </div>
      <div className={tile}>
        <dt className="text-xs text-fg-subtle">KDA</dt>
        <dd className="text-base font-semibold tabular-nums text-fg">{placeholder || season?.kda == null ? dash : season.kda.toFixed(2)}</dd>
      </div>
      {support ? (
        <div className={tile} title="Average vision score per game in Support games this season (per game, not per minute)">
          <dt className="whitespace-nowrap text-[0.6875rem] leading-4 tracking-tight text-fg-subtle">Avg vision</dt>
          <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-vision">
            {placeholder || season?.visionPerGame == null ? dash : season.visionPerGame.toFixed(1)}
          </dd>
        </div>
      ) : (
        <div className={tile} title="Creep score per minute: lane minions plus monsters, over the games with both recorded">
          <dt className="text-xs text-fg-subtle">CS/min</dt>
          <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-cs">
            {placeholder || season?.csPerMinute == null ? dash : season.csPerMinute.toFixed(1)}
          </dd>
        </div>
      )}
    </dl>
  );
}

// With `fit`, portrait i (2.25rem each, 0.25rem apart) is dropped whole when the preview is narrower than i + 1 portraits.
const FIT_HIDDEN = ["", "@max-[4.75rem]:hidden", "@max-[7.25rem]:hidden", "@max-[9.75rem]:hidden", "@max-[12.25rem]:hidden", "@max-[14.75rem]:hidden", "@max-[17.25rem]:hidden"];

/**
 * A few pool champions as portraits, in the player's order, with the rest counted ("+3"): enough to
 * recognise a pool at a glance. The full pool lives in the detail panel and on the profile.
 *
 * `fit` (Team cards): the preview takes the room beside the pool label and shows only the
 * portraits that fit there, without a "+N" count, because the label already gives the pool's size.
 * Nothing overlaps the label at any card width.
 */
export function PoolPreview({ champions, total, label, max = 4, fit = false, testId = "pool-preview" }: { champions: PortraitChampion[]; total: number; label: string; max?: number; fit?: boolean; testId?: string }) {
  const shown = champions.slice(0, fit ? Math.min(max, FIT_HIDDEN.length) : max);
  const more = total - shown.length;
  const row = (
    <div className="flex min-w-0 items-center gap-1" aria-label={label} data-testid={testId}>
      {shown.length === 0 ? <span className="text-xs text-warn">No champions yet</span> : null}
      {shown.map((c, i) =>
        fit ? (
          <span key={c.id} className={cn("shrink-0", FIT_HIDDEN[i])}>
            <ChampionPortrait champion={c} size="sm" />
          </span>
        ) : (
          <ChampionPortrait key={c.id} champion={c} size="sm" />
        ),
      )}
      {more > 0 && !fit ? <span className="grid h-9 min-w-9 place-items-center rounded-md border border-border px-1.5 text-xs text-fg-muted">+{more}</span> : null}
    </div>
  );
  return fit ? <div className="@container min-w-0 flex-1">{row}</div> : row;
}

/** One champion of a role pool with its figures in that role. */
export interface PoolRowChampion {
  championId: string;
  tier: string;
  tierLabel: string;
  tierWhy: string;
  evidence: React.ComponentProps<typeof TierBadge>["evidence"];
  games: number;
  winRate: number | null;
  kdaRatio: number | null;
  perfectKda: boolean;
  csPerMinute: number | null;
  visionPerGame: number | null;
  masteryPoints: number | null;
}

export function compactPoints(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
}

/**
 * The full row for a pool champion: order, portrait, name and proficiency on the left; win rate,
 * games and KDA with CS/min (vision for Support) on the right. With no games this season, the
 * mastery points stand in, labelled as mastery so they are never read as a result. With
 * `withStats={false}` only the champion is shown (order and name), for viewers who may not see
 * the player's statistics.
 */
export function PoolChampionRow({ index, champion, row, support, withStats = true }: { index: number; champion: PortraitChampion; row: PoolRowChampion; support: boolean; withStats?: boolean }) {
  return (
    <li className="flex min-h-12 items-center gap-2.5 py-1.5" data-testid="pool-champion" data-champion={row.championId}>
      <span className="w-4 shrink-0 text-right text-[0.6875rem] font-semibold tabular-nums text-fg-subtle" aria-hidden>
        {index + 1}
      </span>
      <ChampionPortrait champion={champion} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{champion.name}</span>
        {withStats ? (
          <span className="mt-0.5 block">
            <TierBadge tier={row.tier as ProficiencyTier} label={row.tierLabel} why={row.tierWhy} evidence={row.evidence} compact />
          </span>
        ) : null}
      </span>
      {withStats ? (
        <span className="shrink-0 text-right leading-tight" data-testid="pool-champion-stats">
          {row.games ? (
            <>
              <span className={cn("block text-sm font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(row.winRate, row.games, WIN_RATE_MIN_GAMES.champion)])}>{row.winRate === null ? "—" : `${Math.round(row.winRate * 100)}%`}</span>
              <span className="block text-[0.6875rem] tabular-nums text-fg-subtle">
                {row.games} game{row.games === 1 ? "" : "s"}
              </span>
              <span className="block text-[0.6875rem] tabular-nums text-fg-muted" data-testid={support ? "pool-champion-kda-vision" : "pool-champion-kda-cs"}>
                {row.perfectKda ? "Perfect" : row.kdaRatio === null ? "—" : row.kdaRatio.toFixed(1)} KDA · {support ? `${row.visionPerGame === null ? "—" : Math.round(row.visionPerGame)} vis` : `${row.csPerMinute === null ? "—" : row.csPerMinute.toFixed(1)} CS`}
              </span>
            </>
          ) : row.masteryPoints ? (
            <span className="inline-flex items-center gap-1">
              <span className="block text-right">
                <span className="block text-sm font-semibold tabular-nums text-fg-muted">{compactPoints(row.masteryPoints)}</span>
                <span className="block text-[0.6875rem] text-fg-subtle">mastery</span>
              </span>
              <InfoTip label="About mastery points" text={`${row.masteryPoints.toLocaleString("en")} mastery points: lifetime experience on the champion, not this season's results. No games in this role this season.`} />
            </span>
          ) : (
            <span className="block text-[0.6875rem] text-fg-subtle">No games</span>
          )}
        </span>
      ) : null}
    </li>
  );
}
