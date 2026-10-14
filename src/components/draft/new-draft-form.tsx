"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS, type CompetitionMode } from "@/domain/competition";
import type { DraftFormat } from "@/domain/draft";
import { enemySlotsFromList } from "@/domain/scouting/enemy-slots";
import { SERIES_LENGTHS, seriesLabel, type SeriesLength } from "@/domain/series";
import { createDraftAction } from "@/server/actions/drafts";
import { EnemyNamesInput } from "./enemy-names-input";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ToggleChip } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";

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

/** A collapsed group of optional controls: shows what is required, reveals the rest on request. */
function Disclosure({ title, hint, open, onToggle, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm">
        <span>
          <span className="font-medium text-fg">{title}</span>
          {hint ? <span className="ml-2 text-xs text-fg-subtle">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="space-y-3 border-t border-border px-3 py-3">{children}</div> : null}
    </div>
  );
}

/**
 * Starting a draft asks for what is required (competition mode, side) and reveals the rest on
 * request: opponent and event, enemy Riot IDs for session scouting, series length where the mode
 * allows it, draft format and theorycraft under advanced options.
 */
export function NewDraftForm({ lineupReady, formats, defaultMode = "ranked-flex", nextGame = null }: NewDraftFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<CompetitionMode>(nextGame?.mode ?? defaultMode);
  const [opponent, setOpponent] = React.useState(nextGame?.opponentName ?? "");
  const [eventName, setEventName] = React.useState(nextGame?.eventName ?? "");
  const [side, setSide] = React.useState<"blue" | "red">("blue");
  const [formatId, setFormatId] = React.useState<string>(COMPETITION_MODE_INFO[nextGame?.mode ?? defaultMode].defaultFormatId);
  const [bestOf, setBestOf] = React.useState<SeriesLength>(1);
  const [theorycraft, setTheorycraft] = React.useState(false);
  const [enemies, setEnemies] = React.useState<string[]>([]);
  const [showOptional, setShowOptional] = React.useState(false);
  const [showEnemies, setShowEnemies] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const info = COMPETITION_MODE_INFO[mode];
  const seriesPossible = info.seriesAllowed && !theorycraft && !nextGame;
  const enemyCount = enemies.filter((e) => e.trim()).length;
  const enemyRiotIds = enemies.filter((e) => e.includes("#")).length;

  const chooseMode = (m: CompetitionMode) => {
    setMode(m);
    setFormatId(COMPETITION_MODE_INFO[m].defaultFormatId);
    if (!COMPETITION_MODE_INFO[m].seriesAllowed) setBestOf(1);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createDraftAction({ opponentName: opponent, side, mode, formatId, isTheorycraft: theorycraft, eventName, seriesBestOf: seriesPossible ? bestOf : null, seriesId: nextGame?.seriesId ?? null, enemyPlayers: enemySlotsFromList(enemies) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(info.scouting === "none" && enemyRiotIds === 0 && !theorycraft ? `/draft/${res.data.id}` : theorycraft ? `/draft/${res.data.id}` : `/draft/${res.data.id}/prepare`);
  };

  const modeOptions = DRAFT_MODE_OPTIONS.includes(mode) ? DRAFT_MODE_OPTIONS : [...DRAFT_MODE_OPTIONS, mode];

  return (
    <Panel className={nextGame ? "border-accent/50" : undefined}>
      <PanelHeader
        title={nextGame ? `NEXT GAME · GAME ${nextGame.gameNumber} OF ${seriesLabel(nextGame.bestOf).toUpperCase()}` : "START A DRAFT"}
        subtitle={nextGame ? `${COMPETITION_MODE_INFO[nextGame.mode].label}${nextGame.eventName ? ` · ${nextGame.eventName}` : ""}${nextGame.opponentName ? ` · vs ${nextGame.opponentName}` : ""}. Pick the side for this game; the draft board, bans, picks and playbook start fresh. Change the lineup on the Team page first if someone is swapping in.` : "Choose the competition mode and our side. Everything else is optional."}
      />
      <PanelBody>
        <form onSubmit={start} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            {!nextGame ? (
              <div>
                <Label htmlFor="mode">Competition mode</Label>
                <Select id="mode" value={mode} onChange={(e) => chooseMode(e.target.value as CompetitionMode)}>
                  {modeOptions.map((m) => (
                    <option key={m} value={m}>
                      {COMPETITION_MODE_INFO[m].label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-fg-subtle">{info.description}</p>
              </div>
            ) : (
              <div />
            )}
            <div>
              <Label>Our side{nextGame ? " this game" : ""}</Label>
              <div className="flex gap-1.5">
                {(["blue", "red"] as const).map((s) => (
                  <ToggleChip key={s} active={side === s} tone={s} onClick={() => setSide(s)} className="px-5 font-medium capitalize">
                    {s}
                  </ToggleChip>
                ))}
              </div>
            </div>
          </div>

          {seriesPossible ? (
            <div className="sm:max-w-xs">
              <Label htmlFor="series">Series</Label>
              <Select id="series" value={String(bestOf)} onChange={(e) => setBestOf(Number(e.target.value) as SeriesLength)}>
                {SERIES_LENGTHS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Single game" : seriesLabel(n)}
                  </option>
                ))}
              </Select>
              {bestOf > 1 ? <p className="mt-1 text-xs text-fg-subtle">Each game gets its own side, draft, playbook and match record; the series ends when one side has won enough games.</p> : null}
            </div>
          ) : null}

          {!nextGame ? (
            <Disclosure title="Optional information" hint={opponent || eventName ? [opponent && `vs ${opponent}`, eventName].filter(Boolean).join(" · ") : "opponent, event"} open={showOptional} onToggle={() => setShowOptional((v) => !v)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="opponent">Opponent</Label>
                  <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={info.scouting === "none" ? "Unknown until champion select" : "Team name or label"} maxLength={60} />
                </div>
                <div>
                  <Label htmlFor="event">Event</Label>
                  <Input id="event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={mode === "clash" ? "e.g. Clash Cup Day 2" : "Tournament, league, scrim block…"} maxLength={80} />
                </div>
              </div>
            </Disclosure>
          ) : null}

          {!theorycraft ? (
            <Disclosure title="Enemy players — optional" hint={enemyCount ? `${enemyCount} entered${enemyRiotIds ? `, ${enemyRiotIds} Riot ID${enemyRiotIds === 1 ? "" : "s"} to scout` : ""}` : "Riot IDs are scouted for this draft"} open={showEnemies} onToggle={() => setShowEnemies((v) => !v)}>
              <p className="text-xs text-fg-muted">Add the enemy Riot IDs you know (GameName#Tag), in any order and without roles: UNIIVERSE works out each player&apos;s likely role and picks from their own games. Names without a tag are kept for the match record. None at all is fine.</p>
              <EnemyNamesInput value={enemies} onChange={setEnemies} />
            </Disclosure>
          ) : null}

          {!nextGame ? (
            <Disclosure title="Advanced options" hint={theorycraft ? "theorycraft" : info.formatSelectable ? formats.find((f) => f.id === formatId)?.name : undefined} open={showAdvanced} onToggle={() => setShowAdvanced((v) => !v)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
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
                <label className="flex min-h-11 items-center gap-2 text-sm text-fg-muted sm:self-end">
                  <input type="checkbox" checked={theorycraft} onChange={(e) => setTheorycraft(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)] md:h-4 md:w-4" />
                  Theorycraft (hypothetical; no match record)
                </label>
              </div>
            </Disclosure>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady} className="w-full sm:w-auto">
              {busy ? "Starting…" : nextGame ? `Start game ${nextGame.gameNumber}` : theorycraft ? "Start theorycraft" : bestOf > 1 ? `Start ${seriesLabel(bestOf).toLowerCase()}` : "Start draft"}
            </Button>
            {!lineupReady ? <p className="text-xs text-warn">Assign all five roles on the Team page first.</p> : null}
            {error ? <p className="text-xs text-bad">{error}</p> : null}
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
