"use client";

import * as React from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { LEVEL_LABELS, MAX_POINTS, MAX_SOURCES, SOURCE_KINDS, rescope, scopeChampions, validateNote, type NoteInput, type NoteLevels, type NoteProblem, type SourceKind } from "@/domain/matchup/notes";
import { ROLES, type Role } from "@/domain/roles";
import { saveMatchupNoteAction } from "@/server/actions/matchup-notes";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DetailModal } from "@/components/ui/detail-modal";
import { tabIndicatorClass } from "@/components/ui/tab-bar";
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
  Save draft keeps it off the band; Publish records the review on the current patch. A change of
  scope, champion or opponent keeps only the refs of champions still in it (domain rescope): the
  toggles are drawn for those champions alone, so any other ref could be neither seen nor removed.

  On a desktop window (the one-screen workspace, docs/RESPONSIVE.md, "One-screen desktop pages",
  Matchup notes) the editor is a workspace window (the window less 1rem above and below, 76rem wide:
  DetailModal's workspace size at the game's width) whose body never scrolls at the owner's sizes: its parts
  are three tabs (Scope and points, Sources, Preview), the scope on one line, the points two by two
  and the sources two by two, each point's text as tall as its words (field-sizing), so four points
  or six sources fit. A tab holding a problem says so, and a refused save opens the first such tab.
  Elsewhere it is the dialog as before, its parts one under the other in one scrolling body.
*/

/** A wrapper in the workspace's layout; in the flow its children as they were (no box: the flow's spacing reaches them). */
function WsBox({ ws, className, children }: { ws: boolean; className: string; children: React.ReactNode }) {
  return ws ? <div className={className}>{children}</div> : <>{children}</>;
}

type Part = "points" | "sources" | "preview";
const PARTS: ReadonlyArray<{ id: Part; label: string }> = [
  { id: "points", label: "Scope and points" },
  { id: "sources", label: "Sources" },
  { id: "preview", label: "Preview" },
];
/** The tab a problem's field is on. */
const partOf = (field: string): Part => (field === "sources" || field.startsWith("sources.") ? "sources" : "points");

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

