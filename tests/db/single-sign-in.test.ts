import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  One account per browser: the real sign-in and sign-out code paths, called the way the browser
  calls them, with Next.js cookies replaced by a small fake that records each cookie's
  attributes. Signing in replaces the browser's session (ending the previous one on the server),
  and the old cookie of remembered accounts, from when the account menu could switch between
  several, only ever has its sessions ended.
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
import { createSession, findSession } from "@/server/auth/sessions";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, identityMarker } from "@/server/auth/account-jar";
import { createUser } from "@/server/repositories/users";
import { resetThrottle } from "@/server/auth/throttle";
import * as auth from "@/server/actions/auth";
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

/** Signs in from the form; a successful sign-in redirects (thrown, as Next.js does). */
async function signInAs(username: string, password = PASSWORD, extra: Record<string, string> = {}) {
  try {
    return await auth.loginAction(undefined, form({ username, password, next: "/team", ...extra }));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) return { redirected: state.redirects.at(-1) };
    throw e;
  }
}

const active = async () => (await getSession())?.username ?? null;

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  for (const name of ["alpha", "bravo", "charlie"]) ids[name] = (await createUser(handle.db, { username: name, password: PASSWORD, role: name === "alpha" ? "owner" : "player" })).id;
});
afterAll(async () => {
  await handle.close();
  delete process.env.UNIIVERSE_REQUIRE_AUTH;
});
beforeEach(async () => {
  await resetThrottle(handle.db);
  state.redirects = [];
});

describe("signing in", () => {
  it("replaces the browser's session: the previous account's session ends on the server", async () => {
    const alphaToken = await browserOf("alpha");
    expect(await signInAs("bravo", "wrong-password-1")).toMatchObject({ error: expect.any(String) });
    // A failed attempt changes nothing.
    expect(await active()).toBe("alpha");
    expect(await findSession(handle.db, alphaToken)).not.toBeNull();

    expect(await signInAs("bravo")).toEqual({ redirected: "/team" });
    expect(await active()).toBe("bravo");
    expect(await findSession(handle.db, alphaToken)).toBeNull();
    // The readable fingerprint names the active account and is not a credential; the session
    // cookie stays out of page scripts' reach.
    expect(state.cookies.get(IDENTITY_COOKIE)).toBe(identityMarker(ids.bravo!));
    expect(state.options.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(state.options.get(IDENTITY_COOKIE)).toMatchObject({ httpOnly: false });
  });

  it("ends the sessions the old cookie of remembered accounts still names, and clears it", async () => {
    await browserOf("alpha");
    const bravo = await createSession(handle.db, ids.bravo!);
    const charlie = await createSession(handle.db, ids.charlie!);
    state.cookies.set(ACCOUNTS_COOKIE, `${bravo.token},${charlie.token}`);
    expect(await signInAs("alpha")).toEqual({ redirected: "/team" });
    expect(await active()).toBe("alpha");
    expect(await findSession(handle.db, bravo.token)).toBeNull();
    expect(await findSession(handle.db, charlie.token)).toBeNull();
    expect(state.cookies.get(ACCOUNTS_COOKIE)).toBe("");
    expect(state.options.get(ACCOUNTS_COOKIE)).toMatchObject({ maxAge: 0 });
  });

  it("the old 'add another account' field signs in normally: nothing is remembered", async () => {
    const alphaToken = await browserOf("alpha");
    expect(await signInAs("bravo", PASSWORD, { add: "1" })).toEqual({ redirected: "/team" });
    expect(await active()).toBe("bravo");
    expect(await findSession(handle.db, alphaToken)).toBeNull();
    expect(state.cookies.get(ACCOUNTS_COOKIE) ?? "").toBe("");
  });
});

describe("signing out", () => {
  it("ends the browser's session and any the old cookie names, clears every account cookie and goes to the site's address", async () => {
    const alphaToken = await browserOf("alpha");
    const bravo = await createSession(handle.db, ids.bravo!);
    const request = new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${alphaToken}; ${ACCOUNTS_COOKIE}=${bravo.token}; ${IDENTITY_COOKIE}=${identityMarker(ids.alpha!)}` } });
    const res = await logout(request);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(await findSession(handle.db, alphaToken)).toBeNull();
    expect(await findSession(handle.db, bravo.token)).toBeNull();
    for (const name of [SESSION_COOKIE, IDENTITY_COOKIE, ACCOUNTS_COOKIE]) expect(res.cookies.get(name)).toMatchObject({ value: "", maxAge: 0, path: "/" });
  });

  it("without a session it only clears the cookies", async () => {
    const res = await logout(new NextRequest("http://localhost/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.cookies.get(SESSION_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
  });
});
