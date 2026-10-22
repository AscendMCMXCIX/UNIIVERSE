"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { AccountView } from "@/server/auth/account-admin";
import { archivePlayerAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { InfoTip } from "@/components/ui/info-tip";
import { ShieldCheck } from "lucide-react";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { SearchInput } from "@/components/ui/search-input";
import { AccountActions, AccountStatusBadge, DeleteProfileButton, PasswordStateBadge, accountStatus } from "./account-actions";
import { AccessDialog, accessSummary } from "./access-dialog";
import { ErasePersonButton, ErasureResultHost } from "./erase-person";

export interface PlayerAdminRow {
  id: string;
  displayName: string;
  riotId: string | null;
  /** Null until the player chooses it in their first-time setup. */
  primaryRole: Role | null;
  secondaryRole: Role | null;
  group: "main" | "other";
  /** Member of the competitive team; false = personal use only. */
  teamMember: boolean;
  archived: boolean;
  lineupRole: Role | null;
  account: AccountView | null;
  riot: { state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none"; label: string };
}

type StatusFilter = "all" | "active" | "awaiting-login" | "setup" | "deactivated" | "personal" | "delayed";

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
    case "awaiting-login":
    case "setup":
    case "deactivated":
      return !!p.account && accountStatus(p.account) === f;
    case "personal":
      return !p.teamMember;
    case "delayed":
      return p.riot.state === "stale" || p.riot.state === "error";
  }
};

const FILTERS: Array<{ id: StatusFilter; label: string; tone?: "warn" | "bad" | "info" }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "awaiting-login", label: "Awaiting first login", tone: "info" },
  { id: "setup", label: "Setup incomplete", tone: "warn" },
  { id: "deactivated", label: "Deactivated", tone: "bad" },
  { id: "personal", label: "Personal use" },
  { id: "delayed", label: "Riot sync delayed", tone: "warn" },
];

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Users & Permissions → Accounts: one list of everyone (team members, personal-use accounts, accounts
 * still awaiting their first login or setup, deactivated ones, the admin account and profiles
 * without an account) with status, team membership, Riot sync and access at a glance. Find a
 * person, then Manage opens their team membership and access in one dialog; account actions
 * (password, deactivate, delete) and roster actions (archive) sit on the row.
 */
