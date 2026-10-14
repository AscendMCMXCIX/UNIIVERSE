import { describe, expect, it } from "vitest";
import { buildChampionMap } from "../../tests/fixtures/champions";
import { suggestForRole, summariseComposition, type CandidateFacts } from "./team-advice";

const champions = buildChampionMap();

describe("team composition summary", () => {
  it("reports unfilled roles, empty pools and damage, engage and frontline from first choices", () => {
    const c = summariseComposition(
      [
        { role: "TOP", champions: ["Darius", "Jax"], assigned: true },
        { role: "JUNGLE", champions: ["LeeSin"], assigned: true },
        { role: "MID", champions: [], assigned: true },
        { role: "ADC", champions: ["Jinx"], assigned: true },
        { role: "SUPPORT", champions: [], assigned: false },
      ],
      champions,
    );
    expect(c.unfilled).toEqual(["SUPPORT"]);
    expect(c.coverage.find((r) => r.role === "MID")!.champions).toBe(0);
    expect(c.damage.label).toBe("Mostly physical");
    expect(c.notes.join(" ")).toMatch(/Support has no player yet/);
    expect(c.notes.join(" ")).toMatch(/Mid: no champions/);
    expect(c.engage).not.toBeNull();
  });

  it("says when there is not enough to judge", () => {
    const c = summariseComposition([{ role: "TOP", champions: ["Gwen"], assigned: true }], champions);
    expect(c.damage.label).toBe("Not enough champions");
  });
});

describe("vacant role suggestions", () => {
  const physical = summariseComposition(
    [
      { role: "TOP", champions: ["Darius"], assigned: true },
      { role: "JUNGLE", champions: ["LeeSin"], assigned: true },
      { role: "ADC", champions: ["Jinx"], assigned: true },
    ],
    champions,
  );
  const base = { substitute: false, proficiency: [] as CandidateFacts["proficiency"] };
  it("prefers the role's primary players, explains why, and never suggests someone who does not list the role", () => {
    const out = suggestForRole(
      "MID",
      [
        { ...base, id: "sec", name: "Secondary", primaryRole: "TOP", secondaryRole: "MID", pool: ["Orianna", "Ahri"] },
        { ...base, id: "pri", name: "Primary", primaryRole: "MID", secondaryRole: null, pool: ["Orianna"], proficiency: [{ championId: "Orianna", tier: "strong", games: 40 }] },
        { ...base, id: "none", name: "Not mid", primaryRole: "ADC", secondaryRole: "SUPPORT", pool: ["Jinx"] },
      ],
      physical,
      champions,
    );
    expect(out.map((s) => s.playerId)).toEqual(["pri", "sec"]);
    expect(out[0]!.reasons[0]).toMatch(/primary role/);
    expect(out[0]!.reasons.join(" ")).toMatch(/Orianna \(40 games\)/);
    expect(out[0]!.reasons.join(" ")).toMatch(/magic damage/);
  });

  it("ranks a player with no champions for the role last and says so", () => {
    const out = suggestForRole("MID", [{ ...base, id: "empty", name: "Empty", primaryRole: "MID", secondaryRole: null, pool: [] }, { ...base, id: "sec", name: "Secondary", primaryRole: "TOP", secondaryRole: "MID", pool: ["Ahri", "Syndra", "Orianna"] }], physical, champions);
    expect(out.map((s) => s.playerId)).toEqual(["sec", "empty"]);
    expect(out[1]!.reasons.join(" ")).toMatch(/no Mid champions/);
  });
});
