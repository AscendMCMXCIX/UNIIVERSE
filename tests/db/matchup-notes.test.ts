import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Matchup Intel's reviewed notes (matchup_notes, migration 0071; docs/MATCHUP_INTEL.md, "Reviewed
  notes") through Admin's server actions, on the committed Data Dragon fixture: only administrators
  may write; publishing records the reviewer, the patch and the kit hashes; one live note per scope
  (retiring frees it); refused words come back with their field and reason; Audit Logs name the
  scope in champion names only; the band's read shows a note fresh and hides it when Riot's data
  changed; an erasure removes the account links; the table's own checks hold.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as Session | null }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: () => unknown) => fn }));
vi.mock("@/server/auth/session", async (orig) => {
  const { hasPermission } = await import("@/server/auth/permissions");
  const notAllowed = (message: string) => Object.assign(new Error(message), { name: "NotAuthorizedError" });
  return {
    ...(await orig<object>()),
    getSession: async () => state.session,
    requirePermission: async (permission: Parameters<typeof hasPermission>[1]) => {
      if (!state.session) throw notAllowed("Please sign in.");
      if (!hasPermission(state.session, permission)) throw notAllowed("You don't have permission to do that.");
      return state.session;
    },
  };
});

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { auditEvents, matchupNotes, users } from "@/server/db/schema";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { seedChampionAbilitiesFromFixture } from "@/server/riot/static/abilities";
import { invalidateAllCaches } from "@/server/observability/cache";
import { confirmMatchupNoteAction, deleteMatchupNoteDraftAction, retireMatchupNoteAction, saveMatchupNoteAction, unpublishMatchupNoteAction } from "@/server/actions/matchup-notes";
import { listAllNotes, notesCounts, notesForPair } from "@/server/matchup/notes-store";
import { eraseSubject, memberSubject } from "@/server/privacy/erasure";
import type { NoteInput } from "@/domain/matchup/notes";

let handle: DbHandle;
const id = { owner: randomUUID(), dana: randomUUID(), eve: randomUUID() };
const session = (userId: string, username: string, over: Partial<Session> = {}): Session => ({ userId, username, label: username, role: "player", playerId: null, hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: STANDARD_PLAYER, teamMember: true, ...over });
const asAdmin = () => (state.session = session(id.dana, "dana", { admin: true }));
const asPlayer = () => (state.session = session(id.eve, "eve"));
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

const pair = (over: Partial<NoteInput> = {}): NoteInput => ({
  scope: "pair",
  role: "TOP",
  opponentId: "Darius",
  championId: "Riven",
  points: [{ text: "Darius's E pulls champions in front of him and slows them.", refs: ["Darius.E"], levels: "1-3" }],
  sources: [{ kind: "client", title: "Darius's E tooltip", url: "", patch: "26.22" }],
  ...over,
});

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await seedChampionAbilitiesFromFixture(handle.db);
  invalidateAllCaches();
  await handle.db.insert(users).values([
    { id: id.owner, username: "owner", displayName: "Owner", passwordHash: "x", role: "owner" },
    { id: id.dana, username: "dana", displayName: "Dana Reviewer", passwordHash: "x", role: "player", isAdmin: true },
    { id: id.eve, username: "eve", displayName: "Eve", passwordHash: "x", role: "player" },
  ]);
});

afterAll(async () => {
  await handle?.close();
});

