import { format } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Linking a Riot ID on a profile's Riot Accounts tab (actions/accounts.ts, addPlayerAccountAction)
  asks Riot first, as an administrator's Add Player Account does, and answers with its messages
  (riot/verify-identity.ts, lookupRiotId). A Riot ID Riot knows is linked under Riot's spelling
  with the PUUID Riot gave; one Riot does not know is refused; and so is one Riot cannot be asked
  about right now (no key, a refused key, a rate limit, Riot down or unreachable), with a message
  to try again. Nothing is linked unchecked. The guards before it are unchanged and refuse
  without asking Riot (who may link for whom, the Riot ID's format and server, the Riot ID
  already linked); the same Riot account under another name is refused once Riot has named it,
  in words that name nobody, unless it is the profile's own account: then the refusal names it.

  Through the real action, signed in with a real session cookie (Next.js plumbing replaced by
  small fakes, as in auth-actions). Riot is a stand-in for its HTTP API, so the real client and its
  handling of each answer run. Nothing is printed with a Riot ID or a PUUID: every console line is
  recorded as the console prints it (an error's message and cause included) and searched for each
  test identity as written and URL-encoded, as a request's path carries it.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>() }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { riotAccounts, users } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { PUUID_KEPT_ON_SERVER } from "@/server/accounts/repository";
import { addPlayerAccountAction } from "@/server/actions/accounts";
import { RiotApiError } from "@/server/riot/api/client";

/**
 * The Riot accounts the stand-in knows, by Riot ID as typed (any case). "Renamed One" is the
 * teammate's linked account (stored as "Linked Before") under a newer name: the same PUUID.
 * "After Rename" is the member's own account (stored as "Before Rename") under a newer name.
 */
const KNOWN: Record<string, { puuid: string; gameName: string; tagLine: string }> = {
  "known one#oce": { puuid: "puuid-known-one", gameName: "Known One", tagLine: "OCE" },
  "asked later#oce": { puuid: "puuid-asked-later", gameName: "Asked Later", tagLine: "OCE" },
  "renamed one#oce": { puuid: "puuid-linked-before", gameName: "Renamed One", tagLine: "OCE" },
  "after rename#oce": { puuid: "puuid-member-renamed", gameName: "After Rename", tagLine: "OCE" },
  "mine already#oce": { puuid: "puuid-mine-already", gameName: "Mine Already", tagLine: "OCE" },
};
/** What must never reach a log line: every Riot ID and PUUID the tests use. */
const IDENTITIES = ["known one", "asked later", "renamed one", "linked before", "nobody here", "after rename", "before rename", "mine already", "puuid-"];
/** How many of them the printed lines name, as written or URL-encoded (a Riot ID in a request's path). */
const named = (lines: string[]) => {
  const text = lines.join("\n").toLowerCase();
  return IDENTITIES.filter((identity) => text.includes(identity) || text.includes(encodeURIComponent(identity).toLowerCase())).length;
};

/** How the stand-in answers Riot ID lookups: as Riot would, with an HTTP status, or not at all. */
type Answer = "riot" | 401 | 403 | 429 | 503 | "unreachable";
const riot = { answer: "riot" as Answer, calls: [] as string[] };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const standIn = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  riot.calls.push(url);
  if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
    if (riot.answer === "unreachable") throw new TypeError("fetch failed");
    if (riot.answer !== "riot") return json({ status: { status_code: riot.answer } }, riot.answer, riot.answer === 429 ? { "retry-after": "0" } : {});
    const [name, tag] = url.split("/by-riot-id/")[1]!.split("/").map((x) => decodeURIComponent(x));
    const known = KNOWN[`${name}#${tag}`.toLowerCase()];
    return known ? json(known) : json({ status: { message: "Data not found", status_code: 404 } }, 404);
  }
  // The rest of a first sync: the account by PUUID, its server, and no rank, mastery or games.
  const puuid = decodeURIComponent(/by-puuid\/([^/?]+)/.exec(url)?.[1] ?? "");
  if (url.includes("/riot/account/v1/accounts/by-puuid/")) {
    const known = Object.values(KNOWN).find((k) => k.puuid === puuid);
    return known ? json(known) : json({ status: { status_code: 404 } }, 404);
  }
  if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "oc1" });
  if (url.includes("/ids?") || url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
  return json({ status: { status_code: 404 } }, 404);
};
const riotIdLookups = () => riot.calls.filter((u) => u.includes("/by-riot-id/")).length;

let handle: DbHandle;
let memberProfile: string;
let teammateProfile: string;
const userId: Record<string, string> = {};
const env: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const printed: string[] = [];
const KEY = "RGAPI-00000000-0000-0000-0000-000000000000";

