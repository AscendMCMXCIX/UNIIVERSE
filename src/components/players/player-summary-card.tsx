import Link from "next/link";
import { ACCENT_COLOR, cardArt, isCardAccent } from "@/domain/player-card";
import { CardArtLayer } from "./card-art";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { RankInline, type CompactRank } from "./rank-emblem";

export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

const RIOT_TONE: Record<RiotState["state"], BadgeTone> = { synced: "good", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/**
 * One player in the directory, in the Team card's visual language: their chosen champion art
 * (the small loading-screen crop, so the directory stays light), picture, name, rank, roles and
 * a peek at their champions. Everything else is on the profile.
 */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot, avatarUrl, rank }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null; avatarUrl: string | null; rank: CompactRank | null }) {
  // The directory previews the Primary Role only; Off Roles and their pools are on the profile.
  const primary = player.primaryPool;
  const preview = primary.slice(0, 7);
  const more = primary.length - preview.length;
  const accent = ACCENT_COLOR[isCardAccent(player.cardAccent) ? player.cardAccent : "default"];
  return (
    <Link href={`/players/${player.id}`} className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong motion-reduce:hover:translate-y-0" data-testid="player-card">
      <div className="relative h-24 shrink-0" data-testid="directory-art">
        <CardArtLayer art={cardArt(player)} accent={accent} kind="loading" position="center 16%" strength="normal" testId="directory-art-image" />
        <span className="absolute right-2.5 top-2.5 flex flex-wrap justify-end gap-1">
          {isYou ? <Badge tone="accent">You</Badge> : null}
          {player.setupPending ? (
            <Badge tone="warn" title="This account has not finished its first-time setup. Only admins see it here; it is not offered for lineups or drafts yet.">
              Setup pending
            </Badge>
          ) : null}
          {player.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
          {lineupRole ? (
            <Badge tone="good" title={`In the current lineup as ${ROLE_LABELS[lineupRole]}`}>
              Lineup · {ROLE_LABELS[lineupRole]}
            </Badge>
          ) : null}
        </span>
      </div>
      <div className="relative -mt-9 flex flex-1 flex-col gap-2.5 px-4 pb-4">
        <div className="flex items-end gap-3">
          <Avatar name={player.displayName} src={avatarUrl} size="lg" ring="accent" />
          <div className="min-w-0 flex-1 pb-0.5">
            <span className="block truncate text-base font-semibold text-fg group-hover:text-accent">{player.displayName}</span>
            <RankInline rank={rank} className="text-xs text-fg-muted" />
          </div>
        </div>
        <div className="mt-auto space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm text-fg" data-testid="directory-primary-role">
            <span style={{ color: accent }} className="inline-flex">
              <RoleIcon role={player.primaryRole} className="h-4 w-4" />
            </span>
            {ROLE_LABELS[player.primaryRole]}
            <span className="text-xs text-fg-subtle">· Primary Role{primary.length ? ` · ${primary.length} champion${primary.length === 1 ? "" : "s"}` : ""}</span>
          </span>
          <div className="flex flex-wrap items-center gap-1" aria-label={`${ROLE_LABELS[player.primaryRole]} champions`} data-testid="directory-pool">
            {preview.length === 0 ? <span className="text-xs text-fg-subtle">No {ROLE_LABELS[player.primaryRole]} champions yet</span> : null}
            {preview.map((id) => (
              <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="sm" />
            ))}
            {more > 0 ? <span className="grid h-8 min-w-8 place-items-center rounded-md border border-border px-1.5 text-xs text-fg-muted">+{more}</span> : null}
          </div>
        </div>
        {riot && riot.state !== "synced" ? (
          <Badge tone={RIOT_TONE[riot.state]} className="self-start" title={`Riot data: ${riot.label}`}>
            Riot: {riot.label}
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}
