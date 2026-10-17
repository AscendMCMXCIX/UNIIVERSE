import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Team Overview's background visibility as team branding: saved on the server with the rest of the
  branding, the same for every viewer, changed only through the branding permission (the real
  check, not a hidden button), and the default until an admin saves another value.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// The real permission check (hasPermission) on the test's session; only how the session is found is replaced.
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  getSession: async () => state.session,
  requirePermission: async (permission: string) => {
    const { hasPermission } = await import("@/server/auth/permissions");
    if (!state.session) throw new Error("Please sign in.");
    if (!hasPermission(state.session as Session, permission as never)) throw new Error("You do not have permission to do that.");
    return state.session;
  },
}));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { getBranding } from "@/server/repositories/branding";
import { invalidateCache } from "@/server/observability/cache";
import { resetBrandingAction, saveBrandingAction } from "@/server/actions/branding";
import { DEFAULT_BACKDROP_LEVEL } from "@/domain/branding";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
const base = { label: "X", hasPassword: true, mustChangePassword: false, setupComplete: true };
const owner = { ...base, userId: "11111111-1111-4111-8111-111111111111", username: "owner", role: "owner", playerId: null } as Session;
const member = { ...base, userId: "22222222-2222-4222-8222-222222222222", username: "member", role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true } as Session;
const lineupManager = { ...member, userId: "33333333-3333-4333-8333-333333333333", capabilities: [...STANDARD_PLAYER, "manage-lineup", "manage-players"] } as Session;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  invalidateCache("branding");
}, 60_000);
afterAll(async () => {
  await handle.close();
});

/** What a fresh server instance reads (no cached copy). */
const fresh = async () => {
  invalidateCache("branding");
  return getBranding(handle.db);
};

describe("background visibility in team branding", () => {
  it("is the default until an admin saves another value", async () => {
    expect((await fresh()).backdropLevel).toBe(DEFAULT_BACKDROP_LEVEL);
  });

  it("an admin saves it with the branding; every viewer and every new server instance reads the same value", async () => {
    state.session = owner;
    const current = await fresh();
    const r = await saveBrandingAction({ ...current, backdropLevel: 80 });
    expect(r).toMatchObject({ ok: true, data: { backdropLevel: 80 } });
    // Stored server-side: not tied to a session, a cookie or a browser.
    expect((await fresh()).backdropLevel).toBe(80);
    state.session = member;
    expect((await getBranding(handle.db)).backdropLevel).toBe(80);
    // The rest of the branding is untouched.
    expect((await fresh()).teamName).toBe(current.teamName);
  });

  it("refuses a change from anyone without the branding permission, on the server", async () => {
    for (const session of [member, lineupManager, null]) {
      state.session = session;
      const r = await saveBrandingAction({ ...(await fresh()), backdropLevel: 5 });
      expect(r.ok).toBe(false);
      expect((await fresh()).backdropLevel).toBe(80);
    }
    state.session = member;
    expect((await resetBrandingAction()).ok).toBe(false);
    expect((await fresh()).backdropLevel).toBe(80);
  });

  it("keeps values in range and resets with the rest of the branding", async () => {
    state.session = owner;
    expect(await saveBrandingAction({ ...(await fresh()), backdropLevel: 400 })).toMatchObject({ ok: true, data: { backdropLevel: 100 } });
    expect(await saveBrandingAction({ ...(await fresh()), backdropLevel: -3 })).toMatchObject({ ok: true, data: { backdropLevel: 0 } });
    expect(await saveBrandingAction({ ...(await fresh()), backdropLevel: "90" as unknown as number })).toMatchObject({ ok: true, data: { backdropLevel: DEFAULT_BACKDROP_LEVEL } });
    await saveBrandingAction({ ...(await fresh()), backdropLevel: 30 });
    expect(await resetBrandingAction()).toMatchObject({ ok: true, data: { backdropLevel: DEFAULT_BACKDROP_LEVEL } });
    expect((await fresh()).backdropLevel).toBe(DEFAULT_BACKDROP_LEVEL);
  });
});
