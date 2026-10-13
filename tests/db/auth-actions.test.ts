import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  The real server actions, called the way a browser (or an attacker with the browser's cookie)
  would call them: each test signs in as someone by setting the session cookie, and the action
  must check that person's rights on the server. Next.js plumbing is replaced by small fakes.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirects.push(to);
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/riot/verify-identity", async (orig) => {
  const real = await orig<typeof import("@/server/riot/verify-identity")>();
  const { RiotApiError } = await import("@/server/riot/api/client");
  return {
    ...real,
    createVerificationClient: () => ({
      async accountByRiotId(_p: string, gameName: string, tagLine: string) {
        if (gameName === "Down") throw new RiotApiError("503", 503, true);
        if (gameName === "Ghost") throw new RiotApiError("404", 404, false);
        return { puuid: `puuid-${gameName.toLowerCase()}`, gameName, tagLine };
      },
      async activePlatformByPuuid() {
        return "oc1";
      },
    }),
  };
});

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createDraft } from "@/server/repositories/drafts";
import { getActiveLineupProfiles, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { getUser } from "@/server/repositories/users";
import { users } from "@/server/db/schema";
import { resetThrottle } from "@/server/auth/throttle";
import * as accounts from "@/server/actions/users";
import * as auth from "@/server/actions/auth";
import * as draftActions from "@/server/actions/drafts";
import * as playerActions from "@/server/actions/players";
import * as settingsActions from "@/server/actions/settings";

let handle: DbHandle;
let ownerId: string;
let playerId: string;
let playerProfileId: string;
let otherProfileId: string;

async function signInAs(userId: string | null) {
  state.cookies.clear();
  if (!userId) return;
  const { token } = await createSession(handle.db, userId, { remember: false });
  state.cookies.set(SESSION_COOKIE, token);
}

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

async function login(username: string, secret: string): Promise<{ error?: string; redirect?: string }> {
  state.cookies.clear();
  state.redirects = [];
  try {
    const r = await auth.loginAction(undefined, form({ username, secret, next: "/team" }));
    return { error: r?.error };
  } catch (err) {
    if (String((err as Error).message).startsWith("NEXT_REDIRECT")) return { redirect: state.redirects.at(-1) };
    throw err;
  }
}

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const owner = await registerAccount(handle.db, { username: "Ascend", password: "owner-pass-123", role: "owner", primaryRiot: { riotId: "Owner#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  const other = await registerAccount(handle.db, { username: "Other", password: null, role: "player", primaryRiot: { riotId: "Other#OCE", platform: "oc1" }, primaryRole: "TOP" });
  otherProfileId = other.playerId!;
});
afterAll(async () => {
  await handle.close();
  delete process.env.UNIIVERSE_REQUIRE_AUTH;
});
beforeEach(() => {
  resetThrottle();
});

describe("admin account creation through the real actions", () => {
  it("a normal player cannot verify, create, issue codes, deactivate, delete or change roles", async () => {
    await signInAs(ownerId);
    const created = await accounts.createPlayerAccountAction({ username: "Rookie", riotId: "Rookie#OCE" });
    expect(created.ok).toBe(true);
    playerId = created.ok ? created.data.userId : "";
    playerProfileId = created.ok ? created.data.playerId : "";
    const code = created.ok ? created.data.code : "";
    // The player activates and finishes setup, then tries admin operations directly.
    expect(await login("Rookie", code)).toEqual({ redirect: "/welcome" });
    await signInAs(playerId);
    await expect(auth.finishSetupAction({ primaryRole: "ADC", primaryPool: ["Jinx"] })).rejects.toThrow(/NEXT_REDIRECT/);
    for (const r of [
      await accounts.verifyRiotIdAction("Anyone#OCE"),
      await accounts.createPlayerAccountAction({ username: "Sneaky", riotId: "Sneaky#OCE" }),
      await accounts.issueActivationCodeAction(ownerId),
      await accounts.setAccountActiveAction(ownerId, false),
      await accounts.deleteAccountAction(ownerId),
      await accounts.setAccountRoleAction(playerId, "owner"),
      await accounts.resetAdminPasswordAction(ownerId),
    ]) {
      expect(r.ok).toBe(false);
    }
    expect((await getUser(handle.db, playerId))!.role).toBe("player");
    expect((await getUser(handle.db, ownerId))!.isActive).toBe(true);
    // Site settings and the lineup are admin-only too.
    expect((await settingsActions.savePoolLimitsAction({ primary: 9, secondary: 9 })).ok).toBe(false);
    expect((await settingsActions.runJobAction("auth-audit")).ok).toBe(false);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(false);
  });

  it("refuses to create an account Riot cannot verify, and keeps the admin's input intact on the client", async () => {
    await signInAs(ownerId);
    const down = await accounts.createPlayerAccountAction({ username: "Later", riotId: "Down#OCE" });
    expect(down).toMatchObject({ ok: false });
    expect(!down.ok && down.error).toMatch(/unavailable/i);
    const missing = await accounts.createPlayerAccountAction({ username: "Later", riotId: "Ghost#OCE" });
    expect(!missing.ok && missing.error).toMatch(/no account/i);
    expect(await handle.db.select().from(users).where(eq(users.username, "Later"))).toHaveLength(0);
    const check = await accounts.verifyRiotIdAction("Down#OCE");
    expect(check.ok && check.data.status).toBe("unavailable");
    const okCheck = await accounts.verifyRiotIdAction("Fresh#OCE");
    expect(okCheck.ok && okCheck.data.status).toBe("verified");
  });
});

describe("sign-in", () => {
  it("never accepts a username alone, rejects wrong codes, and lets the owner keep using their password", async () => {
    expect((await login("Rookie", "")).error).toBeTruthy();
    expect((await login("Rookie", "AAAA-BBBB-CCCC")).error).toBeTruthy();
    expect(await login("Ascend", "owner-pass-123")).toEqual({ redirect: "/team" });
    expect(state.cookies.get(SESSION_COOKIE)).toMatch(/^s1\./);
  });

  it("throttles repeated failures from one address", async () => {
    for (let i = 0; i < 8; i++) await login("Nobody", "wrong-password-1");
    expect((await login("Ascend", "owner-pass-123")).error).toMatch(/Too many failed attempts/);
  });
});

describe("mandatory setup is enforced on the server", () => {
  it("blocks every action until setup is finished, then opens normally", async () => {
    await signInAs(ownerId);
    const created = await accounts.createPlayerAccountAction({ username: "Newbie", riotId: "Newbie#OCE" });
    expect(created.ok).toBe(true);
    const newbieId = created.ok ? created.data.userId : "";
    const newbieProfile = created.ok ? created.data.playerId : "";
    await signInAs(newbieId);
    // Draft creation, profile edits and Riot account changes are refused while setup is pending.
    expect((await draftActions.createDraftAction({ opponentName: "x", side: "blue" } as never)).ok).toBe(false);
    expect((await playerActions.updatePlayerAction(newbieProfile, { displayName: "Newbie", primaryRole: "TOP" })).ok).toBe(false);
    // Saving progress works, and finishing validates on the server.
    expect(await auth.saveSetupProgressAction({ primaryRole: "TOP" })).toEqual({ ok: true });
    expect(await auth.finishSetupAction({ primaryRole: "TOP", primaryPool: [] })).toMatchObject({ ok: false });
    await expect(auth.finishSetupAction({ primaryRole: "TOP", primaryPool: ["Gwen"] })).rejects.toThrow(/NEXT_REDIRECT \/team/);
    expect((await playerActions.updatePlayerAction(newbieProfile, { displayName: "Newbie", primaryRole: "TOP", primaryPool: ["Gwen", "Jax"] })).ok).toBe(true);
  });
});

describe("profiles and drafts", () => {
  let draftId: string;
  beforeAll(async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const { createPlayer } = await import("@/server/repositories/team");
    const ids: Record<string, string> = {};
    for (const [name, role, pool] of [["T", "TOP", ["Gwen"]], ["J", "JUNGLE", ["Viego"]], ["M", "MID", ["Ahri"]], ["A", "ADC", ["Jinx"]], ["S", "SUPPORT", ["Lulu"]]] as const) ids[role] = (await createPlayer(db, team.id, { displayName: name, primaryRole: role, primaryPool: [...pool] }, team.poolLimits)).id;
    await setLineup(db, team.id, ids);
    const lineup = (await getActiveLineupProfiles(db, team.id))!;
    draftId = (await createDraft(db, team.id, { opponentName: "Theirs", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "custom", createdByUserId: ownerId })).id;
  });

  it("players edit only their own profile", async () => {
    await signInAs(playerId);
    expect((await playerActions.updatePlayerAction(otherProfileId, { displayName: "Hacked", primaryRole: "TOP" })).ok).toBe(false);
    expect((await playerActions.updatePlayerAction(playerProfileId, { displayName: "Rookie", primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] })).ok).toBe(true);
  });

  it("a player creates a draft and controls it; others cannot change it; an admin can override", async () => {
    await signInAs(playerId);
    // Someone else's draft: viewing is fine, changing is not.
    expect((await draftActions.applyDraftAction(draftId, { championId: "Ahri" })).ok).toBe(false);
    expect((await draftActions.updateDraftMetaAction(draftId, { notes: "mine now" })).ok).toBe(false);
    expect((await draftActions.cloneDraftAsTheorycraftAction(draftId)).ok).toBe(true); // a copy of their own
    const mine = await draftActions.createDraftAction({ opponentName: "Scrim", side: "red", mode: "custom" } as never);
    expect(mine.ok).toBe(true);
    const mineId = mine.ok ? mine.data.id : "";
    expect((await draftActions.applyDraftAction(mineId, { championId: "Ahri" })).ok).toBe(true);
    expect((await draftActions.undoDraftAction(mineId)).ok).toBe(true);
    // Another player cannot touch it…
    await signInAs((await getUser(handle.db, (await handle.db.select().from(users).where(eq(users.username, "Newbie")))[0]!.id))!.id);
    expect((await draftActions.applyDraftAction(mineId, { championId: "Ahri" })).ok).toBe(false);
    // …an admin can.
    await signInAs(ownerId);
    expect((await draftActions.applyDraftAction(mineId, { championId: "Ahri" })).ok).toBe(true);
    expect((await draftActions.updateDraftMetaAction(mineId, { notes: "admin override" })).ok).toBe(true);
  });

  it("deleting a profile from its edit page also deletes its account, and protects the admin's own", async () => {
    await signInAs(ownerId);
    const created = await accounts.createPlayerAccountAction({ username: "test", riotId: "reqwym#oc" });
    expect(created.ok).toBe(true);
    const ids = created.ok ? created.data : null;
    expect((await playerActions.deletePlayerAction(ids!.playerId)).ok).toBe(true);
    expect(await getUser(handle.db, ids!.userId)).toBeNull();
    const own = (await getUser(handle.db, ownerId))!;
    expect((await playerActions.deletePlayerAction(own.playerId!)).ok).toBe(false);
    expect(await getUser(handle.db, ownerId)).not.toBeNull();
    await signInAs(playerId);
    expect((await playerActions.deletePlayerAction(otherProfileId)).ok).toBe(false);
  });

  it("signed-out callers get nothing", async () => {
    await signInAs(null);
    expect((await draftActions.applyDraftAction(draftId, { championId: "Ahri" })).ok).toBe(false);
    expect((await accounts.createPlayerAccountAction({ username: "x", riotId: "x#y" })).ok).toBe(false);
  });
});
