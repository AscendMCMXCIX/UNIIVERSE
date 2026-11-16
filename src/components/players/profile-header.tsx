"use client";

import { usePathname } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { accentCss } from "@/domain/card-style";
import { CardAvatar, CardFrame, CardName, CardTagline, cardShellStyle } from "./card-look";
import type { PickerChampion } from "@/components/champions/types";
import { Avatar } from "@/components/ui/avatar";
import { SetupIncompleteBadge } from "./setup-incomplete";
import { Badge } from "@/components/ui/badge";
import { RoleIcon } from "@/components/role-icon";
import { CardArtLayer } from "./card-art";
import { CustomiseCardButton } from "./customise-card-button";
import { ProfileAvatarEditable } from "@/components/profile/avatar-upload";
import { useHeaderIdentity, type HeaderIdentity } from "./profile-identity";
import { RankEmblem, rankLabel } from "./rank-emblem";
import { SocialLinks } from "./social-links";
import { formatDayMonth } from "@/lib/format";
import { cn } from "@/lib/cn";

const QUEUE_LABEL = { solo: "Solo/Duo", flex: "Flex" } as const;

/** "Main lineup · Top": the role the player holds in the current lineup, a status pill in the accent (one form on both headers). */
function LineupStatus({ role, className }: { role: Role; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-fg", className)} data-testid="lineup-status" title="Plays this role in the current team lineup">
      <RoleIcon role={role} className="h-3.5 w-3.5 text-accent" /> Main lineup · {ROLE_LABELS[role]}
    </span>
  );
}

/**
 * The profile header: the player's Team card, expanded. Same artwork (chosen champion and skin),
 * accent, picture, roles and rank. "Main lineup" is a status, so it reads as one; Customise is a
 * small control in the artwork's corner for whoever may edit the card. On the profile's other
 * sections (All Champions, Match History, Riot Accounts) the card is one compact band, so their
 * content starts within the first screen of a phone; the Overview shows it in full. The band keeps
 * the player's identity where it has the room (from `sm`): their tagline on one line after the
 * name, the lineup status after the rank, the setup badge; a phone's band stays two short lines.
 * A rank this viewer may not see (`identity.showRank` false: a teammate's, without "view teammates'
 * statistics") is left out of both, never shown as "Unranked".
 */
