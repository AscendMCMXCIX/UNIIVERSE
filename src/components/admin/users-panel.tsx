"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AccessRole } from "@/server/auth/permissions";
import { deleteUserAction, resetMemberPasswordAction, updateUserAction } from "@/server/actions/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export interface UserAdminView {
  id: string;
  username: string;
  displayName: string;
  role: AccessRole;
  draftLead: boolean;
  playerId: string | null;
  playerName: string | null;
  hasPassword: boolean;
  isActive: boolean;
  setupComplete: boolean;
  lastLoginAt: string | null;
}

const ROLE_OPTIONS: Array<{ value: AccessRole; label: string; hint: string }> = [
  { value: "player", label: "Player", hint: "own profile, pools and Riot accounts; views everything else" },
  { value: "coach", label: "Team Leader / Draft Lead", hint: "lineup, role assignments, drafts, series and match records" },
  { value: "owner", label: "Owner / Admin", hint: "everything, including this area" },
];

/** Users & Permissions: account role, the Draft Lead flag for players, profile link, password, status. */
export function UsersPanel({ users, players, currentUserId }: { users: UserAdminView[]; players: Array<{ id: string; displayName: string; claimed: boolean }>; currentUserId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [tempPassword, setTempPassword] = React.useState<{ name: string; password: string } | null>(null);
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    setMessage(null);
    const r = await fn();
    setBusy(false);
    setMessage(r.ok ? { tone: "good", text: done } : { tone: "bad", text: r.error });
    router.refresh();
  };
  return (
    <Panel>
      <PanelHeader title="USERS & PERMISSIONS" subtitle="Three kinds of people: Owner / Admin, Team Leader / Draft Lead, Player. A player can be given Draft Lead without becoming an admin." />
      <PanelBody className="space-y-3">
        <ul className="grid gap-1 text-xs text-fg-muted sm:grid-cols-3">
          {ROLE_OPTIONS.map((o) => (
            <li key={o.value} className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
              <span className="font-medium text-fg">{o.label}</span>: {o.hint}
            </li>
          ))}
        </ul>
        {message ? (
          <p className={`text-xs ${message.tone === "good" ? "text-good" : "text-bad"}`} role="status">
            {message.text}
          </p>
        ) : null}
        {tempPassword ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
            <span>
              Temporary password for <span className="font-semibold">{tempPassword.name}</span>: <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-sm">{tempPassword.password}</code>
            </span>
            <span className="text-fg-muted">Shown once. Pass it on privately; they change it under Settings.</span>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(tempPassword.password)}>
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTempPassword(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}
        <div className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
              <div className="min-w-[180px]">
                <div className="flex flex-wrap items-center gap-1.5 font-medium">
                  {u.displayName}
                  {u.id === currentUserId ? <span className="text-xs text-fg-subtle">(you)</span> : null}
                  {!u.isActive ? <Badge tone="warn">deactivated</Badge> : null}
                  {!u.setupComplete ? <Badge tone="accent">setup pending</Badge> : null}
                  {u.role === "player" && u.draftLead ? <Badge tone="info">Draft Lead</Badge> : null}
                </div>
                <div className="text-xs text-fg-subtle">
                  @{u.username}
                  {!u.hasPassword ? <span className="ml-1 text-warn">· no password set</span> : null}
                  <span className="ml-1">· last sign-in {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}</span>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                Role
                <Select className="h-9 w-52 text-xs md:h-8" value={u.role} disabled={busy || u.id === currentUserId} aria-label={`Role of ${u.displayName}`} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value as AccessRole }), "Role updated.")}>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
              {u.role === "player" ? (
                <label className="flex min-h-9 items-center gap-1.5 text-xs text-fg-muted">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={u.draftLead} disabled={busy} onChange={(e) => run(() => updateUserAction(u.id, { draftLead: e.target.checked }), e.target.checked ? "Draft Lead granted." : "Draft Lead removed.")} />
                  Draft Lead
                </label>
              ) : null}
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                Profile
                <Select className="h-9 w-44 text-xs md:h-8" value={u.playerId ?? ""} disabled={busy} aria-label={`Player profile of ${u.displayName}`} onChange={(e) => run(() => updateUserAction(u.id, { playerId: e.target.value || null }), "Player link updated.")}>
                  <option value="">no player profile</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.claimed && p.id !== u.playerId}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </label>
              <span className="flex-1" />
              {u.id !== currentUserId ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`${u.hasPassword ? "Reset" : "Set"} ${u.displayName}'s password? ${u.hasPassword ? "Their current password stops working and their devices are signed out." : "They can then sign in from any device."}`)) return;
                      setBusy(true);
                      const r = await resetMemberPasswordAction(u.id);
                      setBusy(false);
                      if (r.ok) setTempPassword({ name: u.displayName, password: r.data.temporaryPassword });
                      else setMessage({ tone: "bad", text: r.error });
                    }}
                  >
                    {u.hasPassword ? "Reset password" : "Set password"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => updateUserAction(u.id, { isActive: !u.isActive }), u.isActive ? "Account deactivated." : "Account reactivated.")}>
                    {u.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => confirm(`Delete the account for ${u.displayName}? Their player profile is kept.`) && run(() => deleteUserAction(u.id), "Account deleted.")}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
