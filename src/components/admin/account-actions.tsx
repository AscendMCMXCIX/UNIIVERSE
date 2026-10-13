"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import type { AccountView } from "@/server/auth/account-admin";
import { deleteAccountAction, issueActivationCodeAction, setAccountActiveAction } from "@/server/actions/users";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Account state in one badge: what an admin needs to know at a glance. */
export function AccountStatusBadge({ account }: { account: AccountView }) {
  if (!account.isActive) return <Badge tone="bad">Deactivated</Badge>;
  if (!account.setupComplete && account.playerId) return <Badge tone="accent">Setup pending</Badge>;
  return <Badge tone="good">Active</Badge>;
}

const CODE_TEXT: Record<AccountView["code"]["state"], { label: string; tone: BadgeTone }> = {
  none: { label: "no code issued", tone: "neutral" },
  open: { label: "code waiting to be used", tone: "info" },
  used: { label: "code used", tone: "neutral" },
  expired: { label: "code expired", tone: "warn" },
  locked: { label: "code blocked (too many wrong tries)", tone: "bad" },
};

export function CodeStateBadge({ account }: { account: AccountView }) {
  if (!account.acceptsCodes) return <Badge tone="neutral">signs in with password</Badge>;
  const c = CODE_TEXT[account.code.state];
  const until = account.code.state === "open" && account.code.expiresAt ? ` · until ${new Date(account.code.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";
  return (
    <Badge tone={c.tone}>
      {c.label}
      {until}
    </Badge>
  );
}

/** The one-time code, shown once, with copy and plain instructions for the player. */
export function ActivationCodeBox({ username, code, expiresAt }: { username: string; code: string; expiresAt: string }) {
  const [copied, setCopied] = React.useState(false);
  const site = typeof window === "undefined" ? "" : window.location.origin;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`UNIIVERSE: ${site}\nUsername: ${username}\nActivation code: ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the code is visible; copy it by hand */
    }
  };
  return (
    <div className="space-y-1.5 rounded-md border border-good/40 bg-good/10 p-3 text-sm" data-testid="activation-code">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">Activation code for {username}:</span>
        <code className="rounded bg-bg-elevated px-2 py-1 font-mono text-base font-semibold tracking-wider text-fg" data-testid="activation-code-value">
          {code}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy details"}
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        Give the player the website address, their username and this code. They sign in once with it on this device; it works one time only and expires {new Date(expiresAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}. It is shown only now: issue a new one if it is lost.
      </p>
    </div>
  );
}

/**
 * Issue code · Deactivate / Reactivate · Delete, the same on both admin pages. Destructive
 * actions ask for confirmation; the server enforces the rules (never yourself, never the last admin).
 */
export function AccountActions({ account, currentUserId, onMessage }: { account: AccountView; currentUserId: string | null; onMessage: (m: { tone: "good" | "bad"; text: string }) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [signOutOthers, setSignOutOthers] = React.useState(false);
  const self = account.userId === currentUserId;
  const run = async <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string): Promise<T | null> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    onMessage(r.ok ? { tone: "good", text: done } : { tone: "bad", text: r.error });
    router.refresh();
    return r.ok ? r.data : null;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {account.acceptsCodes && account.isActive ? (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => setIssued(await run(() => issueActivationCodeAction(account.userId, { signOutEverywhere: signOutOthers }), `New activation code for ${account.username}. Older unused codes stop working.`))}>
              {account.setupComplete ? "Issue new activation code" : "Issue activation code"}
            </Button>
            {account.setupComplete ? (
              <label className="flex items-center gap-1 text-xs text-fg-muted">
                <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} className="accent-[var(--color-accent)]" /> also sign out their devices
              </label>
            ) : null}
          </>
        ) : null}
        {!self ? (
          account.isActive ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm(`Deactivate ${account.username}? They are signed out everywhere and cannot sign in until reactivated. Nothing is deleted.`) && run(() => setAccountActiveAction(account.userId, false), `${account.username} deactivated.`)}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setAccountActiveAction(account.userId, true), `${account.username} reactivated. Issue an activation code so they can sign in.`)}>
              Reactivate
            </Button>
          )
        ) : null}
        {!self ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-bad"
            disabled={busy}
            onClick={() => {
              const typed = prompt(`Delete the account ${account.username}? Their player profile is archived (match history stays intact) and the account cannot be restored. Prefer Deactivate if they might come back.\n\nType the username to confirm:`);
              if (typed !== null && typed.trim().toLowerCase() === account.username.toLowerCase()) void run(() => deleteAccountAction(account.userId), `${account.username} deleted; their profile is archived.`);
              else if (typed !== null) onMessage({ tone: "bad", text: "The username did not match; nothing was deleted." });
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      {issued ? <ActivationCodeBox username={account.username} code={issued.code} expiresAt={issued.expiresAt} /> : null}
    </div>
  );
}
