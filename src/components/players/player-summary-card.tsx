import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

const RIOT_TONE: Record<RiotState["state"], BadgeTone> = { synced: "good", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

function PoolRow({ role, pool, label, championsById }: { role: Role; pool: string[]; label: string; championsById: Record<string, PortraitChampion> }) {
  return (
    <div className="flex items-start gap-2">
      <RoleIcon role={role} className="mt-1.5 h-4 w-4 shrink-0 text-accent" title={`${label}: ${ROLE_LABELS[role]}`} />
      <div className="flex flex-wrap items-center gap-1">
        {pool.length === 0 ? <span className="text-xs text-fg-subtle">no champions yet</span> : null}
        {pool.map((id) => (
          <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="xs" />
        ))}
      </div>
    </div>
  );
}

/** One player in the Players list: who they are, their roles and pools, and whether Riot data is flowing. Everything else is on the profile. */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null }) {
  return (
    <Link href={`/players/${player.id}`} className="flex flex-col gap-2 rounded-md border border-border bg-bg-elevated p-3 transition-colors hover:border-accent/60" data-testid="player-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{player.displayName}</span>
            {isYou ? <Badge tone="accent">you</Badge> : null}
            {lineupRole ? (
              <Badge tone="good" title={`In the current lineup as ${ROLE_LABELS[lineupRole]}`}>
                <RoleIcon role={lineupRole} className="h-3 w-3" /> in lineup
              </Badge>
            ) : null}
            {player.archivedAt ? <Badge tone="warn">archived</Badge> : null}
          </div>
          <div className="truncate text-xs text-fg-subtle">
            {player.riotId ?? "No Riot ID"} · {ROLE_LABELS[player.primaryRole]}
            {player.secondaryRole ? ` / ${ROLE_LABELS[player.secondaryRole]}` : ""}
          </div>
        </div>
        {riot ? (
          <Badge tone={RIOT_TONE[riot.state]} title={`Riot data: ${riot.label}`}>
            Riot data: {riot.state === "none" ? "none" : riot.state}
          </Badge>
        ) : null}
      </div>
      <PoolRow role={player.primaryRole} pool={player.primaryPool} label="Primary" championsById={championsById} />
      {player.secondaryRole ? <PoolRow role={player.secondaryRole} pool={player.secondaryPool} label="Secondary" championsById={championsById} /> : <div className="text-xs text-fg-subtle">No secondary role</div>}
    </Link>
  );
}
