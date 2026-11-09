"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { AddChampion } from "./add-champion";
import type { PoolChampionStats, PoolStats } from "./pool-stats";
import { POOL_ROW_CONTROLS, SortablePool } from "@/components/champions/sortable-pool";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { moveRolePatch, roleOrder, useProfileAutosave, type ProfileState } from "./use-profile-autosave";
import { formatCompactCount } from "@/lib/format";

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
  eyebrow,
  role,
  ids,
  champions,
  championsById,
  onChange,
  editable,
  controls,
  testId,
  actions,
  roleControl,
  stats,
  onInspect,
  inspectHref,
  collapsible,
  children,
}: {
  /**
   * Shown as a one-line summary (the role, its champions as small portraits) until opened: off
   * roles on the profile, so the page leads with the primary pool. Opening shows the full,
   * editable pool; the portraits still open the champion window while it is closed.
   */
  collapsible?: { open: boolean; onToggle: () => void };
  /** Opens a champion of this pool in the profile's champion window. */
  onInspect?: (championId: string) => void;
  /** That window's address for a champion (the card is then a link). */
  inspectHref?: (championId: string) => string;
  title: string;
  /** A small label above the role (the profile's "Primary role"). */
  eyebrow?: string;
  role: Role;
  ids: string[];
  champions: PickerChampion[];
  championsById: Map<string, PickerChampion>;
  onChange: (ids: string[]) => void;
  editable: boolean;
  /** The cards' grip and ×: shown on hover and focus (always on touch screens), or always (an explicit edit mode). */
  controls?: "hover" | "always";
  testId: string;
  actions?: React.ReactNode;
  /** Replaces the role icon in the heading (e.g. a menu to change the role). */
  roleControl?: React.ReactNode;
  /** Each champion's statistics in this role (omitted: names only). */
  stats?: Record<string, PoolChampionStats>;
  children?: React.ReactNode;
}) {
  const selected = React.useMemo(() => new Set(ids), [ids]);
  const bodyId = React.useId();
  const closed = !!collapsible && !collapsible.open;
  const addChampion = (compact: boolean) => <AddChampion role={role} champions={champions} exclude={selected} onAdd={(id) => onChange([...ids, id])} testId={testId} compact={compact} />;
  return (
    <section className={cn("space-y-3", closed && "space-y-0")} data-testid={testId} data-open={collapsible ? collapsible.open : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* One line: the role (its menu while editing), how many champions, and what the role is to the player. */}
        <h3 className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold">
          {roleControl ?? <RoleIcon role={role} className="h-4 w-4 text-accent" />}
          {title ? <span>{title}</span> : null}
          <span className="whitespace-nowrap font-normal text-fg-subtle" data-testid={`${testId}-count`}>
            {ids.length} champion{ids.length === 1 ? "" : "s"}
          </span>
          {eyebrow ? <span className="whitespace-nowrap rounded-full border border-accent-2/40 bg-accent-2/10 px-2 py-px text-2xs font-semibold uppercase tracking-label text-accent-2">{eyebrow}</span> : null}
        </h3>
        {closed && ids.length ? <PoolPreview ids={ids} championsById={championsById} onInspect={onInspect} inspectHref={inspectHref} testId={`${testId}-preview`} /> : null}
        {actions || (editable && stats && !closed) || collapsible ? (
          <div className="ml-auto flex items-center gap-1">
            {editable && stats && !closed ? addChampion(true) : null}
            {actions}
            {collapsible ? (
              <Button size="sm" variant="ghost" onClick={collapsible.onToggle} aria-expanded={collapsible.open} aria-controls={bodyId} data-testid={`${testId}-expand`}>
                {collapsible.open ? "Hide" : "Show"}
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 motion-reduce:transition-none", collapsible.open && "rotate-180")} aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div id={bodyId} hidden={closed} className="@container space-y-3">
      {ids.length === 0 && (!editable || stats) ? (
        <p className="rounded-panel border border-dashed border-border px-3 py-4 text-sm text-fg-subtle">{editable ? "No champions in this role yet. Add the ones you play here." : "No champions yet."}</p>
      ) : (
        <>
        {stats ? <PoolColumns role={role} editable={editable} testId={testId} /> : null}
        <SortablePool
          ids={ids}
          championsById={championsById}
          editable={editable}
          onChange={onChange}
          onRemove={(id) => onChange(ids.filter((x) => x !== id))}
          controls={controls}
          testId={`${testId}-list`}
          variant={stats ? "rows" : "cards"}
          renderStats={stats ? (id) => <PoolRowStats s={stats[id]} role={role} /> : undefined}
          onInspect={onInspect}
          inspectHref={inspectHref}
          // With statistics (the profile), adding is a small button by the heading, so the collection
          // never ends in a card-sized blank; the setup form keeps the cell at the end of the list.
          addSlot={editable && !stats ? addChampion(false) : undefined}
        />
        </>
      )}
      {children}
      </div>
    </section>
  );
}

/**
 * A closed pool in one line: its champions as small portraits in order (the first ones; the
 * rest as a count). Each portrait opens that champion's window, like its card would.
 */
function PoolPreview({ ids, championsById, onInspect, inspectHref, testId }: { ids: string[]; championsById: Map<string, PickerChampion>; onInspect?: (id: string) => void; inspectHref?: (id: string) => string; testId: string }) {
  const shown = ids.slice(0, 8);
  return (
    <ol className="order-last flex min-w-0 basis-full flex-wrap items-center gap-1.5 sm:order-none sm:basis-auto sm:flex-1" aria-label="Champions in this role, in order" data-testid={testId}>
      {shown.map((id) => {
        const c = championsById.get(id) ?? { id, name: id, portraitUrl: "" };
        const portrait = <ChampionPortrait champion={c} size="sm" className="rounded-md" />;
        return (
          <li key={id} data-champion={id}>
            {onInspect && inspectHref ? (
              <a
                href={inspectHref(id)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onInspect(id);
                }}
                className="block rounded-md transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:translate-y-0"
                aria-haspopup="dialog"
                title={c.name}
                data-testid="pool-preview-inspect"
              >
                {/* Named by the portrait itself ("Rumble"), so its lettered stand-in never contradicts
                    a label set over it (WCAG 2.5.3, label in name). */}
                {portrait}
                <span className="sr-only">: open its statistics</span>
              </a>
            ) : (
              <span title={c.name}>{portrait}</span>
            )}
          </li>
        );
      })}
      {ids.length > shown.length ? <li className="text-xs text-fg-subtle">+{ids.length - shown.length}</li> : null}
    </ol>
  );
}

/**
 * The figures' columns of a pool's rows (three in a narrow list, four from 32rem), shared with the
 * column names. They give way to the champion's name, which keeps at least 4rem (sortable-pool.tsx):
 * at a fixed 10.5rem a 320px phone left the name no room at all.
 */
const STATS_COLUMNS = "grid w-[10.5rem] min-w-0 shrink grid-cols-3 @lg:w-[17rem] @lg:grid-cols-4";

/**
 * The column names over a pool's rows, once (the rows carry each name for screen readers): the
 * champion, then games, win rate, KDA and CS/min (vision for Support, judged on vision rather than
 * farm). While editing it leaves the room the rows' grip and × take.
 */
function PoolColumns({ role, editable, testId }: { role: Role; editable: boolean; testId: string }) {
  return (
    <div aria-hidden className="flex items-center gap-2 pb-0.5 pl-2 pr-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle @2xs:gap-2.5 @lg:gap-3 @lg:pl-2.5" data-testid={`${testId}-columns`}>
      <span className="w-3 shrink-0 @2xs:w-4" />
      <span className="min-w-16 flex-1 truncate">Champion</span>
      <span className={cn(STATS_COLUMNS, "text-center")}>
        <span>Games</span>
        <span>
          <span className="@lg:hidden">Win %</span>
          <span className="hidden @lg:inline">Win rate</span>
        </span>
        <span>KDA</span>
        <span className="hidden @lg:block">{role === "SUPPORT" ? "Vision" : "CS/min"}</span>
      </span>
      {editable ? <span className={cn("shrink-0", POOL_ROW_CONTROLS)} /> : null}
    </div>
  );
}

/**
 * A champion's season in this role, at its row's end under the column names: games, win rate
 * (coloured only on enough games), KDA, and CS/min or vision. A champion without games this season
 * says so in words across the columns, with its mastery when there is some.
 */
function PoolRowStats({ s, role }: { s: PoolChampionStats | undefined; role: Role }) {
  if (!s?.games)
    return (
      <span className={cn(STATS_COLUMNS, "items-center")} data-testid="pool-card-stats">
        {/* Wraps rather than ends cut short ("No games this season · 104K mas…" on every phone). */}
        <span className="col-span-3 text-center text-xs leading-tight text-fg-subtle @lg:col-span-4">
          No games<span className="hidden @lg:inline"> this season</span>
          {s?.mastery ? ` · ${formatCompactCount(s.mastery)} mastery` : ""}
        </span>
      </span>
    );
  const cell = (label: string, value: React.ReactNode, extra?: { tone?: string; title?: string; testId?: string; className?: string }) => (
    <span className={cn("min-w-0 truncate text-center text-xs font-semibold tabular-nums @2xs:text-sm", extra?.tone ?? "text-fg", extra?.className)} title={extra?.title} data-testid={extra?.testId}>
      <span className="sr-only">{label}: </span>
      {value}
    </span>
  );
  return (
    <span className={STATS_COLUMNS} data-testid="pool-card-stats">
      {cell(s.games === 1 ? "Game" : "Games", s.games)}
      {cell("Win rate", s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`, { tone: WIN_RATE_TONE_CLASS[winRateTone(s.winRate, s.games, WIN_RATE_MIN_GAMES.champion)] })}
      {cell("KDA", s.perfectKda ? "Perfect" : s.kdaRatio === null ? "—" : s.kdaRatio.toFixed(2))}
      {role === "SUPPORT"
        ? cell("Vision", s.visionPerGame === null ? "—" : s.visionPerGame.toFixed(1), { title: s.visionPerGame === null ? "Vision score is not available: these games' details were not collected" : "Average vision score per game (Support is judged on vision rather than farm)", testId: "pool-card-vision", className: "hidden @lg:block" })
        : cell("CS/min", s.csPerMinute === null ? "—" : s.csPerMinute.toFixed(1), { title: s.csPerMinute === null ? "CS/min is not available: these games' details were not collected" : "Creep score per minute (minions and monsters)", className: "hidden @lg:block" })}
    </span>
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
      className="rise-in space-y-2 rounded-panel border border-dashed border-border p-3"
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

const EDITING_HELP = "Drag a champion to set its order, or drag a role by its handle to change your role order (the top one is your Primary Role). × removes a champion; a role's menu switches, moves or removes the role. With a keyboard, focus a grip, press Space to pick it up, move with the arrow keys and press Space to drop. Changes save by themselves; Done puts the controls away.";

/**
 * Roles and champion pools on a profile: the Primary Role's pool as cards, then the Off Roles as
 * one-line summaries (the role, its champions as small portraits) that open in place. The section
 * reads as a display until Edit (the player, or an administrator): then every editing control
 * appears at once (champion grips and ×, Add champion, each role's menu and grip, Add off role)
 * and Done puts them away. The primary role is required; off roles are optional, each with its
 * own ordered pool, and the same champion may sit in several. Every change autosaves; viewers
 * without the right see the same layout without Edit.
 */
export function ProfileEditor({
  playerId,
  initial,
  version,
  champions,
  editable,
  stats,
  heading,
  intro,
  onInspect,
  inspectHref,
}: {
  /** Opens a pool champion (in that role) in the profile's champion window. */
  onInspect?: (championId: string, role: Role) => void;
  /** That window's address for a pool champion in a role. */
  inspectHref?: (championId: string, role: Role) => string;
  playerId: string;
  initial: ProfileState;
  version: string;
  champions: PickerChampion[];
  editable: boolean;
  /** Each role's champion statistics, shown on the pool cards. */
  stats?: PoolStats;
  /** The section's heading, on one line with Edit. */
  heading?: React.ReactNode;
  /** What the section shows, under the heading. */
  intro?: React.ReactNode;
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
  const [editing, setEditing] = React.useState(false);
  const live = editable && editing;
  const used = [
    state.primaryRole,
    ...(state.secondaryRole ? [state.secondaryRole] : []),
    ...state.additionalRoles.map((a) => a.role),
  ];
  const free = ROLES.filter((r) => !used.includes(r));
  const extras = state.additionalRoles;
  const setExtras = (next: ProfileState["additionalRoles"]) =>
    update({ additionalRoles: next });
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
    live ? (
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
    live ? (
      <RoleMenu role={role} used={used} onChange={onChange} {...extra} />
    ) : (
      <ReadOnlyRole role={role} />
    );
  // Every role section in order of preference: the first is the Primary Role, the rest Off Roles.
  const sections = roleOrder(state);
  const moveRole = (from: number, to: number) => {
    const patch = moveRolePatch(state, from, to);
    if (patch) update(patch);
  };
  const onPool = (i: number) => (ids: string[]) => (i === 0 ? update({ primaryPool: ids }) : i === 1 ? update({ secondaryPool: ids }) : setExtras(extras.map((e, j) => (j === i - 2 ? { ...e, pool: ids } : e))));
  const onRole = (i: number) => (r: Role) => (i === 0 ? update({ primaryRole: r }) : i === 1 ? update({ secondaryRole: r }) : setExtras(extras.map((e, j) => (j === i - 2 ? { ...e, role: r } : e))));
  const onRemove = (i: number) => (i === 1 ? removeSecondary() : i > 1 ? setExtras(extras.filter((_, j) => j !== i - 2)) : undefined);
  const addOffRole = (r: Role) => (state.secondaryRole ? setExtras([...extras, { role: r, pool: [] }]) : update({ secondaryRole: r, secondaryPool: [] }));
  const drag = useRoleDrag(sections.length, moveRole, (i) => ROLE_LABELS[sections[i]!.role]);
  const offCount = sections.length - 1;
  // With statistics the off roles start as one-line summaries, so the section leads with the
  // primary pool; each opens in place. While editing they are all open.
  const [openRoles, setOpenRoles] = React.useState<ReadonlySet<Role>>(() => new Set());
  const toggleRole = (r: Role) => setOpenRoles((was) => (was.has(r) ? new Set([...was].filter((x) => x !== r)) : new Set([...was, r])));

  const renderSection = (o: { role: Role; pool: string[] }, i: number) => (
    <PoolSection
      title=""
      eyebrow={i === 0 ? "Primary role" : undefined}
      role={o.role}
      ids={o.pool}
      champions={champions}
      championsById={championsById}
      onChange={onPool(i)}
      editable={live}
      controls="always"
      testId={i === 0 ? "primary-pool" : i === 1 ? "secondary-pool" : `extra-pool-${o.role.toLowerCase()}`}
      stats={stats?.[o.role]}
      onInspect={onInspect ? (id) => onInspect(id, o.role) : undefined}
      inspectHref={inspectHref ? (id) => inspectHref(id, o.role) : undefined}
      roleControl={
        <span className="flex items-center gap-1">
          {live && sections.length > 1 ? <RoleGrip index={i} role={o.role} drag={drag} /> : null}
          {roleControl(o.role, onRole(i), {
            onRemove: i > 0 ? () => onRemove(i) : undefined,
            onMove: sections.length > 1 ? { up: i > 0 ? () => moveRole(i, i - 1) : undefined, down: i < sections.length - 1 ? () => moveRole(i, i + 1) : undefined } : undefined,
          })}
        </span>
      }
      actions={i > 0 ? removeButton(o.role, () => onRemove(i)) : undefined}
      collapsible={i > 0 && stats && !live ? { open: openRoles.has(o.role), onToggle: () => toggleRole(o.role) } : undefined}
    />
  );

  return (
    <div className="space-y-3" data-testid="profile-editor" data-editing={live || undefined}>
      {heading || intro || editable ? (
        <div className="space-y-1">
          {/* The heading and Edit share a line on every width; the rest of the context goes under it. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{heading}</div>
            {editable ? (
              <Button size="sm" variant={live ? "primary" : "outline"} className="shrink-0" onClick={() => setEditing((v) => !v)} aria-label={live ? "Done editing roles and champion pools" : "Edit roles and champion pools"} data-testid="pools-edit">
                {live ? <Check className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
                {live ? "Done" : "Edit"}
              </Button>
            ) : null}
          </div>
          {intro}
          {live || status !== "idle" ? (
            // While editing: that changes save by themselves, how editing works, and the save state
            // (which stays after Done until the last change is saved).
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
              {live ? (
                <span className="inline-flex items-center gap-1">
                  Editing: changes save as you go
                  <InfoTip label="How editing works" text={EDITING_HELP} />
                </span>
              ) : null}
              <SaveStatusIndicator status={status} error={error} onRetry={() => void retry()} />
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="sr-only" aria-live="assertive" data-testid="role-announce">
        {drag.announce}
      </p>
      <ol className="space-y-2.5" data-testid="role-sections" aria-label="Roles in order of preference">
        {sections.map((o, i) => (
          <React.Fragment key={o.role}>
            {drag.lineBefore(i) ? <li aria-hidden className="h-1 rounded-full bg-accent" data-testid="role-drop-line" /> : null}
            {i === 1 ? (
              <li aria-hidden className="border-t border-border/70 pt-3" data-testid="off-roles-heading">
                <p className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">
                  Off roles <span className="font-normal normal-case tracking-normal">· in order of preference</span>
                </p>
              </li>
            ) : null}
            {/* The primary pool is the section's body; each off role is a row of its own. */}
            <li ref={drag.ref(i)} className={cn("relative", i > 0 && "rounded-panel border border-border/70 bg-surface-2/40 px-3 py-2", drag.dragging === i && "z-20 rounded-card bg-bg-elevated/95 shadow-2xl ring-1 ring-accent/50")} style={drag.style(i)} data-testid="role-section" data-role={o.role} data-dragging={drag.dragging === i || undefined}>
              {renderSection(o, i)}
            </li>
          </React.Fragment>
        ))}
        {drag.lineBefore(sections.length) ? <li aria-hidden className="h-1 rounded-full bg-accent" data-testid="role-drop-line" /> : null}
      </ol>
      {offCount === 0 || live ? (
        <div className={cn("space-y-2", offCount === 0 && "border-t border-border/70 pt-3")} data-testid="off-roles">
          {offCount === 0 ? (
            <>
              <p className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Off roles</p>
              <p className="text-xs text-fg-subtle">None yet: lineups offer this player for {ROLE_LABELS[state.primaryRole]} only.</p>
            </>
          ) : null}
          {live && free.length > 0 ? <AddRole label="Add off role" used={used} onAdd={addOffRole} testId="add-off-role" hint="Another role you are happy to play; lineups can place you there too." /> : null}
        </div>
      ) : null}
    </div>
  );
}

type RoleDrag = ReturnType<typeof useRoleDrag>;

/**
 * Whole-role reordering. Pointer: hold a role's grip and drag; the section follows the pointer and
 * a line shows where it will land; releasing saves once (never while moving). Keyboard: focus the
 * grip, Space or Enter to pick up, arrow keys to move, Space or Enter to drop, Escape to cancel.
 * Sections never resize while dragging; champion grips inside a pool are separate.
 */
function useRoleDrag(count: number, onMove: (from: number, to: number) => void, nameOf: (i: number) => string) {
  const els = React.useRef<Array<HTMLElement | null>>([]);
  const [state, setState] = React.useState<{ from: number; to: number; dy: number; mode: "pointer" | "keys" } | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const start = React.useRef<{ y: number; scroll: number; mids: number[] } | null>(null);
  const live = React.useRef(state);
  React.useEffect(() => {
    live.current = state;
  });
  const targetFor = (pageY: number, from: number) => (start.current?.mids ?? []).filter((m, j) => j !== from && m < pageY).length;

  const pointerDown = (i: number) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    start.current = { y: e.clientY, scroll: window.scrollY, mids: els.current.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2 : 0)) };
    setState({ from: i, to: i, dy: 0, mode: "pointer" });
    setAnnounce(`Moving the ${nameOf(i)} role.`);
  };
  const dragging = state?.mode === "pointer";
  React.useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const s = live.current;
      const st = start.current;
      if (!s || !st) return;
      e.preventDefault();
      const dy = e.clientY - st.y + (window.scrollY - st.scroll);
      setState({ ...s, dy, to: targetFor(e.clientY + window.scrollY, s.from) });
      if (e.clientY < 56) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 56) window.scrollBy(0, 12);
    };
    const up = () => {
      const s = live.current;
      setState(null);
      start.current = null;
      if (s && s.to !== s.from) {
        onMove(s.from, s.to);
        setAnnounce(`${nameOf(s.from)} moved to position ${s.to + 1}${s.to === 0 ? ": now your Primary Role" : ""}.`);
      }
    };
    const cancel = () => {
      setState(null);
      start.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.userSelect = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const keyDown = (i: number) => (e: React.KeyboardEvent) => {
    const s = state;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!s) {
        setState({ from: i, to: i, dy: 0, mode: "keys" });
        setAnnounce(`Picked up the ${nameOf(i)} role, position ${i + 1} of ${count}. Arrow keys to move, Space to drop, Escape to cancel.`);
      } else {
        setState(null);
        if (s.to !== s.from) onMove(s.from, s.to);
        setAnnounce(s.to !== s.from ? `${nameOf(s.from)} dropped at position ${s.to + 1}${s.to === 0 ? ": now your Primary Role" : ""}.` : "Order unchanged.");
      }
    } else if (s && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = Math.max(0, Math.min(count - 1, s.to + (e.key === "ArrowUp" ? -1 : 1)));
      setState({ ...s, to });
      setAnnounce(`Position ${to + 1} of ${count}${to === 0 ? " (Primary Role)" : ""}.`);
    } else if (s && e.key === "Escape") {
      e.preventDefault();
      setState(null);
      setAnnounce("Role move cancelled.");
    }
  };

  return {
    announce,
    dragging: state?.mode === "pointer" ? state.from : null,
    picked: state?.from ?? null,
    ref: (i: number) => (el: HTMLElement | null) => {
      els.current[i] = el;
    },
    style: (i: number): React.CSSProperties | undefined => (state?.mode === "pointer" && state.from === i ? { transform: `translateY(${state.dy}px)` } : undefined),
    /** The drop line sits before section `slot` of the others (or at the end). */
    lineBefore: (slot: number) => {
      if (!state || state.to === state.from) return false;
      const target = state.to > state.from ? state.to + 1 : state.to;
      return slot === target;
    },
    pointerDown,
    keyDown,
  };
}

function RoleGrip({ index, role, drag }: { index: number; role: Role; drag: RoleDrag }) {
  return (
    <button
      type="button"
      onPointerDown={drag.pointerDown(index)}
      onKeyDown={drag.keyDown(index)}
      aria-label={`Move the ${ROLE_LABELS[role]} role (with its champions). Space to pick up, arrows to move.`}
      aria-pressed={drag.picked === index}
      title="Drag to change your role order"
      className={cn("grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-10", drag.picked === index && "bg-accent/15 text-accent")}
      data-testid="role-grip"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

function ReadOnlyRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 text-base font-semibold text-fg">
      <RoleIcon role={role} className="h-[1.125rem] w-[1.125rem] text-accent" />{" "}
      {ROLE_LABELS[role]}
    </span>
  );
}
