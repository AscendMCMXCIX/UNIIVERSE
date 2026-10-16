"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
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
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { moveRolePatch, roleOrder, useProfileAutosave, type ProfileState } from "./use-profile-autosave";

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
  const addChampion = (compact: boolean) => <AddChampion role={role} champions={champions} exclude={selected} onAdd={(id) => onChange([...ids, id])} testId={testId} compact={compact} />;
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {roleControl ?? <RoleIcon role={role} className="h-4 w-4 text-accent" />}
          {title ? <span>{title}</span> : null}
          <span className="font-normal text-fg-subtle" data-testid={`${testId}-count`}>
            {ids.length} champion{ids.length === 1 ? "" : "s"}
          </span>
        </h3>
        {actions || (editable && stats) ? (
          <div className="flex items-center gap-1">
            {editable && stats ? addChampion(true) : null}
            {actions}
          </div>
        ) : null}
      </div>
      {ids.length === 0 && (!editable || stats) ? (
        <p className="rounded-panel border border-dashed border-border px-3 py-4 text-sm text-fg-subtle">{editable ? "No champions in this role yet. Add the ones you play here." : "No champions yet."}</p>
      ) : (
        <SortablePool
          ids={ids}
          championsById={championsById}
          editable={editable}
          onChange={onChange}
          onRemove={(id) => onChange(ids.filter((x) => x !== id))}
          testId={`${testId}-list`}
          gridClassName={stats ? "grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))] gap-3" : undefined}
          renderMeta={stats ? (id) => <PoolCardMeta s={stats[id]} /> : undefined}
          renderStats={stats ? (id) => <PoolCardStats s={stats[id]} role={role} /> : undefined}
          // With statistics (the profile), adding is a small button by the heading, so the collection
          // never ends in a card-sized blank; the setup form keeps the cell at the end of the list.
          addSlot={editable && !stats ? addChampion(false) : undefined}
        />
      )}
      {children}
    </section>
  );
}

/** Under a champion's name: how experienced the player is with it in this role (quiet; reasons on hover). */
function PoolCardMeta({ s }: { s: PoolChampionStats | undefined }) {
  if (!s) return <span className="text-xs text-fg-subtle">No games this season</span>;
  return <TierBadge tier={s.tier} label={s.tierLabel} why={s.tierWhy} evidence={s.evidence} quiet />;
}

/**
 * The champion's season in this role, as four figures along the bottom of its card (Support shows
 * vision instead of farm). Every card has the band, so the collection keeps one card height.
 */
