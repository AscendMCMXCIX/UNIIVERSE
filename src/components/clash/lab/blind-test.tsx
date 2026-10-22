"use client";

import * as React from "react";
import { Dices, Loader2, Lock, PencilLine, Play } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatCount, formatDateTime, percent } from "@/lib/format";
import type { MasteryRounding } from "@/domain/clash-scout/mastery-input";
import { opggRegion } from "@/domain/opgg";
import { parseScenario, ROUNDING_LABEL, type LabInput, type LabScenario } from "@/domain/clash-scout/lab";
import { generateBlindTestAction, runBlindTestAction } from "@/server/actions/clash-lab";
import type { BlindRun, LabRun } from "@/server/clash/lab";
import { LabRunView } from "./lab-results";

/*
  BLIND TEST: UNIIVERSE picks accounts it already knows on a server (players of the team's
  recorded games, never members), reads their Riot ID and mastery now, and shows the engine only
  what a scouting screen would: the name without its tag, the five champions with the most points,
  the total score. The answers stay sealed on the server; the run is graded afterwards, under two
  conditions always shown apart:
    A  real discovery (the production pipeline: an account it cannot find is a discovery failure);
    B  a controlled pool (the right accounts among others, by mastery alone): never evidence that
       production can discover arbitrary opponents.
*/

export interface BlindOptions {
  platform: string;
  players: number;
  rounding: MasteryRounding;
  includeTotal: boolean;
}

