"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleSegmented, chipClass } from "@/components/ui/segmented";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { PlayerSummaryCard, type RiotState } from "./player-summary-card";
import { cardLookFor } from "@/domain/card-style";
import type { CompactRank } from "./rank-emblem";
import type { SocialLinkView } from "@/domain/social-links";

export interface DirectoryEntry {
  player: PlayerRecord;
  lineupRole: Role | null;
  isYou: boolean;
  riot: RiotState | null;
  avatarUrl: string | null;
  rank: CompactRank | null;
  /** Linked Riot IDs, searchable (shown on the profile, not on the card). */
  riotIds: string[];
  /** The social links the player shows to team members (filtered on the server). */
  social: SocialLinkView[];
}

type RoleFilter = Role | "ALL";
type Scope = "all" | "lineup";

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The Players directory: one combined list (lineup first), with a search box (name or Riot ID)
 * and role filters (primary or secondary role). Archived and deactivated players are not listed.
 */
export function PlayersDirectory({ entries, championsById, archived = null }: { entries: DirectoryEntry[]; championsById: Record<string, PortraitChampion>; /** Admins: whether archived and deactivated players are included (kept in the URL). */ archived?: { on: boolean } | null }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<RoleFilter>("ALL");
  const [scope, setScope] = React.useState<Scope>("all");
  const q = fold(query.trim());
  const shown = entries.filter((e) => {
    if (scope === "lineup" && !e.lineupRole) return false;
    if (role !== "ALL" && e.player.primaryRole !== role && e.player.secondaryRole !== role && !e.player.additionalRoles.some((a) => a.role === role)) return false;
    if (!q) return true;
    return fold(e.player.displayName).includes(q) || e.riotIds.some((id) => fold(id).includes(q));
  });
  // Where any card shown has a tagline, the others keep its line too, so every card is the same height.
  const taglines = shown.some((e) => cardLookFor(e.player).style.identity.tagline);
  return (
    <div className="space-y-4">
      <FilterBar
        testId="players-filters"
        summary={[role === "ALL" ? "All roles" : ROLE_LABELS[role], scope === "lineup" ? "Main lineup" : null, archived?.on ? "With archived" : null].filter(Boolean).join(" · ")}
        activeCount={(role !== "ALL" ? 1 : 0) + (scope === "lineup" ? 1 : 0) + (archived?.on ? 1 : 0)}
        onReset={() => {
          setRole("ALL");
          setScope("all");
          if (archived?.on) router.replace("/players", { scroll: false });
        }}
        align="end"
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search by name or Riot ID" label="Search players by name or Riot ID" testId="players-search" />}
      >
        <FilterField label="Role" labelId="players-role-label">
          <RoleSegmented label="Filter by role" roles={ROLES} value={role === "ALL" ? null : role} onChange={(r) => setRole(r ?? "ALL")} allowAll testId="role-filter" />
        </FilterField>
        <FilterField label="Lineup">
          <button type="button" className={chipClass(scope === "lineup", "self-start")} aria-pressed={scope === "lineup"} onClick={() => setScope(scope === "lineup" ? "all" : "lineup")} data-testid="lineup-filter">
            Main lineup only
          </button>
        </FilterField>
        {archived ? (
          <FilterField label="Archived">
            <Link href={archived.on ? "/players" : "/players?archived=1"} scroll={false} aria-current={archived.on ? "true" : undefined} className={chipClass(archived.on, "self-start")} data-testid="archived-filter">
              Archived and deactivated
            </Link>
          </FilterField>
        ) : null}
      </FilterBar>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {shown.length === entries.length ? `${entries.length} player${entries.length === 1 ? "" : "s"}` : `${shown.length} of ${entries.length} players`}
        {role !== "ALL" ? ` · ${ROLE_LABELS[role]} as primary or off role` : ""}
      </p>
      {/* As many columns as the directory's own width holds at 17.5rem a card, up to four, whatever
          the screen (the sidebar open or closed). Each card spans seven of the grid's rows
          (DirectoryCardLayout), so cards side by side keep their parts level; the space between
          rows is the cards' own margin. The directory is also the cards' `card` container: beside
          another card a card is never narrower than 17.5rem, and alone it is the directory's width,
          so the directory answers each card's 17rem steps exactly as the card itself would. */}
      <div className="@container [container-name:directory_card]">
        <div className="grid grid-cols-1 gap-x-3 @min-[35.75rem]/directory:grid-cols-2 @min-[54rem]/directory:grid-cols-3 @min-[72.25rem]/directory:grid-cols-4" data-testid="players-directory">
          {shown.length === 0 ? <p className="text-sm text-fg-muted">{entries.length === 0 ? "No players yet." : "No player matches. Try another name or role."}</p> : null}
          {shown.map((e) => (
            <PlayerSummaryCard key={e.player.id} player={e.player} championsById={championsById} lineupRole={e.lineupRole} isYou={e.isYou} riot={e.riot} avatarUrl={e.avatarUrl} rank={e.rank} social={e.social} reserveTagline={taglines} />
          ))}
        </div>
      </div>
    </div>
  );
}
