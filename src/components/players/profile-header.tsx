import { ROLE_LABELS } from "@/domain/roles";
import type { ProfileHeaderData } from "@/server/players/profile-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleIcon } from "@/components/role-icon";

/** Picture, name, roles, rank and lineup spot: who this is at a glance. */
export function ProfileHeader({ data, self }: { data: ProfileHeaderData; self: boolean }) {
  const p = data.player;
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-2/80 via-surface to-surface p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
        <Avatar name={p.displayName} src={data.avatarUrl} size="xl" ring={data.lineupRole ? "accent" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{p.displayName}</h1>
            {self ? <Badge tone="accent">You</Badge> : null}
            {p.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <RoleIcon role={p.primaryRole} className="h-4 w-4 text-accent" /> {ROLE_LABELS[p.primaryRole]}
            </span>
            {p.secondaryRole ? (
              <span className="inline-flex items-center gap-1.5">
                <RoleIcon role={p.secondaryRole} className="h-4 w-4" /> {ROLE_LABELS[p.secondaryRole]} <span className="text-fg-subtle">(secondary)</span>
              </span>
            ) : null}
            {data.rank ? <span className="text-fg">{data.rank.text.split(" · ").slice(0, 2).join(" · ")}</span> : null}
          </div>
        </div>
        {data.lineupRole ? (
          <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <RoleIcon role={data.lineupRole} className="h-5 w-5 text-accent" />
            <span>
              <span className="block text-xs text-fg-muted">Main lineup</span>
              <span className="font-medium">{ROLE_LABELS[data.lineupRole]}</span>
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
