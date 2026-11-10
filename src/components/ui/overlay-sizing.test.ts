import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Two rules for overlays (windows, sheets, the account screen, the tablet drawer, menus, tips).

  A window's body grows from its content, never from nothing: `flex-auto`, not `flex-1`. Safari 26
  and earlier collapse a window that is as tall as its content (a dialog's fit-content height) to
  its header when its body has a zero flex basis. On the owner's iPhone that made the account menu a
  95pt strip (10 Nov); in WebKit 26.0 and the iOS 26 Simulator most sheets, the compact windows and
  the centred windows of wider screens collapsed the same way. WebKit 27 and Chromium draw both
  alike, so only WebKit 26 shows it (DetailModal's BODY_SCROLLS; scripts/webkit26-check.mjs runs
  every kind of window there).

  Overlays are placed and sized by the box they are fixed to: insets, percentages of their
  containing block, env() for the safe areas. Not by viewport units (vh, svh, dvh, lvh, vw and the
  rest) or by script measuring the viewport (window.innerHeight, the root's clientHeight, the
  visual viewport's size), which are other readings of the screen than the box an overlay sits in.
  iOS has misreported some of them in installed apps: svh and the visual viewport less the safe
  areas (WebKit bug 254868), the visual viewport short after the keyboard or a resume (322900,
  323322). Script that needs the screen's size measures that box (src/lib/screen.ts). The listed
  exceptions say why; inside windows, the Card Studio's section list and the picture cropper still
  follow the viewport, as they did before.
*/

const root = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

/** The source without its comments (prose may name the units and classes it explains). */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Every .tsx file under src/. */
function tsxFiles(dir = join(root, "src")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [relative(root, path)] : [];
  });
}

const OVERLAYS = [
  "src/components/ui/detail-modal.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/ui/menu.tsx",
  "src/components/ui/info-tip.tsx",
  "src/components/ui/keyboard-fit.ts",
  "src/components/mobile-nav.tsx",
  "src/components/account-menu.tsx",
  "src/components/public/sign-in.tsx",
];

/** A viewport unit in a value (12dvh, 100vw, calc(100svh-...)) or a Tailwind size named after one (h-dvh, h-screen). */
const VIEWPORT_UNIT = /(?<![\w-])\d*\.?\d+(?:d|s|l)?(?:vh|vw|vmin|vmax|vb|vi)\b|(?<![\w-])(?:min-|max-)?[hw]-(?:dvh|svh|lvh|screen|dvw|svw|lvw)\b|(?<![\w-])size-screen\b/g;
/**
 * Script reading the viewport's size: the window's, the root's (however the root is named) or the
 * visual viewport's. The visual viewport's scale (is the page pinched to zoom?) is not a size.
 */
const VIEWPORT_JS = /\binnerHeight\b|\binnerWidth\b|\b(?:documentElement|root|html)\.client(?:Height|Width)\b|\bvisualViewport\b(?!\??\.scale\b)/g;

/** What a file may still read of the viewport from script, and why. */
const VIEWPORT_JS_ALLOWED: Record<string, { reads: string[]; why: string }> = {
  "src/components/ui/keyboard-fit.ts": {
    reads: ["visualViewport"],
    why: "the on-screen keyboard is only visible as the visual viewport shrinking; it is believed only once a field in the window is typed in, against the fixed box's height, and only a plausible keyboard",
  },
  "src/components/ui/detail-modal.tsx": {
    reads: ["innerWidth", "root.clientWidth"],
    why: "the scrollbar's width as a window locks the page's scrolling (window less root), capped at 24px",
  },
};

/** A flex item that grows from nothing: flex-1 (1 1 0%), a zero basis, or an arbitrary flex value with one. */
const ZERO_BASIS = /(?<![\w-])(?:flex-1|basis-0|basis-\[0(?:%|px|rem)?\]|flex-\[\d+(?:_\d+)?(?:_0(?:%|px|rem)?)?\])(?![\w-])/g;

