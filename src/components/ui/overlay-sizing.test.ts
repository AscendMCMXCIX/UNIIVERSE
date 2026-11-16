import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Three rules for overlays (windows, sheets, the account screen, the tablet drawer, menus, tips,
  toasts, pickers).

  A window's body grows from its content, never from nothing: `flex-auto`, not `flex-1`. Safari 26
  and earlier collapse a window that is as tall as its content (a dialog's fit-content height) to
  its header when its body has a zero flex basis. On the owner's iPhone that made the account menu a
  95pt strip (10 Nov), as the iOS 26 Simulator also showed; in WebKit 26.0 most sheets, the compact
  windows and the centred windows of wider screens collapsed the same way. WebKit 27 and Chromium
  draw both alike, so only WebKit 26 shows it (DetailModal's BODY_SCROLLS; scripts/webkit26-check.mjs runs
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

  What must show over a window is drawn inside it. Every window is a modal <dialog> in the browser's
  top layer, above the whole page and its z-indexes, with the rest of the page inert: an ⓘ's bubble
  or a toast left on the page was drawn under the window, out of sight, and a toast's buttons could
  not be pressed. Windows note themselves in the top layer (top-layer.ts) as they open and close; a
  tip's bubble goes into the window its trigger sits in, the toasts into the topmost window. A
  picker's list inside a window opens in the flow of the window's body (picker-flow.ts), which is
  then its one scroller, instead of a list scrolling inside it that the body cut off.
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
  "src/components/ui/toast.tsx",
  "src/components/ui/top-layer.ts",
  "src/components/ui/picker-flow.ts",
  "src/components/ui/keyboard-fit.ts",
  "src/components/mobile-nav.tsx",
  "src/components/account-menu.tsx",
  "src/components/public/sign-in.tsx",
  "src/components/matches/match-filters.tsx",
  "src/components/champions/champion-filter.tsx",
  "src/components/players/opponent-picker.tsx",
];

/** The pickers whose list opens under their button, inside windows among other places. */
const PICKERS = ["src/components/matches/match-filters.tsx", "src/components/champions/champion-filter.tsx", "src/components/players/opponent-picker.tsx"];

/** A viewport unit in a value (12dvh, 100vw, calc(100svh-...)) or a Tailwind size named after one (h-dvh, h-screen). */
const VIEWPORT_UNIT = /(?<![\w-])\d*\.?\d+(?:d|s|l)?(?:vh|vw|vmin|vmax|vb|vi)\b|(?<![\w-])(?:min-|max-)?[hw]-(?:dvh|svh|lvh|screen|dvw|svw|lvw)\b|(?<![\w-])size-screen\b/g;
/**
 * Script reading the viewport's size: the window's; the root's, through documentElement or the
 * names this code gives it (root, html, docEl), with or without `?.`, or taken apart from
 * documentElement; or the visual viewport's. The visual viewport's scale (is the page pinched to
 * zoom?) is not a size.
 */
const VIEWPORT_JS = /\binnerHeight\b|\binnerWidth\b|\b(?:documentElement|root|html|docEl)\??\.client(?:Height|Width)\b|\{[^}]*\bclient(?:Height|Width)\b[^}]*\}\s*=\s*(?:document\.)?documentElement\b|\bvisualViewport\b(?!\??\.scale\b)/g;

/** What a file may still read of the viewport from script, and why. */
const VIEWPORT_JS_ALLOWED: Record<string, { reads: string[]; why: string }> = {
  "src/components/ui/keyboard-fit.ts": {
    reads: ["visualViewport"],
    why: "the on-screen keyboard is only visible as the visual viewport shrinking; it is believed only once a field in the window is typed in (or, for the add-champion list kept above it, while its field has the focus), against the fixed box's height, and only a plausible keyboard",
  },
  "src/components/ui/detail-modal.tsx": {
    reads: ["innerWidth", "root.clientWidth"],
    why: "the scrollbar's width as a window locks the page's scrolling (window less root), capped at 24px",
  },
};

