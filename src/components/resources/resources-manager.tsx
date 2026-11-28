"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { RESOURCE_ICONS, RESOURCE_ICON_LABELS, RESOURCE_LIMITS, RESOURCE_SECTIONS, checkResourceUrl, orderedBySection, resourceHost, sectionLabel, type Resource, type ResourceIcon as IconKey, type ResourceSection } from "@/domain/resource-entry";
import { addResourceAction, moveResourceAction, removeResourceAction, restoreResourceDefaultsAction, setResourceHiddenAction, updateResourceAction, type ManagedResources } from "@/server/actions/resources";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { PagedFooter, usePagedRows, type RowProps } from "@/components/ui/paged-list";
import { useAddressSection } from "@/components/ui/sectioned-workspace";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { WorkspaceCard, WorkspaceSection, useWorkspaceMarks } from "@/components/ui/workspace";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ResourceIcon } from "./resource-icon";

/*
  Admin Mode → Platform Settings → Resources: the library members see under Resources, section by
  section, each entry with its controls (move up or down within its section, hide or show, edit,
  remove). Removed defaults are listed apart and come back only when restored here. Every change is
  saved at once by its server action, which checks the administrator permission again.

  On a desktop window (the one-screen workspace, docs/RESPONSIVE.md, "One-screen desktop pages",
  Resources) one paged list in a card that fills the window: a filter in the toolbar (All, each
  section with its count, and Removed when a default was removed, in the address as ?section=, so
  Back returns to the one before), the complete rows that fit (two lines each: the title with its marks
  and host, then the whole description; the five row buttons at the right), the pager at the card's
  foot. Add and Edit open the form in a window; a moved row's page follows it. Elsewhere (phones,
  tablets, touch, short windows, a larger text size) the page is as before: the sections one under
  the other, the form in place, Removed defaults at the end.
*/

type Filter = ResourceSection | "all" | "removed";

/** A row of the workspace's list: a library entry (first and last within its section, for Up and Down), or a removed default. */
type Row = { kind: "entry"; e: Resource; first: boolean; last: boolean } | { kind: "removed"; e: Resource };
const rowKey = (r: Row) => (r.kind === "removed" ? `removed:${r.e.id}` : r.e.id);

interface Draft {
  title: string;
  url: string;
  description: string;
  section: ResourceSection;
  icon: IconKey;
}

const draftOf = (r: Resource | null): Draft => (r ? { title: r.title, url: r.url, description: r.description, section: r.section, icon: r.icon } : { title: "", url: "", description: "", section: "league", icon: "favicon" });

