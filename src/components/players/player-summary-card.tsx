import * as React from "react";
import Link from "next/link";
import { cardArt, type CardArt } from "@/domain/player-card";
import { accentCss, cardLookFor, type CardLook } from "@/domain/card-style";
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
// A few words for each state on the card; the whole sentence is its title and what a screen reader reads.
const RIOT_SHORT: Record<RiotState["state"], string> = { synced: "Riot: up to date", syncing: "Riot: catching up", verified: "Riot: updating", pending: "Riot: updating", stale: "Riot: delayed", error: "Riot: needs attention", none: "No Riot account" };

/**
 * The Players directory card's regions, top to bottom, one row each: the header (the role chip and
 * status badges), the identity's four rows (picture and social links, name, rank, tagline:
 * CardIdentity's `rows`), the pool's label and the pool. The card spans seven rows of the
 * directory's grid and lays its regions on them (a subgrid), so a row is as tall as the tallest
 * region beside it: cards side by side keep every region level and end together, and a part one
 * card lacks leaves its room instead of pulling the rest up. The artwork lies behind the first five
 * rows. The same card stands alone in the Studio's preview, as a grid of its own.
 *
 * The card is not a size container itself (that would make it lay out on its own, and it would stop
 * lining up with its neighbours): its parts' 17rem steps answer to the `card` container around it,
 * the directory (PlayersDirectory) or the preview's frame.
 */
export function DirectoryCardLayout({ look, art, header, identity, poolLabel, pool, overlay, artTestId = "directory-art-image", smooth = true, className, ...rest }: { look: CardLook; art: CardArt | null; header: React.ReactNode; /** CardIdentity with layout="rows". */ identity: React.ReactNode; poolLabel: React.ReactNode; pool: React.ReactNode; /** The link laid over the whole card. */ overlay?: React.ReactNode; artTestId?: string; smooth?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("group relative row-span-7 mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid overflow-hidden rounded-card border border-border bg-surface pb-3.5", className)} style={cardShellStyle(look, { glow: false })} {...rest}>
      <CardFrame look={look} />
      {overlay}
      <div className="relative col-start-1 row-span-5 row-start-1" data-testid="directory-art">
        <CardArtLayer art={art} accent={accentCss(look.style)} kind="loading" position="center 16%" strength="normal" testId={artTestId} look={look} decorate={false} smooth={smooth} foot />
      </div>
      <div className="relative col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-1.5 px-3 pt-3">{header}</div>
      <div className="relative col-start-1 row-span-4 row-start-2 mt-3 grid min-w-0 grid-rows-subgrid px-3 pb-2.5">{identity}</div>
      <div className="col-start-1 row-start-6 min-w-0 px-3.5 pt-3">{poolLabel}</div>
      <div className="col-start-1 row-start-7 min-h-11 min-w-0 px-3.5 pt-2">{pool}</div>
    </div>
  );
}

/**
 * The pool's heading on one line: what it is at the start (shortened with an ellipsis only where a
 * card is too narrow, whole in its title) and its size at the end, read together as "Support ·
 * Primary Role · 6 champions".
 */
export function DirectoryPoolLabel({ heading, count }: { heading: string; count: number | null }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 text-xs text-fg-subtle" data-testid="directory-primary-role">
      <span className="min-w-0 truncate" title={heading}>
        {heading}
      </span>
      {count ? (
        <>
          <span className="sr-only"> · </span>
          <span className="ml-auto shrink-0 tabular-nums">
            {count} champion{count === 1 ? "" : "s"}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * A Riot state other than up to date, after the rank: a few words, the whole sentence in its title. No
 * taller than the rank's line, so a card with one is as tall as its neighbours.
 */
function RiotNote({ riot }: { riot: RiotState }) {
  return (
    <span className="ml-auto flex min-w-0" title={`Riot data: ${riot.label}`} data-testid="directory-riot" data-state={riot.state}>
      <Badge tone={RIOT_TONE[riot.state]} className="-my-0.5 min-w-0">
        <span className="min-w-0 truncate" aria-hidden>
          {RIOT_SHORT[riot.state]}
        </span>
        <span className="sr-only">Riot data: {riot.label}</span>
      </Badge>
    </span>
  );
}

/**
 * One player in the directory, built from the same pieces as the Team card (player-card.tsx) on the
 * directory's own regions (DirectoryCardLayout): the role chip and status badges, the identity, then
 * their Primary Role and its champions, as many whole portraits as the card's width holds and the
 * rest counted. The artwork is the small loading-screen crop, so the directory stays light. The
 * whole card opens the profile, through one link laid over the card and named after the player
 * (the Team card does the same with its button), so the social icons drawn above it stay links of
 * their own, in the same place as on every other card.
 */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot, avatarUrl, rank, showRank = true, social = [], reserveTagline = false }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null; avatarUrl: string | null; rank: CompactRank | null; /** False: the viewer may not see this player's rank; its line is left out, not "Unranked". */ showRank?: boolean; social?: readonly SocialLinkView[]; /** Some card in the directory has a tagline: keep its line on this one too. */ reserveTagline?: boolean }) {
  // The directory previews the Primary Role only; Off Roles and their pools are on the profile.
  const primary = player.primaryPool;
  // The same personal look as the Team card, without animated effects or glow (a small card in a long grid).
  const look = cardLookFor(player);
  const badges = player.setupPending || player.archivedAt || lineupRole;
  return (
    <DirectoryCardLayout
      look={look}
      art={cardArt(player)}
      className="transition-colors duration-150 hover:border-border-strong"
      data-testid="player-card-item"
      data-player-name={player.displayName}
      data-frame={look.style.frame}
      overlay={
        <Link href={`/players/${player.id}`} className="absolute inset-0 z-[1] rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-testid="player-card" data-player-name={player.displayName}>
          <span className="sr-only">{player.displayName}</span>
        </Link>
      }
      header={
        <>
          <CardRoleChip role={player.primaryRole} label={player.primaryRole ? ROLE_LABELS[player.primaryRole] : "Roles not set"} className="px-2.5 py-0.5 text-xs" />
          {/* At the far end; on a card too narrow for both, on a line of their own under the chip. */}
          {badges ? (
            <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-1">
              {player.setupPending ? <SetupIncompleteBadge /> : null}
              {player.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
              {lineupRole ? (
                <span className="inline-flex" data-testid="directory-lineup">
                  <Badge tone="good" title={`In the current lineup as ${ROLE_LABELS[lineupRole]}`} className="whitespace-nowrap">
                    Lineup · {ROLE_LABELS[lineupRole]}
                  </Badge>
                </span>
              ) : null}
            </span>
          ) : null}
        </>
      }
      identity={<CardIdentity layout="rows" look={look} name={player.displayName} avatarUrl={avatarUrl} rank={rank} showRank={showRank} isYou={isYou} nameClassName="group-hover:text-accent" tag={riot && riot.state !== "synced" ? <RiotNote riot={riot} /> : null} social={social.length ? <CardSocialIcons links={social} owner={player.displayName} className="relative z-[2]" /> : null} reserveTagline={reserveTagline} />}
      poolLabel={
        player.primaryRole ? (
          <DirectoryPoolLabel heading={`${ROLE_LABELS[player.primaryRole]} · Primary Role`} count={primary.length} />
        ) : (
          <span className="block text-xs text-fg-muted" data-testid="directory-no-roles">
            Roles and champions not set up yet
          </span>
        )
      }
      pool={player.primaryRole ? <PoolPreview champions={primary.map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })} total={primary.length} label={`${ROLE_LABELS[player.primaryRole]} champions`} fit="count" testId="directory-pool" /> : null}
    />
  );
}
