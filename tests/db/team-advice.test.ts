import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { getTeamRoster } from "@/server/team/roster";

/* Team page advice: suggestions only for empty roles, only real registered players, never someone already in the lineup. */

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  teamId = team.id;
  const specs = [
    ["Top", "TOP", null, ["Darius"], [], "main", true],
    ["Jg", "JUNGLE", null, ["LeeSin"], [], "main", true],
    ["Adc", "ADC", "SUPPORT", ["Jinx"], ["Lulu"], "main", true],
    ["MidMain", "MID", null, ["Orianna", "Ahri"], [], "other", true],
    ["MidFlex", "TOP", "MID", ["Gwen"], ["Syndra"], "main", true],
    ["NoAccount", "MID", null, ["Ahri"], [], "main", false],
  ] as const;
  for (const [name, primaryRole, secondaryRole, primaryPool, secondaryPool, group, registered] of specs) {
    const p = await createPlayer(handle.db, team.id, { displayName: name, primaryRole, secondaryRole, primaryPool: [...primaryPool], secondaryPool: [...secondaryPool], group });
    ids[name] = p.id;
    if (registered) await handle.db.insert(users).values({ username: name.toLowerCase(), displayName: name, role: "player", playerId: p.id });
  }
  await setLineup(handle.db, team.id, { TOP: ids.Top!, JUNGLE: ids.Jg!, ADC: ids.Adc! });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("team page advice", () => {
  it("suggests registered players for empty roles, primary role first, with reasons", async () => {
    const roster = await getTeamRoster(handle.db, teamId);
    const mid = roster.slots.find((s) => s.role === "MID")!;
    expect(mid.player).toBeNull();
    expect(mid.suggestions.map((s) => s.name)).toEqual(["MidMain", "MidFlex"]);
    expect(mid.suggestions[0]!.reasons[0]).toMatch(/main role/);
    expect(mid.suggestions[0]!.substitute).toBe(true);
    // A profile without a sign-in account is not suggested; nor is the ADC already in the lineup.
    const support = roster.slots.find((s) => s.role === "SUPPORT")!;
    expect(support.suggestions).toEqual([]);
    expect(roster.slots.find((s) => s.role === "TOP")!.suggestions).toEqual([]);
  });

  it("summarises what the lineup's pools bring", async () => {
    const { composition } = await getTeamRoster(handle.db, teamId);
    expect(composition.unfilled).toEqual(["MID", "SUPPORT"]);
    expect(composition.coverage.find((c) => c.role === "TOP")!.champions).toBe(1);
    expect(composition.damage.label).toBe("Mostly physical");
  });
});