/**
 * A flex item that grows from nothing: flex-N (Tailwind writes flex: N, which is N 1 0%), a zero
 * basis, or an arbitrary flex value or property without a basis of its own.
 */
const ZERO_BASIS_SOURCE = String.raw`(?<![\w-])(?:flex-\d+|basis-0|basis-\[0(?:%|px|rem)?\]|flex-\[\d+(?:_\d+)?(?:_0(?:%|px|rem)?)?\]|\[flex:\d+(?:_\d+)?(?:_0(?:%|px|rem)?)?\]|\[flex-basis:0(?:%|px|rem)?\])(?![\w-])`;
const ZERO_BASIS = new RegExp(ZERO_BASIS_SOURCE, "g");
/** In one class string: a zero-basis item that would have to scroll (overflow-y auto or scroll). */
const ZERO_BASIS_SCROLLER = new RegExp(String.raw`(?:${ZERO_BASIS_SOURCE})[^"\x60]*overflow-y-(?:auto|scroll)|overflow-y-(?:auto|scroll)[^"\x60]*(?:${ZERO_BASIS_SOURCE})`, "g");

/**
 * The values of a JSX attribute in a source: a string, or an expression in braces read to its
 * matching brace (template literals and calls included). A value kept in a named constant is read as
 * that name only.
 */
function attributeValues(source: string, name: string): string[] {
  const values: string[] = [];
  for (let i = source.indexOf(`${name}=`); i !== -1; i = source.indexOf(`${name}=`, i + 1)) {
    const start = i + name.length + 1;
    if (source[start] === '"') values.push(source.slice(start + 1, source.indexOf('"', start + 1)));
    else if (source[start] === "{") {
      let depth = 0;
      let end = start;
      for (; end < source.length; end++) {
        if (source[end] === "{") depth++;
        else if (source[end] === "}" && --depth === 0) break;
      }
      values.push(source.slice(start + 1, end));
    }
  }
  return values;
}

