"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cleanPlan, PLAN_PART_MAX, planSentence, templatesFor } from "@/domain/development/plans";
import type { Role } from "@/domain/roles";
import { savePlanAction } from "@/server/actions/development";
import type { PlanView } from "@/server/development/repository";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAction } from "./use-action";

export interface PlanDraft {
  ifText: string;
  thenText: string;
  templateKey: string | null;
}

export const EMPTY_PLAN: PlanDraft = { ifText: "", thenText: "", templateKey: null };

/**
 * The If–Then plan: the situation the player will meet in a game and what they will do then, in
 * their own words. Templates for the objective's area and role are optional starting points: a tap
 * copies one into the fields, where it can be changed; nothing is filled in by itself.
 */
export function PlanFields({ category, role, value, onChange, idPrefix }: { category: string; role: Role | null; value: PlanDraft; onChange: (next: PlanDraft) => void; idPrefix: string }) {
  const templates = templatesFor(category, role, 3);
  const valid = cleanPlan(value);
  return (
    <div className="space-y-3">
      {templates.length ? (
        <div className="space-y-1.5" data-testid="plan-templates">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> Start from an example (optional)
          </p>
          <div className="grid gap-1.5">
            {templates.map((t) => {
              const on = value.templateKey === t.key && value.ifText === t.ifText && value.thenText === t.thenText;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange({ ifText: t.ifText, thenText: t.thenText, templateKey: t.key })}
                  aria-pressed={on}
                  className={cn("min-h-11 rounded-md border px-3 py-2 text-left text-sm transition-colors", on ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")}
                  data-testid="plan-template"
                >
                  {planSentence(t)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-if`}>IF (the situation in the game)</Label>
          <Input id={`${idPrefix}-if`} value={value.ifText} maxLength={PLAN_PART_MAX} onChange={(e) => onChange({ ...value, ifText: e.target.value })} placeholder="I recall" data-testid="plan-if" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-then`}>THEN (what you will do)</Label>
          <Input id={`${idPrefix}-then`} value={value.thenText} maxLength={PLAN_PART_MAX} onChange={(e) => onChange({ ...value, thenText: e.target.value })} placeholder="I buy a Control Ward" data-testid="plan-then" />
        </div>
      </div>
      {valid.ok ? (
        <p className="rounded-md bg-bg-elevated px-3 py-2 text-sm text-fg" data-testid="plan-preview">
          {planSentence(valid.value)}
        </p>
      ) : null}
    </div>
  );
}

/** Edit an objective's plan. A plan already played with in a finished session keeps its wording in history; the new wording becomes a new version. */
export function PlanEditorDialog({ open, onClose, objective }: { open: boolean; onClose: () => void; objective: { id: string; title: string; category: string; role: Role | null; plan: PlanView | null } }) {
  const { busy, run } = useAction();
  const [draft, setDraft] = React.useState<PlanDraft>(EMPTY_PLAN);
  const [error, setError] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setDraft(objective.plan ? { ifText: objective.plan.ifText, thenText: objective.plan.thenText, templateKey: objective.plan.templateKey } : EMPTY_PLAN);
      setError(null);
    }
  }
  const save = async () => {
    const valid = cleanPlan(draft);
    if (!valid.ok) return setError(valid.error);
    if (await run(() => savePlanAction(objective.id, draft), { success: "Plan saved." })) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={objective.plan ? "Edit your If–Then plan" : "Add an If–Then plan"}
      description={<>For “{objective.title}”. One situation, one action: short enough to recall between games.</>}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="plan-save">
            {busy ? "Saving…" : "Save plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <PlanFields category={objective.category} role={objective.role} value={draft} onChange={setDraft} idPrefix="plan-editor" />
        {objective.plan ? <p className="text-xs text-fg-muted">Sessions already played keep the plan they were played with; your plan history keeps every earlier wording.</p> : null}
        {error ? (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
