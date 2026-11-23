import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/*
  The Riot API requests UNIIVERSE makes are the ones its registration with Riot describes
  (docs/RIOT_COMPLIANCE.md → "Endpoints used"): Riot's terms make every new use part of the
  product's registration. Every request goes through RiotApiClient (client.ts), with its rate
  limits, and its paths are exactly the list below. A new endpoint fails here until it is added
  to this list, to the compliance page and, by the owner, to the registration's description; a
  path no longer requested must leave the list too, so the list never claims more than is used.
*/
const REGISTERED: Record<string, string> = {
  "/riot/account/v1/accounts/by-riot-id/{}/{}": "account-v1: Riot ID → account (linking, identity checks, a former member's erasure)",
  "/riot/account/v1/accounts/by-puuid/{}": "account-v1: a linked account's current Riot ID",
  "/riot/account/v1/region/by-game/lol/by-puuid/{}": "account-v1: the server a linked account plays on",
  "/lol/match/v5/matches/by-puuid/{}/ids": "match-v5: a linked account's match ids",
  "/lol/match/v5/matches/{}": "match-v5: a match",
  "/lol/match/v5/matches/{}/timeline": "match-v5: a match's timeline",
  "/lol/league/v4/entries/by-puuid/{}": "league-v4: ranked entries (linked accounts, and the players of members' completed games)",
  "/lol/champion-mastery/v4/champion-masteries/by-puuid/{}": "champion-mastery-v4: a linked account's masteries",
  "/lol/status/v4/platform-data": "lol-status-v4: the key check",
};

const ROOT = path.resolve(__dirname, "../../../..");
const CLIENT = path.join(ROOT, "src/server/riot/api/client.ts");

/** Every Riot API path written in a file, with its ${…} parts as {} and without its query. */
function riotPaths(source: string): string[] {
  const found = [...source.matchAll(/[`"'](\/(?:lol|riot)\/[^`"']*)[`"']/g)].flatMap((m) => (m[1] ? [m[1]] : []));
  return found.map((p) => p.replace(/\$\{[^}]*\}/g, "{}").split("?")[0] ?? p);
}

/** Source files under a folder, tests left out (they may spell Riot's addresses for mocks). */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sources(full);
    return /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe("Riot API endpoints", () => {
  it("the client requests exactly the registered paths", () => {
    const used = [...new Set(riotPaths(readFileSync(CLIENT, "utf8")))].sort();
    expect(used).toEqual(Object.keys(REGISTERED).sort());
  });

  it("every Riot API request goes through the client", () => {
    const direct = [...sources(path.join(ROOT, "src")), ...sources(path.join(ROOT, "scripts"))]
      .filter((f) => f !== CLIENT && readFileSync(f, "utf8").includes("api.riotgames.com"))
      .map((f) => path.relative(ROOT, f));
    expect(direct).toEqual([]);
  });

  it("the compliance page names the same APIs", () => {
    const page = readFileSync(path.join(ROOT, "docs/RIOT_COMPLIANCE.md"), "utf8");
    const line = page.split("\n").find((l) => l.startsWith("Endpoints used:")) ?? "";
    const named = [...new Set([...line.matchAll(/`([a-z-]+-v\d+)`/g)].flatMap((m) => (m[1] ? [m[1]] : [])))].sort();
    const apis = [...new Set(Object.values(REGISTERED).map((use) => use.split(":")[0] ?? use))].sort();
    expect(named).toEqual(apis);
  });
});
