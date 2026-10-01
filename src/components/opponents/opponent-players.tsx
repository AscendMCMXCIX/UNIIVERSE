"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import type { ScoutConfidence } from "@/server/repositories/opponents";
import { addOpponentAccountAction, addOpponentPlayerAction, deleteOpponentPlayerAction, removeOpponentAccountAction, syncOpponentAction, updateOpponentPlayerAction } from "@/server/actions/opponents";
import { PLATFORMS } from "@/components/team/riot-accounts-panel";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export interface OpponentPlayerView {
  id: string;
  label: string;
  likelyRole: Role | null;
  altRole: Role | null;
  confidence: ScoutConfidence;
  notes: string;
  accounts: RiotAccountRecord[];
  assessment?: { confidence: string; factors: string[]; anomaly: { level: string; notes: string[] } } | null;
}

const CONFIDENCE: ScoutConfidence[] = ["high", "medium", "low", "unknown"];

/**
 * Clash-speed opponent entry: one row = label + Riot ID + role + confidence. Unknown fields are
 * fine; a team with two identified players is still useful.
 */
export function OpponentPlayers({ opponentTeamId, players, riotConfigured, compact = false }: { opponentTeamId: string; players: OpponentPlayerView[]; riotConfigured: boolean; compact?: boolean }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [riotId, setRiotId] = React.useState("");
  const [platform, setPlatform] = React.useState("euw1");
  const [role, setRole] = React.useState<Role | "">("");
  const [confidence, setConfidence] = React.useState<ScoutConfidence>("medium");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [accountInputs, setAccountInputs] = React.useState<Record<string, string>>({});

  const add = async () => {
    const finalLabel = label.trim() || (role ? `Enemy ${ROLE_LABELS[role]}` : riotId.split("#")[0]?.trim() || "");
    if (!finalLabel) return setMessage({ tone: "bad", text: "Give the player a label, a Riot ID or a role." });
    setBusy("add");
    setMessage(null);
    const r = await addOpponentPlayerAction(opponentTeamId, { label: finalLabel, riotId: riotId.trim() || undefined, platform, likelyRole: role || null, confidence: riotId ? confidence : "unknown" });
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "bad", text: r.error });
    setLabel("");
    setRiotId("");
    setRole("");
    setMessage({ tone: "good", text: r.data.accountStatus ? `Added · account ${r.data.accountStatus}` : "Added." });
    router.refresh();
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => {
    setBusy(key);
    setMessage(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setMessage({ tone: "bad", text: r.error ?? "Failed" });
    else if (success) setMessage({ tone: "good", text: success });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader
        title="PLAYERS"
        subtitle={compact ? "Add whatever you know. Unknown players stay unknown." : "Known players, accounts and likely roles. Riot IDs are stored exactly as pasted."}
        actions={
          <Button size="sm" variant="outline" disabled={busy !== null || !riotConfigured} title={riotConfigured ? "Refresh all linked accounts" : "Needs RIOT_API_KEY"} onClick={() => run("sync", () => syncOpponentAction(opponentTeamId).then((r) => (r.ok ? { ok: true } : r)), "Accounts refreshed.")}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync
          </Button>
        }
      />
      <PanelBody className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr_1.2fr_110px_130px_110px_auto]">
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name or 'Enemy Top'" />
          </div>
          <div>
            <Label>Riot ID (optional)</Label>
            <Input value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Paste GameName#TAG" spellCheck={false} />
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
            <Label>Likely role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
              <option value="">unknown</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Identity</Label>
            <Select value={confidence} onChange={(e) => setConfidence(e.target.value as ScoutConfidence)}>
              {CONFIDENCE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="self-end">
            <Button variant="primary" onClick={add} disabled={busy !== null}>
              <Plus className="h-4 w-4" /> {busy === "add" ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}

        <div className="divide-y divide-border">
          {players.length === 0 ? <p className="py-2 text-xs text-fg-muted">No players yet. That is fine: the plan falls back to current meta evidence.</p> : null}
          {players.map((p) => (
            <div key={p.id} className="space-y-1.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {p.likelyRole ? <RoleIcon role={p.likelyRole} className="h-4 w-4 text-accent" /> : <span className="h-4 w-4 rounded-sm border border-dashed border-border" title="role unknown" />}
                <Input className="h-7 w-40 text-sm" defaultValue={p.label} onBlur={(e) => e.target.value !== p.label && run(p.id, () => updateOpponentPlayerAction(opponentTeamId, p.id, { label: e.target.value }))} />
                <Select className="h-7 w-28 text-xs" value={p.likelyRole ?? ""} onChange={(e) => run(p.id, () => updateOpponentPlayerAction(opponentTeamId, p.id, { likelyRole: (e.target.value || null) as Role | null }))}>
                  <option value="">role ?</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Select className="h-7 w-28 text-xs" value={p.altRole ?? ""} onChange={(e) => run(p.id, () => updateOpponentPlayerAction(opponentTeamId, p.id, { altRole: (e.target.value || null) as Role | null }))}>
                  <option value="">alt role</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Select className="h-7 w-24 text-xs" value={p.confidence} onChange={(e) => run(p.id, () => updateOpponentPlayerAction(opponentTeamId, p.id, { confidence: e.target.value as ScoutConfidence }))}>
                  {CONFIDENCE.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                {p.assessment ? <Badge tone={p.assessment.confidence === "high" ? "good" : p.assessment.confidence === "medium" ? "info" : "neutral"}>scouting: {p.assessment.confidence}</Badge> : null}
                {p.assessment?.anomaly.level && p.assessment.anomaly.level !== "none" ? <Badge tone="warn" title={p.assessment.anomaly.notes.join(" · ")}>form above visible rank</Badge> : null}
                <span className="flex-1" />
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => confirm(`Remove ${p.label}?`) && run(p.id, () => deleteOpponentPlayerAction(opponentTeamId, p.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-6 text-xs">
                {p.accounts.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-elevated px-1.5 py-0.5">
                    <span>{a.riotId}</span>
                    <span className="text-fg-subtle">{PLATFORMS.find((x) => x.id === a.platform)?.label ?? a.platform}</span>
                    {a.tier ? <span className="text-info">{a.tier} {a.division ?? ""}</span> : null}
                    <span className={a.syncStatus === "ok" ? "text-good" : a.syncStatus === "never" ? "text-fg-subtle" : "text-warn"} title={a.syncError ?? undefined}>
                      {a.syncStatus === "ok" ? timeAgo(a.lastSyncAt) : a.syncStatus}
                    </span>
                    <button type="button" className="text-fg-subtle hover:text-bad" onClick={() => run(a.id, () => removeOpponentAccountAction(opponentTeamId, a.id))} aria-label="remove account">
                      ×
                    </button>
                  </span>
                ))}
                <Input className="h-6 w-48 text-xs" placeholder="+ Riot ID (GameName#TAG)" value={accountInputs[p.id] ?? ""} onChange={(e) => setAccountInputs({ ...accountInputs, [p.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (accountInputs[p.id] ?? "").includes("#")) run(p.id, () => addOpponentAccountAction(opponentTeamId, p.id, { riotId: accountInputs[p.id]!, platform }).then((r) => (r.ok ? { ok: true } : r)), "Account added.").then(() => setAccountInputs({ ...accountInputs, [p.id]: "" })); }} />
                {p.assessment?.factors.length ? <span className="text-fg-subtle">{p.assessment.factors.join(" · ")}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
