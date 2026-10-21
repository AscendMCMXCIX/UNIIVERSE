"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, MoreHorizontal, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { platformLabel } from "@/domain/platforms";
import { opggProfileUrl } from "@/domain/opgg";
import { canRetrySync, describeAccountSync, syncRefreshInterval } from "@/domain/account-status";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import { addPlayerAccountAction, changeRiotIdAction, removePlayerAccountAction, reorderAccountsAction, setMainAccountAction, syncPlayerAccountAction } from "@/server/actions/accounts";
import { moveAccount, orderAccounts } from "@/domain/account-order";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { RelativeTime } from "@/components/ui/relative-time";

export { PLATFORMS } from "@/domain/platforms";

/**
 * Linked Riot accounts, one card each: Riot ID, Main or Alt, sync state, last update and actions
 * (make Main, change Riot ID, sync, remove). Exactly one account is the Main (shown on the profile
 * and used for rank); every account, Main or Alt, counts in the statistics. Accounts are stored by
 * their permanent Riot identity (PUUID): a rename made in Riot is picked up automatically, and
 * typing a new Riot ID either renames the same account or, after confirmation, replaces it.
 * The ⋯ menu floats above the page (a portal), so it is never clipped by the card it belongs to.
 * Alternatives are numbered and can be moved up or down (buttons, so keyboard and touch work the
 * same); that one order is used wherever the accounts are listed. Ordering changes no statistic.
 */
