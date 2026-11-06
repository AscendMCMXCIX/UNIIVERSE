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
import { ChevronRight } from "lucide-react";
import { PlayerSummaryCard, type RiotState } from "./player-summary-card";
import { cardLookFor } from "@/domain/card-style";
import type { CompactRank } from "./rank-emblem";
import type { SocialLinkView } from "@/domain/social-links";
import { cardColourVars } from "./card-look";
import { PoolPreview, RowIdentity } from "./player-card";
import { SetupIncompleteBadge } from "./setup-incomplete";
import { Badge } from "@/components/ui/badge";

export interface DirectoryEntry {
  player: PlayerRecord;
  lineupRole: Role | null;
  isYou: boolean;
  riot: RiotState | null;
  avatarUrl: string | null;
  rank: CompactRank | null;
  /** Whether this viewer may see the rank (their own, or teammates' statistics); when not, it is left out, not "Unranked". */
  showRank: boolean;
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
        chips={[
          ...(role !== "ALL" ? [{ key: "role", text: ROLE_LABELS[role], clear: () => setRole("ALL") }] : []),
          ...(scope === "lineup" ? [{ key: "lineup", text: "Main lineup", clear: () => setScope("all") }] : []),
          ...(archived?.on ? [{ key: "archived", text: "With archived", href: "/players" }] : []),
        ]}
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
      {/* Phones: one list, a row per player (picture, name, primary role and rank, status, the first
          champions of the pool), so the whole roster reads on a screen or two; the row opens the
          profile, where the card, the links and every pool are. From sm up, the cards below. */}
      <ul className="divide-y divide-border/70 overflow-hidden rounded-card border border-border bg-surface panel-depth sm:hidden" aria-label="Players" data-testid="players-list">
        {shown.length === 0 ? <li className="px-4 py-5 text-sm text-fg-muted">{entries.length === 0 ? "No players yet." : "No player matches. Try another name or role."}</li> : null}
        {shown.map((e) => (
          <PlayerRow key={e.player.id} entry={e} championsById={championsById} />
        ))}
      </ul>
      {/* As many columns as the directory's own width holds at 17.5rem a card, up to four, whatever
          the screen (the sidebar open or closed). Each card spans seven of the grid's rows
          (DirectoryCardLayout), so cards side by side keep their parts level; the space between
          rows is the cards' own margin. The directory is also the cards' `card` container: beside
          another card a card is never narrower than 17.5rem, and alone it is the directory's width,
          so the directory answers each card's 17rem steps exactly as the card itself would. */}
      <div className="@container [container-name:directory_card] max-sm:hidden">
        <div className="grid grid-cols-1 gap-x-3 @min-[35.75rem]/directory:grid-cols-2 @min-[54rem]/directory:grid-cols-3 @min-[72.25rem]/directory:grid-cols-4" data-testid="players-directory">
          {shown.length === 0 ? <p className="text-sm text-fg-muted">{entries.length === 0 ? "No players yet." : "No player matches. Try another name or role."}</p> : null}
          {shown.map((e) => (
            <PlayerSummaryCard key={e.player.id} player={e.player} championsById={championsById} lineupRole={e.lineupRole} isYou={e.isYou} riot={e.riot} avatarUrl={e.avatarUrl} rank={e.rank} showRank={e.showRank} social={e.social} reserveTagline={taglines} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One player on a phone: the same identity as their card (RowIdentity: their picture in its frame,
 * their name in their own name style with their emblem, the primary role and rank, their tagline
 * on one line), the status that matters at a glance (in the lineup, setup or Riot state, archived)
 * and the first champions of their primary pool. The row carries the card's colour variables
 * (cardColourVars), so the emblem and the role icon take the player's colour as on the card; the
 * art, frame and effects stay on the card (docs/MOBILE.md: rows in one panel, nothing downloaded
 * for a list). The whole row opens the profile.
 */
function PlayerRow({ entry: e, championsById }: { entry: DirectoryEntry; championsById: Record<string, PortraitChampion> }) {
  const p = e.player;
  const look = cardLookFor(p);
  const pool = p.primaryPool.map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" });
  return (
    <li style={cardColourVars(look)}>
      <Link href={`/players/${p.id}`} className="flex min-h-[4.5rem] items-center gap-3 px-3.5 py-2.5 transition-colors active:bg-surface-2 hover:bg-surface-2/60" data-testid="player-row" data-player-name={p.displayName} data-frame={look.style.frame}>
        {/* No account: nothing was read, so no rank is claimed; the note takes its place. */}
        <RowIdentity look={look} name={p.displayName} avatarUrl={e.avatarUrl} role={p.primaryRole} rank={e.rank} showRank={e.showRank} isYou={e.isYou} note={e.riot?.state === "none" ? <span className="truncate text-fg-subtle">No Riot account</span> : null}>
          {/* The pool's champions, as many whole portraits as the room left holds and the rest
              counted (PoolPreview), then what to know at a glance at the line's end, never cut. */}
          <span className="mt-1.5 flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1">{pool.length ? <PoolPreview champions={pool} total={pool.length} label={`${p.primaryRole ? ROLE_LABELS[p.primaryRole] : "Primary"} champions`} fit="count" testId="row-pool" /> : null}</span>
            {e.lineupRole || p.setupPending || p.archivedAt ? (
              <span className="flex shrink-0 flex-col items-end gap-1">
                {e.lineupRole ? (
                  <Badge tone="good" className="whitespace-nowrap" title={`In the current lineup as ${ROLE_LABELS[e.lineupRole]}`}>
                    {e.lineupRole === p.primaryRole ? "Lineup" : `Lineup · ${ROLE_LABELS[e.lineupRole]}`}
                  </Badge>
                ) : null}
                {p.setupPending ? <SetupIncompleteBadge /> : null}
                {p.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
              </span>
            ) : null}
          </span>
          {e.riot && e.riot.state !== "synced" && e.riot.state !== "none" ? (
            <span className="mt-1 block truncate text-xs text-fg-subtle" title={`Riot data: ${e.riot.label}`}>
              Riot data: {e.riot.label}
            </span>
          ) : null}
        </RowIdentity>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
      </Link>
    </li>
  );
}
