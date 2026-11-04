import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  The Resources library through its real server actions on a real database: only administrators
  change it (every action checks, whatever the page shows), each change is stored and outlives the
  cache (a new deployment reads it back), removed and hidden defaults are never recreated, two
  administrators' changes at once both survive, and every change is in the audit log.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// The session is the test's; the permission check is the real one (hasPermission), so an action asking for the wrong permission fails here.
vi.mock("@/server/auth/session", async (orig) => {
  const real = await orig<typeof import("@/server/auth/session")>();
  const { hasPermission } = await import("@/server/auth/permissions");
  const requireSession = async () => {
    if (!state.session) throw new real.NotAuthorizedError("Please sign in.");
    return state.session as Session;
  };
  return {
    ...real,
    getSession: async () => state.session,
    requireSession,
    requirePermission: async (permission: Parameters<typeof hasPermission>[1]) => {
      const session = await requireSession();
      if (!hasPermission(session, permission)) throw new real.NotAuthorizedError();
      return session;
    },
  };
});

import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { appSettings, auditEvents } from "@/server/db/schema";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { invalidateAllCaches } from "@/server/observability/cache";
import { getResourceLibrary } from "@/server/resources/library";
import { addResourceAction, getManagedResourcesAction, moveResourceAction, removeResourceAction, restoreResourceDefaultsAction, setResourceHiddenAction, updateResourceAction } from "@/server/actions/resources";
import { DEFAULT_RESOURCES, libraryFrom, visibleResources } from "@/domain/resources";

let handle: DbHandle;
const base = { userId: "00000000-0000-4000-8000-000000000001", username: "member", label: "Member", role: "player", hasPassword: true, mustChangePassword: false, setupComplete: true, playerId: null, teamMember: true, capabilities: STANDARD_PLAYER } as const;
const asMember = () => (state.session = { ...base } as Session);
const asAdmin = () => (state.session = { ...base, userId: "00000000-0000-4000-8000-000000000002", username: "admin", admin: true } as Session);
const ugg = { title: "U.GG", url: "https://u.gg/", description: "Builds and tier lists.", section: "sr" as const, icon: "favicon" as const };
const stored = async () => (await handle.db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "resources")))[0]?.value ?? null;
/** As a new deployment sees it: nothing cached, everything read from the database. */
const afterDeploy = async () => {
  invalidateAllCaches();
  return getResourceLibrary(handle.db);
};

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
}, 60_000);
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(appSettings).where(eq(appSettings.key, "resources"));
  invalidateAllCaches();
});

describe("who may change the library", () => {
  it("refuses every change from a member who is not an administrator, and stores nothing", async () => {
    asMember();
    const refused = [
      await addResourceAction(ugg),
      await updateResourceAction("d-opgg", { ...ugg, url: "https://op.gg/" }),
      await setResourceHiddenAction("d-opgg", true),
      await moveResourceAction("d-opgg", "down"),
      await removeResourceAction("d-opgg"),
      await restoreResourceDefaultsAction(null),
      await getManagedResourcesAction(),
    ];
    for (const r of refused) expect(r.ok).toBe(false);
    expect(await stored()).toBeNull();
    state.session = null;
    expect((await addResourceAction(ugg)).ok).toBe(false);
    expect(await stored()).toBeNull();
  });

  it("lets an administrator change it", async () => {
    asAdmin();
    const r = await addResourceAction(ugg);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.entries.some((e) => e.url === "https://u.gg/")).toBe(true);
  });
});

