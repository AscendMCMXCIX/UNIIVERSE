"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import type { PortraitChampion } from "@/components/champion-portrait";
import { Input } from "@/components/ui/input";
import { RoleSegmented, chipClass } from "@/components/ui/segmented";
import { PlayerSummaryCard, type RiotState } from "./player-summary-card";
import type { CompactRank } from "./rank-emblem";

export interface DirectoryEntry {
  player: PlayerRecord;
  lineupRole: Role | null;
  isYou: boolean;
  riot: RiotState | null;
  avatarUrl: string | null;
  rank: CompactRank | null;
  /** Linked Riot IDs, searchable (shown on the profile, not on the card). */
  riotIds: string[];
}

type RoleFilter = Role | "ALL";
type Scope = "all" | "lineup";

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The Players directory: one combined list (lineup first), with a search box (name or Riot ID)
 * and role filters (primary or secondary role). Archived and deactivated players are not listed.
 */
export function PlayersDirectory({ entries, championsById }: { entries: DirectoryEntry[]; championsById: Record<string, PortraitChampion> }) {
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
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or Riot ID" aria-label="Search players by name or Riot ID" className="pl-9 pr-9" data-testid="players-search" />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoleSegmented label="Filter by role" roles={ROLES} value={role === "ALL" ? null : role} onChange={(r) => setRole(r ?? "ALL")} allowAll testId="role-filter" />
          <button type="button" className={chipClass(scope === "lineup")} aria-pressed={scope === "lineup"} onClick={() => setScope(scope === "lineup" ? "all" : "lineup")} data-testid="lineup-filter">
            Main lineup
          </button>
        </div>
      </div>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {shown.length === entries.length ? `${entries.length} player${entries.length === 1 ? "" : "s"}` : `${shown.length} of ${entries.length} players`}
        {role !== "ALL" ? ` · ${ROLE_LABELS[role]} as primary or off role` : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="players-directory">
        {shown.length === 0 ? <p className="text-sm text-fg-muted">{entries.length === 0 ? "No players yet." : "No player matches. Try another name or role."}</p> : null}
        {shown.map((e) => (
          <PlayerSummaryCard key={e.player.id} player={e.player} championsById={championsById} lineupRole={e.lineupRole} isYou={e.isYou} riot={e.riot} avatarUrl={e.avatarUrl} rank={e.rank} />
        ))}
      </div>
    </div>
  );
}
