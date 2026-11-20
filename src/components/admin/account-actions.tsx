"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import type { AccountView } from "@/server/auth/account-admin";
import { deleteAccountAction, deleteProfileAction, resetPasswordAction, setAccountActiveAction } from "@/server/actions/users";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useBrandNames } from "@/components/brand-names";
import { formatDateTime, formatDayMonth } from "@/lib/format";
import { typedMatches } from "@/domain/typed-confirmation";

/** An account's state in one word an admin acts on. */
export type AccountStatus = "active" | "awaiting-login" | "setup" | "deactivated";

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: BadgeTone; hint: string }> = {
  active: { label: "Active", tone: "good", hint: "Signed in and set up." },
  "awaiting-login": { label: "Awaiting first login", tone: "info", hint: "Created, but they have not signed in with their temporary password yet." },
  setup: { label: "Setup incomplete", tone: "warn", hint: "Signed in, but has not finished choosing their password, roles and champions." },
  deactivated: { label: "Deactivated", tone: "bad", hint: "Cannot sign in until reactivated. Nothing of theirs was removed." },
};

export function accountStatus(account: Pick<AccountView, "isActive" | "setupComplete" | "playerId" | "lastLoginAt" | "password">): AccountStatus {
  if (!account.isActive) return "deactivated";
  if (!account.lastLoginAt && account.password.state !== "set") return "awaiting-login";
  if (!account.setupComplete && account.playerId) return "setup";
  return "active";
}

/** Account state in one badge: what an admin needs to know at a glance. */
export function AccountStatusBadge({ account }: { account: AccountView }) {
  const s = ACCOUNT_STATUS[accountStatus(account)];
  return (
    <Badge tone={s.tone} title={s.hint}>
      {s.label}
    </Badge>
  );
}

const PASSWORD_TEXT: Record<Exclude<AccountView["password"]["state"], "set">, { label: string; tone: BadgeTone; hint: string }> = {
  temporary: { label: "Temporary password", tone: "info", hint: "They choose their own password at their next sign-in." },
  expired: { label: "Temporary password expired", tone: "warn", hint: "Reset the password to give them a new one." },
  none: { label: "No password yet", tone: "warn", hint: "Create a temporary password so they can sign in." },
};

/** The password state, only when it needs attention (a permanent password shows nothing). */
export function PasswordStateBadge({ account }: { account: AccountView }) {
  if (account.password.state === "set") return null;
  const c = PASSWORD_TEXT[account.password.state];
  const until = account.password.state === "temporary" && account.password.expiresAt ? ` · until ${formatDayMonth(account.password.expiresAt)}` : "";
  return (
    <Badge tone={c.tone} title={c.hint}>
      {c.label}
      {until}
    </Badge>
  );
}

/** The temporary password, shown once, with copy and plain instructions for the player. */
export function TemporaryPasswordBox({ username, password, expiresAt }: { username: string; password: string; expiresAt: string }) {
  const [copy, setCopy] = React.useState<"idle" | "copied" | "failed">("idle");
  const { productName } = useBrandNames();
  const text = () => `${productName}: ${window.location.origin}\nUsername: ${username}\nTemporary password: ${password}`;
  // Copies exactly the details shown in this box. If the browser refuses (no permission, page not
  // focused), it says so: the clipboard would otherwise still hold whatever was copied before.
  const onCopy = async () => {
    const value = text();
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
    }
    setCopy(ok ? "copied" : "failed");
    if (ok) setTimeout(() => setCopy("idle"), 1500);
  };
  return (
    <div className="space-y-2 rounded-lg border border-good/40 bg-good/10 p-3 text-sm" data-testid="temporary-password">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">Temporary password for {username}:</span>
        <code className="rounded bg-bg-elevated px-2 py-1 font-mono text-base font-semibold tracking-wide text-fg" data-testid="temporary-password-value">
          {password}
        </code>
        <Button size="sm" variant="outline" onClick={onCopy} data-testid="copy-details">
          {copy === "copied" ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />} {copy === "copied" ? `Copied ${username}'s details` : "Copy details"}
        </Button>
      </div>
      {copy === "failed" ? (
        <p className="text-sm text-bad" role="alert">
          Could not copy automatically. Select the username and password above and copy them by hand.
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">
        Give the player the website address, their username and this password privately. At their first sign-in they choose their own password; this one then stops working. It expires {formatDateTime(expiresAt)} and is shown only now: reset again if it is lost.
      </p>
    </div>
  );
}

/** "Type X to …": the field of a typed confirmation (src/domain/typed-confirmation.ts), its words above it. */
function TypedName({ expected, action, value, onChange, testId }: { expected: string; action: string; value: string; onChange: (v: string) => void; testId: string }) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        Type <span className="font-semibold text-fg [overflow-wrap:anywhere]">{expected}</span> {action}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} data-testid={testId} />
    </div>
  );
}

