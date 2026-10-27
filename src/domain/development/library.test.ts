import { describe, expect, it } from "vitest";
import { categoryLabel, cleanCustomCategory, DEVELOPMENT_CATEGORIES, isObjectiveCategory, LEGACY_MISTAKE_CATEGORY } from "./categories";
import { cleanObjective, isActiveStatus, looksLikeOutcome, needsRevisit, OBJECTIVE_STATUSES, REVISIT_AFTER_DAYS } from "./objectives";
import { cleanPlan, cleanPlanPart, planSentence, PLAN_TEMPLATES, templatesFor } from "./plans";
import { MAIN_MISTAKES } from "@/domain/ranked-improvement";
import { isMeasure, measureRelation, suggestedMeasures } from "./measures";

const DAY = 86_400_000;

describe("development areas", () => {
  it("cover the areas the library promises, and every old journal mistake maps onto one", () => {
    const labels = DEVELOPMENT_CATEGORIES.map((c) => c.label);
    for (const l of ["Laning fundamentals", "Wave management", "Trading", "Jungle awareness", "Vision", "Recall timing", "Objective preparation", "Map awareness", "Mid-game rotations", "Side-lane management", "Teamfighting", "Positioning", "Resource management", "Decision-making discipline"]) expect(labels).toContain(l);
    for (const m of MAIN_MISTAKES) expect(DEVELOPMENT_CATEGORIES.some((c) => c.key === LEGACY_MISTAKE_CATEGORY[m.key])).toBe(true);
  });

  it("reads a custom area by the name the player gave it", () => {
    expect(categoryLabel("custom", "Lane swaps")).toBe("Lane swaps");
    expect(categoryLabel("vision")).toBe("Vision");
    expect(categoryLabel("nope")).toBe("—");
    expect(isObjectiveCategory("custom")).toBe(true);
    expect(cleanCustomCategory("  Lane   swaps ")).toBe("Lane swaps");
    expect(cleanCustomCategory("x")).toBeNull();
    expect(cleanCustomCategory("x".repeat(41))).toBeNull();
  });
});

describe("objectives", () => {
  it("accept a practisable objective and clean it", () => {
    const r = cleanObjective({ title: "  Track the   enemy jungler ", category: "jungle-awareness", role: "MID", championIds: ["Ahri", "Ahri", " Syndra "], measure: "early-deaths" });
    expect(r).toEqual({ ok: true, value: { title: "Track the enemy jungler", detail: "", category: "jungle-awareness", customCategory: null, role: "MID", championIds: ["Ahri", "Syndra"], measure: "early-deaths" } });
  });

  it("refuse what cannot be kept, saying why", () => {
    expect(cleanObjective({ title: "ab", category: "vision" })).toMatchObject({ ok: false });
    expect(cleanObjective({ title: "Ward more", category: "farming" })).toMatchObject({ ok: false, error: expect.stringMatching(/area/) });
    expect(cleanObjective({ title: "Ward more", category: "custom", customCategory: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/own area/) });
    expect(cleanObjective({ title: "Ward more", category: "vision", role: "CARRY" })).toMatchObject({ ok: false });
    expect(cleanObjective({ title: "Ward more", category: "vision", championIds: ["A", "B", "C", "D", "E", "F"] })).toMatchObject({ ok: false });
    expect(cleanObjective({ title: "Ward more", category: "vision", measure: "lp" })).toMatchObject({ ok: false });
  });

  it("notice titles that name a result rather than a skill", () => {
    expect(looksLikeOutcome("Reach Diamond this split")).toBe(true);
    expect(looksLikeOutcome("Get to Gold")).toBe(true);
    expect(looksLikeOutcome("60% win rate")).toBe(true);
    expect(looksLikeOutcome("Spend gold before recalling")).toBe(false);
    expect(looksLikeOutcome("Track the enemy jungler")).toBe(false);
  });

  it("go Identified → Practising → Improving → Maintaining; only Maintaining is complete", () => {
    expect(OBJECTIVE_STATUSES).toEqual(["identified", "practising", "improving", "maintaining"]);
    expect(OBJECTIVE_STATUSES.filter(isActiveStatus)).toEqual(["identified", "practising", "improving"]);
  });

  it("offer a maintained skill for a revisit after a month away, or when its statistic moved back", () => {
    const now = Date.UTC(2026, 9, 27);
    const recent = { status: "maintaining" as const, lastPractisedAt: new Date(now - 5 * DAY), statusChangedAt: new Date(now - 40 * DAY) };
    expect(needsRevisit(recent, null, now)).toBeNull();
    expect(needsRevisit({ ...recent, lastPractisedAt: new Date(now - REVISIT_AFTER_DAYS * DAY) }, null, now)).toBe("not-practised");
    expect(needsRevisit({ ...recent, lastPractisedAt: null }, null, now)).toBe("not-practised");
    expect(needsRevisit(recent, "away", now)).toBe("statistic");
    expect(needsRevisit({ ...recent, status: "practising" }, "away", now)).toBeNull();
  });
});

describe("If–Then plans", () => {
  it("keep the situation and the action without doubled IF/THEN words", () => {
    expect(cleanPlanPart("If I recall,", "if")).toBe("I recall");
    expect(cleanPlanPart("THEN: I buy a Control Ward.", "then")).toBe("I buy a Control Ward");
    expect(cleanPlan({ ifText: "If I recall", thenText: "I buy a Control Ward" })).toEqual({ ok: true, value: { ifText: "I recall", thenText: "I buy a Control Ward" } });
    expect(planSentence({ ifText: "I recall", thenText: "I buy a Control Ward" })).toBe("If I recall, then I buy a Control Ward.");
  });

  it("need both parts, each short enough to recall between games", () => {
    expect(cleanPlan({ ifText: "", thenText: "I ward" })).toMatchObject({ ok: false, error: expect.stringMatching(/situation/) });
    expect(cleanPlan({ ifText: "I recall", thenText: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/what you will do/) });
    expect(cleanPlan({ ifText: "x".repeat(201), thenText: "I ward now" })).toMatchObject({ ok: false });
  });

  it("offer templates for the area and role, the role's own first, never for the wrong role", () => {
    const mid = templatesFor("jungle-awareness", "MID");
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.every((t) => !t.roles || t.roles.includes("MID"))).toBe(true);
    expect(templatesFor("jungle-awareness", "JUNGLE").map((t) => t.key)).toEqual(["jungle-cross-map"]);
    expect(templatesFor("custom", "MID")).toEqual([]);
    expect(new Set(PLAN_TEMPLATES.map((t) => t.key)).size).toBe(PLAN_TEMPLATES.length);
    // Every template already passes the plan rules.
    for (const t of PLAN_TEMPLATES) expect(cleanPlan(t).ok).toBe(true);
  });
});

describe("statistics offered for an objective", () => {
  it("offer honest ones only, and none where no statistic follows the habit", () => {
    expect(suggestedMeasures("vision", "SUPPORT").map((s) => s.measure)).toEqual(["vision-per-min", "control-wards"]);
    expect(suggestedMeasures("wave-management", "SUPPORT")).toEqual([]);
    expect(suggestedMeasures("recall-timing", "MID")).toEqual([]);
    expect(suggestedMeasures("objective-setup", "JUNGLE")).toEqual([]);
    expect(measureRelation("jungle-awareness", "early-deaths")).toBe("related");
    expect(measureRelation("laning", "early-deaths")).toBe("direct");
    expect(isMeasure("deaths")).toBe(true);
    expect(isMeasure("lp")).toBe(false);
  });
});
