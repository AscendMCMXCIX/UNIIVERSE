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

/** The Overview's picture in its band held sideways (a short window): 56px, as on a phone, beside one line of name and one of roles and rank. */
const SHORT_PICTURE = "short:h-14 short:w-14 short:text-lg";

/**
 * The Overview's band held sideways (a short window) keeps to one line of name and one of roles, rank
 * and links, so it stays within 80px: the roles line is a container (`meta`), and where it is narrow
 * the primary role shows its icon alone (below 23.5rem) and the lineup status its short form
 * "Lineup" (below 29rem), each still read out in full. Measured on 18 Nov 2026 at 100% text against
 * the longest line it is made to hold, the primary role "Support", two off roles (as icons),
 * "Grandmaster · 1234 LP" and "Main lineup · Support" (10.1rem; "Lineup" 4.9rem), with the line's
 * gaps: 27.7rem in full, 22.5rem with the short status, 19.4rem with the role's icon alone too, and
 * below sm, where the status is not shown, 16.9rem and 13.9rem; with three links beside it the line
 * is 16.5rem on a 568px phone and 20rem at 640px. Past that (three or four off roles on the
 * narrowest phones) the line wraps rather than cut anything off.
 */
const SIDEWAYS_META = { container: "short:@container/meta", role: "short:@max-[23.5rem]/meta:sr-only", status: "short:@max-[29rem]/meta:sr-only", statusShort: "hidden short:@max-[29rem]/meta:inline" } as const;

