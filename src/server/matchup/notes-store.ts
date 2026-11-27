import { unstable_cache, revalidateTag } from "next/cache";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { getDbHandle } from "@/server/db/client";
import { matchupNotes, players, riotAccounts, users } from "@/server/db/schema";
import { getCurrentPatch, listChampions, listPatchesDesc } from "@/server/repositories/champions";
import { loadChampionAbilities } from "@/server/riot/static/abilities";
import { cachedFor } from "@/server/observability/cache";
import { log } from "@/server/observability/log";
import { cleanNoteInput, noteFreshness, scopeChampions, validateNote, type MatchupNote, type NoteInput, type NoteProblem, type NoteStatus, type PairNotes, type ShownNote } from "@/domain/matchup/notes";
import { isRole, type Role } from "@/domain/roles";
import { abilityHashes, changedParts, kitHash } from "./kit-hash";
import { withLongestPoints } from "./longest-notes";

/*
  Matchup Intel's reviewed notes in the database (matchup_notes, migration 0071;
  docs/MATCHUP_INTEL.md, "Reviewed notes"): the band's read of one pair's published notes, with each
  note's freshness from Riot's data as stored now; and Admin's writes, each validated on the server
  with the same rules as the editor (domain/matchup/notes validateNote) and recorded in Audit Logs
  by the actions (server/actions/matchup-notes.ts).

  - The band reads published notes only, cached for NOTES_CACHE_SECONDS in Next's data cache (tag
    NOTES_CACHE_TAG, dropped by every note action), production only (the demo reads each time).
  - Publishing (and Confirm) records the review: the administrator's account, the time, the current
    patch and its Data Dragon version, and each scope champion's kit and ability hashes from the
    stored abilities; a champion whose abilities are not stored cannot be reviewed.
  - Members are shown "an administrator" for the reviewer; Admin shows the account's display name.
*/

export const NOTES_CACHE_TAG = "matchup-notes";
const NOTES_CACHE_SECONDS = 10 * 60;

/** Whether reads go through Next's data cache: inside the Next server, on the production database only. */
async function sharedCacheFor(db: Db): Promise<boolean> {
  if (!process.env.NEXT_RUNTIME) return false;
  try {
    const handle = await getDbHandle();
    return handle.db === db && handle.mode === "postgres";
  } catch {
    return false;
  }
}

type Row = typeof matchupNotes.$inferSelect;
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

function noteOf(r: Row): MatchupNote {
  return {
    id: r.id,
    scope: r.scope === "pair" ? "pair" : "opponent",
    role: (isRole(r.role) ? r.role : "TOP") as Role,
    opponentId: r.opponentId,
    championId: r.championId,
    status: (["draft", "published", "retired"].includes(r.status) ? r.status : "draft") as NoteStatus,
    points: (r.points ?? []).map((p) => ({ text: String(p.text ?? ""), refs: Array.isArray(p.refs) ? p.refs.map(String) : [], levels: p.levels === "1-3" || p.levels === "6" ? p.levels : null })),
    sources: r.sources ?? [],
    reviewedPatch: r.reviewedPatch,
    reviewedVersion: r.reviewedVersion,
    reviewedAt: iso(r.reviewedAt),
    kitHashes: r.kitHashes ?? null,
    abilityHashes: r.abilityHashes ?? null,
    updatedAt: iso(r.updatedAt) ?? new Date(0).toISOString(),
  };
}

/** Each champion's current kit hash and ability hashes, from the stored abilities (cached per instance). */
export async function currentKits(db: Db, ids: readonly string[]): Promise<{ kits: Record<string, string | null>; abilities: Record<string, Record<string, string>>; slots: Record<string, string[]>; version: string | null }> {
  const loaded = await loadChampionAbilities(db, [...new Set(ids)]);
  const kits: Record<string, string | null> = {};
  const abilities: Record<string, Record<string, string>> = {};
  const slots: Record<string, string[]> = {};
  for (const id of ids) {
    const rec = loaded.champions[id] ?? null;
    kits[id] = kitHash(rec);
    abilities[id] = abilityHashes(rec);
    slots[id] = (rec?.abilities ?? []).map((a) => a.slot);
  }
  return { kits, abilities, slots, version: loaded.version };
}

