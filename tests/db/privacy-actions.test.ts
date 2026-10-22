import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Admin Mode → Users & Permissions → Personal data, through its server actions (synthetic people,
  never a real player): only administrators may look at, erase, release, export, import or
  re-apply anything; an erasure needs the exact confirmation; the Owner, the administrator's own
  account and (for an administrator who is not the Owner) other administrators are protected;
  and the audit log keeps a reference and counts, never the person. The erasure itself is tested
  in depth in privacy-erasure.test.ts.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as Session | null }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => {
  const { hasPermission } = await import("@/server/auth/permissions");
  const notAllowed = (message: string) => Object.assign(new Error(message), { name: "NotAuthorizedError" });
  return {
    ...(await orig<object>()),
    getSession: async () => state.session,
    // The real rule (session.ts): signed in, and the permission held.
    requirePermission: async (permission: Parameters<typeof hasPermission>[1]) => {
      if (!state.session) throw notAllowed("Please sign in.");
      if (!hasPermission(state.session, permission)) throw notAllowed("You don't have permission to do that.");
      return state.session;
    },
  };
});

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { auditEvents, players, privacyErasures, riotAccounts, users } from "@/server/db/schema";
import { getOrCreateTeam } from "@/server/repositories/team";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { eraseAction, exportErasuresAction, importErasuresAction, listErasuresAction, previewErasureAction, reconcileErasuresAction, releaseErasureAction } from "@/server/actions/privacy";

let handle: DbHandle;
const id = { owner: randomUUID(), dana: randomUUID(), eve: randomUUID(), pat: randomUUID(), patPlayer: randomUUID(), patAccount: randomUUID() };

const session = (userId: string, username: string, over: Partial<Session> = {}): Session => ({ userId, username, label: username, role: "player", playerId: null, hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: STANDARD_PLAYER, teamMember: true, ...over });
const asOwner = () => (state.session = session(id.owner, "owner", { role: "owner" }));
const asAdmin = () => (state.session = session(id.dana, "dana", { admin: true }));
const asPlayer = () => (state.session = session(id.eve, "eve"));
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const count = async (table: "users" | "players" | "riot_accounts" | "privacy_erasures") => Number(rowsOf<{ n: number | string }>(await handle.db.execute(sql.raw(`SELECT count(*) AS n FROM ${table}`)))[0]?.n);

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  await handle.db.insert(players).values({ id: id.patPlayer, teamId, displayName: "Pat Example", riotId: "PatExample#OCE", primaryRole: "TOP" });
  await handle.db.insert(users).values([
    { id: id.owner, username: "owner", displayName: "Owner", passwordHash: "x", role: "owner" },
    { id: id.dana, username: "dana", displayName: "Dana", passwordHash: "x", role: "player", isAdmin: true },
    { id: id.eve, username: "eve", displayName: "Eve", passwordHash: "x", role: "player" },
    { id: id.pat, username: "pat", displayName: "Pat Example", passwordHash: "x", role: "player", playerId: id.patPlayer },
  ]);
  await handle.db.insert(riotAccounts).values({ id: id.patAccount, ownerType: "player", playerId: id.patPlayer, gameName: "PatExample", tagLine: "OCE", platform: "oc1", puuid: "puuid-pat", label: "main" });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("who may use Personal data", () => {
  it("refuses every action to a member who is not an administrator, and to someone not signed in, changing nothing", async () => {
    for (const who of [asPlayer, () => (state.session = null)]) {
      who();
      const refused = [
        await previewErasureAction({ userId: id.pat }),
        await eraseAction({ userId: id.pat }, "pat"),
        await listErasuresAction(),
        await releaseErasureAction("ER-AAAAAA", "ER-AAAAAA"),
        await reconcileErasuresAction(),
        await exportErasuresAction(),
        await importErasuresAction(JSON.stringify({ format: "uniiverse-erasures", version: 1, exportedAt: new Date().toISOString(), records: [] })),
      ];
      for (const r of refused) expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/permission|sign in/i) });
    }
    expect(await count("users")).toBe(4);
    expect(await count("privacy_erasures")).toBe(0);
    expect(await handle.db.select().from(auditEvents)).toEqual([]);
  });

  it("protects the Owner, the administrator's own account and, from an administrator who is not the Owner, other administrators", async () => {
    asAdmin();
    expect(await previewErasureAction({ userId: id.owner })).toEqual({ ok: false, error: "The Owner account cannot be erased." });
    expect(await previewErasureAction({ userId: id.dana })).toEqual({ ok: false, error: "You cannot erase your own account." });
    asOwner();
    expect(await previewErasureAction({ userId: id.owner })).toEqual({ ok: false, error: "You cannot erase your own account." });
    // The Owner may erase an administrator (another active administrator, the Owner, remains).
    expect(await previewErasureAction({ userId: id.dana })).toMatchObject({ ok: true, data: { confirmWith: "dana" } });
    // Erasing an administrator from a non-Owner administrator's session is refused even at the last step.
    await handle.db.update(users).set({ isAdmin: true }).where(sql`${users.id} = ${id.eve}`);
    asAdmin();
    expect(await eraseAction({ userId: id.eve }, "eve")).toEqual({ ok: false, error: "Only the Owner can erase an administrator. Remove their administrator access first, or ask the Owner." });
    await handle.db.update(users).set({ isAdmin: false }).where(sql`${users.id} = ${id.eve}`);
    expect(await count("users")).toBe(4);
  });
});