export function RiotAccountsPanel({ playerId, accounts, riotConfigured, editable = true, title = "Linked Riot accounts" }: { playerId: string; accounts: RiotAccountRecord[]; riotConfigured: boolean; defaultPlatform?: string; editable?: boolean; title?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<RiotAccountRecord | null>(null);
  const [removing, setRemoving] = React.useState<RiotAccountRecord | null>(null);
  // The order shown: the server's, or the one just chosen while it is being saved.
  const serverOrder = orderAccounts(accounts);
  const serverKey = serverOrder.map((a) => a.id).join(",");
  const [localOrder, setLocalOrder] = React.useState<{ key: string; ids: string[] } | null>(null);
  const ordered = localOrder && localOrder.key === serverKey ? localOrder.ids.map((id) => accounts.find((a) => a.id === id)!).filter(Boolean) : serverOrder;
  const [announce, setAnnounce] = React.useState("");
  const moveRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const move = async (a: RiotAccountRecord, by: -1 | 1) => {
    const ids = moveAccount(ordered, a.id, by);
    if (ids.join(",") === ordered.map((x) => x.id).join(",")) return;
    setLocalOrder({ key: serverKey, ids });
    const position = ids.indexOf(a.id);
    const altIds = ids.filter((id) => accounts.find((x) => x.id === id)?.label === "alt");
    setAnnounce(`${a.riotId} moved to alternative ${altIds.indexOf(a.id) + 1} of ${altIds.length}.`);
    // Keep focus on the control that was used (or its pair once the account reaches an end).
    requestAnimationFrame(() => {
      const atEnd = by === -1 ? position <= 1 : position >= ids.length - 1;
      moveRefs.current.get(`${a.id}:${atEnd ? -by : by}`)?.focus();
    });
    const r = await reorderAccountsAction(playerId, ids);
    if (!r.ok) {
      setLocalOrder(null);
      return toast.error(r.error);
    }
    router.refresh();
  };
  const alternatives = ordered.filter((a) => a.label === "alt").length;

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

  // While an account is still being verified or catching up on history, the list updates itself.
  const refreshEvery = riotConfigured ? syncRefreshInterval(accounts.map((a) => describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, history: a.historyBackfill, riotConfigured }).state)) : null;

  return (
    <Panel>
      <AutoRefresh active={refreshEvery !== null} intervalMs={refreshEvery ?? undefined} />
      <PanelHeader title={title} subtitle="The Main account is shown on the profile and used for rank; your alternatives follow in the order you set, wherever accounts are listed. Every linked account adds its games and mastery to the statistics; a game played on two accounts counts once." />
      <PanelBody className="space-y-3">
        <p className="sr-only" aria-live="polite" data-testid="riot-accounts-announce">
          {announce}
        </p>
        {accounts.length === 0 ? <p className="text-sm text-fg-muted">No Riot account linked yet{editable ? ". Add one so your statistics can be measured." : "."}</p> : null}
        <ul className="grid gap-2.5 md:grid-cols-2" data-testid="riot-accounts">
          {ordered.map((a, index) => {
            const sync = describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured });
            const main = a.label === "main";
            const syncNow = async () => {
              setBusy(a.id);
              const r = await syncPlayerAccountAction(playerId, a.id);
              setBusy(null);
              if (!r.ok) toast.error(r.error);
              else if (r.data.error) (r.data.status === "pending" ? toast.warning : toast.error)(r.data.error);
              else toast.success(`${a.riotId} is up to date.`);
              router.refresh();
            };
            return (
              <li key={a.id} className={`flex flex-col gap-2 rounded-panel border bg-bg-elevated p-3 ${main ? "border-accent/40" : "border-border"}`} data-testid="riot-account-row" data-label={a.label}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold text-fg">{a.riotId}</span>
                      {main ? (
                        <Badge tone="accent" title="Main account: shown on the profile and used for rank">
                          <Star className="mr-0.5 h-3 w-3" aria-hidden /> Main
                        </Badge>
                      ) : a.label === "alt" ? (
                        <Badge tone="neutral" title="Alternative account: counts in every statistic">
                          Alt{alternatives > 1 ? ` ${ordered.slice(0, index + 1).filter((x) => x.label === "alt").length}` : ""}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-subtle">
                      {a.puuid || a.platformSource === "riot" ? platformLabel(a.platform) : "Server confirmed on first sync"}
                      {a.tier ? ` · ${a.tier[0]}${a.tier.slice(1).toLowerCase()} ${a.division ?? ""}` : ""}
                      {/* Only once Riot has confirmed the account (its Riot ID and server are then Riot's own); never for demo accounts. */}
                      {a.puuid && a.syncStatus !== "demo" && opggProfileUrl(a.riotId, a.platform) ? (
                        <>
                          {" · "}
                          <a href={opggProfileUrl(a.riotId, a.platform)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-accent" data-testid="riot-account-opgg">
                            OP.GG
                            <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                            <span className="sr-only"> profile of {a.riotId} (opens in a new tab)</span>
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {editable && a.label === "alt" && alternatives > 1 ? (
                    <div className="flex shrink-0 items-center" role="group" aria-label={`Order of ${a.riotId}`}>
                      {([-1, 1] as const).map((by) => {
                        const first = ordered[0]?.label === "main" ? 1 : 0;
                        const disabled = busy !== null || (by === -1 ? index <= first : index >= ordered.length - 1);
                        const Icon = by === -1 ? ChevronUp : ChevronDown;
                        return (
                          <button
                            key={by}
                            type="button"
                            ref={(el) => {
                              moveRefs.current.set(`${a.id}:${by}`, el);
                            }}
                            className={buttonClass("ghost", "sm", "px-1.5 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-w-11")}
                            aria-label={`Move ${a.riotId} ${by === -1 ? "up" : "down"}`}
                            title={by === -1 ? "Move up" : "Move down"}
                            disabled={disabled}
                            onClick={() => void move(a, by)}
                            data-testid={`riot-account-move-${by === -1 ? "up" : "down"}`}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {editable ? (
                    <Menu
                      label={`Options for ${a.riotId}`}
                      testId="riot-account-menu"
                      trigger={(t) => (
                        <Button {...t} size="sm" variant="ghost" aria-label={`Options for ${a.riotId}`} disabled={busy !== null}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      )}
                    >
                      {a.label === "alt" ? (
                        <MenuItem
                          icon={<Star className="h-4 w-4" />}
                          onSelect={async () => {
                            setBusy(a.id);
                            const r = await setMainAccountAction(playerId, a.id);
                            setBusy(null);
                            if (!r.ok) return toast.error(r.error);
                            toast.success(`${a.riotId} is now your Main account.`, { description: "Your other accounts are Alts and still count in every statistic." });
                            router.refresh();
                          }}
                        >
                          Make Main account
                        </MenuItem>
                      ) : null}
                      <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setRenaming(a)}>
                        Change Riot ID
                      </MenuItem>
                      {riotConfigured ? (
                        <MenuItem icon={<RefreshCw className="h-4 w-4" />} onSelect={() => void syncNow()}>
                          Sync now
                        </MenuItem>
                      ) : null}
                      <MenuSeparator />
                      <MenuItem tone="danger" icon={<Trash2 className="h-4 w-4" />} onSelect={() => setRemoving(a)}>
                        Remove
                      </MenuItem>
                    </Menu>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={sync.tone} title={sync.detail}>
                    {sync.label}
                  </Badge>
                  <span className="text-fg-subtle">{sync.lastUpdatedAt ? <>Updated <RelativeTime date={sync.lastUpdatedAt} /></> : "Not updated yet"}</span>
                  {editable && canRetrySync(sync) && riotConfigured ? (
                    <Button size="sm" variant="outline" className="ml-auto" disabled={busy !== null} onClick={() => void syncNow()}>
                      <RefreshCw className={busy === a.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Retry sync
                    </Button>
                  ) : null}
                </div>
                {sync.state !== "synced" ? <p className="text-xs text-fg-muted">{sync.detail}</p> : null}
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
        description={removing?.label === "main" ? "Its games and mastery leave your statistics, and your first alternative account becomes your Main. You can link it again later." : "Its games and mastery leave your statistics. You can link it again later."}
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
      description={confirmReplace ? undefined : "Renamed your account in Riot? Type the new Riot ID; your games and statistics stay. (Renames are also picked up automatically within a day.)"}
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
