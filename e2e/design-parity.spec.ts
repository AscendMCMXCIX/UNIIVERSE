import { test, expect, type Page } from "./test";
import { openGame } from "./match-history";
import { openPerson } from "./member-account";

/*
  One look on every screen (S2c; docs/DESIGN_SYSTEM.md → "One look at every width"): the shared
  components, as the pages draw them on a phone (375 × 667, touch) and on a desktop (1440 × 900), have
  the same computed type, colour, radius and border: font family, size in rem, weight, letter spacing
  in em, text colour, background, radius, and the top border's width and colour. A difference must be
  listed in LISTED below with its reason, and in DESIGN_SYSTEM.md. It would have caught labels tracked
  0.44px on desktops and 1.32px on phones (UM.T5). Viewport-independent by design, so the desktop
  project alone runs it and sets both sizes itself. Each later stage adds the components it creates.
*/
test.skip(({ viewport, browserName }) => viewport?.width !== 1440 || browserName !== "chromium", "the desktop project sets both sizes itself");

type Target = { name: string; path: (mate: string) => string; phone?: (mate: string) => string; selector: string; phoneSelector?: string; open?: string; phoneOpen?: string; prepare?: (page: Page) => Promise<void> };

/** Down to the end of the page in steps, as a reader scrolls (the pinned row then offers Filters). */
async function toTheEnd(page: Page) {
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(async () => {
    const end = document.documentElement.scrollHeight - innerHeight;
    for (let y = window.scrollY; y < end; y += 240) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, end);
  });
}

const TARGETS: Target[] = [
  { name: "stat label", path: (m) => m, selector: "main [class*=tracking-label]" },
  { name: "Panel", path: (m) => `${m}/champions`, selector: "[data-testid=all-champions-table]" },
  { name: "DataRow", path: () => "/players", selector: "[data-testid=player-card]" },
  { name: "badge (chip)", path: () => "/team", selector: "[data-testid=main-role-badge]" },
  { name: "Button", path: () => "/settings", selector: "main button:has-text('Change password')" },
  { name: "section tabs (current)", path: () => "/players", selector: "[data-testid=team-tabs] a[aria-current=page]", phoneSelector: "[data-testid=mobile-topbar] a[aria-current=page]" },
  { name: "InfoTip bubble", path: () => "/team", selector: "[data-testid=info-tip-bubble]", open: "[data-testid=team-header] [data-testid=info-tip]" },
  // One Select (ui/select.tsx): the app's popover button on a desktop (the Overview's game filter), the
  // browser's own select in the phone posture (All Champions' sort), both drawn by selectClass.
  { name: "Select", path: (m) => m, phone: (m) => `${m}/champions`, selector: "main [data-select]", phoneSelector: "select#all-champions-sort-by" },
  // The overlay kit (S4a): the Team player Peek, docked on a desktop and in its phone window; the
  // phone window shell's ‹ › (PreviewWindow's SiblingSteps, the same buttons in the docked panel);
  // the pinned row's Filters, a Popover on a desktop and the sheet a touch phone keeps.
  { name: "Peek", path: () => "/team", selector: "[data-peek-panel]", phoneSelector: "dialog[data-testid=player-detail]", open: "[data-testid=lineup-row-MID] [data-testid=open-player-detail]" },
  { name: "PreviewWindow (‹ ›)", path: () => "/team", selector: "[data-testid=detail-next]", open: "[data-testid=lineup-row-MID] [data-testid=open-player-detail]" },
  { name: "Popover", path: (m) => `${m}/matches`, selector: "[data-popover]", phoneSelector: "dialog[data-testid=filter-sheet]", prepare: toTheEnd, open: "[data-testid=toolbar-filters]", phoneOpen: "[data-testid=match-history] [data-testid=filter-toggle]" },
];

