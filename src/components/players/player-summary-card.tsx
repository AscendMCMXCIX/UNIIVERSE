import Link from "next/link";
import { cardArt } from "@/domain/player-card";
import { accentCss, cardLookFor } from "@/domain/card-style";
import { CardFrame, cardShellStyle } from "./card-look";
import { CardIdentity, CardRoleChip, PoolPreview } from "./player-card";
import { CardArtLayer } from "./card-art";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import type { PortraitChampion } from "@/components/champion-portrait";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CompactRank } from "./rank-emblem";

export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

const RIOT_TONE: Record<RiotState["state"], BadgeTone> = { synced: "good", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/**
 * One player in the directory, built from the same pieces as the Team card (player-card.tsx): the
 * role chip and status badges over their artwork (the small loading-screen crop, so the directory
 * stays light), the identity block, then their Primary Role and a preview of its champions. The
 * whole card opens the profile, where everything else is.
 */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot, avatarUrl, rank }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null; avatarUrl: string | null; rank: CompactRank | null }) {
  // The directory previews the Primary Role only; Off Roles and their pools are on the profile.
  const primary = player.primaryPool;
  // The same personal look as the Team card, without animated effects or glow (a small card in a long grid).
  const look = cardLookFor(player);
  const accent = accentCss(look.style);
  return (
    <Link href={`/players/${player.id}`} className="group relative flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors duration-150 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent" style={cardShellStyle(look, { glow: false })} data-testid="player-card" data-frame={look.style.frame}>
      <CardFrame look={look} />
      <div className="relative h-28 shrink-0 overflow-hidden" data-testid="directory-art">
        <CardArtLayer art={cardArt(player)} accent={accent} kind="loading" position="center 16%" strength="normal" testId="directory-art-image" look={look} decorate={false} />
        <CardRoleChip role={player.primaryRole} label={ROLE_LABELS[player.primaryRole]} className="absolute left-3 top-3 px-2.5 py-0.5 text-xs" />
        <span className="absolute right-2.5 top-2.5 flex max-w-[60%] flex-wrap justify-end gap-1">
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
        <span className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
          <CardIdentity look={look} name={player.displayName} avatarUrl={avatarUrl} rank={rank} isYou={isYou} nameClassName="text-base group-hover:text-accent" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-3">
        <span className="text-xs text-fg-subtle" data-testid="directory-primary-role">
          {ROLE_LABELS[player.primaryRole]} · Primary Role{primary.length ? ` · ${primary.length} champion${primary.length === 1 ? "" : "s"}` : ""}
        </span>
        <PoolPreview champions={primary.map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })} total={primary.length} label={`${ROLE_LABELS[player.primaryRole]} champions`} max={7} testId="directory-pool" />
        {riot && riot.state !== "synced" ? (
          <Badge tone={RIOT_TONE[riot.state]} className="mt-auto self-start" title={`Riot data: ${riot.label}`}>
            Riot: {riot.label}
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}
