import Link from "next/link";
import { cardArt } from "@/domain/player-card";
import { accentCss, cardLookFor } from "@/domain/card-style";
import { CardFrame, cardShellStyle } from "./card-look";
import { CardIdentity, CardRoleChip, PoolPreview } from "./player-card";
import { CardArtLayer } from "./card-art";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import type { PortraitChampion } from "@/components/champion-portrait";
import { SetupIncompleteBadge } from "./setup-incomplete";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CompactRank } from "./rank-emblem";
import { CardSocialIcons } from "./social-links";
import { cn } from "@/lib/cn";
import type { SocialLinkView } from "@/domain/social-links";

export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

const RIOT_TONE: Record<RiotState["state"], BadgeTone> = { synced: "good", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/**
 * One player in the directory, built from the same pieces as the Team card (player-card.tsx): the
 * role chip and status badges over their artwork (the small loading-screen crop, so the directory
 * stays light), the identity block, then their Primary Role and a preview of its champions. The
 * whole card opens the profile, through one link laid over the card and named after the player
 * (the Team card does the same with its button), so the social icons drawn above it stay links of
 * their own, in the same place as on every other card.
 */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot, avatarUrl, rank, social = [] }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null; avatarUrl: string | null; rank: CompactRank | null; social?: readonly SocialLinkView[] }) {
  // The directory previews the Primary Role only; Off Roles and their pools are on the profile.
  const primary = player.primaryPool;
  // The same personal look as the Team card, without animated effects or glow (a small card in a long grid).
  const look = cardLookFor(player);
  const accent = accentCss(look.style);
  // Two badges can take a second line at the artwork's top-right: the identity starts below them.
  const badges = [player.setupPending, player.archivedAt, lineupRole].filter(Boolean).length;
  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors duration-150 hover:border-border-strong" style={cardShellStyle(look, { glow: false })} data-testid="player-card-item" data-player-name={player.displayName} data-frame={look.style.frame}>
      <CardFrame look={look} />
      <Link href={`/players/${player.id}`} className="absolute inset-0 z-[1] rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-testid="player-card" data-player-name={player.displayName}>
        <span className="sr-only">{player.displayName}</span>
      </Link>
      {/* The artwork's height follows the identity at its foot (a long name, a tagline, links), so nothing is cut off or drawn under the role. */}
      <div className={cn("relative flex min-h-28 flex-col justify-end px-3 pb-2.5", badges > 1 ? "pt-16" : "pt-10")} data-testid="directory-art">
        <CardArtLayer art={cardArt(player)} accent={accent} kind="loading" position="center 16%" strength="normal" testId="directory-art-image" look={look} decorate={false} foot />
        <CardRoleChip role={player.primaryRole} label={player.primaryRole ? ROLE_LABELS[player.primaryRole] : "Roles not set"} className="absolute left-3 top-3 px-2.5 py-0.5 text-xs" />
        <span className="absolute right-2.5 top-2.5 flex max-w-[60%] flex-wrap justify-end gap-1">
          {player.setupPending ? <SetupIncompleteBadge /> : null}
          {player.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
          {lineupRole ? (
            <Badge tone="good" title={`In the current lineup as ${ROLE_LABELS[lineupRole]}`}>
              Lineup · {ROLE_LABELS[lineupRole]}
            </Badge>
          ) : null}
        </span>
        <span className="relative">
          <CardIdentity look={look} name={player.displayName} avatarUrl={avatarUrl} rank={rank} isYou={isYou} nameClassName="text-base group-hover:text-accent" social={social.length ? <CardSocialIcons links={social} owner={player.displayName} className="relative z-[2]" /> : null} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-3">
        {player.primaryRole ? (
          <>
            <span className="text-xs text-fg-subtle" data-testid="directory-primary-role">
              {ROLE_LABELS[player.primaryRole]} · Primary Role{primary.length ? ` · ${primary.length} champion${primary.length === 1 ? "" : "s"}` : ""}
            </span>
            <PoolPreview champions={primary.map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })} total={primary.length} label={`${ROLE_LABELS[player.primaryRole]} champions`} max={7} testId="directory-pool" />
          </>
        ) : (
          <span className="text-xs text-fg-muted" data-testid="directory-no-roles">
            Roles and champions not set up yet
          </span>
        )}
        {riot && riot.state !== "synced" ? (
          <Badge tone={RIOT_TONE[riot.state]} className="mt-auto self-start" title={`Riot data: ${riot.label}`}>
            Riot: {riot.label}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
