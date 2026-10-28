"use client";

import * as React from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { CATEGORY_GROUPS, categoriesIn } from "@/domain/development/categories";
import { DETAIL_MAX, looksLikeOutcome, MAX_OBJECTIVE_CHAMPIONS, TITLE_MAX, cleanObjective } from "@/domain/development/objectives";
import { MEASURES, suggestedMeasures, type MeasureKey } from "@/domain/development/measures";
import { cleanPlan } from "@/domain/development/plans";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { createObjectiveAction, updateObjectiveAction } from "@/server/actions/development";
import type { ObjectiveView } from "@/server/development/repository";
import { ChampionPicker } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { chipClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import type { JournalLookups } from "@/components/ranked/types";
import { EMPTY_PLAN, PlanFields, type PlanDraft } from "./plan-editor";
import { useAction } from "./use-action";

export interface ObjectiveSeed {
  title?: string;
  category?: string;
}

interface Draft {
  title: string;
  detail: string;
  category: string;
  customCategory: string;
  role: Role | null;
  championIds: string[];
  measure: MeasureKey | null;
}

const fromObjective = (o: ObjectiveView): Draft => ({ title: o.title, detail: o.detail, category: o.category, customCategory: o.customCategory ?? "", role: o.role, championIds: o.championIds, measure: o.measure });

/** Champions an objective is practised on: none (any champion), or up to five. */
function ChampionChoice({ value, onChange, lookups, onPicking }: { value: string[]; onChange: (ids: string[]) => void; lookups: Pick<JournalLookups, "champions" | "championsById" | "mainPool">; onPicking: (open: boolean) => void }) {
  const [open, setOpenState] = React.useState(false);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onPicking(v);
  };
  const full = value.length >= MAX_OBJECTIVE_CHAMPIONS;
  const quick = lookups.mainPool.ids.filter((id) => !value.includes(id) && lookups.championsById[id]).slice(0, 5);
  const preferred = React.useMemo(() => new Set(lookups.mainPool.ids), [lookups.mainPool.ids]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-testid="objective-champions">
        {value.map((id) => {
          const c = lookups.championsById[id] ?? { id, name: id, portraitUrl: "" };
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 pl-0.5 pr-1 text-sm">
              <ChampionPortrait champion={c} size="xs" className="rounded-full" />
              {c.name}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="grid h-7 w-7 place-items-center rounded-full text-fg-subtle hover:bg-bad/15 hover:text-bad" aria-label={`Remove ${c.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        {!full ? (
          <button type="button" onClick={() => setOpen(true)} className={chipClass(false)} data-testid="objective-add-champion">
            <Plus className="h-3.5 w-3.5" aria-hidden /> {value.length ? "Add another" : "Choose champions"}
          </button>
        ) : null}
      </div>
      {!full && quick.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
          <span>{lookups.mainPool.roleLabel ? `${lookups.mainPool.roleLabel} pool:` : "Your pool:"}</span>
          {quick.map((id) => (
            <button key={id} type="button" onClick={() => onChange([...value, id])} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-2 text-xs text-fg-muted hover:border-border-strong hover:text-fg pointer-coarse:min-h-11" title={`Add ${lookups.championsById[id]!.name}`}>
              <ChampionPortrait champion={lookups.championsById[id]} size="xs" className="h-6 w-6 rounded-full" />
              {lookups.championsById[id]!.name}
            </button>
          ))}
        </div>
      ) : null}
      <ChampionPicker
        open={open}
        title="Practise it on…"
        champions={lookups.champions}
        disabledIds={new Set(value)}
        highlightIds={preferred}
        highlightLabel="in your pool"
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          onChange(value.includes(id) ? value : [...value, id].slice(0, MAX_OBJECTIVE_CHAMPIONS));
          setOpen(false);
        }}
      />
    </div>
  );
}

/** The statistic that may follow an objective: only honest ones for its area and role, each with what it can and cannot show. */
function MeasureChoice({ category, role, value, onChange }: { category: string; role: Role | null; value: MeasureKey | null; onChange: (m: MeasureKey | null) => void }) {
  const options = suggestedMeasures(category, role);
  // A statistic chosen before the area or role changed stays listed, so it is never dropped silently.
  const listed = value && !options.some((o) => o.measure === value) ? [...options, { measure: value, relation: "related" as const }] : options;
  if (listed.length === 0)
    return (
      <p className="rounded-md bg-bg-elevated px-3 py-2 text-sm text-fg-muted" data-testid="measure-none">
        No statistic follows this habit reliably. Your own reviews (how often you followed your plan) are the record of progress.
      </p>
    );
  return (
    <div role="radiogroup" aria-label="Statistic to follow" className="grid gap-1.5" data-testid="measure-choice">
      <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={cn("min-h-11 rounded-md border px-3 py-2 text-left text-sm", value === null ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong")}>
        None: my reviews are enough
      </button>
      {listed.map(({ measure, relation }) => {
        const def = MEASURES[measure];
        const on = value === measure;
        return (
          <button key={measure} type="button" role="radio" aria-checked={on} onClick={() => onChange(measure)} className={cn("min-h-11 rounded-md border px-3 py-2 text-left", on ? "border-accent bg-accent/10" : "border-border hover:border-border-strong")} data-testid={`measure-${measure}`}>
            <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-fg">
              {def.label}
              <span className="text-xs font-normal text-fg-subtle">{relation === "direct" ? "follows the habit itself" : "moves with the habit, among other things"}</span>
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {def.shows} It cannot show: {def.cannotShow.charAt(0).toLowerCase() + def.cannotShow.slice(1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Create or edit an objective: a skill to practise (never a result to reach), its area, the role and
 * champions it is for (none means any), why it matters, and optionally a statistic to follow. A new
 * objective can come with its If–Then plan and become the primary one.
 */
export function ObjectiveEditorDialog({ open, onClose, objective, seed, lookups, hasPrimary, primaryByDefault, onSaved }: { open: boolean; onClose: () => void; objective?: ObjectiveView | null; seed?: ObjectiveSeed | null; lookups: Pick<JournalLookups, "champions" | "championsById" | "mainPool" | "primaryRole">; hasPrimary: boolean; /** A new objective becomes the current one unless the player says otherwise. */ primaryByDefault?: boolean; onSaved?: (o: ObjectiveView) => void }) {
  const { busy, run } = useAction();
  const editing = !!objective;
  const [draft, setDraft] = React.useState<Draft>({ title: "", detail: "", category: "", customCategory: "", role: null, championIds: [], measure: null });
  const [plan, setPlan] = React.useState<PlanDraft>(EMPTY_PLAN);
  const [primary, setPrimary] = React.useState(!hasPrimary);
  const [error, setError] = React.useState<string | null>(null);
  // Escape inside the champion picker closes the picker only, not this window as well.
  const [picking, setPicking] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setDraft(objective ? fromObjective(objective) : { title: seed?.title ?? "", detail: "", category: seed?.category ?? "", customCategory: "", role: null, championIds: [], measure: null });
      setPlan(EMPTY_PLAN);
      setPrimary(primaryByDefault ?? !hasPrimary);
      setError(null);
    }
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const roles = lookups.primaryRole ? [lookups.primaryRole, ...ROLES.filter((r) => r !== lookups.primaryRole)] : [...ROLES];
  const outcome = looksLikeOutcome(draft.title);
  const uid = React.useId();

  const save = async () => {
    const input = { ...draft, customCategory: draft.category === "custom" ? draft.customCategory : null };
    const valid = cleanObjective(input);
    if (!valid.ok) return setError(valid.error);
    const withPlan = plan.ifText.trim() || plan.thenText.trim();
    if (withPlan) {
      const p = cleanPlan(plan);
      if (!p.ok) return setError(p.error);
    }
    setError(null);
    const saved = editing
      ? await run(() => updateObjectiveAction(objective!.id, input), { success: "Objective saved." })
      : await run(() => createObjectiveAction({ ...input, makePrimary: primary, plan: withPlan ? plan : null }), { success: (o) => (o.isPrimary ? `“${o.title}” is your objective now.` : `“${o.title}” added to your library.`) });
    if (saved) {
      onSaved?.(saved.data);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!picking) onClose();
      }}
      title={editing ? "Edit objective" : "New objective"}
      description="Something you can practise in every game, in your own words."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="objective-save">
            {busy ? "Saving…" : editing ? "Save objective" : "Add objective"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="objective-editor">
        <div>
          <Label htmlFor={`${uid}-title`}>What will you practise?</Label>
          <Input id={`${uid}-title`} value={draft.title} maxLength={TITLE_MAX} onChange={(e) => set("title", e.target.value)} placeholder="Track the enemy jungler before crossing the river" autoFocus={!editing} data-testid="objective-title" />
          {outcome ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warn" data-testid="objective-outcome-note">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              This reads like a result to reach. Objectives work best as something you do every game (“Ward the river before 3:15”), which leads to results over time.
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-area`}>Area</Label>
            <Select id={`${uid}-area`} value={draft.category} onChange={(e) => set("category", e.target.value)} data-testid="objective-area">
              <option value="" disabled>
                Choose an area
              </option>
              {CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {categoriesIn(g.key).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="custom">Your own area…</option>
            </Select>
          </div>
          {draft.category === "custom" ? (
            <div>
              <Label htmlFor={`${uid}-custom`}>Name your area</Label>
              <Input id={`${uid}-custom`} value={draft.customCategory} maxLength={40} onChange={(e) => set("customCategory", e.target.value)} placeholder="Lane swaps" data-testid="objective-custom-area" />
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor={`${uid}-detail`}>Why it matters (optional)</Label>
          <Textarea id={`${uid}-detail`} value={draft.detail} maxLength={DETAIL_MAX} rows={2} onChange={(e) => set("detail", e.target.value)} placeholder="I die to ganks when I push without knowing where the jungler is." />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-fg-muted">Role</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Role" data-testid="objective-role">
            <button type="button" role="radio" aria-checked={draft.role === null} onClick={() => set("role", null)} className={chipClass(draft.role === null)}>
              Any role
            </button>
            {roles.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={draft.role === r} onClick={() => set("role", r)} className={chipClass(draft.role === r)} data-testid={`objective-role-${r}`}>
                <RoleIcon role={r} className="h-3.5 w-3.5" /> {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-fg-muted">Champions (optional: none means any champion)</span>
          <ChampionChoice value={draft.championIds} onChange={(ids) => set("championIds", ids)} lookups={lookups} onPicking={setPicking} />
        </div>
        {draft.category ? (
          <div>
            <span className="mb-1 block text-xs font-medium text-fg-muted">A statistic to follow (optional)</span>
            <MeasureChoice category={draft.category} role={draft.role} value={draft.measure} onChange={(m) => set("measure", m)} />
          </div>
        ) : null}
        {!editing && draft.category ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium text-fg">Your If–Then plan (optional, recommended)</p>
            <PlanFields category={draft.category} role={draft.role} value={plan} onChange={setPlan} idPrefix={`${uid}-plan`} />
          </div>
        ) : null}
        {!editing && hasPrimary ? <Switch id={`${uid}-primary`} checked={primary} onChange={setPrimary} label="Make it my current objective" description="Sessions start with your current objective. Otherwise it waits in your library as Identified." /> : null}
        {error ? (
          <p className="text-sm text-bad" role="alert" data-testid="objective-error">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