export interface BlindState {
  /** The screens as the editor shows them: names and figures, no answers. */
  scenario: LabScenario;
  /** The sealed answers (opaque here). */
  key: string;
  generatedAt: number;
  skipped: number;
  standIn: boolean;
  options: BlindOptions;
  result: { run: BlindRun; inputs: LabInput[]; at: number } | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The figures of a graded run that matter most, side by side for A and B. */
function Comparison({ a, b }: { a: LabRun; b: LabRun }) {
  const rows: Array<{ label: string; of: (r: LabRun) => string }> = [
    { label: "Correct", of: (r) => `${formatCount(r.summary.graded?.correct ?? 0)} of ${formatCount(r.summary.players)}` },
    { label: "Incorrect", of: (r) => formatCount(r.summary.graded?.incorrect ?? 0) },
    { label: "Ambiguous", of: (r) => formatCount(r.summary.graded?.ambiguous ?? 0) },
    { label: "Right account not found", of: (r) => formatCount(r.summary.graded?.notDiscovered ?? 0) },
    { label: "Right account ranked first", of: (r) => formatCount(r.summary.graded?.topRanked ?? 0) },
    { label: "Resolved correctly", of: (r) => (r.summary.players ? percent((r.summary.graded?.correct ?? 0) / r.summary.players, 0) : "–") },
  ];
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface" data-testid="lab-blind-comparison">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <thead className="text-2xs uppercase tracking-label text-fg-subtle">
          <tr className="border-b border-border">
            <th className="px-3 py-2 font-semibold" />
            <th className="px-3 py-2 text-right font-semibold">A · Real discovery</th>
            <th className="px-3 py-2 text-right font-semibold">B · Controlled pool</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <th scope="row" className="px-3 py-1.5 text-xs font-medium text-fg-muted">
                {r.label}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums text-fg">{r.of(a)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-fg">{r.of(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Preview({ scenario, championMap }: { scenario: LabScenario; championMap: ReadonlyMap<string, PickerChampion> }) {
  const players = scenario.players.map((p, slot) => ({ p, slot })).filter(({ p }) => p.name.trim());
  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5" aria-label="What the engine is given" data-testid="lab-blind-preview">
      {players.map(({ p, slot }) => (
        <li key={slot} className="min-w-0 space-y-1.5 rounded-md border border-border bg-surface-2/40 p-2" data-testid="lab-blind-player">
          <p className="min-w-0 truncate text-sm font-medium text-fg">
            <span className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Player {slot + 1}</span> <span lang="">{p.name}</span>
          </p>
          <ul className="space-y-1">
            {p.champions
              .filter((c) => c.championId)
              .map((c) => {
                const champ = championMap.get(c.championId!);
                return (
                  <li key={c.championId} className="flex min-w-0 items-center gap-1.5 text-xs">
                    <ChampionPortrait champion={champ ?? null} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-fg">{champ?.name ?? c.championId}</span>
                    <span className="tabular-nums text-fg-muted">{c.points || "–"}</span>
                  </li>
                );
              })}
          </ul>
          {p.totalScore ? <p className="text-2xs text-fg-subtle">Total mastery {p.totalScore}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function BlindTest({ championMap, platforms, defaultPlatform, state, onState, onEdit }: { championMap: ReadonlyMap<string, PickerChampion>; platforms: string[]; defaultPlatform: string; state: BlindState | null; onState: (s: BlindState | null) => void; onEdit: (s: LabScenario) => void }) {
  const [options, setOptions] = React.useState<BlindOptions>({ platform: defaultPlatform, players: 5, rounding: "client", includeTotal: true });
  const [busy, setBusy] = React.useState<"generate" | "run" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"discovery" | "controlled">("discovery");
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const generate = async () => {
    setBusy("generate");
    setError(null);
    const r = await generateBlindTestAction(options);
    setBusy(null);
    if (!r.ok) return void setError(r.error);
    onState({ scenario: r.data.scenario, key: r.data.key, generatedAt: Date.now(), skipped: r.data.skipped, standIn: r.data.standIn, options, result: null });
  };

  const run = async () => {
    if (!state) return;
    setBusy("run");
    setError(null);
    const r = await runBlindTestAction({ scenario: state.scenario, key: state.key });
    setBusy(null);
    if (!r.ok) return void setError(r.error);
    const inputs = parseScenario(state.scenario, Date.now()).inputs;
    onState({ ...state, result: { run: r.data, inputs, at: Date.now() } });
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsRef.current?.focus({ preventScroll: true });
    });
  };

  const players = state ? state.scenario.players.filter((p) => p.name.trim()).length : 0;

  return (
    <div className="space-y-5" data-testid="lab-blind">
      <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="lab-blind-title">
        <div>
          <h2 id="lab-blind-title" className="text-sm font-semibold text-fg">
            Blind test
          </h2>
          <p className="mt-0.5 max-w-prose text-xs text-fg-muted">
            UNIIVERSE picks accounts it already knows on the server (players of your team&apos;s recorded games, never members), reads their Riot ID and mastery now, and gives the engine only what a scouting screen shows: the name without its tag and the five champions with the most points. The answers stay sealed on the server and are opened only to grade the run.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[8rem_auto_minmax(0,16rem)_minmax(0,1fr)] lg:items-end">
          <div>
            <Label htmlFor="lab-blind-server">Server</Label>
            <Select id="lab-blind-server" value={options.platform} onChange={(e) => setOptions({ ...options, platform: e.target.value })} data-testid="lab-blind-server">
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {opggRegion(p)?.toUpperCase() ?? p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span id="lab-blind-players-label" className="mb-1 block text-xs font-medium text-fg-muted">
              Players
            </span>
            <div role="radiogroup" aria-labelledby="lab-blind-players-label" className={segmentedGroupClass()} data-testid="lab-blind-players">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={options.players === n} className={cn(segmentClass(options.players === n), "min-w-9")} onClick={() => setOptions({ ...options, players: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="lab-blind-rounding">Figures</Label>
            <Select id="lab-blind-rounding" value={options.rounding} onChange={(e) => setOptions({ ...options, rounding: e.target.value as MasteryRounding })} data-testid="lab-blind-rounding">
              {(Object.keys(ROUNDING_LABEL) as MasteryRounding[]).map((r) => (
                <option key={r} value={r}>
                  {ROUNDING_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <Switch id="lab-blind-total" checked={options.includeTotal} onChange={(v) => setOptions({ ...options, includeTotal: v })} label="Show the total mastery score" description="The scouting screen shows it; leave it out to test without it" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-fg-muted" aria-live="polite" data-testid="lab-blind-status">
            {busy === "generate" ? "Choosing accounts and reading their figures from Riot…" : busy === "run" ? "Running both conditions…" : error ? <span className="text-bad">{error}</span> : state ? null : "Nothing is stored: the test lives in this page until you leave it."}
          </p>
          <Button variant={state ? "secondary" : "primary"} onClick={() => void generate()} disabled={busy !== null} aria-busy={busy === "generate"} className="shrink-0" data-testid="lab-blind-generate">
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Dices className="h-4 w-4" aria-hidden />}
            {state ? "Generate another" : "Generate Test"}
          </Button>
        </div>
      </section>

      {state ? (
        <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="lab-blind-test-title" data-testid="lab-blind-test">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="lab-blind-test-title" className="text-sm font-semibold text-fg">
                The test: {players} {players === 1 ? "player" : "players"} on {opggRegion(state.options.platform)?.toUpperCase() ?? state.options.platform}
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
                <Lock className="h-3 w-3" aria-hidden /> Answers sealed on the server, good for a day · generated {formatDateTime(state.generatedAt)}
                {state.skipped ? ` · ${formatCount(state.skipped)} ${state.skipped === 1 ? "account" : "accounts"} set aside (gone, or too few champions)` : ""}
                {state.standIn ? " · stand-in data" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => onEdit(state.scenario)} title="An editable copy of these screens, without the answers: results there are not graded" data-testid="lab-blind-edit">
                <PencilLine className="h-3.5 w-3.5" aria-hidden /> Open in Manual test
              </Button>
              <Button size="sm" variant="primary" onClick={() => void run()} disabled={busy !== null} aria-busy={busy === "run"} data-testid="lab-blind-run">
                {busy === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                {state.result ? "Run again" : "Run Test"}
              </Button>
            </div>
          </div>
          <Preview scenario={state.scenario} championMap={championMap} />
        </section>
      ) : null}

      <div ref={resultsRef} tabIndex={-1} className="scroll-mt-20 space-y-3 outline-none">
        {state?.result ? (
          <>
            <h3 className="text-sm font-semibold text-fg">Results, graded after the run</h3>
            <Comparison a={state.result.run.discovery} b={state.result.run.controlled} />
            <div role="tablist" aria-label="Condition" className={segmentedGroupClass("w-full sm:w-auto")} data-testid="lab-blind-conditions">
              {(["discovery", "controlled"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={view === k} className={cn(segmentClass(view === k), "flex-1 sm:flex-none")} onClick={() => setView(k)} data-testid={`lab-blind-view-${k}`}>
                  {k === "discovery" ? "A · Real discovery" : "B · Controlled pool"}
                </button>
              ))}
            </div>
            {view === "discovery" ? (
              <LabRunView
                run={state.result.run.discovery}
                inputs={state.result.inputs}
                championMap={championMap}
                title="A · Real discovery"
                caveat="Exactly what Clash Scout does: discovery by name on the server, then Riot's figures and the rules. A right account it cannot find counts as a discovery failure."
                graded
                testId="lab-blind-results-discovery"
                fileName={`clash-lab-blind-a-${today()}.json`}
              />
            ) : (
              <LabRunView
                run={state.result.run.controlled}
                inputs={state.result.inputs}
                championMap={championMap}
                title="B · Controlled pool"
                caveat="The same screens against one pool (this test's accounts and others who played the same champions with or against your team), by mastery alone. It shows whether the rules pick the right account when it is there. It is not evidence that Clash Scout can discover arbitrary opponents."
                graded
                testId="lab-blind-results-controlled"
                fileName={`clash-lab-blind-b-${today()}.json`}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