describe("a window's body grows from its content", () => {
  it("every DetailModal body is flex-auto, and nothing in the window grows from nothing", () => {
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    expect(modal).toContain('const BODY_SCROLLS = "min-h-0 flex-auto overflow-y-auto overscroll-contain";');
    expect(modal).toContain('"flex min-h-0 flex-auto flex-col overflow-hidden"');
    // Its handle, header, body and footer.
    expect(modal.match(ZERO_BASIS) ?? []).toEqual([]);
  });

  it("the zero-basis pattern catches every spelling of a body that grows from nothing", () => {
    for (const cls of ["flex-1", "basis-0", "basis-[0%]", "basis-[0px]", "flex-[1]", "flex-[1_1]", "flex-[1_1_0%]", "flex-[2_1_0px]"]) expect(` ${cls} `.match(ZERO_BASIS), cls).not.toBeNull();
    for (const cls of ["flex-auto", "flex-none", "flex-[1_1_auto]", "basis-auto", "flex-10", "basis-1/2"]) expect(` ${cls} `.match(ZERO_BASIS), cls).toBeNull();
  });

  it.each(OVERLAYS)("%s gives no window column a zero-basis item that would have to scroll", (file) => {
    // A scrolling area that grows from nothing (flex-1 with overflow-y-auto) collapses in Safari 26
    // inside a window as tall as its content.
    expect(code(read(file)).match(/(?<![\w-])flex-1(?![\w-])[^"`]*overflow-y-(?:auto|scroll)|overflow-y-(?:auto|scroll)[^"`]*(?<![\w-])flex-1(?![\w-])/g) ?? []).toEqual([]);
  });

  it("no window is given a body that grows from nothing by its caller (bodyClassName)", () => {
    // bodyClassName is joined to the body's own classes by plain clsx, so a caller's flex-1 would sit
    // beside flex-auto and the stylesheet's order, not the class list, would decide.
    const found = tsxFiles().flatMap((file) => {
      const source = code(read(file));
      if (!/<(?:DetailModal|Dialog)\b/.test(source)) return [];
      return [...source.matchAll(/bodyClassName=(?:"([^"]*)"|\{([^}]*)\})/g)].flatMap((m) => ((m[1] ?? m[2] ?? "").match(ZERO_BASIS) ?? []).map((cls) => `${file}: ${cls}`));
    });
    expect(found).toEqual([]);
  });
});

describe("overlays are sized by the box they are fixed to", () => {
  it.each(OVERLAYS)("%s uses no viewport units", (file) => {
    expect(code(read(file)).match(VIEWPORT_UNIT) ?? []).toEqual([]);
  });

  it.each(OVERLAYS)("%s does not measure the viewport from script, beyond its listed exception", (file) => {
    const allowed = VIEWPORT_JS_ALLOWED[file]?.reads ?? [];
    const reads = (code(read(file)).match(VIEWPORT_JS) ?? []).filter((r) => !allowed.includes(r));
    expect(reads).toEqual([]);
  });

  it("the viewport pattern catches the root's size however the root is named, and lets the zoom's scale through", () => {
    for (const read of ["window.innerHeight", "document.documentElement.clientHeight", "root.clientHeight", "html.clientWidth", "window.visualViewport.height", "vv = window.visualViewport"]) expect(read.match(VIEWPORT_JS), read).not.toBeNull();
    for (const read of ["window.visualViewport?.scale", "visualViewport.scale", "el.clientHeight", "probe.offsetHeight"]) expect(read.match(VIEWPORT_JS), read).toBeNull();
  });

  it("the modal believes a scrollbar of at most 24px", () => {
    expect(code(read("src/components/ui/detail-modal.tsx"))).toContain("Math.min(24, window.innerWidth - root.clientWidth)");
  });

  it("keyboard-fit measures the screen from the fixed box and believes a keyboard only once a field is typed in", () => {
    // Its behaviour is tested in e2e/public-sign-in.spec.ts; this keeps the reading it relies on.
    const source = code(read("src/components/ui/keyboard-fit.ts"));
    expect(source).toContain("screenHeight()");
    expect(source).not.toMatch(/\binnerHeight\b/);
    expect(source).toMatch(/shrunk && \(typing \|\| wasUp\)/);
  });

  it("the account menu on phones is the account screen, fixed to the screen's four edges", () => {
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    expect(modal).toMatch(/screen: "inset-0 h-auto w-auto max-h-none/);
    expect(code(read("src/components/mobile-nav.tsx"))).toMatch(/size="screen"/);
  });

  it("the stylesheet has no viewport-sized overlay utility left", () => {
    const css = code(read("src/app/globals.css"));
    expect(css).not.toMatch(/panel-place|--vv-top|--vv-bottom/);
  });
});
