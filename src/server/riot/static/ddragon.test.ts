import { afterEach, describe, expect, it, vi } from "vitest";
import { DataDragonProvider } from "./ddragon";
import { StaticDataError } from "./provider";

/*
  The live Data Dragon provider's versions, with and without a pinned version (DDRAGON_VERSION; the
  browser tests' server pins the version the curated Matchup Intel notes were checked on,
  docs/MATCHUP_INTEL.md, "What the browser tests pin"). The static sync reads the first version this
  returns, so: unset, Data Dragon's newest, exactly as before; pinned, exactly the pin, once Data
  Dragon's own list confirms it has it; a pin that is not a version, or one Data Dragon does not list,
  throws as an unreachable Data Dragon does, never falling back to another version.
*/

const LISTED = ["16.23.1", "16.22.1", "16.21.1", "10.10.3216176", "lolpatch_3.7"];

/** A fetch that answers like Data Dragon's versions list, and records what was asked. */
function ddragon(versions: unknown = LISTED) {
  const asked: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    asked.push(url.pathname);
    if (url.pathname === "/api/versions.json") return new Response(JSON.stringify(versions), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("not found", { status: 404 });
  });
  return { fetchImpl, asked };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Data Dragon's versions", () => {
  it("unpinned (production): Data Dragon's list as it gives it, newest first", async () => {
    vi.stubEnv("DDRAGON_VERSION", "");
    const { fetchImpl, asked } = ddragon();
    const provider = new DataDragonProvider({ fetchImpl });
    expect(provider.pinnedVersion).toBeNull();
    expect(await provider.fetchVersions()).toEqual(LISTED);
    expect(asked).toEqual(["/api/versions.json"]);
  });

  it("pinned: exactly the pinned version, once Data Dragon lists it, whatever is newer", async () => {
    const { fetchImpl, asked } = ddragon();
    const provider = new DataDragonProvider({ fetchImpl, version: "16.22.1" });
    expect(provider.pinnedVersion).toBe("16.22.1");
    expect(await provider.fetchVersions()).toEqual(["16.22.1"]);
    // The same one request as unpinned: the list is what confirms the version exists.
    expect(asked).toEqual(["/api/versions.json"]);
    // An older version with a long build number is a version too.
    expect(await new DataDragonProvider({ fetchImpl, version: "10.10.3216176" }).fetchVersions()).toEqual(["10.10.3216176"]);
  });

  it("reads the pin from DDRAGON_VERSION, trimmed; empty is no pin, and an explicit empty one unpins", async () => {
    const { fetchImpl } = ddragon();
    vi.stubEnv("DDRAGON_VERSION", " 16.22.1 ");
    expect(new DataDragonProvider({ fetchImpl }).pinnedVersion).toBe("16.22.1");
    expect(await new DataDragonProvider({ fetchImpl }).fetchVersions()).toEqual(["16.22.1"]);
    expect(await new DataDragonProvider({ fetchImpl, version: "" }).fetchVersions()).toEqual(LISTED);
    vi.stubEnv("DDRAGON_VERSION", "   ");
    expect(new DataDragonProvider({ fetchImpl }).pinnedVersion).toBeNull();
    expect(await new DataDragonProvider({ fetchImpl }).fetchVersions()).toEqual(LISTED);
  });

  it("refuses a pin Data Dragon does not list, naming it, rather than reading another version", async () => {
    const { fetchImpl } = ddragon();
    const failure = new DataDragonProvider({ fetchImpl, version: "16.99.1" }).fetchVersions();
    await expect(failure).rejects.toBeInstanceOf(StaticDataError);
    await expect(failure).rejects.toMatchObject({ kind: "pin", message: "Data Dragon does not list the pinned version 16.99.1 (DDRAGON_VERSION)" });
  });

  it("refuses a pin that is not a version before asking Data Dragon anything", async () => {
    for (const pin of ["16.22", "latest", "16.22.1-fixture", "0.0.0-fixture", "16.22.1/../x", "v16.22.1"]) {
      const { fetchImpl, asked } = ddragon();
      const failure = new DataDragonProvider({ fetchImpl, version: pin }).fetchVersions();
      await expect(failure, pin).rejects.toMatchObject({ kind: "pin", message: `DDRAGON_VERSION ${JSON.stringify(pin)} is not a Data Dragon version (three numbers, such as 16.22.1)` });
      expect(asked, pin).toEqual([]);
    }
  });

  it("fails as before when Data Dragon cannot be reached or answers in another shape, pinned or not", async () => {
    const unreachable = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNREFUSED");
    });
    for (const version of ["", "16.22.1"]) {
      await expect(new DataDragonProvider({ fetchImpl: unreachable, version }).fetchVersions(), version).rejects.toMatchObject({ kind: "network" });
      await expect(new DataDragonProvider({ fetchImpl: ddragon({ not: "a list" }).fetchImpl, version }).fetchVersions(), version).rejects.toMatchObject({ kind: "schema" });
    }
  });
});