/** The published notes for a pair in a role: its pair notes (this direction) first, then its opponent notes. */
async function publishedFor(db: Db, role: Role, championId: string, opponentId: string): Promise<MatchupNote[]> {
  const read = async () => {
    const rows = await db
      .select()
      .from(matchupNotes)
      .where(and(eq(matchupNotes.status, "published"), eq(matchupNotes.role, role), eq(matchupNotes.opponentId, opponentId), or(and(eq(matchupNotes.scope, "pair"), eq(matchupNotes.championId, championId)), eq(matchupNotes.scope, "opponent"))))
      .orderBy(desc(matchupNotes.scope), desc(matchupNotes.reviewedAt));
    return rows.map(noteOf);
  };
  return (await sharedCacheFor(db)) ? unstable_cache(read, ["matchup-notes", "1", role, championId, opponentId], { revalidate: NOTES_CACHE_SECONDS, tags: [NOTES_CACHE_TAG] })() : read();
}

/** The band's notes for one pair: every published one with its freshness; a failure reads as none, logged. */
export async function notesForPair(db: Db, input: { role: Role; championId: string; opponentId: string }, test?: { ageDistance?: number | null; kitChanged?: boolean; longest?: boolean }): Promise<PairNotes> {
  try {
    const [notes, current, known] = await Promise.all([publishedFor(db, input.role, input.championId, input.opponentId), getCurrentPatch(db), cachedFor("patch:known", 10 * 60_000, () => listPatchesDesc(db), db)]);
    const currentPatch = current?.patch ?? null;
    if (!notes.length) return { notes: [], currentPatch };
    const { kits } = await currentKits(db, [input.championId, input.opponentId]);
    // Browser tests only (the in-memory demo): a note as if reviewed so many patches before the
    // current one (the patches counted back from it), a kit as if Riot changed the opponent, or the
    // longest points a note may hold in place of the demo's (./longest-notes.ts).
    const age = test?.ageDistance ?? null;
    const m = /^(\d+)\.(\d+)$/.exec(currentPatch ?? "");
    const aged = age !== null && m ? Array.from({ length: Number(m[2]) }, (_, k) => `${m[1]}.${Number(m[2]) - k}`) : null;
    const knownNow = aged ?? known;
    const now = test?.kitChanged ? { ...kits, [input.opponentId]: "changed-for-test" } : kits;
    return {
      currentPatch,
      notes: notes.map((note) => {
        const reviewed = aged && age !== null ? (aged[Math.min(age, aged.length - 1)] ?? note.reviewedPatch) : note.reviewedPatch;
        const shown = { ...(test?.longest ? withLongestPoints(note) : note), reviewedPatch: reviewed };
        return { note: shown, freshness: noteFreshness(shown, { current: currentPatch, knownDesc: knownNow, kitHashes: now }) };
      }),
    };
  } catch (err) {
    log("error", "matchup.notes.failed", { role: input.role, error: err });
    return { status: "unavailable" };
  }
}

/** One note as Admin lists it: the note, its freshness, and the reviewer's display name (Admin only). */
export interface AdminNote extends ShownNote {
  reviewer: string | null;
  /** What changed in Riot's data since the review, by champion ("E", "base stats"). */
  changedParts: Record<string, string[]>;
}

/** Every note (drafts, published and retired), newest first, with its state now. */
export async function listAllNotes(db: Db): Promise<{ notes: AdminNote[]; currentPatch: string | null; knownDesc: string[] }> {
  const [rows, current, known] = await Promise.all([
    db.select({ note: matchupNotes, reviewer: users.displayName }).from(matchupNotes).leftJoin(users, eq(users.id, matchupNotes.reviewedBy)).orderBy(desc(matchupNotes.updatedAt)).limit(1000),
    getCurrentPatch(db),
    listPatchesDesc(db),
  ]);
  const ids = [...new Set(rows.flatMap((r) => scopeChampions(noteOf(r.note))))];
  const { kits, abilities }: { kits: Record<string, string | null>; abilities: Record<string, Record<string, string>> } = ids.length ? await currentKits(db, ids) : { kits: {}, abilities: {} };
  const currentPatch = current?.patch ?? null;
  return {
    currentPatch,
    knownDesc: known,
    notes: rows.map(({ note: r, reviewer }) => {
      const note = noteOf(r);
      const changed: Record<string, string[]> = {};
      for (const id of scopeChampions(note)) {
        const parts = changedParts(note.abilityHashes?.[id], abilities[id] ?? {});
        if (parts.length && note.kitHashes?.[id] !== kits[id]) changed[id] = parts;
      }
      return { note, freshness: noteFreshness(note, { current: currentPatch, knownDesc: known, kitHashes: kits }), reviewer: reviewer ?? null, changedParts: changed };
    }),
  };
}

