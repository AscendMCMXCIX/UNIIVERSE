"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { SortablePool } from "@/components/champions/sortable-pool";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { cn } from "@/lib/cn";
import { useProfileAutosave, type ProfileState } from "./use-profile-autosave";

/** Role choice as a row of icon chips; the current choice is highlighted, changes save at once. */
export function RolePicker({
  value,
  onChange,
  allowNone = false,
  exclude,
  label,
  disabled,
}: {
  value: Role | null;
  onChange: (r: Role | null) => void;
  allowNone?: boolean;
  exclude?: Role | null | readonly Role[];
  label: string;
  disabled?: boolean;
}) {
  const excluded = (r: Role) =>
    Array.isArray(exclude) ? exclude.includes(r) : exclude === r;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {allowNone ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          disabled={disabled}
          onClick={() => onChange(null)}
          className={cn(
            "min-h-11 rounded-lg border px-3 text-sm transition-colors md:min-h-9",
            value === null
              ? "border-accent bg-accent/10 text-fg"
              : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
        >
          None
        </button>
      ) : null}
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          disabled={disabled || excluded(r)}
          onClick={() => onChange(r)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:opacity-35 md:min-h-9",
            value === r
              ? "border-accent bg-accent/10 text-fg"
              : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
        >
          <RoleIcon
            role={r}
            className={cn("h-4 w-4", value === r ? "text-accent" : "")}
          />{" "}
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * A champion pool edited in place: the ordered list (drag, arrows or ×) and, on demand, the shared
 * champion grid filtered to the pool's role. Clicking a champion adds or removes it; every change
 * autosaves through the parent. Pools have no size limit.
 */
export function PoolSection({
  title,
  role,
  ids,
  champions,
  championsById,
  onChange,
  editable,
  testId,
  actions,
}: {
  title: string;
  role: Role;
  ids: string[];
  champions: PickerChampion[];
  championsById: Map<string, PickerChampion>;
  onChange: (ids: string[]) => void;
  editable: boolean;
  testId: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => new Set(ids), [ids]);
  const toggle = (id: string) =>
    onChange(selected.has(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <RoleIcon role={role} className="h-4 w-4 text-accent" /> {title}
          <span
            className="font-normal text-fg-subtle"
            data-testid={`${testId}-count`}
          >
            {ids.length} champion{ids.length === 1 ? "" : "s"}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          {actions}
          {editable ? (
            <Button
              size="sm"
              variant={open ? "secondary" : "outline"}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              data-testid={`${testId}-toggle`}
            >
              {open ? (
                <>
                  <X className="h-4 w-4" /> Done
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />{" "}
                  {ids.length ? "Add or change" : "Add champions"}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>
      {ids.length === 0 && !editable ? (
        <p className="text-sm text-fg-subtle">No champions yet.</p>
      ) : null}
      <SortablePool
        ids={ids}
        championsById={championsById}
        editable={editable}
        onChange={onChange}
        onRemove={(id) => onChange(ids.filter((x) => x !== id))}
        emptySlots={editable && !open ? 1 : 0}
        onAddSlot={() => setOpen(true)}
        testId={`${testId}-list`}
      />
      {open && editable ? (
        <div className="rise-in rounded-xl border border-border bg-surface p-3">
          <ChampionGrid
            champions={champions}
            selectedIds={selected}
            onPick={toggle}
            initialRole={role}
            maxHeight={340}
            autoFocus
            testId={`${testId}-grid`}
          />
          <p className="mt-2 text-xs text-fg-subtle">
            Click to add or remove. Order is your preference only; how strong
            you are on a champion comes from your Riot games.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Adds an optional role: a button that opens the role choice in place. */
function AddRole({
  label,
  used,
  onAdd,
  testId,
  hint,
}: {
  label: string;
  used: Role[];
  onAdd: (r: Role) => void;
  testId: string;
  hint: string;
}) {
  const [open, setOpen] = React.useState(false);
  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <Plus className="h-4 w-4" /> {label}
      </Button>
    );
  return (
    <div
      className="rise-in space-y-2 rounded-xl border border-dashed border-border p-3"
      data-testid={`${testId}-picker`}
    >
      <div className="text-xs font-medium text-fg-muted">{hint}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <RolePicker
          label={label}
          value={null}
          exclude={used}
          onChange={(r) => {
            if (!r) return;
            onAdd(r);
            setOpen(false);
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Change or remove one optional role from its pool's header. */
function RoleActions({
  role,
  used,
  onChange,
  onRemove,
  extra,
}: {
  role: Role;
  used: Role[];
  onChange: (r: Role) => void;
  onRemove: () => void;
  extra?: React.ReactNode;
}) {
  const [changing, setChanging] = React.useState(false);
  return (
    <>
      {changing ? (
        <span className="flex flex-wrap items-center gap-1">
          <RolePicker
            label={`Change ${ROLE_LABELS[role]} to`}
            value={role}
            exclude={used.filter((r) => r !== role)}
            onChange={(r) => {
              if (r && r !== role) onChange(r);
              setChanging(false);
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setChanging(true)}
          aria-label={`Change the ${ROLE_LABELS[role]} role`}
        >
          Change
        </Button>
      )}
      {extra}
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove the ${ROLE_LABELS[role]} role`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );
}

/**
 * Roles and champion pools, edited where they are shown (profile, Team, My Profile). The primary
 * role is required; a secondary role is optional ("+ Add secondary role"), and further roles work
 * the same way, each with its own ordered pool. The same champion may sit in several roles'
 * pools. Everything autosaves; viewers without the right see the same layout read-only.
 */
export function ProfileEditor({
  playerId,
  initial,
  version,
  champions,
  editable,
}: {
  playerId: string;
  initial: ProfileState;
  version: string;
  champions: PickerChampion[];
  editable: boolean;
}) {
  const router = useRouter();
  const { state, status, error, update, retry } = useProfileAutosave(
    playerId,
    initial,
    version,
    { onSaved: () => router.refresh() },
  );
  const championsById = React.useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const used = [
    state.primaryRole,
    ...(state.secondaryRole ? [state.secondaryRole] : []),
    ...state.additionalRoles.map((a) => a.role),
  ];
  const free = ROLES.filter((r) => !used.includes(r));
  const extras = state.additionalRoles;
  const setExtras = (next: ProfileState["additionalRoles"]) =>
    update({ additionalRoles: next });
  const moveExtra = (i: number, d: -1 | 1) => {
    const next = [...extras];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item!);
    setExtras(next);
  };
  // Removing the secondary role moves the next role (and its pool) up, so the order stays gap-free.
  const removeSecondary = () => {
    const [next, ...rest] = extras;
    update(
      next
        ? {
            secondaryRole: next.role,
            secondaryPool: next.pool,
            additionalRoles: rest,
          }
        : { secondaryRole: null, secondaryPool: [] },
    );
  };
  return (
    <div className="space-y-6" data-testid="profile-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted">
            Primary role
          </div>
          {editable ? (
            <RolePicker
              label="Primary role"
              value={state.primaryRole}
              exclude={used.filter((r) => r !== state.primaryRole)}
              onChange={(r) => r && update({ primaryRole: r })}
            />
          ) : (
            <ReadOnlyRole role={state.primaryRole} />
          )}
        </div>
        {editable ? (
          <SaveStatusIndicator
            status={status}
            error={error}
            onRetry={() => void retry()}
          />
        ) : null}
      </div>
      <PoolSection
        title={`Primary · ${ROLE_LABELS[state.primaryRole]}`}
        role={state.primaryRole}
        ids={state.primaryPool}
        champions={champions}
        championsById={championsById}
        onChange={(ids) => update({ primaryPool: ids })}
        editable={editable}
        testId="primary-pool"
      />
      {state.secondaryRole ? (
        <PoolSection
          title={`Secondary · ${ROLE_LABELS[state.secondaryRole]}`}
          role={state.secondaryRole}
          ids={state.secondaryPool}
          champions={champions}
          championsById={championsById}
          onChange={(ids) => update({ secondaryPool: ids })}
          editable={editable}
          testId="secondary-pool"
          actions={
            editable ? (
              <RoleActions
                role={state.secondaryRole}
                used={used}
                onChange={(r) => update({ secondaryRole: r })}
                onRemove={removeSecondary}
              />
            ) : null
          }
        />
      ) : editable ? (
        <div className="space-y-1.5">
          <AddRole
            label="Add secondary role"
            used={used}
            onAdd={(r) => update({ secondaryRole: r, secondaryPool: [] })}
            testId="add-secondary-role"
            hint="Optional: a second role you are happy to play."
          />
          <p className="text-xs text-fg-subtle">
            Optional. Without one, drafts treat {ROLE_LABELS[state.primaryRole]}{" "}
            as your only role.
          </p>
        </div>
      ) : null}
      {extras.map((extra, i) => (
        <PoolSection
          key={extra.role}
          title={`${ordinal(i + 3)} role · ${ROLE_LABELS[extra.role]}`}
          role={extra.role}
          ids={extra.pool}
          champions={champions}
          championsById={championsById}
          onChange={(ids) =>
            setExtras(extras.map((e, j) => (j === i ? { ...e, pool: ids } : e)))
          }
          editable={editable}
          testId={`extra-pool-${extra.role.toLowerCase()}`}
          actions={
            editable ? (
              <RoleActions
                role={extra.role}
                used={used}
                onChange={(r) =>
                  setExtras(
                    extras.map((e, j) => (j === i ? { ...e, role: r } : e)),
                  )
                }
                onRemove={() => setExtras(extras.filter((_, j) => j !== i))}
                extra={
                  extras.length > 1 ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${ROLE_LABELS[extra.role]} up`}
                        disabled={i === 0}
                        onClick={() => moveExtra(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${ROLE_LABELS[extra.role]} down`}
                        disabled={i === extras.length - 1}
                        onClick={() => moveExtra(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null
                }
              />
            ) : null
          }
        />
      ))}
      {editable && state.secondaryRole && free.length > 0 ? (
        <AddRole
          label="Add another role"
          used={used}
          onAdd={(r) => setExtras([...extras, { role: r, pool: [] }])}
          testId="add-role"
          hint="Optional: another role you can play, ranked after your secondary role."
        />
      ) : null}
    </div>
  );
}

function ordinal(n: number): string {
  return n === 3 ? "3rd" : `${n}th`;
}

function ReadOnlyRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
      <RoleIcon role={role} className="h-4 w-4 text-accent" />{" "}
      {ROLE_LABELS[role]}
    </span>
  );
}
