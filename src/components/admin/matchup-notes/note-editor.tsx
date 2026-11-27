"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { LEVEL_LABELS, MAX_POINTS, MAX_SOURCES, SOURCE_KINDS, scopeChampions, validateNote, type NoteInput, type NoteLevels, type NoteProblem, type SourceKind } from "@/domain/matchup/notes";
import { ROLES, type Role } from "@/domain/roles";
import { saveMatchupNoteAction } from "@/server/actions/matchup-notes";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RoleSegmented, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

/*
  Matchup Intel's note editor (Admin → Platform Settings → Matchup notes; docs/MATCHUP_INTEL.md,
  "Reviewed notes"): the scope (an opponent in a role, or a pairing), one to four points each naming
  the abilities it rests on, an optional level tag, and the sources. Checked here as it is typed with
  the server's own rules (domain/matchup/notes validateNote: the refused words with why, 35 words a
  point, an https address), and again on the server, which also refuses a member's or player's name.
  Save draft keeps it off the band; Publish records the review on the current patch.
*/

const SLOTS = ["P", "Q", "W", "E", "R"] as const;

function Problems({ list, field }: { list: NoteProblem[]; field: string }) {
  const mine = list.filter((p) => p.field === field);
  if (!mine.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-bad" data-testid="matchup-editor-problem" data-field={field}>
      {mine.map((p, i) => (
        <li key={i}>{p.message}</li>
      ))}
    </ul>
  );
}