/** Differences DESIGN_SYSTEM.md lists, by component and property, each with its reason. */
const LISTED: Record<string, Partial<Record<string, string>>> = {
  "badge (chip)": { sizeRem: "the 12px floor: text-2xs is 12px on desktops, 11px on phones (globals.css)" },
  Select: { sizeRem: "a field's text is 16px on a touch screen, so iOS does not zoom into it (STANDARDS: fields); 14px with a mouse" },
  Peek: { border: "the docked panel's edge is its left border alone (border-l), over the page; the phone's window has the window's border all round" },
  // S5–S9's components (the second test below).
  "champion preview": {
    background: "the pane beside the list is part of the page, on the list card's surface (bg-surface); the phone's sheet is a window, on the raised surface (bg-elevated) (DESIGN_SYSTEM §7: All Champions' champion)",
    radius: "the pane is a card beside the list's card (the card radius); the phone's sheet has the sheet's 1.25rem top corners",
    border: "the pane has the list card's border; the phone's sheet the window's",
  },
  "post-game: a scoreboard name": { sizeRem: "the compact scoreboard's names are text-xs where the scoreboard is under 30rem wide (a phone's window), so each of the ten names keeps one line; text-sm from 30rem (scoreboard.tsx)" },
  "Admin: person view": { radius: "the person view is DetailModal: a phone's window fills the screen and has no corners; a desktop's is a centred window with the panel's radius" },
  Popover: { radius: "a touch phone keeps the sheet, docked to the bottom edge with the sheet's 1.25rem top corners; the popover has a menu's rounded-lg" },
};

async function look(page: Page, selector: string, open?: string) {
  if (open) {
    const trigger = page.locator(open).first();
    await trigger.click();
  }
  const el = page.locator(selector).filter({ visible: true }).first();
  await expect(el).toBeVisible();
  return el.evaluate((node) => {
    const s = getComputedStyle(node);
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const size = parseFloat(s.fontSize);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
      family: s.fontFamily,
      sizeRem: round(size / root),
      weight: s.fontWeight,
      trackingEm: s.letterSpacing === "normal" ? 0 : round(parseFloat(s.letterSpacing) / size),
      color: s.color,
      background: s.backgroundColor,
      radius: s.borderTopLeftRadius,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
    };
  });
}

test("the shared components look the same on a phone and on a desktop", async ({ browser }) => {
  test.setTimeout(120_000);
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const dp = await desk.newPage();
  const pp = await phone.newPage();
  // The lineup's Mid: a teammate with games, whatever members other tests have added.
  await dp.goto("/team");
  const mate = `/players/${(await dp.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!}`;
  const problems: string[] = [];
  for (const t of TARGETS) {
    await dp.goto(t.path(mate));
    await pp.goto((t.phone ?? t.path)(mate));
    if (t.prepare) await t.prepare(dp);
    const d = await look(dp, t.selector, t.open);
    const p = await look(pp, t.phoneSelector ?? t.selector, t.phoneOpen ?? t.open);
    for (const key of Object.keys(d) as Array<keyof typeof d>) {
      if (d[key] === p[key] || LISTED[t.name]?.[key]) continue;
      problems.push(`${t.name}: ${key} is ${String(p[key])} on a phone, ${String(d[key])} on a desktop`);
    }
  }
  await desk.close();
  await phone.close();
  expect(problems).toEqual([]);
});

/*
  The components S5–S9 created, each opened as a member opens it, and its parts compared the same way:
  All Champions' preview (S5: a pane beside the list on a desktop since 25 Nov 2026, a window on a phone), the
  post-game view's loadout and its scoreboard (S6: under the card on a desktop, in
  the game's window on a phone), Champion Intel's champion and abilities (Release 16, in
  Matchup Intel's place), and Admin's person view with its Riot accounts (S9). One page visit per component and size.
*/
/** `gamePage`: the page of a phone's game window the part is on (Player, Build, Scoreboard: post-game.tsx). */
type Part = { name: string; selector: string; phoneSelector?: string; gamePage?: "player" | "build" | "board" };
type Group = { name: string; path: (mate: string) => string; open?: (page: Page, phone: boolean) => Promise<void>; parts: Part[] };