describe("erasing a member", () => {
  let reference = "";

  it("shows what would change first, and erases nothing without the exact confirmation", async () => {
    asAdmin();
    const preview = await previewErasureAction({ userId: id.pat });
    expect(preview).toMatchObject({ ok: true, data: { confirmWith: "pat", subject: expect.anything() } });
    for (const wrong of ["", "Pat Example", "pa", "pat2"]) expect(await eraseAction({ userId: id.pat }, wrong)).toEqual({ ok: false, error: "The confirmation does not match. Nothing was erased." });
    expect(await count("users")).toBe(4);
    expect(await count("riot_accounts")).toBe(1);
  });

  it("erases them with the confirmation, records only a reference and counts, and lists the record", async () => {
    asAdmin();
    const done = await eraseAction({ userId: id.pat }, " PAT ");
    expect(done.ok).toBe(true);
    reference = done.ok ? done.data.reference : "";
    expect(reference).toMatch(/^ER-[A-Z2-9]{6}$/);
    expect(await count("users")).toBe(3);
    expect(await count("players")).toBe(0);
    expect(await count("riot_accounts")).toBe(0);
    const [audit] = await handle.db.select().from(auditEvents).where(sql`${auditEvents.action} = 'privacy.erase'`);
    expect(audit).toMatchObject({ actorName: "dana", targetType: "erasure", targetName: reference, details: { kind: "member", riotAccounts: 1 } });
    expect(JSON.stringify(audit).toLowerCase()).not.toMatch(/pat|puuid/);
    expect(await listErasuresAction()).toEqual({ ok: true, data: [{ reference, erasedAt: expect.any(String), usable: true, releasedAt: null }] });
    // The second time there is no one left to erase.
    expect(await eraseAction({ userId: id.pat }, "pat")).toMatchObject({ ok: false });
  });

  it("exports the records as keyed tokens only, and refuses a file that is not one", async () => {
    asAdmin();
    const exported = await exportErasuresAction();
    expect(exported.ok).toBe(true);
    const file = exported.ok ? exported.data : null;
    expect(file?.records.map((r) => r.reference)).toEqual([reference]);
    expect(JSON.stringify(file).toLowerCase()).not.toMatch(/pat|puuid-|oce/);
    expect(await importErasuresAction("not json")).toEqual({ ok: false, error: "That file is not an erasure records file." });
    expect(await importErasuresAction(JSON.stringify({ hello: "world" }))).toEqual({ ok: false, error: "This is not a UNIIVERSE erasure records file." });
    expect(await importErasuresAction(JSON.stringify({ ...file, records: [{ ...file!.records[0], tokens: ["riotid:PatExample#OCE"] }] }))).toEqual({ ok: false, error: `Record ${reference} has malformed tokens.` });
    // Importing the same file again adds nothing and finds nothing to erase.
    expect(await importErasuresAction(JSON.stringify(file))).toMatchObject({ ok: true, data: { added: 0, updated: 0, reconcile: { people: 0, traces: 0 } } });
    expect(await reconcileErasuresAction()).toMatchObject({ ok: true, data: { mode: "full", records: 1, unusable: 0, people: 0, traces: 0 } });
    const actions = (await handle.db.select({ action: auditEvents.action }).from(auditEvents).orderBy(auditEvents.id)).map((a) => a.action);
    expect(actions).toEqual(["privacy.erase", "privacy.export", "privacy.import", "privacy.reconcile"]);
  });

  it("releases a record only with its reference typed, once", async () => {
    asAdmin();
    expect(await releaseErasureAction(reference, "ER-WRONG1")).toEqual({ ok: false, error: "Type the reference to confirm." });
    expect(await releaseErasureAction(reference, reference.toLowerCase())).toEqual({ ok: true, data: null });
    expect(await releaseErasureAction(reference, reference)).toEqual({ ok: false, error: "No erasure with that reference is waiting to be released." });
    const [record] = await handle.db.select().from(privacyErasures);
    expect(record!.releasedAt).toBeInstanceOf(Date);
    const [audit] = await handle.db.select().from(auditEvents).where(sql`${auditEvents.action} = 'privacy.release'`);
    expect(audit).toMatchObject({ actorName: "dana", targetType: "erasure", targetName: reference });
  });
});
