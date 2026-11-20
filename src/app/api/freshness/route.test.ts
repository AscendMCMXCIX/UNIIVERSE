import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  A profile's visit refresh starts from the mounted page's freshness request, never from rendering
  the profile's layout (PLAN S8a, HOSTING_USAGE "Not changed here"): a prefetch renders the layout,
  and seeing a teammate's name on Players synced their accounts (about 55 Riot requests and about
  3 CPU-seconds a day). The route starts it only for a viewer the page itself would let in, and only
  when an account is due.
*/

const state = vi.hoisted(() => ({ session: null as unknown, due: false, open: true, refreshed: [] as string[], deferred: [] as Array<() => unknown> }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void state.deferred.push(fn) }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/auth/session", () => ({ getAuthState: async () => ({ session: state.session }), needsSetup: (s: { setupComplete?: boolean } | null) => !!s && s.setupComplete === false }));
vi.mock("@/server/auth/profile-access", () => ({ mayOpenProfile: async () => state.open }));
vi.mock("@/server/accounts/kickoff", () => ({ refreshPlayerAccountsIfDue: async (_db: unknown, id: string) => void state.refreshed.push(id) }));
vi.mock("@/server/ops/freshness", () => ({
  freshness: async () => ({ v: "team", pace: "idle" }),
  playerFreshnessAndDue: async () => ({ freshness: { v: "player", pace: state.due ? "now" : "idle" }, due: state.due }),
}));

import { GET } from "./route";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";

const ID = "11111111-2222-4333-8444-555555555555";
const viewer = (over: Partial<Session> = {}) => ({ userId: "u", label: "Me", username: "me", role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, hasPassword: true, mustChangePassword: false, setupComplete: true, ...over }) as Session;
const ask = (scope: string) => GET(new Request(`http://x/api/freshness?scope=${encodeURIComponent(scope)}`));
const run = async () => {
  for (const fn of state.deferred.splice(0)) await fn();
};

beforeEach(() => {
  state.session = viewer();
  state.due = false;
  state.open = true;
  state.refreshed = [];
  state.deferred = [];
});

describe("a profile's visit refresh", () => {
  it("starts after a mounted profile's freshness request when an account is due, and not otherwise", async () => {
    state.due = true;
    const r = await ask(`player:${ID}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ v: "player", pace: "now" });
    await run();
    expect(state.refreshed).toEqual([ID]);
    state.due = false;
    await ask(`player:${ID}`);
    await run();
    expect(state.refreshed).toEqual([ID]);
  });

  it("never starts for a viewer the profile would refuse: signed out, without the Players directory, still in first-time setup, or a personal-use profile", async () => {
    state.due = true;
    state.session = null;
    expect((await ask(`player:${ID}`)).status).toBe(401);
    state.session = viewer({ capabilities: [] });
    expect((await ask(`player:${ID}`)).status).toBe(403);
    state.session = viewer({ setupComplete: false });
    expect((await ask(`player:${ID}`)).status).toBe(403);
    state.session = viewer();
    state.open = false;
    expect((await ask(`player:${ID}`)).status).toBe(403);
    await run();
    expect(state.refreshed).toEqual([]);
  });

  it("is not started by rendering a profile's layout (what a prefetch renders)", () => {
    for (const file of ["src/app/(app)/players/[id]/layout.tsx", "src/app/(app)/overview/layout.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/refreshPlayerAccountsIfDue|from "next\/server"/);
    }
  });
});