async function signInAs(name: string) {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId[name]!);
  state.cookies.set(SESSION_COOKIE, token);
}
const linkedTo = async (playerId: string) => (await handle.db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, playerId))).length;

beforeAll(async () => {
  for (const k of ["UNIIVERSE_REQUIRE_AUTH", "DATABASE_URL", "UNIIVERSE_AUTH_SECRET", "RIOT_API_KEY", "UNIIVERSE_FAKE_RIOT_IDS"]) env[k] = process.env[k];
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.UNIIVERSE_FAKE_RIOT_IDS;
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  memberProfile = (await createPlayer(handle.db, teamId, { displayName: "Member", primaryRole: "MID", primaryPool: [] })).id;
  teammateProfile = (await createPlayer(handle.db, teamId, { displayName: "Teammate", primaryRole: "TOP", primaryPool: [] })).id;
  // Both on the default level (Standard Player: their own Riot accounts, nobody else's).
  for (const [name, playerId] of [["member", memberProfile], ["teammate", teammateProfile]] as const) {
    const [row] = await handle.db.insert(users).values({ username: `${name}_login`, displayName: name, role: "player", playerId, setupCompletedAt: new Date() }).returning({ id: users.id });
    userId[name] = row!.id;
  }
  // The teammate's account, linked and resolved before.
  await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: teammateProfile, gameName: "Linked Before", tagLine: "OCE", platform: "oc1", puuid: "puuid-linked-before", label: "main", syncStatus: "ok" });
  globalThis.fetch = standIn as typeof fetch;
}, 60_000);
afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await handle.close();
});

beforeEach(async () => {
  process.env.RIOT_API_KEY = KEY;
  riot.answer = "riot";
  riot.calls.length = 0;
  printed.length = 0;
  // Each line as the console would print it (node's own formatting, which JSON.stringify is not:
  // it drops an error's message and cause).
  for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void printed.push(format(...args)));
  await signInAs("member");
});
afterEach(() => {
  // Whatever happened, no log line names a Riot account (counted here, so a failure prints none).
  expect(named(printed), "log lines naming a Riot account").toBe(0);
  vi.restoreAllMocks();
});

describe("the log check", () => {
  it("finds a Riot ID in an error, in an error's cause and in a request's path", () => {
    console.error(new RiotApiError("Riot has no account named Nobody Here#OCE", 404, false));
    console.warn("lookup failed", new Error("wrapped", { cause: new Error("Asked Later#OCE") }));
    console.log(`GET /riot/account/v1/accounts/by-riot-id/${encodeURIComponent("Known One")}/OCE`);
    expect(named(printed)).toBe(3);
    // Printed by this test on purpose: cleared, so the check after it passes.
    printed.length = 0;
  });
});

describe("linking a Riot ID asks Riot first", () => {
  it("links a Riot ID Riot knows, under Riot's spelling and with the PUUID Riot gave", async () => {
    const r = await addPlayerAccountAction(memberProfile, { riotId: "known one#oce" });
    expect(r).toMatchObject({ ok: true, data: { riotId: "Known One#OCE", gameName: "Known One", tagLine: "OCE", puuid: PUUID_KEPT_ON_SERVER } });
    // Asked exactly as typed; the answer that reaches the browser carries no PUUID.
    expect(riot.calls.some((u) => u.includes("/by-riot-id/known%20one/oce"))).toBe(true);
    expect(JSON.stringify(r)).not.toContain("puuid-known-one");
    // Stored with the PUUID, resolved now, and its first sync ran.
    const [row] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.playerId, memberProfile));
    expect(row).toMatchObject({ gameName: "Known One", tagLine: "OCE", puuid: "puuid-known-one", label: "main", syncStatus: "ok" });
    expect(row!.puuidResolvedAt).not.toBeNull();
  });

  it("refuses a Riot ID Riot does not know, with the administrator's message, and links nothing", async () => {
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Nobody Here#OCE" })).toEqual({ ok: false, error: "Riot has no account named Nobody Here#OCE. Check the spelling and the #TAG." });
    expect(riotIdLookups()).toBe(1);
    expect(await linkedTo(memberProfile)).toBe(before);
  });

  const busy = "Riot service unavailable right now (busy or unreachable). Try again in a minute.";
  const refusedKey = "Riot service unavailable: Riot rejected the server's API key. An admin needs to replace RIOT_API_KEY; try again once they have.";
  it.each([
    ["no key", null, "Riot verification is not available: the server has no Riot API key configured. Try again once an administrator has set one."],
    ["a refused key (401)", 401, refusedKey],
    ["a refused key (403)", 403, refusedKey],
    ["a rate limit (429)", 429, busy],
    ["Riot down (503)", 503, busy],
    ["Riot unreachable", "unreachable", busy],
  ] as const)("refuses while Riot cannot be asked, with a message to try again, and links nothing: %s", async (_label, answer, message) => {
    if (answer === null) delete process.env.RIOT_API_KEY;
    else riot.answer = answer;
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Asked Later#OCE" })).toEqual({ ok: false, error: message });
    expect(await linkedTo(memberProfile)).toBe(before);
    // Without a key nothing is sent at all.
    if (answer === null) expect(riot.calls).toEqual([]);
    // Once Riot can be asked again, the same Riot ID links.
    process.env.RIOT_API_KEY = KEY;
    riot.answer = "riot";
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Asked Later#OCE" })).toMatchObject({ ok: true, data: { riotId: "Asked Later#OCE" } });
    await handle.db.delete(riotAccounts).where(eq(riotAccounts.puuid, "puuid-asked-later"));
  });
});

