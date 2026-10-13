"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountView } from "@/server/auth/account-admin";
import { setAccountRoleAction } from "@/server/actions/users";
import { Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";
import { AccountActions, AccountStatusBadge, PasswordStateBadge } from "./account-actions";

const ROLE_HELP = [
  { label: "Admin", hint: "everything: accounts, permissions, site and Riot settings, the team, and an override on every draft." },
  { label: "Player", hint: "own profile, champion pools and Riot accounts; views everything; creates drafts and controls the drafts they created." },
];

/** Users & Permissions: role, status and the same account actions as Players & Accounts. */
export function UsersPanel({ accounts, currentUserId }: { accounts: AccountView[]; currentUserId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  return (
    <Panel>
      <PanelHeader title="USERS & PERMISSIONS" subtitle="Two kinds of account. Every rule is enforced on the server; you can never deactivate, delete or demote yourself or the last admin." />
      <PanelBody className="space-y-3">
        <ul className="grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
          {ROLE_HELP.map((o) => (
            <li key={o.label} className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
              <span className="font-medium text-fg">{o.label}</span>: {o.hint}
            </li>
          ))}
        </ul>
        {message ? (
          <p className={`text-xs ${message.tone === "good" ? "text-good" : "text-bad"}`} role="status">
            {message.text}
          </p>
        ) : null}
        <div className="divide-y divide-border">
          {accounts.map((a) => (
            <div key={a.userId} className="space-y-2 py-2.5 text-sm" data-testid="admin-user-row">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-[160px]">
                  <div className="font-medium text-fg">
                    @{a.username}
                    {a.userId === currentUserId ? <span className="ml-1 text-xs text-fg-subtle">(you)</span> : null}
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {a.playerId ? (
                      <Link href={`/players/${a.playerId}`} className="hover:underline">
                        {a.playerName ?? "profile"}
                      </Link>
                    ) : (
                      "no player profile"
                    )}{" "}
                    · last sign-in {a.lastLoginAt ? timeAgo(a.lastLoginAt) : "never"}
                  </div>
                </div>
                <AccountStatusBadge account={a} />
                <PasswordStateBadge account={a} />
                <span className="flex-1" />
                <Select
                  aria-label={`Role of ${a.username}`}
                  value={a.role === "owner" ? "owner" : "player"}
                  disabled={busy || a.userId === currentUserId}
                  className="h-9 w-32 md:h-8"
                  onChange={async (e) => {
                    const role = e.target.value as "owner" | "player";
                    if (role === "owner" && !confirm(`Make ${a.username} an Admin? Admins can manage every account and setting.`)) return router.refresh();
                    setBusy(true);
                    const r = await setAccountRoleAction(a.userId, role);
                    setBusy(false);
                    setMessage(r.ok ? { tone: "good", text: role === "owner" ? `${a.username} is now an Admin.` : `${a.username} is now a Player.` } : { tone: "bad", text: r.error });
                    router.refresh();
                  }}
                >
                  <option value="player">Player</option>
                  <option value="owner">Admin</option>
                </Select>
              </div>
              <AccountActions account={a} currentUserId={currentUserId} />
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
