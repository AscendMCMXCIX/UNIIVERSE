"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS, type CompetitionMode } from "@/domain/competition";
import { buildMatchPatch, formFromMatch, pendingEdits, shownValue, withEdit, type EditableMatch, type MatchEdits, type MatchForm, type MatchFormKey } from "@/domain/match-edit";
import { viewerTimeZone } from "@/domain/match-time";
import { deleteMatchAction, linkRiotMatchAction, updateMatchAction } from "@/server/actions/matches";
import { EnemyNamesInput } from "@/components/draft/enemy-names-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export interface MatchEditorProps {
  match: EditableMatch & { id: string; inSeries: boolean; /** The record's version (ISO); saves made against an older one are refused. */ updatedAt: string };
  /** The draft's creator or an admin: may correct and delete the record. */
  canEdit: boolean;
  riotConfigured: boolean;
}

const subscribeNever = () => () => undefined;

/**
 * Corrections to a saved match (result, competition mode, opponent, enemy names, notes…) and its
 * deletion. Picks and bans are the draft's record and Riot's data is linked, never rewritten.
 *
 * Only the person's own edits live in this component; every untouched field shows the record as
 * the server last sent it (see `src/domain/match-edit.ts`). Linking a Riot game, or a save by
 * someone else, therefore shows up here as soon as the page refreshes, and Save sends only the
 * edited fields with the version they were made against.
 */
export function MatchEditor({ match, canEdit, riotConfigured }: MatchEditorProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  // Dates are shown in the viewer's time zone; UTC while rendering on the server (hydration).
  const timeZone = React.useSyncExternalStore(subscribeNever, viewerTimeZone, () => "UTC");
  const server = formFromMatch(match, timeZone);
  const [edits, setEdits] = React.useState<MatchEdits>({});
  const pending = pendingEdits(edits, server);
  const value = <K extends MatchFormKey>(key: K) => shownValue(pending, server, key);
  const edit = <K extends MatchFormKey>(key: K, v: MatchForm[K]) => setEdits((e) => withEdit(pendingEdits(e, server), server, key, v));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    const r = await updateMatchAction(match.id, buildMatchPatch(pending, match, timeZone), { expectedUpdatedAt: match.updatedAt });
    setBusy(false);
    if (!r.ok) {
      toast.error("Match not saved", { description: r.error });
      // A newer version exists: load it. The person's edits stay in the form.
      if ("stale" in r) startTransition(() => router.refresh());
      return;
    }
    toast.success("Match saved.");
    startTransition(() => {
      router.refresh();
      setEdits({});
    });
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
    const r = await linkRiotMatchAction(match.id, value("riotMatchId"));
    setBusy(false);
    if (!r.ok) toast.error("Riot match not linked", { description: r.error });
    else {
      toast.success(r.message ?? "Riot match linked.");
      startTransition(() => router.refresh());
    }
  };

  return (
    <Panel>
      <PanelHeader title="Result & notes" subtitle="Optional. Recorded for the archive only: results never change recommendations." />
      <PanelBody className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Result</span>
            <select disabled={!canEdit} value={value("result")} onChange={(e) => edit("result", e.target.value as MatchForm["result"])} className="h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm">
              <option value="">not recorded</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="cancelled">Cancelled / remake</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Duration (minutes)</span>
            <Input disabled={!canEdit} value={value("minutes")} onChange={(e) => edit("minutes", e.target.value)} inputMode="numeric" placeholder="e.g. 31" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Played on</span>
            <Input disabled={!canEdit} type="date" value={value("playedOn")} onChange={(e) => edit("playedOn", e.target.value)} data-testid="match-played-on" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Competition mode{match.inSeries ? " (set by the series)" : ""}</span>
            <select disabled={!canEdit || match.inSeries} value={value("mode")} onChange={(e) => edit("mode", e.target.value as CompetitionMode)} className="h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm" data-testid="match-mode">
              {(DRAFT_MODE_OPTIONS.includes(value("mode")) ? DRAFT_MODE_OPTIONS : [...DRAFT_MODE_OPTIONS, value("mode")]).map((m) => (
                <option key={m} value={m}>
                  {COMPETITION_MODE_INFO[m].label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Event</span>
            <Input disabled={!canEdit} value={value("eventName")} onChange={(e) => edit("eventName", e.target.value)} placeholder="Clash day 1, scrim block…" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Opponent (team name or label, optional)</span>
            <Input disabled={!canEdit} value={value("opponentName")} onChange={(e) => edit("opponentName", e.target.value)} placeholder="Team Example" maxLength={60} />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Enemy players (optional, any order)</span>
            <EnemyNamesInput value={value("enemyPlayers")} onChange={(v) => edit("enemyPlayers", v)} disabled={!canEdit} />
          </div>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Riot match ID {riotConfigured ? "(result and duration are fetched when linked)" : "(stored only: no Riot API key configured)"}</span>
            <span className="flex gap-2">
              <Input disabled={!canEdit} value={value("riotMatchId")} onChange={(e) => edit("riotMatchId", e.target.value)} placeholder="EUW1_7012345678" data-testid="match-riot-id" />
              {canEdit ? (
                <Button variant="outline" onClick={link} disabled={busy || !value("riotMatchId").trim()}>
                  Link
                </Button>
              ) : null}
            </span>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">VOD link</span>
            <Input disabled={!canEdit} value={value("vodUrl")} onChange={(e) => edit("vodUrl", e.target.value)} placeholder="https://…" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Notes</span>
            <textarea disabled={!canEdit} value={value("notes")} onChange={(e) => edit("notes", e.target.value)} rows={4} className="w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm" placeholder="What happened, what to remember next time…" />
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
            <Button variant="primary" onClick={save} disabled={busy} data-testid="match-save">
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
