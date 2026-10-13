"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { PLATFORMS, platformLabel } from "@/domain/platforms";
import { describeAccountSync } from "@/domain/account-status";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import { addPlayerAccountAction, removePlayerAccountAction, syncPlayerAccountAction } from "@/server/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export { PLATFORMS } from "@/domain/platforms";

export function RiotAccountsPanel({ playerId, accounts, riotConfigured, defaultPlatform }: { playerId: string; accounts: RiotAccountRecord[]; riotConfigured: boolean; defaultPlatform?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = React.useState("");
  const [platform, setPlatform] = React.useState(defaultPlatform ?? "oc1");
  const [label, setLabel] = React.useState("main");
  const [role, setRole] = React.useState<Role | "">("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad" | "neutral"; text: string } | null>(null);

  const add = async () => {
    setBusy("add");
    setMessage(null);
    const r = await addPlayerAccountAction(playerId, { riotId, platform, label, role: role || null });
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setRiotId("");
    const a = r.data;
    if (a.puuid) setMessage({ tone: "good", text: `Riot account connected: ${a.riotId} on ${platformLabel(a.platform)}${a.platformSource === "riot" ? " (server confirmed by Riot)" : ""}. Ranked data sync ${a.syncStatus === "ok" ? "completed" : "queued"}.` });
    else setMessage({ tone: "neutral", text: riotConfigured ? `Account saved; verification with Riot is pending. ${a.syncError ?? "It is retried automatically."}` : "Account saved. It will be verified once the owner configures a Riot API key." });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="RIOT ACCOUNTS" subtitle="Your main account plus any alts. Every account adds to your champion experience for drafting recommendations; the same account is never counted twice." />
      <PanelBody className="space-y-3">
        {accounts.length === 0 ? <p className="text-xs text-fg-muted">No accounts linked yet. Linked accounts feed champion proficiency (recent games, mastery, results).</p> : null}
        {accounts.map((a) => {
          const sync = describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, riotConfigured });
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm">
              <span className="font-medium">{a.riotId}</span>
              <Badge tone="neutral" title={a.platformSource === "riot" ? "Server confirmed by Riot's account records" : "Server as selected; Riot confirms it during the first sync"}>
                {platformLabel(a.platform)}
                {a.platformSource === "riot" ? " ✓" : ""}
              </Badge>
              <Badge tone="neutral">{a.label}</Badge>
              {a.role ? <Badge tone="neutral">{ROLE_LABELS[a.role]}</Badge> : null}
              {a.tier ? (
                <Badge tone="info">
                  {a.tier} {a.division ?? ""} {a.leaguePoints ?? 0} LP
                </Badge>
              ) : null}
              <Badge tone={sync.tone} title={sync.detail}>
                {sync.label}
              </Badge>
              <span className="text-xs text-fg-subtle">Last updated {sync.lastUpdatedAt ? timeAgo(sync.lastUpdatedAt) : "never"}</span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" disabled={busy !== null || !riotConfigured} title={riotConfigured ? "Sync now" : "Needs a Riot API key on the server"} onClick={async () => { setBusy(a.id); const r = await syncPlayerAccountAction(playerId, a.id); setBusy(null); setMessage(r.ok ? { tone: r.data.error ? (r.data.status === "pending" ? "neutral" : "bad") : "good", text: r.data.error ?? `Synced ${a.riotId}: rank, mastery and recent games refreshed.` } : { tone: "bad", text: r.error }); router.refresh(); }}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={async () => { if (!confirm(`Unlink ${a.riotId}? Its games and mastery are removed from your proficiency data.`)) return; setBusy(a.id); const r = await removePlayerAccountAction(playerId, a.id); setBusy(null); if (!r.ok) setMessage({ tone: "bad", text: r.error }); router.refresh(); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {sync.state !== "synced" ? <span className="w-full text-xs text-fg-muted">{sync.detail}</span> : null}
            </div>
          );
        })}
        <div className="grid gap-2 md:grid-cols-[1fr_130px_120px_140px_auto]">
          <div>
            <Label>Riot ID</Label>
            <Input value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="GameName#TAG (copy from the client)" spellCheck={false} />
          </div>
          <div>
            <Label>Region (fallback)</Label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)} title="Riot tells UNIIVERSE which server the account plays on; this selection is only used until then.">
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id} title={p.name}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={label} onChange={(e) => setLabel(e.target.value)}>
              <option value="main">main</option>
              <option value="alt">alt</option>
              <option value="role">role-specific</option>
            </Select>
          </div>
          <div>
            <Label>Role (optional)</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
              <option value="">any</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="self-end">
            <Button variant="outline" onClick={add} disabled={busy !== null || !riotId.includes("#")}>
              {busy === "add" ? "Linking…" : "Link account"}
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-fg-subtle">The Riot ID is looked up with Riot&apos;s account service and stored by its permanent Riot identity (PUUID), so a renamed account is still recognised and never counted twice. Riot also reports which server the account plays on; the region selector is only a fallback for when Riot cannot be asked.</p>
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : message.tone === "bad" ? "text-xs text-bad" : "text-xs text-fg-muted"}>{message.text}</p> : null}
        {!riotConfigured ? <p className="text-[11px] text-fg-subtle">No Riot API key is configured on the server yet; accounts are saved now and verified automatically once it is.</p> : null}
      </PanelBody>
    </Panel>
  );
}
