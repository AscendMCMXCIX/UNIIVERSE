"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import { hasActiveOverrides, type DraftOverrides } from "@/domain/engine";
import { setDraftOverridesAction, type DraftRoomPayload } from "@/server/actions/drafts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

const EMPTY: DraftOverrides = { strongside: null, weakside: null, preserveCounterpick: null, noRoleFlex: false, preferScaling: false, preferLowerExecution: false, prioritiseEngage: false, riskPreference: "balanced", note: "" };

/**
 * Coach / strategy overrides for this draft. They tilt the engine (never the player constraint)
 * and the engine says what the tilt costs versus the unconstrained plan.
 */
export function OverridesPanel({ draftId, active, warning, canEdit, onSaved }: { draftId: string; active: DraftOverrides | null; warning: string | null; canEdit: boolean; onSaved: (payload: DraftRoomPayload) => void }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftOverrides>({ ...EMPTY, ...(active ?? {}) });
  const [busy, setBusy] = React.useState(false);
  const isActive = hasActiveOverrides(active);

  const save = async (value: DraftOverrides | null) => {
    setBusy(true);
    const r = await setDraftOverridesAction(draftId, value);
    setBusy(false);
    if (!r.ok) toast.error("Overrides not saved", { description: r.error });
    else {
      toast.success(value ? "Today's overrides applied." : "Overrides cleared.");
      onSaved(r.data);
      if (!value) setDraft({ ...EMPTY });
    }
  };

  const summary: string[] = [];
  if (active?.strongside) summary.push(`strongside ${active.strongside.toLowerCase()}`);
  if (active?.weakside) summary.push(`weakside ${ROLE_LABELS[active.weakside]}`);
  if (active?.preserveCounterpick) summary.push(`hold ${ROLE_LABELS[active.preserveCounterpick]}`);
  if (active?.noRoleFlex) summary.push("no role flex");
  if (active?.preferScaling) summary.push("scaling");
  if (active?.preferLowerExecution) summary.push("lower execution");
  if (active?.prioritiseEngage) summary.push("engage");
  if (active?.riskPreference && active.riskPreference !== "balanced") summary.push(`${active.riskPreference} risk`);

  return (
    <Panel className={isActive ? "border-accent/40" : undefined}>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5" /> COACH OVERRIDES {isActive ? <Badge tone="accent">active</Badge> : null}
          </span>
        }
        subtitle={isActive ? summary.join(" · ") : "Soft preferences for this draft only. The player constraint stays hard."}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : canEdit ? "Edit" : "View"}
          </Button>
        }
      />
      {warning ? (
        <PanelBody className="pt-0">
          <p className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">{warning}</p>
        </PanelBody>
      ) : null}
      {open ? (
        <PanelBody className="space-y-2 text-xs">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2">
              <span>Strongside</span>
              <select disabled={!canEdit} value={draft.strongside ?? ""} onChange={(e) => setDraft({ ...draft, strongside: (e.target.value || null) as DraftOverrides["strongside"] })} className="h-7 rounded-md border border-border bg-bg-elevated px-1">
                <option value="">none</option>
                <option value="TOP">Top side</option>
                <option value="MID">Mid</option>
                <option value="BOT">Bottom side</option>
              </select>
            </label>
            <RoleSelect label="Weakside" value={draft.weakside ?? null} disabled={!canEdit} onChange={(r) => setDraft({ ...draft, weakside: r })} />
            <RoleSelect label="Preserve counterpick" value={draft.preserveCounterpick ?? null} disabled={!canEdit} onChange={(r) => setDraft({ ...draft, preserveCounterpick: r })} />
            <label className="flex items-center justify-between gap-2">
              <span>Risk preference</span>
              <select disabled={!canEdit} value={draft.riskPreference ?? "balanced"} onChange={(e) => setDraft({ ...draft, riskPreference: e.target.value as DraftOverrides["riskPreference"] })} className="h-7 rounded-md border border-border bg-bg-elevated px-1">
                <option value="reliable">Reliable (avoid demanding comps)</option>
                <option value="balanced">Balanced</option>
                <option value="ceiling">Ceiling (accept execution risk)</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["noRoleFlex", "Don't role-flex today"],
                ["preferScaling", "Prefer scaling"],
                ["preferLowerExecution", "Prefer lower execution"],
                ["prioritiseEngage", "Prioritise engage"],
              ] as Array<[keyof DraftOverrides, string]>
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input type="checkbox" disabled={!canEdit} checked={!!draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <input disabled={!canEdit} value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note for the team (optional)" className="h-7 w-full rounded-md border border-border bg-bg-elevated px-2" />
          {canEdit ? (
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => save(draft)}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || !isActive} onClick={() => save(null)}>
                Clear
              </Button>
            </div>
          ) : null}
        </PanelBody>
      ) : null}
    </Panel>
  );
}

function RoleSelect({ label, value, disabled, onChange }: { label: string; value: Role | null; disabled: boolean; onChange: (r: Role | null) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <select disabled={disabled} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Role | null)} className="h-7 rounded-md border border-border bg-bg-elevated px-1">
        <option value="">none</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