const GROUPS: Group[] = [
  {
    name: "champion preview",
    path: (m) => `${m}/champions`,
    open: async (page) => {
      const row = page.getByTestId("top-champion").first();
      const content = page.getByTestId("champion-preview-content");
      await expect(async () => {
        if (!(await content.count())) await row.getByTestId("open-champion").click({ timeout: 2_000 });
        await expect(content).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await expect(content.getByTestId("champion-preview-opponent").first()).toBeVisible();
    },
    parts: [
      { name: "champion preview", selector: "[data-testid=champion-preview]" },
      { name: "champion preview: figures", selector: "[data-testid=champion-preview-figures]" },
      { name: "champion preview: an opponent", selector: "[data-testid=champion-preview-opponent]" },
      { name: "champion preview: foot line", selector: "[data-testid=champion-preview-foot]" },
    ],
  },
  {
    name: "post-game view",
    path: (m) => `${m}/matches`,
    open: async (page) => {
      await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
      await openGame(page.getByTestId("match-card").first());
      await expect(page.locator("[data-testid=match-breakdown]").filter({ visible: true }).first()).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    },
    parts: [
      { name: "post-game: an item", selector: "[data-testid=post-game-items] [data-testid=loadout-icon]" },
      { name: "post-game: loadout name", selector: "[data-testid=loadout-name]" },
      { name: "post-game: a scoreboard K/D/A", selector: "[data-testid=post-game-scoreboard] [data-testid=participant-kda]", gamePage: "board" },
      { name: "post-game: a scoreboard name", selector: "[data-testid=post-game-scoreboard] [data-testid=participant-name]", gamePage: "board" },
    ],
  },
  {
    name: "Champion Intel",
    // At haste 0: a narrow row at a haste above 0 keeps only the line at that haste (the base moves into the opened row), so the base is compared where both show it.
    path: () => "/lookup?champion=Darius",
    open: async (page) => {
      await expect(page.getByTestId("lookup-ability").first()).toBeVisible({ timeout: 15_000 });
    },
    parts: [
      { name: "Champion Intel: the champion's name", selector: "[data-testid=lookup-name]" },
      { name: "Champion Intel: an ability's name", selector: "[data-testid=lookup-ability-name]" },
      // The Q's: a cooldown Riot's data gives (a passive's "not in Riot's data" line is drawn otherwise).
      { name: "Champion Intel: a base cooldown", selector: "[data-testid=lookup-ability][data-slot=Q] [data-testid=lookup-base]" },
    ],
  },
  {
    name: "Admin person view",
    path: () => "/admin/people",
    open: async (page) => {
      // A member with a linked Riot account (the demo's Top), so the panel shows its rows.
      await openPerson(page, "Demo Top");
    },
    parts: [
      { name: "Admin: person view", selector: "[data-testid=person-view]" },
      { name: "Admin: person view's section heading", selector: "[data-testid=person-riot] h3" },
      { name: "Admin: Riot accounts", selector: "[data-testid=person-view] [data-testid=riot-accounts]" },
      { name: "Admin: a Riot account", selector: "[data-testid=person-view] [data-testid=riot-account-row]" },
    ],
  },
];

test("the components S5–S9 created look the same on a phone and on a desktop", async ({ browser }) => {
  test.setTimeout(150_000);
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const dp = await desk.newPage();
  const pp = await phone.newPage();
  await dp.goto("/team");
  const mate = `/players/${(await dp.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!}`;
  const problems: string[] = [];
  for (const g of GROUPS) {
    const looks: Record<string, Awaited<ReturnType<typeof look>>>[] = [];
    for (const [page, isPhone] of [[dp, false], [pp, true]] as const) {
      await page.goto(g.path(mate));
      if (g.open) await g.open(page, isPhone);
      const got: Record<string, Awaited<ReturnType<typeof look>>> = {};
      for (const part of g.parts) {
        const selector = isPhone ? (part.phoneSelector ?? part.selector) : part.selector;
        const tab = part.gamePage ? page.locator(`[data-testid=post-game-page-${part.gamePage}]`) : null;
        if (tab && (await tab.count())) await tab.click();
        if (!(await page.locator(selector).filter({ visible: true }).count())) problems.push(`${part.name}: not shown on a ${isPhone ? "phone" : "desktop"}`);
        else got[part.name] = await look(page, selector);
      }
      looks.push(got);
    }
    const [d, p] = looks as [Record<string, Awaited<ReturnType<typeof look>>>, Record<string, Awaited<ReturnType<typeof look>>>];
    for (const part of g.parts) {
      if (!d[part.name] || !p[part.name]) continue;
      for (const key of Object.keys(d[part.name]!) as Array<keyof Awaited<ReturnType<typeof look>>>) {
        if (d[part.name]![key] === p[part.name]![key] || LISTED[part.name]?.[key]) continue;
        problems.push(`${part.name}: ${key} is ${String(p[part.name]![key])} on a phone, ${String(d[part.name]![key])} on a desktop`);
      }
    }
  }
  await desk.close();
  await phone.close();
  expect(problems).toEqual([]);
});

/*
  Admin's pages drawn one way (the design review of 20 Nov, G4): each check is a measured geometry
  or a computed style a regression would change. Desktop 1440 × 900 and a phone, 375 × 667.
*/
test("Admin's pages: one header rhythm, one panel depth, one fold, aligned toolbars and tiles", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  for (const c of [desk, phone]) await c.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  const dp = await desk.newPage();
  const pp = await phone.newPage();
  const problems: string[] = [];
  const check = (ok: boolean, what: string) => void (ok || problems.push(what));

  // G4-1: on a phone, an Admin page under a section row has an empty header: it takes no room, so its content starts the page.
  for (const path of ["/admin/system", "/admin/branding", "/admin/audit", "/admin/people/access"]) {
    await pp.goto(path);
    const m = await pp.locator("main header").first().evaluate((h) => ({ height: h.getBoundingClientRect().height, gap: h.nextElementSibling!.getBoundingClientRect().top - h.parentElement!.getBoundingClientRect().top }));
    check(m.height <= 1 && m.gap <= 1, `${path}: the phone's empty header takes ${m.height}px and pushes the content ${m.gap}px down`);
  }

  // G4-2: Settings' title where every other Admin page has it.
  await dp.goto("/admin");
  const dashX = (await dp.locator("main h1").first().boundingBox())!.x;
  // G4-8, G4-17: the counts strip's first tile has no hairline of its own; one administrator is singular.
  const strip = await dp.evaluate(() => ({ border: getComputedStyle(document.querySelector("[data-testid=dashboard-accounts-active]")!).borderLeftWidth, admins: document.querySelector("[data-testid=dashboard-admins]")!.textContent ?? "" }));
  check(strip.border === "0px", `the strip's first tile draws a ${strip.border} hairline`);
  check(!/^\D*1\D*administrators/.test(strip.admins), `"${strip.admins}": a wrong plural`);
  // G4-2 kept Settings' 64rem at the Admin column's left edge, under the Dashboard's title; since 23
  // Nov 2026 every page narrower than its column is centred in it (the owner's review: no page against
  // the sidebar with the spare room on its right), so Settings is centred in the Admin column, which
  // is itself centred beside the sidebar, and its title is never left of the Dashboard's.
  await dp.goto("/admin/settings");
  const settings = await dp.evaluate(() => {
    const column = document.querySelector("main#content > [data-testid=page-frame]")!.firstElementChild!;
    let page = column.firstElementChild;
    while (page && page.getBoundingClientRect().width === 0) page = page.nextElementSibling;
    const c = column.getBoundingClientRect();
    const p = page!.getBoundingClientRect();
    return { left: p.left - c.left, right: c.right - p.right, title: document.querySelector("main h1")!.getBoundingClientRect().x };
  });
  check(Math.abs(settings.left - settings.right) <= 1, `Settings ${Math.round(settings.left)}px inside the Admin column on the left, ${Math.round(settings.right)}px on the right`);
  check(settings.title >= dashX - 1, `Settings' title at x=${settings.title}, left of the Dashboard's at ${dashX}`);

  // G4-5, G4-10, G4-12: System Health's fold is a row in its panel; the status list has the panels' depth; each verdict has its icon.
  await dp.goto("/admin/system");
  const sys = await dp.evaluate(() => ({
    fold: document.querySelector("[data-testid=field-performance-details]")?.getAttribute("data-fold") ?? "missing",
    depth: getComputedStyle(document.querySelector("[data-testid=system-status]")!).boxShadow,
    verdicts: [...document.querySelectorAll("[data-testid^=field-words-]")].map((li) => !!li.querySelector("svg")),
  }));
  check(sys.fold === "row", `Technical details is a ${sys.fold} fold inside its panel`);
  check(sys.depth !== "none", "the status list has no panel depth");
  check(sys.verdicts.length > 0 && sys.verdicts.every(Boolean), `page-speed verdicts: ${sys.verdicts.length} shown, each needs its icon`);
  await dp.goto("/admin/people/privacy");
  for (const id of ["privacy-procedure", "privacy-backups"]) check((await dp.getByTestId(id).getAttribute("data-fold")) === "row", `${id} is a box inside its panel`);

  // G4-6: the audit's date fields have the From and To labels beside them on a desktop.
  await dp.goto("/admin/audit");
  for (const id of ["audit-from", "audit-to"]) {
    const m = await dp.evaluate((i) => { const l = document.querySelector(`label[for=${i}]`)!.getBoundingClientRect(); const f = document.getElementById(i)!.getBoundingClientRect(); return { lw: l.width, lr: l.right, fx: f.x }; }, id);
    check(m.lw > 8 && m.lr <= m.fx, `${id}: its label is not shown beside it`);
  }

  // G4-9, G4-14: Branding's sections and image cards share Public team page's radius and depth; the three drop zones start on one line.
  await dp.goto("/admin/branding");
  const brand = await dp.evaluate(() => ({
    looks: ["#brand-name", "[data-testid=brand-backdrop-setting]", "#brand-colours", "[data-testid=brand-logo]", "[data-testid=brand-public]"].map((s) => { const cs = getComputedStyle(document.querySelector(s)!); return `${cs.borderTopLeftRadius} ${cs.boxShadow !== "none"}`; }),
    zones: ["logo", "background", "appBackground"].map((k) => Math.round(document.querySelector(`[data-testid=brand-${k}] .border-dashed`)!.getBoundingClientRect().top)),
  }));
  check(new Set(brand.looks).size === 1 && brand.looks[0]!.endsWith("true"), `Branding's sections drawn ${[...new Set(brand.looks)].join(" / ")}`);
  check(new Set(brand.zones).size === 1, `the drop zones start at ${brand.zones.join(", ")}`);
  // G4-13: on a phone no wrapped line of the section index starts with a dot.
  await pp.goto("/admin/branding");
  const dots = await pp.getByTestId("branding-index").evaluate((nav) => {
    const ul = nav.querySelector("ul")!;
    const left = ul.getBoundingClientRect().left;
    return [...ul.querySelectorAll("li")].filter((li) => li.querySelector("[data-section-dot]") && li.querySelector("a")!.getBoundingClientRect().left - left < 8).map((li) => li.querySelector("[data-section-dot]")!.getBoundingClientRect().right - left);
  });
  check(dots.every((r) => r <= 0), `a line of the section index starts with a dot (${dots.join(", ")})`);

  // G4-15: Rotate and Reset in the segments' type, and on one line together on a phone.
  await dp.goto("/admin/previews");
  check((await dp.getByTestId("preview-rotate").evaluate((b) => getComputedStyle(b).fontSize)) === "14px", "Rotate's text is not 14px");
  await pp.goto("/admin/previews");
  const tops = await pp.getByTestId("preview-actions").evaluate((s) => [...s.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().top)));
  check(new Set(tops).size === 1, `Rotate and Reset split across lines (${tops.join(", ")})`);
  // …and on a 320px phone at 200% text they stack rather than push the page sideways.
  await pp.setViewportSize({ width: 320, height: 640 });
  await pp.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const wide = await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(wide <= 0, `Previews scrolls ${wide}px sideways at 320px and 200% text`);
  await pp.setViewportSize({ width: 375, height: 667 });

  // G4-16: Add resource is the page-level action's size, as Add account is.
  await dp.goto("/admin/resources");
  // Streamed: measured once shown (a box read from the hidden template is null).
  await expect(dp.getByTestId("resource-add")).toBeVisible();
  const add = (await dp.getByTestId("resource-add").boundingBox())!.height;
  check(add >= 35, `Add resource is ${add}px tall`);

  // G4-20: the base access levels' tiles in the groups' three columns.
  await dp.goto("/admin/people/access");
  const levels = await dp.getByTestId("preset-card").evaluateAll((cards) => cards.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().top)));
  check(levels.length === 3 && new Set(levels).size === 1, `the first three access levels on ${new Set(levels).size} rows`);

  await desk.close();
  await phone.close();
  expect(problems).toEqual([]);
});
