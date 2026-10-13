"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { AccountView } from "@/server/auth/account-admin";
import { archivePlayerAction, setPlayerGroupAction } from "@/server/actions/players";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { AccountActions, AccountStatusBadge, DeleteProfileButton, PasswordStateBadge } from "./account-actions";

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
  riot: { state: "synced" | "pending" | "stale" | "error" | "none"; label: string };
}

const RIOT_TONE: Record<PlayerAdminRow["riot"]["state"], BadgeTone> = { synced: "good", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };

/** Players & Accounts: every player with their account status, Riot sync, Main / Other, and the account actions. */
export function PlayersAdminPanel({ players, currentUserId }: { players: PlayerAdminRow[]; currentUserId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    setMessage(null);
    const r = await fn();
    setBusy(false);
    setMessage(r.ok ? { tone: "good", text: done } : { tone: "bad", text: r.error });
    router.refresh();
  };
  const visible = players.filter((p) => showArchived || !p.archived);
  const groups = [
    { title: "Main players", subtitle: "Appear on the Team page and can fill the five lineup slots.", rows: visible.filter((p) => p.group === "main") },
    { title: "Other players", subtitle: "Substitutes, stand-ins and friends: in the Players list and the substitution option only.", rows: visible.filter((p) => p.group === "other") },
  ];
  return (
    <Panel>
      <PanelHeader
        title="PLAYERS & ACCOUNTS"
        subtitle="Each player is one account and one profile. Status, Riot sync, Main / Other, password resets, deactivation and deletion."
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
              {g.rows.map((p) => (
                <div key={p.id} className="space-y-2 py-2.5 text-sm" data-testid="admin-player-row">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <div className="min-w-[160px]">
                      <Link href={`/players/${p.id}`} className="font-medium text-fg hover:underline">
                        {p.displayName}
                      </Link>
                      <div className="text-xs text-fg-subtle">
                        {p.account ? `@${p.account.username} · ` : ""}
                        {p.riotId ?? "no Riot ID"}
                        {p.account?.setupComplete ? ` · ${ROLE_LABELS[p.primaryRole]}${p.secondaryRole ? ` / ${ROLE_LABELS[p.secondaryRole]}` : ""}` : ""}
                        {p.lineupRole ? ` · in lineup as ${ROLE_LABELS[p.lineupRole]}` : ""}
                      </div>
                    </div>
                    {p.archived ? <Badge tone="neutral">archived</Badge> : null}
                    {p.account ? <AccountStatusBadge account={p.account} /> : <Badge tone="warn">no account</Badge>}
                    {p.account ? <PasswordStateBadge account={p.account} /> : null}
                    {p.account?.role === "owner" ? <Badge tone="accent">Admin</Badge> : null}
                    <Badge tone={RIOT_TONE[p.riot.state]} title="Riot data sync">
                      Riot: {p.riot.label}
                    </Badge>
                    <span className="flex-1" />
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setPlayerGroupAction(p.id, p.group === "main" ? "other" : "main"), p.group === "main" ? "Moved to Other players." : "Moved to Main players.")}>
                        {p.group === "main" ? "Make Other" : "Make Main"}
                      </Button>
                      {!p.account ? (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archivePlayerAction(p.id, !p.archived), p.archived ? "Profile restored." : "Profile archived.")}>
                          {p.archived ? "Restore profile" : "Archive profile"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {p.account ? (
                    <AccountActions account={p.account} currentUserId={currentUserId} />
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-fg-subtle">A profile without an account (a test entry, an old roster placeholder, or what a deleted account left behind). Creating a player with the same Riot ID reuses it; Delete profile removes it for good.</p>
                      <DeleteProfileButton playerId={p.id} name={p.displayName} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
