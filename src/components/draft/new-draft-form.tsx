"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { COMPETITION_MODES, COMPETITION_MODE_INFO, type CompetitionMode } from "@/domain/competition";
import type { DraftFormat } from "@/domain/draft";
import { createDraftAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export interface NewDraftFormProps {
  lineupReady: boolean;
  formats: DraftFormat[];
  opponents: Array<{ id: string; name: string }>;
  defaultMode?: CompetitionMode;
}

export function NewDraftForm({ lineupReady, formats, opponents, defaultMode = "ranked-flex" }: NewDraftFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<CompetitionMode>(defaultMode);
  const [opponent, setOpponent] = React.useState("");
  const [opponentTeamId, setOpponentTeamId] = React.useState("");
  const [eventName, setEventName] = React.useState("");
  const [side, setSide] = React.useState<"blue" | "red">("blue");
  const [formatId, setFormatId] = React.useState<string>(COMPETITION_MODE_INFO[defaultMode].defaultFormatId);
  const [theorycraft, setTheorycraft] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const info = COMPETITION_MODE_INFO[mode];

  const chooseMode = (m: CompetitionMode) => {
    setMode(m);
    setFormatId(COMPETITION_MODE_INFO[m].defaultFormatId);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const chosenOpponent = opponents.find((o) => o.id === opponentTeamId);
    const res = await createDraftAction({ opponentName: chosenOpponent?.name ?? opponent, side, mode, formatId, isTheorycraft: theorycraft, eventName, opponentTeamId: opponentTeamId || null });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(info.scouting === "none" || theorycraft ? `/draft/${res.data.id}` : `/draft/${res.data.id}/prepare`);
  };

  return (
    <Panel>
      <PanelHeader title="NEW DRAFT" subtitle="Pick the competition mode first: it decides the draft format and how much scouting to expect." />
      <PanelBody>
        <form onSubmit={start} className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {COMPETITION_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className={cn("h-9 rounded-md border px-3 text-sm", mode === m ? "border-accent bg-accent/10 text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:text-fg")}
                title={COMPETITION_MODE_INFO[m].description}
              >
                {COMPETITION_MODE_INFO[m].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-subtle">{info.description}</p>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            {info.scouting === "none" ? (
              <div>
                <Label htmlFor="opponent">Opponent (optional)</Label>
                <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Unknown until champion select" maxLength={60} />
              </div>
            ) : (
              <div>
                <Label htmlFor="opponentTeam">Opponent</Label>
                {opponents.length > 0 ? (
                  <Select id="opponentTeam" value={opponentTeamId} onChange={(e) => setOpponentTeamId(e.target.value)}>
                    <option value="">— type a name below or choose —</option>
                    {opponents.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {!opponentTeamId ? <Input id="opponent" className={opponents.length ? "mt-1.5" : ""} value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent team name (optional)" maxLength={60} /> : null}
              </div>
            )}
            <div>
              <Label htmlFor="event">Event (optional)</Label>
              <Input id="event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={mode === "clash" ? "e.g. Clash Cup Day 2" : "Tournament, league, scrim block…"} maxLength={80} />
            </div>
            <div>
              <Label>Our side</Label>
              <div className="flex gap-1.5">
                {(["blue", "red"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={cn(
                      "h-9 rounded-md border px-4 text-sm font-medium capitalize",
                      side === s ? (s === "blue" ? "border-blue bg-blue/15 text-blue" : "border-red bg-red/15 text-red") : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
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
                <div className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm leading-9 text-fg-muted">{formats.find((f) => f.id === info.defaultFormatId)?.name ?? info.defaultFormatId}</div>
              )}
            </div>
            <label className="flex h-9 items-center gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={theorycraft} onChange={(e) => setTheorycraft(e.target.checked)} className="accent-[var(--color-accent)]" />
              Theorycraft (hypothetical; no match record)
            </label>
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady}>
              {busy ? "Starting…" : info.scouting === "none" && !theorycraft ? "Prepare bans & start" : theorycraft ? "Start theorycraft" : "Scout & prepare"}
            </Button>
          </div>
          {!lineupReady ? <p className="text-xs text-warn">Assign all five roles on the Team page first.</p> : null}
          {error ? <p className="text-xs text-bad">{error}</p> : null}
        </form>
      </PanelBody>
    </Panel>
  );
}