export function ProfileHeader({ identity: served, self, editable = false, champions = [], basePath }: { identity: HeaderIdentity; self: boolean; editable?: boolean; champions?: PickerChampion[]; /** The profile's Overview address: any other section shows the compact band. */ basePath?: string }) {
  const p = useHeaderIdentity(served);
  const pathname = usePathname();
  const accent = accentCss(p.look.style);
  const rank = p.showRank ? p.rank : null;
  const asOf = rank?.asOf ? formatDayMonth(rank.asOf) : null;
  const rankTitle = rank ? `${rank.queue ? `Ranked ${QUEUE_LABEL[rank.queue]}` : "Ranked"}: last known rank${asOf ? `, read from Riot on ${asOf}` : ""}` : "No ranked placement on record";
  const customise = (variant: "overlay" | "icon", iconOnPhones = false) => (
    <CustomiseCardButton
      variant={variant}
      iconOnPhones={iconOnPhones}
      ownLinks={self}
      playerId={p.playerId}
      name={p.displayName}
      avatarUrl={p.avatarUrl}
      art={p.art}
      accent={p.accent}
      look={p.look}
      champions={champions}
      poolIds={p.featurable}
      // The card as Team shows it: the lineup role when they hold one, else the Primary Role (figures load on Team only).
      preview={{ role: p.lineupRole ?? p.primaryRole, rank, showRank: p.showRank, status: p.lineupRole ? (p.lineupRole === p.primaryRole ? "main" : "off") : p.primaryRole ? "main" : null, season: null, poolIds: p.featurable, social: p.social }}
    />
  );
  if (basePath && pathname !== basePath && pathname.startsWith(`${basePath}/`))
    return (
      <header className="relative overflow-hidden rounded-card border border-border bg-surface" style={cardShellStyle(p.look)} data-testid="profile-header" data-compact data-art-champion={p.art?.championId ?? ""} data-accent={p.accent} data-frame={p.look.style.frame}>
        <CardArtLayer art={p.art} accent={accent} kind="splash" position="center 25%" strength="strong" testId="profile-art" look={p.look} />
        <CardFrame look={p.look} />
        {/* One band: the picture, the name (its tagline after it from sm, cut before the name is),
            then the role, the rank and the lineup status on one line; the off roles in full, the
            links and the picture's editor stay on the Overview. */}
        <div className="relative flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
          <CardAvatar look={p.look} name={p.displayName} src={p.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-lg tracking-tight text-fg drop-shadow sm:shrink-0 sm:text-xl">
                <CardName look={p.look} name={p.displayName} />
              </h1>
              {self ? <Badge tone="accent">You</Badge> : null}
              {p.archived ? <Badge tone="warn">Archived</Badge> : null}
              {p.setupPending ? <SetupIncompleteBadge /> : null}
              <CardTagline look={p.look} lines={1} className="min-w-0 drop-shadow max-sm:hidden" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-muted">
              {p.primaryRole ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-fg">
                  <span style={{ color: "var(--card-accent)" }} className="inline-flex">
                    <RoleIcon role={p.primaryRole} className="h-3.5 w-3.5" />
                  </span>
                  {ROLE_LABELS[p.primaryRole]}
                </span>
              ) : null}
              {p.showRank ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-fg" data-testid="profile-rank" title={rankTitle}>
                  <RankEmblem tier={rank?.tier} className="h-4 w-4" />
                  {rank ? (
                    <>
                      {rankLabel(rank.tier, rank.division)}
                      <span className="text-fg-muted">· {rank.leaguePoints} LP</span>
                    </>
                  ) : (
                    <span className="text-fg-muted">Unranked</span>
                  )}
                </span>
              ) : null}
              {p.lineupRole ? <LineupStatus role={p.lineupRole} className="max-sm:hidden" /> : null}
            </div>
          </div>
          {editable ? <div className="relative z-10 shrink-0">{customise("icon")}</div> : null}
        </div>
      </header>
    );
  return (
    <header className="relative overflow-hidden rounded-card border border-border bg-surface" style={cardShellStyle(p.look)} data-testid="profile-header" data-art-champion={p.art?.championId ?? ""} data-accent={p.accent} data-frame={p.look.style.frame}>
      {/* The Overview's largest element at every width: fetched at once and ahead of the rest (the compact band stays lazy: there the content below it is the largest). */}
      <CardArtLayer art={p.art} accent={accent} kind="splash" position="center 25%" strength="normal" testId="profile-art" look={p.look} foot priority />
      <CardFrame look={p.look} />
      {/* Customise: a labelled overlay from sm, a round icon chip on phones (its word read out). */}
      {editable ? <div className="absolute right-2.5 top-2.5 z-10 sm:right-3 sm:top-3">{customise("overlay", true)}</div> : null}
      {/* Phones: the picture beside the name, then roles, rank and links across the full width (a
          narrow column beside the picture would break the rank over three lines). From sm up: the
          picture at the left, everything else beside it. A phone held sideways has little height:
          the header keeps to what it shows (no art band above it) and leaves the room on the right
          for Customise, so the tabs and the page start within the first screen. On a phone held
          upright the art shows behind the header with no band of its own above the name (204px
          tall, it left the first screen no figure on an SE): the season starts higher. */}
      <div className={cn("relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-4 sm:flex sm:min-h-40 sm:items-end sm:gap-4 sm:p-5 sm:pt-12 lg:min-h-32 lg:pt-9 short:min-h-0 short:py-3", editable && "short:pr-32")}>
        <CardAvatar look={p.look} name={p.displayName} src={p.avatarUrl}>
          {self ? <ProfileAvatarEditable name={p.displayName} src={p.avatarUrl} /> : <Avatar name={p.displayName} src={p.avatarUrl} size="hero" />}
        </CardAvatar>
        <div className="contents sm:block sm:min-w-0 sm:flex-1 sm:pb-0.5">
          {/* On a phone the Customise chip sits at the name's row end: the name keeps clear of it. */}
          <div className={cn("min-w-0", editable && "max-sm:pr-10")}>
            <CardTagline look={p.look} className="text-sm drop-shadow" />
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 max-w-full text-2xl tracking-tight text-fg drop-shadow sm:text-3xl">
                <CardName look={p.look} name={p.displayName} />
              </h1>
              {self ? <Badge tone="accent">You</Badge> : null}
              {p.archived ? <Badge tone="warn">Archived</Badge> : null}
              {p.setupPending ? <SetupIncompleteBadge /> : null}
            </div>
          </div>
          <div className="col-span-2 min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted sm:mt-1.5">
              {p.primaryRole ? (
                <span className="inline-flex items-center gap-1.5 text-fg">
                  <span style={{ color: "var(--card-accent)" }} className="inline-flex">
                    <RoleIcon role={p.primaryRole} className="h-4 w-4" />
                  </span>
                  {ROLE_LABELS[p.primaryRole]}
                </span>
              ) : (
                <span className="text-fg-subtle" data-testid="profile-no-role">
                  No role chosen yet
                </span>
              )}
              {p.offRoles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1.5 whitespace-nowrap" data-testid="additional-role">
                  {/* On a phone "(off)" (the word "role" read out), so an off role is told from the main one in words, not by colour alone. */}
                  <RoleIcon role={r} className="h-4 w-4 text-fg-subtle" /> {ROLE_LABELS[r]}{" "}
                  <span className="text-fg-subtle">
                    (off<span className="max-sm:sr-only"> role</span>)
                  </span>
                </span>
              ))}
              {p.showRank ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg" data-testid="profile-rank" title={rankTitle}>
                  <RankEmblem tier={rank?.tier} className="h-5 w-5" />
                  {rank ? (
                    <>
                      {rankLabel(rank.tier, rank.division)}
                      <span className="text-fg-muted">· {rank.leaguePoints} LP</span>
                      {rank.queue ? <span className="text-xs text-fg-subtle">{QUEUE_LABEL[rank.queue]}</span> : null}
                    </>
                  ) : (
                    <span className="text-fg-muted">Unranked</span>
                  )}
                </span>
              ) : null}
              {p.lineupRole ? <LineupStatus role={p.lineupRole} /> : null}
            </div>
            <SocialLinks links={p.social} owner={p.displayName} className="mt-2" />
          </div>
        </div>
      </div>
    </header>
  );
}
