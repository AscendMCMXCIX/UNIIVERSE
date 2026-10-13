"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { COMPETITION_MODES, COMPETITION_MODE_INFO, type CompetitionMode } from "@/domain/competition";
import type { DraftFormat } from "@/domain/draft";
import { SERIES_LENGTHS, seriesLabel, type SeriesLength } from "@/domain/series";
import { createDraftAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ToggleChip } from "@/components/ui/toggle";

export interface NextGameContext {
  seriesId: string;
  mode: CompetitionMode;
  eventName: string;
  opponentName: string;
  bestOf: number;
  gameNumber: number;
}

export interface NewDraftFormProps {
  lineupReady: boolean;
  formats: DraftFormat[];
  defaultMode?: CompetitionMode;
  /** When set, the form starts the next game of this series: mode, event and opponent are inherited. */
  nextGame?: NextGameContext | null;
}

export function NewDraftForm({ lineupReady, formats, defaultMode = "ranked-flex", nextGame = null }: NewDraftFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<CompetitionMode>(nextGame?.mode ?? defaultMode);
  const [opponent, setOpponent] = React.useState(nextGame?.opponentName ?? "");
  const [eventName, setEventName] = React.useState(nextGame?.eventName ?? "");
  const [side, setSide] = React.useState<"blue" | "red">("blue");
  const [formatId, setFormatId] = React.useState<string>(COMPETITION_MODE_INFO[nextGame?.mode ?? defaultMode].defaultFormatId);
  const [bestOf, setBestOf] = React.useState<SeriesLength>(1);
  const [theorycraft, setTheorycraft] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const info = COMPETITION_MODE_INFO[mode];
  const seriesPossible = info.seriesAllowed && !theorycraft && !nextGame;

  const chooseMode = (m: CompetitionMode) => {
    setMode(m);
    setFormatId(COMPETITION_MODE_INFO[m].defaultFormatId);
    if (!COMPETITION_MODE_INFO[m].seriesAllowed) setBestOf(1);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createDraftAction({ opponentName: opponent, side, mode, formatId, isTheorycraft: theorycraft, eventName, seriesBestOf: seriesPossible ? bestOf : null, seriesId: nextGame?.seriesId ?? null });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(info.scouting === "none" || theorycraft ? `/draft/${res.data.id}` : `/draft/${res.data.id}/prepare`);
  };

  return (
    <Panel className={nextGame ? "border-accent/50" : undefined}>
      <PanelHeader
        title={nextGame ? `NEXT GAME · GAME ${nextGame.gameNumber} OF ${seriesLabel(nextGame.bestOf).toUpperCase()}` : "NEW DRAFT"}
        subtitle={nextGame ? `${COMPETITION_MODE_INFO[nextGame.mode].label}${nextGame.eventName ? ` · ${nextGame.eventName}` : ""}${nextGame.opponentName ? ` · vs ${nextGame.opponentName}` : ""}. Pick the side for this game; the draft board, bans, picks and playbook start fresh. Change the lineup on the Team page first if someone is swapping in.` : "Pick the competition mode first: it decides the draft format and whether the games can form a series."}
      />
      <PanelBody>
        <form onSubmit={start} className="space-y-4">
          {!nextGame ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {COMPETITION_MODES.map((m) => (
                  <ToggleChip key={m} active={mode === m} onClick={() => chooseMode(m)} title={COMPETITION_MODE_INFO[m].description}>
                    {COMPETITION_MODE_INFO[m].label}
                  </ToggleChip>
                ))}
              </div>
              <p className="text-xs text-fg-subtle">{info.description}</p>
            </>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="opponent">Opponent (optional)</Label>
              <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={info.scouting === "none" ? "Unknown until champion select" : "Team name or label"} maxLength={60} disabled={!!nextGame} />
            </div>
            <div>
              <Label htmlFor="event">Event (optional)</Label>
              <Input id="event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={mode === "clash" ? "e.g. Clash Cup Day 2" : "Tournament, league, scrim block…"} maxLength={80} disabled={!!nextGame} />
            </div>
            <div>
              <Label>Our side{nextGame ? " this game" : ""}</Label>
              <div className="flex gap-1.5">
                {(["blue", "red"] as const).map((s) => (
                  <ToggleChip key={s} active={side === s} tone={s} onClick={() => setSide(s)} className="px-4 font-medium capitalize">
                    {s}
                  </ToggleChip>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto sm:min-w-[260px]">
              <Label htmlFor="format">Draft format</Label>
              {info.formatSelectable ? (
                <Select id="format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex min-h-11 items-center rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg-muted md:min-h-9">{formats.find((f) => f.id === info.defaultFormatId)?.name ?? info.defaultFormatId}</div>
              )}
            </div>
            {seriesPossible ? (
              <div>
                <Label>Series</Label>
                <div className="flex gap-1.5">
                  {SERIES_LENGTHS.map((n) => (
                    <ToggleChip key={n} active={bestOf === n} onClick={() => setBestOf(n)}>
                      {seriesLabel(n)}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            ) : null}
            {!nextGame ? (
              <label className="flex min-h-11 items-center gap-2 text-sm text-fg-muted md:min-h-9">
                <input type="checkbox" checked={theorycraft} onChange={(e) => setTheorycraft(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)] md:h-4 md:w-4" />
                Theorycraft (hypothetical; no match record)
              </label>
            ) : null}
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady} className="w-full sm:w-auto">
              {busy ? "Starting…" : nextGame ? `Start game ${nextGame.gameNumber}` : info.scouting === "none" && !theorycraft ? "Prepare bans & start" : theorycraft ? "Start theorycraft" : bestOf > 1 ? `Start ${seriesLabel(bestOf).toLowerCase()}` : "Prepare & start"}
            </Button>
          </div>
          {seriesPossible && bestOf > 1 ? <p className="text-xs text-fg-subtle">Each game of the series gets its own side, draft, playbook and match record. The series ends as soon as one side has won enough games, or when you end it from the match history.</p> : null}
          {!lineupReady ? <p className="text-xs text-warn">Assign all five roles on the Team page first.</p> : null}
          {error ? <p className="text-xs text-bad">{error}</p> : null}
        </form>
      </PanelBody>
    </Panel>
  );
}
