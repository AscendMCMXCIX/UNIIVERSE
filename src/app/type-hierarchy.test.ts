import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/*
  The text hierarchy (25 Nov 2026, the owner's readability request; docs/STANDARDS.md, "Type"): four
  tiers, each for one job (primary fg for names, headings and every figure; secondary fg-muted for
  labels and supporting context; tertiary fg-subtle for metadata only; fg-disabled for disabled
  controls alone), labels in sentence case, and one disabled look. This test reads every component
  and page and refuses what would bring the old habits back:
  - uppercase: a class list with `uppercase` (any variant) or the retired `label-caps`, outside a
    round pill (rounded-full: a badge such as "YOU", which keeps its capitals) and outside ALLOWED,
    where an approved design keeps its capitals (Team Overview's backdrop lettering, the Admin mode
    marker, the admin eyebrow, a member's own name style; Team Overview's labels went to sentence
    case on 27 Nov 2026, the owner's decision D4);
  - disabled-opacity: a control dimmed with opacity when disabled (`disabled:opacity-*`,
    `aria-disabled:opacity-*`, or `opacity-*` behind a `disabled &&` / `disabled ?`): the words of a
    disabled control are fg-disabled, `disabled:text-fg-disabled disabled:cursor-not-allowed`, never a
    half-transparent control that reads differently on every surface. A picture that dims as a whole
    (an avatar, a native range input the browser draws) goes in ALLOWED;
  - disabled-tone: `text-fg-disabled` on anything that is not disabled. The tone is under 4.5:1, which
    WCAG allows only for inactive controls (axe skips disabled and aria-disabled elements), so it must
    carry a disabled variant (`disabled:`, `aria-disabled:`, `peer-disabled:`, `group-aria-disabled/…:`)
    or sit behind the code's own disabled condition on the same line;
  - text-alpha: a text colour token with an alpha (`text-fg-subtle/60`): a contrast nobody measured
    (a zero count in fg-subtle at 60% was 3:1, under AA). Use the tier itself.
  ALLOWED entries name the file, the kind and the reason; each must still match something (a stale
  entry fails). (The release's temporary entries for the files its other lanes migrated went once
  each file was clean, the last on 26 Nov 2026: Match History's labels and its disabled steps.)
*/

const ROOT = path.join(__dirname, "../..");
const SCAN = ["src/components", "src/app"];

type Kind = "uppercase" | "label-caps" | "disabled-opacity" | "disabled-tone" | "text-alpha";

const ALLOWED: Array<{ file: string; kind: Kind; reason: string }> = [
  { file: "src/components/team/team-roster.tsx", kind: "uppercase", reason: "Team Overview's backdrop lettering (the team's short name at 3.5% opacity behind the lineup): artwork, not a label; its labels are sentence case since Release 19 (the owner's decision D4)" },
  { file: "src/components/app-shell.tsx", kind: "uppercase", reason: "the frame's Admin mode marker under the team's name: the mode's identity (DESIGN_SYSTEM.md §10)" },
  { file: "src/components/mobile-nav.tsx", kind: "uppercase", reason: "the phone bar's Admin mode marker: the mode's identity (DESIGN_SYSTEM.md §10)" },
  { file: "src/components/ui/page-header.tsx", kind: "uppercase", reason: "PageHeader's accent eyebrow, used by Admin Mode pages alone: the mode's identity (DESIGN_SYSTEM.md §10)" },
  { file: "src/components/players/card-look.tsx", kind: "uppercase", reason: "a member's chosen \"wide\" name style on their own card: their content, not a label" },
  { file: "src/components/players/customise-card.tsx", kind: "uppercase", reason: "the Card Studio's preview of the \"wide\" name style: the member's content, not a label" },
  { file: "src/components/team/team-roster.tsx", kind: "disabled-opacity", reason: "a lineup choice is a row with the player's picture: the whole row dims while it cannot be chosen" },
  { file: "src/components/profile/avatar-upload.tsx", kind: "disabled-opacity", reason: "the profile picture itself is the button: a picture dims as a whole" },
  { file: "src/components/settings/branding-panel.tsx", kind: "disabled-opacity", reason: "a native range input: the browser draws its track and thumb, which only opacity dims" },
];

/** Abbreviations written in capitals wherever they appear (a word of four or more capitals that is not a label). */
const CAPITALS_OK = new Set(["ARAM", "JPEG", "PUUID", "HTTP", "HTTPS", "JSON", "UNIIVERSE"]);
/** Words in capitals that stay, each with its file and reason. */
const CAPITALS_ALLOWED: Array<{ file: string; word: string; reason: string }> = [
  { file: "src/components/public/sign-in.tsx", word: "PRIVATE", reason: "the sign-in card's eyebrow, spaced as the brand's tagline: the owner's decision O4 of 26 Nov 2026 keeps it, as Admin Mode's markers" },
];

