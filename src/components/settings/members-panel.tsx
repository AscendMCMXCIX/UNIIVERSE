"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, UserPlus, X } from "lucide-react";
import type { AccessRole } from "@/server/auth/permissions";
import { createInviteAction, deleteUserAction, resetMemberPasswordAction, revokeInviteAction, updateUserAction } from "@/server/actions/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export interface MemberView {
  id: string;
  username: string;
  displayName: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  hasPassword: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface InviteView {
  id: string;
  token: string;
  role: AccessRole;
  playerName: string | null;
  note: string;
  expiresAt: string;
}

function expiryText(iso: string): string {
  const d = new Date(iso);
  const days = Math.max(0, Math.round((d.getTime() - Date.now()) / 86_400_000));
  return `${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} (${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`})`;
}

const ROLE_OPTIONS: Array<{ value: AccessRole; label: string; hint: string }> = [
  { value: "player", label: "Player", hint: "edits own profile, Riot accounts, roles and pools; watches drafts" },
  { value: "coach", label: "Coach / Analyst", hint: "controls drafts and match records, edits every player" },
  { value: "owner", label: "Owner / Admin", hint: "everything, including members, settings and branding" },
];

export function MembersPanel({ users, invites, players, currentUserId }: { users: MemberView[]; invites: InviteView[]; players: Array<{ id: string; displayName: string; claimed: boolean }>; currentUserId: string | null }) {
  const router = useRouter();
  const [role, setRole] = React.useState<AccessRole>("player");
  const [playerId, setPlayerId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [lastInvite, setLastInvite] = React.useState<{ link: string; role: AccessRole; playerName: string | null; expiresAt: string; id: string } | null>(null);
  const [tempPassword, setTempPassword] = React.useState<{ name: string; password: string } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (token: string) => `${origin}/invite/${token}`;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    setMessage(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMessage({ tone: "bad", text: r.error ?? "Failed" });
    else {
      setMessage({ tone: "good", text: success });
      router.refresh();
    }
  };

  const invite = async () => {
    setBusy(true);
    setMessage(null);
    const r = await createInviteAction({ role, playerId: playerId || null, note });
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setLastInvite({ link: linkFor(r.data.token), role: r.data.role, playerName: r.data.playerName, expiresAt: r.data.expiresAt, id: r.data.id });
    setNote("");
    setPlayerId("");
    router.refresh();
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => setMessage({ tone: "good", text: "Link copied. Send it to your teammate over any chat; it works once and expires on the date shown." }));

  return (
    <Panel>
      <PanelHeader title="TEAM MEMBERS" subtitle="Invite links only: no email anywhere. A teammate opens the link, picks a username, enters their Riot ID and gets an account, a player profile and their Riot account in one step." />
      <PanelBody className="space-y-5">
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}

        <div className="rounded-md border border-border bg-bg-elevated p-3">
          <SectionLabel className="mb-2">How to invite a teammate</SectionLabel>
          <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-xs text-fg-muted">
            <li>Choose the role they get (Player for roster members, Coach for whoever runs drafts) and, if they already exist on the roster as a placeholder, which profile they take over.</li>
            <li>Click <span className="font-medium text-fg">Create link</span>, then <span className="font-medium text-fg">Copy</span> and send the link over Discord or any chat.</li>
            <li>They open it, choose a username, enter their Riot ID (plus any alt accounts) and main role; a password is optional at that point.</li>
            <li>Their Riot account is verified with Riot automatically; you will see them under Accounts and on the Team page within minutes.</li>
          </ol>
          <SectionLabel className="mb-2">Invite a teammate</SectionLabel>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]">
            <div>
              <Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as AccessRole)}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Roster placeholder to take over (optional)</Label>
              <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">— none: a new profile is created at sign-up —</option>
                {players
                  .filter((p) => !p.claimed)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="shown on the invite page" />
            </div>
            <div className="self-end">
              <Button variant="primary" onClick={invite} disabled={busy}>
                <UserPlus className="h-4 w-4" /> Create link
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-fg-subtle">{ROLE_OPTIONS.find((o) => o.value === role)?.hint}</p>
          {lastInvite ? (
            <div className="mt-3 space-y-2 rounded-md border border-accent/50 bg-accent/10 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Link2 className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold text-fg">Invite link ready</span>
                <Badge tone="accent">{ROLE_OPTIONS.find((o) => o.value === lastInvite.role)?.label}</Badge>
                <span className="text-fg-muted">{lastInvite.playerName ? `takes over ${lastInvite.playerName}` : "new player profile at sign-up"}</span>
                <span className="text-fg-subtle">· single use · expires {expiryText(lastInvite.expiresAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 basis-full truncate rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-[12px] text-fg sm:flex-1 sm:basis-auto">{lastInvite.link}</code>
                <Button size="md" variant="primary" onClick={() => copy(lastInvite.link)}>
                  <Copy className="h-3.5 w-3.5" /> COPY
                </Button>
                <Button size="md" variant="ghost" disabled={busy} onClick={() => run(() => revokeInviteAction(lastInvite.id), "Invite revoked; the link no longer works.").then(() => setLastInvite(null))}>
                  <X className="h-3.5 w-3.5" /> Revoke
                </Button>
              </div>
              <p className="text-fg-subtle">Send it over Discord or any chat. Anyone with the link can create the account, so send it only to the person it is for.</p>
            </div>
          ) : null}
        </div>

        <div>
          <SectionLabel className="mb-2">Accounts</SectionLabel>
          {tempPassword ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
              <span>
                Temporary password for <span className="font-semibold">{tempPassword.name}</span>: <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-sm">{tempPassword.password}</code>
              </span>
              <span className="text-fg-muted">Shown once. Pass it on privately; they change it under My profile.</span>
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
              <div key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-[180px]">
                  <div className="font-medium">
                    {u.displayName}
                    {u.id === currentUserId ? <span className="ml-1 text-xs text-fg-subtle">(you)</span> : null}
                  </div>
                  <div className="text-xs text-fg-subtle">
                    @{u.username}
                    {!u.hasPassword ? <span className="ml-1 text-warn">· no password set</span> : null}
                  </div>
                </div>
                <Select className="h-8 w-40 text-xs" value={u.role} disabled={busy || u.id === currentUserId} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value as AccessRole }), "Role updated.")}>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select className="h-8 w-44 text-xs" value={u.playerId ?? ""} disabled={busy} onChange={(e) => run(() => updateUserAction(u.id, { playerId: e.target.value || null }), "Player link updated.")}>
                  <option value="">no player profile</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.claimed && p.id !== u.playerId}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-fg-subtle">last login {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}</span>
                {!u.isActive ? <Badge tone="warn">deactivated</Badge> : null}
                <span className="flex-1" />
                {u.id !== currentUserId ? (
                  <>
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
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {invites.length > 0 ? (
          <div>
            <SectionLabel className="mb-2">Open invites</SectionLabel>
            <div className="divide-y divide-border">
              {invites.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
                  <Badge tone="accent">{ROLE_OPTIONS.find((o) => o.value === i.role)?.label}</Badge>
                  <span className="text-fg-muted">{i.playerName ? `takes over ${i.playerName}` : "new profile at sign-up"}</span>
                  {i.note ? <span className="text-fg-subtle">“{i.note}”</span> : null}
                  <span className="text-fg-subtle">expires {expiryText(i.expiresAt)}</span>
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => copy(linkFor(i.token))}>
                    <Copy className="h-3 w-3" /> Copy link
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => revokeInviteAction(i.id), "Invite revoked.")}>
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