describe("changes are stored and outlive every deployment", () => {
  it("shows the defaults until the first change, then exactly what administrators made of them", async () => {
    expect((await afterDeploy()).entries.map((e) => e.id)).toEqual(DEFAULT_RESOURCES.map((d) => d.id));
    asAdmin();
    expect((await removeResourceAction("d-opgg")).ok).toBe(true);
    expect((await setResourceHiddenAction("d-patch-notes", true)).ok).toBe(true);
    expect((await updateResourceAction("d-lol-wiki", { title: "The wiki", url: "https://wiki.leagueoflegends.com/en-us/", description: "Everything about the game.", section: "esports", icon: "book" })).ok).toBe(true);
    // A section no longer offered takes nothing new.
    expect(await updateResourceAction("d-lol-news", { title: "News", url: "https://www.leagueoflegends.com/en-us/news/", description: "", section: "learning", icon: "news" })).toMatchObject({ ok: false, error: "Choose one of the sections offered." });
    expect((await moveResourceAction("d-lolalytics", "up")).ok).toBe(true);

    const lib = await afterDeploy();
    expect(lib.entries.map((e) => e.id)).not.toContain("d-opgg");
    expect(lib.entries.find((e) => e.id === "d-patch-notes")).toMatchObject({ hidden: true });
    expect(lib.entries.find((e) => e.id === "d-lol-wiki")).toMatchObject({ title: "The wiki", section: "esports", icon: "book" });
    expect(lib.entries.find((e) => e.id === "d-lol-news")).toMatchObject({ section: "league" });
    // OP.GG was removed, so LoLalytics, moved up, leads Summoner's Rift alone.
    expect(lib.entries.filter((e) => e.section === "sr").map((e) => e.id)).toEqual(["d-lolalytics"]);
    // Members never see the hidden one; the removed one is nowhere.
    expect(visibleResources(lib).map((e) => e.id)).not.toContain("d-patch-notes");

    // A later release's new default joins by itself; the removed and hidden ones stay as they are.
    const later = [...DEFAULT_RESOURCES, { id: "d-new", section: "aram" as const, title: "New", url: "https://new.example.com/", description: "" }];
    const next = libraryFrom(await stored(), later);
    expect(next.entries.map((e) => e.id)).toContain("d-new");
    expect(next.entries.map((e) => e.id)).not.toContain("d-opgg");
    expect(next.entries.find((e) => e.id === "d-patch-notes")).toMatchObject({ hidden: true });
  });

  it("restores a removed default only when asked, as first published", async () => {
    asAdmin();
    await removeResourceAction("d-lolesports");
    await removeResourceAction("d-opgg");
    let managed = await getManagedResourcesAction();
    expect(managed.ok && managed.data.removed.map((d) => d.id).sort()).toEqual(["d-lolesports", "d-opgg"]);
    expect((await restoreResourceDefaultsAction(["d-lolesports"])).ok).toBe(true);
    managed = await getManagedResourcesAction();
    expect(managed.ok && managed.data.removed.map((d) => d.id)).toEqual(["d-opgg"]);
    expect((await afterDeploy()).entries.find((e) => e.id === "d-lolesports")).toMatchObject({ title: "LoL Esports", url: "https://lolesports.com/", hidden: false });
  });

  it("drops a library's defaults no longer shipped while they are unchanged, and keeps an administrator's edit of one", async () => {
    // A library stored before 21 Oct 2026: pros.lol and MetaTFT as shipped, tactics.tools retitled.
    const old = (id: string, title: string, url: string, section: string, description: string) => ({ id, title, url, section, description, icon: "favicon", hidden: false });
    const before = {
      entries: [
        ...DEFAULT_RESOURCES.map((d) => ({ ...d, icon: "favicon", hidden: false })),
        old("d-pros-lol", "pros.lol", "https://pros.lol/", "sr", "What pro players build: items, runes and skill orders, updated every 15 minutes."),
        old("d-metatft", "MetaTFT", "https://www.metatft.com/", "tft", "TFT comps, tier lists and stats, updated every few minutes."),
        old("d-tactics-tools", "tactics.tools (our pick)", "https://tactics.tools/", "tft", "TFT comps, units and items with their statistics, and match histories."),
      ],
      seen: [...DEFAULT_RESOURCES.map((d) => d.id), "d-pros-lol", "d-metatft", "d-tactics-tools"],
    };
    await handle.db.insert(appSettings).values({ key: "resources", value: before });
    const lib = await afterDeploy();
    expect(lib.entries.map((e) => e.id)).not.toContain("d-pros-lol");
    expect(lib.entries.map((e) => e.id)).not.toContain("d-metatft");
    expect(lib.entries.find((e) => e.id === "d-tactics-tools")).toMatchObject({ title: "tactics.tools (our pick)", section: "tft" });
    // Members see it under its section; nothing was written by just reading.
    expect(visibleResources(lib).filter((e) => e.section === "tft").map((e) => e.id)).toEqual(["d-tactics-tools"]);
    expect(await stored()).toEqual(before);
    // The next change stores the library without them.
    asAdmin();
    expect((await setResourceHiddenAction("d-opgg", true)).ok).toBe(true);
    const saved = (await stored()) as { entries: Array<{ id: string }> };
    expect(saved.entries.map((e) => e.id)).not.toContain("d-pros-lol");
    expect(saved.entries.map((e) => e.id)).toContain("d-tactics-tools");
  });
});

