"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RefreshCcw } from "lucide-react";
import { curationQueue, type MeetCount, type QueueEntry } from "@/domain/matchup/curation";
import { scopeName, type MatchupNote, type NoteFreshness, type NoteInput } from "@/domain/matchup/notes";
import { publicPatchName } from "@/domain/patch";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import { retireMatchupNoteAction, unpublishMatchupNoteAction, deleteMatchupNoteDraftAction, type NoteResult } from "@/server/actions/matchup-notes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Fold } from "@/components/ui/fold";
import { PagedFooter, usePagedRows, type RowProps } from "@/components/ui/paged-list";
import { useAddressSection } from "@/components/ui/sectioned-workspace";
import { WorkspaceCard, WorkspaceSection, useWorkspaceMarks } from "@/components/ui/workspace";
import { RoleIcon } from "@/components/role-icon";
import { RoleSegmented, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { formatCount, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NoteEditor } from "./note-editor";
import { ReReviewDialog } from "./re-review-dialog";

/*
  Admin Mode → Platform Settings → Matchup notes (docs/MATCHUP_INTEL.md, "Curation"): the reviewed
  notes Matchup Intel's band shows, and the queue of what to write or re-check first, ranked by how
  often the team's members met each lane opponent and pairing this season. Champion names and
  counts only, never whose games. Every change is saved by its server action, which checks the
  administrator permission again and validates the note with the editor's own rules.

  On a desktop window (the one-screen workspace, docs/RESPONSIVE.md, "One-screen desktop pages",
  Matchup notes) the queue's groups are one view switch, in the address as ?view= (an entry each, so
  Back returns to the one before): Needs re-review, Not written yet, Drafts, Published and All
  notes, each with its count, the role filter beside it. One list a view, in the queue's order
  (opponents, then pairings), paged to the rows that fit in a card that fills the window, the counts
  and the current patch at its foot beside the pager; no fold grows the page. The editor and the
  re-review open in windows that fit. Elsewhere the page is as before: Queue | All notes, the groups
  one under the other with their folds.
*/

/** The workspace's views: the queue's groups, and every note. */
type View = "review" | "unwritten" | "drafts" | "published" | "all";
const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: "review", label: "Needs re-review" },
  { id: "unwritten", label: "Not written yet" },
  { id: "drafts", label: "Drafts" },
  { id: "published", label: "Published" },
  { id: "all", label: "All notes" },
];
/** A row of the workspace's list: a queue entry, or a note (All notes). */
type Row = { kind: "entry"; e: QueueEntry } | { kind: "note"; n: AdminNoteRow };
const rowKey = (r: Row) => (r.kind === "entry" ? r.e.key : r.n.note.id);

export interface AdminNoteRow {
  note: MatchupNote;
  freshness: NoteFreshness;
  reviewer: string | null;
  changedParts: Record<string, string[]>;
}

export interface MatchupNotesAdminData {
  notes: AdminNoteRow[];
  meets: MeetCount[];
  champions: Array<{ id: string; name: string }>;
  /** The current patch, internal ("16.23"); null when none is known. */
  currentPatch: string | null;
  knownDesc: string[];
}

type Tab = "queue" | "all";

/** The opponents, and the pairings, the queue lists before its fold. */
const UNWRITTEN_SHOWN = 10;

export function stateWords(row: { note: MatchupNote; freshness: NoteFreshness; changedParts?: Record<string, string[]> } | null, names: ReadonlyMap<string, string>): { words: string; tone: "muted" | "warn" | "good" } {
  if (!row) return { words: "No note", tone: "muted" };
  const { note, freshness } = row;
  const reviewed = note.reviewedPatch ? publicPatchName(note.reviewedPatch) : null;
  if (note.status === "draft") return { words: "Draft", tone: "muted" };
  if (note.status === "retired") return { words: "Retired", tone: "muted" };
  if (freshness.state === "fresh") return { words: `Reviewed on ${reviewed}`, tone: "good" };
  if (freshness.state === "stale") return { words: `Not re-checked since ${reviewed}`, tone: "warn" };
  if (freshness.state === "hidden-changed") {
    const parts = freshness.changed.map((id) => `${names.get(id) ?? id} changed${row.changedParts?.[id]?.length ? `: ${row.changedParts[id]!.join(", ")}` : ""}`);
    return { words: `Hidden: ${parts.join("; ")}`, tone: "warn" };
  }
  return { words: freshness.distance === null ? "Hidden: its review patch is no longer listed" : `Hidden: last reviewed on ${reviewed}, ${formatCount(freshness.distance)} patches ago`, tone: "warn" };
}

