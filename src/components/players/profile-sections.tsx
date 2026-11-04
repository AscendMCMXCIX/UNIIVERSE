import { cache } from "react";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, canManageRiotAccounts } from "@/server/auth/permissions";
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
  statistics need the "view teammate statistics" permission.
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
  /** Ranked progress's period: the 2026 ranked year (absent) or one of its seasons (s1, s2, s3). */
  rv?: string;
  /** The champion window: All Champions keys it on `champion`; Overview's pools on `champ` (where `champion` is a filter). Then the role it was opened in, view, opponent. */
  champ?: string;
  crole?: string;
  tab?: string;
  vs?: string;
}

export const championMap = async (db: Db): Promise<Record<string, PortraitChampion>> => Object.fromEntries((await listChampions(db)).map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

/** One header load per request, shared by the layout and the tab page. */
export const profileHeader = cache((db: Db, playerId: string) => loadProfileHeader(db, playerId));

/** The display-only identity the header shows (sent to the browser with every tab; see profile-identity.tsx). */
export function headerIdentity(h: ProfileHeaderData): HeaderIdentity {
  const p = h.player;
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
    rank: h.rank ? { tier: h.rank.tier, division: h.rank.division, leaguePoints: h.rank.leaguePoints, wins: h.rank.wins, losses: h.rank.losses, queue: h.rank.queue, asOf: h.rank.asOf } : null,
    featurable: featurableChampions(p),
    social: h.social,
  };
}

/** Every tab renders this: the header then shows this tab's (fresh) identity even when the layout was reused. */
export function IdentitySync({ header }: { header: ProfileHeaderData }) {
  return <ProfileIdentitySync identity={headerIdentity(header)} />;
}

export async function ProfileFrame({ db, header, session, basePath, children }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; children: React.ReactNode }) {
  const self = session?.playerId === header.player.id;
  const editable = canEditPlayer(session, header.player.id);
  // The Customise dialog searches every champion (portraits only; cached list).
  const champions = editable ? Object.values(await championMap(db)) : [];
  return (
    <ProfileIdentityProvider initial={headerIdentity(header)}>
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" style={bannerLightStyle(headerIdentity(header).look.style.colours)} data-testid="player-profile">
      {/* The section bar belongs to the profile card: tucked right under it. */}
      <div className="space-y-1.5">
        <ProfileHeader identity={headerIdentity(header)} self={self} editable={editable} champions={champions} basePath={basePath} />
        <ProfileTabs basePath={basePath} />
      </div>
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
