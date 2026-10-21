import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/*
  The design tokens (globals.css @theme, docs/STANDARDS.md) are the one source of sizes, colours,
  letter spacing and motion curves. This test reads every component and refuses what drifts from
  them:
  - a font size in px: it ignores the reader's own browser text size, which rem follows;
  - an arbitrary value that equals a token (text-[0.6875rem] where text-2xs exists), so one look
    is written one way;
  - a colour written as a hex value in a class (bg-[#…]) instead of a named palette colour;
  - an easing curve that is not one of the --ease-* tokens, in a class, a style or a script.
  Arbitrary values that match no token (a clamp(), an em, a one-off width) stay allowed.
*/

const ROOT = path.join(__dirname, "../..");
const CSS = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** SVG charts size their text in the viewBox's own units, which scale with the chart; type tokens do not apply. */
const CHART_TEXT = new Set(["src/components/players/ranked-progress.tsx"]);

/** Tailwind's own scales (v4 defaults), which globals.css extends or overrides. */
const DEFAULTS: Record<string, string> = {
  "text-xs": "0.75rem", "text-sm": "0.875rem", "text-base": "1rem", "text-lg": "1.125rem", "text-xl": "1.25rem", "text-2xl": "1.5rem", "text-3xl": "1.875rem", "text-4xl": "2.25rem", "text-5xl": "3rem", "text-6xl": "3.75rem",
  "tracking-tighter": "-0.05em", "tracking-tight": "-0.025em", "tracking-normal": "0em", "tracking-wide": "0.025em", "tracking-wider": "0.05em", "tracking-widest": "0.1em",
  "rounded-xs": "0.125rem", "rounded-xl": "0.75rem", "rounded-2xl": "1rem", "rounded-3xl": "1.5rem", "rounded-4xl": "2rem",
  "ease-in": "cubic-bezier(0.4, 0, 1, 1)", "ease-out": "cubic-bezier(0, 0, 0.2, 1)", "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
};

/** Every token by utility name ("text-2xs" → "0.6875rem"), defaults first so globals.css overrides them. */
export function readTokens(css: string): Map<string, string> {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const tokens = new Map(Object.entries(DEFAULTS));
  const prefix: Record<string, string> = { text: "text", tracking: "tracking", radius: "rounded", color: "color", ease: "ease" };
  for (const m of theme.matchAll(/--(text|tracking|radius|color|ease)-([\w-]+):\s*([^;]+);/g)) {
    if (!m[2]!.includes("--")) tokens.set(`${prefix[m[1]!]}-${m[2]}`, m[3]!.trim()); // not --text-xs--line-height
  }
  return tokens;
}

/** A length as rem, so 11px and 0.6875rem compare equal; null for anything else (em, %, calc). */
function rem(value: string): number | null {
  const m = /^(-?[\d.]+)(px|rem)$/.exec(value.trim());
  if (!m) return null;
  return m[2] === "px" ? Number(m[1]) / 16 : Number(m[1]);
}
const curve = (v: string) => v.replace(/\s+/g, "");

