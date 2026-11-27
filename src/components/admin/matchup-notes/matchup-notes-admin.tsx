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
*/

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

function EntryRow({ e, names, onWrite, onReview, onEdit }: { e: QueueEntry; names: ReadonlyMap<string, string>; onWrite: (e: QueueEntry) => void; onReview: (row: AdminNoteRow) => void; onEdit: (note: MatchupNote) => void }) {
  const name = (id: string | null) => (id ? (names.get(id) ?? id) : null);
  const scope = scopeName({ scope: e.scope, role: e.role }, { champion: name(e.championId), opponent: name(e.opponentId)! }, ROLE_LABELS[e.role]);
  const row = e.note as AdminNoteRow | null;
  const state = stateWords(row, names);
  const published = row?.note.status === "published";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2" data-testid="matchup-queue-row" data-key={e.key} data-state={row ? (row.note.status === "published" ? row.freshness.state : row.note.status) : "none"}>
      <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <RoleIcon role={e.role} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 font-medium text-fg">{scope}</span>
      </span>
      <span className="text-sm tabular-nums text-fg-muted" data-testid="matchup-queue-games">
        {e.games ? `${formatCount(e.games)} ${e.games === 1 ? "game" : "games"} this season · ${formatCount(e.withTimeline)} with a timeline${e.last ? ` · last met ${timeAgo(new Date(e.last))}` : ""}` : "Not met this season"}
      </span>
      <span className={cn("text-sm", TONE[state.tone])} data-testid="matchup-queue-state">
        {state.words}
      </span>
      <span className="ml-auto flex gap-2">
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

export function MatchupNotesAdmin({ data }: { data: MatchupNotesAdminData }) {
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

  return (
    <div className="space-y-5" data-testid="matchup-notes-admin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" data-testid="matchup-notes-counts" data-published={published.length} data-review={needs} data-drafts={drafts}>
          {formatCount(published.length)} published · {formatCount(needs)} {needs === 1 ? "needs" : "need"} re-review · {formatCount(drafts)} {drafts === 1 ? "draft" : "drafts"}
          {current ? ` · current patch ${current}` : ""}
        </p>
        <Button variant="primary" size="sm" onClick={() => setEditing({ id: null, input: blank(role ?? "TOP") })} data-testid="matchup-notes-new">
          <Plus className="h-4 w-4" aria-hidden />
          New note
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="radiogroup" aria-label="Matchup notes view" className={segmentedGroupClass()} data-testid="matchup-notes-tabs">
          {(["queue", "all"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tab === t} onClick={() => setTab(t)} className={segmentClass(tab === t, { size: "md" })} data-value={t}>
              {t === "queue" ? "Queue" : "All notes"}
            </button>
          ))}
        </div>
        <RoleSegmented label="Role" roles={ROLES} value={role} onChange={setRole} allowAll testId="matchup-notes-role" />
      </div>
      {tab === "queue" ? (
        <div className="space-y-6" data-testid="matchup-notes-queue">
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
        <ul className="divide-y divide-border" data-testid="matchup-notes-all">
          {data.notes.filter((n) => !role || n.note.role === role).length === 0 ? <li className="py-2 text-sm text-fg-muted">No notes yet.</li> : null}
          {data.notes
            .filter((n) => !role || n.note.role === role)
            .map((n) => {
              const state = stateWords(n, names);
              const scope = scopeName(n.note, { champion: n.note.championId ? (names.get(n.note.championId) ?? n.note.championId) : null, opponent: names.get(n.note.opponentId) ?? n.note.opponentId }, ROLE_LABELS[n.note.role]);
              return (
                <li key={n.note.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2" data-testid="matchup-note-row" data-status={n.note.status} data-state={n.freshness.state}>
                  <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
                    <RoleIcon role={n.note.role} className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-fg">{scope}</span>
                  </span>
                  <span className={cn("text-sm", TONE[state.tone])}>{state.words}</span>
                  <span className="text-sm text-fg-muted">{n.reviewer ? `by ${n.reviewer}` : n.note.status === "published" ? "by an administrator" : ""}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {n.note.status !== "retired" ? (
                      <Button size="sm" variant="ghost" onClick={() => edit(n.note)} data-testid="matchup-note-edit">
                        Edit
                      </Button>
                    ) : null}
                    {n.note.status === "published" ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setReviewing(n)} data-testid="matchup-note-review">
                          Re-review
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "unpublish", note: n.note })} data-testid="matchup-note-unpublish">
                          Unpublish
                        </Button>
                      </>
                    ) : null}
                    {n.note.status === "draft" && !n.note.reviewedAt ? (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "delete", note: n.note })} data-testid="matchup-note-delete">
                        Delete
                      </Button>
                    ) : null}
                    {n.note.status !== "retired" ? (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "retire", note: n.note })} data-testid="matchup-note-retire">
                        Retire
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
      {editing ? <NoteEditor key={editing.id ?? "new"} id={editing.id} initial={editing.input} champions={data.champions} currentPatch={current} onClose={() => setEditing(null)} onSaved={(published) => { setEditing(null); done(published ? "Note published" : "Draft saved"); }} /> : null}
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
  );
}
