"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { platformLabel } from "@/domain/platforms";
import { describeAccountSync } from "@/domain/account-status";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import { addPlayerAccountAction, changeRiotIdAction, removePlayerAccountAction, syncPlayerAccountAction } from "@/server/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";

export { PLATFORMS } from "@/domain/platforms";

/**
 * Linked Riot accounts: a simple list with a status per account, Add, Change Riot ID and Remove.
 * Accounts are stored by their permanent Riot identity (PUUID): a rename made in Riot is picked up
 * automatically, and typing a new Riot ID either renames the same account or, after confirmation,
 * replaces it with a different one. No account types or roles: the role lives on the profile.
 */
export function RiotAccountsPanel({ playerId, accounts, riotConfigured, editable = true, title = "Linked Riot accounts" }: { playerId: string; accounts: RiotAccountRecord[]; riotConfigured: boolean; defaultPlatform?: string; editable?: boolean; title?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<RiotAccountRecord | null>(null);
  const [removing, setRemoving] = React.useState<RiotAccountRecord | null>(null);
  const [menu, setMenu] = React.useState<string | null>(null);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!riotId.includes("#")) return setAddError("Enter the Riot ID exactly as shown in the client: GameName#TAG.");
    setBusy("add");
    setAddError(null);
    const r = await addPlayerAccountAction(playerId, { riotId });
    setBusy(null);
    if (!r.ok) return setAddError(r.error);
    setRiotId("");
    setAdding(false);
    const a = r.data;
    if (a.puuid && a.syncStatus === "ok") toast.success(`${a.riotId} linked and synced.`, { description: platformLabel(a.platform) });
    else if (a.syncStatus === "failed" || a.syncStatus === "unresolved") toast.error(a.syncError ?? "Riot could not verify that account.");
    else toast.info(`${a.riotId} saved.`, { description: riotConfigured ? (a.syncError ?? "Verification with Riot is pending and retried automatically.") : "It will be verified once Riot data is available." });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title={title} subtitle="Every linked account adds its games and mastery to your statistics. The same account is never counted twice." />
      <PanelBody className="space-y-3">
        {accounts.length === 0 ? <p className="text-sm text-fg-muted">No Riot account linked yet{editable ? ". Add one so your statistics can be measured." : "."}</p> : null}
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" data-testid="riot-accounts">
          {accounts.map((a) => {
            const sync = describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured });
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-bg-elevated px-3 py-2.5" data-testid="riot-account-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{a.riotId}</span>
                    <Badge tone={sync.tone} title={sync.detail}>
                      {sync.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-fg-subtle">
                    {a.puuid || a.platformSource === "riot" ? platformLabel(a.platform) : "Server confirmed on first sync"}
                    {a.tier ? ` · ${a.tier[0]}${a.tier.slice(1).toLowerCase()} ${a.division ?? ""}` : ""} · {sync.lastUpdatedAt ? `updated ${timeAgo(sync.lastUpdatedAt)}` : "not updated yet"}
                  </div>
                  {sync.state !== "synced" ? <p className="mt-1 text-xs text-fg-muted">{sync.detail}</p> : null}
                </div>
                {editable ? (
                  <div className="relative flex items-center gap-1">
                    {sync.state !== "synced" && riotConfigured ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={async () => {
                          setBusy(a.id);
                          const r = await syncPlayerAccountAction(playerId, a.id);
                          setBusy(null);
                          if (!r.ok) toast.error(r.error);
                          else if (r.data.error) (r.data.status === "pending" ? toast.warning : toast.error)(r.data.error);
                          else toast.success(`${a.riotId} is up to date.`);
                          router.refresh();
                        }}
                      >
                        <RefreshCw className={busy === a.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Retry
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" aria-label={`Options for ${a.riotId}`} aria-expanded={menu === a.id} onClick={() => setMenu(menu === a.id ? null : a.id)}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    {menu === a.id ? (
                      <div className="rise-in absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-border-strong bg-bg-elevated shadow-xl" role="menu" onMouseLeave={() => setMenu(null)}>
                        <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => { setMenu(null); setRenaming(a); }}>
                          <Pencil className="h-4 w-4" /> Change Riot ID
                        </button>
                        {riotConfigured ? (
                          <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={async () => { setMenu(null); setBusy(a.id); const r = await syncPlayerAccountAction(playerId, a.id); setBusy(null); if (!r.ok) toast.error(r.error); else if (r.data.error) toast.warning(r.data.error); else toast.success(`${a.riotId} is up to date.`); router.refresh(); }}>
                            <RefreshCw className="h-4 w-4" /> Sync now
                          </button>
                        ) : null}
                        <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-bad hover:bg-bad/10" onClick={() => { setMenu(null); setRemoving(a); }}>
                          <Trash2 className="h-4 w-4" /> Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable ? (
          adding || accounts.length === 0 ? (
            <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`riot-id-${playerId}`}>Add a Riot ID</Label>
                <Input id={`riot-id-${playerId}`} value={riotId} onChange={(e) => { setRiotId(e.target.value); setAddError(null); }} placeholder="GameName#TAG" spellCheck={false} autoComplete="off" autoFocus={accounts.length > 0} aria-invalid={!!addError} aria-describedby={`riot-id-help-${playerId}`} />
                <p id={`riot-id-help-${playerId}`} className={addError ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-xs text-fg-subtle"}>
                  {addError ?? "Copy it from the League client, including the #TAG. Riot confirms the server."}
                </p>
              </div>
              <div className="flex gap-2 sm:mt-5">
                <Button type="submit" variant="primary" disabled={busy !== null || !riotId.includes("#")} className="flex-1 sm:flex-none">
                  {busy === "add" ? "Linking…" : "Link account"}
                </Button>
                {accounts.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setAdding(false); setRiotId(""); setAddError(null); }}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add Riot account
            </Button>
          )
        ) : null}
        {!riotConfigured ? <p className="text-xs text-fg-subtle">Riot data is not available on the server yet; accounts are saved now and verified automatically once it is.</p> : null}
      </PanelBody>
      {renaming ? <ChangeRiotIdDialog playerId={playerId} account={renaming} onClose={() => setRenaming(null)} /> : null}
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.riotId ?? ""}?`}
        description="Its games and mastery leave your statistics. You can link it again later."
        confirmLabel="Remove account"
        busy={busy !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(removing.id);
          const r = await removePlayerAccountAction(playerId, removing.id);
          setBusy(null);
          setRemoving(null);
          if (!r.ok) return toast.error(r.error);
          toast.success("Riot account removed.");
          router.refresh();
        }}
      />
    </Panel>
  );
}

/** Change Riot ID: Riot decides whether it is the same account (rename) or a different one (confirm replacement). */
function ChangeRiotIdDialog({ playerId, account, onClose }: { playerId: string; account: RiotAccountRecord; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = React.useState(account.riotId);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    const r = await changeRiotIdAction(playerId, account.id, value, { confirmReplace: replace });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.data.kind === "different-account") return setConfirmReplace(r.data.riotId);
    toast.success(r.data.kind === "renamed" ? `Updated to ${r.data.riotId}. All games and statistics are kept.` : `${account.riotId} was replaced by ${r.data.riotId}.`);
    onClose();
    router.refresh();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Change Riot ID"
      description={confirmReplace ? undefined : "Renamed your account in Riot? Type the new Riot ID; your games and statistics stay. (UNIIVERSE also picks renames up by itself within a day.)"}
      footer={
        confirmReplace ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmReplace(null)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" onClick={() => submit(true)} disabled={busy} data-testid="confirm-replace-riot">
              {busy ? "Replacing…" : "Replace account"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => submit(false)} disabled={busy || !value.includes("#") || value.trim() === account.riotId} data-testid="save-riot-id">
              {busy ? "Checking with Riot…" : "Save"}
            </Button>
          </>
        )
      }
    >
      {confirmReplace ? (
        <p className="text-sm text-fg-muted">
          <strong className="text-fg">{confirmReplace}</strong> is a different Riot account from {account.riotId}. Replacing removes {account.riotId}&apos;s games and mastery from your statistics and starts collecting {confirmReplace}&apos;s. To keep both, cancel and use <em>Add Riot account</em> instead.
        </p>
      ) : (
        <div>
          <Label htmlFor="change-riot-id">New Riot ID</Label>
          <Input id="change-riot-id" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} spellCheck={false} autoComplete="off" autoFocus aria-invalid={!!error} aria-describedby="change-riot-id-help" />
          <p id="change-riot-id-help" className={error ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-xs text-fg-subtle"}>
            {error ?? "GameName#TAG exactly as shown in the League client."}
          </p>
        </div>
      )}
    </Dialog>
  );
}
