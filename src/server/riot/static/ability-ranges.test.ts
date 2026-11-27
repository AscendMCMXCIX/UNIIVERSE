import { describe, expect, it } from "vitest";
import * as script from "../../../../scripts/static/review-ability-ranges.mjs";
import sample from "../../../../tests/fixtures/ddragon-16.22.1-sample.json";
import table from "./ability-ranges.reviewed.json";
import championsFixture from "@/server/riot/fixtures/champions.fixture.json";
import { abilityFixture } from "./ability-fixture";
import { ABILITY_FIXTURE_VERSION } from "./abilities";
import { RANGE_TABLE_HASH, isRangeReview, rangeReviewRows, rangeReviewsFor } from "./ability-ranges";
import { compareDdragonVersions } from "@/domain/champion-lookup/cooldown";
import { GLOBAL_FROM, reachOk, reviewMatches, TWO_FORMS, type RangeReview } from "@/domain/champion-lookup/range";

/*
  The committed table of ability ranges (ability-ranges.reviewed.json; docs/CHAMPION_INTEL.md,
  "Ranges"): its shape, the offline fixture (Data Dragon 16.22.1) against every row, and the drafting
  script's fixed rules giving the automated drafts it holds (on Data Dragon's own files for the seven
  champions of the untouched sample, which carry the tooltips the rules read).
*/

const rows = (table as unknown as { rows: RangeReview[] }).rows;
const fixture = abilityFixture();
const spellOf = (r: RangeReview) => fixture.champions[r.champion]?.abilities.find((a) => a.slot === r.slot);
/**
 * Rows reviewed at a later Data Dragon version than the fixture's whose key Riot changed between the
 * two (so they do not match the fixture). Each one is deliberate: the e2e server reads the fixture's
 * version, and these rows show nothing there. 16.22.1 → 16.23.1 changed only Mel's W, a `self` row
 * (nothing is shown either way).
 */
const MOVED_SINCE_FIXTURE: string[] = ["Mel:W"];

describe("the committed table", () => {
  it("is in the rule's shape, every row: no row is left out when the server reads it", () => {
    expect(table).toMatchObject({ format: script.RANGE_TABLE_FORMAT });
    expect((table as { process?: string }).process).toMatch(/no wiki, no CommunityDragon/);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(isRangeReview(r), `${r.champion} ${r.slot}`).toBe(true);
    expect(rangeReviewRows()).toHaveLength(rows.length);
    expect(RANGE_TABLE_HASH).toMatch(/^[0-9a-f]{16}$/);
  });

  it("has one row per champion and slot, every champion on the roster, no passive, a reviewer named by role only", () => {
    const keys = rows.map((r) => `${r.champion}:${r.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
    const roster = new Set(championsFixture.champions.map((c) => c.id));
    for (const r of rows) {
      expect(roster.has(r.champion), r.champion).toBe(true);
      expect(["Q", "W", "E", "R"]).toContain(r.slot);
      expect(script.RANGE_REVIEWERS).toContain(r.reviewer);
      expect(script.RANGE_KINDS).toContain(r.kind);
      if (r.kind === "none") expect(script.NONE_REASONS, `${r.champion} ${r.slot}`).toContain(r.why);
      expect(compareDdragonVersions(r.version, ABILITY_FIXTURE_VERSION), `${r.champion} ${r.slot}: a Data Dragon version`).not.toBeNull();
      expect(r.reviewed).toMatch(/^20\d\d-\d\d-\d\d$/);
    }
    expect(rangeReviewsFor("Ahri").Q?.spell).toBe("AhriQ");
    expect(rangeReviewsFor("NotAChampion")).toEqual({});
  });

  it("holds every reach row to the rule's validation and every global row to the engine's number, on its own range", () => {
    for (const r of rows) {
      const a = spellOf(r);
      if (r.kind === "reach") {
        expect(reachOk(r.range, r.range.length), `${r.champion} ${r.slot}`).toBe(true);
        expect(TWO_FORMS.test(a?.name ?? ""), `${r.champion} ${r.slot}`).toBe(false);
      }
      if (r.kind === "global") expect(r.range.every((v) => v >= GLOBAL_FROM), `${r.champion} ${r.slot}`).toBe(true);
    }
  });

  it("matches the offline fixture (Data Dragon 16.22.1) row for row: the spell id, the range and Riot's text, so a stale table fails here when the fixture moves", () => {
    const moved: string[] = [];
    for (const r of rows) {
      const a = spellOf(r);
      expect(a, `${r.champion} ${r.slot}`).toBeDefined();
      const matches = reviewMatches(a!, r);
      if (r.version === ABILITY_FIXTURE_VERSION) expect(matches, `${r.champion} ${r.slot} reviewed at the fixture's version`).toBe(true);
      else if (!matches) moved.push(`${r.champion}:${r.slot}`);
    }
    expect(moved).toEqual(MOVED_SINCE_FIXTURE);
  });

  it("holds the automated drafts to the drafting script's fixed rules: on the sample's champions, every high-confidence draft is a row of its kind unless a review decided it, and every automated-draft row a high-confidence draft", () => {
    const { spells } = script.spellsOf(sample);
    const byKey = new Map(rows.map((r) => [`${r.champion}:${r.slot}`, r]));
    let drafted = 0;
    for (const s of spells) {
      const d = script.draftRange(s.detail, s.championDetail);
      const row = byKey.get(`${s.champion}:${s.slot}`);
      if (d.confidence === "high") {
        drafted += 1;
        // A review (two independent reviewers, the adjudicators: CHAMPION_INTEL.md "Ranges") overrides a draft; --write keeps its row.
        expect(row, `${s.champion} ${s.slot}`).toBeDefined();
        if (row!.reviewer === "automated draft") expect(row!.kind, `${s.champion} ${s.slot}`).toBe(d.kind);
        expect(script.rowMatches(row, s), `${s.champion} ${s.slot}`).toBe(true);
      }
      if (row?.reviewer === "automated draft") expect(d, `${s.champion} ${s.slot}`).toMatchObject({ confidence: "high", kind: row.kind, rule: row.rule });
    }
    expect(drafted).toBeGreaterThan(5);
  });
});

