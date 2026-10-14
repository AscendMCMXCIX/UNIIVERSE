"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { SortablePool } from "@/components/champions/sortable-pool";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
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
 * A champion pool edited in place: the ordered pool (drag to reorder, × to remove) ending in an
 * "Add" tile that opens a compact search right below it (the role's champions first; type to find
 * any). Clicking a champion adds or removes it; every change autosaves through the parent, so
 * there is no Save button and nothing else on the page moves. Pools have no size limit. Whatever
 * follows the pool (that role's statistics) is passed as children.
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
  roleControl,
  children,
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
  /** Replaces the role icon in the heading (e.g. a menu to change the role). */
  roleControl?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [adding, setAdding] = React.useState(false);
  const selected = React.useMemo(() => new Set(ids), [ids]);
  const toggle = (id: string) =>
    onChange(selected.has(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <section className="space-y-2.5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {roleControl ?? <RoleIcon role={role} className="h-4 w-4 text-accent" />}
          <span>{title}</span>
          <span
            className="font-normal text-fg-subtle"
            data-testid={`${testId}-count`}
          >
            {ids.length} champion{ids.length === 1 ? "" : "s"}
          </span>
        </h3>
        {actions ? (
          <div className="flex items-center gap-1">{actions}</div>
        ) : null}
      </div>
      {ids.length === 0 && !editable ? (
        <p className="text-sm text-fg-subtle">No champions yet.</p>
      ) : (
        <SortablePool
          ids={ids}
          championsById={championsById}
          editable={editable}
          onChange={onChange}
          onRemove={(id) => onChange(ids.filter((x) => x !== id))}
          emptySlots={editable && !adding ? 1 : 0}
          onAddSlot={() => setAdding(true)}
          testId={`${testId}-list`}
          addTestId={`${testId}-toggle`}
        />
      )}
      {adding && editable ? (
        <div
          className="rise-in space-y-2 rounded-xl border border-accent/30 bg-surface p-3"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !e.defaultPrevented) setAdding(false);
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-fg-muted">
              Add to your {ROLE_LABELS[role]} pool: click to add or remove.
              {" "}
              <span className="text-fg-subtle">
                Order is your preference; experience comes from your games.
              </span>
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding(false)}
              data-testid={`${testId}-done`}
            >
              <Check className="h-4 w-4" /> Done
            </Button>
          </div>
          <ChampionGrid
            champions={champions}
            selectedIds={selected}
            onPick={toggle}
            initialRole={role}
            maxHeight={300}
            autoFocus
            progressive
            testId={`${testId}-grid`}
          />
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The role of a pool, as a compact menu: switch it to a role not yet used, move or remove it. */
function RoleMenu({
  role,
  used,
  onChange,
  onRemove,
  onMove,
}: {
  role: Role;
  used: Role[];
  onChange: (r: Role) => void;
  onRemove?: () => void;
  onMove?: { up?: () => void; down?: () => void };
}) {
  const free = ROLES.filter((r) => !used.includes(r));
  return (
    <Menu
      label={`${ROLE_LABELS[role]} role`}
      align="start"
      className="w-56"
      trigger={(p) => (
        <button
          {...p}
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 text-sm font-semibold text-fg transition-colors hover:border-border-strong"
          aria-label={`Change the ${ROLE_LABELS[role]} role`}
          title="Change role"
        >
          <RoleIcon role={role} className="h-4 w-4 text-accent" />
          {ROLE_LABELS[role]}
          <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        </button>
      )}
    >
      {free.length ? <MenuLabel>Switch this pool to</MenuLabel> : null}
      {free.map((r) => (
        <MenuItem
          key={r}
          onSelect={() => onChange(r)}
          icon={<RoleIcon role={r} className="h-4 w-4" />}
        >
          {ROLE_LABELS[r]}
        </MenuItem>
      ))}
      {onMove?.up || onMove?.down ? <MenuSeparator /> : null}
      {onMove?.up ? (
        <MenuItem onSelect={onMove.up} icon={<ArrowUp className="h-4 w-4" />}>
          Move up
        </MenuItem>
      ) : null}
      {onMove?.down ? (
        <MenuItem onSelect={onMove.down} icon={<ArrowDown className="h-4 w-4" />}>
          Move down
        </MenuItem>
      ) : null}
      {onRemove ? (
        <>
          <MenuSeparator />
          <MenuItem
            tone="danger"
            onSelect={onRemove}
            icon={<Trash2 className="h-4 w-4" />}
          >
            Remove this role
          </MenuItem>
        </>
      ) : null}
    </Menu>
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
  statsByRole,
}: {
  playerId: string;
  initial: ProfileState;
  version: string;
  champions: PickerChampion[];
  editable: boolean;
  /** Each role's champion statistics, shown under its pool. */
  statsByRole?: Partial<Record<Role, React.ReactNode>>;
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
  const removeButton = (role: Role, onRemove: () => void) =>
    editable ? (
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove the ${ROLE_LABELS[role]} role`}
        title={`Remove the ${ROLE_LABELS[role]} role`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    ) : null;
  const roleControl = (
    role: Role,
    onChange: (r: Role) => void,
    extra?: { onRemove?: () => void; onMove?: { up?: () => void; down?: () => void } },
  ) =>
    editable ? (
      <RoleMenu role={role} used={used} onChange={onChange} {...extra} />
    ) : (
      <ReadOnlyRole role={role} />
    );
  return (
    <div className="space-y-6" data-testid="profile-editor">
      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
          <span>
            Drag to reorder, × to remove, Add for more. Changes save by themselves.
          </span>
          <SaveStatusIndicator
            status={status}
            error={error}
            onRetry={() => void retry()}
          />
        </div>
      ) : null}
      <PoolSection
        title="Primary"
        role={state.primaryRole}
        ids={state.primaryPool}
        champions={champions}
        championsById={championsById}
        onChange={(ids) => update({ primaryPool: ids })}
        editable={editable}
        testId="primary-pool"
        roleControl={roleControl(state.primaryRole, (r) => update({ primaryRole: r }))}
      >
        {statsByRole?.[state.primaryRole]}
      </PoolSection>
      {state.secondaryRole ? (
        <PoolSection
          title="Secondary"
          role={state.secondaryRole}
          ids={state.secondaryPool}
          champions={champions}
          championsById={championsById}
          onChange={(ids) => update({ secondaryPool: ids })}
          editable={editable}
          testId="secondary-pool"
          roleControl={roleControl(state.secondaryRole, (r) => update({ secondaryRole: r }), { onRemove: removeSecondary })}
          actions={removeButton(state.secondaryRole, removeSecondary)}
        >
          {statsByRole?.[state.secondaryRole]}
        </PoolSection>
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
          title={`${ordinal(i + 3)} role`}
          role={extra.role}
          ids={extra.pool}
          champions={champions}
          championsById={championsById}
          onChange={(ids) =>
            setExtras(extras.map((e, j) => (j === i ? { ...e, pool: ids } : e)))
          }
          editable={editable}
          testId={`extra-pool-${extra.role.toLowerCase()}`}
          roleControl={roleControl(
            extra.role,
            (r) => setExtras(extras.map((e, j) => (j === i ? { ...e, role: r } : e))),
            {
              onRemove: () => setExtras(extras.filter((_, j) => j !== i)),
              onMove: { up: i > 0 ? () => moveExtra(i, -1) : undefined, down: i < extras.length - 1 ? () => moveExtra(i, 1) : undefined },
            },
          )}
          actions={removeButton(extra.role, () => setExtras(extras.filter((_, j) => j !== i)))}
        >
          {statsByRole?.[extra.role]}
        </PoolSection>
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