/** The words of four or more capital letters in a run of text, outside the abbreviations. */
function capitalsOf(text: string): string[] {
  return [...text.matchAll(/(?<![\w])[A-Z]{4,}(?![\w])/g)].map((w) => w[0]).filter((w) => !CAPITALS_OK.has(w));
}

/** Text that is code, not words on the page: an operator, or the `)` that closes one JSX block before the next (`</svg>\n  ),\n  JUNGLE: (`). */
const CODE = /[=?;+&|]|^\s*\)/;

/**
 * The words of four or more capitals a component's JSX shows, each with its line, read from the whole
 * source (Release 19's review: a per-line scan missed the V4 labels on a line of their own and those a
 * JSX expression returns). Comments are left out; `<wbr />` (a break inside a word, as in an environment
 * variable's name) joins the parts it splits.
 * - JSX text: after a tag's `>` (not an arrow's `=>`), over as many lines as it runs, up to the next tag or
 *   `{` (`<Label>`, then `PRIMARY ROLE *{" "}` on the next line); after an expression's `}`, on its own line,
 *   up to the next tag (`{n} CHAMPIONS</span>`); never code (CODE).
 * - What a child expression shows: in a `{…}` after a tag's `>` (and any text) or after another `{…}`, each string it returns, alone
 *   or in a branch (`{"…"}`, `{required ? "PASSWORD *" : "…"}`, `&& "…"`, `|| "…"`, `?? "…"`), a template's
 *   text too; never a string the expression compares or passes on (`x === "TOP"`, `cn("…")`).
 */
