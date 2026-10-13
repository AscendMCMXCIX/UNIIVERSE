"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, UserPlus } from "lucide-react";
import { createPlayerAccountAction, type CreatedAccountView } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export function inviteLink(token: string): string {
  return `${typeof window === "undefined" ? "" : window.location.origin}/invite/${token}`;
}

/** Copy-to-clipboard for an invite link, with a visible fallback when the clipboard is unavailable. */
export function InviteLinkRow({ token, expiresAt, username }: { token: string; expiresAt?: string | null; username?: string | null }) {
  const [copied, setCopied] = React.useState(false);
  const link = inviteLink(token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the link is visible; select and copy by hand */
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-bg-elevated px-2 py-1 font-mono text-xs" title={link}>
          {link}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-[11px] text-fg-subtle">
        {username ? `Send this to ${username}. ` : ""}They open it, choose roles, champions and a password, and are signed in.{expiresAt ? ` Expires ${new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.` : ""}
      </p>
    </div>
  );
}

/** Admin → Players → Add Player Account: username + Riot ID, nothing else. */
export function AddPlayerAccount() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [riotId, setRiotId] = React.useState("");
  const [group, setGroup] = React.useState<"main" | "other">("main");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedAccountView | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createPlayerAccountAction({ username, riotId, group });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCreated(r.data);
    setUsername("");
    setRiotId("");
    router.refresh();
  };
  return (
    <Panel>
      <PanelHeader title="ADD PLAYER ACCOUNT" subtitle="Enter the username and the Riot ID. UNIIVERSE creates the account, the player profile and the Riot link together and gives you the invite link to send. No email." />
      <PanelBody className="space-y-3">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
          <div>
            <Label htmlFor="new-username">Username</Label>
            <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Ascend" required maxLength={32} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="new-riot-id">Riot ID</Label>
            <Input id="new-riot-id" value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="GameName#TAG" required maxLength={40} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <Label htmlFor="new-group">Status</Label>
            <Select id="new-group" value={group} onChange={(e) => setGroup(e.target.value as "main" | "other")} className="sm:w-32">
              <option value="main">Main player</option>
              <option value="other">Other player</option>
            </Select>
          </div>
          <Button type="submit" variant="primary" disabled={busy || !username.trim() || !riotId.includes("#")} className="w-full sm:w-auto">
            <UserPlus className="h-4 w-4" /> {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        {error ? (
          <p className="text-xs text-bad" role="alert">
            {error}
          </p>
        ) : null}
        {created ? (
          <div className="rounded-md border border-good/40 bg-good/10 p-3 text-sm">
            <p className="mb-1 font-medium text-good">Account created for {created.username}.</p>
            <InviteLinkRow token={created.inviteToken} expiresAt={created.expiresAt} username={created.username} />
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