const TONE = { muted: "text-fg-muted", warn: "text-warn", good: "text-fg" } as const;

/**
 * A queue entry's row. `paged`: the workspace's list (its paging attributes, its padding inside the card,
 * and one line: the parts never wrap under each other, only the scope's words within it, and the
 * counts leave out "this season", which the list's note says once), so its rows are of one height.
 */
function EntryRow({ e, names, onWrite, onReview, onEdit, paged }: { e: QueueEntry; names: ReadonlyMap<string, string>; onWrite: (e: QueueEntry) => void; onReview: (row: AdminNoteRow) => void; onEdit: (note: MatchupNote) => void; paged?: RowProps }) {
  const name = (id: string | null) => (id ? (names.get(id) ?? id) : null);
  const scope = scopeName({ scope: e.scope, role: e.role }, { champion: name(e.championId), opponent: name(e.opponentId)! }, ROLE_LABELS[e.role]);
  const row = e.note as AdminNoteRow | null;
  const state = stateWords(row, names);
  const published = row?.note.status === "published";
  return (
    <li {...paged} className={cn("flex items-center gap-x-4 gap-y-1 py-2", paged ? "min-h-12 flex-nowrap px-3" : "flex-wrap")} data-testid="matchup-queue-row" data-key={e.key} data-state={row ? (row.note.status === "published" ? row.freshness.state : row.note.status) : "none"}>
      <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <RoleIcon role={e.role} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 font-medium text-fg">{scope}</span>
      </span>
      <span className={cn("text-sm tabular-nums text-fg-muted", paged && "shrink-0")} data-testid="matchup-queue-games">
        {e.games ? `${formatCount(e.games)} ${e.games === 1 ? "game" : "games"}${paged ? "" : " this season"} · ${formatCount(e.withTimeline)} with a timeline${e.last ? ` · last met ${timeAgo(new Date(e.last))}` : ""}` : "Not met this season"}
      </span>
      <span className={cn("text-sm", TONE[state.tone])} data-testid="matchup-queue-state">
        {state.words}
      </span>
      <span className={cn("ml-auto flex gap-2", paged && "shrink-0")}>
        {!row ? (
          <Button size="sm" onClick={() => onWrite(e)} data-testid="matchup-queue-write">
            <Plus className="h-4 w-4" aria-hidden />
            Write
          </Button>
        ) : published && row.freshness.state !== "fresh" ? (
          <Button size="sm" onClick={() => onReview(row)} data-testid="matchup-queue-review">
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Re-review
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onEdit(row.note)} data-testid="matchup-queue-edit">
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Button>
        )}
      </span>
    </li>
  );
}

function Section({ title, entries, total, testId, empty, children }: { title: string; entries: QueueEntry[]; total?: number; testId: string; empty: string; children: (e: QueueEntry) => React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1" data-testid={testId} data-count={total ?? entries.length}>
      <h2 className="text-sm font-semibold text-fg">
        {title} <span className="font-normal text-fg-muted">({formatCount(total ?? entries.length)})</span>
      </h2>
      {entries.length ? <ul className="divide-y divide-border">{entries.map(children)}</ul> : <p className="text-sm text-fg-muted">{empty}</p>}
    </section>
  );
}

const blank = (role: Role = "TOP", opponentId = "", championId: string | null = null): NoteInput => ({ scope: championId ? "pair" : "opponent", role, opponentId, championId, points: [{ text: "", refs: [], levels: null }], sources: [{ kind: "client", title: "", url: "", patch: "" }] });