/** "Main lineup · Top": the role the player holds in the current lineup, a status pill in the accent (one form on both headers). `sideways`: in the Overview's band, "Lineup" where its line is narrow (SIDEWAYS_META). */
function LineupStatus({ role, className, sideways = false }: { role: Role; className?: string; sideways?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-fg", className)} data-testid="lineup-status" title="Plays this role in the current team lineup">
      <RoleIcon role={role} className="h-3.5 w-3.5 text-accent" />{" "}
      {sideways ? (
        <>
          <span className={SIDEWAYS_META.statusShort} aria-hidden>
            Lineup
          </span>
          <span className={SIDEWAYS_META.status}>Main lineup · {ROLE_LABELS[role]}</span>
        </>
      ) : (
        <>Main lineup · {ROLE_LABELS[role]}</>
      )}
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
      {/* Customise: a labelled overlay from sm, a round icon chip on phones (its word read out); held
          sideways the chip too, centred on the band's height. */}
      {editable ? <div className="absolute right-2.5 top-2.5 z-10 sm:right-3 sm:top-3 short:top-1/2 short:-translate-y-1/2">{customise("overlay", true)}</div> : null}
      {/* Phones under 375px: the picture beside the name, then roles, rank and links across the full
          width (a narrow column beside the picture would break the rank over three lines). From
          375px to sm the picture spans two rows, the name and then the roles, rank and links beside
          it, a little tighter (the visible "(off)" had cost a line: 146 to 172px for Demo Top on an
          iPhone 15, whose first screen then showed 3 of the season's 6 figures; 142px this way).
          Those widths are rem media queries, so a larger browser text size keeps the full-width line.
          Under a 17.5rem window (larger text only: 320px at 125%, every phone at 200%) the name takes
          the full width under the picture, which would squeeze it to a letter a line beside the
          picture and Customise. From sm up: the picture at the left, everything else beside it. A
          phone held sideways (a short window) has little height: the header is one band of at most
          80px, as the other sections' is (no art band above it): a 56px picture beside the name with
          its tagline after it on one line (cut with an ellipsis, the whole in its title), then one
          line of the roles (the off roles as quiet icons, their names read out), the rank (its queue
          in the rank's title), the lineup status from sm, and the links as 32px chips (44px targets
          on touch screens), which narrow lines condense further (SIDEWAYS_META), and Customise as the
          round chip at the band's end: 8 + 28 + 32 + 8px and its border, 78px at most. On a phone held
          upright the art shows behind the header with no band of its own above the name (204px tall,
          it left the first screen no figure on an SE). */}
      <div className={cn("relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-4 min-[23.4375rem]:max-sm:gap-y-1.5 min-[23.4375rem]:max-sm:p-3.5 sm:flex sm:min-h-40 sm:items-end sm:gap-4 sm:p-5 sm:pt-12 lg:min-h-32 lg:pt-9 short:flex short:min-h-0 short:items-center short:gap-3 short:px-3.5 short:py-2", editable && "short:pr-16")}>
        <CardAvatar look={p.look} name={p.displayName} src={p.avatarUrl} className="min-[23.4375rem]:max-sm:row-span-2 min-[23.4375rem]:max-sm:self-start short:self-center">
          {self ? <ProfileAvatarEditable name={p.displayName} src={p.avatarUrl} avatarClassName={SHORT_PICTURE} /> : <Avatar name={p.displayName} src={p.avatarUrl} size="hero" className={SHORT_PICTURE} />}
        </CardAvatar>
        <div className="contents sm:block sm:min-w-0 sm:flex-1 sm:pb-0.5 short:block short:min-w-0 short:flex-1 short:pb-0">
          {/* On a phone the Customise chip sits at the name's row end: the name keeps clear of it
              (under the picture, below a 17.5rem window, it has the chip's row to itself). Held
              sideways the band keeps the chip's room at its end instead. */}
          <div className={cn("min-w-0 max-[17.5rem]:col-span-2 short:flex short:items-baseline short:gap-2", editable && "max-sm:pr-10 max-[17.5rem]:pr-0 short:pr-0")}>
            {/* Upright and from sm the tagline sits above the name; held sideways after it, on the
                name's line: a second copy there, so the reading order is the order drawn (one copy
                is displayed at a time, so one is read). */}
            <CardTagline look={p.look} className="text-sm drop-shadow short:hidden" />
            <div className="flex flex-wrap items-center gap-2 short:min-w-0 short:flex-nowrap">
              <h1 className="min-w-0 max-w-full text-2xl tracking-tight text-fg drop-shadow sm:text-3xl short:truncate short:text-xl">
                <CardName look={p.look} name={p.displayName} />
              </h1>
              {self ? <Badge tone="accent">You</Badge> : null}
              {p.archived ? <Badge tone="warn">Archived</Badge> : null}
              {p.setupPending ? <SetupIncompleteBadge /> : null}
            </div>
            {p.look.style.identity.tagline ? (
              <span className="hidden min-w-0 flex-1 short:block" title={p.look.style.identity.tagline} data-testid="profile-band-tagline">
                <CardTagline look={p.look} lines={1} decorative className="drop-shadow short:text-xs" />
              </span>
            ) : null}
          </div>
          <div className="col-span-2 min-w-0 min-[23.4375rem]:max-sm:col-span-1 min-[23.4375rem]:max-sm:col-start-2 short:flex short:items-center short:gap-3">
            <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted sm:mt-1.5 short:mt-0 short:min-w-0 short:flex-1 short:gap-x-2.5 short:gap-y-0.5 short:text-xs", SIDEWAYS_META.container)} data-testid="profile-meta">
              {p.primaryRole ? (
                <span className="inline-flex items-center gap-1.5 text-fg short:gap-1">
                  <span style={{ color: "var(--card-accent)" }} className="inline-flex">
                    <RoleIcon role={p.primaryRole} className="h-4 w-4 short:h-3.5 short:w-3.5" />
                  </span>
                  <span className={SIDEWAYS_META.role}>{ROLE_LABELS[p.primaryRole]}</span>
                </span>
              ) : (
                <span className="text-fg-subtle" data-testid="profile-no-role">
                  No role chosen yet
                </span>
              )}
              {p.offRoles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1.5 whitespace-nowrap short:gap-1" data-testid="additional-role">
                  {/* On a phone "(off)" (the word "role" read out), so an off role is told from the main one in words, not by colour alone.
                      Held sideways a quiet icon, its name and "(off role)" read out, as on Players' rows. */}
                  <RoleIcon role={r} className="h-4 w-4 text-fg-subtle short:h-3.5 short:w-3.5" /> <span className="short:sr-only">{ROLE_LABELS[r]}</span>{" "}
                  <span className="text-fg-subtle short:sr-only">
                    (off<span className="max-sm:sr-only short:sr-only"> role</span>)
                  </span>
                </span>
              ))}
              {p.showRank ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg short:gap-1" data-testid="profile-rank" title={rankTitle}>
                  <RankEmblem tier={rank?.tier} className="h-5 w-5 short:h-4 short:w-4" />
                  {rank ? (
                    <>
                      {rankLabel(rank.tier, rank.division)}
                      <span className="text-fg-muted">· {rank.leaguePoints} LP</span>
                      {rank.queue ? <span className="text-xs text-fg-subtle short:hidden">{QUEUE_LABEL[rank.queue]}</span> : null}
                    </>
                  ) : (
                    <span className="text-fg-muted">Unranked</span>
                  )}
                </span>
              ) : null}
              {p.lineupRole ? <LineupStatus role={p.lineupRole} className="max-sm:short:hidden" sideways /> : null}
            </div>
            <SocialLinks links={p.social} owner={p.displayName} size="header" className="mt-2 short:mt-0 short:shrink-0" />
          </div>
        </div>
      </div>
    </header>
  );
}
