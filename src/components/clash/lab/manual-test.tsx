"use client";

import * as React from "react";
import { BookmarkPlus, FileDown, FileUp, Loader2, Play, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { ChampionPicker, type PickerChampion } from "@/components/champion-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { formatDayMonth } from "@/lib/format";
import { opggRegion } from "@/domain/opgg";
import { emptyScenario, exampleScenario, exportScenario, LAB_CHAMPIONS, parseMasteryLines, parseScenario, type LabInput, type LabIssue, type LabScenario } from "@/domain/clash-scout/lab";
import { readLabFileAction, runManualTestAction } from "@/server/actions/clash-lab";
import type { LabRun } from "@/server/clash/lab";
import { LabRunView } from "./lab-results";
import { PlayerEditor } from "./player-editor";

/*
  MANUAL TEST: up to five opponents as the scouting screens show them, typed or pasted, run
  through the real pipeline (discovery by name on the chosen server, Riot's figures, the rules).
  The test lives in this page only: "Keep a copy" keeps versions while the page is open, and a
  test file is saved or opened only when the tester asks.
*/

interface Copy {
  id: number;
  label: string;
  scenario: LabScenario;
}

interface ManualResult {
  run: LabRun;
  inputs: LabInput[];
  /** The test as it was run, to tell when it has changed since. */
  ran: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The same checks as the server's, in this browser (at the time they are asked for). */
const issuesOf = (s: LabScenario, champions: ReadonlyMap<string, unknown>) => parseScenario(s, Date.now(), (id) => champions.has(id)).issues;

function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ManualTest({ champions, championMap, platforms, scenario, onScenario, standIn }: { champions: PickerChampion[]; championMap: ReadonlyMap<string, PickerChampion>; platforms: string[]; scenario: LabScenario; onScenario: (s: LabScenario) => void; standIn: boolean }) {
  const [result, setResult] = React.useState<ManualResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The entries that need a look, for the test they were found in (checked when a run is asked for, then at each change).
  const [checked, setChecked] = React.useState<{ scenario: LabScenario; issues: LabIssue[] } | null>(null);
  const [picker, setPicker] = React.useState<{ slot: number; index: number } | null>(null);
  const [paste, setPaste] = React.useState<{ slot: number; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [copies, setCopies] = React.useState<Copy[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);
  const copyId = React.useRef(0);

  const issues = checked?.scenario === scenario ? checked.issues : [];
  const named = scenario.players.filter((p) => p.name.trim()).length;
  const stale = result !== null && result.ran !== JSON.stringify(scenario);

  const check = (s: LabScenario) => issuesOf(s, championMap);
  const replace = (next: LabScenario) => {
    onScenario(next);
    if (checked) setChecked({ scenario: next, issues: check(next) });
  };
  const setPlayer = (slot: number, next: LabScenario["players"][number]) => replace({ ...scenario, players: scenario.players.map((p, i) => (i === slot ? next : p)) });

  const run = async () => {
    setError(null);
    const found = check(scenario);
    setChecked({ scenario, issues: found });
    if (found.length) return;
    setBusy(true);
    const r = await runManualTestAction(scenario);
    setBusy(false);
    if (!r.ok) {
      if (r.issues) setChecked({ scenario, issues: r.issues });
      setError(r.error);
      return;
    }
    setResult({ run: r.data.run, inputs: r.data.inputs, ran: JSON.stringify(scenario) });
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsRef.current?.focus({ preventScroll: true });
    });
  };

  const keepCopy = () => {
    const id = ++copyId.current;
    const label = `${scenario.teamName.trim() || "Test"} · ${named} ${named === 1 ? "player" : "players"} · copy ${id}`;
    setCopies((c) => [{ id, label, scenario: structuredClone(scenario) }, ...c].slice(0, 12));
    toast.success("Copy kept for as long as this page is open.");
  };

  const importFile = async (file: File) => {
    if (file.size > 200_000) return void toast.error("This file is too large to be a Testing Lab file.");
    const r = await readLabFileAction(await file.text());
    if (!r.ok) return void toast.error(r.error);
    replace(r.data);
    toast.success("Test opened from the file.");
  };

  const pickerPlayer = picker ? scenario.players[picker.slot] : null;
  const usedByPlayer = React.useMemo(() => new Set(pickerPlayer ? pickerPlayer.champions.filter((c, i) => c.championId && i !== picker?.index).map((c) => c.championId!) : []), [pickerPlayer, picker?.index]);
  const pastePreview = React.useMemo(() => (paste ? parseMasteryLines(paste.text, champions) : null), [paste, champions]);

  const applyPaste = () => {
    if (!paste || !pastePreview) return;
    const p = scenario.players[paste.slot]!;
    // A first line that is no champion and has no figure is the name ("Copy as text" writes it first).
    const first = paste.text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    const nameLine = pastePreview.unknown[0] === first && !/\d/.test(first) ? first : null;
    const entries = Array.from({ length: LAB_CHAMPIONS }, (_, i) => pastePreview.entries[i] ?? { championId: null, points: "" });
    setPlayer(paste.slot, { ...p, name: nameLine && !p.name.trim() ? nameLine : p.name, champions: entries });
    const unknown = pastePreview.unknown.filter((u) => u !== nameLine);
    if (unknown.length) toast.warning(`Not read as champions: ${unknown.slice(0, 4).join(", ")}${unknown.length > 4 ? "…" : ""}`);
    setPaste(null);
  };

  return (
    <div className="space-y-5" data-testid="lab-manual">
      <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="lab-setup-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="lab-setup-title" className="text-sm font-semibold text-fg">
              Manual test
            </h2>
            <p className="mt-0.5 text-xs text-fg-muted">Type what the scouting screens show for up to five opponents: the name (no tag needed) and the five champions with the most mastery. Incomplete players are fine.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => replace(exampleScenario(scenario.platform))} data-testid="lab-example">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Example data
            </Button>
            <Button size="sm" variant="ghost" onClick={keepCopy} disabled={!named} data-testid="lab-keep-copy" title="Keep this version to come back to while the page is open">
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden /> Keep a copy
            </Button>
            {copies.length ? (
              <Menu
                label="Copies kept"
                testId="lab-copies"
                trigger={(t) => (
                  <Button {...t} size="sm" variant="ghost" data-testid="lab-copies-button">
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Copies ({copies.length})
                  </Button>
                )}
              >
                <MenuLabel>Open a copy (this page only)</MenuLabel>
                {copies.map((c) => (
                  <MenuItem key={c.id} onSelect={() => replace(structuredClone(c.scenario))}>
                    {c.label}
                  </MenuItem>
                ))}
              </Menu>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => save(`clash-lab-test-${today()}.json`, exportScenario(scenario))} disabled={!named} data-testid="lab-export" title="Save this test as a file on this device">
              <FileDown className="h-3.5 w-3.5" aria-hidden /> Save file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} data-testid="lab-import" title="Open a test file saved earlier">
              <FileUp className="h-3.5 w-3.5" aria-hidden /> Open file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              data-testid="lab-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)} data-testid="lab-reset">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,16rem)]">
          <div>
            <Label htmlFor="lab-team">Opponents (optional)</Label>
            <Input id="lab-team" value={scenario.teamName} maxLength={60} placeholder="Their team's name" onChange={(e) => replace({ ...scenario, teamName: e.target.value })} data-testid="lab-team" />
          </div>
          <div>
            <Label htmlFor="lab-server">Server</Label>
            <Select id="lab-server" value={scenario.platform} onChange={(e) => replace({ ...scenario, platform: e.target.value })} data-testid="lab-server">
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {opggRegion(p)?.toUpperCase() ?? p}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor="lab-date">Screens seen on</Label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Input id="lab-date" type="date" value={scenario.referenceDate} max={today()} disabled={scenario.dateUnknown} onChange={(e) => replace({ ...scenario, referenceDate: e.target.value })} className="w-auto min-w-0 flex-1" aria-describedby="lab-date-help" data-testid="lab-date" />
              <label className="inline-flex min-h-9 items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={scenario.dateUnknown} onChange={(e) => replace({ ...scenario, dateUnknown: e.target.checked })} className="h-4 w-4 accent-accent" data-testid="lab-date-unknown" />
                Not known
              </label>
            </div>
            <p id="lab-date-help" className="mt-1 text-2xs text-fg-subtle">
              {scenario.dateUnknown ? "Any growth since is possible: only figures that went down rule an account out." : scenario.referenceDate ? `Points grow after ${formatDayMonth(`${scenario.referenceDate}T12:00:00Z`)}; the rules allow for it.` : "Empty: the screens are from today."}
            </p>
            {issues.find((i) => i.path === "referenceDate") ? <p className="mt-1 text-2xs text-bad">{issues.find((i) => i.path === "referenceDate")!.message}</p> : null}
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" data-testid="lab-players">
        {scenario.players.map((p, slot) => (
          <PlayerEditor
            key={slot}
            slot={slot}
            player={p}
            championMap={championMap}
            issues={issues}
            onChange={(next) => setPlayer(slot, next)}
            onChooseChampion={(index) => setPicker({ slot, index })}
            onCopyTo={(target) => {
              setPlayer(target, structuredClone(p));
              toast.success(`Player ${slot + 1} copied to Player ${target + 1}.`);
            }}
            onPaste={() => setPaste({ slot, text: "" })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-xs text-fg-muted" aria-live="polite" data-testid="lab-run-status">
          {busy
            ? "Running: discovery by name, then Riot's figures for each account found, then the rules."
            : error
              ? <span className="text-bad">{error}</span>
              : issues.length
                ? <span className="text-bad">{issues.length === 1 ? "One entry needs a look." : `${issues.length} entries need a look.`} {issues.find((i) => i.path === "players")?.message ?? ""}</span>
                : named
                  ? `${named} ${named === 1 ? "player" : "players"} to test on ${opggRegion(scenario.platform)?.toUpperCase() ?? scenario.platform}${standIn ? ", against the stand-in" : ""}.`
                  : "Enter at least one player's name."}
        </div>
        <Button variant="primary" onClick={() => void run()} disabled={busy} aria-busy={busy} className="shrink-0" data-testid="lab-run">
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {result && !stale ? "Run again" : "Run Identification Test"}
        </Button>
      </div>

      <div ref={resultsRef} tabIndex={-1} className="scroll-mt-20 outline-none">
        {result ? (
          <div className="space-y-2">
            {stale ? (
              <p className="rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-fg-muted" data-testid="lab-stale">
                The test changed since these results: run it again to see the new ones.
              </p>
            ) : null}
            <LabRunView run={result.run} inputs={result.inputs} championMap={championMap} title="Results" graded={false} testId="lab-manual-results" fileName={`clash-lab-results-${today()}.json`} />
          </div>
        ) : null}
      </div>

      <ChampionPicker
        open={picker !== null}
        title={picker ? `Player ${picker.slot + 1}, champion ${picker.index + 1}` : undefined}
        champions={champions}
        disabledIds={usedByPlayer}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (!picker || !pickerPlayer) return;
          setPlayer(picker.slot, { ...pickerPlayer, champions: pickerPlayer.champions.map((c, i) => (i === picker.index ? { ...c, championId: id } : c)) });
          setPicker(null);
        }}
      />

      <Dialog
        open={paste !== null}
        onClose={() => setPaste(null)}
        title={paste ? `Paste lines for Player ${paste.slot + 1}` : "Paste lines"}
        description="One champion a line, with its points: “Riven 450,000”, “1. Ambessa — 175k”, “Kai'Sa: 120.3k”. A first line without a figure becomes the name."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaste(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={applyPaste} disabled={!pastePreview?.entries.length} data-testid="lab-paste-apply">
              Use {pastePreview?.entries.length ? Math.min(pastePreview.entries.length, LAB_CHAMPIONS) : ""} {pastePreview?.entries.length === 1 ? "line" : "lines"}
            </Button>
          </>
        }
      >
        <Label htmlFor="lab-paste">Lines</Label>
        <Textarea id="lab-paste" rows={7} value={paste?.text ?? ""} onChange={(e) => paste && setPaste({ ...paste, text: e.target.value })} spellCheck={false} data-testid="lab-paste-text" />
        {pastePreview && paste?.text.trim() ? (
          <p className="mt-2 text-xs text-fg-muted" data-testid="lab-paste-preview">
            {pastePreview.entries.length ? `Read: ${pastePreview.entries.slice(0, LAB_CHAMPIONS).map((e) => `${championMap.get(e.championId!)?.name ?? e.championId}${e.points ? ` ${e.points}` : ""}`).join(" · ")}` : "No champion read yet."}
            {pastePreview.unknown.length ? <span className="block text-warn">Not champions: {pastePreview.unknown.slice(0, 4).join(", ")}</span> : null}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the test?"
        description="The five players and these results are cleared. Copies kept and saved files stay."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onScenario(emptyScenario(scenario.platform));
                setChecked(null);
                setResult(null);
                setError(null);
                setConfirmReset(false);
              }}
              data-testid="lab-reset-confirm"
            >
              Reset
            </Button>
          </>
        }
      />
    </div>
  );
}

