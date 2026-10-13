"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Swords } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { legalRolesFor, poolFor } from "@/domain/roster";
import type { PlayerRecord } from "@/server/repositories/team";
import { setLineupSlotAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export interface LineupBoardProps {
  players: PlayerRecord[];
  slots: Partial<Record<Role, string>>;
  championsById: Record<string, PortraitChampion>;
  canEdit: boolean;
  /** playerId → "ROLE:championId" → proficiency tier (from linked accounts). */
  tiers?: Record<string, Record<string, string>>;
}

const TIER_DOT: Record<string, string> = { core: "bg-good", strong: "bg-good/70", comfortable: "bg-info", moderate: "bg-warn/70", rusty: "bg-warn", unknown: "bg-transparent" };
const TIER_TEXT: Record<string, string> = { core: "very strong (many recent games)", strong: "strong (solid volume, recent practice)", comfortable: "comfortable", moderate: "limited data", rusty: "rusty (not played for months)", unknown: "no linked-account data" };

/** The five active roles with their assigned players; each slot opens a picker of eligible players. */
export function LineupBoard({ players, slots, championsById, canEdit, tiers = {} }: LineupBoardProps) {
  const router = useRouter();
  const [openRole, setOpenRole] = React.useState<Role | null>(null);
  const [pending, setPending] = React.useState<Role | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const complete = ROLES.every((r) => slots[r]);

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
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {ROLES.map((role) => {
          const player = slots[role] ? byId.get(slots[role]!) : undefined;
          const eligible = players.filter((p) => legalRolesFor(p).includes(role));
          const pool = player ? poolFor(player, role) : [];
          const secondary = player ? role === player.secondaryRole : false;
          return (
            <div key={role} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4">
              <div className="flex w-20 shrink-0 items-center gap-2 text-sm font-medium text-fg-muted sm:w-24">
                <RoleIcon role={role} className="h-5 w-5 text-accent" />
                {ROLE_LABELS[role]}
              </div>
              <div className="min-w-0 flex-1">
                {player ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <div className="min-w-0 sm:min-w-[140px]">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                        {player.displayName}
                        {secondary ? <Badge tone="warn">secondary role</Badge> : null}
                        {player.group === "other" ? <Badge tone="neutral">other</Badge> : null}
                      </div>
                      <div className="text-xs text-fg-subtle">{pool.length} champion{pool.length === 1 ? "" : "s"} for {ROLE_LABELS[role]}</div>
                    </div>
                    <div className="flex basis-full flex-wrap items-center gap-1.5 sm:basis-auto">
                      {pool.map((id) => {
                        const tier = tiers[player.id]?.[`${role}:${id}`] ?? "unknown";
                        return (
                          <div key={id} className="relative" title={`${championsById[id]?.name ?? id} — ${TIER_TEXT[tier]}`}>
                            <ChampionPortrait champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="sm" />
                            {tier !== "unknown" ? <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-bg", TIER_DOT[tier])} /> : null}
                          </div>
                        );
                      })}
                      {pool.length === 0 ? <span className="text-xs text-warn">No champions configured for this role</span> : null}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-fg-subtle">No player assigned</div>
                )}
              </div>
              {canEdit ? (
                <div className="relative ml-auto">
                  <Button size="sm" variant="outline" onClick={() => setOpenRole(openRole === role ? null : role)} disabled={pending === role} aria-expanded={openRole === role}>
                    {player ? "Change" : "Assign"} <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  {openRole === role ? (
                    <div className="absolute right-0 top-full z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-bg-elevated p-1 shadow-xl">
                      {eligible.length === 0 ? <div className="px-3 py-2 text-xs text-fg-muted">No saved player can play {ROLE_LABELS[role]}.</div> : null}
                      {eligible.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => assign(role, p.id)}
                          className={cn("flex min-h-11 w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-2 md:min-h-0", p.id === player?.id && "text-accent")}
                        >
                          <span>
                            {p.displayName}
                            <span className="ml-2 text-xs text-fg-subtle">{p.primaryRole === role ? "primary" : "secondary"}</span>
                          </span>
                          <span className="text-xs text-fg-subtle">{p.group}</span>
                        </button>
                      ))}
                      {player ? (
                        <button type="button" onClick={() => assign(role, null)} className="mt-1 min-h-11 w-full rounded-sm border-t border-border px-3 py-2 text-left text-xs text-fg-muted hover:bg-surface-2 md:min-h-0">
                          Clear slot
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-fg-muted">
          {complete ? "Lineup complete. Role assignments can still be flexed during the draft." : "Assign all five roles to start drafting."}
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
