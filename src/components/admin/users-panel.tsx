"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { AccountView } from "@/server/auth/account-admin";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { setAccountRoleAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";
import { AccountActions, AccountStatusBadge, PasswordStateBadge } from "./account-actions";
import { accessName, PermissionPresetsPanel, UserAccessDialog } from "./permissions-editor";

/**
 * Users & Permissions: each account's role (Admin or Player) and, for players, their access — a
 * preset or a custom set of capabilities — plus the presets themselves. Every rule is enforced on
 * the server; you can never deactivate, delete or demote yourself or the last admin.
 */
export function UsersPanel({ accounts, currentUserId, presets }: { accounts: AccountView[]; currentUserId: string | null; presets: PermissionPreset[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountView | null>(null);
  const [promote, setPromote] = React.useState<AccountView | null>(null);
  const setRole = async (a: AccountView, role: "owner" | "player") => {
    setBusy(true);
    const r = await setAccountRoleAction(a.userId, role);
    setBusy(false);
    if (r.ok) toast.success(role === "owner" ? `${a.username} is now an Admin.` : `${a.username} is now a Player.`);
    else toast.error(r.error);
    router.refresh();
  };
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Accounts</h2>
          <p className="text-sm text-fg-muted">Admins have full access. Players get the capabilities of their preset, or a custom set.</p>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {accounts.map((a) => (
            <li key={a.userId} className="flex flex-col gap-3 px-3 py-3 sm:px-4" data-testid="admin-user-row">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={a.username} src={a.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{a.username}</span>
                    {a.userId === currentUserId ? <span className="text-xs text-fg-subtle">(you)</span> : null}
                    <AccountStatusBadge account={a} />
                    <PasswordStateBadge account={a} />
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {a.playerId ? (
                      <Link href={`/players/${a.playerId}`} className="hover:underline">
                        Player profile
                      </Link>
                    ) : (
                      "No player profile"
                    )}{" "}
                    · last sign-in {a.lastLoginAt ? timeAgo(a.lastLoginAt) : "never"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={`Role of ${a.username}`}
                    value={a.role === "owner" ? "owner" : "player"}
                    disabled={busy || a.userId === currentUserId}
                    className="w-32"
                    onChange={(e) => {
                      const role = e.target.value as "owner" | "player";
                      if (role === "owner") setPromote(a);
                      else void setRole(a, role);
                    }}
                  >
                    <option value="player">Player</option>
                    <option value="owner">Admin</option>
                  </Select>
                  {a.role === "owner" ? (
                    <span className="inline-flex h-11 items-center gap-1.5 px-2 text-sm text-fg-muted md:h-9">
                      <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Full access
                    </span>
                  ) : (
                    <Button variant="outline" onClick={() => setEditing(a)} data-testid="edit-access">
                      {accessName(a, presets)}
                    </Button>
                  )}
                </div>
              </div>
              <AccountActions account={a} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      </section>
      <PermissionPresetsPanel presets={presets} />
      {editing ? <UserAccessDialog open onClose={() => setEditing(null)} account={editing} presets={presets} /> : null}
      <ConfirmDialog
        open={!!promote}
        tone="primary"
        title={`Make ${promote?.username ?? ""} an Admin?`}
        description="Admins can manage every account, permission and setting, and override any draft."
        confirmLabel="Make Admin"
        busy={busy}
        onCancel={() => {
          setPromote(null);
          router.refresh();
        }}
        onConfirm={async () => {
          if (promote) await setRole(promote, "owner");
          setPromote(null);
        }}
      />
    </div>
  );
}
