"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import type { AccountView } from "@/server/auth/account-admin";
import { deleteAccountAction, deleteProfileAction, resetPasswordAction, setAccountActiveAction } from "@/server/actions/users";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Account state in one badge: what an admin needs to know at a glance. */
export function AccountStatusBadge({ account }: { account: AccountView }) {
  if (!account.isActive) return <Badge tone="bad">Deactivated</Badge>;
  if (!account.setupComplete && account.playerId) return <Badge tone="accent">Setup pending</Badge>;
  return <Badge tone="good">Active</Badge>;
}

const PASSWORD_TEXT: Record<AccountView["password"]["state"], { label: string; tone: BadgeTone }> = {
  set: { label: "password set", tone: "neutral" },
  temporary: { label: "temporary password: must change at sign-in", tone: "info" },
  expired: { label: "temporary password expired", tone: "warn" },
  none: { label: "no password: reset to give them one", tone: "warn" },
};

export function PasswordStateBadge({ account }: { account: AccountView }) {
  const c = PASSWORD_TEXT[account.password.state];
  const until = account.password.state === "temporary" && account.password.expiresAt ? ` · until ${new Date(account.password.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";
  return (
    <Badge tone={c.tone}>
      {c.label}
      {until}
    </Badge>
  );
}

/** The temporary password, shown once, with copy and plain instructions for the player. */
export function TemporaryPasswordBox({ username, password, expiresAt }: { username: string; password: string; expiresAt: string }) {
  const [copied, setCopied] = React.useState(false);
  const site = typeof window === "undefined" ? "" : window.location.origin;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`UNIIVERSE: ${site}\nUsername: ${username}\nTemporary password: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the password is visible; copy it by hand */
    }
  };
  return (
    <div className="space-y-1.5 rounded-md border border-good/40 bg-good/10 p-3 text-sm" data-testid="temporary-password">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">Temporary password for {username}:</span>
        <code className="rounded bg-bg-elevated px-2 py-1 font-mono text-base font-semibold tracking-wide text-fg" data-testid="temporary-password-value">
          {password}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy details"}
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        Give the player the website address, their username and this password privately. At their first sign-in they choose their own password; this one then stops working. It expires {new Date(expiresAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} and is shown only now: reset again if it is lost.
      </p>
    </div>
  );
}

/** A message shown right where the admin clicked (not at the top of a long page). */
function RowMessage({ message }: { message: { tone: "good" | "bad"; text: string } | null }) {
  if (!message) return null;
  return (
    <p className={`text-xs ${message.tone === "good" ? "text-good" : "text-bad"}`} role="status">
      {message.text}
    </p>
  );
}

/**
 * Inline confirmation: no browser pop-ups (some browsers and in-app views block them silently).
 * The first click opens a small panel; nothing happens until a choice there is clicked.
 */