describe("the guards before Riot stay as they were", () => {
  it("refuses someone else's profile without asking Riot", async () => {
    const before = await linkedTo(teammateProfile);
    expect(await addPlayerAccountAction(teammateProfile, { riotId: "Asked Later#OCE" })).toEqual({ ok: false, error: "You do not have permission to do that." });
    expect(riot.calls).toEqual([]);
    expect(await linkedTo(teammateProfile)).toBe(before);
  });

  it("refuses a malformed Riot ID or an unknown server without asking Riot", async () => {
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "no-tag-here" })).toEqual({ ok: false, error: "Enter the Riot ID exactly as shown in the client: GameName#TAG." });
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Asked Later#OCE", platform: "xx9" })).toEqual({ ok: false, error: "Choose a region from the list." });
    expect(riot.calls).toEqual([]);
    expect(await linkedTo(memberProfile)).toBe(before);
  });

  it("refuses a Riot ID that is already linked without asking Riot", async () => {
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Linked Before#OCE" })).toEqual({ ok: false, error: "Linked Before#OCE is already linked to one of our players." });
    expect(riot.calls).toEqual([]);
    expect(await linkedTo(memberProfile)).toBe(before);
  });

  it("refuses the same Riot account under another name once Riot has named it, and stores nothing", async () => {
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "Renamed One#OCE" })).toEqual({ ok: false, error: "Renamed One#OCE is already linked to one of our players." });
    expect(riotIdLookups()).toBe(1);
    expect(await linkedTo(memberProfile)).toBe(before);
    expect(await linkedTo(teammateProfile)).toBe(1);
  });

  it("says when the Riot account is already the profile's own, renamed in Riot, naming only that account", async () => {
    // The member's account, stored before its rename in Riot: the stored name follows at its next
    // Riot ID check (sync.ts, every 20 hours), so for a while the new name is not stored anywhere.
    const [mine] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: memberProfile, gameName: "Before Rename", tagLine: "OCE", platform: "oc1", puuid: "puuid-member-renamed", label: "alt", syncStatus: "ok", riotIdCheckedAt: new Date() }).returning({ id: riotAccounts.id });
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "After Rename#OCE" })).toEqual({ ok: false, error: "After Rename#OCE is your linked account Before Rename#OCE, renamed in Riot. Its name here updates on its own, or now with Change Riot ID in its menu." });
    expect(riotIdLookups()).toBe(1);
    expect(await linkedTo(memberProfile)).toBe(before);
    await handle.db.delete(riotAccounts).where(eq(riotAccounts.id, mine!.id));
  });

  it("says when the Riot account is already the profile's own under the same name, typed in another case", async () => {
    // The checks before Riot compare the name as typed, so only Riot's answer finds this one.
    const [mine] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: memberProfile, gameName: "Mine Already", tagLine: "OCE", platform: "oc1", puuid: "puuid-mine-already", label: "alt", syncStatus: "ok", riotIdCheckedAt: new Date() }).returning({ id: riotAccounts.id });
    const before = await linkedTo(memberProfile);
    expect(await addPlayerAccountAction(memberProfile, { riotId: "mine already#oce" })).toEqual({ ok: false, error: "Mine Already#OCE is already one of your linked accounts." });
    expect(riotIdLookups()).toBe(1);
    expect(await linkedTo(memberProfile)).toBe(before);
    await handle.db.delete(riotAccounts).where(eq(riotAccounts.id, mine!.id));
  });
});
