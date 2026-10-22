"use client";

import * as React from "react";
import { Loader2, PencilLine, Play } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chipClass, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { OUTCOME_LABEL, type Outcome } from "@/domain/clash-scout/mastery-match";
import { DEFAULT_VARIANTS, scenarioOf, VARIANT_LABEL, type LabScenario, type VariantKind, type VariantSpec } from "@/domain/clash-scout/lab";
import { runVariantsAction } from "@/server/actions/clash-lab";
import type { LabRun, VariantRun } from "@/server/clash/lab";
import type { BlindState } from "./blind-test";
import { LabRunView } from "./lab-results";

/*
  OUTDATED DATA: the same test as an older or less precise screen would have shown it, run through
  the same engine and compared with the test as entered. On a blind test each variant is graded
  under both conditions, so what improves or deteriorates is plain; on a manual test nobody knows
  the right answers, so a change is only a change. Growth is the tester's assumption: no rate of
  play is known, and none is invented here.
*/

type Spec = VariantSpec & { on: boolean };

const ORDER: VariantKind[] = ["baseline", "aged", "top-five-change", "reordered", "rounded", "missing", "incomplete", "renamed", "decoys"];

const PRESETS: Array<{ key: string; label: string; kinds: VariantKind[] }> = [
  { key: "all", label: "Everything", kinds: ORDER },
  { key: "time", label: "Time passing", kinds: ["aged", "top-five-change", "reordered"] },
  { key: "precision", label: "Less precise", kinds: ["rounded", "missing", "incomplete"] },
  { key: "identity", label: "Identity", kinds: ["renamed", "decoys"] },
];

function describe(s: Spec, blind: boolean): string {
  switch (s.kind) {
    case "baseline":
      return "The test exactly as entered: what every variant is compared with.";
    case "aged":
      return `Seen ${s.days} days ago; every figure has grown ${s.growth}% since${s.uneven ? " (every other champion twice as much, the others not at all)" : ""}. The growth is your assumption.`;
    case "top-five-change":
      return blind ? `Seen ${s.days} days ago, when the account's sixth champion stood where today's fifth is.` : `Seen ${s.days} days ago with only the first four of today's five (a manual test does not know the sixth).`;
    case "reordered":
      return `Seen ${s.days} days ago, with the second and third champions in the other order.`;
    case "rounded":
      return "Every figure rounded to thousands (175k).";
    case "missing":
      return `The last ${s.count} ${s.count === 1 ? "champion" : "champions"} shown without points.`;
    case "incomplete":
      return `Only the first ${s.count} ${s.count === 1 ? "champion" : "champions"} shown.`;
    case "renamed":
      return "The player has changed their Riot ID since the screens: the name shown is not the one Riot has now.";
    case "decoys":
      return `${s.count} made-up ${s.count === 1 ? "account" : "accounts"} a player in the pool, with the same champions and points within about ${s.spread}%. Controlled pool only.`;
  }
}

/** How decisive an outcome is, for a manual test (no answers known: a change is not better or worse). */
const DECISIVE: Record<Outcome, number> = { verified: 0, strong: 1, partial: 2, ambiguous: 3, unscored: 4, differs: 5, "not-enough": 6, "not-discovered": 7 };

function NumberField({ label, value, min, max, suffix, onChange, disabled }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (n: number) => void; disabled?: boolean }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      {label}
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-20 px-2 tabular-nums"
      />
      {suffix}
    </label>
  );
}

function gradedCell(run: LabRun | null, base: LabRun | null) {
  if (!run?.summary.graded) return <span className="text-fg-subtle">–</span>;
  const g = run.summary.graded;
  const delta = base?.summary.graded ? g.correct - base.summary.graded.correct : 0;
  const wrong = base?.summary.graded ? g.incorrect - base.summary.graded.incorrect : 0;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <span className="tabular-nums text-fg">
        {formatCount(g.correct)}/{formatCount(run.summary.players)}
      </span>
      {g.incorrect ? <span className="text-2xs text-bad">{formatCount(g.incorrect)} wrong</span> : null}
      {g.ambiguous ? <span className="text-2xs text-warn">{formatCount(g.ambiguous)} ambiguous</span> : null}
      {delta > 0 ? <Badge tone="good">+{formatCount(delta)}</Badge> : delta < 0 ? <Badge tone="bad">−{formatCount(-delta)}</Badge> : null}
      {wrong > 0 ? <Badge tone="bad">+{formatCount(wrong)} wrong</Badge> : null}
    </span>
  );
}

