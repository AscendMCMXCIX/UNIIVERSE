import { expect, test, type Browser, type Page } from "./test";

/*
  Team's section tabs never scroll up and down, and draw no scrollbar (18 Nov 2026). The owner saw a
  tiny vertical scrollbar just left of the team's name at the end of the tabs on Leaderboards. Its
  cause, measured: the list of tabs scrolls sideways (overflow-x auto), which makes it a vertical
  scroll box too; the selected tab's bar was drawn 0.125rem below a 2px border, so wherever the root
  size is above 16px (the app's own from a 1536px window: 17.7px at 1920, 22px at 3440; a larger text
  size; some zoom levels) it reached past the list by a fraction of a pixel, and where scrollbars are
  classic (Windows) the list drew a thin vertical scrollbar: the global thin-scrollbar rule, outside
  any layer, beat the list's own scrollbar-width: none. Playwright hides scrollbars by default
  (--hide-scrollbars), so this file shows them: a drawn scrollbar then takes room from its box and is
  measured. Every scroll box in the row (the bar and everything in it) is checked on Team's four
  sections at 1280, 1440, 1920, 2560 and 3440, the sidebar open and folded, at text sizes from 80% to
  150% (the root size times the reader's factor) and at browser zoom from 80% to 150% (the device
  pixel ratio, the window's CSS width divided by it). The row still scrolls sideways where its tabs do
  not fit (a narrow window at a large text size), with faded edges and no scrollbar.
*/

test.use({ launchOptions: { ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}), ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "the windows are set here; runs once");
});

const WIDTHS = [1280, 1440, 1920, 2560, 3440];
const PAGES = ["/team", "/players", "/leaderboards", "/matches"];
const TEXT = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
const ZOOM = [0.8, 0.9, 1.1, 1.25, 1.5];

interface ScrollBox {
  name: string;
  overflowY: string;
  vOverflow: number;
  hOverflow: number;
  vBar: number;
  hBar: number;
}

/** Every scroll box in Team's tabs row (the bar and all it holds): how far it overflows each way, and the scrollbars it draws (the room they take from its box). */
function rowScrollBoxes(page: Page): Promise<ScrollBox[]> {
  return page.getByTestId("team-tabs").evaluate((nav) => {
    const scrolls = (v: string) => v === "auto" || v === "scroll";
    return [nav as HTMLElement, ...nav.querySelectorAll<HTMLElement>("*")].flatMap((el) => {
      const cs = getComputedStyle(el);
      if (!scrolls(cs.overflowX) && !scrolls(cs.overflowY)) return [];
      const px = (v: string) => parseFloat(v) || 0;
      return [
        {
          name: `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}`,
          overflowY: cs.overflowY,
          vOverflow: el.scrollHeight - el.clientHeight,
          hOverflow: el.scrollWidth - el.clientWidth,
          vBar: Math.round(el.offsetWidth - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - el.clientWidth),
          hBar: Math.round(el.offsetHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth) - el.clientHeight),
        },
      ];
    });
  });
}

/** What is wrong with the row at one size, by kind: none of it should hold anything. */
interface Problems {
  /** A scrollbar drawn by a scroll box in the row (the symptom the owner saw). */
  drawn: string[];
  /** A scroll box whose content reaches past it up or down. */
  overflow: string[];
  /** A scroll box that can scroll up and down at all (overflow-y auto or scroll). */
  scrollable: string[];
}
const problems = (): Problems => ({ drawn: [], overflow: [], scrollable: [] });

/** The row at this size: no scroll box in it overflows up and down, none can scroll that way, and none draws a scrollbar. Collected, so a failure lists every size at once. */
async function checkRow(page: Page, where: string, found: Problems) {
  const boxes = await rowScrollBoxes(page);
  expect(boxes.length, `${where}: the tabs' list scrolls sideways`).toBeGreaterThan(0);
  for (const b of boxes) {
    if (b.vBar > 0 || b.hBar > 0) found.drawn.push(`${where}: ${b.name} draws ${b.vBar > 0 ? `a vertical scrollbar ${b.vBar}px wide` : ""}${b.vBar > 0 && b.hBar > 0 ? " and " : ""}${b.hBar > 0 ? `a horizontal scrollbar ${b.hBar}px tall` : ""}`);
    if (b.vOverflow > 0) found.overflow.push(`${where}: ${b.name} overflows up and down by ${b.vOverflow}px`);
    if (b.overflowY === "auto" || b.overflowY === "scroll") found.scrollable.push(`${where}: ${b.name} (overflow-y ${b.overflowY})`);
  }
}

/** Opens a Team section and waits for its tabs and the font they are measured in. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("team-tabs")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Folds or unfolds the sidebar where it is, by its own shortcut (Ctrl+\; no motion: reduced motion is
 * asked for), so the row takes its new width at once. The pointer waits off the sidebar first, so a
 * folded one does not open over the page while it is measured.
 */