export function capitalWords(source: string): Array<{ word: string; line: number }> {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  const s = source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(?<![:\w"'`\\])\/\/[^\n]*/g, blank)
    .replace(/<wbr\s*\/>/g, "");
  const lineAt = (i: number) => s.slice(0, i).split("\n").length;
  const out: Array<{ word: string; line: number }> = [];
  const add = (text: string, at: number) => {
    for (const word of capitalsOf(text)) out.push({ word, line: lineAt(at + text.indexOf(word)) });
  };
  for (const m of s.matchAll(/(?<![=-])>([^<>{}]*)(?=[<{])|\}([^<>{}\n]*)(?=<)/g)) {
    const text = m[1] ?? m[2]!;
    if (!CODE.test(text)) add(text, m.index + 1);
  }
  // The expression after a tag (and its text), or straight after another (`{a}{b}`); its closing brace is left for the next.
  for (const m of s.matchAll(/(?:(?<![=-])>([^<>{}]*)|\}(\s*))\{((?:[^{}]|\$\{[^{}]*\})*)(?=\})/g)) {
    const before = m[1] ?? m[2]!;
    const expr = m[3]!;
    if (CODE.test(before) || expr.includes(";")) continue;
    const start = m.index + 1 + before.length + 1;
    for (const r of expr.matchAll(/(?:^|\?|:|&&|\|\||\?\?)\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
      const text = (r[1] ?? r[2] ?? r[3] ?? "").replace(/\$\{[^{}]*\}/g, (x) => blank(x));
      add(text, start + r.index + r[0].length - text.length - 1);
    }
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A class without its variants ("@sm:uppercase" → "uppercase", "disabled:opacity-50" → "opacity-50"). */
const utility = (token: string) => token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
/** A class's variants ("disabled:hover:text-fg-disabled" → "disabled:hover:"). */
const variants = (token: string) => token.slice(0, token.lastIndexOf(":") + 1);

/** A variant that applies only while the element (or its peer or group) is disabled. */
const DISABLED_VARIANT = /(^|:)(disabled|aria-disabled|peer-disabled|group-disabled|group-aria-disabled(\/[\w-]+)?|peer-aria-disabled(\/[\w-]+)?|in-disabled|in-aria-disabled):/;

/** What one class list, written on `line` of the source, draws against the rules. */
export function hierarchyProblems(list: string, line: string): Kind[] {
  const tokens = list.split(/\s+/).filter(Boolean);
  const kinds = new Set<Kind>();
  const pill = tokens.some((t) => utility(t) === "rounded-full");
  // The code's own disabled condition on the line: `disabled ?`, `disabled &&`, `o.disabled`, `disabled:` (the line without the tone's own name).
  const lineSaysDisabled = /\bdisabled\b/.test(line.replaceAll("text-fg-disabled", ""));
  const dimmedWhenDisabled = /\bdisabled\b[^"'`]*?(&&|\?)/.test(line.replaceAll("text-fg-disabled", ""));
  for (const t of tokens) {
    const u = utility(t);
    // first-letter:uppercase capitalises a sentence's first letter: sentence case itself.
    if (u === "uppercase" && !pill && !/(^|:)first-letter:/.test(variants(t))) kinds.add("uppercase");
    if (u === "label-caps") kinds.add("label-caps");
    if (/^opacity-\d+$/.test(u) && (DISABLED_VARIANT.test(variants(t)) || (!variants(t) && dimmedWhenDisabled))) kinds.add("disabled-opacity");
    if (u === "text-fg-disabled" && !DISABLED_VARIANT.test(variants(t)) && !lineSaysDisabled) kinds.add("disabled-tone");
    if (/^text-fg(-muted|-subtle|-disabled)?\/\d+$/.test(u) || /^text-fg(-muted|-subtle|-disabled)?\/\[/.test(u)) kinds.add("text-alpha");
  }
  return [...kinds];
}

/** Every class list of a source with its line: each string literal. */
function lists(source: string): Array<{ list: string; line: string; at: number }> {
  const out: Array<{ list: string; line: string; at: number }> = [];
  source.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/"([^"]*)"|`([^`]*)`|'([^']*)'/g)) out.push({ list: m[1] ?? m[2] ?? m[3] ?? "", line, at: i + 1 });
  });
  return out;
}

describe("the text hierarchy", () => {
  it("recognises capitals, a dimmed disabled control, the disabled tone on live text and an alpha on text", () => {
    expect(hierarchyProblems("text-2xs font-semibold uppercase tracking-label text-fg-subtle", "")).toEqual(["uppercase"]);
    expect(hierarchyProblems("text-2xs @sm:uppercase @sm:tracking-label", "")).toEqual(["uppercase"]);
    expect(hierarchyProblems("rounded-full bg-accent px-1.5 text-2xs font-bold uppercase tracking-wide", "")).toEqual([]);
    expect(hierarchyProblems("text-sm text-fg-muted first-letter:uppercase", "")).toEqual([]);
    expect(hierarchyProblems("label-caps truncate", "")).toEqual(["label-caps"]);
    expect(hierarchyProblems("label-text truncate", "")).toEqual([]);
    expect(hierarchyProblems("transition-colors disabled:cursor-not-allowed disabled:opacity-50", "")).toEqual(["disabled-opacity"]);
    expect(hierarchyProblems("aria-disabled:opacity-50", "")).toEqual(["disabled-opacity"]);
    expect(hierarchyProblems("pointer-events-none opacity-50", `className={cn(base, disabled && "pointer-events-none opacity-50")}`)).toEqual(["disabled-opacity"]);
    expect(hierarchyProblems("opacity-50 saturate-[0.6]", `dimmed && "opacity-50 saturate-[0.6]"`)).toEqual([]);
    expect(hierarchyProblems("disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent", "")).toEqual([]);
    expect(hierarchyProblems("aria-disabled:text-fg-disabled", "")).toEqual([]);
    expect(hierarchyProblems("peer-disabled:bg-fg-disabled group-aria-disabled/select:text-fg-disabled", "")).toEqual([]);
    expect(hierarchyProblems("cursor-not-allowed text-fg-disabled", `opts.disabled ? "cursor-not-allowed text-fg-disabled" : "text-fg-muted"`)).toEqual([]);
    expect(hierarchyProblems("text-xs text-fg-disabled", `<p className="text-xs text-fg-disabled">Off</p>`)).toEqual(["disabled-tone"]);
    expect(hierarchyProblems("text-2xs tabular-nums text-fg-subtle/60", "")).toEqual(["text-alpha"]);
    expect(hierarchyProblems("decoration-fg-subtle/50 underline", "")).toEqual([]);
  });

  it("pages and components keep the four tiers, sentence-case labels and the one disabled look", () => {
    const found: string[] = [];
    const used = new Set<string>();
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        for (const { list, line, at } of lists(readFileSync(file, "utf8"))) {
          for (const kind of hierarchyProblems(list, line)) {
            const allowed = ALLOWED.find((a) => a.file === rel && a.kind === kind);
            if (allowed) used.add(`${rel} ${kind}`);
            else found.push(`${rel}:${at}: ${kind} in "${list.slice(0, 120)}"`);
          }
        }
      }
    }
    expect(found, "sentence-case labels (label-text), disabled:text-fg-disabled for a disabled control, a tier's own colour for text; or an exception with its reason (docs/STANDARDS.md, Type)").toEqual([]);
    const stale = ALLOWED.filter((a) => !used.has(`${a.file} ${a.kind}`)).map((a) => `${a.file} ${a.kind}`);
    expect(stale, "exceptions that no longer match anything: remove them").toEqual([]);
  });

  it("labels written in capitals in the text itself (not by a class) are caught too: no JSX text, and no string a JSX expression shows, with a word of four or more capitals outside the abbreviations and exceptions", () => {
    // Release 19 (the visual review's V4): "PRIMARY RIOT ID *" and "SETUP KEY *" were capitals typed into the JSX, which the class
    // scan above cannot see. A word of four or more capital letters in JSX text, or in a string a child expression shows, is one,
    // unless it is an abbreviation (CAPITALS_OK) or an exception with its reason (CAPITALS_ALLOWED).
    const words = (source: string) => capitalWords(source).map((c) => c.word);
    expect(words(`<Label>PRIMARY RIOT ID *</Label>`)).toEqual(["PRIMARY", "RIOT"]);
    expect(words(`<Label>Primary Riot ID *</Label>`)).toEqual([]);
    expect(words(`<p>ARAM games, PNG or JPEG</p>`)).toEqual([]);
    expect(words(`const x = a >= MARGIN ? before : r.right + GAP + width < 0;`)).toEqual([]);
    // The two shapes the per-line scan missed (8af78d27's role-fields.tsx and signup-form.tsx), with their lines.
    const roleFields = [`      <div>`, `        <Label>`, `          PRIMARY ROLE *{" "}`, `          <span className="font-normal">{primary ? \`· \${ROLE_LABELS[primary]}\` : "· Not selected"}</span>`, `        </Label>`].join("\n");
    expect(capitalWords(roleFields)).toEqual([
      { word: "PRIMARY", line: 3 },
      { word: "ROLE", line: 3 },
    ]);
    expect(capitalWords(`\n        <Label htmlFor="password">{passwordRequired ? "PASSWORD *" : "PASSWORD (optional)"}</Label>`)).toEqual([
      { word: "PASSWORD", line: 2 },
      { word: "PASSWORD", line: 2 },
    ]);
    expect(words(`<span>{n} CHAMPIONS</span>`)).toEqual(["CHAMPIONS"]);
    expect(words(`<p>{open && "SHOW LESS"}{\`\${count} MORE\`}</p>`)).toEqual(["SHOW", "LESS", "MORE"]);
    expect(words(`<p>{"USERNAME *"}</p>`)).toEqual(["USERNAME"]);
    // Never code: keys between two JSX blocks, a comparison, a class list, a comment, an environment variable's name broken at its underscores.
    expect(words(`const ICONS = {\n  TOP: (\n    <svg />\n  ),\n  JUNGLE: (\n    <svg />\n  ),\n};`)).toEqual([]);
    expect(words(`<p>{role === "SUPPORT" ? "Support" : cn("TEXT", "Other")}</p>`)).toEqual([]);
    expect(words(`<p className={wide ? "UPPER" : "lower"}>Words</p>`)).toEqual([]);
    expect(words(`<p>{/* NOTE: KEEP THIS */}Words</p>\n// <p>OLD LABEL</p>`)).toEqual([]);
    expect(words(`<p>The UNIIVERSE_<wbr />ACCESS_<wbr />PASSWORD value you configured.\n</p>`)).toEqual([]);
    const found: string[] = [];
    const used = new Set<string>();
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir)).filter((f) => f.endsWith(".tsx"))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        for (const { word, line } of capitalWords(readFileSync(file, "utf8"))) {
          const allowed = CAPITALS_ALLOWED.find((a) => a.file === rel && a.word === word);
          if (allowed) used.add(`${rel} ${word}`);
          else found.push(`${rel}:${line}: "${word}"`);
        }
      }
    }
    expect(found, "labels in sentence case (\"Primary Riot ID\"), capitals only for abbreviations; or an exception with its reason").toEqual([]);
    const stale = CAPITALS_ALLOWED.filter((a) => !used.has(`${a.file} ${a.word}`)).map((a) => `${a.file} ${a.word}`);
    expect(stale, "exceptions that no longer match anything: remove them").toEqual([]);
  });

  it("every exception says why, and names a file that exists (a deleted file's exemption is stale)", () => {
    for (const a of ALLOWED) expect(a.reason.length, `${a.file} ${a.kind}`).toBeGreaterThan(20);
    for (const a of ALLOWED) expect(existsSync(path.join(ROOT, a.file)), `${a.file} ${a.kind}`).toBe(true);
  });
});
