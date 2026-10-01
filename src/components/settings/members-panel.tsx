"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, UserPlus } from "lucide-react";
import type { AccessRole } from "@/server/auth/permissions";
import { createInviteAction, deleteUserAction, revokeInviteAction, updateUserAction } from "@/server/actions/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export interface MemberView {
  id: string;
  email: string;
  displayName: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface InviteView {
  id: string;
  token: string;
  role: AccessRole;
  playerName: string | null;
  email: string | null;
  note: string;
  expiresAt: string;
}

const ROLE_OPTIONS: Array<{ value: AccessRole; label: string; hint: string }> = [
  { value: "player", label: "Player", hint: "edits own profile, Riot accounts, roles and pools; watches drafts" },
  { value: "coach", label: "Coach / Analyst", hint: "controls drafts, scouting, opponents and match records" },
  { value: "owner", label: "Owner / Admin", hint: "everything, including members, settings and branding" },
];

export function MembersPanel({ users, invites, players, currentUserId }: { users: MemberView[]; invites: InviteView[]; players: Array<{ id: string; displayName: string; claimed: boolean }>; currentUserId: string | null }) {
  const router = useRouter();
  const [role, setRole] = React.useState<AccessRole>("player");
  const [playerId, setPlayerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [lastLink, setLastLink] = React.useState<string | null>(null);

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
    const r = await createInviteAction({ role, playerId: playerId || null, email: email || null, note });
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setLastLink(linkFor(r.data.token));
    setEmail("");
    setNote("");
    setPlayerId("");
    router.refresh();
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => setMessage({ tone: "good", text: "Link copied. Send it to your teammate (it expires in 14 days)." }));

  return (
    <Panel>
      <PanelHeader title="TEAM MEMBERS" subtitle="Everyone gets their own login. Bind an invite to a saved player so they claim that profile instead of creating a duplicate." />
      <PanelBody className="space-y-5">
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}

        <div className="rounded-md border border-border bg-bg-elevated p-3">
          <SectionLabel className="mb-2">Invite a teammate</SectionLabel>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_1fr_auto]">
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
              <Label>Claims player profile</Label>
              <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">— none (account only) —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.claimed}>
                    {p.displayName}
                    {p.claimed ? " (already claimed)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prefills the form" />
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
          {lastLink ? (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
              <Link2 className="h-3.5 w-3.5 text-accent" />
              <code className="flex-1 truncate">{lastLink}</code>
              <Button size="sm" variant="outline" onClick={() => copy(lastLink)}>
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
          ) : null}
        </div>

        <div>
          <SectionLabel className="mb-2">Accounts</SectionLabel>
          <div className="divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-[180px]">
                  <div className="font-medium">
                    {u.displayName}
                    {u.id === currentUserId ? <span className="ml-1 text-xs text-fg-subtle">(you)</span> : null}
                  </div>
                  <div className="text-xs text-fg-subtle">{u.email}</div>
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
                  <span className="text-fg-muted">{i.playerName ? `claims ${i.playerName}` : "account only"}</span>
                  {i.email ? <span className="text-fg-subtle">{i.email}</span> : null}
                  <span className="text-fg-subtle">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
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