export function NoteEditor({ id, initial, champions, currentPatch, onClose, onSaved }: { id: string | null; initial: NoteInput; champions: Array<{ id: string; name: string }>; currentPatch: string | null; onClose: () => void; onSaved: (published: boolean) => void }) {
  const [input, setInput] = React.useState<NoteInput>(() => ({ ...initial, sources: initial.sources.map((s) => ({ ...s, patch: s.patch || currentPatch || "" })) }));
  const [serverProblems, setServerProblems] = React.useState<NoteProblem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const names = React.useMemo(() => new Map(champions.map((c) => [c.id, c.name])), [champions]);
  const roster = React.useMemo(() => new Set(champions.map((c) => c.id)), [champions]);
  const scope = scopeChampions(input).filter((c) => roster.has(c));
  // In the browser every champion on the roster has its five slots; the server checks the stored kits and the names.
  const local = validateNote(input, { kits: Object.fromEntries(scope.map((c) => [c, SLOTS])), roster, names: [] });
  const problems = tried ? [...local, ...serverProblems.filter((p) => !local.some((l) => l.field === p.field && l.message === p.message))] : [];
  const set = (patch: Partial<NoteInput>) => {
    setServerProblems([]);
    setInput((now) => ({ ...now, ...patch }));
  };
  const setPoint = (i: number, patch: Partial<NoteInput["points"][number]>) => set({ points: input.points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const setSource = (i: number, patch: Partial<NoteInput["sources"][number]>) => set({ sources: input.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const save = async (publish: boolean) => {
    setTried(true);
    if (local.length) return;
    setBusy(true);
    const r = await saveMatchupNoteAction(id, input, publish);
    setBusy(false);
    if (r.ok) return onSaved(publish);
    setServerProblems(r.problems.length ? r.problems : [{ field: "scope", message: r.error }]);
  };

  const championOptions = [{ value: "", label: "Choose…" }, ...[...champions].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }))];
  return (
    <Dialog
      open
      size="picker"
      onClose={onClose}
      title={id ? "Edit matchup note" : "New matchup note"}
      description="Observations about the two kits, never advice. Read the League of Legends Wiki only in a browser and cite it: no script reads it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-testid="matchup-editor-cancel">
            Cancel
          </Button>
          <Button onClick={() => void save(false)} disabled={busy} data-testid="matchup-editor-draft">
            Save draft
          </Button>
          <Button variant="primary" onClick={() => void save(true)} disabled={busy} data-testid="matchup-editor-publish">
            Publish{currentPatch ? ` for ${currentPatch}` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-testid="matchup-editor">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-fg">Scope</legend>
          <div role="radiogroup" aria-label="Kind of note" className={segmentedGroupClass()}>
            {(["opponent", "pair"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={input.scope === s} onClick={() => set({ scope: s, championId: s === "pair" ? (input.championId ?? "") : null })} className={segmentClass(input.scope === s, { size: "md" })} data-testid={`matchup-editor-scope-${s}`}>
                {s === "opponent" ? "Every pair against an opponent" : "One pairing"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label-text">Lane</span>
            <RoleSegmented label="Lane" roles={ROLES} value={input.role} onChange={(r) => r && set({ role: r as Role })} compactBelow="always" testId="matchup-editor-role" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input.scope === "pair" ? (
              <div>
                <Label htmlFor="matchup-editor-champion">Champion played</Label>
                <Select id="matchup-editor-champion" value={input.championId ?? ""} onValueChange={(v) => set({ championId: v })} options={championOptions} data-testid="matchup-editor-champion" />
                <Problems list={problems} field="championId" />
              </div>
            ) : null}
            <div>
              <Label htmlFor="matchup-editor-opponent">Lane opponent</Label>
              <Select id="matchup-editor-opponent" value={input.opponentId} onValueChange={(v) => set({ opponentId: v })} options={championOptions} data-testid="matchup-editor-opponent" />
              <Problems list={problems} field="opponentId" />
            </div>
          </div>
          <Problems list={problems} field="scope" />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">Points</legend>
          <Problems list={problems} field="points" />
          {input.points.map((p, i) => (
            <div key={i} className="space-y-2 border-t border-border pt-3" data-testid="matchup-editor-point">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`matchup-point-${i}`}>Point {i + 1}</Label>
                  <Textarea id={`matchup-point-${i}`} rows={2} value={p.text} onChange={(e) => setPoint(i, { text: e.target.value })} data-testid="matchup-editor-text" />
                </div>
                {input.points.length > 1 ? (
                  <Button size="sm" variant="ghost" aria-label={`Remove point ${i + 1}`} onClick={() => set({ points: input.points.filter((_, k) => k !== i) })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
              <Problems list={problems} field={`points.${i}`} />
              <div className="space-y-1">
                <p className="label-text">The abilities it rests on</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {scope.map((c) => (
                    <div key={c} role="group" aria-label={`${names.get(c) ?? c}'s abilities`} className="flex items-center gap-1">
                      <span className="text-xs text-fg-muted">{names.get(c) ?? c}</span>
                      {SLOTS.map((slot) => {
                        const ref = `${c}.${slot}`;
                        const on = p.refs.includes(ref);
                        return (
                          <button key={slot} type="button" aria-pressed={on} onClick={() => setPoint(i, { refs: on ? p.refs.filter((r) => r !== ref) : [...p.refs, ref] })} className={cn("grid h-8 w-8 place-items-center rounded-md border text-xs font-bold pointer-coarse:h-11 pointer-coarse:w-11", on ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong")} aria-label={`${names.get(c) ?? c} ${slot === "P" ? "passive" : slot}`} data-testid="matchup-editor-ref" data-ref={ref}>
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <Problems list={problems} field={`points.${i}.refs`} />
              </div>
              <div className="max-w-xs">
                <Label htmlFor={`matchup-levels-${i}`}>Levels</Label>
                <Select id={`matchup-levels-${i}`} value={p.levels ?? ""} onValueChange={(v) => setPoint(i, { levels: (v || null) as NoteLevels })} options={[{ value: "", label: "Any" }, ...Object.entries(LEVEL_LABELS).map(([k, label]) => ({ value: k, label }))]} />
              </div>
            </div>
          ))}
          {input.points.length < MAX_POINTS ? (
            <Button size="sm" variant="ghost" onClick={() => set({ points: [...input.points, { text: "", refs: [], levels: null }] })} data-testid="matchup-editor-add-point">
              <Plus className="h-4 w-4" aria-hidden />
              Add a point
            </Button>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">Sources</legend>
          <Problems list={problems} field="sources" />
          {input.sources.map((s, i) => (
            <div key={i} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2" data-testid="matchup-editor-source">
              <div>
                <Label htmlFor={`matchup-source-kind-${i}`}>Kind</Label>
                <Select id={`matchup-source-kind-${i}`} value={s.kind} onValueChange={(v) => setSource(i, { kind: v as SourceKind })} options={Object.entries(SOURCE_KINDS).map(([k, label]) => ({ value: k, label }))} />
              </div>
              <div>
                <Label htmlFor={`matchup-source-patch-${i}`}>Patch read on</Label>
                <Input id={`matchup-source-patch-${i}`} value={s.patch} onChange={(e) => setSource(i, { patch: e.target.value })} placeholder={currentPatch ?? "26.23"} />
                <Problems list={problems} field={`sources.${i}.patch`} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`matchup-source-title-${i}`}>Title</Label>
                <Input id={`matchup-source-title-${i}`} value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} data-testid="matchup-editor-source-title" />
                <Problems list={problems} field={`sources.${i}.title`} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`matchup-source-url-${i}`}>Address (optional)</Label>
                <Input id={`matchup-source-url-${i}`} value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} placeholder="https://" inputMode="url" />
                <Problems list={problems} field={`sources.${i}.url`} />
              </div>
              {input.sources.length > 1 ? (
                <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => set({ sources: input.sources.filter((_, k) => k !== i) })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove this source
                </Button>
              ) : null}
            </div>
          ))}
          {input.sources.length < MAX_SOURCES ? (
            <Button size="sm" variant="ghost" onClick={() => set({ sources: [...input.sources, { kind: "client", title: "", url: "", patch: currentPatch ?? "" }] })}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a source
            </Button>
          ) : null}
        </fieldset>

        <section aria-label="Preview" className="space-y-1 border-t border-border pt-3" data-testid="matchup-editor-preview">
          <p className="label-text">Preview, as the band shows it</p>
          <ul className="space-y-1">
            {input.points
              .filter((p) => p.text.trim())
              .map((p, i) => (
                <li key={i} className="text-sm text-fg">
                  {p.levels ? <span className="label-text mr-1.5 text-fg-subtle">{LEVEL_LABELS[p.levels]}</span> : null}
                  {p.text.trim()} <span className="text-xs text-fg-muted">{p.refs.map((r) => `${names.get(r.split(".")[0]!) ?? r.split(".")[0]} ${r.split(".")[1] === "P" ? "passive" : r.split(".")[1]}`).join(", ")}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