export function MatchupNotesAdmin({ data, view: initialView = null, cap = null }: { data: MatchupNotesAdminData; /** The page's own ?view= (the server's), so the first paint shows it. */ view?: string | null; /** A browser test's cap on the rows a page (rowsPerPageCap). */ cap?: number | null }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("queue");
  const [role, setRole] = React.useState<Role | null>(null);
  const [editing, setEditing] = React.useState<{ id: string | null; input: NoteInput } | null>(null);
  const [reviewing, setReviewing] = React.useState<AdminNoteRow | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "retire" | "unpublish" | "delete"; note: MatchupNote } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const names = React.useMemo(() => new Map(data.champions.map((c) => [c.id, c.name])), [data.champions]);
  const queue = curationQueue(data.meets, data.notes, role);
  const published = data.notes.filter((n) => n.note.status === "published");
  const needs = published.filter((n) => n.freshness.state !== "fresh").length;
  const drafts = data.notes.filter((n) => n.note.status === "draft").length;
  const current = data.currentPatch ? publicPatchName(data.currentPatch) : null;
  // Not written yet: the most met opponents and pairings first (UNWRITTEN_SHOWN of each kind), the rest behind one fold, so the page stays short.
  const firstOf = (scope: "opponent" | "pair") => queue.notWritten.filter((e) => e.scope === scope).slice(0, UNWRITTEN_SHOWN);
  const shownUnwritten = new Set([...firstOf("opponent"), ...firstOf("pair")].map((e) => e.key));
  const restUnwritten = queue.notWritten.filter((e) => !shownUnwritten.has(e.key));
  const roleNotes = data.notes.filter((n) => !role || n.note.role === role);

  // The workspace: one view of the queue (or every note) at a time, in the address; the first that has something to do by default.
  const marks = useWorkspaceMarks();
  const paged = marks.paged;
  const whole = curationQueue(data.meets, data.notes, null);
  const first: View = whole.needsReview.length ? "review" : "unwritten";
  const [viewId, chooseView] = useAddressSection([first, ...VIEWS.map((v) => v.id).filter((id) => id !== first)], { initial: initialView, param: "view" });
  const view = viewId as View;
  const viewRows: Record<View, Row[]> = {
    review: queue.needsReview.map((e) => ({ kind: "entry", e })),
    unwritten: queue.notWritten.map((e) => ({ kind: "entry", e })),
    drafts: queue.drafts.map((e) => ({ kind: "entry", e })),
    published: queue.fresh.map((e) => ({ kind: "entry", e })),
    all: roleNotes.map((n) => ({ kind: "note", n })),
  };
  const listRef = React.useRef<HTMLUListElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const bandRef = React.useRef<HTMLParagraphElement>(null);
  const { shown, regionProps, listProps, rowProps, pagerProps, footTestId, onListKeyDown } = usePagedRows<Row>({
    rows: viewRows[view],
    keyOf: rowKey,
    words: view === "all" ? { one: "note", many: "notes" } : { one: "lane", many: "lanes" },
    testId: "matchup-notes",
    // The section's marks are this component's own (it draws the WorkspaceSection), so it says when to measure.
    active: paged,
    listRef,
    footRef,
    cardRef,
    probeRem: 3,
    lastLess: 1,
    observe: () => [toolbarRef.current, bandRef.current],
    cap,
    // Another view or role starts at the first page; a saved change keeps the page (its row may leave the view).
    data: `${view}|${role ?? "all"}`,
  });

  const done = (message: string) => {
    toast.success(message, { duration: 2000 });
    router.refresh();
  };
  const run = async (work: () => Promise<NoteResult>, message: string) => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    done(message);
  };
  const edit = (note: MatchupNote) => setEditing({ id: note.id, input: { scope: note.scope, role: note.role, opponentId: note.opponentId, championId: note.championId, points: note.points, sources: note.sources } });
  const write = (e: QueueEntry) => setEditing({ id: null, input: blank(e.role, e.opponentId, e.championId) });

  const counts = (
    <p className="text-sm text-fg-muted" data-testid="matchup-notes-counts" data-published={published.length} data-review={needs} data-drafts={drafts}>
      {formatCount(published.length)} published · {formatCount(needs)} {needs === 1 ? "needs" : "need"} re-review · {formatCount(drafts)} {drafts === 1 ? "draft" : "drafts"}
      {current ? ` · current patch ${current}` : ""}
    </p>
  );
  const newNote = (
    <Button variant="primary" size="sm" onClick={() => setEditing({ id: null, input: blank(role ?? "TOP") })} data-testid="matchup-notes-new">
      <Plus className="h-4 w-4" aria-hidden />
      New note
    </Button>
  );
  const roleFilter = <RoleSegmented label="Role" roles={ROLES} value={role} onChange={setRole} allowAll compactBelow="always" testId="matchup-notes-role" />;
  const viewCount = (id: View) => viewRows[id].length;
  const empty: Record<View, string> = { review: "Every published note is fresh.", unwritten: "Every lane the team met has a note.", drafts: "No drafts.", published: "None yet.", all: "No notes yet." };

  return (
    <WorkspaceSection as="div" marks={marks} label="Matchup notes">
      <div className="space-y-5 ws:flex ws:min-h-0 ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" data-testid="matchup-notes-admin">
        {/* The workspace: the views and the role filter, then New note, on one line. */}
        {paged ? (
          <div ref={toolbarRef} className="flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="matchup-notes-toolbar">
            <div role="radiogroup" aria-label="Matchup notes view" className={segmentedGroupClass()} data-testid="matchup-notes-views">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => chooseView(v.id)} className={segmentClass(view === v.id)} data-testid={`matchup-notes-view-${v.id}`} data-value={v.id}>
                  {v.label}
                  <span className="min-w-4 text-center text-2xs font-medium tabular-nums text-fg-subtle">{formatCount(viewCount(v.id))}</span>
                </button>
              ))}
            </div>
            {roleFilter}
            <span className="ml-auto">{newNote}</span>
          </div>
        ) : null}
        {/* The flow: the counts and New note, then Queue | All notes and the role, then the groups (not drawn in the workspace's window before the page knows: its card stands in their place). */}
        {!paged ? (
          <div className="flex flex-wrap items-center justify-between gap-3 ws:hidden">
            {counts}
            {newNote}
          </div>
        ) : null}
        {!paged ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 ws:hidden">
            <div role="radiogroup" aria-label="Matchup notes view" className={segmentedGroupClass()} data-testid="matchup-notes-tabs">
              {(["queue", "all"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tab === t} onClick={() => setTab(t)} className={segmentClass(tab === t, { size: "md" })} data-value={t}>
                  {t === "queue" ? "Queue" : "All notes"}
                </button>
              ))}
            </div>
            {roleFilter}
          </div>
        ) : null}
        {paged ? null : tab === "queue" ? (
          <div className="space-y-6 ws:hidden" data-testid="matchup-notes-queue">
            <p className="text-sm text-fg-muted">The lanes the team&apos;s members met most this season, in draft games: opponents first (a note on one shows for every pair against it), then pairings. Champion names and counts only.</p>
            <Section title="Needs re-review" entries={queue.needsReview} testId="matchup-queue-review-section" empty="Every published note is fresh.">
              {(e) => <EntryRow key={e.key} e={e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} />}
            </Section>
            <Section title="Not written yet" entries={queue.notWritten.filter((e) => shownUnwritten.has(e.key))} total={queue.notWritten.length} testId="matchup-queue-unwritten-section" empty="Every lane the team met has a note.">
              {(e) => <EntryRow key={e.key} e={e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} />}
            </Section>
            {restUnwritten.length ? (
              <Fold variant="inline" tone="accent" summary={`${formatCount(restUnwritten.length)} more met less often`} testId="matchup-queue-unwritten-more">
                <ul className="divide-y divide-border">
                  {restUnwritten.map((e) => (
                    <EntryRow key={e.key} e={e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} />
                  ))}
                </ul>
              </Fold>
            ) : null}
            {queue.drafts.length ? (
              <Section title="Drafts" entries={queue.drafts} testId="matchup-queue-draft-section" empty="">
                {(e) => <EntryRow key={e.key} e={e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} />}
              </Section>
            ) : null}
            <Fold variant="row" summary={<span className="text-sm font-semibold text-fg">Published and fresh ({formatCount(queue.fresh.length)})</span>} testId="matchup-queue-fresh-section">
              {queue.fresh.length ? (
                <ul className="divide-y divide-border">
                  {queue.fresh.map((e) => (
                    <EntryRow key={e.key} e={e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">None yet.</p>
              )}
            </Fold>
          </div>
        ) : (
          <ul className="divide-y divide-border ws:hidden" data-testid="matchup-notes-all">
            {roleNotes.length === 0 ? <li className="py-2 text-sm text-fg-muted">No notes yet.</li> : null}
            {roleNotes.map((n) => (
              <NoteRow key={n.note.id} n={n} names={names} onEdit={edit} onReview={setReviewing} onConfirm={setConfirm} />
            ))}
          </ul>
        )}
        {/* The workspace's list: one view's rows, a page at a time, in a card that fills the window; the counts at its foot. */}
        <WorkspaceCard ref={cardRef} {...regionProps} className="hidden" testId="matchup-notes-card">
          {paged ? (
            <>
              {view !== "all" ? (
                <p ref={bandRef} className="border-b border-border/70 px-3 py-2 text-xs text-fg-muted">
                  The lanes the team&apos;s members met most this season, in draft games: opponents first (a note on one shows for every pair against it), then pairings. Champion names and counts only.
                </p>
              ) : null}
              {viewRows[view].length ? (
                <ul ref={listRef} {...listProps} onKeyDown={onListKeyDown} className="divide-y divide-border" data-testid="matchup-notes-list" data-view={view}>
                  {shown.map((r) => (r.kind === "entry" ? <EntryRow key={r.e.key} e={r.e} names={names} onWrite={write} onReview={setReviewing} onEdit={edit} paged={rowProps(r)} /> : <NoteRow key={r.n.note.id} n={r.n} names={names} onEdit={edit} onReview={setReviewing} onConfirm={setConfirm} paged={rowProps(r)} />))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-sm text-fg-muted" data-testid="matchup-notes-empty">
                  {empty[view]}
                </p>
              )}
            </>
          ) : null}
          <PagedFooter footRef={footRef} pager={pagerProps} testId={footTestId} leading={paged ? <div className="min-w-0 flex-1">{counts}</div> : null} />
        </WorkspaceCard>
        {editing ? <NoteEditor key={editing.id ?? "new"} id={editing.id} initial={editing.input} champions={data.champions} currentPatch={current} workspace={paged} onClose={() => setEditing(null)} onSaved={(published) => { setEditing(null); done(published ? "Note published" : "Draft saved"); }} /> : null}
        {reviewing ? <ReReviewDialog row={reviewing} names={names} knownDesc={data.knownDesc} currentPatch={current} onClose={() => setReviewing(null)} onEdit={() => { const n = reviewing.note; setReviewing(null); edit(n); }} onDone={(message) => { setReviewing(null); done(message); }} /> : null}
        <ConfirmDialog
          open={!!confirm}
          busy={busy}
          title={confirm?.kind === "retire" ? "Retire this note?" : confirm?.kind === "delete" ? "Delete this draft?" : "Unpublish this note?"}
          description={confirm?.kind === "retire" ? "It stops showing in Matchup Intel and stays on record; a new note can take its place." : confirm?.kind === "delete" ? "The draft is deleted; it was never published." : "It stops showing in Matchup Intel and goes back to the drafts."}
          confirmLabel={confirm?.kind === "retire" ? "Retire" : confirm?.kind === "delete" ? "Delete" : "Unpublish"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm!;
            setConfirm(null);
            void run(() => (c.kind === "retire" ? retireMatchupNoteAction(c.note.id) : c.kind === "delete" ? deleteMatchupNoteDraftAction(c.note.id) : unpublishMatchupNoteAction(c.note.id)), c.kind === "retire" ? "Note retired" : c.kind === "delete" ? "Draft deleted" : "Note unpublished");
          }}
        />
      </div>
    </WorkspaceSection>
  );
}

/** A note in All notes: its scope, state and reviewer, and what can be done with it. `paged`: the workspace's list, one line (EntryRow's). */
function NoteRow({ n, names, onEdit, onReview, onConfirm, paged }: { n: AdminNoteRow; names: ReadonlyMap<string, string>; onEdit: (note: MatchupNote) => void; onReview: (row: AdminNoteRow) => void; onConfirm: (c: { kind: "retire" | "unpublish" | "delete"; note: MatchupNote }) => void; paged?: RowProps }) {
  const state = stateWords(n, names);
  const scope = scopeName(n.note, { champion: n.note.championId ? (names.get(n.note.championId) ?? n.note.championId) : null, opponent: names.get(n.note.opponentId) ?? n.note.opponentId }, ROLE_LABELS[n.note.role]);
  return (
    <li {...paged} className={cn("flex items-center gap-x-4 gap-y-1 py-2", paged ? "min-h-12 flex-nowrap px-3" : "flex-wrap")} data-testid="matchup-note-row" data-status={n.note.status} data-state={n.freshness.state}>
      <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <RoleIcon role={n.note.role} className="h-4 w-4 shrink-0" />
        <span className="font-medium text-fg">{scope}</span>
      </span>
      <span className={cn("text-sm", TONE[state.tone])}>{state.words}</span>
      <span className="text-sm text-fg-muted">{n.reviewer ? `by ${n.reviewer}` : n.note.status === "published" ? "by an administrator" : ""}</span>
      <span className={cn("ml-auto flex flex-wrap gap-2", paged && "shrink-0")}>
        {n.note.status !== "retired" ? (
          <Button size="sm" variant="ghost" onClick={() => onEdit(n.note)} data-testid="matchup-note-edit">
            Edit
          </Button>
        ) : null}
        {n.note.status === "published" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onReview(n)} data-testid="matchup-note-review">
              Re-review
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: "unpublish", note: n.note })} data-testid="matchup-note-unpublish">
              Unpublish
            </Button>
          </>
        ) : null}
        {n.note.status === "draft" && !n.note.reviewedAt ? (
          <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: "delete", note: n.note })} data-testid="matchup-note-delete">
            Delete
          </Button>
        ) : null}
        {n.note.status !== "retired" ? (
          <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: "retire", note: n.note })} data-testid="matchup-note-retire">
            Retire
          </Button>
        ) : null}
      </span>
    </li>
  );
}
