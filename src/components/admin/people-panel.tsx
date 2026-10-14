"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { AccountView } from "@/server/auth/account-admin";
import { archivePlayerAction, setPlayerGroupAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { Search, ShieldCheck } from "lucide-react";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { Input } from "@/components/ui/input";
import { AccountActions, AccountStatusBadge, DeleteProfileButton, PasswordStateBadge } from "./account-actions";
import { AccessDialog, accessSummary } from "./access-dialog";

export interface PlayerAdminRow {
  id: string;
  displayName: string;
  riotId: string | null;
  primaryRole: Role;
  secondaryRole: Role | null;
  group: "main" | "other";
  archived: boolean;
  lineupRole: Role | null;
  account: AccountView | null;
  riot: { state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none"; label: string };
}

type StatusFilter = "all" | "active" | "setup" | "deactivated" | "synced" | "delayed";

/** Riot sync in the words an admin needs: synced, still syncing, delayed, or nothing linked. */
export function riotStatus(state: PlayerAdminRow["riot"]["state"]): { label: string; tone: BadgeTone } {
  if (state === "synced") return { label: "Riot up to date", tone: "good" };
  if (state === "error") return { label: "Riot needs attention", tone: "bad" };
  if (state === "stale") return { label: "Riot delayed", tone: "warn" };
  if (state === "none") return { label: "No Riot account", tone: "neutral" };
  if (state === "syncing") return { label: "Catching up on history", tone: "info" };
  return { label: "Riot updating", tone: "info" };
}

const matches = (p: PlayerAdminRow, f: StatusFilter): boolean => {
  switch (f) {
    case "all":
      return true;
    case "active":
      return !!p.account?.isActive && (p.account.setupComplete || !p.account.playerId);
    case "setup":
      return !!p.account?.isActive && !p.account.setupComplete;
    case "deactivated":
      return !!p.account && !p.account.isActive;
    case "synced":
      return p.riot.state === "synced";
    case "delayed":
      return p.riot.state === "stale" || p.riot.state === "error";
  }
};

const FILTERS: Array<{ id: StatusFilter; label: string; tone?: "warn" | "bad" }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "setup", label: "Setup incomplete", tone: "warn" },
  { id: "deactivated", label: "Deactivated", tone: "bad" },
  { id: "synced", label: "Riot up to date" },
  { id: "delayed", label: "Sync delayed", tone: "warn" },
];

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * People & Access → Accounts: one list of everyone (player accounts, admin-only accounts and
 * profiles without an account) with status, Riot sync and access at a glance. Find a person,
 * see their state, open Access to set their base level and additional groups, and use the
 * account (password, deactivate, delete) and roster (Main / Other, archive) actions in place.
 */
