import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";

/*
  A season load that fails (a dropped connection, a statement timeout) fails the Team page,
  which shows its error boundary. Before, the failure was swallowed and the card said "No Top
  games this season" with no rank for a player who has both: a wrong statement where a plain
  failure belongs.
*/

const failing = vi.hoisted(() => ({ playerId: "" }));
vi.mock("@/server/players/overview", async (orig) => {
  const real = await orig<typeof import("@/server/players/overview")>();
  return {
    ...real,
    getPlayerOverview: (db: unknown, player: { id: string }, options: unknown) => {
      if (player.id === failing.playerId) return Promise.reject(new Error("connection reset"));
      return real.getPlayerOverview(db as never, player as never, options as never);
    },
  };
});
import { getTeamRoster } from "@/server/team/roster";

let handle: DbHandle;
let teamId: string;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  const top = await createPlayer(handle.db, teamId, { displayName: "Fighter", primaryRole: "TOP", primaryPool: ["Gwen"] });
  await setLineupSlot(handle.db, teamId, "TOP", top.id);
  failing.playerId = top.id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the Team page when a player's season cannot be loaded", () => {
  it("fails rather than showing the player with no games", async () => {
    await expect(getTeamRoster(handle.db, teamId)).rejects.toThrow("connection reset");
    // With that player's statistics hidden from the viewer, nothing is loaded for them and the page stands.
    const hidden = await getTeamRoster(handle.db, teamId, { statsFor: () => false });
    expect(hidden.slots.find((s) => s.role === "TOP")?.player?.name).toBe("Fighter");
  });
});
