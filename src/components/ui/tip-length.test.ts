import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { METRICS } from "@/domain/metrics";
import type { LpRecord } from "@/domain/lp-attribution";
import { lpNote } from "@/components/match-history/match-card";

/*
  Every explanation is short (docs/STANDARDS.md, "Tooltips"; DESIGN_SYSTEM §7, "Explain"): one plain
  sentence of at most about 25 words, never more than 40. Counted here in the source, for every
  InfoTip's `text`, every `title` and every `hint` written as a literal (a template's `${…}` counts
  as one word), every constant a tip reads (TIP_CONSTANTS) and every metric's tip. A text with
  several states or entries is counted per state: each literal on its own.

  ALLOWLIST is empty: the overhaul's last long tips were rewritten (S8b). The two permanent
  exemptions are not tips, and are not written as a tip's literal, so they need no entry: Riot's
  required notice (G13), shown whole where it must be, and screen-reader-only descriptions (I08).
  A new entry needs its reason.

  Member-facing help also uses the page's words, never the code's (JARGON): no "PUUID", "Riot's
  API", "frame" for a minute of the timeline, "sync window", "Population:", "Source:" or "SELECT".
*/

const ROOT = join(__dirname, "..", "..", "..");
const HARD = 40;
const ABOUT = 25;

/**
 * Constants whose text an InfoTip shows, by name; and SOCIAL_LINKS_HELP, a section's visible help held
 * to the same length since 25 Nov 2026 (it was a 44-word paragraph).
 */
const TIP_CONSTANTS = ["MULTIKILL_HELP", "ENCOUNTERS_CAVEAT", "EDITING_HELP", "TOGETHER_CAVEAT", "RECENT_FORM_HELP", "GENERAL_RULE_TIP", "SOCIAL_LINKS_HELP", "SCORE_METHOD", "SCORE_METHOD_NEUTRAL", "HASTE_RULE_WORDS", "DATA_LIMIT_WORDS"];

/** Object properties whose text a tip shows: a hint, a title, and a state's meaning (`means`, the Riot credential's ⓘ in Settings). */
const TIP_PROPS = ["hint", "title", "means"];

/** Texts allowed past the limits, by a fragment of their source, with the reason. */
const ALLOWLIST: Array<{ id: string; fragment: string; reason: string }> = [
  // Riot's required notice (G13) and screen-reader-only descriptions (I08) are not tips, and are not
  // written as a tip's literal, so they need no entry here.
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
  const prop = new RegExp(String.raw`\b(?:${TIP_PROPS.join("|")}):\s*(?:${LITERAL})`, "g");
  const constant = new RegExp(String.raw`\b(?:${TIP_CONSTANTS.join("|")})\s*=\s*(?:${LITERAL})`, "g");
  for (const path of sources(join(ROOT, "src"))) {
    const code = readFileSync(path, "utf8");
    const file = relative(ROOT, path);
    for (const re of [attr, prop, constant]) for (const m of code.matchAll(re)) out.push({ file, text: m[1] ?? m[2] ?? "" });
  }
  for (const [key, m] of Object.entries(METRICS)) out.push({ file: `src/domain/metrics.ts (${key})`, text: m.tip });
  return out.filter((t) => t.text.trim().length > 0);
}

/** The code's words, refused in help everywhere (Admin Mode included since S9c). */
const JARGON = /PUUID|Riot's API|\b(per|minute|timeline) frames?\b|sync window|Population:|Source:|\bSELECT\b/;

/** Every state of the LP tip on a match card (H10), each one counted on its own. */
const reading = { label: "Platinum IV", leaguePoints: 75, at: 0 } as const;
const LP_STATES: LpRecord[] = [
  { kind: "lp", delta: -18, before: { ...reading, at: Date.UTC(2026, 10, 17, 9, 41) }, after: { ...reading, leaguePoints: 57, at: Date.UTC(2026, 10, 18, 10, 20) } },
  { kind: "promoted", before: reading, after: { ...reading, label: "Platinum III", leaguePoints: 0 } },
  ...(["remake", "unknown-length", "before-tracking", "awaiting-reading", "readings-too-far", "series", "season-reset", "unranked", "inconsistent"] as const).map((reason): LpRecord => ({ kind: "none", reason })),
  { kind: "none", reason: "before-tracking", trackingSince: Date.UTC(2026, 9, 1) },
  { kind: "none", reason: "several-games", games: 3, before: reading, after: { ...reading, leaguePoints: 40 } },
];

const allowed = (text: string) => ALLOWLIST.find((a) => text.includes(a.fragment));

describe("tooltips are short", () => {
  const tips = tipTexts();

  it("finds the tips it counts", () => {
    expect(tips.length).toBeGreaterThan(100);
    // The composed and visible texts added on 25 Nov 2026 are counted too: a state's meaning and a section's help.
    expect(tips.some((t) => t.file.endsWith("riot-health-panel.tsx") && t.text.startsWith("Riot refused the key"))).toBe(true);
    expect(tips.some((t) => t.file.endsWith("social-links-editor.tsx") && t.text.startsWith("Optional. Each link"))).toBe(true);
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

  it("member-facing help uses the page's words, not the code's", () => {
    const jargon = tips.filter((t) => JARGON.test(t.text)).map((t) => `${t.file}: ${t.text.slice(0, 80)}`);
    expect(jargon).toEqual([]);
    expect(JARGON.test("Gold is read once per frame")).toBe(true);
    expect(JARGON.test("Wash, border and frame")).toBe(false);
  });

  it("the LP tip on a match card: every state alone at most about 25 words, in plain words (H10)", () => {
    for (const lp of LP_STATES) {
      const text = lpNote(lp);
      expect(words(text), text).toBeLessThanOrEqual(ABOUT);
      expect(text, text).not.toMatch(/UNIIVERSE|reading/);
    }
  });

  it("the LP tip never says the earlier check was before the game: rule 2 lets it fall during the game (R7 review C6)", () => {
    const lp = LP_STATES.find((l) => l.kind === "lp")!;
    expect(lpNote(lp)).not.toMatch(/just before/);
    expect(lpNote(lp)).toMatch(/either side of this game's result\.$/);
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
