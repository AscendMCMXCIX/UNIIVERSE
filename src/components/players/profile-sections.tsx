import { cache } from "react";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, canManageRiotAccounts, canOpenProfile, canViewPlayerStats } from "@/server/auth/permissions";
import { listChampions } from "@/server/repositories/champions";
import { loadProfileHeader, type ProfileHeaderData } from "@/server/players/profile-header";
import { refreshAvailable, type MatchSyncStatus } from "@/server/accounts/refresh";
import type { DataRefreshTarget } from "@/components/ui/data-status";
import { ProfileHeader } from "@/components/players/profile-header";
import { bannerLightStyle } from "@/components/players/banner-light";
import { ProfileIdentityProvider, ProfileIdentitySync, type HeaderIdentity } from "@/components/players/profile-identity";
import { cardArt, featurableChampions, isCardAccent } from "@/domain/player-card";
import { cardLookFor } from "@/domain/card-style";
import { ProfileTabs } from "@/components/players/profile-tabs";
import type { PortraitChampion } from "@/components/champion-portrait";

/*
  THE player profile, the same for My Profile (/overview) and every teammate (/players/[id]):
  an identity header and its sections.

    Overview            season performance with filters, then the Primary Role and Off Roles
                        with their champion pools: one card per champion (order, proficiency,
                        games, win rate, KDA), edited in place by the owner or an admin
    All Champions       every champion played, outside the pools too: search, sort, filters; a
                        champion opens its window (Overview, and Matchups: one lane opponent at a
                        time, the lane from timelines, the games)
    Match History       the Riot games stored for the linked accounts, a page at a time
    Riot Accounts       linked accounts, Main and Alt, sync state

  This module is the frame every tab shares (the header, its section bar, the data each tab
  needs to start). Each tab is its own module (profile-overview-tab, profile-champions-tab,
  profile-matches-tab, profile-accounts-tab), so a tab's page loads only its own browser code:
  the Overview never downloads Match History's.

  Everyone sees the same layout; editing appears only for whoever may edit. Teammates' season
  statistics, their rank included, need the "view teammate statistics" permission. A personal-use
  profile (not on the team) opens only for its player and administrators (viewableProfileHeader).
*/

export interface ProfileSearch {
  season?: string;
  mode?: string;
  /** Statistics filters (Overview): role played, scope (all | pool | champion), champion, account. */
  role?: string;
  scope?: string;
  champion?: string;
  account?: string;
  /** Ranked progress: queue (solo | flex) and account. */
  rq?: string;
  ra?: string;
  /** The champion window: All Champions keys it on `champion`; Overview's pools on `champ` (where `champion` is a filter). Then the role it was opened in, view, opponent. */
  champ?: string;
  crole?: string;
  tab?: string;
  vs?: string;
}

export const championMap = async (db: Db): Promise<Record<string, PortraitChampion>> => Object.fromEntries((await listChampions(db)).map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

/** One header load per request, shared by the layout and the tab page. */
export const profileHeader = cache((db: Db, playerId: string) => loadProfileHeader(db, playerId));

/**
 * The display-only identity the header shows (sent to the browser with every tab; see
 * profile-identity.tsx). The rank is a statistic: a teammate's reaches only viewers with "view
 * teammates' statistics", as on the Team page; one's own always (canViewPlayerStats). Left out for
 * anyone else, here, so it never reaches their browser.
 */
export function headerIdentity(h: ProfileHeaderData, viewer: Session | null): HeaderIdentity {
  const p = h.player;
  const showRank = canViewPlayerStats(viewer, p.id);
  return {
    playerId: p.id,
    displayName: p.displayName,
    avatarUrl: h.avatarUrl,
    art: cardArt(p),
    accent: isCardAccent(p.cardAccent) ? p.cardAccent : "default",
    look: cardLookFor(p),
    primaryRole: p.primaryRole ?? null,
    offRoles: [...(p.secondaryRole ? [p.secondaryRole] : []), ...p.additionalRoles.map((a) => a.role)],
    archived: !!p.archivedAt,
    setupPending: p.setupPending,
    lineupRole: h.lineupRole,
    showRank,
    rank: showRank && h.rank ? { tier: h.rank.tier, division: h.rank.division, leaguePoints: h.rank.leaguePoints, queue: h.rank.queue, asOf: h.rank.asOf } : null,
    featurable: featurableChampions(p),
    social: h.social,
  };
}

/** Every tab renders this: the header then shows this tab's (fresh) identity even when the layout was reused. */
export function IdentitySync({ header, session }: { header: ProfileHeaderData; session: Session | null }) {
  return <ProfileIdentitySync identity={headerIdentity(header, session)} />;
}

export async function ProfileFrame({ db, header, session, basePath, children }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; children: React.ReactNode }) {
  const self = session?.playerId === header.player.id;
  const editable = canEditPlayer(session, header.player.id);
  // The Customise dialog searches every champion (portraits only; cached list).
  const champions = editable ? Object.values(await championMap(db)) : [];
  const identity = headerIdentity(header, session);
  return (
    <ProfileIdentityProvider initial={identity}>
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" style={bannerLightStyle(identity.look.style.colours)} data-testid="player-profile">
      {/* The section bar belongs to the profile card: tucked right under it (its own margin), and a
          child of the whole profile, so it can stay pinned while every section scrolls (ProfileTabs). */}
      <ProfileHeader identity={identity} self={self} editable={editable} champions={champions} basePath={basePath} />
      <ProfileTabs basePath={basePath} />
      {children}
    </div>
    </ProfileIdentityProvider>
  );
}

/**
 * The profile's Refresh, the same on every tab: the player's own, or for those who manage Riot
 * accounts (both checked again on the server), and only where it can work: Riot on this server and
 * an account Riot can be asked about. Anyone else sees the page's data status alone.
 */
export function refreshFor(session: Session | null, playerId: string, sync: MatchSyncStatus | null, multikillsPending = false): DataRefreshTarget | null {
  if (!sync || sync.syncable === 0 || !refreshAvailable()) return null;
  if (session?.playerId !== playerId && !canManageRiotAccounts(session, playerId)) return null;
  return { playerId, multikillsPending };
}

/**
 * A teammate's profile as this viewer may open it (every /players/[id] page and its layout call
 * this themselves): null when it does not exist, or when it is a personal-use profile (not on the
 * team) and the viewer is neither its player nor an administrator. The page then answers "not
 * found", whatever the viewer's capabilities (canOpenProfile).
 */
export async function viewableProfileHeader(db: Db, playerId: string, session: Session | null): Promise<ProfileHeaderData | null> {
  const header = await profileHeader(db, playerId);
  return header && canOpenProfile(session, { id: header.player.id, teamMember: header.player.teamMember }) ? header : null;
}