export function PeoplePanel({ players, adminAccounts = [], presets = [], currentUserId, viewerIsOwner = false, canManageAccounts = true, canManageRoster = true }: { players: PlayerAdminRow[]; adminAccounts?: AccountView[]; presets?: PermissionPreset[]; currentUserId: string | null; viewerIsOwner?: boolean; canManageAccounts?: boolean; canManageRoster?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<AccountView | null>(null);
  const q = fold(query.trim());
  const found = (p: PlayerAdminRow) => !q || fold(p.displayName).includes(q) || fold(p.account?.username ?? "").includes(q) || fold(p.riotId ?? "").includes(q);
  // Only the Owner changes the Owner account (the server refuses anyone else as well).
  const lockedReason = (a: AccountView) => (a.userId === currentUserId ? "Your own access cannot be changed here" : a.role === "owner" && !viewerIsOwner ? "Only the Owner changes the Owner account" : null);
  // Erasure, like the server: never yourself or the Owner account; an administrator only by the Owner.
  const mayErase = (a: AccountView) => a.userId !== currentUserId && a.role !== "owner" && (!a.isAdmin || viewerIsOwner);
  const accessButton = (a: AccountView) =>
    canManageAccounts ? (
      <Button size="sm" variant="outline" onClick={() => setEditing(a)} disabled={!!lockedReason(a)} title={lockedReason(a) ?? "Team membership, access level, additional access and administrator access"} data-testid="open-access">
        <ShieldCheck className="h-4 w-4" /> Manage access
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
    { key: "team", title: "Team members", subtitle: "The team workspace: Team Overview, Players, Leaderboards and Matches. Listed in Players and eligible for the lineup once set up.", rows: visible.filter((p) => p.teamMember) },
    { key: "personal", title: "Personal use", subtitle: "Their own profile, statistics and Solo Queue Blocks; no Team pages, not in Players or the lineup.", rows: visible.filter((p) => !p.teamMember) },
  ];

  return (
    <ErasureResultHost>
      <section className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5" data-testid="players-admin">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Find a person, username or Riot ID" label="Find a person" className="sm:max-w-xs" testId="people-search" />
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
              <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", counts[f.id] > 0 && f.tone === "warn" ? "bg-warn/15 text-warn" : counts[f.id] > 0 && f.tone === "bad" ? "bg-bad/15 text-bad" : counts[f.id] > 0 && f.tone === "info" ? "bg-info/15 text-info" : "bg-surface-3 text-fg-muted")}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {groups.map((g) => (
          <div key={g.key} className="space-y-2" data-testid={`people-group-${g.key}`}>
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
                  <li key={p.id} className={cn("space-y-3 rounded-panel border border-border bg-bg-elevated p-3", p.archived && "opacity-70")} data-testid="admin-player-row">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Avatar name={p.displayName} src={p.account?.avatarUrl ?? null} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {p.primaryRole && p.teamMember ? (
                            // Their profile is a Player Mode page: it opens in a new tab, so Admin Mode stays here.
                            <Link href={`/players/${p.id}`} target="_blank" rel="noopener" title="Open their profile (Player Mode) in a new tab" className="font-semibold text-fg hover:underline">
                              {p.displayName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-fg">{p.displayName}</span>
                          )}
                          {p.account ? <span className="text-sm text-fg-subtle">@{p.account.username}</span> : null}
                          {p.account?.role === "owner" ? <Badge tone="accent">Owner</Badge> : p.account?.isAdmin ? <Badge tone="accent" title="Can open Admin Mode">Administrator</Badge> : null}
                          {p.archived ? <Badge tone="neutral">Archived</Badge> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                          {p.primaryRole ? (
                            <span className="inline-flex items-center gap-1">
                              <RoleIcon role={p.primaryRole} className="h-3.5 w-3.5" /> {ROLE_LABELS[p.primaryRole]}
                              {p.secondaryRole ? ` / ${ROLE_LABELS[p.secondaryRole]}` : ""}
                            </span>
                          ) : (
                            <span className="text-fg-subtle">Role not chosen yet</span>
                          )}
                          <span className="text-fg-subtle">· {p.riotId ?? "no Riot ID"}</span>
                          {p.lineupRole ? <span className="text-fg-subtle">· lineup {ROLE_LABELS[p.lineupRole]}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.account ? (
                          <AccountStatusBadge account={p.account} />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Badge tone="warn">No account</Badge>
                            <InfoTip label="About profiles without an account" text="A profile without an account: a test entry, an old placeholder, or what a deleted account left behind. Creating a player with the same Riot ID reuses it." />
                          </span>
                        )}
                        <Badge tone={p.teamMember ? "accent" : "neutral"} title={p.teamMember ? "Uses the team workspace" : "Personal use only: no Team pages"}>
                          {p.teamMember ? "Team member" : "Personal use"}
                        </Badge>
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
                        {canManageAccounts && p.account ? <AccountActions account={p.account} currentUserId={currentUserId} viewerIsOwner={viewerIsOwner} /> : null}
                        {canManageAccounts && !p.account ? <DeleteProfileButton playerId={p.id} name={p.displayName} /> : null}
                        {canManageAccounts && (!p.account || mayErase(p.account)) ? <ErasePersonButton target={p.account ? { userId: p.account.userId } : { playerId: p.id }} name={p.account?.username ?? p.displayName} /> : null}
                        <span className="flex-1" />
                        {canManageRoster ? (
                          <>
                            {!p.account ? (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archivePlayerAction(p.id, !p.archived), p.archived ? "Profile restored." : "Profile archived.")}>
                                {p.archived ? "Restore profile" : "Archive profile"}
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {canManageAccounts && adminAccounts.filter((a) => !q || fold(a.username).includes(q)).length > 0 ? (
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">Accounts without a player profile <span className="font-normal text-fg-subtle">· {adminAccounts.length}</span></h3>
              <p className="text-xs text-fg-subtle">The admin account (it works in Admin Mode only), and any account from before automatic profiles.</p>
            </div>
            <ul className="space-y-2">
              {adminAccounts
                .filter((a) => !q || fold(a.username).includes(q))
                .map((a) => (
                  <li key={a.userId} className="space-y-2 rounded-panel border border-border bg-bg-elevated p-3" data-testid="admin-user-row">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={a.username} src={a.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">{a.username}</span>
                          {a.userId === currentUserId ? <span className="text-xs text-fg-subtle">(you)</span> : null}
                          {a.role === "owner" ? <Badge tone="accent">Owner</Badge> : a.isAdmin ? <Badge tone="accent" title="Can open Admin Mode">Administrator</Badge> : null}
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
                      <AccountActions account={a} currentUserId={currentUserId} viewerIsOwner={viewerIsOwner} />
                      {mayErase(a) ? <ErasePersonButton target={{ userId: a.userId }} name={a.username} /> : null}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {editing ? <AccessDialog account={editing} presets={presets} lineupRole={players.find((p) => p.id === editing.playerId)?.lineupRole ?? null} onClose={() => setEditing(null)} /> : null}
      </section>
    </ErasureResultHost>
  );
}
