import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

const RIOT_TONE: Record<RiotState["state"], BadgeTone> = { synced: "good", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/** One player in the directory: picture, name, roles, rank and a peek at their champions. Everything else is on the profile. */
export function PlayerSummaryCard({ player, championsById, lineupRole, isYou, riot, avatarUrl, rank }: { player: PlayerRecord; championsById: Record<string, PortraitChampion>; lineupRole: Role | null; isYou: boolean; riot: RiotState | null; avatarUrl: string | null; rank: string | null }) {
  const all = [...new Set([...player.primaryPool, ...player.secondaryPool, ...player.additionalRoles.flatMap((a) => a.pool)])];
  const preview = all.slice(0, 8);
  const more = all.length - preview.length;
  return (
    <Link href={`/players/${player.id}`} className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2/60" data-testid="player-card">
      <div className="flex items-center gap-3">
        <Avatar name={player.displayName} src={avatarUrl} size="lg" ring={lineupRole ? "accent" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-fg">{player.displayName}</span>
            {isYou ? <Badge tone="accent">You</Badge> : null}
            {player.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
          </div>
          <div className="truncate text-xs text-fg-muted">{rank ?? "Unranked"}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <RoleIcon role={player.primaryRole} className="h-4 w-4 text-accent" /> {ROLE_LABELS[player.primaryRole]}
        </span>
        {player.secondaryRole ? (
          <span className="inline-flex items-center gap-1.5">
            <RoleIcon role={player.secondaryRole} className="h-4 w-4" /> {ROLE_LABELS[player.secondaryRole]}
          </span>
        ) : null}
        {player.additionalRoles.map((a) => (
          <span key={a.role} className="inline-flex items-center gap-1.5 text-fg-subtle" title="Additional role">
            <RoleIcon role={a.role} className="h-4 w-4" /> {ROLE_LABELS[a.role]}
          </span>
        ))}
        {lineupRole ? (
          <Badge tone="good" title={`In the current lineup as ${ROLE_LABELS[lineupRole]}`}>
            Lineup · {ROLE_LABELS[lineupRole]}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {preview.length === 0 ? <span className="text-xs text-fg-subtle">No champions yet</span> : null}
        {preview.map((id) => (
          <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="sm" />
        ))}
        {more > 0 ? <span className="grid h-8 min-w-8 place-items-center rounded-md border border-border px-1.5 text-xs text-fg-muted">+{more}</span> : null}
      </div>
      {riot && riot.state !== "synced" ? (
        <Badge tone={RIOT_TONE[riot.state]} className="self-start" title={`Riot data: ${riot.label}`}>
          Riot: {riot.label}
        </Badge>
      ) : null}
    </Link>
  );
}
