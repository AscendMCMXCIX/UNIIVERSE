import { describe, expect, it } from "vitest";
import { abilityFixture } from "./ability-fixture";
import { patchCounts, patchDiff, patchProblems } from "./patch-check";
import { NOT_THE_MECHANIC } from "@/domain/champion-lookup/mechanics";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";

/*
  The patch-day check's counting (scripts/patch-check.ts, docs/PATCH_MAINTENANCE.md), on the committed
  offline fixture (Data Dragon 16.22.1): what the app's own rules make of every champion, what changed
  against a baseline, and what fails a patch check (a rules crash, a drop in resolved figures).
*/

const fixture = abilityFixture();
const clone = (): Record<string, DdragonChampionAbilities> => JSON.parse(JSON.stringify(fixture.champions)) as Record<string, DdragonChampionAbilities>;

describe("the patch check's counts", () => {
  it("counts the fixture's champions, spells, costs, cooldowns and mechanics chips", () => {
    const c = patchCounts(fixture.champions);
    expect(c.champions).toBe(Object.keys(fixture.champions).length);
    expect(c.spells).toBe(c.champions * 4);
    expect(c.costs.perRank + c.costs.none + c.costs.words + c.costs.unresolved).toBe(c.spells);
    expect(c.costs.perRank).toBeGreaterThan(300);
    expect(c.mechanicChips).toBeGreaterThan(c.champions);
    expect(Object.values(c.cooldowns).reduce((a, b) => a + b, 0)).toBe(c.spells);
    expect(c.resolved).toBeGreaterThan(c.spells * 0.8);
    // Costs and cooldowns apart: each spell's cost resolves unless unresolved, its cooldown unless unknown.
    expect(c.resolvedCosts).toBe(c.spells - c.costs.unresolved);
    expect(c.resolvedCooldowns).toBe(c.spells - Object.entries(c.cooldowns).filter(([k]) => k.startsWith("unknown")).reduce((a, [, n]) => a + n, 0));
    expect(c.resolved).toBeGreaterThanOrEqual(Math.max(c.resolvedCosts, c.resolvedCooldowns));
  });

  it("finds nothing changed between the fixture and itself, and no stale exception", () => {
    expect(patchDiff(fixture.champions, fixture.champions)).toEqual({ added: [], removed: [], textChanged: 0, cooldownChanged: 0, costChanged: 0, staleMechanicExceptions: [], staleCooldownExceptions: [] });
  });

  it("finds a new champion, a changed text, cooldown and cost, and an exception pinned to a text that changed", () => {
    const next = clone();
    const [key] = [...NOT_THE_MECHANIC.keys()];
    const [champion, slot] = key!.split("|");
    const pinned = next[champion!]!.abilities.find((a) => a.slot === slot)!;
    pinned.textHash = "0000000000000000";
    const riven = next.Riven!.abilities.find((a) => a.slot === "Q")!;
    riven.cooldown = [12, 12, 12, 12, 12];
    riven.cost = [5, 5, 5, 5, 5];
    next.Newcomer = { ...next.Riven!, championId: "Newcomer" };
    delete next.Zyra;
    const d = patchDiff(fixture.champions, next);
    expect(d.added).toEqual(["Newcomer"]);
    expect(d.removed).toEqual(["Zyra"]);
    expect(d.textChanged).toBe(1);
    expect(d.cooldownChanged).toBe(1);
    expect(d.costChanged).toBe(1);
    expect(d.staleMechanicExceptions).toEqual([key]);
  });

  it("fails on a champion the rules could not read, and on resolved figures dropping beyond the limit", () => {
    const baseline = patchCounts(fixture.champions);
    expect(patchProblems({ unreadable: [], baseline, next: baseline, maxDropPct: 5 })).toEqual([]);
    expect(patchProblems({ unreadable: ["Newcomer"], baseline, next: baseline, maxDropPct: 5 })[0]).toMatch(/could not read: Newcomer/);
    // Riot changes the resource line's placeholders: no cost resolves any more.
    const broken = clone();
    for (const c of Object.values(broken)) for (const a of c.abilities) if (a.resource) a.resource = `{{ newcost }} ${a.resource}`;
    const problems = patchProblems({ unreadable: [], baseline, next: patchCounts(broken), maxDropPct: 5 });
    expect(problems.some((p) => /resolved costs or cooldowns fell/.test(p))).toBe(true);
    expect(problems.some((p) => /^resolved costs fell/.test(p))).toBe(true);
  });

  it("fails when every cooldown stops resolving, although nearly every spell's cost still does", () => {
    const baseline = patchCounts(fixture.champions);
    // Riot changes the cooldown fields: every array empty (the schema still reads it), so no cooldown shows anywhere.
    const broken = clone();
    for (const c of Object.values(broken)) for (const a of c.abilities) a.cooldown = [];
    const next = patchCounts(broken);
    expect(next.resolvedCooldowns).toBe(0);
    expect(next.resolvedCosts).toBe(baseline.resolvedCosts);
    // The combined share moves less than the limit (a cost still resolves for almost every spell)…
    expect(((baseline.resolved - next.resolved) / baseline.spells) * 100).toBeLessThan(5);
    // …but the cooldowns' own share fails the check.
    const problems = patchProblems({ unreadable: [], baseline, next, maxDropPct: 5 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^resolved cooldowns fell from \d+(\.\d)?% to 0% of spells \(more than 5 points\)$/);
  });
});
