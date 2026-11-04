import { describe, expect, it } from "vitest";
import { nextCheckMs, parseScope, scopeKey } from "./freshness";

describe("freshness scopes", () => {
  it("reads a player, the team or the jobs, and nothing else", () => {
    const id = "0b9c1a64-6f1e-4d3a-9a51-0c2f6e1d7b88";
    expect(parseScope(`player:${id}`)).toEqual({ kind: "player", playerId: id });
    expect(parseScope("team")).toEqual({ kind: "team" });
    expect(parseScope("jobs")).toEqual({ kind: "jobs" });
    for (const raw of [null, "", "player:", "player:not-an-id", "players", `player:${id}x`]) expect(parseScope(raw)).toBeNull();
  });

  it("round-trips through the address", () => {
    for (const scope of [{ kind: "team" } as const, { kind: "jobs" } as const, { kind: "player", playerId: "0b9c1a64-6f1e-4d3a-9a51-0c2f6e1d7b88" } as const]) expect(parseScope(scopeKey(scope))).toEqual(scope);
  });
});

describe("nextCheckMs", () => {
  it("asks every 10 seconds while a refresh runs and every 30 while older games are added", () => {
    expect(nextCheckMs("now", 5)).toBe(10_000);
    expect(nextCheckMs("catching-up", 5)).toBe(30_000);
  });

  it("asks less and less often while nothing changes: 1, 2, 4 and 8 minutes, then every 10", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map((n) => nextCheckMs("idle", n) / 60_000)).toEqual([1, 2, 4, 8, 10, 10, 10]);
  });
});
