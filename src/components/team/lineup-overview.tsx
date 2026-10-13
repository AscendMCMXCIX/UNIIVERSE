"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Swords } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { setLineupSlotAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/ui/metric";
import { cn } from "@/lib/cn";
import { percent } from "@/lib/format";

export interface PoolChampionView {
  championId: string;
  name: string;
  portraitUrl: string;
  recentGames: number;
  /** 0..1 or null when there are no recent ranked games. */
  recentWinRate: number | null;
  tier: string;
  tierLabel: string;
}

export interface PlayerOption {
  id: string;
  displayName: string;
  group: "main" | "other";
  fit: "primary" | "secondary";
}

export interface LineupRowView {
  role: Role;
  player: { id: string; displayName: string } | null;
  profileRole: "primary" | "secondary" | "other" | null;
  substitute: boolean;
  pool: PoolChampionView[];
  candidates: PlayerOption[];
}

const TIER_TONE: Record<string, "good" | "info" | "neutral" | "warn"> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

/**
 * OUR CURRENT TEAM: the five roles, who plays them, the champions they bring to that role and a
 * little labelled Riot context per champion. Admins change who holds a slot;
 * champion pools belong to the player who owns the profile.
 */
export function LineupOverview({ rows, complete, canManageLineup, editablePlayerIds, viewerPlayerId }: { rows: LineupRowView[]; complete: boolean; canManageLineup: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null }) {
  const router = useRouter();
  const [openRole, setOpenRole] = React.useState<Role | null>(null);
  const [showSubs, setShowSubs] = React.useState(false);
  const [pending, setPending] = React.useState<Role | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const editable = new Set(editablePlayerIds);

  const assign = async (role: Role, playerId: string | null) => {
    setPending(role);
    setError(null);
    const res = await setLineupSlotAction(role, playerId);
    setPending(null);
    setOpenRole(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  };

  return (
    <div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="lineup-overview">
        {rows.map((row) => {
          const candidates = row.candidates.filter((c) => showSubs || c.group === "main");
          return (
            <div key={row.role} className="relative px-3 py-3 sm:px-4" data-testid={`lineup-row-${row.role}`}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="flex w-24 shrink-0 items-center gap-2 pt-0.5 text-sm font-semibold text-fg-muted">
                  <RoleIcon role={row.role} className="h-5 w-5 text-accent" />
                  {ROLE_LABELS[row.role]}
                </div>
                <div className="min-w-0 flex-1">
                  {row.player ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/players/${row.player.id}`} className="text-base font-semibold text-fg hover:underline">
                          {row.player.displayName}
                        </Link>
                        {row.player.id === viewerPlayerId ? <Badge tone="accent">you</Badge> : null}
                        {row.profileRole === "secondary" ? <Badge tone="warn" title="Playing their secondary role in this lineup">secondary role</Badge> : null}
                        {row.profileRole === "other" ? <Badge tone="warn" title="This is not one of the roles on their profile">out of role</Badge> : null}
                        {row.substitute ? <Badge tone="neutral" title="From the Other players group">substitute</Badge> : null}
                        {editable.has(row.player.id) ? (
                          <Link href={`/players/${row.player.id}#profile`} className="text-xs text-accent hover:underline">
                            {row.player.id === viewerPlayerId ? "Edit my champions" : "Edit champions"}
                          </Link>
                        ) : null}
                      </div>
                      {row.pool.length === 0 ? (
                        <p className="mt-1 text-xs text-warn">No champions configured for {ROLE_LABELS[row.role]} yet.</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {row.pool.map((c) => (
                            <li key={c.championId} className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 py-1.5">
                              <ChampionPortrait champion={{ id: c.championId, name: c.name, portraitUrl: c.portraitUrl }} size="sm" />
                              <div className="text-[11px] leading-tight">
                                <div className="text-xs font-medium text-fg">{c.name}</div>
                                <div className="flex flex-wrap gap-x-2 text-fg-muted">
                                  <span title="Ranked games (Solo/Duo and Flex) on the current and previous two patches, from the player's linked Riot accounts">
                                    Recent games <span className="font-medium text-fg">{c.recentGames}</span>
                                  </span>
                                  <span title="Wins divided by those recent ranked games; shown only when games exist">
                                    Win rate <span className="font-medium text-fg">{c.recentWinRate === null ? "—" : percent(c.recentWinRate, 0)}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-fg-muted">
                                  Proficiency <Badge tone={TIER_TONE[c.tier] ?? "neutral"}>{c.tierLabel}</Badge>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-fg-subtle">No player assigned.</p>
                  )}
                </div>
                {canManageLineup ? (
                  <div className="relative ml-auto">
                    <Button size="sm" variant="outline" onClick={() => setOpenRole(openRole === row.role ? null : row.role)} disabled={pending === row.role} aria-expanded={openRole === row.role} aria-label={`${row.player ? "Change" : "Assign"} ${ROLE_LABELS[row.role]} player`}>
                      {row.player ? "Change" : "Assign"} <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {openRole === row.role ? (
                      <div className="absolute right-0 top-full z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-bg-elevated p-1 shadow-xl">
                        {candidates.length === 0 ? <div className="px-3 py-2 text-xs text-fg-muted">No {showSubs ? "" : "main "}player can play {ROLE_LABELS[row.role]}.</div> : null}
                        {candidates.map((p) => (
                          <button key={p.id} type="button" onClick={() => assign(row.role, p.id)} className={cn("flex min-h-11 w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-2 md:min-h-0", p.id === row.player?.id && "text-accent")}>
                            <span>
                              {p.displayName}
                              <span className="ml-2 text-xs text-fg-subtle">{p.fit}</span>
                            </span>
                            {p.group === "other" ? <span className="text-xs text-fg-subtle">substitute</span> : null}
                          </button>
                        ))}
                        <label className="mt-1 flex min-h-11 items-center gap-2 border-t border-border px-3 py-2 text-xs text-fg-muted md:min-h-0">
                          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} /> Show substitutes (Other players)
                        </label>
                        {row.player ? (
                          <button type="button" onClick={() => assign(row.role, null)} className="min-h-11 w-full rounded-sm px-3 py-2 text-left text-xs text-fg-muted hover:bg-surface-2 md:min-h-0">
                            Clear slot
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "An admin assigns the five roles."}
          <Info text="Recent games and win rate come from each player's linked Riot accounts (ranked Solo/Duo and Flex on the current and previous two patches). Proficiency is UNIIVERSE's estimate from volume, recency and results; pools decide what is legal, proficiency only shifts preference." />
          {error ? <span className="ml-2 text-bad">{error}</span> : null}
        </div>
        <Link href="/draft" className={cn("sm:self-auto", !complete && "pointer-events-none opacity-50")} aria-disabled={!complete}>
          <Button variant="primary" className="w-full sm:w-auto">
            <Swords className="h-4 w-4" /> Go to Draft
          </Button>
        </Link>
      </div>
    </div>
  );
}

export { ROLES };