describe("a window's body grows from its content", () => {
  it("every DetailModal body is flex-auto, and nothing in the window grows from nothing", () => {
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    expect(modal).toContain('const BODY_SCROLLS = "min-h-0 flex-auto overflow-y-auto overscroll-contain";');
    expect(modal).toContain('"flex min-h-0 flex-auto flex-col overflow-hidden"');
    // Its handle, header, body and footer.
    expect(modal.match(ZERO_BASIS) ?? []).toEqual([]);
  });

  it("the zero-basis pattern catches the spellings of a body that grows from nothing", () => {
    for (const cls of ["flex-1", "flex-2", "flex-10", "md:flex-1", "basis-0", "basis-[0%]", "basis-[0px]", "flex-[1]", "flex-[1_1]", "flex-[1_1_0%]", "flex-[2_1_0px]", "[flex:1]", "[flex:1_1_0%]", "[flex-basis:0]"]) expect(` ${cls} `.match(ZERO_BASIS), cls).not.toBeNull();
    for (const cls of ["flex-auto", "flex-none", "flex-initial", "flex-wrap", "flex-col", "flex-[1_1_auto]", "[flex:1_1_auto]", "basis-auto", "basis-1/2"]) expect(` ${cls} `.match(ZERO_BASIS), cls).toBeNull();
    expect("min-h-0 flex-2 overflow-y-auto".match(ZERO_BASIS_SCROLLER)).not.toBeNull();
    expect("min-h-0 flex-auto overflow-y-auto".match(ZERO_BASIS_SCROLLER)).toBeNull();
  });

  it.each(OVERLAYS)("%s gives no window column a zero-basis item that would have to scroll", (file) => {
    // A scrolling area that grows from nothing (flex-1 with overflow-y-auto) collapses in Safari 26
    // inside a window as tall as its content.
    expect(code(read(file)).match(ZERO_BASIS_SCROLLER) ?? []).toEqual([]);
  });

  it("no window is given a body that grows from nothing by its caller (bodyClassName)", () => {
    // bodyClassName is joined to the body's own classes by plain clsx, so a caller's flex-1 would sit
    // beside flex-auto and the stylesheet's order, not the class list, would decide.
    const callers = new Set<string>();
    const found = tsxFiles().flatMap((file) => {
      const source = code(read(file));
      if (!/<(?:DetailModal|Dialog)\b/.test(source)) return [];
      return attributeValues(source, "bodyClassName").flatMap((value) => {
        callers.add(file);
        return (value.match(ZERO_BASIS) ?? []).map((cls) => `${file}: ${cls}`);
      });
    });
    expect(found).toEqual([]);
    // The scan read the callers there are (it would pass on reading nothing).
    for (const file of ["src/components/ui/dialog.tsx", "src/components/public/sign-in.tsx", "src/components/players/champion-detail.tsx"]) expect([...callers]).toContain(file);
    // And it reads a template literal or a call to its end.
    expect(attributeValues('<DetailModal bodyClassName={`${phone ? "px-0" : "px-4"} flex-1 overflow-y-auto`} />', "bodyClassName").join(" ").match(ZERO_BASIS)).not.toBeNull();
    expect(attributeValues('<DetailModal bodyClassName={cn("transition-opacity", busy && "flex-[1]")} />', "bodyClassName").join(" ").match(ZERO_BASIS)).not.toBeNull();
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

  it("the viewport pattern catches the root's size through documentElement, root, html or docEl (with ?. or taken apart), and lets the zoom's scale through", () => {
    for (const read of ["window.innerHeight", "document.documentElement.clientHeight", "document.documentElement?.clientHeight", "root.clientHeight", "root?.clientHeight", "html.clientWidth", "docEl.clientHeight", "const { clientHeight } = document.documentElement", "window.visualViewport.height", "vv = window.visualViewport"]) expect(read.match(VIEWPORT_JS), read).not.toBeNull();
    for (const read of ["window.visualViewport?.scale", "visualViewport.scale", "el.clientHeight", "probe.offsetHeight", "const { clientHeight } = el"]) expect(read.match(VIEWPORT_JS), read).toBeNull();
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

describe("what shows over a window is drawn inside it", () => {
  it("every window notes itself in the top layer as it opens and as it closes, and only DetailModal and the tablet's menu are windows of their own", () => {
    const shown = tsxFiles().filter((file) => /\.showModal\(/.test(code(read(file))));
    expect(shown.sort()).toEqual(["src/components/mobile-nav.tsx", "src/components/ui/detail-modal.tsx"]);
    for (const file of shown) {
      const source = code(read(file));
      expect(source, file).toMatch(/noteModalOpened\(d\)/);
      expect(source, file).toMatch(/noteModalAtRest\(/);
      expect(source, file).toMatch(/noteModalClosed\(d\)/);
    }
    // DetailModal says it is closing from a layout effect's cleanup, while it is still on the page,
    // and as its closing motion starts; it is at rest once its opening motion has ended (or after
    // REST_MS): a moving window carries what is fixed in it (the toasts) along with its motion.
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    expect(modal).toMatch(/useLayoutEffect\(\(\) => \{\s*const d = ref\.current;\s*if \(!open \|\| !d\) return;\s*return \(\) => noteModalClosed\(d\);/);
    expect(modal).toMatch(/setClosing\(true\);\s*if \(ref\.current\) noteModalClosed\(ref\.current\);/);
    expect(modal).toMatch(/if \(OPENING_MOTIONS\.has\(e\.animationName\)\) \{\s*settle\(\);\s*noteModalAtRest\(e\.currentTarget\);/);
    expect(modal).toContain("restTimer = window.setTimeout(() => noteModalAtRest(d), REST_MS)");
  });

  it("a tip's bubble is drawn in the window its trigger sits in, and Escape on it is kept from that window", () => {
    const tip = code(read("src/components/ui/info-tip.tsx"));
    expect(tip).toContain('trigger?.closest<HTMLElement>("dialog[open]") ?? topModal() ?? document.body');
    expect(tip).toContain("createPortal(");
    expect(tip).not.toMatch(/createPortal\([\s\S]*document\.body,\s*\)/);
    // Captured on window, and the key's default action (the window's close request) prevented.
    expect(tip).toContain('window.addEventListener("keydown", onKey, true)');
    expect(tip).toMatch(/if \(e\.key !== "Escape"\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
    // Placed again at every frame while the window holding it moves, and once more as it stops.
    expect(tip).toMatch(/place\(\);\s*if \(moving\(host\)\) frame = requestAnimationFrame\(follow\);/);
    expect(tip).toMatch(/"animationstart", "animationend"/);
  });

  it("the toasts are drawn in the topmost window at rest while one is open, and in place otherwise", () => {
    const toast = code(read("src/components/ui/toast.tsx"));
    expect(toast).toContain("React.useSyncExternalStore(subscribeModals, topLayer, noTopLayer)");
    expect(toast).toContain("return host ? createPortal(region, host) : region;");
    // Covered by a window moving in, they wait; a toast is heard once it has been live in place.
    expect(toast).toMatch(/if \(place\.ready \|\| place\.opening\) return;/);
    expect(toast).toContain("React.useEffect(() => () => heard.moved(), [place.host, place.opening]);");
    // Over a sheet, a finger on a toast pulls nothing.
    expect(toast).toContain('data-floating=""');
    expect(code(read("src/components/ui/detail-modal.tsx"))).toContain('closest?.("[data-floating]")');
  });

  it("a window takes the focus itself through focusWindow alone, focusable only while it holds it", () => {
    const modal = code(read("src/components/ui/detail-modal.tsx"));
    const nav = code(read("src/components/mobile-nav.tsx"));
    const drawer = nav.slice(nav.indexOf("function Drawer("), nav.indexOf("\nfunction ", nav.indexOf("function Drawer(") + 1));
    for (const [name, source] of [["DetailModal", modal], ["the tablet's menu", drawer]] as const) {
      expect(source, name).toMatch(/letGo = focusWindow\(d\)/);
      expect(source, name).toMatch(/letGo\(\);/);
      expect(source, name).not.toMatch(/\bd\.focus\(/);
      // No tabindex of its own: a window focusable for good took the focus back at every click on
      // its text, and the keys then scrolled nothing (its body, which scrolls, is inside it).
      expect(source, name).not.toMatch(/tabIndex=/);
    }
  });

  it("the tablet's menu locks the page as every window does", () => {
    const nav = code(read("src/components/mobile-nav.tsx"));
    expect(nav).toContain("const unlock = lockPage();");
    expect(nav).not.toMatch(/style\.overflow\s*=/);
  });

  it.each(PICKERS)("%s opens its list in the flow inside a window, with no scroller of its own there", (file) => {
    const source = code(read(file));
    expect(source).toMatch(/opensInFlow\((?:wrapRef\.current|wrap\.current)\)/);
    expect(source).toMatch(/bringIntoView\((?:panelRef|popover)\.current\)/);
    // The list's own height and scroller only while it floats.
    expect(source).toMatch(/!inFlow && "max-h-72 overflow-y-auto/);
    expect(source).not.toMatch(/className="max-h-72 overflow-y-auto/);
    // In the flow it closes on the click of a press outside (closed as the press started, it moved
    // what is below it under the finger before the click), and no rise moves it as it is brought
    // into view (it would rest a rise's height off).
    expect(source).toMatch(/closeOnPressOutside\(document, \(node\) => !!(?:wrapRef|wrap)\.current\?\.contains\(node\), inFlow, /);
    expect(source).not.toMatch(/addEventListener\("pointerdown"/);
    expect(source).not.toMatch(/"rise-in[^"]*", inFlow \?/);
    expect(source).not.toMatch(/inFlow \? "[^"]*rise-in/);
  });

  it("the pickers' searches are 16px on touch screens at every width: iOS zooms into a smaller field, on a phone held sideways too", () => {
    for (const file of [...PICKERS, "src/components/profile/add-champion.tsx"]) {
      const source = code(read(file));
      expect(source, file).toMatch(/text-base[^"]*(?:sm|md):pointer-fine:text-sm/);
      expect(source, file).not.toMatch(/\b(?:sm|md):text-sm\b/);
    }
  });
});
