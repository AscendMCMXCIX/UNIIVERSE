"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { PermissionPreset } from "@/server/repositories/permissions";
import type { AuditEntry } from "@/server/audit/log";
import { archivePlayerAction } from "@/server/actions/players";
import { moderatePictureAction, moderateSocialLinkAction, setMemberDisplayNameAction, signOutEverywhereAction } from "@/server/actions/member-admin";
import { personActivityAction } from "@/server/actions/audit";
import { ROLE_LABELS } from "@/domain/roles";
import { DetailModal } from "@/components/ui/detail-modal";
import { Fold } from "@/components/ui/fold";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SiblingSteps } from "@/components/ui/preview-window";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { AuditRow } from "./audit-log";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACCOUNT_STATUS, AccountActions, DeleteProfileButton, accountStatus } from "./account-actions";
import { AccessDialog, accessSummary } from "./access-dialog";
import { ErasePersonButton } from "./erase-person";
import { riotStatus, type PersonEntry } from "./people-panel";

type Result = { ok: true } | { ok: false; error: string };

function Section({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-fg [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** The password's state in words (never the password: a temporary one is shown once, when issued). */
function passwordWords(state: "set" | "temporary" | "expired" | "none", expiresAt: string | null, active = true, manage = false): string {
  if (!active && !manage) return "Deactivated: they cannot sign in.";
  if (!active && state === "none") return "Deactivated, and no password yet: reactivate them with a new temporary password so they can sign in.";
  if (!active) return "Deactivated: they cannot sign in. Reactivate them with the password they had, or, if they were deactivated for security, with a new temporary password.";
  if (state === "set") return "They chose their own password.";
  if (state === "temporary") return `A temporary password waits for their first sign-in${expiresAt ? `, until ${formatDateTime(expiresAt)}` : ""}.${manage ? " Withdraw it if it reached the wrong person." : ""}`;
  if (state === "expired") return `Their temporary password expired${expiresAt ? ` on ${formatDateTime(expiresAt)}` : ""}. Issue a new one.`;
  return "No password yet: issue a temporary one so they can sign in.";
}

/** `since` changes with each refresh of the page's data (after a change made here), so the list reads again. */
function Activity({ userId, playerId, since }: { userId: string | null; playerId: string | null; since: unknown }) {
  const [entries, setEntries] = React.useState<AuditEntry[] | null>(null);
  React.useEffect(() => {
    let live = true;
    void personActivityAction({ userId, playerId }).then((r) => live && setEntries(r.ok ? r.data.entries : []));
    return () => {
      live = false;
    };
  }, [userId, playerId, since]);
  if (!entries) return <p className="text-sm text-fg-subtle">Loading…</p>;
  if (!entries.length) return <p className="text-sm text-fg-muted">Nothing recorded about them yet.</p>;
  return (
    <>
      <ul className="divide-y divide-border" data-testid="person-activity-list">
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} />
        ))}
      </ul>
      {/* The full log, filtered to them: it filters by account (their profile's entries included), so a profile without an account has no link. */}
      {userId ? (
        <Link href={`/admin/audit?person=${encodeURIComponent(userId)}`} className="inline-flex min-h-11 items-center text-sm text-accent hover:underline" data-testid="person-activity-all">
          See all in Audit Logs
        </Link>
      ) : null}
    </>
  );
}

/**
 * The person view (Users & Permissions, the overhaul's S9a): one window, kept in the address
 * (?person=), with everything about one account or profile in order: Account, Password, Access,
 * Riot accounts, Picture and links, Activity and a closed Danger zone. A window on wider screens,
 * the whole screen on phones; ‹ › step through the list without adding history; Back, Escape and
 * the close button close it, and focus returns to the row. The server refuses anything the
 * viewer may not do whatever this shows.
 */
export function PersonView({
  person,
  onClose,
  onStep,
  position,
  presets,
  currentUserId,
  viewerIsOwner,
  canManageAccounts,
  canManageRoster,
  riotConfigured,
}: {
  person: PersonEntry | null;
  onClose: () => void;
  onStep: (dir: -1 | 1) => void;
  position: { at: number; of: number } | null;
  presets: PermissionPreset[];
  currentUserId: string | null;
  viewerIsOwner: boolean;
  canManageAccounts: boolean;
  canManageRoster: boolean;
  riotConfigured: boolean;
}) {
  // Kept while the window closes, so it leaves with its content.
  const [last, setLast] = React.useState<PersonEntry | null>(person);
  if (person && person !== last) setLast(person);
  const p = person ?? last;
  return (
    <DetailModal
      open={!!person}
      onClose={onClose}
      title={p?.name ?? "Person"}
      description={p?.account ? `@${p.account.username}` : p?.player ? "A profile without an account" : undefined}
      testId="person-view"
      closeTestId="person-view-close"
      headerExtra={
        position && position.of > 1 ? (
          // The same ‹ › as every other window's (PreviewWindow): 44px on touch screens at every text size.
          <span className="flex items-center gap-1">
            <SiblingSteps siblings={{ prev: position.at > 0 ? () => onStep(-1) : null, next: position.at < position.of - 1 ? () => onStep(1) : null, label: "person", prevTestId: "person-prev", nextTestId: "person-next" }} />
          </span>
        ) : null
      }
    >
      {p ? <PersonBody key={p.key} p={p} presets={presets} currentUserId={currentUserId} viewerIsOwner={viewerIsOwner} canManageAccounts={canManageAccounts} canManageRoster={canManageRoster} riotConfigured={riotConfigured} onGone={onClose} /> : null}
    </DetailModal>
  );
}

