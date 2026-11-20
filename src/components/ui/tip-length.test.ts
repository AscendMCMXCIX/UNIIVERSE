import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { METRICS } from "@/domain/metrics";

/*
  Every explanation is short (docs/STANDARDS.md, "Tooltips"; DESIGN_SYSTEM §7, "Explain"): one plain
  sentence of at most about 25 words, never more than 40. Counted here in the source, for every
  InfoTip's `text`, every `title` and every `hint` written as a literal (a template's `${…}` counts
  as one word), every constant a tip reads (TIP_CONSTANTS) and every metric's tip. A text with
  several states or entries is counted per state: each literal on its own.

  ALLOWLIST holds the few that may be longer, each with its reason: two that are not tips at all,
  and those a later stage of the overhaul rewrites (the stage named empties its entries).
*/

const ROOT = join(__dirname, "..", "..", "..");
const HARD = 40;
const ABOUT = 25;

/** Constants whose text an InfoTip shows, by name. */
const TIP_CONSTANTS = ["MULTIKILL_HELP", "ENCOUNTERS_CAVEAT", "EDITING_HELP", "TOGETHER_CAVEAT", "GENERAL_RULE_TIP"];

/** Texts allowed past the limits, by a fragment of their source, with the reason. */
const ALLOWLIST: Array<{ id: string; fragment: string; reason: string }> = [
  // Riot's required notice (G13) and screen-reader-only descriptions (I08) are not tips, and are not
  // written as a tip's literal, so they need no entry here.
  { id: "H09", fragment: "count as one sitting", reason: "S6 rewrites Refine's playing sessions" },
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** The words of a literal: whitespace-separated, each `${…}` one word, markup and punctuation alone not counted. */
export function words(text: string): number {
  return text
    .replace(/\$\{[^}]*\}/g, " X ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const LITERAL = String.raw`"((?:[^"\\\n]|\\.)*)"|\`((?:[^\`\\]|\\.)*)\``;

/** Every tip text written in the source: [file, text]. */
function tipTexts(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const attr = new RegExp(String.raw`\b(?:text|title|hint)=\{?\s*(?:${LITERAL})`, "g");
  const prop = new RegExp(String.raw`\b(?:hint|title):\s*(?:${LITERAL})`, "g");
  const constant = new RegExp(String.raw`\b(?:${TIP_CONSTANTS.join("|")})\s*=\s*(?:${LITERAL})`, "g");
  for (const path of sources(join(ROOT, "src"))) {
    const code = readFileSync(path, "utf8");
    const file = relative(ROOT, path);
    for (const re of [attr, prop, constant]) for (const m of code.matchAll(re)) out.push({ file, text: m[1] ?? m[2] ?? "" });
  }
  for (const [key, m] of Object.entries(METRICS)) out.push({ file: `src/domain/metrics.ts (${key})`, text: m.tip });
  return out.filter((t) => t.text.trim().length > 0);
}

const allowed = (text: string) => ALLOWLIST.find((a) => text.includes(a.fragment));

describe("tooltips are short", () => {
  const tips = tipTexts();

  it("finds the tips it counts", () => {
    expect(tips.length).toBeGreaterThan(100);
    expect(words("Kills plus assists for each death, across all ${n} games.")).toBe(10);
  });

  it(`never more than ${HARD} words, outside the allowlist`, () => {
    const long = tips.filter((t) => words(t.text) > HARD && !allowed(t.text)).map((t) => `${t.file}: ${words(t.text)} words: ${t.text.slice(0, 80)}…`);
    expect(long).toEqual([]);
  });

  it(`at least 95% are ${ABOUT} words or fewer`, () => {
    const counted = tips.filter((t) => !allowed(t.text));
    const short = counted.filter((t) => words(t.text) <= ABOUT).length;
    expect(short / counted.length, counted.filter((t) => words(t.text) > ABOUT).map((t) => `${t.file}: ${words(t.text)}`).join("\n")).toBeGreaterThanOrEqual(0.95);
  });

  it("every allowlist entry still matches a tip and names its reason", () => {
    for (const a of ALLOWLIST) {
      expect(a.reason.length, a.id).toBeGreaterThan(10);
      expect(
        tips.some((t) => t.text.includes(a.fragment)),
        `${a.id} no longer matches: remove it`,
      ).toBe(true);
    }
  });
});