function PoolCardStats({ s, role }: { s: PoolChampionStats | undefined; role: Role }) {
  const cell = (label: string, value: React.ReactNode, extra?: { tone?: string; title?: string; testId?: string }) => (
    <div className="min-w-0 px-1.5 py-2 text-center" title={extra?.title}>
      <div className={cn("truncate text-sm font-semibold tabular-nums leading-tight", extra?.tone ?? "text-fg")} data-testid={extra?.testId}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[0.6875rem] text-fg-subtle">{label}</div>
    </div>
  );
  if (!s?.games)
    return (
      <div className="flex min-h-[3.25rem] items-center justify-center px-3 text-xs text-fg-subtle" data-testid="pool-card-stats">
        No games this season{s?.mastery ? ` · ${compactPoints(s.mastery)} mastery` : ""}
      </div>
    );
  return (
    <div className="grid grid-cols-4 divide-x divide-border/50" data-testid="pool-card-stats">
      {cell(s.games === 1 ? "Game" : "Games", s.games)}
      {cell("Win rate", s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`, { tone: WIN_RATE_TONE_CLASS[winRateTone(s.winRate, s.games, WIN_RATE_MIN_GAMES.champion)] })}
      {cell("KDA", s.perfectKda ? "Perfect" : s.kdaRatio === null ? "—" : s.kdaRatio.toFixed(2))}
      {role === "SUPPORT"
        ? cell("Vision", s.visionPerGame === null ? "—" : s.visionPerGame.toFixed(1), { title: s.visionPerGame === null ? "Vision score is not available: these games' details were not collected" : "Average vision score per game (Support is judged on vision rather than farm)", testId: "pool-card-vision" })
        : cell("CS/min", s.csPerMinute === null ? "—" : s.csPerMinute.toFixed(1), { title: s.csPerMinute === null ? "CS/min is not available: these games' details were not collected" : "Creep score per minute (minions and monsters)" })}
    </div>
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

  const renderSection = (o: { role: Role; pool: string[] }, i: number) => (
    <PoolSection
      title={i === 0 ? "Primary Role" : ""}
      role={o.role}
      ids={o.pool}
      champions={champions}
      championsById={championsById}
      onChange={onPool(i)}
      editable={editable}
      testId={i === 0 ? "primary-pool" : i === 1 ? "secondary-pool" : `extra-pool-${o.role.toLowerCase()}`}
      stats={stats?.[o.role]}
      roleControl={
        <span className="flex items-center gap-1">
          {editable && sections.length > 1 ? <RoleGrip index={i} role={o.role} drag={drag} /> : null}
          {roleControl(o.role, onRole(i), {
            onRemove: i > 0 ? () => onRemove(i) : undefined,
            onMove: sections.length > 1 ? { up: i > 0 ? () => moveRole(i, i - 1) : undefined, down: i < sections.length - 1 ? () => moveRole(i, i + 1) : undefined } : undefined,
          })}
          {i > 0 ? <span className="text-xs font-normal text-fg-subtle">Off Role {i}</span> : null}
        </span>
      }
      actions={i > 0 ? removeButton(o.role, () => onRemove(i)) : undefined}
    />
  );

  return (
    <div className="space-y-6" data-testid="profile-editor">
      {editable || statsNote ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
          {/* How editing works is one tap away instead of a paragraph on every visit. */}
          {editable ? (
            <span className="inline-flex items-center gap-1" data-testid="pool-edit-help">
              How editing works
              <InfoTip
                label="How editing works"
                text="Drag a champion to set its order, or drag a role by its handle to change your role order (the top one is your Primary Role). × removes a champion. With a keyboard, focus a grip, press Space to pick it up, move with the arrow keys and press Space to drop. Changes save by themselves."
              />
            </span>
          ) : (
            <span>{statsNote}</span>
          )}
          {editable ? <SaveStatusIndicator status={status} error={error} onRetry={() => void retry()} /> : null}
        </div>
      ) : null}
      <p className="sr-only" aria-live="assertive" data-testid="role-announce">
        {drag.announce}
      </p>
      <ol className="space-y-5" data-testid="role-sections" aria-label="Roles in order of preference">
        {sections.map((o, i) => (
          <React.Fragment key={o.role}>
            {drag.lineBefore(i) ? <li aria-hidden className="h-1 rounded-full bg-accent" data-testid="role-drop-line" /> : null}
            {i === 1 ? (
              <li aria-hidden className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4" data-testid="off-roles-heading">
                <h3 className="text-sm font-semibold text-fg">
                  Off Roles <span className="font-normal text-fg-subtle">{offCount} · in order of preference</span>
                </h3>
              </li>
            ) : null}
            <li ref={drag.ref(i)} className={cn("relative", drag.dragging === i && "z-20 rounded-card bg-bg-elevated/95 shadow-2xl ring-1 ring-accent/50")} style={drag.style(i)} data-testid="role-section" data-role={o.role} data-dragging={drag.dragging === i || undefined}>
              {renderSection(o, i)}
            </li>
          </React.Fragment>
        ))}
        {drag.lineBefore(sections.length) ? <li aria-hidden className="h-1 rounded-full bg-accent" data-testid="role-drop-line" /> : null}
      </ol>
      {editable || offCount === 0 ? (
        <div className={cn("space-y-2", offCount === 0 && "border-t border-border pt-4")} data-testid="off-roles">
          {offCount === 0 ? (
            <h3 className="text-sm font-semibold text-fg">
              Off Roles <span className="font-normal text-fg-subtle">optional</span>
            </h3>
          ) : null}
          {offCount === 0 ? <p className="text-xs text-fg-subtle">None yet. Without off roles, drafts treat {ROLE_LABELS[state.primaryRole]} as your only role.</p> : null}
          {editable && free.length > 0 ? <AddRole label="Add off role" used={used} onAdd={addOffRole} testId="add-off-role" hint="Another role you are happy to play; drafts consider it after your primary role." /> : null}
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
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
      <RoleIcon role={role} className="h-4 w-4 text-accent" />{" "}
      {ROLE_LABELS[role]}
    </span>
  );
}