function PersonBody({
  p,
  presets,
  currentUserId,
  viewerIsOwner,
  canManageAccounts,
  canManageRoster,
  riotConfigured,
  onGone,
}: {
  p: PersonEntry;
  presets: PermissionPreset[];
  currentUserId: string | null;
  viewerIsOwner: boolean;
  canManageAccounts: boolean;
  canManageRoster: boolean;
  riotConfigured: boolean;
  /**
   * The person is gone (deleted or erased from the Danger zone): the view closes by its address, as
   * the close button does, so the address no longer names them and one Back leaves the page. A
   * window opened in the view closes alone (DetailModal), so its closing no longer closes the view
   * (R6 review NEW-2).
   */
  onGone: () => void;
}) {
  const router = useRouter();
  const a = p.account;
  const player = p.player;
  const [busy, setBusy] = React.useState(false);
  const [editingAccess, setEditingAccess] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"sign-out" | "remove-picture" | null>(null);
  const [name, setName] = React.useState(a?.displayName ?? p.name);
  const file = React.useRef<HTMLInputElement>(null);

  const self = !!a && a.userId === currentUserId;
  const ownerByOther = a?.role === "owner" && !viewerIsOwner;
  const kept = !!a?.keptAutomatically;
  // What this viewer may change on this account (the server checks it again).
  const manage = canManageAccounts && !!a && !self && !ownerByOther;
  const lockedReason = self ? "Your own access cannot be changed here" : ownerByOther ? "Only the Owner changes the Owner account" : kept ? "Kept automatically" : null;
  const mayErase = !!a && !self && a.role !== "owner" && !kept && (!a.isAdmin || viewerIsOwner);

  const run = async (fn: () => Promise<Result>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setConfirm(null);
    if (r.ok) toast.success(done);
    else toast.error("That did not work", { description: r.error });
    router.refresh();
    return r.ok;
  };

  const replacePicture = async (f: File | undefined) => {
    if (!f || !a) return;
    if (f.size > 400_000) return toast.error("That picture is too large (400 KB at most).");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
    await run(() => moderatePictureAction(a.userId, dataUrl), "Picture replaced.");
  };

  const status = a ? ACCOUNT_STATUS[accountStatus(a)] : null;
  return (
    <div className="space-y-4" data-testid="person-view-body">
      {a ? (
        <Section title="Account" testId="person-account">
          <dl className="divide-y divide-border">
            <Fact label="Display name">{a.displayName || p.name}</Fact>
            <Fact label="Username">@{a.username}</Fact>
            <Fact label="Status">
              {status!.label}
              <span className="block text-xs text-fg-muted">{status!.hint}</span>
            </Fact>
            <Fact label="Created">{formatDate(a.createdAt)}</Fact>
            <Fact label="Last sign-in">{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never"}</Fact>
            {a.role === "owner" ? <Fact label="Role">Owner</Fact> : a.isAdmin ? <Fact label="Role">Administrator</Fact> : null}
          </dl>
          {viewerIsOwner && !self && !kept ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => setMemberDisplayNameAction(a.userId, name), "Display name saved.");
              }}
              data-testid="member-display-name"
            >
              {/* The field keeps 12rem: at a large text size Save name goes under it rather than leave it two letters wide. */}
              <div className="min-w-0 grow basis-48 space-y-1">
                <Label htmlFor={`name-${a.userId}`}>Change their display name</Label>
                <Input id={`name-${a.userId}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={40} />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={busy || name.trim() === (a.displayName || p.name)}>
                Save name
              </Button>
            </form>
          ) : null}
          {manage && !kept ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("sign-out")} data-testid="sign-out-everywhere">
                Sign out everywhere
              </Button>
            </div>
          ) : null}
          <ConfirmDialog
            open={confirm === "sign-out"}
            busy={busy}
            title={`Sign ${a.username} out everywhere?`}
            description="Every device they are signed in on is signed out at once. Their password stays the same."
            confirmLabel="Sign out everywhere"
            onCancel={() => setConfirm(null)}
            onConfirm={() => void run(() => signOutEverywhereAction(a.userId), "Signed out everywhere.")}
          />
        </Section>
      ) : null}

      {a && !kept ? (
        <Section title="Password" testId="person-password">
          <p className="text-sm text-fg-muted">{passwordWords(a.password.state, a.password.expiresAt, a.isActive, manage)}</p>
          {manage ? <AccountActions account={a} currentUserId={currentUserId} viewerIsOwner={viewerIsOwner} only="password" /> : null}
          {self ? <p className="text-xs text-fg-subtle">Change your own password in Settings.</p> : null}
        </Section>
      ) : null}

      {a && canManageAccounts ? (
        <Section title="Access" testId="person-access">
          <p className="flex items-center gap-1.5 text-sm text-fg-muted" data-testid="access-summary">
            <ShieldCheck className="h-4 w-4 text-fg-subtle" aria-hidden /> {kept ? "Default access, locked" : accessSummary(a, presets)}
          </p>
          {!kept ? (
            <Button size="sm" variant="outline" onClick={() => setEditingAccess(true)} disabled={!!lockedReason} aria-describedby={lockedReason ? `locked-${a.userId}` : undefined} data-testid="open-access">
              <ShieldCheck className="h-4 w-4" /> Manage access
            </Button>
          ) : null}
          {lockedReason && !kept ? <p id={`locked-${a.userId}`} className="text-xs text-fg-subtle" data-testid="access-locked-reason">{lockedReason}.</p> : null}
          {editingAccess ? <AccessDialog account={a} presets={presets} lineupRole={player?.lineupRole ?? null} onClose={() => setEditingAccess(false)} /> : null}
        </Section>
      ) : null}

      {player ? (
        <Section title="Riot accounts" testId="person-riot">
          <p className="text-sm text-fg-muted">
            {riotStatus(player.riot.state).label}: {player.riot.label}.{player.primaryRole ? ` Plays ${ROLE_LABELS[player.primaryRole]}${player.secondaryRole ? ` and ${ROLE_LABELS[player.secondaryRole]}` : ""}.` : " Role not chosen yet."}
            {player.lineupRole ? ` In the lineup at ${ROLE_LABELS[player.lineupRole]}.` : ""}
          </p>
          {player.riotAccounts.length ? (
            <RiotAccountsPanel playerId={player.id} accounts={player.riotAccounts} riotConfigured={riotConfigured} editable={canManageAccounts && !ownerByOther} title="Linked Riot accounts" theirs={!self} />
          ) : (
            <p className="text-sm text-fg-muted">No Riot account linked.</p>
          )}
          {player.primaryRole && player.teamMember ? (
            <Link href={`/players/${player.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">
              Open their profile in Player Mode
            </Link>
          ) : null}
        </Section>
      ) : null}

      {a && !kept ? (
        <Section title="Picture and links" testId="person-picture">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={p.name} src={a.avatarUrl} size="lg" />
            {manage ? (
              <span className="flex flex-wrap gap-2">
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void replacePicture(e.target.files?.[0]).finally(() => e.target.value && (e.target.value = ""))} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
                  Replace picture
                </Button>
                {a.avatarUrl ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm("remove-picture")}>
                    Remove picture
                  </Button>
                ) : null}
              </span>
            ) : null}
          </div>
          {player?.publicLinks.length ? (
            <ul className="divide-y divide-border" data-testid="person-links">
              {player.publicLinks.map((l) => (
                <li key={l.kind} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="font-medium text-fg">{l.label}</span> <span className="text-fg-muted">{l.text}</span>
                  </span>
                  {manage ? (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => moderateSocialLinkAction(player.id, l.kind, "hide"), `${l.label} hidden; it stays theirs in Settings.`)}>
                        Hide
                      </Button>
                      <Button size="sm" variant="ghost" className="text-bad" disabled={busy} onClick={() => void run(() => moderateSocialLinkAction(player.id, l.kind, "remove"), `${l.label} removed.`)}>
                        Remove
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">No public links.</p>
          )}
          <ConfirmDialog
            open={confirm === "remove-picture"}
            busy={busy}
            title={`Remove ${p.name}'s picture?`}
            description="Their initials show instead. They can choose a new picture in Settings."
            confirmLabel="Remove picture"
            onCancel={() => setConfirm(null)}
            onConfirm={() => void run(() => moderatePictureAction(a.userId, null), "Picture removed.")}
          />
        </Section>
      ) : null}

      {canManageAccounts ? (
        <Section title="Activity" testId="person-activity">
          <Activity userId={a?.userId ?? null} playerId={player?.id ?? null} since={a ?? player} />
        </Section>
      ) : null}

      {(canManageAccounts && (manage || !a)) || (canManageRoster && player && !a) ? (
        <Fold title="Danger zone" description="Deactivate, delete or erase. Anything permanent asks for the name typed first." testId="person-danger">
          <div className="flex flex-wrap items-center gap-2">
            {a && manage ? <AccountActions account={a} currentUserId={currentUserId} viewerIsOwner={viewerIsOwner} only="danger" onDeleted={onGone} /> : null}
            {canManageAccounts && player && !a ? <DeleteProfileButton playerId={player.id} name={player.displayName} onDeleted={onGone} /> : null}
            {canManageAccounts && (mayErase || (player && !a)) ? <ErasePersonButton target={a ? { userId: a.userId } : { playerId: player!.id }} name={a?.username ?? player!.displayName} onErased={onGone} /> : null}
            {canManageRoster && player && !a ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => archivePlayerAction(player.id, !player.archived), player.archived ? "Profile restored." : "Profile archived.")}>
                {player.archived ? "Restore profile" : "Archive profile"}
              </Button>
            ) : null}
          </div>
        </Fold>
      ) : null}
    </div>
  );
}
