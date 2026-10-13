"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { archivePlayerAction, setPlayerGroupAction } from "@/server/actions/players";
import { createInviteAction, reissueInviteAction, revokeInviteAction } from "@/server/actions/users";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { InviteLinkRow } from "./add-player-account";

export interface PlayerAdminRow {
  id: string;
  displayName: string;
  riotId: string | null;
  primaryRole: Role;
  secondaryRole: Role | null;
  group: "main" | "other";
  archived: boolean;
  lineupRole: Role | null;
  /** none = profile without an account; pending = account created, setup not finished; active = ready. */
  account: { state: "none" } | { state: "pending"; userId: string; username: string; inviteToken: string | null; inviteExpiresAt: string | null } | { state: "active"; userId: string; username: string; access: string };
  riot: { state: "synced" | "pending" | "stale" | "error" | "none"; label: string };
}

export interface OpenInviteRow {
  id: string;
  token: string;
  username: string | null;
  playerName: string | null;
  role: string;
  expiresAt: string;
}

const RIOT_TONE: Record<PlayerAdminRow["riot"]["state"], BadgeTone> = { synced: "good", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/** Players & Invitations: Main / Other status, archive, account and setup state, Riot sync, invite links. */
export function PlayersAdminPanel({ players, invites }: { players: PlayerAdminRow[]; invites: OpenInviteRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [fresh, setFresh] = React.useState<Record<string, { token: string; expiresAt: string }>>({});
  const [showArchived, setShowArchived] = React.useState(false);
  const run = async (key: string, fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string) => {
    setBusy(key);
    setMessage(null);
    const r = await fn();
    setBusy(null);
    setMessage(r.ok ? { tone: "good", text: done } : { tone: "bad", text: r.error });
    router.refresh();
    return r;
  };
  const visible = players.filter((p) => showArchived || !p.archived);
  const groups: Array<{ title: string; subtitle: string; rows: PlayerAdminRow[] }> = [
    { title: "Main players", subtitle: "Appear on the Team page and can fill the five lineup slots.", rows: visible.filter((p) => p.group === "main") },
    { title: "Other players", subtitle: "Substitutes, stand-ins and friends: available in the Players list and the substitution flow only.", rows: visible.filter((p) => p.group === "other") },
  ];
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="PLAYERS"
          subtitle="Who exists in UNIIVERSE, whether they have an account, and whether their Riot data is flowing."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          }
        />
        <PanelBody className="space-y-4">
          {message ? (
            <p className={`text-xs ${message.tone === "good" ? "text-good" : "text-bad"}`} role="status">
              {message.text}
            </p>
          ) : null}
          {groups.map((g) => (
            <div key={g.title}>
              <SectionLabel className="mb-0.5">{g.title}</SectionLabel>
              <p className="mb-2 text-xs text-fg-subtle">{g.subtitle}</p>
              {g.rows.length === 0 ? <p className="text-sm text-fg-muted">None.</p> : null}
              <div className="divide-y divide-border">
                {g.rows.map((p) => {
                  const issued = fresh[p.id] ?? (p.account.state === "pending" && p.account.inviteToken ? { token: p.account.inviteToken, expiresAt: p.account.inviteExpiresAt ?? "" } : null);
                  return (
                    <div key={p.id} className="space-y-2 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="min-w-[160px]">
                          <Link href={`/players/${p.id}`} className="font-medium text-fg hover:underline">
                            {p.displayName}
                          </Link>
                          <div className="text-xs text-fg-subtle">
                            {p.riotId ?? "no Riot ID"} · {ROLE_LABELS[p.primaryRole]}
                            {p.secondaryRole ? ` / ${ROLE_LABELS[p.secondaryRole]}` : ""}
                            {p.lineupRole ? ` · in lineup as ${ROLE_LABELS[p.lineupRole]}` : ""}
                          </div>
                        </div>
                        {p.archived ? <Badge tone="neutral">archived</Badge> : null}
                        {p.account.state === "none" ? <Badge tone="warn">no account</Badge> : p.account.state === "pending" ? <Badge tone="accent">setup pending · @{p.account.username}</Badge> : <Badge tone="good">@{p.account.username} · {p.account.access}</Badge>}
                        <Badge tone={RIOT_TONE[p.riot.state]} title="Riot data sync">
                          Riot: {p.riot.label}
                        </Badge>
                        <span className="flex-1" />
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(p.id, () => setPlayerGroupAction(p.id, p.group === "main" ? "other" : "main"), p.group === "main" ? "Moved to Other players." : "Moved to Main players.")}>
                            {p.group === "main" ? "Make Other" : "Make Main"}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(p.id, () => archivePlayerAction(p.id, !p.archived), p.archived ? "Player restored." : "Player archived.")}>
                            {p.archived ? "Restore" : "Archive"}
                          </Button>
                          {p.account.state === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={async () => {
                                const userId = p.account.state === "pending" ? p.account.userId : "";
                                const r = await run(p.id, () => reissueInviteAction(userId), "New invite link issued; older links stop working.");
                                if (r.ok && r.data) setFresh((f) => ({ ...f, [p.id]: r.data as { token: string; expiresAt: string } }));
                              }}
                            >
                              New invite link
                            </Button>
                          ) : null}
                          {p.account.state === "none" && !p.archived ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={async () => {
                                const r = await run(p.id, () => createInviteAction({ role: "player", playerId: p.id }), "Invite created: the link lets someone take over this profile.");
                                if (r.ok && r.data) setFresh((f) => ({ ...f, [p.id]: { token: (r.data as { token: string }).token, expiresAt: (r.data as { expiresAt: string }).expiresAt } }));
                              }}
                            >
                              Invite to claim profile
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {issued ? <InviteLinkRow token={issued.token} expiresAt={issued.expiresAt} username={p.account.state !== "none" ? p.account.username : p.displayName} /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="OPEN INVITATIONS" subtitle="Links that have not been used yet. Revoking one makes it stop working at once." />
        <PanelBody>
          {invites.length === 0 ? <p className="text-sm text-fg-muted">No open invitations.</p> : null}
          <div className="divide-y divide-border">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-xs">
                <span className="font-medium text-fg">{i.username ? `@${i.username}` : i.playerName ? `claims ${i.playerName}` : "new account at sign-up"}</span>
                <Badge tone="neutral">{i.role}</Badge>
                <span className="text-fg-subtle">expires {new Date(i.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                <span className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/invite/${i.token}`)}>
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(i.id, () => revokeInviteAction(i.id), "Invite revoked.")}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
