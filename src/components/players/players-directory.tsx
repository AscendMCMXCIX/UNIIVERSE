"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import { cardLookFor } from "@/domain/card-style";
import { cardArt } from "@/domain/player-card";
import { offRoles, playsRole, poolForRole } from "@/domain/roster/role-pool";
import type { PlayerRecord } from "@/server/repositories/team";
import type { PortraitChampion } from "@/components/champion-portrait";
import type { SocialLinkView } from "@/domain/social-links";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { RoleSegmented, chipClass } from "@/components/ui/segmented";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { formatCount } from "@/lib/format";
import type { CompactRank } from "./rank-emblem";
import { RosterRow, type RiotState } from "./roster-row";

export interface DirectoryEntry {
  player: PlayerRecord;
  lineupRole: Role | null;
  isYou: boolean;
  riot: RiotState | null;
  avatarUrl: string | null;
  rank: CompactRank | null;
  /** Whether this viewer may see the rank (their own, or teammates' statistics); when not, it is left out, not "Unranked". */
  showRank: boolean;
  /** Linked Riot IDs, searchable (shown on the profile, not on the roster). */
  riotIds: string[];
  /** The social links the player shows to team members (filtered on the server). */
  social: SocialLinkView[];
}

type RoleFilter = Role | "ALL";
type Scope = "all" | "lineup";

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const players = (n: number) => `${formatCount(n)} player${n === 1 ? "" : "s"}`;

/**
 * The Players page under the app's frame: its header (the title, and the count as its scope line,
 * read out as it changes, with what narrows it), one toolbar (a search by name or Riot ID, the role,
 * the main lineup and, for administrators, the archived and deactivated players) and the roster: one
 * panel of rows, A to Z, a row per player at every width (RosterRow), laid out one or two across by
 * the roster's own width (two from 38rem; three from 84rem, so a column never drops below the 28rem a
 * row needs for its off roles and its whole pool), so an open or folded sidebar is right at the first
 * paint. With a role chosen, everyone who plays it is listed, as their main role or an off role, and
 * each row shows the champions they play there. On a phone held sideways (a short window below md,
 * the filters folded behind their button) the title and the toolbar share one row from 34rem wide;
 * narrower short windows (a split screen, a small phone zoomed in) stack them, so the search keeps
 * its width. A short window as wide as a tablet keeps the inline toolbar on a row of its own, which
 * it needs whole to stay one row.
 */
