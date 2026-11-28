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
  - a size, weight, case or letter spacing beside label-text, the sentence-case label (25 Nov 2026),
    which sets a size and a weight and must carry no capitals or letter spacing (a colour may replace
    its fg-muted): Tailwind orders label-text after a text size, so the size would be lost (the
    uppercase label-caps it replaced was retired on 26 Nov 2026, its last use migrated);
  - the standing-alone measure written as a number (max-w-[72rem], max-w-6xl) instead of
    max-w-[var(--measure)], so the boards that use it change together;
  - a safe-area padding (pb-safe, pb-safe-N; pt-safe, pt-safe-N) beside another padding for the same
    edge in one class list: Tailwind's stylesheet order then decides which wins, not the class
    list, and `py-4 pb-safe` gave the bare inset, 0px in a browser (#265);
  - an arbitrary max(gutter, inset) top or bottom padding that pt-safe-N or pb-safe-N writes.
  - the brand blue as a glow or shadow colour (shadow-accent at any opacity or variant, an
    arbitrary shadow made of var(--color-accent), or the shorthand shadow-(color:--color-accent)):
    shadows are neutral and violet (accent-2) carries the light; a selected item's blue edge is a
    ring (DESIGN_SYSTEM.md §4).
  - a text field's 16px dropping below it from a breakpoint on every screen (sm:text-sm, md:text-xs
    and the like beside text-base in a field's classes): iOS zooms the page into a focused field
    under 16px, so a field's smaller text is for a mouse only (md:pointer-fine:text-sm;
    docs/RESPONSIVE.md → Primitives).
  Arbitrary values that match no token (a clamp(), a one-off width) stay allowed.
*/

const ROOT = path.join(__dirname, "../..");
const CSS = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const TAILWIND_THEME = readFileSync(path.join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8");

/** SVG charts drawn 1:1 in px size their text in px, so it matches the chart's fixed gutters. */
const CHART_TEXT = new Set<string>([]);

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

/** A class without its variants and important mark ("max-sm:pb-safe-4" → "pb-safe-4"): what follows the last ":" outside brackets. */
function utilityOf(token: string): string {
  let depth = 0;
  let end = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) end = i;
  }
  return token.slice(end + 1).replace(/^!|!$/g, "");
}

/** What label-text sets or refuses (a size, a weight, capitals, letter spacing), so a class string carries none of it beside label-text. */
const LABEL_SETS = [/^(uppercase|lowercase|capitalize|normal-case)$/, /^tracking-/, /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/, /^text-(4xs|2xs|xs|sm|md|base|lg|xl|\dxl|figure)(\/.+)?$/, /^text-\[(length:)?[\d.]+(px|rem|em)\]$/];

