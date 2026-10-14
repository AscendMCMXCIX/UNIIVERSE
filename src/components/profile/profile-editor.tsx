"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { SortablePool } from "@/components/champions/sortable-pool";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useProfileAutosave, type ProfileState } from "./use-profile-autosave";

/** Role choice as a row of icon chips; the current choice is highlighted, changes save at once. */
export function RolePicker({ value, onChange, allowNone = false, exclude, label, disabled }: { value: Role | null; onChange: (r: Role | null) => void; allowNone?: boolean; exclude?: Role | null; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {allowNone ? (
        <button type="button" role="radio" aria-checked={value === null} disabled={disabled} onClick={() => onChange(null)} className={cn("min-h-11 rounded-lg border px-3 text-sm transition-colors md:min-h-9", value === null ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")}>
          None
        </button>
      ) : null}
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          disabled={disabled || exclude === r}
          onClick={() => onChange(r)}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:opacity-35 md:min-h-9", value === r ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")}
        >
          <RoleIcon role={r} className={cn("h-4 w-4", value === r ? "text-accent" : "")} /> {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * A champion pool edited in place: the ordered list (drag, arrows or ×) and, on demand, the shared
 * champion grid filtered to the pool's role. Clicking a champion adds or removes it; every change
 * autosaves through the parent.
 */
export function PoolSection({ title, role, ids, limit, champions, championsById, onChange, editable, testId }: { title: string; role: Role; ids: string[]; limit: number; champions: PickerChampion[]; championsById: Map<string, PickerChampion>; onChange: (ids: string[]) => void; editable: boolean; testId: string }) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => new Set(ids), [ids]);
  const full = ids.length >= limit;
  const disabled = React.useMemo(() => (full ? new Set(champions.filter((c) => !selected.has(c.id)).map((c) => c.id)) : undefined), [full, champions, selected]);
  const toggle = (id: string) => {
    if (selected.has(id)) return onChange(ids.filter((x) => x !== id));
    if (full) return toast.info(`This pool holds ${limit} champions. Remove one first.`);
    onChange([...ids, id]);
  };
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <RoleIcon role={role} className="h-4 w-4 text-accent" /> {title}
          <span className="font-normal text-fg-subtle">
            {ids.length}/{limit}
          </span>
        </h3>
        {editable ? (
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`${testId}-toggle`}>
            {open ? (
              <>
                <X className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {ids.length ? "Add or change" : "Add champions"}
              </>
            )}
          </Button>
        ) : null}
      </div>
      {ids.length === 0 && !editable ? <p className="text-sm text-fg-subtle">No champions yet.</p> : null}
      <SortablePool ids={ids} championsById={championsById} editable={editable} onChange={onChange} onRemove={(id) => onChange(ids.filter((x) => x !== id))} emptySlots={editable ? Math.max(0, limit - ids.length) : 0} onAddSlot={() => setOpen(true)} testId={`${testId}-list`} />
      {open && editable ? (
        <div className="rise-in rounded-xl border border-border bg-surface p-3">
          <ChampionGrid champions={champions} selectedIds={selected} disabledIds={disabled} disabledReason="pool is full" onPick={toggle} initialRole={role} maxHeight={340} autoFocus testId={`${testId}-grid`} />
          <p className="mt-2 text-xs text-fg-subtle">Click to add or remove. Order is your preference only; how strong you are on a champion comes from your Riot games.</p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Roles and champion pools, edited where they are shown (profile, Team, My Overview). Everything
 * autosaves; viewers without the right see the same layout read-only.
 */
export function ProfileEditor({ playerId, initial, version, champions, limits, editable }: { playerId: string; initial: ProfileState; version: string; champions: PickerChampion[]; limits: { primary: number; secondary: number }; editable: boolean }) {
  const router = useRouter();
  const { state, status, error, update, retry } = useProfileAutosave(playerId, initial, version, { onSaved: () => router.refresh() });
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  return (
    <div className="space-y-6" data-testid="profile-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Primary role</div>
            {editable ? <RolePicker label="Primary role" value={state.primaryRole} onChange={(r) => r && update({ primaryRole: r })} /> : <ReadOnlyRole role={state.primaryRole} />}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Secondary role</div>
            {editable ? <RolePicker label="Secondary role" value={state.secondaryRole} allowNone exclude={state.primaryRole} onChange={(r) => update({ secondaryRole: r })} /> : state.secondaryRole ? <ReadOnlyRole role={state.secondaryRole} /> : <span className="text-sm text-fg-subtle">None</span>}
          </div>
        </div>
        {editable ? <SaveStatusIndicator status={status} error={error} onRetry={() => void retry()} /> : null}
      </div>
      <PoolSection title={`Primary champions · ${ROLE_LABELS[state.primaryRole]}`} role={state.primaryRole} ids={state.primaryPool} limit={limits.primary} champions={champions} championsById={championsById} onChange={(ids) => update({ primaryPool: ids })} editable={editable} testId="primary-pool" />
      {state.secondaryRole ? (
        <PoolSection title={`Secondary champions · ${ROLE_LABELS[state.secondaryRole]}`} role={state.secondaryRole} ids={state.secondaryPool} limit={limits.secondary} champions={champions} championsById={championsById} onChange={(ids) => update({ secondaryPool: ids })} editable={editable} testId="secondary-pool" />
      ) : editable ? (
        <p className="text-sm text-fg-subtle">Choose a secondary role to add a secondary pool (up to {limits.secondary} champions).</p>
      ) : null}
    </div>
  );
}

function ReadOnlyRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
      <RoleIcon role={role} className="h-4 w-4 text-accent" /> {ROLE_LABELS[role]}
    </span>
  );
}
