"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champion-picker";
import { TierBadge } from "@/components/players/tier-badge";
import { AddChampion } from "./add-champion";
import type { PoolChampionStats, PoolStats } from "./pool-stats";
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
  stats,
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
  /** Each champion's statistics in this role (omitted: names only). */
  stats?: Record<string, PoolChampionStats>;
  children?: React.ReactNode;
}) {
  const selected = React.useMemo(() => new Set(ids), [ids]);
  return (
    <section className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {roleControl ?? <RoleIcon role={role} className="h-4 w-4 text-accent" />}
          {title ? <span>{title}</span> : null}
          <span className="font-normal text-fg-subtle" data-testid={`${testId}-count`}>
            {ids.length} champion{ids.length === 1 ? "" : "s"}
          </span>
        </h3>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
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
          testId={`${testId}-list`}
          gridClassName={stats ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : undefined}
          renderDetail={stats ? (id) => <PoolCardDetail s={stats[id]} role={role} /> : undefined}
          addSlot={editable ? <AddChampion role={role} champions={champions} exclude={selected} onAdd={(id) => onChange([...ids, id])} testId={testId} /> : undefined}
        />
      )}
      {children}
    </section>
  );
}

/** Under a champion's name in its pool: experience in the role, then the season's games. */
function PoolCardDetail({ s, role }: { s: PoolChampionStats | undefined; role: Role }) {
  if (!s) return <span className="block text-xs text-fg-subtle">No games this season</span>;
  return (
    <>
      <span className="mt-0.5 block">
        <TierBadge tier={s.tier} label={s.tierLabel} why={s.tierWhy} evidence={s.evidence} compact />
      </span>
      {/* Always two lines, cut short rather than wrapped: every card in the grid keeps the same height, so dragging never jumps rows. */}
      <span className="mt-0.5 block text-xs leading-snug tabular-nums text-fg-muted" data-testid="pool-card-stats">
        {s.games ? (
          <>
            <span className="block truncate">
              <span className="font-semibold text-fg">{s.games}</span> game{s.games === 1 ? "" : "s"} · <span className={cn("font-semibold", s.winRate !== null && s.winRate >= 0.5 ? "text-good" : "text-fg")}>{s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`}</span> win rate
            </span>
            <span className="block truncate">
              {s.perfectKda ? "Perfect" : s.kdaRatio === null ? "—" : s.kdaRatio.toFixed(2)} KDA ·{" "}
              {role === "SUPPORT" ? (
                <span title={s.visionPerGame === null ? "Vision score is not available: these games' details were not collected" : "Average vision score per game (Support is judged on vision rather than farm)"} data-testid="pool-card-vision">
                  {s.visionPerGame === null ? "—" : s.visionPerGame.toFixed(1)} avg vision
                </span>
              ) : (
                <span title={s.csPerMinute === null ? "CS/min is not available: these games' details were not collected" : "Creep score per minute (minions and monsters)"}>{s.csPerMinute === null ? "—" : s.csPerMinute.toFixed(1)} CS/min</span>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="block truncate">No games this season</span>
            <span className="block truncate">{s.mastery ? `${compactPoints(s.mastery)} mastery` : "\u00a0"}</span>
          </>
        )}
      </span>
    </>
  );
}

function compactPoints(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
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
  stats,
  statsNote,
}: {
  playerId: string;
  initial: ProfileState;
  version: string;
  champions: PickerChampion[];
  editable: boolean;
  /** Each role's champion statistics, shown on the pool cards. */
  stats?: PoolStats;
  /** What the statistics count ("Season 2026 · All supported games"). */
  statsNote?: string;
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
  const offRoles: Array<{ role: Role; pool: string[]; key: string; onPool: (ids: string[]) => void; onRole: (r: Role) => void; onRemove: () => void; onMove?: { up?: () => void; down?: () => void } }> = [
    ...(state.secondaryRole
      ? [{ role: state.secondaryRole, pool: state.secondaryPool, key: "secondary", onPool: (ids: string[]) => update({ secondaryPool: ids }), onRole: (r: Role) => update({ secondaryRole: r }), onRemove: removeSecondary, onMove: extras.length ? { down: () => update({ secondaryRole: extras[0]!.role, secondaryPool: extras[0]!.pool, additionalRoles: [{ role: state.secondaryRole!, pool: state.secondaryPool }, ...extras.slice(1)] }) } : undefined }]
      : []),
    ...extras.map((extra, i) => ({
      role: extra.role,
      pool: extra.pool,
      key: `extra-${extra.role.toLowerCase()}`,
      onPool: (ids: string[]) => setExtras(extras.map((e, j) => (j === i ? { ...e, pool: ids } : e))),
      onRole: (r: Role) => setExtras(extras.map((e, j) => (j === i ? { ...e, role: r } : e))),
      onRemove: () => setExtras(extras.filter((_, j) => j !== i)),
      onMove: {
        up:
          i > 0
            ? () => moveExtra(i, -1)
            : () => update({ secondaryRole: extra.role, secondaryPool: extra.pool, additionalRoles: [{ role: state.secondaryRole!, pool: state.secondaryPool }, ...extras.filter((_, j) => j !== i)] }),
        down: i < extras.length - 1 ? () => moveExtra(i, 1) : undefined,
      },
    })),
  ];
  const addOffRole = (r: Role) => (state.secondaryRole ? setExtras([...extras, { role: r, pool: [] }]) : update({ secondaryRole: r, secondaryPool: [] }));
  return (
    <div className="space-y-6" data-testid="profile-editor">
      {editable || statsNote ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
          <span>{editable ? "Drag to set your order of preference · × to remove · Add champion for more. Changes save by themselves." : statsNote}</span>
          {editable ? <SaveStatusIndicator status={status} error={error} onRetry={() => void retry()} /> : null}
        </div>
      ) : null}
      <PoolSection
        title="Primary Role"
        role={state.primaryRole}
        ids={state.primaryPool}
        champions={champions}
        championsById={championsById}
        onChange={(ids) => update({ primaryPool: ids })}
        editable={editable}
        testId="primary-pool"
        stats={stats?.[state.primaryRole]}
        roleControl={roleControl(state.primaryRole, (r) => update({ primaryRole: r }))}
      />
      {offRoles.length > 0 || editable ? (
        <div className="space-y-4" data-testid="off-roles">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-fg">
              Off Roles <span className="font-normal text-fg-subtle">{offRoles.length ? `${offRoles.length} · in order of preference` : "optional"}</span>
            </h3>
            {editable && free.length > 0 ? <AddRole label="Add off role" used={used} onAdd={addOffRole} testId="add-off-role" hint="Another role you are happy to play; drafts consider it after your primary role." /> : null}
          </div>
          {offRoles.length === 0 ? <p className="text-xs text-fg-subtle">None yet. Without off roles, drafts treat {ROLE_LABELS[state.primaryRole]} as your only role.</p> : null}
          {offRoles.map((o, i) => (
            <PoolSection
              key={o.key}
              title=""
              role={o.role}
              ids={o.pool}
              champions={champions}
              championsById={championsById}
              onChange={o.onPool}
              editable={editable}
              testId={i === 0 && state.secondaryRole ? "secondary-pool" : `extra-pool-${o.role.toLowerCase()}`}
              stats={stats?.[o.role]}
              roleControl={roleControl(o.role, o.onRole, { onRemove: o.onRemove, onMove: offRoles.length > 1 ? { up: i > 0 ? o.onMove?.up : undefined, down: i < offRoles.length - 1 ? o.onMove?.down : undefined } : undefined })}
              actions={removeButton(o.role, o.onRemove)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}


function ReadOnlyRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
      <RoleIcon role={role} className="h-4 w-4 text-accent" />{" "}
      {ROLE_LABELS[role]}
    </span>
  );
}
