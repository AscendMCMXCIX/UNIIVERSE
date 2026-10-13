"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { PLATFORMS } from "@/domain/platforms";
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
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const add = async () => {
    setBusy("add");
    setMessage(null);
    const r = await addPlayerAccountAction(playerId, { riotId, platform, label, role: role || null });
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setRiotId("");
    setMessage({ tone: "good", text: r.data.puuid ? "Account linked and resolved." : riotConfigured ? `Linked, but Riot said: ${r.data.syncError ?? "not resolved yet"}` : "Account saved. It will be resolved once a Riot API key is configured." });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="RIOT ACCOUNTS" subtitle="Your main account plus any alts. Each account adds to your champion experience and proficiency for drafting recommendations; the same account is never counted twice." />
      <PanelBody className="space-y-3">
        {accounts.length === 0 ? <p className="text-xs text-fg-muted">No accounts linked yet. Linked accounts feed champion proficiency (recent games, mastery, results).</p> : null}
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm">
            <span className="font-medium">{a.riotId}</span>
            <Badge tone="neutral">{PLATFORMS.find((p) => p.id === a.platform)?.label ?? a.platform.toUpperCase()}</Badge>
            <Badge tone="neutral">{a.label}</Badge>
            {a.role ? <Badge tone="neutral">{ROLE_LABELS[a.role]}</Badge> : null}
            {a.tier ? (
              <Badge tone="info">
                {a.tier} {a.division ?? ""} {a.leaguePoints ?? 0} LP
              </Badge>
            ) : null}
            <Badge tone={a.syncStatus === "ok" ? "good" : a.syncStatus === "never" ? "neutral" : "warn"} title={a.syncError ?? undefined}>
              {a.syncStatus === "ok" ? `synced ${timeAgo(a.lastSyncAt)}` : a.syncStatus === "never" ? "not synced" : a.syncStatus}
            </Badge>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" disabled={busy !== null || !riotConfigured} title={riotConfigured ? "Sync now" : "Needs RIOT_API_KEY"} onClick={async () => { setBusy(a.id); const r = await syncPlayerAccountAction(playerId, a.id); setBusy(null); setMessage(r.ok ? { tone: r.data.error ? "bad" : "good", text: r.data.error ?? "Synced." } : { tone: "bad", text: r.error }); router.refresh(); }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={async () => { if (!confirm(`Unlink ${a.riotId}?`)) return; setBusy(a.id); const r = await removePlayerAccountAction(playerId, a.id); setBusy(null); if (!r.ok) setMessage({ tone: "bad", text: r.error }); router.refresh(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_140px_auto]">
          <div>
            <Label>Riot ID</Label>
            <Input value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="GameName#TAG (copy from the client)" spellCheck={false} />
          </div>
          <div>
            <Label>Region</Label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
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
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}
        {!riotConfigured ? <p className="text-[11px] text-fg-subtle">No Riot API key is configured on the server yet; accounts are saved now and resolved automatically once it is.</p> : null}
      </PanelBody>
    </Panel>
  );
}