export function PeoplePanel({ players, adminAccounts = [], presets = [], currentUserId, canManageAccounts = true, canManageRoster = true }: { players: PlayerAdminRow[]; adminAccounts?: AccountView[]; presets?: PermissionPreset[]; currentUserId: string | null; canManageAccounts?: boolean; canManageRoster?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<AccountView | null>(null);
  const q = fold(query.trim());
  const found = (p: PlayerAdminRow) => !q || fold(p.displayName).includes(q) || fold(p.account?.username ?? "").includes(q) || fold(p.riotId ?? "").includes(q);
  const accessButton = (a: AccountView) =>
    canManageAccounts ? (
      <Button size="sm" variant="outline" onClick={() => setEditing(a)} disabled={a.userId === currentUserId} title={a.userId === currentUserId ? "Your own access cannot be changed here" : "Base level and additional access"} data-testid="open-access">
        <ShieldCheck className="h-4 w-4" /> Access
      </Button>
    ) : null;
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) toast.success(done);
    else toast.error("That did not work", { description: r.error });
    router.refresh();
  };
  const current = players.filter((p) => (showArchived || !p.archived) && found(p));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, current.filter((p) => matches(p, f.id)).length])) as Record<StatusFilter, number>;
  const visible = current.filter((p) => matches(p, filter));
  const groups = [
    { title: "Main players", subtitle: "On the Team page; they can fill the five lineup slots.", rows: visible.filter((p) => p.group === "main") },
    { title: "Other players", subtitle: "Substitutes and stand-ins: in the Players list and the substitution option.", rows: visible.filter((p) => p.group === "other") },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="players-admin">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person, username or Riot ID" aria-label="Find a person" className="pl-9" data-testid="people-search" />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </header>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5" data-testid="status-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors pointer-coarse:min-h-11",
              filter === f.id ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {f.label}
            <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", counts[f.id] > 0 && f.tone === "warn" ? "bg-warn/15 text-warn" : counts[f.id] > 0 && f.tone === "bad" ? "bg-bad/15 text-bad" : "bg-surface-3 text-fg-muted")}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              {g.title} <span className="font-normal text-fg-subtle">· {g.rows.length}</span>
            </h3>
            <p className="text-xs text-fg-subtle">{g.subtitle}</p>
          </div>
          {g.rows.length === 0 ? <p className="text-sm text-fg-muted">Nobody{filter !== "all" ? " with this status" : ""}.</p> : null}
          <ul className="space-y-2">
            {g.rows.map((p) => {
              const riot = riotStatus(p.riot.state);
              return (
                <li key={p.id} className={cn("space-y-3 rounded-xl border border-border bg-bg-elevated p-3", p.archived && "opacity-70")} data-testid="admin-player-row">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Avatar name={p.displayName} src={p.account?.avatarUrl ?? null} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/players/${p.id}`} className="font-semibold text-fg hover:underline">
                          {p.displayName}
                        </Link>
                        {p.account ? <span className="text-sm text-fg-subtle">@{p.account.username}</span> : null}
                        {p.account?.role === "owner" ? <Badge tone="accent">Owner</Badge> : null}
                        {p.archived ? <Badge tone="neutral">Archived</Badge> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                        <span className="inline-flex items-center gap-1">
                          <RoleIcon role={p.primaryRole} className="h-3.5 w-3.5" /> {ROLE_LABELS[p.primaryRole]}
                          {p.secondaryRole ? ` / ${ROLE_LABELS[p.secondaryRole]}` : ""}
                        </span>
                        <span className="text-fg-subtle">· {p.riotId ?? "no Riot ID"}</span>
                        {p.lineupRole ? <span className="text-fg-subtle">· lineup {ROLE_LABELS[p.lineupRole]}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.account ? <AccountStatusBadge account={p.account} /> : <Badge tone="warn">No account</Badge>}
                      <Badge tone={riot.tone} title={p.riot.label}>
                        {riot.label}
                      </Badge>
                      {p.account ? <PasswordStateBadge account={p.account} /> : null}
                    </div>
                  </div>
                  {p.account && canManageAccounts ? (
                    <p className="flex items-center gap-1.5 text-xs text-fg-muted" data-testid="access-summary">
                      <ShieldCheck className="h-3.5 w-3.5 text-fg-subtle" aria-hidden /> {accessSummary(p.account, presets)}
                    </p>
                  ) : null}
                  {(canManageAccounts || canManageRoster) ? (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                      {p.account ? accessButton(p.account) : null}
                      {canManageAccounts && p.account ? <AccountActions account={p.account} currentUserId={currentUserId} /> : null}
                      {canManageAccounts && !p.account ? <DeleteProfileButton playerId={p.id} name={p.displayName} /> : null}
                      <span className="flex-1" />
                      {canManageRoster ? (
                        <>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setPlayerGroupAction(p.id, p.group === "main" ? "other" : "main"), p.group === "main" ? `${p.displayName} moved to Other players.` : `${p.displayName} moved to Main players.`)}>
                            {p.group === "main" ? "Move to Other" : "Move to Main"}
                          </Button>
                          {!p.account ? (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archivePlayerAction(p.id, !p.archived), p.archived ? "Profile restored." : "Profile archived.")}>
                              {p.archived ? "Restore profile" : "Archive profile"}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {canManageAccounts && !p.account ? <p className="text-xs text-fg-subtle">A profile without an account (a test entry, an old placeholder, or what a deleted account left behind). Creating a player with the same Riot ID reuses it.</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {canManageAccounts && adminAccounts.filter((a) => !q || fold(a.username).includes(q)).length > 0 ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-fg">Admin accounts <span className="font-normal text-fg-subtle">· {adminAccounts.length}</span></h3>
            <p className="text-xs text-fg-subtle">Accounts without a player profile (they open straight in Admin).</p>
          </div>
          <ul className="space-y-2">
            {adminAccounts
              .filter((a) => !q || fold(a.username).includes(q))
              .map((a) => (
                <li key={a.userId} className="space-y-2 rounded-xl border border-border bg-bg-elevated p-3" data-testid="admin-user-row">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={a.username} src={a.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">{a.username}</span>
                        {a.userId === currentUserId ? <span className="text-xs text-fg-subtle">(you)</span> : null}
                        {a.role === "owner" ? <Badge tone="accent">Owner</Badge> : null}
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-fg-muted" data-testid="access-summary">
                        <ShieldCheck className="h-3.5 w-3.5 text-fg-subtle" aria-hidden /> {accessSummary(a, presets)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AccountStatusBadge account={a} />
                      <PasswordStateBadge account={a} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                    {accessButton(a)}
                    <AccountActions account={a} currentUserId={currentUserId} />
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {editing ? <AccessDialog account={editing} presets={presets} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