/** What drifts from the tokens in one file's source, as "line: problem". */
export function tokenProblems(source: string, tokens: Map<string, string>, options: { chartText?: boolean } = {}): string[] {
  const problems: string[] = [];
  const named = (kind: string, value: string) => {
    for (const [name, v] of tokens) {
      if (!name.startsWith(`${kind}-`) || name.startsWith("color-")) continue;
      if (kind === "ease" ? curve(v) === curve(value) : rem(v) !== null && rem(v) === rem(value)) return name;
    }
    return null;
  };
  source.split("\n").forEach((text, i) => {
    const at = `${i + 1}`;
    for (const m of options.chartText ? [] : text.matchAll(/(?<![\w-])text-\[([\d.]+(?:px|rem))\]/g)) {
      const token = named("text", m[1]!);
      if (token) problems.push(`${at}: ${m[0]} is ${token}`);
      else if (m[1]!.endsWith("px")) problems.push(`${at}: ${m[0]} is a font size in px; use a rem size or a text token`);
    }
    for (const m of text.matchAll(/(?<![\w-])tracking-\[([-\d.]+em)\]/g)) {
      const token = [...tokens].find(([name, v]) => name.startsWith("tracking-") && v === m[1])?.[0];
      if (token) problems.push(`${at}: ${m[0]} is ${token}`);
    }
    for (const m of text.matchAll(/(?<![\w-])rounded(?:-[trblse]{1,2})?-\[([\d.]+(?:px|rem))\]/g)) {
      const token = named("rounded", m[1]!);
      if (token) problems.push(`${at}: ${m[0]} is ${token}`);
    }
    // Tailwind's own names for the project's panel and card radii.
    for (const m of text.matchAll(/(?<![\w-])rounded(-[trblse]{1,2})?-(2?xl)\b/g)) problems.push(`${at}: ${m[0]} is rounded${m[1] ?? ""}-${m[2] === "xl" ? "panel" : "card"}`);
    for (const m of text.matchAll(/(?<![\w])(?:[a-z]+-)+\[#[0-9a-fA-F]{3,8}\]/g)) problems.push(`${at}: ${m[0]} is a colour outside the palette; add a --color token in globals.css`);
    for (const m of text.matchAll(/cubic-bezier\([^)]*\)/g)) {
      if (!named("ease", m[0])) problems.push(`${at}: ${m[0]} is not an --ease token`);
    }
  });
  return problems;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("design tokens", () => {
  const tokens = readTokens(CSS);

  it("are read from globals.css", () => {
    expect(tokens.get("text-2xs")).toBe("0.6875rem");
    expect(tokens.get("tracking-label")).toBe("0.12em");
    expect(tokens.get("ease-emphasized")).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
    expect(tokens.get("rounded-sm")).toBe("4px");
  });

  it("every component uses them: no px font sizes, no arbitrary copies of a token, no stray colours or curves", () => {
    const problems = sourceFiles(path.join(ROOT, "src")).flatMap((file) => {
      const rel = path.relative(ROOT, file);
      let source = readFileSync(file, "utf8");
      // The token definitions themselves are where the values belong.
      if (rel === "src/app/globals.css") source = source.replace(/@theme\s*\{[\s\S]*?\n\}/, (block) => block.replace(/[^\n]/g, ""));
      return tokenProblems(source, tokens, { chartText: CHART_TEXT.has(rel) }).map((p) => `${rel}:${p}`);
    });
    expect(problems).toEqual([]);
  });

  it("names each kind of drift", () => {
    const source = [
      `<p className="text-[11px] text-[0.6875rem] text-[13px] text-[1.375rem] text-[0.92em]" />`,
      `<p className="tracking-[0.12em] tracking-[0.04em] rounded-[4px] rounded-t-[10px] rounded-[3px] rounded-xl sm:rounded-t-2xl" />`,
      `<p className="bg-[#f5c451] hover:border-[#abc]/40 text-gold" />`,
      `el.animate(frames, { easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }); const odd = "cubic-bezier(0.1, 0.7, 0.1, 1)";`,
    ].join("\n");
    expect(tokenProblems(source, tokens)).toEqual([
      "1: text-[11px] is text-2xs",
      "1: text-[0.6875rem] is text-2xs",
      "1: text-[13px] is a font size in px; use a rem size or a text token",
      "2: tracking-[0.12em] is tracking-label",
      "2: rounded-[4px] is rounded-sm",
      "2: rounded-t-[10px] is rounded-lg",
      "2: rounded-xl is rounded-panel",
      "2: rounded-t-2xl is rounded-t-card",
      "3: bg-[#f5c451] is a colour outside the palette; add a --color token in globals.css",
      "3: border-[#abc] is a colour outside the palette; add a --color token in globals.css",
      "4: cubic-bezier(0.1, 0.7, 0.1, 1) is not an --ease token",
    ]);
  });
});