/** Names no note may hold: accounts' usernames and display names, players' names and linked Riot names; a champion's name is never one of them. */
async function forbiddenNames(db: Db): Promise<string[]> {
  const [u, p, ra, roster] = await Promise.all([
    db.select({ a: users.username, b: users.displayName }).from(users),
    db.select({ a: players.displayName }).from(players),
    db.select({ a: riotAccounts.gameName }).from(riotAccounts).where(eq(riotAccounts.ownerType, "player")),
    listChampions(db),
  ]);
  const champions = new Set(roster.flatMap((c) => [c.id.toLowerCase(), c.name.toLowerCase()]));
  return [...new Set([...u.flatMap((r) => [r.a, r.b]), ...p.map((r) => r.a), ...ra.map((r) => r.a)].filter((n): n is string => typeof n === "string" && n.trim().length >= 3 && !champions.has(n.trim().toLowerCase())))];
}

export class NoteRefused extends Error {
  constructor(readonly problems: NoteProblem[]) {
    super(problems[0]?.message ?? "The note cannot be saved.");
  }
}

/** The note's problems against the roster, the stored kits and the names; none: it may be saved. */
export async function checkNote(db: Db, input: NoteInput): Promise<NoteProblem[]> {
  const roster = new Set((await listChampions(db)).map((c) => c.id));
  const scope = scopeChampions(input).filter((id) => roster.has(id));
  const slots: Record<string, string[]> = scope.length ? (await currentKits(db, scope)).slots : {};
  return validateNote(input, { kits: slots, roster, names: await forbiddenNames(db) });
}

/** The review fields for a note's scope now: the current patch, its version, each champion's hashes; null where Riot's data cannot be reviewed. */
async function reviewNow(db: Db, input: Pick<NoteInput, "scope" | "opponentId" | "championId">, userId: string | null) {
  const current = await getCurrentPatch(db);
  const ids = scopeChampions(input);
  const { kits, abilities } = await currentKits(db, ids);
  if (!current || ids.some((id) => !kits[id])) throw new NoteRefused([{ field: "opponentId", message: "Riot's data for these champions is not stored on the current patch yet, so the note cannot be reviewed." }]);
  return {
    reviewedBy: userId,
    reviewedAt: new Date(),
    reviewedPatch: current.patch,
    reviewedVersion: current.ddragonVersion,
    kitHashes: Object.fromEntries(ids.map((id) => [id, kits[id]!])),
    abilityHashes: Object.fromEntries(ids.map((id) => [id, abilities[id]!])),
  };
}

/** Saves a note as a draft (a published one goes back to the drafts) or publishes it (a new one when `id` is null); refused with its problems. */
export async function saveNote(db: Db, userId: string | null, id: string | null, raw: NoteInput, publish: boolean): Promise<MatchupNote> {
  const input = cleanNoteInput(raw);
  const problems = await checkNote(db, input);
  if (problems.length) throw new NoteRefused(problems);
  const review = publish ? await reviewNow(db, input, userId) : {};
  // Saving a draft of a published note takes it off the band until it is published (and reviewed) again: changed text never shows under an old review.
  const fields = { scope: input.scope, role: input.role, opponentId: input.opponentId, championId: input.championId, points: input.points, sources: input.sources, updatedBy: userId, updatedAt: new Date(), status: publish ? ("published" as const) : ("draft" as const), ...review };
  try {
    if (id) {
      const [row] = await db.update(matchupNotes).set(fields).where(and(eq(matchupNotes.id, id), ne(matchupNotes.status, "retired"))).returning();
      if (!row) throw new NoteRefused([{ field: "scope", message: "That note is not there any more." }]);
      return noteOf(row);
    }
    const [row] = await db.insert(matchupNotes).values({ ...fields, createdBy: userId }).returning();
    return noteOf(row!);
  } catch (err) {
    if (err instanceof NoteRefused) throw err;
    if (/matchup_notes_live_idx|duplicate key/i.test(String((err as Error)?.message ?? err)) || /matchup_notes_live_idx/.test(String((err as { cause?: Error })?.cause?.message ?? ""))) throw new NoteRefused([{ field: "scope", message: "A note for this lane and these champions already exists: edit that one." }]);
    throw err;
  }
}