/** Per edge: its safe-area paddings, and every other padding that sets that edge. */
const SAFE_EDGES = [
  { edge: "pb-safe", safe: /^pb-safe(-\d+)?$/, other: /^-?(p|py|pb)-/ },
  { edge: "pt-safe", safe: /^pt-safe(-\d+)?$/, other: /^-?(p|py|pt)-/ },
];

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
      else if (Number(m[1]!.replace(/^length:|rem$/g, "")) < 0.75) problems.push(`${at}: ${m[0]} is under the 12px floor; use text-2xs (12px on desktops), or text-4xs inside a small tile`);
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
        // One spacing at every width, too: a label tracked 0.44px on a laptop and 1.32px on a phone read as two (UM.T5).
        if (/(^|:)tracking-(tighter|tight|normal|wide|wider|widest)$/.test(c) || /:tracking-\[[^\]]+\]$/.test(c)) problems.push(`${at}: ${c} on an uppercase label; use tracking-label`);
      }
    }
    // label-text sets a sentence-case label's size and weight, with no capitals and no letter spacing: none of them beside it.
    for (const m of text.matchAll(/(["'`])([^"'`]*\blabel-text\b[^"'`]*)\1/g)) {
      const classes = m[2]!.split(/\s+/).filter(Boolean);
      if (!classes.some((c) => utilityOf(c) === "label-text")) continue;
      for (const c of classes) {
        if (LABEL_SETS.some((re) => re.test(utilityOf(c)))) problems.push(`${at}: ${c} beside label-text, which sets a sentence-case label's size and weight, with no capitals or letter spacing`);
      }
    }
    // The standing-alone measure is one token, so every board that uses it changes together.
    for (const m of text.matchAll(/[^\s"'`{}]+/g)) {
      if (/^max-w-(\[72rem\]|6xl)$/.test(utilityOf(m[0]))) problems.push(`${at}: ${m[0]} is max-w-[var(--measure)]`);
    }
    // A safe-area padding is its element's only padding for that edge (globals.css): beside another
    // one, whichever Tailwind writes later wins, at every width the classes share.
    for (const m of text.matchAll(/(["'`])([^"'`]*\bp[bt]-safe\b[^"'`]*)\1/g)) {
      const classes = m[2]!.split(/\s+/).filter(Boolean);
      for (const { edge, safe, other } of SAFE_EDGES) {
        if (!classes.some((c) => safe.test(utilityOf(c)))) continue;
        for (const c of classes) {
          const u = utilityOf(c);
          if (other.test(u) && !safe.test(u)) problems.push(`${at}: ${c} beside ${edge}; pad that edge once (${edge}-N is N steps, or the inset where larger)`);
        }
      }
    }
    // A field's text (text-base, with a placeholder or focus style of its own) stays 16px on a touch
    // screen at every width: iOS zooms the page into a focused field under 16px.
    for (const m of text.matchAll(/(["'`])([^"'`]*\btext-base\b[^"'`]*)\1/g)) {
      const classes = m[2]!.split(/\s+/).filter(Boolean);
      if (!classes.some((c) => c.startsWith("placeholder:") || c.startsWith("focus:"))) continue;
      for (const c of classes) {
        const m = /^(sm|md|lg|xl|2xl):text-(xs|sm)$/.exec(c);
        if (m) problems.push(`${at}: ${c} on a 16px field; use ${m[1]}:pointer-fine:text-${m[2]} (iOS zooms into a focused field under 16px on a touch screen)`);
      }
    }
    // An arbitrary max(gutter, inset) padding for the top or bottom edge that a safe-area utility writes.
    for (const m of text.matchAll(/(?<![\w-])(pt|pb)-\[max\(([^,\]]+),env\(safe-area-inset-(top|bottom)\)\)\]/g)) {
      const value = canonical(m[2]!);
      const steps = value?.endsWith("rem") ? Number(value.slice(0, -3)) * 4 : NaN;
      if ((m[1] === "pt") === (m[3] === "top") && Number.isInteger(steps)) problems.push(`${at}: ${m[0]} is ${m[1]}-safe-${steps}`);
    }
  });
  return problems;
}

/*
  The one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop pages"; the owner's requirement of
  27 and 28 Nov 2026): a workspace page shows fewer rows on a shorter window, never hidden or smaller
  content, and nothing in it scrolls on its own. So no class of the workspace's variants (ws:,
  ws-short:, ws-host:, ws-short-host:, anywhere in a class's variants) conceals or shrinks: an overflow
  that hides, clips or scrolls, a max height, a screen-tall height, a line clamp, a truncation, or a
  text size under text-xs (text-2xs is 12px there already: text-xs says it). A genuine exception goes
  into WS_CONCEAL_LATER with its reason, as "file: class".
*/
const WS_VARIANTS = new Set(["ws", "ws-short", "ws-host", "ws-short-host"]);
const WS_CONCEALS = [/^overflow-(x-|y-)?(hidden|clip|auto|scroll)$/, /^max-h-/, /^h-(screen|dvh|svh|lvh)$/, /^line-clamp-/, /^truncate$/, /^text-(2xs|3xs|4xs)$/];

/** A class's variants ("ws:board-below-mid:hidden" → ["ws", "board-below-mid"]): its parts before the last ":" outside brackets. */
function variantsOf(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) {
      parts.push(token.slice(from, i));
      from = i + 1;
    }
  }
  return parts;
}

/** The workspace's classes that conceal or shrink, in one file's source, as "line: class". */
export function workspaceProblems(source: string): string[] {
  const problems: string[] = [];
  source.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/[^\s"'`{}]+/g)) {
      const token = m[0];
      if (!variantsOf(token).some((v) => WS_VARIANTS.has(v))) continue;
      const u = utilityOf(token);
      const small = /^text-\[(?:length:)?([\d.]+)(px|rem)\]$/.exec(u);
      if (WS_CONCEALS.some((re) => re.test(u)) || (small && Number(small[1]) / (small[2] === "px" ? 16 : 1) < 0.75)) problems.push(`${i + 1}: ${token}`);
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

  /*
    The 12px floor (UD.X5): on desktops text-2xs is 12px, so no running text or name reads at 11px
    where the root is 16px. Phones and tablets keep 11px. The places the floor does not reach yet
    carry type-floor-later, each listed here with its reason; a stage that brings the floor to one
    removes its entry.
  */
  // Empty since Release 11: the game cards of Match History and Team Matches (matchCardClass) took the
  // floor after their measured pass at 1280, 1440, 1920 and 2560.
  const FLOOR_LATER: Record<string, string> = {};
  it("keeps the 12px floor on desktops, and lists the places it does not reach yet", () => {
    const floor = /@media \(min-width: 64rem\) \{\s*:root \{\s*--text-2xs: 0\.75rem;/.test(CSS);
    expect(floor, "globals.css sets --text-2xs to 0.75rem from lg").toBe(true);
    const users = sourceFiles(path.join(ROOT, "src"))
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((rel) => rel !== "src/app/globals.css" && /(?<![\w-])type-floor-later\b/.test(readFileSync(path.join(ROOT, rel), "utf8")));
    expect(users.sort()).toEqual(Object.keys(FLOOR_LATER).sort());
  });

  // Empty: no workspace class conceals or shrinks anything (28 Nov 2026).
  const WS_CONCEAL_LATER: Record<string, string> = {};
  it("keeps the workspace honest: no ws:, ws-short:, ws-host: or ws-short-host: class hides, clips, scrolls, clamps, truncates or shrinks text under text-xs", () => {
    const found = sourceFiles(path.join(ROOT, "src")).flatMap((file) => {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      return workspaceProblems(readFileSync(file, "utf8")).map((p) => `${rel}: ${p.replace(/^\d+: /, "")}`);
    });
    expect(found.filter((f) => !(f in WS_CONCEAL_LATER))).toEqual([]);
    expect(Object.keys(WS_CONCEAL_LATER).filter((k) => !found.includes(k)), "an exception that no longer applies").toEqual([]);
  });

  it("names each workspace class that conceals or shrinks, and leaves the ones that reveal, the flow's and the stacked variants' others alone", () => {
    const source = [
      `<div className="ws:overflow-hidden ws-short:overflow-y-auto ws-host:overflow-x-clip ws:overflow-visible ws-short:overflow-x-visible overflow-hidden" />`,
      `<div className="ws:max-h-96 ws:max-h-[30rem] ws:h-screen ws-host:h-dvh ws:min-h-0 ws:h-full max-h-96" />`,
      `<p className="ws:line-clamp-2 ws-short:truncate ws:text-2xs ws:text-4xs ws:text-[0.7rem] ws:text-[11px] ws:text-xs ws:text-[0.75rem] truncate text-2xs" />`,
      `<li className="ws:board-below-mid:hidden ws:[&>li:nth-child(n+2)]:hidden md:ws:truncate ws:board-at-mid:overflow-auto ws-short-host:pb-3 lg:max-h-40" />`,
    ].join("\n");
    expect(workspaceProblems(source)).toEqual([
      "1: ws:overflow-hidden",
      "1: ws-short:overflow-y-auto",
      "1: ws-host:overflow-x-clip",
      "2: ws:max-h-96",
      "2: ws:max-h-[30rem]",
      "2: ws:h-screen",
      "2: ws-host:h-dvh",
      "3: ws:line-clamp-2",
      "3: ws-short:truncate",
      "3: ws:text-2xs",
      "3: ws:text-4xs",
      "3: ws:text-[0.7rem]",
      "3: ws:text-[11px]",
      "4: md:ws:truncate",
      "4: ws:board-at-mid:overflow-auto",
    ]);
  });

  it("keeps the sentence-case label one look: no size, weight, capitals or letter spacing beside label-text", () => {
    const source = `<span className="label-text text-xs" /><span className="label-text uppercase tracking-label" /><span className="label-text font-semibold" /><span className="label-text text-fg-subtle" />`;
    expect(tokenProblems(source, tokens)).toEqual([
      "1: text-xs beside label-text, which sets a sentence-case label's size and weight, with no capitals or letter spacing",
      "1: uppercase beside label-text, which sets a sentence-case label's size and weight, with no capitals or letter spacing",
      "1: tracking-label beside label-text, which sets a sentence-case label's size and weight, with no capitals or letter spacing",
      "1: font-semibold beside label-text, which sets a sentence-case label's size and weight, with no capitals or letter spacing",
    ]);
  });

  it("names each kind of drift, and the token to use instead", () => {
    const source = [
      `<p className="text-[11px] text-[0.6875rem] text-[13px] text-[1.375rem] text-[0.92em] text-[length:11px] text-[72px]" />`,
      `<p className="tracking-[0.12em] tracking-[.12em] tracking-[0.20em] tracking-[0.04em] rounded-[4px] rounded-t-[10px] rounded-[3px] rounded-[12px] rounded-t-[0.75rem] rounded-xl sm:rounded-t-2xl" />`,
      `<p className="bg-[#f5c451] hover:border-[#abc]/40 text-gold" />`,
      `el.animate(frames, { easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }); const odd = "cubic-bezier(0.1, 0.7, 0.1, 1)"; const c = "ease-[cubic-bezier(0.2,_0.8,_0.2,_1)]";`,
      `<span className="text-2xs uppercase tracking-wide" /><span className="rounded-full uppercase tracking-wide" /><span className="uppercase tracking-label sm:tracking-wider" /><span className="uppercase tracking-label @max-[15rem]/card:tracking-[0.04em]" />`,
      `<div className="max-w-[72rem] lg:max-w-6xl max-w-[var(--measure)] max-w-[80rem]" />`,
      `<div className="px-4 py-4 pb-safe sm:py-5" /><div className="pt-3 pb-safe-3" /><div className="p-2 pt-safe-2" /><div className="pb-safe-4 sm:pb-safe-5 short:pb-safe-4 pt-4" /><div className="max-sm:pb-safe-4 pb-tabbar" />`,
      `<div className="pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-top))] pb-[max(0.6rem,env(safe-area-inset-bottom))] pb-[calc(1rem+env(safe-area-inset-bottom))]" />`,
      `<p className="shadow-accent/15 hover:shadow-accent drop-shadow-accent shadow-accent-strong shadow-[0_0_60px_-20px_var(--color-accent)] shadow-accent-2 shadow-black/40 shadow-[0_0_60px_-20px_var(--color-accent-2)] ring-1 ring-inset ring-accent/40" />`,
      `<p className="shadow-(color:--color-accent) inset-shadow-(color:--color-accent-strong)/30 drop-shadow-(--color-accent) shadow-(color:--color-accent-2) shadow-(--my-shadow)" />`,
      `<p className="text-[0.65rem] text-[0.75rem] text-[0.7rem]" />`,
      `<input className="h-11 text-base placeholder:text-fg-subtle md:text-sm" /><input className="text-base focus:outline-none md:pointer-fine:text-sm sm:pointer-fine:text-xs" /><p className="text-base md:text-sm" /><input className="text-base placeholder:text-fg-subtle sm:text-xs" />`,
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
      "5: @max-[15rem]/card:tracking-[0.04em] on an uppercase label; use tracking-label",
      "6: max-w-[72rem] is max-w-[var(--measure)]",
      "6: lg:max-w-6xl is max-w-[var(--measure)]",
      "7: py-4 beside pb-safe; pad that edge once (pb-safe-N is N steps, or the inset where larger)",
      "7: sm:py-5 beside pb-safe; pad that edge once (pb-safe-N is N steps, or the inset where larger)",
      "7: p-2 beside pt-safe; pad that edge once (pt-safe-N is N steps, or the inset where larger)",
      "7: pb-tabbar beside pb-safe; pad that edge once (pb-safe-N is N steps, or the inset where larger)",
      "8: pb-[max(1rem,env(safe-area-inset-bottom))] is pb-safe-4",
      "8: pt-[max(0.75rem,env(safe-area-inset-top))] is pt-safe-3",
      "9: shadow-accent/15 is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "9: shadow-accent is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "9: drop-shadow-accent is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "9: shadow-accent-strong is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "9: shadow-[0_0_60px_-20px_var(--color-accent)] is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "10: shadow-(color:--color-accent) is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "10: inset-shadow-(color:--color-accent-strong)/30 is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "10: drop-shadow-(--color-accent) is a blue glow or shadow; use a neutral shadow (shadow-black/40), or violet (accent-2) for light",
      "11: text-[0.65rem] is under the 12px floor; use text-2xs (12px on desktops), or text-4xs inside a small tile",
      "11: text-[0.75rem] is text-xs",
      "11: text-[0.7rem] is under the 12px floor; use text-2xs (12px on desktops), or text-4xs inside a small tile",
      "12: md:text-sm on a 16px field; use md:pointer-fine:text-sm (iOS zooms into a focused field under 16px on a touch screen)",
      "12: sm:text-xs on a 16px field; use sm:pointer-fine:text-xs (iOS zooms into a focused field under 16px on a touch screen)",
    ]);
  });
});
