import { describe, expect, it } from "vitest";
import { HIGH_ELO_LADDER_REGISTERED, highEloGate, highEloShown, highEloSwitchOn } from "./switch";
import { samplerClientFor } from "./sampler-client";

/*
  The Master+ collection's two keys (docs/HIGH_ELO_EVIDENCE.md, "Switching on"): off in this build
  (no ladder request is registered), on only with both keys and a Riot key, never on the in-memory
  demo; the browser tests' cookie shows the demo's counts on the in-memory demo only.
*/

const prod = { UNIIVERSE_HIGH_ELO_COLLECTION: "on", RIOT_API_KEY: "RGAPI-00000000-0000-0000-0000-000000000000", NODE_ENV: "production" } as NodeJS.ProcessEnv;

describe("the high-elo switches", () => {
  it("are off in this build: no ladder request is registered, so no client exists", () => {
    expect(HIGH_ELO_LADDER_REGISTERED).toBe(false);
    expect(highEloGate(prod)).toEqual({ on: false, off: ["not-registered"] });
    expect(samplerClientFor("europe", Date.now())).toBeNull();
    expect(samplerClientFor("europe", Date.now(), true)).toBeNull();
  });

  it("turn on only with both keys and a Riot key, the environment's word exactly \"on\", never on the in-memory demo", () => {
    expect(highEloGate(prod, true)).toEqual({ on: true, off: [] });
    expect(highEloSwitchOn(prod)).toBe(true);
    for (const value of ["true", "On", "1", "", undefined]) expect(highEloSwitchOn({ ...prod, UNIIVERSE_HIGH_ELO_COLLECTION: value } as NodeJS.ProcessEnv), String(value)).toBe(false);
    expect(highEloSwitchOn({ ...prod, UNIIVERSE_DB_MODE: "memory" } as NodeJS.ProcessEnv)).toBe(false);
    expect(highEloGate({ ...prod, RIOT_API_KEY: "" } as NodeJS.ProcessEnv, true)).toEqual({ on: false, off: ["no-key"] });
    expect(highEloGate({} as unknown as NodeJS.ProcessEnv)).toEqual({ on: false, off: ["not-registered", "switch-off", "no-key"] });
  });

  it("show the Master+ source only while collection is on, or with the browser tests' cookie on the in-memory demo", () => {
    const demo = { UNIIVERSE_DB_MODE: "memory" } as unknown as NodeJS.ProcessEnv;
    expect(highEloShown("on", demo)).toBe(true);
    expect(highEloShown(null, demo)).toBe(false);
    expect(highEloShown("on", { ...demo, VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(false);
    // A deployment: the cookie means nothing; the keys decide.
    expect(highEloShown("on", prod)).toBe(false);
    expect(highEloShown(null, prod, true)).toBe(true);
  });
});
