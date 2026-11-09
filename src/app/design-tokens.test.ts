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
  - Tailwind's names for the project's panel and card radii (rounded-xl, rounded-2xl);
  - a colour written as a hex value in a class (bg-[#…]) instead of a named palette colour;
  - an easing curve that is not one of the --ease-* tokens, in a class, a style or a script;
  - an uppercase label spaced other than tracking-label (a pill badge may use tracking-wide);
  - the brand blue as a glow or shadow colour (shadow-accent at any opacity or variant, an
    arbitrary shadow made of var(--color-accent), or the shorthand shadow-(color:--color-accent)):
    shadows are neutral and violet (accent-2) carries the light; a selected item's blue edge is a
    ring (DESIGN_SYSTEM.md §4).
  Arbitrary values that match no token (a clamp(), a one-off width) stay allowed.
*/

const ROOT = path.join(__dirname, "../..");
const CSS = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const TAILWIND_THEME = readFileSync(path.join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8");

/** SVG charts drawn 1:1 in px size their text in px, so it matches the chart's fixed gutters. */
const CHART_TEXT = new Set(["src/components/players/lane-parts.tsx"]);

const KINDS: Record<string, string> = { text: "text", tracking: "tracking", radius: "rounded", ease: "ease" };

/** Every token by utility name ("text-2xs" → "0.6875rem"): the project's first, then Tailwind's defaults it keeps. */
export function readTokens(css: string, defaults = TAILWIND_THEME): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const source of [css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "", defaults]) {
    for (const m of source.matchAll(/--(text|tracking|radius|ease)-([\w-]+):\s*([^;]+);/g)) {
      const name = `${KINDS[m[1]!]}-${m[2]}`;
      if (!m[2]!.includes("--") && !tokens.has(name)) tokens.set(name, m[3]!.trim()); // not --text-xs--line-height
    }
  }
  return tokens;
}

/** A value in comparable form: lengths as rem (11px = 0.6875rem) or em, curves as their four numbers. */
function canonical(raw: string): string | null {
  const value = raw.replace(/^length:/, "").replace(/_/g, " ").trim();
  const length = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)$/.exec(value);
  if (length) {
    const n = Number(length[1]);
    return length[2] === "em" ? `${Number(n.toFixed(6))}em` : `${Number((length[2] === "px" ? n / 16 : n).toFixed(6))}rem`;
  }
  const curve = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  if (curve) return `cubic-bezier(${curve[1]!.split(",").map((x) => Number(x.trim())).join(",")})`;
  return null;
}