/** Delete for a player profile that has no account (test entries, old placeholders, leftovers of deleted accounts): its name typed first. */
export function DeleteProfileButton({ playerId, name, onDeleted }: { playerId: string; name: string; /** Once it is deleted (the person view closes by its address). */ onDeleted?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped("");
  };
  const remove = async () => {
    setBusy(true);
    const r = await deleteProfileAction(playerId, typed);
    setBusy(false);
    if (!r.ok) return toast.error("Could not delete the profile", { description: r.error });
    setOpen(false);
    setTyped("");
    toast.success(`${name} deleted.`);
    router.refresh();
    onDeleted?.();
  };
  return (
    <>
      <Button size="sm" variant="ghost" className="text-bad" wrap onClick={() => setOpen(true)} data-testid="delete-profile">
        Delete profile
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Delete ${name}?`}
        description="Their champion pools, linked Riot accounts and statistics are removed for good."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy || !typedMatches(typed, name)} data-testid="delete-profile-confirm">
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        <TypedName expected={name} action="to delete it" value={typed} onChange={setTyped} testId="delete-confirm-input" />
      </Dialog>
    </>
  );
}

/**
 * Reset password · Deactivate / Reactivate · Delete, the same on both admin pages. Sensitive
 * actions confirm in a dialog; the server enforces the rules (never yourself, never the last
 * admin). Results arrive as notifications; a new temporary password opens in its own dialog.
 * The Production check's account (keptAutomatically) offers Deactivate / Reactivate and Delete only:
 * its job keeps its password, and the server refuses a reset.
 */
export function AccountActions({ account, currentUserId, viewerIsOwner = false, only, onDeleted }: { account: AccountView; currentUserId: string | null; viewerIsOwner?: boolean; /** The person view's sections: the password's button, or the Danger zone's. */ only?: "password" | "danger"; /** Once the account is deleted (the person view closes by its address). */ onDeleted?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<{ temporaryPassword: string; expiresAt: string } | null>(null);
  const [confirming, setConfirming] = React.useState<"reset" | "deactivate" | "delete" | null>(null);
  const [typed, setTyped] = React.useState("");
  const self = account.userId === currentUserId;
  const run = async <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string | null, deletes = false): Promise<T | null> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error("That did not work", { description: r.error });
      return null;
    }
    setConfirming(null);
    setTyped("");
    if (done) toast.success(done);
    router.refresh();
    if (deletes) onDeleted?.();
    return r.data;
  };
  const closeDelete = () => {
    if (busy) return;
    setConfirming(null);
    setTyped("");
  };
  const resetPassword = () => void run(() => resetPasswordAction(account.userId), null).then((d) => d && setIssued(d));
  if (self) return null;
  // Only the Owner changes the Owner account; the server refuses anyone else too.
  if (account.role === "owner" && !viewerIsOwner) return <span className="text-xs text-fg-subtle">Managed by the Owner</span>;
  const withProfile = !!account.playerId;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="account-actions">
      {account.isActive && !account.keptAutomatically && only !== "danger" ? (
        <Button size="sm" variant="outline" wrap disabled={busy} onClick={() => (account.password.state === "none" ? resetPassword() : setConfirming("reset"))}>
          {account.password.state === "none" ? "Create temporary password" : "Reset password"}
        </Button>
      ) : null}
      {only === "password" ? null : account.isActive ? (
        <Button size="sm" variant="ghost" wrap disabled={busy} onClick={() => setConfirming("deactivate")}>
          Deactivate
        </Button>
      ) : (
        <Button size="sm" variant="ghost" wrap disabled={busy} onClick={() => void run(() => setAccountActiveAction(account.userId, true), `${account.username} reactivated; their password works again.`)}>
          Reactivate
        </Button>
      )}
      {only === "password" ? null : (
        <Button size="sm" variant="ghost" className="text-bad" wrap disabled={busy} onClick={() => setConfirming("delete")} data-testid="delete-account">
          Delete
        </Button>
      )}

      <ConfirmDialog
        open={confirming === "reset"}
        busy={busy}
        title={`Reset ${account.username}'s password?`}
        description="Their current password stops working at once and they are signed out everywhere. You get a temporary password to give them; they choose a new one at their next sign-in."
        confirmLabel="Reset password"
        onCancel={() => setConfirming(null)}
        onConfirm={resetPassword}
      />
      <ConfirmDialog
        open={confirming === "deactivate"}
        busy={busy}
        title={`Deactivate ${account.username}?`}
        description="They are signed out everywhere and cannot sign in until reactivated. Nothing is deleted."
        confirmLabel="Deactivate"
        onCancel={() => setConfirming(null)}
        onConfirm={() => void run(() => setAccountActiveAction(account.userId, false), `${account.username} deactivated.`)}
      />
      {withProfile ? (
        <Dialog
          open={confirming === "delete"}
          onClose={closeDelete}
          title={`Delete ${account.username}?`}
          description="This cannot be undone. Keep their player profile (archived, so match history and statistics stay), or delete it with their champion pools, Riot accounts and statistics (for test or mistaken entries). Neither removes them from shared games, records or logs: for that, use Erase personal data."
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={closeDelete}>
                Cancel
              </Button>
              {/* The two deletes stay together on one row; on a phone they wrap as a pair. */}
              <span className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void run(() => deleteAccountAction(account.userId), `${account.username} deleted; their profile is archived.`, true)} data-testid="delete-keep-profile">
                  Delete, keep profile
                </Button>
                <Button variant="danger" disabled={busy || !typedMatches(typed, account.username)} onClick={() => void run(() => deleteAccountAction(account.userId, { eraseProfile: true, confirmation: typed }), `${account.username} and their profile deleted.`, true)} data-testid="delete-with-profile">
                  Delete with profile
                </Button>
              </span>
            </>
          }
        >
          <TypedName expected={account.username} action="to delete the profile too" value={typed} onChange={setTyped} testId="delete-confirm-input" />
        </Dialog>
      ) : (
        <ConfirmDialog
          open={confirming === "delete"}
          busy={busy}
          title={`Delete ${account.username}?`}
          description={account.keptAutomatically ? "It has no player profile. The Production check makes it again at its next run; to turn the signed-in checks off, deactivate it instead." : "It has no player profile; only the account goes. This cannot be undone."}
          confirmLabel="Delete account"
          onCancel={closeDelete}
          onConfirm={() => void run(() => deleteAccountAction(account.userId), `${account.username} deleted.`, true)}
        />
      )}
      <Dialog open={issued !== null} onClose={() => setIssued(null)} title="Temporary password" description="Shown only once." footer={<Button variant="primary" onClick={() => setIssued(null)}>Done</Button>}>
        {issued ? <TemporaryPasswordBox username={account.username} password={issued.temporaryPassword} expiresAt={issued.expiresAt} /> : null}
      </Dialog>
    </div>
  );
}
