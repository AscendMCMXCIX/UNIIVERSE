"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/domain/roles";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS, type CompetitionMode } from "@/domain/competition";
import { enemyNameList, enemySlotsFromList } from "@/domain/scouting/enemy-slots";
import { deleteMatchAction, linkRiotMatchAction, updateMatchAction } from "@/server/actions/matches";
import { EnemyNamesInput } from "@/components/draft/enemy-names-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export interface MatchEditorProps {
  match: { id: string; result: "win" | "loss" | "cancelled" | null; durationSeconds: number | null; riotMatchId: string | null; notes: string; vodUrl: string; playedAt: string; eventName: string; opponentName: string; enemyPlayers: Partial<Record<Role, string>>; mode: CompetitionMode; inSeries: boolean };
  /** The draft's creator or an admin: may correct and delete the record. */
  canEdit: boolean;
  riotConfigured: boolean;
}

/**
 * Corrections to a saved match (result, competition mode, opponent, enemy names, notes…) and its
 * deletion. Picks and bans are the draft's record and Riot's data is linked, never rewritten.
 */
export function MatchEditor({ match, canEdit, riotConfigured }: MatchEditorProps) {
  const router = useRouter();
  const [result, setResult] = React.useState<MatchEditorProps["match"]["result"] | "">(match.result ?? "");
  const [minutes, setMinutes] = React.useState(match.durationSeconds ? String(Math.round(match.durationSeconds / 60)) : "");
  const [riotId, setRiotId] = React.useState(match.riotMatchId ?? "");
  const [notes, setNotes] = React.useState(match.notes);
  const [vod, setVod] = React.useState(match.vodUrl);
  const [playedAt, setPlayedAt] = React.useState(match.playedAt.slice(0, 10));
  const [eventName, setEventName] = React.useState(match.eventName);
  const [opponentName, setOpponentName] = React.useState(match.opponentName);
  const [enemyPlayers, setEnemyPlayers] = React.useState<string[]>(enemyNameList(match.enemyPlayers));
  const [mode, setMode] = React.useState<CompetitionMode>(match.mode);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    const r = await updateMatchAction(match.id, {
      result: result === "" ? null : result,
      durationSeconds: minutes.trim() ? Math.round(Number(minutes) * 60) : null,
      riotMatchId: riotId.trim() || null,
      notes,
      vodUrl: vod,
      playedAt: playedAt ? new Date(`${playedAt}T12:00:00Z`).toISOString() : undefined,
      eventName,
      opponentName,
      // Every slot is sent (blank ones clear what was there before).
      enemyPlayers: Object.fromEntries(ROLES.map((r) => [r, enemySlotsFromList(enemyPlayers)[r] ?? ""])) as Record<Role, string>,
      mode,
    });
    setBusy(false);
    if (!r.ok) toast.error("Match not saved", { description: r.error });
    else {
      toast.success("Match saved.");
      router.refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    const r = await deleteMatchAction(match.id);
    setBusy(false);
    if (!r.ok) {
      toast.error("Match not deleted", { description: r.error });
      setConfirmDelete(false);
      return;
    }
    toast.success("Match deleted.");
    router.push("/matches?view=drafted");
    router.refresh();
  };

  const link = async () => {
    setBusy(true);
    const r = await linkRiotMatchAction(match.id, riotId);
    setBusy(false);
    if (!r.ok) toast.error("Riot match not linked", { description: r.error });
    else {
      toast.success(r.message ?? "Riot match linked.");
      router.refresh();
    }
  };

  return (
    <Panel>
      <PanelHeader title="Result & notes" subtitle="Optional. Recorded for the archive only: results never change recommendations." />
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
            <span className="text-xs text-fg-muted">Competition mode{match.inSeries ? " (set by the series)" : ""}</span>
            <select disabled={!canEdit || match.inSeries} value={mode} onChange={(e) => setMode(e.target.value as CompetitionMode)} className="h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm" data-testid="match-mode">
              {(DRAFT_MODE_OPTIONS.includes(mode) ? DRAFT_MODE_OPTIONS : [...DRAFT_MODE_OPTIONS, mode]).map((m) => (
                <option key={m} value={m}>
                  {COMPETITION_MODE_INFO[m].label}
                </option>
              ))}
            </select>
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
            <span className="text-xs text-fg-muted">Enemy players (optional, any order)</span>
            <EnemyNamesInput value={enemyPlayers} onChange={setEnemyPlayers} disabled={!canEdit} />
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
        <ConfirmDialog
          open={canEdit && confirmDelete}
          busy={busy}
          title="Delete this match?"
          description={`It leaves Match History. Players, Riot accounts, the draft and other matches are not affected${match.inSeries ? ", and the series score is recalculated without it" : ""}. Saving the draft as a match again brings it back.`}
          confirmLabel="Delete match"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" className="text-bad" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete match
            </Button>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