export function NoteEditor({ id, initial, champions, currentPatch, onClose, onSaved, workspace = false }: { id: string | null; initial: NoteInput; champions: Array<{ id: string; name: string }>; currentPatch: string | null; onClose: () => void; onSaved: (published: boolean) => void; /** The one-screen workspace: the wide window with its parts in tabs. */ workspace?: boolean }) {
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
  /** The scope, the champion played or the opponent changed: refs to a champion no longer in the note go. */
  const setScope = (patch: Partial<Pick<NoteInput, "scope" | "opponentId" | "championId">>) => {
    setServerProblems([]);
    setInput((now) => rescope(now, patch));
  };
  const setPoint = (i: number, patch: Partial<NoteInput["points"][number]>) => set({ points: input.points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const setSource = (i: number, patch: Partial<NoteInput["sources"][number]>) => set({ sources: input.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const [part, setPart] = React.useState<Part>("points");
  const save = async (publish: boolean) => {
    setTried(true);
    // Refused here: in the workspace, the first tab with a problem opens.
    if (local.length) return void setPart(partOf(local[0]!.field));
    setBusy(true);
    const r = await saveMatchupNoteAction(id, input, publish);
    setBusy(false);
    if (r.ok) return onSaved(publish);
    const found = r.problems.length ? r.problems : [{ field: "scope", message: r.error }];
    setServerProblems(found);
    setPart(partOf(found[0]!.field));
  };

  const championOptions = [{ value: "", label: "Choose…" }, ...[...champions].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }))];
  const title = id ? "Edit matchup note" : "New matchup note";
  const description = "Observations about the two kits, never advice. Read the League of Legends Wiki only in a browser and cite it: no script reads it.";
  const footer = (
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
  );
  // ws: the workspace's compact layout of the same fields (the scope on one line, the points and the sources two by two).
  const ws = workspace;

  const scopeFields = (
    <fieldset className={ws ? "space-y-1" : "space-y-2"}>
      <legend className="text-sm font-semibold text-fg">Scope</legend>
      <WsBox ws={ws} className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div role="radiogroup" aria-label="Kind of note" className={segmentedGroupClass()}>
          {(["opponent", "pair"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={input.scope === s} onClick={() => setScope({ scope: s, championId: s === "pair" ? (input.championId ?? "") : null })} className={segmentClass(input.scope === s, { size: "md" })} data-testid={`matchup-editor-scope-${s}`}>
              {s === "opponent" ? "Every pair against an opponent" : "One pairing"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label-text">Lane</span>
          <RoleSegmented label="Lane" roles={ROLES} value={input.role} onChange={(r) => r && set({ role: r as Role })} compactBelow="always" testId="matchup-editor-role" />
        </div>
        <div className={ws ? "grid min-w-0 flex-1 basis-96 gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
          {input.scope === "pair" ? (
            <div>
              <Label htmlFor="matchup-editor-champion">Champion played</Label>
              <Select id="matchup-editor-champion" value={input.championId ?? ""} onValueChange={(v) => setScope({ championId: v })} options={championOptions} data-testid="matchup-editor-champion" />
              <Problems list={problems} field="championId" />
            </div>
          ) : null}
          <div>
            <Label htmlFor="matchup-editor-opponent">Lane opponent</Label>
            <Select id="matchup-editor-opponent" value={input.opponentId} onValueChange={(v) => setScope({ opponentId: v })} options={championOptions} data-testid="matchup-editor-opponent" />
            <Problems list={problems} field="opponentId" />
          </div>
        </div>
      </WsBox>
      <Problems list={problems} field="scope" />
    </fieldset>
  );

  const addPoint =
    input.points.length < MAX_POINTS ? (
      <Button size="sm" variant="ghost" onClick={() => set({ points: [...input.points, { text: "", refs: [], levels: null }] })} data-testid="matchup-editor-add-point">
        <Plus className="h-4 w-4" aria-hidden />
        Add a point
      </Button>
    ) : null;
  const pointFields = (
    <fieldset className="space-y-3">
      <legend className={ws ? "flex w-full items-center justify-between gap-3 text-sm font-semibold text-fg" : "text-sm font-semibold text-fg"}>
        Points
        {ws ? addPoint : null}
      </legend>
      <Problems list={problems} field="points" />
      <WsBox ws={ws} className="grid grid-cols-2 gap-x-6 gap-y-3">
        {input.points.map((p, i) => (
          <div key={i} className={ws ? "space-y-1.5 border-t border-border pt-2" : "space-y-2 border-t border-border pt-3"} data-testid="matchup-editor-point">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {ws ? (
                  // The workspace: the point's label and its levels on one line, its text as tall as its words.
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`matchup-point-${i}`}>Point {i + 1}</Label>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`matchup-levels-${i}`} className="text-xs font-medium text-fg-muted">
                        Levels
                      </label>
                      <Select id={`matchup-levels-${i}`} value={p.levels ?? ""} onValueChange={(v) => setPoint(i, { levels: (v || null) as NoteLevels })} options={[{ value: "", label: "Any" }, ...Object.entries(LEVEL_LABELS).map(([k, label]) => ({ value: k, label }))]} className="w-40" />
                    </div>
                  </div>
                ) : (
                  <Label htmlFor={`matchup-point-${i}`}>Point {i + 1}</Label>
                )}
                <Textarea id={`matchup-point-${i}`} rows={2} value={p.text} onChange={(e) => setPoint(i, { text: e.target.value })} className={ws ? "mt-1 field-sizing-content" : undefined} data-testid="matchup-editor-text" />
              </div>
              {input.points.length > 1 ? (
                <Button size="sm" variant="ghost" aria-label={`Remove point ${i + 1}`} onClick={() => set({ points: input.points.filter((_, k) => k !== i) })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            <Problems list={problems} field={`points.${i}`} />
            <div className="space-y-1">
              <p className={ws ? "sr-only" : "label-text"}>The abilities it rests on</p>
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
            {ws ? null : (
              <div className="max-w-xs">
                <Label htmlFor={`matchup-levels-${i}`}>Levels</Label>
                <Select id={`matchup-levels-${i}`} value={p.levels ?? ""} onValueChange={(v) => setPoint(i, { levels: (v || null) as NoteLevels })} options={[{ value: "", label: "Any" }, ...Object.entries(LEVEL_LABELS).map(([k, label]) => ({ value: k, label }))]} />
              </div>
            )}
          </div>
        ))}
      </WsBox>
      {ws ? null : addPoint}
    </fieldset>
  );

  const addSource =
    input.sources.length < MAX_SOURCES ? (
      <Button size="sm" variant="ghost" onClick={() => set({ sources: [...input.sources, { kind: "client", title: "", url: "", patch: currentPatch ?? "" }] })}>
        <Plus className="h-4 w-4" aria-hidden />
        Add a source
      </Button>
    ) : null;
  const sourceFields = (
    <fieldset className="space-y-3">
      <legend className={ws ? "flex w-full items-center justify-between gap-3 text-sm font-semibold text-fg" : "text-sm font-semibold text-fg"}>
        Sources
        {ws ? addSource : null}
      </legend>
      <Problems list={problems} field="sources" />
      <WsBox ws={ws} className="grid grid-cols-2 gap-x-6 gap-y-3">
        {input.sources.map((s, i) => (
          <div key={i} className={ws ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 border-t border-border pt-2" : "grid gap-2 border-t border-border pt-3 sm:grid-cols-2"} data-testid="matchup-editor-source">
            <div>
              <Label htmlFor={`matchup-source-kind-${i}`}>Kind</Label>
              <Select id={`matchup-source-kind-${i}`} value={s.kind} onValueChange={(v) => setSource(i, { kind: v as SourceKind })} options={Object.entries(SOURCE_KINDS).map(([k, label]) => ({ value: k, label }))} />
            </div>
            <div>
              <Label htmlFor={`matchup-source-patch-${i}`}>Patch read on</Label>
              <Input id={`matchup-source-patch-${i}`} value={s.patch} onChange={(e) => setSource(i, { patch: e.target.value })} placeholder={currentPatch ?? "26.23"} />
              <Problems list={problems} field={`sources.${i}.patch`} />
            </div>
            {ws ? (
              input.sources.length > 1 ? (
                <Button size="sm" variant="ghost" className="mt-6" aria-label={`Remove source ${i + 1}`} onClick={() => set({ sources: input.sources.filter((_, k) => k !== i) })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <span />
              )
            ) : null}
            <WsBox ws={ws} className="col-span-3 grid grid-cols-2 gap-2">
              <div className={ws ? undefined : "sm:col-span-2"}>
                <Label htmlFor={`matchup-source-title-${i}`}>Title</Label>
                <Input id={`matchup-source-title-${i}`} value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} data-testid="matchup-editor-source-title" />
                <Problems list={problems} field={`sources.${i}.title`} />
              </div>
              <div className={ws ? undefined : "sm:col-span-2"}>
                <Label htmlFor={`matchup-source-url-${i}`}>Address (optional)</Label>
                <Input id={`matchup-source-url-${i}`} value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} placeholder="https://" inputMode="url" />
                <Problems list={problems} field={`sources.${i}.url`} />
              </div>
            </WsBox>
            {!ws && input.sources.length > 1 ? (
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => set({ sources: input.sources.filter((_, k) => k !== i) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove this source
              </Button>
            ) : null}
          </div>
        ))}
      </WsBox>
      {ws ? null : addSource}
    </fieldset>
  );

  const preview = (
    <section aria-label="Preview" className={ws ? "space-y-1" : "space-y-1 border-t border-border pt-3"} data-testid="matchup-editor-preview">
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
  );

  if (!ws)
    return (
      <Dialog open size="picker" onClose={onClose} title={title} description={description} footer={footer}>
        <div className="space-y-5" data-testid="matchup-editor">
          {scopeFields}
          {pointFields}
          {sourceFields}
          {preview}
        </div>
      </Dialog>
    );

  // The workspace: a workspace window at the game's width, its parts in tabs (every part mounted; the others hidden), a tab with a problem marked.
  const marked = new Set(problems.map((p) => partOf(p.field)));
  return (
    <DetailModal open size="workspace" workspaceWidth="game" onClose={onClose} title={title} description={description} footer={footer} closeTestId="dialog-close" testId="matchup-editor-window">
      <div className="space-y-3" data-testid="matchup-editor">
        <div role="tablist" aria-label="The note's parts" className="flex gap-1 border-b border-border" data-testid="matchup-editor-parts">
          {PARTS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`matchup-editor-tab-${t.id}`}
              aria-selected={part === t.id}
              aria-controls={`matchup-editor-panel-${t.id}`}
              tabIndex={part === t.id ? 0 : -1}
              onClick={() => setPart(t.id)}
              onKeyDown={(e) => {
                const at = PARTS.findIndex((x) => x.id === t.id);
                const to = e.key === "ArrowRight" ? PARTS[(at + 1) % PARTS.length] : e.key === "ArrowLeft" ? PARTS[(at - 1 + PARTS.length) % PARTS.length] : e.key === "Home" ? PARTS[0] : e.key === "End" ? PARTS[PARTS.length - 1] : null;
                if (!to) return;
                e.preventDefault();
                setPart(to.id);
                document.getElementById(`matchup-editor-tab-${to.id}`)?.focus();
              }}
              className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent", tabIndicatorClass(part === t.id))}
              data-testid={`matchup-editor-tab-${t.id}`}
            >
              {t.label}
              {marked.has(t.id as Part) ? (
                <>
                  <AlertCircle className="h-4 w-4 text-bad" aria-hidden data-testid="matchup-editor-tab-problem" />
                  <span className="sr-only">, has a problem</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="matchup-editor-panel-points" aria-labelledby="matchup-editor-tab-points" hidden={part !== "points"} className="space-y-3">
          {scopeFields}
          {pointFields}
        </div>
        <div role="tabpanel" id="matchup-editor-panel-sources" aria-labelledby="matchup-editor-tab-sources" hidden={part !== "sources"}>
          {sourceFields}
        </div>
        <div role="tabpanel" id="matchup-editor-panel-preview" aria-labelledby="matchup-editor-tab-preview" hidden={part !== "preview"}>
          {preview}
        </div>
      </div>
    </DetailModal>
  );
}
