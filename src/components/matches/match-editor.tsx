"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { deleteMatchAction, linkRiotMatchAction, updateMatchAction } from "@/server/actions/matches";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export interface MatchEditorProps {
  match: { id: string; result: "win" | "loss" | "cancelled" | null; durationSeconds: number | null; riotMatchId: string | null; notes: string; vodUrl: string; playedAt: string; eventName: string; opponentName: string; enemyPlayers: Partial<Record<Role, string>> };
  canEdit: boolean;
  isOwner: boolean;
  riotConfigured: boolean;
}

/** Optional facts about the match: result, duration, Riot match ID, notes, VOD. Archive only. */
export function MatchEditor({ match, canEdit, isOwner, riotConfigured }: MatchEditorProps) {
  const router = useRouter();
  const [result, setResult] = React.useState<MatchEditorProps["match"]["result"] | "">(match.result ?? "");
  const [minutes, setMinutes] = React.useState(match.durationSeconds ? String(Math.round(match.durationSeconds / 60)) : "");
  const [riotId, setRiotId] = React.useState(match.riotMatchId ?? "");
  const [notes, setNotes] = React.useState(match.notes);
  const [vod, setVod] = React.useState(match.vodUrl);
  const [playedAt, setPlayedAt] = React.useState(match.playedAt.slice(0, 10));
  const [eventName, setEventName] = React.useState(match.eventName);
  const [opponentName, setOpponentName] = React.useState(match.opponentName);
  const [enemyPlayers, setEnemyPlayers] = React.useState<Partial<Record<Role, string>>>(match.enemyPlayers);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const r = await updateMatchAction(match.id, {
      result: result === "" ? null : result,
      durationSeconds: minutes.trim() ? Math.round(Number(minutes) * 60) : null,
      riotMatchId: riotId.trim() || null,
      notes,
      vodUrl: vod,
      playedAt: playedAt ? new Date(`${playedAt}T12:00:00Z`).toISOString() : undefined,
      eventName,
      opponentName,
      enemyPlayers: Object.fromEntries(ROLES.map((r) => [r, enemyPlayers[r] ?? ""])) as Record<Role, string>,
    });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setMessage("Saved.");
      router.refresh();
    }
  };

  const link = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const r = await linkRiotMatchAction(match.id, riotId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setMessage(r.message ?? "Linked.");
      router.refresh();
    }
  };

  return (
    <Panel>
      <PanelHeader title="RESULT & NOTES" subtitle="Optional. Recorded for the archive only: results never change recommendations." />
      <PanelBody className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Result</span>
            <select disabled={!canEdit} value={result ?? ""} onChange={(e) => setResult(e.target.value as MatchEditorProps["match"]["result"] | "")} className="h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm">
              <option value="">not recorded</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="cancelled">Cancelled / remake</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Duration (minutes)</span>
            <Input disabled={!canEdit} value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="e.g. 31" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Played on</span>
            <Input disabled={!canEdit} type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Event</span>
            <Input disabled={!canEdit} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Clash day 1, scrim block…" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Opponent (team name or label, optional)</span>
            <Input disabled={!canEdit} value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Team Example" maxLength={60} />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Enemy players (optional, by role)</span>
            <div className="grid gap-1.5 sm:grid-cols-5">
              {ROLES.map((role) => (
                <span key={role} className="flex items-center gap-1.5">
                  <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                  <Input disabled={!canEdit} value={enemyPlayers[role] ?? ""} onChange={(e) => setEnemyPlayers({ ...enemyPlayers, [role]: e.target.value })} placeholder={ROLE_LABELS[role]} maxLength={40} className="h-8 text-xs" aria-label={`Enemy ${ROLE_LABELS[role]}`} />
                </span>
              ))}
            </div>
          </div>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Riot match ID {riotConfigured ? "(result and duration are fetched when linked)" : "(stored only: no Riot API key configured)"}</span>
            <span className="flex gap-2">
              <Input disabled={!canEdit} value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="EUW1_7012345678" />
              {canEdit ? (
                <Button variant="outline" onClick={link} disabled={busy || !riotId.trim()}>
                  Link
                </Button>
              ) : null}
            </span>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">VOD link</span>
            <Input disabled={!canEdit} value={vod} onChange={(e) => setVod(e.target.value)} placeholder="https://…" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Notes</span>
            <textarea disabled={!canEdit} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm" placeholder="What happened, what to remember next time…" />
          </label>
        </div>
        {error ? <p className="text-xs text-bad">{error}</p> : null}
        {message ? <p className="text-xs text-good">{message}</p> : null}
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={busy}>
              Save
            </Button>
            {isOwner ? (
              <form action={deleteMatchAction.bind(null, match.id)} onSubmit={(e) => { if (!confirm("Delete this match record? The draft itself stays.")) e.preventDefault(); }}>
                <Button type="submit" variant="ghost" disabled={busy}>
                  Delete record
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
