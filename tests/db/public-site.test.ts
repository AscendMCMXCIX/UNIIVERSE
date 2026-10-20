import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  The public page's settings (Admin → Branding → Public page): stored in one settings row, saved
  only by someone who manages branding, the Discord link only ever an invitation an admin pasted;
  and migration 0051, which gives the original install its own welcome and sign-off and nothing else.
*/

const state = vi.hoisted(() => ({ db: null as unknown, allow: true }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  requirePermission: async () => {
    if (!state.allow) throw new Error("You do not have permission to do that.");
    return { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, mustChangePassword: false, setupComplete: true };
  },
}));

import { createDb } from "@/server/db/create";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { getPublicSite } from "@/server/repositories/public-site";
import { savePublicSiteAction } from "@/server/actions/branding";
import { invalidateCache } from "@/server/observability/cache";
import { DEFAULT_PUBLIC_SITE } from "@/domain/public-site";

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
}, 60_000);
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  state.allow = true;
  await handle.db.execute(sql`DELETE FROM app_settings WHERE key = 'public_site'`);
  invalidateCache("public-site");
});

describe("the public page's settings", () => {
  it("start neutral on a new install: no invitation, no sign-off", async () => {
    expect(await getPublicSite(handle.db)).toEqual(DEFAULT_PUBLIC_SITE);
  });

  it("are saved by someone who manages branding, and read back at once", async () => {
    const saved = await savePublicSiteAction({ heroText: "Friends first.", discordUrl: "discord.gg/friends", playingOpen: false, signOff: "Stay kind" });
    expect(saved).toMatchObject({ ok: true, data: { heroText: "Friends first.", discordUrl: "https://discord.gg/friends", playingOpen: false, signOff: "Stay kind" } });
    expect(await getPublicSite(handle.db)).toMatchObject({ heroText: "Friends first.", discordUrl: "https://discord.gg/friends", playingOpen: false });
    // Recorded in the admin activity, without the link itself.
    const [event] = rowsOf<{ action: string; details: Record<string, unknown> }>(await handle.db.execute(sql`SELECT action, details FROM audit_events WHERE action = 'branding.public-site' ORDER BY id DESC LIMIT 1`));
    expect(event).toMatchObject({ action: "branding.public-site", details: { discord: "set", playing: "closed" } });
    expect(JSON.stringify(event!.details)).not.toContain("friends");
  });

  it("refuse a link that is not a Discord invitation, and keep what was there", async () => {
    await savePublicSiteAction({ discordUrl: "https://discord.gg/friends" });
    const refused = await savePublicSiteAction({ discordUrl: "https://example.com/invite/friends" });
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/invitation link/) });
    expect((await getPublicSite(handle.db)).discordUrl).toBe("https://discord.gg/friends");
  });

  it("cannot be changed without the branding permission", async () => {
    state.allow = false;
    expect(await savePublicSiteAction({ heroText: "Changed" })).toMatchObject({ ok: false });
    expect((await getPublicSite(handle.db)).heroText).toBe(DEFAULT_PUBLIC_SITE.heroText);
  });
});

describe("migration 0051: the original install keeps its own welcome and sign-off", () => {
  // Migrates a fresh database up to 0050, lets `before` add what an install had, then runs 0051
  // and returns the settings the public page reads.
  async function upgrade(before: (db: DbHandle["db"]) => Promise<void>) {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0051")) {
        await db.transaction(async (tx) => {
          for (const statement of m.statements) await tx.execute(sql.raw(statement));
          await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
        });
      }
      await before(db);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied[0]).toBe("0051_public_site_copy");
      invalidateCache("public-site");
      return await getPublicSite(db);
    } finally {
      invalidateCache("public-site");
      await fresh.close();
    }
  }
  const named = (productName: string) => async (db: DbHandle["db"]) => {
    await db.execute(sql`INSERT INTO app_settings (key, value) VALUES ('branding', ${JSON.stringify({ productName, teamName: productName, shortName: productName })}::jsonb)`);
  };

  it("the install called UNIIVERSE gets its welcome and sign-off, and never a Discord link", async () => {
    const site = await upgrade(named("UNIIVERSE"));
    expect(site).toMatchObject({ heroTitle: "Welcome to the UNIIVERSE.", signOff: "Stay Legendary", discordUrl: null, heroText: DEFAULT_PUBLIC_SITE.heroText });
  });

  it("any other install, and a new one, start neutral", async () => {
    expect(await upgrade(named("Nova"))).toEqual(DEFAULT_PUBLIC_SITE);
    expect(await upgrade(async () => {})).toEqual(DEFAULT_PUBLIC_SITE);
  });

  it("settings an admin already saved are left as they are", async () => {
    const site = await upgrade(async (db) => {
      await named("UNIIVERSE")(db);
      await db.execute(sql`INSERT INTO app_settings (key, value) VALUES ('public_site', ${JSON.stringify({ heroTitle: "Hi.", discordUrl: "https://discord.gg/ours" })}::jsonb)`);
    });
    expect(site).toMatchObject({ heroTitle: "Hi.", signOff: "", discordUrl: "https://discord.gg/ours" });
  });
});
