import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABLE_FIGURES, TEXT_TIERS, readTableFigures, readTypeFacts, tableFigureVerdicts, tiersDeployed, typeVerdicts, type TableFigureFacts, type TypeFacts } from "../../../scripts/type-facts.mjs";

/*
  The Production check's text hierarchy facts (scripts/type-facts.mjs; the owner's readability
  request of 25 Nov 2026): the four text tiers deployed with globals.css's values, no live text in the
  disabled tone, and sentence-case labels where the page's labels are sentence case; and All
  Champions' table: every figure primary, semibold only in the sorted column. The readings below are
  what readTypeFacts and readTableFigures return in a page.
*/

const facts = (over: Partial<TypeFacts> = {}): TypeFacts => ({ tiers: { ...TEXT_TIERS }, disabledTone: { live: 0, inControls: 2 }, capitals: [], ...over });
const statuses = (v: ReturnType<typeof typeVerdicts>) => v.map((x) => x.status);

describe("the text hierarchy facts", () => {
  it("expect the tiers globals.css defines", () => {
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    for (const [name, value] of Object.entries(TEXT_TIERS)) expect(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1]?.toLowerCase(), name).toBe(value);
  });

  it("pass with the tiers deployed, the disabled tone only on disabled controls and no capitals", () => {
    expect(tiersDeployed(TEXT_TIERS)).toBe(true);
    expect(statuses(typeVerdicts({ kind: "desktop", page: "profile", facts: facts(), tiers: true, sentenceCase: true }))).toEqual(["PASS", "PASS", "PASS"]);
    // Team Overview keeps its approved capitals: its page is judged without the sentence-case fact.
    expect(statuses(typeVerdicts({ kind: "phone", page: "team", facts: facts({ capitals: ["dt in lineup-row-MID"] }) }))).toEqual(["PASS"]);
  });

  it("fail on a missing or old tier, live text in the disabled tone, or capitals where labels are sentence case", () => {
    expect(tiersDeployed({ ...TEXT_TIERS, "--color-fg-muted": "#b4b8c9" })).toBe(false);
    expect(tiersDeployed({ "--color-fg": "#eef0f6" })).toBe(false);
    expect(tiersDeployed(null)).toBe(false);
    expect(statuses(typeVerdicts({ kind: "desktop", page: "team", facts: facts({ tiers: { ...TEXT_TIERS, "--color-fg-disabled": "" } }), tiers: true }))).toEqual(["FAIL", "PASS"]);
    expect(statuses(typeVerdicts({ kind: "tablet", page: "settings", facts: facts({ disabledTone: { live: 1, inControls: 0 } }), sentenceCase: true }))).toEqual(["FAIL", "PASS"]);
    const caps = typeVerdicts({ kind: "phone", page: "profile", facts: facts({ capitals: ["span in pool-columns", "p", "dt", "dd"] }), sentenceCase: true });
    expect(statuses(caps)).toEqual(["PASS", "FAIL"]);
    expect(caps[1]!.detail).toEqual({ capitals: 4, first: ["span in pool-columns", "p", "dt"] });
  });

  it("read in the page only: no words leave it (the check's output is public)", () => {
    const source = readTypeFacts.toString();
    expect(source).not.toMatch(/textContent\s*\?\?\s*""\)\.trim\(\)\.slice|innerText/);
    expect(source).toContain("data-name-style");
  });

  it("All Champions' table: passes with every figure primary and the sorted column alone in semibold; not applicable on narrow rows or an empty list", () => {
    const table = (over: Partial<TableFigureFacts> = {}): TableFigureFacts => ({ table: true, cells: 48, notPrimary: 0, emptyNotTertiary: 0, weightOff: 0, headings: 11, headingOff: 0, ...over });
    expect(statuses(tableFigureVerdicts({ kind: "desktop", facts: table() }))).toEqual(["PASS"]);
    const narrow = tableFigureVerdicts({ kind: "phone", facts: table({ table: false, cells: 0 }) });
    expect(statuses(narrow)).toEqual(["PASS"]);
    expect(narrow[0]!.detail).toMatch(/^not applicable/);
    expect(tableFigureVerdicts({ kind: "tablet", facts: table({ cells: 0 }) })[0]!.detail).toMatch(/^not applicable/);
  });

  it("All Champions' table: fails on a grey figure (the merge's regression), a dash not tertiary, a semibold figure outside the sorted column or a second semibold heading", () => {
    const table = (over: Partial<TableFigureFacts> = {}): TableFigureFacts => ({ table: true, cells: 48, notPrimary: 0, emptyNotTertiary: 0, weightOff: 0, headings: 11, headingOff: 0, ...over });
    for (const over of [{ notPrimary: 40 }, { emptyNotTertiary: 1 }, { weightOff: 2 }, { headingOff: 1 }]) expect(statuses(tableFigureVerdicts({ kind: "desktop", facts: table(over) })), JSON.stringify(over)).toEqual(["FAIL"]);
  });

  it("All Champions' table is read as counts only (no words leave the page) over its figure columns", () => {
    expect(TABLE_FIGURES).toEqual(["champion-kda", "champion-cs", "champion-kills", "champion-double", "champion-triple", "champion-quadra", "champion-penta", "mastery-points"]);
    const source = readTableFigures.toString();
    expect(source).toMatch(/return \{ table: true, cells, notPrimary, emptyNotTertiary, weightOff, headings: heads\.length, headingOff \}/);
    expect(source).not.toMatch(/innerText|names|data-champion/);
  });
});