describe("what may be stored", () => {
  it("refuses unsafe or broken addresses and keeps text as plain text", async () => {
    asAdmin();
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://u.gg/", "https://127.0.0.1/", "https://localhost/"]) {
      const r = await addResourceAction({ ...ugg, url });
      expect(r.ok, url).toBe(false);
    }
    // A refused change stores nothing at all (its transaction is rolled back), so the library is still the defaults.
    expect(await stored()).toBeNull();
    expect((await afterDeploy()).entries.map((e) => e.id)).toEqual(DEFAULT_RESOURCES.map((d) => d.id));
    const r = await addResourceAction({ ...ugg, title: "<img src=x onerror=alert(1)>", description: "Line\u0000one\u202e" });
    expect(r.ok).toBe(true);
    const added = (await afterDeploy()).entries.find((e) => e.url === "https://u.gg/")!;
    expect(added.title).toBe("<img src=x onerror=alert(1)>");
    expect(added.description).toBe("Line one");
    expect((await addResourceAction({ ...ugg, title: "Again" })).ok).toBe(false);
  });

  it("refuses ids that are not a resource's", async () => {
    asAdmin();
    expect(await setResourceHiddenAction("'; drop table app_settings; --", true)).toMatchObject({ ok: false });
    expect(await removeResourceAction("d-not-there")).toMatchObject({ ok: false, error: /no longer in the library/ });
  });
});

describe("several administrators at once", () => {
  it("keeps both of two changes made at the same moment", async () => {
    asAdmin();
    const [a, b] = await Promise.all([addResourceAction(ugg), addResourceAction({ ...ugg, title: "Mobalytics", url: "https://mobalytics.gg/" })]);
    expect(a.ok && b.ok).toBe(true);
    const urls = (await afterDeploy()).entries.map((e) => e.url);
    expect(urls).toContain("https://u.gg/");
    expect(urls).toContain("https://mobalytics.gg/");
  });

  it("records each change in the audit log, naming the resource", async () => {
    asAdmin();
    await handle.db.delete(auditEvents);
    await addResourceAction(ugg);
    await setResourceHiddenAction("d-opgg", true);
    await removeResourceAction("d-esports-news");
    await restoreResourceDefaultsAction(null);
    const rows = await handle.db.select({ action: auditEvents.action, targetName: auditEvents.targetName, details: auditEvents.details }).from(auditEvents).orderBy(auditEvents.id);
    expect(rows.map((r) => r.action)).toEqual(["resources.add", "resources.edit", "resources.remove", "resources.restore"]);
    expect(rows.map((r) => r.targetName)).toEqual(["U.GG", "OP.GG", "Esports news", null]);
    expect(rows[1]!.details).toMatchObject({ change: "hidden" });
    expect(rows[3]!.details).toMatchObject({ restored: "Esports news" });
  });
});