describe("the notes' actions", () => {
  it("refuse anyone who is not an administrator before reading anything", async () => {
    state.session = null;
    expect(await saveMatchupNoteAction(null, pair(), true)).toMatchObject({ ok: false, error: "Please sign in." });
    asPlayer();
    expect(await saveMatchupNoteAction(null, pair(), true)).toMatchObject({ ok: false, error: "You don't have permission to do that." });
    expect(await retireMatchupNoteAction(randomUUID())).toMatchObject({ ok: false, error: "You don't have permission to do that." });
    expect(Number(rowsOf<{ n: unknown }>(await handle.db.execute(sql`SELECT count(*) AS n FROM matchup_notes`))[0]!.n)).toBe(0);
  });

  it("save a draft, then publish it with the reviewer, the patch and each champion's kit hash; Audit Logs name the champions only", async () => {
    asAdmin();
    const draft = await saveMatchupNoteAction(null, pair(), false);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.note).toMatchObject({ status: "draft", reviewedPatch: null });
    const published = await saveMatchupNoteAction(draft.note.id, pair(), true);
    if (!published.ok) throw new Error(published.error);
    expect(published.note.status).toBe("published");
    expect(published.note.reviewedPatch).toMatch(/^\d+\.\d+$/);
    expect(Object.keys(published.note.kitHashes!).sort()).toEqual(["Darius", "Riven"]);
    expect(published.note.kitHashes!.Darius).toMatch(/^[0-9a-f]{24}$/);
    const [row] = await handle.db.select().from(matchupNotes).where(eq(matchupNotes.id, draft.note.id));
    expect(row!.reviewedBy).toBe(id.dana);
    const audit = await handle.db.select().from(auditEvents).where(eq(auditEvents.targetId, draft.note.id));
    expect(audit.map((a) => a.action).sort()).toEqual(["matchup-note.create", "matchup-note.publish"]);
    // Audit Logs name the scope in a sentence, never "key: value".
    expect(audit.every((a) => a.targetName === "Riven against Darius in Top" && a.targetType === "matchup-note")).toBe(true);
    expect(JSON.stringify(audit.map((a) => a.details))).not.toMatch(/dana|Dana|eve/);
  });

  it("keep one live note per scope, refuse a refused word with its field and reason, and free the scope once retired", async () => {
    asAdmin();
    const again = await saveMatchupNoteAction(null, pair(), false);
    expect(again).toMatchObject({ ok: false, error: "A note for this lane and these champions already exists: edit that one." });
    const advice = await saveMatchupNoteAction(null, pair({ scope: "opponent", championId: null, points: [{ text: "You should stay out of Darius's E range.", refs: ["Darius.E"], levels: null }] }), true);
    expect(advice.ok).toBe(false);
    if (advice.ok) return;
    expect(advice.problems.map((p) => p.field)).toContain("points.0");
    expect(advice.problems.map((p) => p.message).join(" ")).toMatch(/"should" is an instruction to the player/);
    expect(await saveMatchupNoteAction(null, pair({ points: [{ text: "Dana Reviewer plays this lane.", refs: ["Darius.E"], levels: null }] }), false)).toMatchObject({ ok: false });
    const [live] = await handle.db.select().from(matchupNotes).where(eq(matchupNotes.scope, "pair"));
    expect(await retireMatchupNoteAction(live!.id)).toMatchObject({ ok: true, note: { status: "retired" } });
    const fresh = await saveMatchupNoteAction(null, pair(), true);
    expect(fresh.ok).toBe(true);
    // Unpublish takes it back to a draft; a draft that was once published cannot be deleted, only retired.
    if (!fresh.ok) return;
    expect(await unpublishMatchupNoteAction(fresh.note.id)).toMatchObject({ ok: true, note: { status: "draft" } });
    expect(await deleteMatchupNoteDraftAction(fresh.note.id)).toMatchObject({ ok: false });
    expect(await saveMatchupNoteAction(fresh.note.id, pair(), true)).toMatchObject({ ok: true });
    // A published note saved as a draft leaves the band until it is published again.
    expect(await saveMatchupNoteAction(fresh.note.id, pair(), false)).toMatchObject({ ok: true, note: { status: "draft" } });
    expect(await saveMatchupNoteAction(fresh.note.id, pair(), true)).toMatchObject({ ok: true, note: { status: "published" } });
  });

  it("delete a draft never published, and confirm a published note for the current patch", async () => {
    asAdmin();
    const draft = await saveMatchupNoteAction(null, pair({ role: "MID", opponentId: "Zed", championId: "Ahri", points: [{ text: "Zed's W shadow can be swapped to.", refs: ["Zed.W"], levels: null }] }), false);
    if (!draft.ok) throw new Error(draft.error);
    expect(await deleteMatchupNoteDraftAction(draft.note.id)).toMatchObject({ ok: true });
    const [live] = await handle.db.select().from(matchupNotes).where(eq(matchupNotes.status, "published"));
    const confirmed = await confirmMatchupNoteAction(live!.id);
    expect(confirmed).toMatchObject({ ok: true, note: { status: "published" } });
  });
});

describe("the band's read", () => {
  it("shows a published note fresh for its pair, and hides it as changed when a champion's kit hash differs", async () => {
    const shown = await notesForPair(handle.db, { role: "TOP", championId: "Riven", opponentId: "Darius" });
    if ("status" in shown) throw new Error("unavailable");
    expect(shown.notes.map((n) => n.freshness.state)).toEqual(["fresh"]);
    expect(await notesForPair(handle.db, { role: "TOP", championId: "Garen", opponentId: "Darius" })).toMatchObject({ notes: [] });
    const changed = await notesForPair(handle.db, { role: "TOP", championId: "Riven", opponentId: "Darius" }, { kitChanged: true });
    if ("status" in changed) throw new Error("unavailable");
    expect(changed.notes[0]!.freshness).toEqual({ state: "hidden-changed", changed: ["Darius"] });
    await handle.db.update(matchupNotes).set({ kitHashes: { Riven: "old", Darius: "old" } }).where(eq(matchupNotes.status, "published"));
    const stale = await notesForPair(handle.db, { role: "TOP", championId: "Riven", opponentId: "Darius" });
    if ("status" in stale) throw new Error("unavailable");
    expect(stale.notes[0]!.freshness.state).toBe("hidden-changed");
    const admin = await listAllNotes(handle.db);
    expect(admin.notes.find((n) => n.note.status === "published")!.reviewer).toBe("Dana Reviewer");
    invalidateAllCaches();
    expect(await notesCounts(handle.db)).toMatchObject({ published: 1, hidden: 1, fresh: 0 });
  });
});

describe("the table", () => {
  it("refuses a published note without its review, a pair without a champion, and a role it does not know", async () => {
    const bad = async (values: Record<string, unknown>) => {
      try {
        await handle.db.insert(matchupNotes).values({ scope: "opponent", role: "TOP", opponentId: "Garen", points: [], ...values } as typeof matchupNotes.$inferInsert);
        return false;
      } catch {
        return true;
      }
    };
    expect(await bad({ status: "published" })).toBe(true);
    expect(await bad({ scope: "pair" })).toBe(true);
    expect(await bad({ role: "BOT" })).toBe(true);
    expect(await bad({ status: "published", reviewedAt: new Date(), reviewedPatch: "16.22", kitHashes: { Garen: "x" } })).toBe(false);
  });

  it("loses the links to an erased administrator's account and keeps the notes", async () => {
    const before = await handle.db.select().from(matchupNotes);
    expect(before.some((n) => n.reviewedBy === id.dana || n.createdBy === id.dana)).toBe(true);
    await eraseSubject(handle.db, id.owner, await memberSubject(handle.db, { userId: id.dana }));
    const after = await handle.db.select().from(matchupNotes);
    expect(after).toHaveLength(before.length);
    expect(after.some((n) => n.reviewedBy === id.dana || n.createdBy === id.dana || n.updatedBy === id.dana)).toBe(false);
  });
});