function manualChanges(run: LabRun, base: LabRun | null): string[] {
  if (!base) return [];
  const out: string[] = [];
  for (const p of run.players) {
    const b = base.players.find((x) => x.slot === p.slot);
    if (!b) continue;
    const sameTop = (p.candidates[0]?.ref ?? null) === (b.candidates[0]?.ref ?? null);
    if (p.outcome === b.outcome && sameTop) continue;
    const named = (o: Outcome) => o === "strong" || o === "verified";
    const turn = named(p.outcome) && named(b.outcome) && !sameTop ? " (another account named)" : DECISIVE[p.outcome] < DECISIVE[b.outcome] ? " (more decisive)" : DECISIVE[p.outcome] > DECISIVE[b.outcome] ? " (less decisive)" : "";
    out.push(`Player ${p.slot + 1}: ${OUTCOME_LABEL[b.outcome]} → ${OUTCOME_LABEL[p.outcome]}${turn}`);
  }
  return out;
}

export function OutdatedTest({ championMap, scenario, blind, onEdit }: { championMap: ReadonlyMap<string, PickerChampion>; scenario: LabScenario; blind: BlindState | null; onEdit: (s: LabScenario) => void }) {
  // The blind test when there is one, unless the tester chose the manual test.
  const [picked, setSource] = React.useState<"blind" | "manual" | null>(null);
  const source = picked ?? (blind ? "blind" : "manual");
  const [specs, setSpecs] = React.useState<Spec[]>(() => ORDER.map((kind) => ({ ...(DEFAULT_VARIANTS.find((v) => v.kind === kind) ?? { kind }), on: true })));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ runs: VariantRun[]; source: "blind" | "manual"; platform: string; teamName: string } | null>(null);
  const [open, setOpen] = React.useState<VariantKind | null>(null);
  const [view, setView] = React.useState<"discovery" | "controlled">("discovery");

  const usingBlind = source === "blind" && !!blind;
  const base = usingBlind ? blind!.scenario : scenario;
  const named = base.players.filter((p) => p.name.trim()).length;
  const update = (kind: VariantKind, patch: Partial<Spec>) => setSpecs((list) => list.map((s) => (s.kind === kind ? { ...s, ...patch } : s)));
  const chosen = specs.filter((s) => s.on && (s.kind !== "decoys" || usingBlind));

  const run = async () => {
    setBusy(true);
    setError(null);
    const variants = chosen.map(({ on: _on, ...v }) => v);
    const r = await runVariantsAction({ scenario: base, key: usingBlind ? blind!.key : null, variants });
    setBusy(false);
    if (!r.ok) return void setError(r.issues?.length ? `${r.error} Fix them in the ${usingBlind ? "blind" : "manual"} test first.` : r.error);
    setResult({ runs: r.data, source: usingBlind ? "blind" : "manual", platform: base.platform, teamName: base.teamName });
    setOpen(null);
  };

  const baseline = result?.runs.find((r) => r.variant.kind === "baseline") ?? null;
  const opened = result?.runs.find((r) => r.variant.kind === open) ?? null;
  const graded = result?.source === "blind";

  return (
    <div className="space-y-5" data-testid="lab-outdated">
      <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="lab-outdated-title">
        <div>
          <h2 id="lab-outdated-title" className="text-sm font-semibold text-fg">
            Outdated data
          </h2>
          <p className="mt-0.5 max-w-prose text-xs text-fg-muted">The same test as an older or less precise screen would have shown it, through the same engine, side by side with the test as entered. A full Riot ID typed in a manual test is left out here: this is about what mastery alone can tell.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted" id="lab-outdated-source-label">
            Test
          </span>
          <div role="radiogroup" aria-labelledby="lab-outdated-source-label" className={segmentedGroupClass()} data-testid="lab-outdated-source">
            <button type="button" role="radio" aria-checked={usingBlind} disabled={!blind} className={segmentClass(usingBlind, { disabled: !blind })} onClick={() => setSource("blind")} data-testid="lab-outdated-source-blind" title={blind ? undefined : "Generate a blind test first"}>
              The blind test (graded)
            </button>
            <button type="button" role="radio" aria-checked={!usingBlind} className={segmentClass(!usingBlind)} onClick={() => setSource("manual")} data-testid="lab-outdated-source-manual">
              The manual test
            </button>
          </div>
          <span className="text-xs text-fg-subtle">{named ? `${named} ${named === 1 ? "player" : "players"}` : "No players yet"}</span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Presets">
          {PRESETS.map((p) => {
            const active = specs.every((s) => s.kind === "baseline" || s.on === p.kinds.includes(s.kind));
            return (
              <button key={p.key} type="button" className={chipClass(active)} aria-pressed={active} onClick={() => setSpecs((list) => list.map((s) => ({ ...s, on: s.kind === "baseline" || p.kinds.includes(s.kind) })))} data-testid={`lab-preset-${p.key}`}>
                {p.label}
              </button>
            );
          })}
        </div>

        <ul className="divide-y divide-border rounded-md border border-border" data-testid="lab-variants">
          {specs.map((s) => {
            const unavailable = s.kind === "decoys" && !usingBlind;
            const id = `lab-variant-${s.kind}`;
            return (
              <li key={s.kind} className={cn("flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between", unavailable && "opacity-60")} data-testid="lab-variant" data-kind={s.kind}>
                <label htmlFor={id} className="flex min-w-0 flex-1 items-start gap-2.5">
                  <input id={id} type="checkbox" checked={s.kind === "baseline" || (s.on && !unavailable)} disabled={s.kind === "baseline" || unavailable} onChange={(e) => update(s.kind, { on: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
                  <span className="min-w-0">
                    <span className="block text-sm text-fg">{VARIANT_LABEL[s.kind]}</span>
                    <span className="block text-xs text-fg-muted">{unavailable ? "Needs a blind test: the pool of accounts exists only there." : describe(s, usingBlind)}</span>
                  </span>
                </label>
                {!unavailable && s.kind !== "baseline" ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 pl-6 sm:justify-end sm:pl-0">
                    {s.kind === "aged" || s.kind === "top-five-change" || s.kind === "reordered" ? <NumberField label="Days ago" value={s.days ?? 30} min={1} max={730} onChange={(n) => update(s.kind, { days: n })} /> : null}
                    {s.kind === "aged" ? (
                      <>
                        <NumberField label="Growth" value={s.growth ?? 15} min={0} max={500} suffix="%" onChange={(n) => update(s.kind, { growth: n })} />
                        <label className="inline-flex min-h-9 items-center gap-1.5 text-xs text-fg-muted">
                          <input type="checkbox" checked={!!s.uneven} onChange={(e) => update(s.kind, { uneven: e.target.checked })} className="h-4 w-4 accent-accent" />
                          Uneven
                        </label>
                      </>
                    ) : null}
                    {s.kind === "missing" || s.kind === "incomplete" ? <NumberField label={s.kind === "missing" ? "Without points" : "Shown"} value={s.count ?? (s.kind === "missing" ? 2 : 3)} min={1} max={5} onChange={(n) => update(s.kind, { count: n })} /> : null}
                    {s.kind === "decoys" ? (
                      <>
                        <NumberField label="A player" value={s.count ?? 2} min={1} max={4} onChange={(n) => update(s.kind, { count: n })} />
                        <NumberField label="Within" value={s.spread ?? 8} min={1} max={50} suffix="%" onChange={(n) => update(s.kind, { spread: n })} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-fg-muted" aria-live="polite" data-testid="lab-outdated-status">
            {busy ? `Running ${chosen.length} versions of the test${usingBlind ? " under both conditions" : ""}…` : error ? <span className="text-bad">{error}</span> : named ? `${chosen.length} ${chosen.length === 1 ? "version" : "versions"} of the ${usingBlind ? "blind" : "manual"} test.` : usingBlind ? "The blind test has no players." : "Enter players in the manual test, or generate a blind test."}
          </p>
          <Button variant="primary" onClick={() => void run()} disabled={busy || !named} aria-busy={busy} className="shrink-0" data-testid="lab-outdated-run">
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            Run Outdated Data Test
          </Button>
        </div>
      </section>

      {result ? (
        <section className="space-y-3" aria-labelledby="lab-outdated-results-title" data-testid="lab-outdated-results">
          <div>
            <h3 id="lab-outdated-results-title" className="text-sm font-semibold text-fg">
              Compared with the test as entered
            </h3>
            <p className="mt-0.5 text-xs text-fg-muted">{graded ? "Correct answers of each version, under each condition; a badge marks what changed from the test as entered." : "A manual test has no known answers: a change of outcome is shown, never called better or worse."}</p>
          </div>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm" data-testid="lab-outdated-table">
              <thead className="text-2xs uppercase tracking-label text-fg-subtle">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-semibold">Version</th>
                  {graded ? (
                    <>
                      <th className="px-3 py-2 text-right font-semibold">A · Real discovery</th>
                      <th className="px-3 py-2 text-right font-semibold">B · Controlled pool</th>
                    </>
                  ) : (
                    <th className="px-3 py-2 font-semibold">Outcomes</th>
                  )}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {result.runs.map((r) => {
                  const changes = graded ? [] : manualChanges(r.discovery, baseline?.discovery ?? null);
                  const outcomes = Object.entries(r.discovery.summary.outcomes) as Array<[Outcome, number]>;
                  return (
                    <tr key={r.variant.kind} className={cn("border-t border-border/60 align-top", open === r.variant.kind && "bg-surface-2/50")} data-testid="lab-outdated-row" data-kind={r.variant.kind}>
                      <th scope="row" className="px-3 py-2 text-xs font-medium text-fg">
                        {VARIANT_LABEL[r.variant.kind]}
                      </th>
                      {graded ? (
                        <>
                          <td className="px-3 py-2 text-right text-xs">{gradedCell(r.discovery, r.variant.kind === "baseline" ? null : (baseline?.discovery ?? null))}</td>
                          <td className="px-3 py-2 text-right text-xs">{gradedCell(r.controlled, r.variant.kind === "baseline" ? null : (baseline?.controlled ?? null))}</td>
                        </>
                      ) : (
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          <span className="block">{outcomes.map(([o, n]) => `${formatCount(n)} ${OUTCOME_LABEL[o].toLowerCase()}`).join(" · ")}</span>
                          {r.variant.kind !== "baseline" ? (changes.length ? changes.map((c) => <span key={c} className="block text-fg">{c}</span>) : <span className="block text-fg-subtle">No change</span>) : null}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" aria-expanded={open === r.variant.kind} onClick={() => setOpen(open === r.variant.kind ? null : r.variant.kind)} data-testid="lab-outdated-details">
                            {open === r.variant.kind ? "Hide" : "Details"}
                          </Button>
                          <Button size="sm" variant="ghost" title="An editable copy of this version in the manual test (no answers)" aria-label={`Open ${VARIANT_LABEL[r.variant.kind]} in the manual test`} onClick={() => onEdit(scenarioOf(r.inputs, result.platform, `${result.teamName || "Test"} · ${VARIANT_LABEL[r.variant.kind]}`))} data-testid="lab-outdated-edit">
                            <PencilLine className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {opened ? (
            <div className="space-y-3" data-testid="lab-outdated-opened">
              {graded && opened.controlled ? (
                <div role="tablist" aria-label="Condition" className={segmentedGroupClass("w-full sm:w-auto")}>
                  {(["discovery", "controlled"] as const).map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={view === k} className={cn(segmentClass(view === k), "flex-1 sm:flex-none")} onClick={() => setView(k)}>
                      {k === "discovery" ? "A · Real discovery" : "B · Controlled pool"}
                    </button>
                  ))}
                </div>
              ) : null}
              <LabRunView
                run={graded && view === "controlled" && opened.controlled ? opened.controlled : opened.discovery}
                inputs={opened.inputs}
                championMap={championMap}
                title={`${VARIANT_LABEL[opened.variant.kind]}${graded ? (view === "controlled" ? " · B · Controlled pool" : " · A · Real discovery") : ""}`}
                caveat={graded && view === "controlled" ? "By mastery alone, against the test's pool: never evidence that Clash Scout can discover arbitrary opponents." : undefined}
                graded={graded}
                testId="lab-outdated-run-view"
                fileName={`clash-lab-outdated-${opened.variant.kind}-${new Date().toISOString().slice(0, 10)}.json`}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