export function ResourcesManager({ initial, filter: initialFilter = null, cap = null }: { initial: ManagedResources; /** The page's own ?section= (the server's), so the first paint shows it. */ filter?: string | null; /** A browser test's cap on the rows a page (rowsPerPageCap). */ cap?: number | null }) {
  const [data, setData] = React.useState(initial);
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState<Resource | null>(null);
  const entries = orderedBySection(data.entries);
  const hidden = data.entries.filter((e) => e.hidden).length;
  const marks = useWorkspaceMarks();
  const paged = marks.paged;

  // The workspace's filter: All, the sections the library holds, and Removed while a default is removed.
  const sections = RESOURCE_SECTIONS.filter((s) => entries.some((e) => e.section === s.key));
  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "All", count: entries.length },
    ...sections.map((s) => ({ key: s.key as Filter, label: s.label, count: entries.filter((e) => e.section === s.key).length })),
    ...(data.removed.length ? [{ key: "removed" as Filter, label: "Removed", count: data.removed.length }] : []),
  ];
  const filterIds = filters.map((f) => f.key);
  const [filter, choose] = useAddressSection(filterIds, { initial: initialFilter });
  const rows: Row[] =
    filter === "removed"
      ? data.removed.map((e) => ({ kind: "removed" as const, e }))
      : entries
          .filter((e) => filter === "all" || e.section === filter)
          .map((e) => {
            const own = entries.filter((x) => x.section === e.section);
            return { kind: "entry" as const, e, first: own[0]?.id === e.id, last: own[own.length - 1]?.id === e.id };
          });
  // The row a change was made to (moved, edited, added, or the neighbour of one removed): its page is shown, and the button pressed keeps the focus.
  const [following, setFollowing] = React.useState<string | null>(null);
  const focusAfter = React.useRef<{ key: string; testId: string } | null>(null);
  const bandRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLElement>(null);
  const { shown, regionProps, listProps, rowProps, pagerProps, footTestId, onListKeyDown } = usePagedRows<Row>({
    rows,
    // The section's marks are this component's own (it draws the WorkspaceSection), so it says when to measure.
    active: paged,
    listRef,
    footRef,
    cardRef,
    keyOf: rowKey,
    words: { one: "resource", many: "resources" },
    testId: "resources",
    probeRem: 4.25,
    lastLess: 1,
    observe: () => [toolbarRef.current, bandRef.current],
    cap,
    selected: following,
    data: `${filter}|${rows.map(rowKey).join(",")}`,
  });
  // Once the change is saved, the button pressed takes the focus again in its row, wherever the row is drawn now (another
  // page, for a row moved past the page's edge); a move button that can go no further hands it to the other one.
  React.useLayoutEffect(() => {
    const want = focusAfter.current;
    if (!want || !paged || busy) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(want.key)}"]`);
    if (!row) return;
    focusAfter.current = null;
    const other = want.testId === "resource-up" ? "resource-down" : want.testId === "resource-down" ? "resource-up" : null;
    const button = [want.testId, other].map((id) => (id ? row.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`) : null)).find((b) => b && !b.disabled);
    if (button && document.activeElement !== button) button.focus({ preventScroll: true });
  });

  const run = async (work: () => Promise<{ ok: true; data: ManagedResources } | { ok: false; error: string }>, done?: string): Promise<boolean> => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setData(r.data);
    if (done) toast.success(done, { duration: 2000 });
    return true;
  };
  /** The row after `key` in the list shown, else the one before: the page to keep once `key` leaves it. */
  const neighbour = (key: string) => {
    const at = rows.findIndex((r) => rowKey(r) === key);
    const next = rows[at + 1] ?? rows[at - 1];
    return next ? rowKey(next) : null;
  };
  const act = (key: string, testId: string) => {
    setFollowing(key);
    if (paged) focusAfter.current = { key, testId };
  };
  const move = (e: Resource, dir: "up" | "down") => {
    act(e.id, dir === "up" ? "resource-up" : "resource-down");
    void run(() => moveResourceAction(e.id, dir));
  };
  const toggleHidden = (e: Resource) => {
    act(e.id, "resource-hide");
    void run(() => setResourceHiddenAction(e.id, !e.hidden), e.hidden ? "Shown to members" : "Hidden from members");
  };
  const restore = (d: Resource) => {
    setFollowing(neighbour(`removed:${d.id}`));
    void run(() => restoreResourceDefaultsAction([d.id]), `${d.title} restored`);
  };
  const add = async (d: Draft) => {
    const before = new Set(data.entries.map((e) => e.id));
    let added: Resource | undefined;
    const ok = await run(async () => {
      const r = await addResourceAction(d);
      if (r.ok) added = r.data.entries.find((e) => !before.has(e.id));
      return r;
    }, "Resource added");
    if (!ok) return;
    setEditing(null);
    if (added) {
      setFollowing(added.id);
      // Added to a section the filter leaves out: the list shows every section, so the new row is in view.
      if (paged && filter !== "all" && filter !== added.section) choose("all");
    }
  };
  const editingEntry = editing && editing !== "new" ? (data.entries.find((e) => e.id === editing) ?? null) : null;
  const save = async (id: string, d: Draft) => {
    setFollowing(id);
    if (await run(() => updateResourceAction(id, d), "Saved")) setEditing(null);
  };

  return (
    <WorkspaceSection as="div" marks={marks} label="Resources library">
      <div className="space-y-6 ws:flex ws:min-h-0 ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" data-testid="resources-manager">
        {/* The toolbar: the count and Add resource; in the workspace the filter first, on the same line. */}
        <div ref={toolbarRef} className="flex flex-wrap items-center justify-between gap-2 ws:gap-x-4">
          <div className="hidden ws:block ws:min-w-0">
            <div role="radiogroup" aria-label="Show" className={segmentedGroupClass()} data-testid="resources-filter">
              {filters.map((f) => (
                <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => choose(f.key)} className={segmentClass(filter === f.key)} data-testid={`resources-filter-${f.key}`}>
                  {f.label}
                  <span className="min-w-4 text-center text-2xs font-medium tabular-nums text-fg-subtle">{formatCount(f.count)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-fg-muted ws:ml-auto" data-testid="resources-manager-count">
            {data.entries.length} resource{data.entries.length === 1 ? "" : "s"}
            {hidden ? ` · ${hidden} hidden from members` : ""}
          </p>
          <Button variant="primary" onClick={() => setEditing("new")} disabled={editing === "new"} data-testid="resource-add">
            <Plus className="h-4 w-4" aria-hidden /> Add resource
          </Button>
        </div>

        {editing === "new" && !paged ? <ResourceForm initial={draftOf(null)} busy={busy} submitLabel="Add resource" onCancel={() => setEditing(null)} onSubmit={add} /> : null}

        {/* The flow's list (drawn until the page knows it is in the workspace, and not in the workspace's window before then: its card stands in its place). */}
        {!paged ? (
          <div className="space-y-5 ws:hidden">
            {RESOURCE_SECTIONS.map((s) => {
              const list = entries.filter((e) => e.section === s.key);
              if (!list.length) return null;
              return (
                <section key={s.key} aria-labelledby={`manage-${s.key}`} className="space-y-2" data-testid="resources-manager-section" data-section={s.key}>
                  <h2 id={`manage-${s.key}`} className="text-sm font-semibold text-fg">
                    {s.label}
                  </h2>
                  <ul className="space-y-2">
                    {list.map((e, i) =>
                      editing === e.id ? (
                        <li key={e.id}>
                          <ResourceForm
                            initial={draftOf(e)}
                            busy={busy}
                            submitLabel="Save"
                            onCancel={() => setEditing(null)}
                            onSubmit={(d) => save(e.id, d)}
                          />
                        </li>
                      ) : (
                        <li key={e.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface-2 p-2.5", e.hidden && "border-dashed bg-surface/50")} data-testid="managed-resource" data-id={e.id} data-hidden={e.hidden ? "true" : "false"}>
                          <div className={cn("flex min-w-0 flex-[1_1_16rem] items-start gap-2.5", e.hidden && "opacity-60")}>
                            <ResourceIcon icon={e.icon} url={e.url} />
                            <div className="min-w-0 [overflow-wrap:anywhere]">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate py-0.5 text-sm pointer-coarse:min-w-11 pointer-coarse:py-3 font-medium text-fg underline-offset-2 hover:underline">
                                  {e.title}
                                </a>
                                {e.hidden ? <Badge tone="neutral">Hidden</Badge> : null}
                                {e.id.startsWith("d-") ? <span className="text-2xs text-fg-subtle">Default</span> : null}
                              </div>
                              <div className="truncate text-xs text-fg-subtle">{resourceHost(e.url)}</div>
                              {e.description ? <div className="text-xs text-fg-muted">{e.description}</div> : null}
                            </div>
                          </div>
                          <RowButtons e={e} first={i === 0} last={i === list.length - 1} busy={busy} className="ml-auto flex min-w-0 flex-wrap items-center gap-1" onMove={(dir) => move(e, dir)} onHide={() => toggleHidden(e)} onEdit={() => setEditing(e.id)} onRemove={() => setRemoving(e)} />
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              );
            })}
            {data.entries.length === 0 ? <p className="text-sm text-fg-muted">The library is empty: members see no resources. Add one, or restore the defaults below.</p> : null}
          </div>
        ) : null}

        {/* The workspace's list: one card that fills the window, a page of rows, the pager. Drawn in the workspace only; its rows once the page has measured them. */}
        <WorkspaceCard ref={cardRef} {...regionProps} className="hidden" testId="resources-card">
          {/* Removed: what restoring does, and Restore all, over the removed defaults. */}
          {filter === "removed" ? (
            <div ref={bandRef} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/70 px-3 py-2">
              <p className="min-w-0 flex-1 text-xs text-fg-muted">Defaults you removed stay removed through every update. Restored, one comes back as first published, at the end of its section.</p>
              <Button size="sm" variant="ghost" onClick={() => void run(() => restoreResourceDefaultsAction(null), "Defaults restored")} disabled={busy} data-testid="resources-restore-all">
                <RotateCcw className="h-4 w-4" aria-hidden /> Restore all
              </Button>
            </div>
          ) : null}
          {paged ? (
            rows.length ? (
              <ul ref={listRef} {...listProps} onKeyDown={onListKeyDown} className="divide-y divide-border" data-testid="resources-list">
                {shown.map((r) => (r.kind === "entry" ? <WorkspaceRow key={r.e.id} row={r} rowProps={rowProps(r)} all={filter === "all"} busy={busy} onMove={(dir) => move(r.e, dir)} onHide={() => toggleHidden(r.e)} onEdit={() => setEditing(r.e.id)} onRemove={() => setRemoving(r.e)} /> : <RemovedRow key={rowKey(r)} e={r.e} rowProps={rowProps(r)} busy={busy} onRestore={() => restore(r.e)} />))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-fg-muted">The library is empty: members see no resources. Add one, or restore the defaults under Removed.</p>
            )
          ) : null}
          <PagedFooter footRef={footRef} pager={pagerProps} testId={footTestId} />
        </WorkspaceCard>

        {data.removed.length && !paged ? (
          <section aria-labelledby="removed-defaults" className="space-y-2 rounded-panel border border-border bg-surface p-3 ws:hidden" data-testid="resources-removed">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="removed-defaults" className="text-sm font-semibold text-fg">
                Removed defaults <span className="font-normal text-fg-muted">· {data.removed.length}</span>
              </h2>
              <Button size="sm" variant="ghost" onClick={() => void run(() => restoreResourceDefaultsAction(null), "Defaults restored")} disabled={busy} data-testid="resources-restore-all">
                <RotateCcw className="h-4 w-4" aria-hidden /> Restore all
              </Button>
            </div>
            <p className="text-xs text-fg-muted">Defaults you removed stay removed through every update. Restored, one comes back as first published, at the end of its section.</p>
            <ul className="space-y-1">
              {data.removed.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="removed-resource" data-id={d.id}>
                  <span className="min-w-0 truncate text-fg">{d.title}</span>
                  <span className="text-xs text-fg-subtle">
                    {sectionLabel(d.section)} · {resourceHost(d.url)}
                  </span>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => restore(d)} disabled={busy} data-testid="resource-restore">
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ConfirmDialog
          open={!!removing}
          onCancel={() => setRemoving(null)}
          busy={busy}
          title={removing ? `Remove “${removing.title}”?` : "Remove?"}
          description={removing?.id.startsWith("d-") ? "Members will no longer see it. It is one of the defaults, so it can be restored later under Removed defaults." : "Members will no longer see it. To bring it back, add it again."}
          confirmLabel="Remove"
          onConfirm={async () => {
            const r = removing;
            if (!r) return;
            setFollowing(neighbour(r.id));
            if (await run(() => removeResourceAction(r.id), "Removed")) setRemoving(null);
          }}
        />
        {/* The workspace: Add and Edit in a window, so the list never moves. */}
        {paged && editing === "new" ? (
          <Dialog open size="picker" onClose={() => setEditing(null)} title="Add a resource">
            <ResourceForm initial={draftOf(null)} busy={busy} submitLabel="Add resource" onCancel={() => setEditing(null)} onSubmit={add} inWindow />
          </Dialog>
        ) : null}
        {paged && editingEntry ? (
          <Dialog open size="picker" onClose={() => setEditing(null)} title={`Edit “${editingEntry.title}”`}>
            <ResourceForm key={editingEntry.id} initial={draftOf(editingEntry)} busy={busy} submitLabel="Save" onCancel={() => setEditing(null)} onSubmit={(d) => save(editingEntry.id, d)} inWindow />
          </Dialog>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}

/** A row's five buttons: move up and down within its section, hide or show, edit, remove. */
function RowButtons({ e, first, last, busy, className, onMove, onHide, onEdit, onRemove }: { e: Resource; first: boolean; last: boolean; busy: boolean; className: string; onMove: (dir: "up" | "down") => void; onHide: () => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className={className}>
      <IconButton label={`Move ${e.title} up`} onClick={() => onMove("up")} disabled={busy || first} testId="resource-up">
        <ArrowUp className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label={`Move ${e.title} down`} onClick={() => onMove("down")} disabled={busy || last} testId="resource-down">
        <ArrowDown className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label={e.hidden ? `Show ${e.title} to members` : `Hide ${e.title} from members`} pressed={e.hidden} onClick={onHide} disabled={busy} testId="resource-hide">
        {e.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </IconButton>
      <IconButton label={`Edit ${e.title}`} onClick={onEdit} disabled={busy} testId="resource-edit">
        <Pencil className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label={`Remove ${e.title}`} onClick={onRemove} disabled={busy} testId="resource-remove" danger>
        <Trash2 className="h-4 w-4" aria-hidden />
      </IconButton>
    </div>
  );
}

/*
  A row of the workspace's list: two lines of one height on every row (min-h-17, the tallest a row
  draws: a title line and a two-line description), so a page's rows line up and the measure counts
  them alike. The title with its marks and host (and, under All, its section) on the first line, the
  whole description on the second, never cut; the five buttons at the right.
*/
function WorkspaceRow({ row, rowProps, all, busy, onMove, onHide, onEdit, onRemove }: { row: Extract<Row, { kind: "entry" }>; rowProps: RowProps; all: boolean; busy: boolean; onMove: (dir: "up" | "down") => void; onHide: () => void; onEdit: () => void; onRemove: () => void }) {
  const e = row.e;
  return (
    <li {...rowProps} className={cn("flex min-h-17 items-center gap-3 px-3 py-2", e.hidden && "bg-surface/50")} data-testid="managed-resource" data-id={e.id} data-hidden={e.hidden ? "true" : "false"}>
      <div className={cn("flex min-w-0 flex-1 items-start gap-2.5", e.hidden && "opacity-60")}>
        <ResourceIcon icon={e.icon} url={e.url} />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 py-0.5 text-sm font-medium text-fg underline-offset-2 hover:underline">
              {e.title}
            </a>
            {e.hidden ? <Badge tone="neutral">Hidden</Badge> : null}
            {e.id.startsWith("d-") ? <span className="text-2xs text-fg-subtle">Default</span> : null}
            <span className="text-xs text-fg-subtle">
              {resourceHost(e.url)}
              {all ? ` · ${sectionLabel(e.section)}` : ""}
            </span>
          </div>
          {e.description ? <div className="text-xs text-fg-muted">{e.description}</div> : null}
        </div>
      </div>
      <RowButtons e={e} first={row.first} last={row.last} busy={busy} className="flex shrink-0 items-center gap-1" onMove={onMove} onHide={onHide} onEdit={onEdit} onRemove={onRemove} />
    </li>
  );
}

/** A removed default in the workspace's Removed view: its title, section and host, and Restore. */
function RemovedRow({ e, rowProps, busy, onRestore }: { e: Resource; rowProps: RowProps; busy: boolean; onRestore: () => void }) {
  return (
    <li {...rowProps} className="flex min-h-17 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" data-testid="removed-resource" data-id={e.id}>
      <ResourceIcon icon={e.icon} url={e.url} />
      <span className="min-w-0 font-medium text-fg">{e.title}</span>
      <span className="text-xs text-fg-subtle">
        {sectionLabel(e.section)} · {resourceHost(e.url)}
      </span>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onRestore} disabled={busy} data-testid="resource-restore">
        Restore
      </Button>
    </li>
  );
}

function IconButton({ label, onClick, disabled, children, testId, pressed, danger }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testId: string; pressed?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn("grid h-8 w-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled max-md:h-11 max-md:w-11 pointer-coarse:h-11 pointer-coarse:w-11", danger && "hover:text-bad")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Adding or editing one resource. The address is checked as it is typed, and again on the server. */
function ResourceForm({ initial, busy, submitLabel, onSubmit, onCancel, inWindow = false }: { initial: Draft; busy: boolean; submitLabel: string; onSubmit: (d: Draft) => Promise<void>; onCancel: () => void; /** In the workspace's window (its own surface): no card of its own. */ inWindow?: boolean }) {
  const [d, setD] = React.useState(initial);
  const id = React.useId();
  const url = d.url.trim() ? checkResourceUrl(d.url) : null;
  const titleLeft = RESOURCE_LIMITS.title - d.title.trim().length;
  const descriptionLeft = RESOURCE_LIMITS.description - d.description.trim().length;
  const valid = !!d.title.trim() && titleLeft >= 0 && descriptionLeft >= 0 && url?.ok === true;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));
  return (
    // noValidate: the checks above decide (an address typed without https:// is fine and gets it);
    // the browser's own url check would silently refuse to submit "u.gg".
    <form
      noValidate
      className={inWindow ? "space-y-3" : "space-y-3 rounded-panel border border-accent/40 bg-surface p-3"}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSubmit(d);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      data-testid="resource-form"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input id={`${id}-title`} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={RESOURCE_LIMITS.title + 20} autoComplete="off" required data-testid="resource-title" />
          {titleLeft < 0 ? <p className="text-xs text-bad">{-titleLeft} characters too long.</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`}>Address</Label>
          <Input id={`${id}-url`} type="url" inputMode="url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} required aria-invalid={url?.ok === false || undefined} aria-describedby={`${id}-url-help`} data-testid="resource-url" />
          <p id={`${id}-url-help`} className={cn("text-xs", url?.ok === false ? "text-bad" : "text-fg-subtle")} role={url?.ok === false ? "alert" : undefined}>
            {url?.ok === false ? url.error : "An https:// address. It opens in a new tab."}
          </p>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor={`${id}-description`}>Short description</Label>
          <Input id={`${id}-description`} value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={RESOURCE_LIMITS.description + 40} autoComplete="off" data-testid="resource-description" />
          <p className={cn("text-xs", descriptionLeft < 0 ? "text-bad" : "text-fg-subtle")}>{descriptionLeft < 0 ? `${-descriptionLeft} characters too long.` : `${descriptionLeft} characters left. Plain text.`}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-section`}>Section</Label>
          {/* The sections offered, and the one this entry is in when that is no longer offered (it may stay, not come back). */}
          <Select
            id={`${id}-section`}
            value={d.section}
            onValueChange={(v) => set("section", v as ResourceSection)}
            data-testid="resource-section"
            options={RESOURCE_SECTIONS.filter((s) => s.offered || s.key === initial.section).map((s) => ({ value: s.key, label: s.offered ? s.label : `${s.label} (no longer offered)` }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-icon`}>Icon</Label>
          <div className="flex items-center gap-2">
            {/* The preview loads a favicon only for a valid address (keyed by it, so a new address tries again). */}
            <ResourceIcon key={url?.ok ? url.url : "none"} icon={url?.ok || d.icon !== "favicon" ? d.icon : "globe"} url={url?.ok ? url.url : ""} />
            <Select id={`${id}-icon`} value={d.icon} onValueChange={(v) => set("icon", v as IconKey)} className="min-w-0 flex-1" data-testid="resource-icon" options={RESOURCE_ICONS.map((k) => ({ value: k, label: RESOURCE_ICON_LABELS[k] }))} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={busy || !valid} data-testid="resource-save">
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