async function sidebar(page: Page, collapsed: boolean) {
  const aside = page.getByTestId("sidebar");
  await page.mouse.move(page.viewportSize()!.width - 2, page.viewportSize()!.height - 2);
  await expect(async () => {
    if (((await aside.getAttribute("data-collapsed")) === "true") !== collapsed) await page.keyboard.press("Control+Backslash");
    await expect(aside).toHaveAttribute("data-collapsed", String(collapsed), { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function newDesktop(browser: Browser, baseURL: string, deviceScaleFactor: number) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor, reducedMotion: "reduce" });
  await context.addCookies([
    { name: "uniiverse_view", value: "player", url: baseURL },
    { name: "uniiverse_sidebar", value: "expanded", url: baseURL },
  ]);
  return context;
}

test("Team's tabs never scroll up and down and draw no scrollbar: every section, five desktop widths, the sidebar open and folded, text from 80% to 150%", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const found = problems();
  const context = await newDesktop(browser, baseURL!, 1);
  const page = await context.newPage();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await open(page, path);
      // The app's own root size at this width (it grows from a 1536px window), times the reader's factor.
      const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      for (const collapsed of [false, true]) {
        await sidebar(page, collapsed);
        for (const factor of TEXT) {
          await page.evaluate((px) => {
            document.documentElement.style.fontSize = px ? `${px}px` : "";
          }, factor === 1 ? 0 : root * factor);
          await checkRow(page, `${path} at ${width}px, the sidebar ${collapsed ? "folded" : "open"}, ${Math.round(factor * 100)}% text (root ${(root * factor).toFixed(2)}px)`, found);
        }
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "";
        });
      }
      await sidebar(page, false);
    }
  }
  await context.close();
  expect(found).toEqual(problems());
});

test("Team's tabs never scroll up and down and draw no scrollbar at browser zoom from 80% to 150%, at five window widths, the sidebar open and folded (Leaderboards, where the owner saw it)", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const found = problems();
  for (const zoom of ZOOM) {
    // Browser zoom: the device pixels per CSS pixel, and the window's CSS width divided by it (a 1280px
    // window at 150% is 853 CSS pixels wide: a tablet's frame, whose tabs are the same bar).
    const context = await newDesktop(browser, baseURL!, zoom);
    const page = await context.newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: Math.round(width / zoom), height: Math.round(900 / zoom) });
      for (const path of ["/leaderboards"]) {
        await open(page, path);
        const desktop = await page.getByTestId("sidebar").isVisible();
        for (const collapsed of desktop ? [false, true] : [false]) {
          if (desktop) await sidebar(page, collapsed);
          await checkRow(page, `${path} at ${width}px and ${Math.round(zoom * 100)}% zoom (${Math.round(width / zoom)} CSS px)${desktop ? `, the sidebar ${collapsed ? "folded" : "open"}` : ""}`, found);
        }
        if (desktop) await sidebar(page, false);
      }
    }
    await context.close();
  }
  expect(found).toEqual(problems());
});

test("where its tabs do not fit, the row still scrolls sideways, the current tab in view and the hidden end faded, with no scrollbar", async ({ browser, baseURL }) => {
  const found = problems();
  const context = await newDesktop(browser, baseURL!, 1);
  const page = await context.newPage();
  // A 1280 window at 150% text with the sidebar open, and a tablet's width at 200%: Players' row is
  // narrower than its tabs and the team's name.
  for (const [width, factor] of [
    [1280, 1.5],
    [800, 2],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "/players");
    await page.evaluate((f) => {
      document.documentElement.style.fontSize = `${f * 100}%`;
    }, factor);
    const where = `Players at ${width}px, ${Math.round(factor * 100)}% text`;
    const list = page.getByTestId("team-tabs").locator("ul");
    await expect.poll(async () => (await rowScrollBoxes(page))[0]?.hOverflow ?? 0, { message: `${where}: the tabs overflow the row sideways` }).toBeGreaterThan(0);
    await checkRow(page, where, found);
    // The current tab is kept in view, and the end that hides more is faded.
    const current = page.getByTestId("team-tabs").locator("a[aria-current=page]");
    const [box, tab] = [(await list.boundingBox())!, (await current.boundingBox())!];
    expect(tab.x, `${where}: the current tab starts in the row`).toBeGreaterThanOrEqual(box.x - 1);
    expect(tab.x + tab.width, `${where}: the current tab ends in the row`).toBeLessThanOrEqual(box.x + box.width + 1);
    // Sideways it scrolls, all the way to its end, where the start fades instead.
    const end = await list.evaluate((ul) => {
      ul.scrollLeft = ul.scrollWidth;
      return ul.scrollLeft;
    });
    expect(end, `${where}: the row scrolls sideways`).toBeGreaterThan(0);
    await expect(list, where).toHaveAttribute("data-fade-start", "true");
    await expect(list, where).toHaveAttribute("data-fade-end", "false");
    await checkRow(page, `${where}, scrolled to its end`, found);
  }
  await context.close();
  expect(found).toEqual(problems());
});