describe("the drafting script's fixed rules", () => {
  const draft = (over: Record<string, unknown>) => script.draftRange({ id: "XQ", name: "X", maxrank: 5, range: [900, 900, 900, 900, 900], description: "", tooltip: "", ...over }, { stats: { attackrange: 550 } });

  it("says none, with confidence, for a placeholder, a slot of two abilities, a range smaller at a higher rank or the wrong number of ranks", () => {
    expect(draft({ range: [0, 0, 0, 0, 0] })).toMatchObject({ kind: "none", confidence: "high", why: "placeholder" });
    expect(draft({ range: [20, 20, 20, 20, 20] })).toMatchObject({ kind: "none", confidence: "high" });
    expect(draft({ name: "To the Skies! / Shock Blast", description: "Jayce leaps to an enemy." })).toMatchObject({ kind: "none", confidence: "high", why: "two-forms" });
    expect(draft({ range: [3000, 4500, 6000, 3000, 3000] })).toMatchObject({ kind: "none", confidence: "high" });
    expect(draft({ range: [900, 900, 900] })).toMatchObject({ kind: "none", confidence: "high" });
  });

  it("calls the engine's unlimited global only where Riot's text says the whole map, else leaves it to a reviewer", () => {
    expect(draft({ range: [25000, 25000, 25000], maxrank: 3, description: "Soraka restores health to all allied champions." })).toMatchObject({ kind: "global", confidence: "high" });
    expect(draft({ range: [25000, 25000, 25000], maxrank: 3, description: "Fires a missile in a line." })).toMatchObject({ kind: "none", confidence: "medium" });
  });

  it("calls a reach high confidence only where Riot's text aims it with no doubt: thrown, fired, a dash, the first enemy hit; never with a radius, an attack change, modes, a charge or words about range", () => {
    expect(draft({ description: "Ahri throws her orb." })).toMatchObject({ kind: "reach", confidence: "high" });
    expect(draft({ description: "Ahri blows a kiss.", tooltip: "Charms the first enemy hit." })).toMatchObject({ kind: "reach", confidence: "high" });
    for (const description of ["Ahri throws her orb at nearby enemies.", "Throws a dagger. Her next attack deals damage.", "Fires a bolt; holding it charges a longer shot.", "Fires a bolt whose range grows.", "Throws a spear at all enemy champions."]) {
      expect(draft({ description }), description).toMatchObject({ kind: "reach", confidence: "medium" });
    }
    expect(draft({ description: "Throws a dagger.", tooltip: "Passive: gains speed. Active: throws a dagger." })).toMatchObject({ confidence: "medium" });
    // Equal to the champion's attack range (a reach that grows with it in a game), or a projectile shorter than it.
    expect(draft({ description: "Throws a dagger.", range: [550, 550, 550, 550, 550] })).toMatchObject({ confidence: "medium" });
    expect(draft({ description: "Throws a dagger.", range: [400, 400, 400, 400, 400] })).toMatchObject({ confidence: "medium" });
    // Nothing in Riot's text to go on.
    expect(draft({ description: "Deals damage." })).toMatchObject({ kind: null, confidence: "low" });
  });

  it("writes only high-confidence drafts, keeps a confirmed row Riot changed, and replaces a stale automated draft", () => {
    const one = { version: "16.22.1", data: { Gangplank: sample.data.Gangplank, Xerath: sample.data.Xerath } };
    const { table: first, done } = script.writeTable({ rows: [] }, one, "2026-11-27");
    expect(first.rows.length).toBeGreaterThan(2);
    expect(done.added).toBe(first.rows.length);
    expect(first.rows.every((r) => r.reviewer === "automated draft" && r.version === "16.22.1")).toBe(true);
    // A confirmed row whose text no longer matches is kept (the page hides it until reviewed again); a stale draft is redrafted.
    const confirmed = first.rows.map((r, i) => ({ ...r, textHash: "0000000000000000", reviewer: i === 0 ? ("automated review" as const) : r.reviewer }));
    const again = script.writeTable({ rows: confirmed }, one, "2026-11-28");
    expect(again.done).toMatchObject({ keptStale: 1, replaced: first.rows.length - 1 });
    expect(again.table.rows[0]!.textHash).toBe("0000000000000000");
    expect(script.checkTable(again.table, one).changed.map((c) => c.key)).toEqual([`${first.rows[0]!.champion}:${first.rows[0]!.slot}`]);
    expect(() => script.writeTable({ rows: [] }, one, "27 Nov")).toThrow(/Not a date/);
    // One row per line, read back as written.
    const text = script.serialiseTable(first);
    expect(JSON.parse(text).rows).toEqual(first.rows);
    expect(text.split("\n").filter((l) => l.startsWith('    {"champion"'))).toHaveLength(first.rows.length);
  });

  it("never deletes a review: given a file without some champions (partial, or older), --write keeps their reviewed rows, drops only their automated drafts, and counts and names both", () => {
    // The committed table against the seven champions of the sample: every other champion's rows are "gone" from that file.
    const inSample = new Set(Object.values(sample.data).map((c) => (c as { id: string }).id));
    const reviewed = rows as unknown as Parameters<typeof script.writeTable>[0]["rows"];
    const outside = reviewed.filter((r) => !inSample.has(r.champion));
    expect(outside.length).toBeGreaterThan(600);
    const { table: next, done, gone } = script.writeTable({ rows: reviewed }, sample, "2026-11-28");
    expect(next.rows).toHaveLength(reviewed.length);
    expect(done.keptGone).toBe(outside.length);
    expect(done.droppedGone).toBe(0);
    expect(gone.kept).toEqual(outside.map((r) => `${r.champion}:${r.slot}`));
    for (const r of outside) expect(next.rows).toContainEqual(r);
    // The check on the new table then lists every one of them as gone (exit 1), so a partial file cannot pass unseen.
    expect(script.checkTable(next, sample).gone).toHaveLength(outside.length);
    // An automated draft whose spell is not in the file is dropped, counted and named; a reviewed one beside it stays.
    const draftRow = { ...outside[0]!, reviewer: "automated draft" as const };
    const mixed = script.writeTable({ rows: [draftRow, outside[1]!] }, sample, "2026-11-28");
    expect(mixed.done).toMatchObject({ keptGone: 1, droppedGone: 1 });
    expect(mixed.gone).toEqual({ kept: [`${outside[1]!.champion}:${outside[1]!.slot}`], dropped: [`${draftRow.champion}:${draftRow.slot}`] });
    expect(mixed.table.rows).toContainEqual(outside[1]);
    expect(mixed.table.rows).not.toContainEqual(draftRow);
  });
});
