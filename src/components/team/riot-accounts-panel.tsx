"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { platformLabel } from "@/domain/platforms";
import { describeAccountSync } from "@/domain/account-status";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import { addPlayerAccountAction, removePlayerAccountAction, syncPlayerAccountAction } from "@/server/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export { PLATFORMS } from "@/domain/platforms";

/**
 * Linked Riot accounts: a Riot ID is all that is needed. Riot confirms the server during the
 * first sync; every linked account is evidence for the same player (no account types, no
 * per-account roles: the role lives on the player profile).
 */
export function RiotAccountsPanel({ playerId, accounts, riotConfigured }: { playerId: string; accounts: RiotAccountRecord[]; riotConfigured: boolean; defaultPlatform?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = React.useState("");
  const [adding, setAdding] = React.useState(accounts.length === 0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad" | "neutral"; text: string } | null>(null);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!riotId.includes("#")) return setMessage({ tone: "bad", text: "Enter the Riot ID exactly as shown in the client: GameName#TAG." });
    setBusy("add");
    setMessage(null);
    const r = await addPlayerAccountAction(playerId, { riotId });
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setRiotId("");
    setAdding(false);
    const a = r.data;
    if (a.puuid && a.syncStatus === "ok") setMessage({ tone: "good", text: `${a.riotId} linked and synced (${platformLabel(a.platform)}${a.platformSource === "riot" ? ", server confirmed by Riot" : ""}).` });
    else if (a.puuid) setMessage({ tone: "neutral", text: `${a.riotId} linked; the first data sync is queued.` });
    else setMessage({ tone: "neutral", text: riotConfigured ? (a.syncError ?? "Account saved; verification with Riot is pending and retried automatically.") : "Account saved. It will be verified once Riot data is available." });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="LINKED RIOT ACCOUNTS" subtitle="Every linked account adds its games and mastery to your champion proficiency. The same account is never counted twice." />
      <PanelBody className="space-y-3">
        {accounts.length === 0 ? <p className="text-xs text-fg-muted">No Riot account linked yet. Link one so proficiency can be measured.</p> : null}
        <div className="space-y-1.5">
          {accounts.map((a) => {
            const sync = describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured });
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm">
                <span className="font-medium">{a.riotId}</span>
                {a.puuid || a.platformSource === "riot" ? (
                  <Badge tone="neutral" title={a.platformSource === "riot" ? "Server confirmed by Riot's account records" : "Server as selected; Riot confirms it during the first sync"}>
                    {platformLabel(a.platform)}
                  </Badge>
                ) : null}
                {a.tier ? (
                  <Badge tone="info" title="Current ranked solo/duo tier on this account">
                    {a.tier} {a.division ?? ""} {a.leaguePoints ?? 0} LP
                  </Badge>
                ) : null}
                <Badge tone={sync.tone} title={sync.detail}>
                  {sync.label}
                </Badge>
                <span className="text-xs text-fg-subtle">{sync.lastUpdatedAt ? timeAgo(sync.lastUpdatedAt) : "never updated"}</span>
                <span className="flex-1" />
                <Button size="sm" variant={sync.state === "synced" ? "ghost" : "outline"} disabled={busy !== null || !riotConfigured} title={riotConfigured ? "Ask Riot again now" : "Riot data is not available on the server yet"} onClick={async () => { setBusy(a.id); const r = await syncPlayerAccountAction(playerId, a.id); setBusy(null); setMessage(r.ok ? { tone: r.data.error ? (r.data.status === "pending" ? "neutral" : "bad") : "good", text: r.data.error ?? `${a.riotId} synced: rank, mastery and recent games refreshed.` } : { tone: "bad", text: r.error }); router.refresh(); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> {sync.state === "synced" ? "Sync now" : "Retry sync"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} aria-label={`Unlink ${a.riotId}`} onClick={async () => { if (!confirm(`Unlink ${a.riotId}? Its games and mastery are removed from your proficiency data.`)) return; setBusy(a.id); const r = await removePlayerAccountAction(playerId, a.id); setBusy(null); if (!r.ok) setMessage({ tone: "bad", text: r.error }); router.refresh(); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {sync.state !== "synced" ? <span className="w-full text-xs text-fg-muted">{sync.detail}</span> : null}
              </div>
            );
          })}
        </div>
        {adding ? (
          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`riot-id-${playerId}`}>Riot ID</Label>
              <Input id={`riot-id-${playerId}`} value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="GameName#TAG" spellCheck={false} autoComplete="off" autoFocus={accounts.length > 0} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy !== null || !riotId.includes("#")} className="flex-1 sm:flex-none">
                {busy === "add" ? "Linking…" : "Link account"}
              </Button>
              {accounts.length > 0 ? (
                <Button variant="ghost" onClick={() => { setAdding(false); setRiotId(""); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            + Add account
          </Button>
        )}
        <p className="text-[11px] text-fg-subtle">Copy the Riot ID from the League client, including the #TAG. Riot confirms which server the account plays on and the account is stored by its permanent Riot identity, so a renamed account is still recognised.</p>
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : message.tone === "bad" ? "text-xs text-bad" : "text-xs text-fg-muted"}>{message.text}</p> : null}
        {!riotConfigured ? <p className="text-[11px] text-fg-subtle">Riot data is not available on the server yet; accounts are saved now and verified automatically once it is.</p> : null}
      </PanelBody>
    </Panel>
  );
}
