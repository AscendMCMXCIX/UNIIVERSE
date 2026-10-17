import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Several accounts in one browser (account-jar.ts): the real sign-in, switch, forget and sign-out
  code paths, called the way the browser calls them, with Next.js cookies replaced by a small
  fake that records each cookie's attributes. Every account is a separate sign-in; the browser
  only ever switches to sessions the server still recognises.
*/

type CookieOptions = { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string };
const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), options: new Map<string, CookieOptions | undefined>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) && state.cookies.get(name) !== "" ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string, options?: CookieOptions) => {
      state.cookies.set(name, value);
      state.options.set(name, options);
    },
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
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

import { NextRequest } from "next/server";
import { getSession, SESSION_COOKIE } from "@/server/auth/session";
import { createSession, findSession, revokeAllSessions } from "@/server/auth/sessions";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, identityMarker, MAX_REMEMBERED, parseJar } from "@/server/auth/account-jar";
import { listOtherAccounts } from "@/server/auth/browser-accounts";
import { createUser, updateUser } from "@/server/repositories/users";
import { sessions } from "@/server/db/schema";
import { resetThrottle } from "@/server/auth/throttle";
import * as auth from "@/server/actions/auth";
import * as switching from "@/server/actions/account-switch";
import { POST as logout } from "@/app/api/auth/logout/route";

let handle: DbHandle;
const ids: Record<string, string> = {};
const PASSWORD = "Correct-horse-9";

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

/** A browser signed in to exactly one account (a fresh session, as after a normal sign-in). */
async function browserOf(name: string) {
  state.cookies.clear();
  state.options.clear();
  const { token } = await createSession(handle.db, ids[name]!);
  state.cookies.set(SESSION_COOKIE, token);
  return token;
}

/** "Add another account" from the sign-in page, with that account's password. */
async function addAccount(username: string, password = PASSWORD) {
  return auth.loginAction(undefined, form({ username, password, next: "/team", add: "1" }));
}

const active = async () => (await getSession())?.username ?? null;
const remembered = () => parseJar(state.cookies.get(ACCOUNTS_COOKIE));
const others = async () => (await listOtherAccounts(handle.db, (await getSession())?.userId ?? null)).map((a) => a.name);

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  for (const name of ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]) ids[name] = (await createUser(handle.db, { username: name, password: PASSWORD, role: name === "alpha" ? "owner" : "player" })).id;
});
afterAll(async () => {
  await handle.close();
  delete process.env.UNIIVERSE_REQUIRE_AUTH;
});
beforeEach(() => {
  resetThrottle();
  state.redirects = [];
});