/** What drifts from the tokens in one file's source, as "line: problem". */
export function tokenProblems(source: string, tokens: Map<string, string>, options: { chartText?: boolean } = {}): string[] {
  const problems: string[] = [];
  /** The token with this value (the project's own before Tailwind's), never a name the radius rule forbids. */
  const named = (kind: string, value: string) => {
    const want = canonical(value);
    if (want === null) return null;
    for (const [name, v] of tokens) {
      if (name.startsWith(`${kind}-`) && !/^rounded-2?xl$/.test(name) && canonical(v) === want) return name;
    }
    return null;
  };
  source.split("\n").forEach((text, i) => {
    const at = `${i + 1}`;
    for (const m of options.chartText ? [] : text.matchAll(/(?<![\w-])text-\[((?:length:)?[\d.]+(?:px|rem))\]/g)) {
      const token = named("text", m[1]!);
      if (token) problems.push(`${at}: ${m[0]} is ${token}`);
      else if (m[1]!.endsWith("px")) problems.push(`${at}: ${m[0]} is a font size in px; use a rem size or a text token`);
    }
    for (const m of text.matchAll(/(?<![\w-])tracking-\[([-\d.]+em)\]/g)) {
      const token = named("tracking", m[1]!);
      if (token) problems.push(`${at}: ${m[0]} is ${token}`);
    }
    for (const m of text.matchAll(/(?<![\w-])rounded(-[trblse]{1,2})?-\[([\d.]+(?:px|rem))\]/g)) {
      const token = named("rounded", m[2]!);
      if (token) problems.push(`${at}: ${m[0]} is ${token.replace(/^rounded/, `rounded${m[1] ?? ""}`)}`);
    }
    // Tailwind's own names for the project's panel and card radii.
    for (const m of text.matchAll(/(?<![\w-])rounded(-[trblse]{1,2})?-(2?xl)\b/g)) problems.push(`${at}: ${m[0]} is rounded${m[1] ?? ""}-${m[2] === "xl" ? "panel" : "card"}`);
    for (const m of text.matchAll(/(?<![\w])(?:[a-z]+-)+\[#[0-9a-fA-F]{3,8}\]/g)) problems.push(`${at}: ${m[0]} is a colour outside the palette; add a --color token in globals.css`);
    for (const m of text.matchAll(/cubic-bezier\([^)]*\)/g)) {
      if (!named("ease", m[0])) problems.push(`${at}: ${m[0]} is not an --ease token`);
    }
    // The brand blue is never a glow or shadow (shadow-accent-2, violet, is the light and stays allowed).
    for (const m of text.matchAll(/(?<![\w-])(?:drop-|inset-|text-)?shadow-(?:accent(?:-strong)?(?![\w-])(?:\/[\w.]+)?|\[[^\]\s]*var\(--color-accent(?:-strong)?\)[^\]\s]*\]|\((?:color:)?--color-accent(?:-strong)?\)(?:\/[\w.]+)?)/g)) problems.push(`${at}: ${m[0]} is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light`);
    // Uppercase labels share one letter spacing; a pill badge (rounded-full) may stay tighter.
    for (const m of text.matchAll(/(["'`])([^"'`]*\buppercase\b[^"'`]*)\1/g)) {
      const classes = m[2]!.split(/\s+/);
      if (classes.includes("rounded-full")) continue;
      for (const c of classes) {
        if (/(^|:)tracking-(tighter|tight|normal|wide|wider|widest)$/.test(c)) problems.push(`${at}: ${c} on an uppercase label; use tracking-label`);
      }
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

  it("are read from globals.css, then Tailwind's own theme", () => {
    expect(tokens.get("text-2xs")).toBe("0.6875rem");
    expect(tokens.get("tracking-label")).toBe("0.12em");
    expect(tokens.get("ease-emphasized")).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
    expect(tokens.get("rounded-sm")).toBe("4px"); // the project's, not Tailwind's 0.25rem
    expect(tokens.get("text-7xl")).toBe("4.5rem"); // Tailwind's, read from its theme
  });

  it("every component uses them: no px font sizes, no arbitrary copies of a token, no stray colours, curves or label spacings", () => {
    const problems = sourceFiles(path.join(ROOT, "src")).flatMap((file) => {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      let source = readFileSync(file, "utf8");
      // The token definitions themselves are where the values belong.
      if (rel === "src/app/globals.css") source = source.replace(/@theme\s*\{[\s\S]*?\n\}/, (block) => block.replace(/[^\n]/g, ""));
      return tokenProblems(source, tokens, { chartText: CHART_TEXT.has(rel) }).map((p) => `${rel}:${p}`);
    });
    expect(problems).toEqual([]);
  });

  it("names each kind of drift, and the token to use instead", () => {
    const source = [
      `<p className="text-[11px] text-[0.6875rem] text-[13px] text-[1.375rem] text-[0.92em] text-[length:11px] text-[72px]" />`,
      `<p className="tracking-[0.12em] tracking-[.12em] tracking-[0.20em] tracking-[0.04em] rounded-[4px] rounded-t-[10px] rounded-[3px] rounded-[12px] rounded-t-[0.75rem] rounded-xl sm:rounded-t-2xl" />`,
      `<p className="bg-[#f5c451] hover:border-[#abc]/40 text-gold" />`,
      `el.animate(frames, { easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }); const odd = "cubic-bezier(0.1, 0.7, 0.1, 1)"; const c = "ease-[cubic-bezier(0.2,_0.8,_0.2,_1)]";`,
      `<span className="text-2xs uppercase tracking-wide" /><span className="rounded-full uppercase tracking-wide" /><span className="uppercase tracking-label sm:tracking-wider" />`,
      `<p className="shadow-accent/15 hover:shadow-accent drop-shadow-accent shadow-accent-strong shadow-[0_0_60px_-20px_var(--color-accent)] shadow-accent-2 shadow-black/40 shadow-[0_0_60px_-20px_var(--color-accent-2)] ring-1 ring-inset ring-accent/40" />`,
      `<p className="shadow-(color:--color-accent) inset-shadow-(color:--color-accent-strong)/30 drop-shadow-(--color-accent) shadow-(color:--color-accent-2) shadow-(--my-shadow)" />`,
    ].join("\n");
    expect(tokenProblems(source, tokens)).toEqual([
      "1: text-[11px] is text-2xs",
      "1: text-[0.6875rem] is text-2xs",
      "1: text-[13px] is a font size in px; use a rem size or a text token",
      "1: text-[length:11px] is text-2xs",
      "1: text-[72px] is text-7xl",
      "2: tracking-[0.12em] is tracking-label",
      "2: tracking-[.12em] is tracking-label",
      "2: tracking-[0.20em] is tracking-wordmark",
      "2: rounded-[4px] is rounded-sm",
      "2: rounded-t-[10px] is rounded-t-lg",
      "2: rounded-[12px] is rounded-panel",
      "2: rounded-t-[0.75rem] is rounded-t-panel",
      "2: rounded-xl is rounded-panel",
      "2: rounded-t-2xl is rounded-t-card",
      "3: bg-[#f5c451] is a colour outside the palette; add a --color token in globals.css",
      "3: border-[#abc] is a colour outside the palette; add a --color token in globals.css",
      "4: cubic-bezier(0.1, 0.7, 0.1, 1) is not an --ease token",
      "5: tracking-wide on an uppercase label; use tracking-label",
      "5: sm:tracking-wider on an uppercase label; use tracking-label",
      "6: shadow-accent/15 is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "6: shadow-accent is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "6: drop-shadow-accent is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "6: shadow-accent-strong is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "6: shadow-[0_0_60px_-20px_var(--color-accent)] is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "7: shadow-(color:--color-accent) is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "7: inset-shadow-(color:--color-accent-strong)/30 is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "7: drop-shadow-(--color-accent) is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
    ]);
  });
});