function ConfirmPanel({ text, choices, onCancel, busy }: { text: string; choices: Array<{ label: string; danger?: boolean; onClick: () => void }>; onCancel: () => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-md border border-bad/40 bg-bad/5 p-2.5 text-xs text-fg" role="alertdialog">
      <p>{text}</p>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <Button key={c.label} size="sm" variant={c.danger ? "danger" : "outline"} disabled={busy} onClick={c.onClick}>
            {c.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Delete for a player profile that has no account (test entries, old placeholders, leftovers of deleted accounts). */
export function DeleteProfileButton({ playerId, name }: { playerId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  return (
    <div className="space-y-1.5">
      {!open ? (
        <Button size="sm" variant="ghost" className="text-bad" onClick={() => setOpen(true)}>
          Delete profile
        </Button>
      ) : (
        <ConfirmPanel
          busy={busy}
          text={`Permanently delete ${name}? Their champion pools, linked Riot accounts and statistics are removed. Past drafts and matches keep their own record of the lineup.`}
          onCancel={() => setOpen(false)}
          choices={[
            {
              label: "Delete permanently",
              danger: true,
              onClick: async () => {
                setBusy(true);
                const r = await deleteProfileAction(playerId);
                setBusy(false);
                setOpen(false);
                setMessage(r.ok ? { tone: "good", text: `${name} deleted.` } : { tone: "bad", text: r.error });
                router.refresh();
              },
            },
          ]}
        />
      )}
      <RowMessage message={message} />
    </div>
  );
}

/**
 * Reset password · Deactivate / Reactivate · Delete, the same on both admin pages. Destructive
 * actions ask for confirmation inline; the server enforces the rules (never yourself, never the
 * last admin). Results appear on the row itself.
 */
export function AccountActions({ account, currentUserId, onMessage }: { account: AccountView; currentUserId: string | null; onMessage?: (m: { tone: "good" | "bad"; text: string }) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<{ temporaryPassword: string; expiresAt: string } | null>(null);
  const [confirming, setConfirming] = React.useState<"reset" | "deactivate" | "delete" | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const self = account.userId === currentUserId;
  const run = async <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string): Promise<T | null> => {
    setBusy(true);
    setMessage(null);
    const r = await fn();
    setBusy(false);
    setConfirming(null);
    const m = r.ok ? (done ? { tone: "good" as const, text: done } : null) : { tone: "bad" as const, text: r.error };
    setMessage(m);
    if (m) onMessage?.(m);
    router.refresh();
    return r.ok ? r.data : null;
  };
  return (
    <div className="space-y-2" data-testid="account-actions">
      <div className="flex flex-wrap items-center gap-1.5">
        {!self && account.isActive ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => (account.password.state === "none" ? void run(() => resetPasswordAction(account.userId), "").then((d) => setIssued(d)) : setConfirming("reset"))}>
            {account.password.state === "none" ? "Create temporary password" : "Reset password"}
          </Button>
        ) : null}
        {!self ? (
          account.isActive ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming("deactivate")}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setAccountActiveAction(account.userId, true), `${account.username} reactivated; their password works again.`)}>
              Reactivate
            </Button>
          )
        ) : null}
        {!self ? (
          <Button size="sm" variant="ghost" className="text-bad" disabled={busy} onClick={() => setConfirming("delete")}>
            Delete
          </Button>
        ) : null}
      </div>
      {confirming === "reset" ? (
        <ConfirmPanel
          busy={busy}
          text={`Give ${account.username} a new temporary password? Their current password stops working at once and they are signed out everywhere. They choose a new password at their next sign-in.`}
          onCancel={() => setConfirming(null)}
          choices={[{ label: "Reset password", danger: true, onClick: () => void run(() => resetPasswordAction(account.userId), "").then((d) => setIssued(d)) }]}
        />
      ) : null}
      {confirming === "deactivate" ? (
        <ConfirmPanel
          busy={busy}
          text={`Deactivate ${account.username}? They are signed out everywhere and cannot sign in until reactivated. Nothing is deleted.`}
          onCancel={() => setConfirming(null)}
          choices={[{ label: "Deactivate", danger: true, onClick: () => void run(() => setAccountActiveAction(account.userId, false), `${account.username} deactivated.`) }]}
        />
      ) : null}
      {confirming === "delete" ? (
        <ConfirmPanel
          busy={busy}
          text={`Delete the account ${account.username}? This cannot be undone. Choose whether to keep their player profile (archived, so match history and statistics stay) or erase everything (for test or mistaken entries).`}
          onCancel={() => setConfirming(null)}
          choices={[
            { label: "Delete account, keep profile archived", onClick: () => void run(() => deleteAccountAction(account.userId), `${account.username} deleted; their profile is archived (Show archived to see it).`) },
            { label: "Delete account and profile", danger: true, onClick: () => void run(() => deleteAccountAction(account.userId, { eraseProfile: true }), `${account.username} and their profile deleted.`) },
          ]}
        />
      ) : null}
      <RowMessage message={message} />
      {issued ? <TemporaryPasswordBox username={account.username} password={issued.temporaryPassword} expiresAt={issued.expiresAt} /> : null}
    </div>
  );
}