describe("adding another account", () => {
  it("needs that account's own password, keeps the first one signed in and switches to the new one", async () => {
    const alphaToken = await browserOf("alpha");
    expect(await addAccount("bravo", "wrong-password")).toMatchObject({ error: expect.any(String) });
    expect(await active()).toBe("alpha");
    expect(remembered()).toEqual([]);

    expect(await addAccount("bravo")).toEqual({ switchTo: "/team" });
    expect(await active()).toBe("bravo");
    expect(remembered()).toEqual([alphaToken]);
    expect(await others()).toEqual(["alpha"]);
    // The readable fingerprint names the active account, and is not a credential.
    expect(state.cookies.get(IDENTITY_COOKIE)).toBe(identityMarker(ids.bravo!));
    expect(state.cookies.get(IDENTITY_COOKIE)).not.toBe(state.cookies.get(SESSION_COOKIE));
    // Both session cookies stay out of page scripts' reach; only the fingerprint is readable.
    expect(state.options.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(state.options.get(ACCOUNTS_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(state.options.get(IDENTITY_COOKIE)).toMatchObject({ httpOnly: false });
  });

  it("refuses a further account once the browser remembers the most it may, without signing anyone in", async () => {
    await browserOf("alpha");
    for (const name of ["bravo", "charlie", "delta"]) expect(await addAccount(name)).toEqual({ switchTo: "/team" });
    expect(remembered()).toHaveLength(MAX_REMEMBERED);
    const before = (await handle.db.select().from(sessions).where(eq(sessions.userId, ids.echo!))).length;
    expect(await addAccount("echo")).toMatchObject({ error: expect.stringMatching(/already remembers/) });
    expect((await handle.db.select().from(sessions).where(eq(sessions.userId, ids.echo!))).length).toBe(before);
    expect(await active()).toBe("delta");
  });

  it("adding an account that is already remembered replaces its older session", async () => {
    const alphaToken = await browserOf("alpha");
    await addAccount("bravo");
    const bravoFirst = state.cookies.get(SESSION_COOKIE)!;
    await switching.switchAccountAction(ids.alpha!);
    expect(await active()).toBe("alpha");
    expect(remembered()).toEqual([bravoFirst]);
    await addAccount("bravo");
    expect(await active()).toBe("bravo");
    expect(remembered()).toEqual([alphaToken]);
    expect(await findSession(handle.db, bravoFirst)).toBeNull();
  });

  it("adding the account already in use only renews its session", async () => {
    const first = await browserOf("alpha");
    await addAccount("alpha");
    expect(await active()).toBe("alpha");
    expect(remembered()).toEqual([]);
    expect(await findSession(handle.db, first)).toBeNull();
  });
});

describe("switching", () => {
  it("swaps the active and a remembered account, both ways, keeping each one's own access", async () => {
    await browserOf("alpha");
    await addAccount("bravo");
    expect((await getSession())?.role).toBe("player");
    expect(await switching.switchAccountAction(ids.alpha!)).toEqual({ ok: true });
    expect(await active()).toBe("alpha");
    expect((await getSession())?.role).toBe("owner");
    expect(await others()).toEqual(["bravo"]);
    expect(state.cookies.get(IDENTITY_COOKIE)).toBe(identityMarker(ids.alpha!));
    expect(await switching.switchAccountAction(ids.bravo!)).toEqual({ ok: true });
    expect(await active()).toBe("bravo");
    expect((await getSession())?.role).toBe("player");
  });

  it("never switches to an account this browser has not signed in to", async () => {
    await browserOf("alpha");
    await addAccount("bravo");
    const r = await switching.switchAccountAction(ids.charlie!);
    expect(r).toMatchObject({ ok: false });
    expect(await active()).toBe("bravo");
  });

  it("drops remembered accounts whose session ended: signed out elsewhere, past 24 hours, or deactivated", async () => {
    await browserOf("alpha");
    await addAccount("bravo");
    await addAccount("charlie");
    await addAccount("delta");
    expect(await others()).toEqual(["charlie", "bravo", "alpha"]);
    // bravo changed their password elsewhere (every session ends).
    await revokeAllSessions(handle.db, ids.bravo!);
    // charlie's sign-in is older than 24 hours.
    const charlieToken = remembered()[0]!;
    const { hashSessionToken } = await import("@/server/auth/sessions");
    await handle.db.update(sessions).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(sessions.tokenHash, hashSessionToken(charlieToken)));
    expect(await others()).toEqual(["alpha"]);
    expect(await switching.switchAccountAction(ids.bravo!)).toMatchObject({ ok: false, error: expect.stringMatching(/signed out on this browser/) });
    expect(await switching.switchAccountAction(ids.charlie!)).toMatchObject({ ok: false });
    // alpha deactivated by an admin.
    await updateUser(handle.db, ids.alpha!, { isActive: false });
    expect(await others()).toEqual([]);
    expect(await switching.switchAccountAction(ids.alpha!)).toMatchObject({ ok: false });
    await updateUser(handle.db, ids.alpha!, { isActive: true });
    expect(await active()).toBe("delta");
  });

  it("ignores a tampered remembered-accounts cookie", async () => {
    await browserOf("alpha");
    state.cookies.set(ACCOUNTS_COOKIE, `s1.${"x".repeat(43)},not-a-token,${state.cookies.get(SESSION_COOKIE)}`);
    expect(await others()).toEqual([]);
    expect(await switching.switchAccountAction(ids.bravo!)).toMatchObject({ ok: false });
    expect(await active()).toBe("alpha");
  });
});

describe("removing and signing out", () => {
  it("removing a remembered account ends its session on the server", async () => {
    await browserOf("alpha");
    await addAccount("bravo");
    const alphaToken = remembered()[0]!;
    expect(await switching.forgetAccountAction(ids.alpha!)).toEqual({ ok: true });
    expect(remembered()).toEqual([]);
    expect(await findSession(handle.db, alphaToken)).toBeNull();
    expect(await active()).toBe("bravo");
  });

  it("signing out of the active account hands over to a remembered one; signing out of all ends every session", async () => {
    await browserOf("alpha");
    await addAccount("bravo");
    await addAccount("charlie");
    const cookieHeader = () => [...state.cookies].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
    const charlieToken = state.cookies.get(SESSION_COOKIE)!;

    const one = await logout(new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: cookieHeader() } }));
    expect(one.status).toBe(303);
    expect(one.headers.get("location")).toBe("http://localhost/");
    expect(await findSession(handle.db, charlieToken)).toBeNull();
    const nextActive = one.cookies.get(SESSION_COOKIE)!.value;
    expect((await findSession(handle.db, nextActive))?.userId).toBe(ids.bravo);
    expect(one.cookies.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true });
    expect(one.cookies.get(IDENTITY_COOKIE)?.value).toBe(identityMarker(ids.bravo!));
    const left = parseJar(one.cookies.get(ACCOUNTS_COOKIE)!.value);
    expect(left).toHaveLength(1);
    expect((await findSession(handle.db, left[0]!))?.userId).toBe(ids.alpha);

    const all = await logout(new NextRequest("http://localhost/api/auth/logout?all=1", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${nextActive}; ${ACCOUNTS_COOKIE}=${left.join(",")}` } }));
    expect(all.headers.get("location")).toBe("http://localhost/login");
    expect(await findSession(handle.db, nextActive)).toBeNull();
    expect(await findSession(handle.db, left[0]!)).toBeNull();
    expect(all.cookies.get(SESSION_COOKIE)?.value).toBe("");
    expect(all.cookies.get(ACCOUNTS_COOKIE)?.value).toBe("");
    expect(all.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("signing out with nothing remembered goes to the sign-in page", async () => {
    const token = await browserOf("foxtrot");
    const res = await logout(new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(await findSession(handle.db, token)).toBeNull();
  });
});
