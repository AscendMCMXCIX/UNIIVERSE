import { describe, expect, it } from "vitest";
import { DEFAULT_RIOT_PLATFORM, normaliseRiotRegionAnswer, parsePlatformSpec, parsePlatforms, platformsInRegion, regionFor, RIOT_PLATFORM_IDS, RIOT_PLATFORMS } from "./riot-platforms";

describe("Riot platform registry", () => {
  it("lists every public League of Legends platform exactly once, with a region each", () => {
    const required = ["br1", "eun1", "euw1", "jp1", "kr", "la1", "la2", "na1", "oc1", "tr1", "ru", "ph2", "sg2", "th2", "tw2", "vn2"];
    for (const id of required) expect(RIOT_PLATFORM_IDS).toContain(id);
    expect(new Set(RIOT_PLATFORM_IDS).size).toBe(RIOT_PLATFORM_IDS.length);
    for (const p of RIOT_PLATFORMS) expect(["americas", "europe", "asia", "sea"]).toContain(p.region);
    expect(RIOT_PLATFORM_IDS.some((id) => id.startsWith("cn"))).toBe(false);
  });

  it("routes platforms to the regional hosts Riot uses", () => {
    expect(regionFor("oc1")).toBe("sea");
    expect(regionFor("EUW1")).toBe("europe");
    expect(regionFor("kr")).toBe("asia");
    expect(regionFor("la2")).toBe("americas");
    expect(() => regionFor("cn1")).toThrow(/Unknown Riot platform/);
    expect(platformsInRegion("asia")).toEqual(["kr", "jp1"]);
  });

  it("parses RIOT_PLATFORMS lists, 'all' and regional shorthands", () => {
    expect(parsePlatforms("oc1")).toEqual(["oc1"]);
    expect(parsePlatforms(" EUW1, kr ,na1 ")).toEqual(["euw1", "kr", "na1"]);
    expect(parsePlatforms("all")).toEqual([...RIOT_PLATFORM_IDS]);
    expect(parsePlatforms("sea")).toEqual(platformsInRegion("sea"));
    expect(parsePlatforms("oc1,oc1,all").length).toBe(RIOT_PLATFORM_IDS.length);
    const spec = parsePlatformSpec("oc1, mars, cn1");
    expect(spec.platforms).toEqual(["oc1"]);
    expect(spec.unknown).toEqual(["mars", "cn1"]);
    expect(spec.usedFallback).toBe(false);
    expect(parsePlatformSpec("")).toEqual({ platforms: [DEFAULT_RIOT_PLATFORM], unknown: [], usedFallback: true, all: false });
    expect(parsePlatforms(undefined, ["euw1"])).toEqual(["euw1"]);
  });

  it("normalises Riot's active-region answers and rejects unknown ones", () => {
    expect(normaliseRiotRegionAnswer("NA1")).toBe("na1");
    expect(normaliseRiotRegionAnswer(" sg2 ")).toBe("sg2");
    expect(normaliseRiotRegionAnswer("PBE1")).toBeNull();
    expect(normaliseRiotRegionAnswer(null)).toBeNull();
  });
});
