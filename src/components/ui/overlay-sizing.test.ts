import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Two rules for overlays (windows, sheets, the account screen, the tablet drawer, menus, tips).

  A window's body grows from its content, never from nothing: `flex-auto`, not `flex-1`. Safari 26
  and earlier collapse a window that is as tall as its content (a dialog's fit-content height) to
  its header when its body has a zero flex basis. On the owner's iPhone that made the account menu a
  95pt strip and every sheet a sliver (10 Nov); WebKit 27 and Chromium draw both alike, so only
  WebKit 26 shows it (DetailModal's BODY_SCROLLS; scripts/webkit26-check.mjs runs every window there).

  Overlays are placed and sized by the screen they are fixed to: insets, percentages of their
  containing block, env() for the safe areas. Not by viewport units (vh, svh, dvh, lvh, vw and the
  rest) or by measuring the viewport from script (window.innerHeight, the root's clientHeight, the
  visual viewport's size): those are other readings of the screen than the box an overlay is placed
  in, and iOS has reported them wrongly in installed apps (WebKit bugs 254868, 301994, 322900,
  323322). What script needs to know about the screen comes from src/lib/screen.ts, which measures
  a box fixed to the screen's edges.
*/

const root = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

/** The source without its comments (prose may name the units it explains). */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
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
/** Script reading the viewport's size. */
const VIEWPORT_JS = /\binnerHeight\b|\binnerWidth\b|documentElement\.client(?:Height|Width)\b|\bvisualViewport\b/g;

/** What a file may still read of the viewport from script, and why. */
const VIEWPORT_JS_ALLOWED: Record<string, { reads: string[]; why: string }> = {
  "src/components/ui/keyboard-fit.ts": {
    reads: ["visualViewport"],
    why: "the on-screen keyboard is only visible as the visual viewport shrinking; it is read while a field is being typed in, against the fixed box's height, and only a plausible keyboard is believed",
  },
  "src/components/ui/detail-modal.tsx": {
    reads: ["innerWidth", "clientWidth"],
    why: "the scrollbar's width as a window locks the page's scrolling (window less root), capped at 24px",
  },
};

describe("a window's body grows from its content", () => {
  it("every DetailModal body is flex-auto, and nothing in the window grows from nothing", () => {
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    expect(modal).toContain('const BODY_SCROLLS = "min-h-0 flex-auto overflow-y-auto overscroll-contain";');
    expect(modal).toContain('"flex min-h-0 flex-auto flex-col overflow-hidden"');
    // flex-1, basis-0 or a 0% basis on any part of a window (its handle, header, body or footer).
    expect(modal.match(/(?<![\w-])(?:flex-1|basis-0|flex-\[1_1_0%?\])(?![\w-])/g) ?? []).toEqual([]);
  });

  it.each(OVERLAYS)("%s gives no window column a zero-basis item that would have to scroll", (file) => {
    // A scrolling area that grows from nothing (flex-1 with overflow-y-auto) collapses in Safari 26
    // inside a window as tall as its content.
    expect(code(read(file)).match(/(?<![\w-])flex-1(?![\w-])[^"`]*overflow-y-(?:auto|scroll)|overflow-y-(?:auto|scroll)[^"`]*(?<![\w-])flex-1(?![\w-])/g) ?? []).toEqual([]);
  });
});

describe("overlays are sized by the screen they are fixed to", () => {
  it.each(OVERLAYS)("%s uses no viewport units", (file) => {
    expect(code(read(file)).match(VIEWPORT_UNIT) ?? []).toEqual([]);
  });

  it.each(OVERLAYS)("%s does not measure the viewport from script, beyond its listed exception", (file) => {
    const allowed = VIEWPORT_JS_ALLOWED[file]?.reads ?? [];
    const reads = (code(read(file)).match(VIEWPORT_JS) ?? []).filter((r) => !allowed.some((a) => r.endsWith(a)));
    expect(reads).toEqual([]);
  });

  it("the modal believes a scrollbar of at most 24px", () => {
    expect(code(read("src/components/ui/detail-modal.tsx"))).toContain("Math.min(24, window.innerWidth - root.clientWidth)");
  });

  it("keyboard-fit measures the screen from the fixed box and believes a keyboard only once a field is typed in", () => {
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

  // Inside a window, two sizes still follow the viewport, each with a floor in rem so a viewport
  // reported short leaves them usable.
  it.each([
    ["src/components/players/customise-card.tsx", "max-h-[min(26rem,max(60dvh,16rem))]"],
    ["src/components/profile/avatar-upload.tsx", "short:w-[min(16rem,max(10rem,calc(100dvh-9.5rem)))]"],
  ])("%s keeps a rem floor under its viewport-sized %s", (file, cls) => {
    expect(read(file)).toContain(cls);
  });
});