/** Confirms a published note for the current patch, its text unchanged (a new review record and hashes). */
export async function confirmNote(db: Db, userId: string | null, id: string): Promise<MatchupNote> {
  const [row] = await db.select().from(matchupNotes).where(eq(matchupNotes.id, id)).limit(1);
  if (!row || row.status !== "published") throw new NoteRefused([{ field: "scope", message: "Only a published note can be confirmed." }]);
  const note = noteOf(row);
  const problems = await checkNote(db, note);
  if (problems.length) throw new NoteRefused(problems);
  const review = await reviewNow(db, note, userId);
  const [done] = await db.update(matchupNotes).set({ ...review, updatedBy: userId, updatedAt: new Date() }).where(eq(matchupNotes.id, id)).returning();
  return noteOf(done!);
}

/** Back to a draft (unpublish) or retired; a retired note frees its scope for a new one. */
export async function setNoteStatus(db: Db, userId: string | null, id: string, status: "draft" | "retired"): Promise<MatchupNote> {
  const [row] = await db.update(matchupNotes).set({ status, updatedBy: userId, updatedAt: new Date() }).where(and(eq(matchupNotes.id, id), ne(matchupNotes.status, "retired"))).returning();
  if (!row) throw new NoteRefused([{ field: "scope", message: "That note is not there any more." }]);
  return noteOf(row);
}

/** Deletes a draft that was never published (published notes are retired instead, so their review stays on record). */
export async function deleteDraft(db: Db, id: string): Promise<MatchupNote> {
  const [row] = await db.delete(matchupNotes).where(and(eq(matchupNotes.id, id), eq(matchupNotes.status, "draft"), isNull(matchupNotes.reviewedAt))).returning();
  if (!row) throw new NoteRefused([{ field: "scope", message: "Only a draft that was never published can be deleted; retire a published note." }]);
  return noteOf(row);
}

/** One note by id (Admin's dialogs). */
export async function getNote(db: Db, id: string): Promise<MatchupNote | null> {
  const [row] = await db.select().from(matchupNotes).where(eq(matchupNotes.id, id)).limit(1);
  return row ? noteOf(row) : null;
}

/** The notes' counts by state (Admin's header and dashboard, /api/health): numbers only. */
export interface NotesCounts {
  published: number;
  fresh: number;
  stale: number;
  hidden: number;
  drafts: number;
}

/** Counts of the notes by state now; cached per instance for ten minutes (health is polled). */
export async function notesCounts(db: Db): Promise<NotesCounts> {
  return cachedFor("matchup-notes:counts", 10 * 60_000, async () => {
    const rows = await db.select().from(matchupNotes).where(inArray(matchupNotes.status, ["published", "draft"]));
    const published = rows.filter((r) => r.status === "published").map(noteOf);
    const ids = [...new Set(published.flatMap(scopeChampions))];
    const [current, known] = await Promise.all([getCurrentPatch(db), listPatchesDesc(db)]);
    const kits: Record<string, string | null> = ids.length ? (await currentKits(db, ids)).kits : {};
    const states = published.map((n) => noteFreshness(n, { current: current?.patch ?? null, knownDesc: known, kitHashes: kits }).state);
    return { published: published.length, fresh: states.filter((s) => s === "fresh").length, stale: states.filter((s) => s === "stale").length, hidden: states.filter((s) => s === "hidden-changed" || s === "hidden-old").length, drafts: rows.length - published.length };
  }, db);
}

/** Drops the band's cached notes and this instance's counts (every note action). */
export function forgetMatchupNotes(): void {
  try {
    revalidateTag(NOTES_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside a request of the Next server: nothing cached here.
  }
}

/** Ids only, for the dialogs' checks: is this a note id. */
export const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every stored note's scope champions (the queue joins its state by them). */
export async function liveNoteKeys(db: Db): Promise<Array<{ scope: string; role: string; opponentId: string; championId: string | null; status: string }>> {
  return db.select({ scope: matchupNotes.scope, role: matchupNotes.role, opponentId: matchupNotes.opponentId, championId: matchupNotes.championId, status: matchupNotes.status }).from(matchupNotes).where(ne(matchupNotes.status, "retired"));
}