export function PlayersDirectory({ entries, championsById, archived = null, myProfile = false }: { entries: DirectoryEntry[]; championsById: Record<string, PortraitChampion>; /** Admins: whether archived and deactivated players are included (kept in the URL). */ archived?: { on: boolean } | null; /** A member with a profile of their own, which is not listed here: offer it. */ myProfile?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<RoleFilter>("ALL");
  const [scope, setScope] = React.useState<Scope>("all");
  const q = fold(query.trim());
  const shown = entries.filter((e) => {
    if (scope === "lineup" && !e.lineupRole) return false;
    if (role !== "ALL" && !playsRole(e.player, role)) return false;
    if (!q) return true;
    return fold(e.player.displayName).includes(q) || e.riotIds.some((id) => fold(id).includes(q));
  });
  const filtered = role === "ALL" ? null : role;
  const scopeLine = [shown.length === entries.length ? players(entries.length) : `${formatCount(shown.length)} of ${players(entries.length)}`, filtered ? `${ROLE_LABELS[filtered]} as primary or off role` : null, scope === "lineup" ? "Main lineup" : null, archived?.on ? "With archived and deactivated" : null].filter(Boolean).join(" · ");
  return (
    <div className="space-y-4">
      {/* Sideways phones: one row from 34rem (room for the title's 15rem and a bar of about 16rem), stacked below it. */}
      <div className="flex flex-col gap-4 max-md:short:min-[34rem]:flex-row max-md:short:min-[34rem]:items-center max-md:short:min-[34rem]:gap-x-5">
        <PageHeader
          className="max-md:short:min-[34rem]:max-w-[15rem] max-md:short:min-[34rem]:shrink-0 [&_p]:text-balance"
          title="Players"
          description={
            <span aria-live="polite" data-testid="players-scope">
              {scopeLine}
            </span>
          }
          actions={
            myProfile ? (
              <Link href="/overview" className={buttonClass("ghost", "sm", "-mr-1.5")} data-testid="players-my-profile">
                My profile <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null
          }
        />
        <FilterBar
          className="min-w-0 max-md:short:min-[34rem]:flex-1"
          testId="players-filters"
          summary={[filtered ? ROLE_LABELS[filtered] : "All roles", scope === "lineup" ? "Main lineup" : null, archived?.on ? "With archived" : null].filter(Boolean).join(" · ")}
          activeCount={(filtered ? 1 : 0) + (scope === "lineup" ? 1 : 0) + (archived?.on ? 1 : 0)}
          chips={[
            ...(filtered ? [{ key: "role", text: ROLE_LABELS[filtered], clear: () => setRole("ALL") }] : []),
            ...(scope === "lineup" ? [{ key: "lineup", text: "Main lineup", clear: () => setScope("all") }] : []),
            ...(archived?.on ? [{ key: "archived", text: "With archived", href: "/players" }] : []),
          ]}
          onReset={() => {
            setRole("ALL");
            setScope("all");
            if (archived?.on) router.replace("/players", { scroll: false });
          }}
          align="end"
          compact
          search={<SearchInput value={query} onChange={setQuery} placeholder="Search by name or Riot ID" label="Search players by name or Riot ID" testId="players-search" />}
        >
          <FilterField label="Role" labelId="players-role-label">
            <RoleSegmented label="Filter by role" roles={ROLES} value={filtered} onChange={(r) => setRole(r ?? "ALL")} allowAll compactBelow="xl" testId="role-filter" />
          </FilterField>
          <FilterField label="Lineup">
            <button type="button" className={chipClass(scope === "lineup", "self-start")} aria-pressed={scope === "lineup"} onClick={() => setScope(scope === "lineup" ? "all" : "lineup")} data-testid="lineup-filter">
              Main lineup
            </button>
          </FilterField>
          {archived ? (
            <FilterField label="Archived">
              <Link href={archived.on ? "/players" : "/players?archived=1"} scroll={false} aria-current={archived.on ? "true" : undefined} className={chipClass(archived.on, "self-start")} data-testid="archived-filter">
                {/* Inline the one word (its label is hidden there); the sheet, with room, says what it brings back. One text run, so the words keep their spacing. */}
                <span>
                  Archived<span className="md:sr-only"> and deactivated</span>
                  <span className="sr-only"> players</span>
                </span>
              </Link>
            </FilterField>
          ) : null}
        </FilterBar>
      </div>
      {/* One panel of rows (docs/MOBILE.md: lists are rows in one panel), filled row by row. Hairlines
          divide the rows and the columns; the list runs a pixel past the panel's right and bottom
          edges, which clip it, so the last column and the last row draw no line of their own. */}
      <div className="@container/roster overflow-clip rounded-card border border-border bg-surface panel-depth" data-testid="players-directory">
        {shown.length ? (
          <ol className="-mb-px -mr-px grid grid-cols-1 @min-[38rem]/roster:grid-cols-2 @min-[84rem]/roster:grid-cols-3" aria-label="Players">
            {shown.map((e) => (
              <Row key={e.player.id} entry={e} role={filtered} championsById={championsById} />
            ))}
          </ol>
        ) : (
          <p className="px-4 py-5 text-sm text-fg-muted" data-testid="players-empty">
            {entries.length === 0 ? "No players yet." : "No player matches. Try another name or role."}
            {myProfile && entries.length ? (
              <>
                {" "}
                Looking for yourself?{" "}
                <Link href="/overview" className="text-accent underline underline-offset-2">
                  Open My Profile
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

/** A directory entry as its row: the pool of the role the list is narrowed to (their main role's otherwise). */
function Row({ entry: e, role, championsById }: { entry: DirectoryEntry; role: Role | null; championsById: Record<string, PortraitChampion> }) {
  const p = e.player;
  const shown = poolForRole(p, role);
  const off = shown.slot === "primary" ? null : shown.role;
  const poolLabel = shown.role ? `${ROLE_LABELS[shown.role]} champions${off ? ", off role" : ""}` : "Champions";
  return (
    <RosterRow
      href={`/players/${p.id}`}
      look={cardLookFor(p)}
      art={cardArt(p)}
      name={p.displayName}
      avatarUrl={e.avatarUrl}
      role={p.primaryRole}
      offRoles={offRoles(p)}
      offRoleShown={off}
      rank={e.rank}
      showRank={e.showRank}
      riot={e.riot}
      pool={shown.pool.map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })}
      poolLabel={poolLabel}
      lineupRole={e.lineupRole}
      setupPending={p.setupPending}
      archived={!!p.archivedAt}
      isYou={e.isYou}
      social={e.social}
    />
  );
}
