"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { publicErrorMessage } from "@/server/errors";
import { invalidateCache } from "@/server/observability/cache";
import { listChampions } from "@/server/repositories/champions";
import { NOTE_ID, NoteRefused, confirmNote, deleteDraft, forgetMatchupNotes, getNote, saveNote, setNoteStatus } from "@/server/matchup/notes-store";
import { forgetMatchupQueue } from "@/server/matchup/queue";
import type { AuditAction } from "@/domain/audit";
import { scopeSentence, type MatchupNote, type NoteInput, type NoteProblem } from "@/domain/matchup/notes";
import { publicPatchName } from "@/domain/patch";
import { ROLE_LABELS } from "@/domain/roles";

/*
  Admin Mode → Platform Settings → Matchup notes (docs/MATCHUP_INTEL.md, "Curation"). Every action
  checks the administrator permission itself first (manage-branding: the content permission that
  Resources uses; OD-M5); the page hiding the controls is not the protection. Each note is validated
  on the server with the editor's own rules (notes-store checkNote), and each change is recorded in
  Audit Logs with the note's scope in champion names only ("Riven against Darius in Top") and the patch.
*/

export type NoteResult = { ok: true; note: MatchupNote } | { ok: false; error: string; problems: NoteProblem[] };

/** The note's scope in words, for Audit Logs: champion names only. */
async function nameOf(db: Awaited<ReturnType<typeof getAppDb>>, note: Pick<MatchupNote, "scope" | "role" | "opponentId" | "championId">): Promise<string> {
  const names = new Map((await listChampions(db)).map((c) => [c.id, c.name]));
  return scopeSentence(note, { champion: note.championId ? (names.get(note.championId) ?? note.championId) : null, opponent: names.get(note.opponentId) ?? note.opponentId }, ROLE_LABELS[note.role]);
}

/** After any change: the band's cached notes, the queue, the counts, and the Admin page. */
function forget() {
  forgetMatchupNotes();
  forgetMatchupQueue();
  invalidateCache("matchup-notes");
  revalidatePath("/admin/matchup-notes");
}

function refused(err: unknown): NoteResult {
  if (err instanceof NoteRefused) return { ok: false, error: err.message, problems: err.problems };
  return { ok: false, error: publicErrorMessage(err), problems: [] };
}

const idOf = (value: unknown): string => {
  if (typeof value !== "string" || !NOTE_ID.test(value)) throw new NoteRefused([{ field: "scope", message: "That note is not valid." }]);
  return value;
};

/** Saves a note as a draft, or publishes it (recording the review): a new one when `id` is null. */
export async function saveMatchupNoteAction(id: string | null, input: NoteInput, publish: boolean): Promise<NoteResult> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    const known = id === null ? null : await getNote(db, idOf(id));
    if (id !== null && !known) throw new NoteRefused([{ field: "scope", message: "That note is not there any more." }]);
    const note = await saveNote(db, session.userId, known ? known.id : null, input, publish === true);
    const action: AuditAction = publish ? "matchup-note.publish" : known ? "matchup-note.update" : "matchup-note.create";
    await recordAudit(db, session, { action, target: { type: "matchup-note", id: note.id, name: await nameOf(db, note) }, details: { patch: note.reviewedPatch ? publicPatchName(note.reviewedPatch) : null } });
    forget();
    return { ok: true, note };
  } catch (err) {
    return refused(err);
  }
}

/** Confirms a published note for the current patch, its text unchanged. */
export async function confirmMatchupNoteAction(id: string): Promise<NoteResult> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    const note = await confirmNote(db, session.userId, idOf(id));
    await recordAudit(db, session, { action: "matchup-note.confirm", target: { type: "matchup-note", id: note.id, name: await nameOf(db, note) }, details: { patch: note.reviewedPatch ? publicPatchName(note.reviewedPatch) : null } });
    forget();
    return { ok: true, note };
  } catch (err) {
    return refused(err);
  }
}

/** Takes a published note off the band: back to a draft. */
export async function unpublishMatchupNoteAction(id: string): Promise<NoteResult> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    const note = await setNoteStatus(db, session.userId, idOf(id), "draft");
    await recordAudit(db, session, { action: "matchup-note.unpublish", target: { type: "matchup-note", id: note.id, name: await nameOf(db, note) } });
    forget();
    return { ok: true, note };
  } catch (err) {
    return refused(err);
  }
}

/** Retires a note (kept on record, never shown; its scope is free for a new one). */
export async function retireMatchupNoteAction(id: string): Promise<NoteResult> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    const note = await setNoteStatus(db, session.userId, idOf(id), "retired");
    await recordAudit(db, session, { action: "matchup-note.retire", target: { type: "matchup-note", id: note.id, name: await nameOf(db, note) } });
    forget();
    return { ok: true, note };
  } catch (err) {
    return refused(err);
  }
}

/** Deletes a draft that was never published. */
export async function deleteMatchupNoteDraftAction(id: string): Promise<NoteResult> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    const note = await deleteDraft(db, idOf(id));
    await recordAudit(db, session, { action: "matchup-note.delete-draft", target: { type: "matchup-note", id: note.id, name: await nameOf(db, note) } });
    forget();
    return { ok: true, note };
  } catch (err) {
    return refused(err);
  }
}
