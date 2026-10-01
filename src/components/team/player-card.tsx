"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { legalRolesFor } from "@/domain/roster";
import type { PlayerRecord } from "@/server/repositories/team";
import { archivePlayerAction, setLineupSlotAction, setPlayerGroupAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function PoolRow({ role, pool, label, championsById }: { role: Role; pool: string[]; label: string; championsById: Record<string, PortraitChampion> }) {
  return (
    <div className="flex items-center gap-2">
      <RoleIcon role={role} className="h-4 w-4 text-accent" title={`${label}: ${ROLE_LABELS[role]}`} />
      <div className="flex items-center gap-1">
        {pool.length === 0 ? <span className="text-xs text-fg-subtle">no champions</span> : null}
        {pool.map((id) => (
          <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="xs" />
        ))}
      </div>
    </div>
  );
}

export function PlayerCard({ player, championsById, activeRole, canEdit, compact = false }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; activeRole: Role | null; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) alert(r.error);
    else router.refresh();
  };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-elevated p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/players/${player.id}`} className="truncate text-sm font-semibold hover:text-accent">
              {player.displayName}
            </Link>
            <Badge tone={player.group === "main" ? "accent" : "neutral"}>{player.group === "main" ? "Main" : "Other"}</Badge>
            {activeRole ? (
              <Badge tone="good">
                <RoleIcon role={activeRole} className="h-3 w-3" /> active
              </Badge>
            ) : null}
            {player.archivedAt ? <Badge tone="warn">archived</Badge> : null}
          </div>
          {player.riotId ? <div className="truncate text-xs text-fg-subtle">{player.riotId}</div> : null}
        </div>
      </div>
      <PoolRow role={player.primaryRole} pool={player.primaryPool} label="Primary" championsById={championsById} />
      {player.secondaryRole ? <PoolRow role={player.secondaryRole} pool={player.secondaryPool} label="Secondary" championsById={championsById} /> : <div className="text-xs text-fg-subtle">No secondary role</div>}
      {!compact && player.notes ? <p className="line-clamp-2 text-xs text-fg-muted">{player.notes}</p> : null}
      {canEdit ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {!player.archivedAt
            ? legalRolesFor(player).map((role) => (
                <Button key={role} size="sm" variant={activeRole === role ? "primary" : "outline"} disabled={busy || activeRole === role} onClick={() => run(() => setLineupSlotAction(role, player.id))} title={`Put ${player.displayName} in the active lineup as ${ROLE_LABELS[role]}`}>
                  <RoleIcon role={role} className="h-3.5 w-3.5" /> {activeRole === role ? "Active" : `Play ${ROLE_LABELS[role]}`}
                </Button>
              ))
            : null}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setPlayerGroupAction(player.id, player.group === "main" ? "other" : "main"))}>
            → {player.group === "main" ? "Other" : "Main"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archivePlayerAction(player.id, !player.archivedAt))}>
            {player.archivedAt ? "Restore" : "Archive"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
