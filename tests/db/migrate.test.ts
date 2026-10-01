import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { players, teams } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrator";

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
});

afterAll(async () => {
  await handle.close();
});

describe("database migrations", () => {
  it("applies the schema and is idempotent", async () => {
    const again = await runMigrations(handle.db, { useAdvisoryLock: false });
    expect(again.applied).toEqual([]);
  });

  it("stores and reads a team and a player", async () => {
    const [team] = await handle.db.insert(teams).values({ name: "UNIIVERSE" }).returning();
    expect(team?.primaryPoolLimit).toBe(6);
    const [player] = await handle.db
      .insert(players)
      .values({ teamId: team!.id, displayName: "Alpha", primaryRole: "TOP", secondaryRole: "MID", group: "main" })
      .returning();
    const found = await handle.db.select().from(players).where(eq(players.id, player!.id));
    expect(found[0]?.displayName).toBe("Alpha");
    expect(found[0]?.secondaryRole).toBe("MID");
  });
});
