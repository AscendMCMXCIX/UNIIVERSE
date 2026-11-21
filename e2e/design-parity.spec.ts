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
    background: "on a desktop it unfolds inside the list's card, over the columns after Win rate, on the card's own surface; a phone's sheet is a window, on the window's raised surface (DESIGN_SYSTEM: All Champions' preview)",
    radius: "the docked preview takes the card's right radius (rounded-r-card: its top-left corner is square, against the list); the phone's sheet has the sheet's 1.25rem top corners",
    border: "the docked preview's edge is a left hairline (border-l border-border-strong), none at its top; the phone's sheet has the window's border all round",
  },
  "post-game: a scoreboard name": { sizeRem: "the compact scoreboard's names are text-xs where the scoreboard is under 30rem wide (a phone's window), so each of the ten names keeps one line; text-sm from 30rem (scoreboard.tsx)" },
  "Matchup Intel: the enemy's slot label": { sizeRem: "the slot's label is a size smaller on a phone (text-2xs, 11px under the 12px floor's phone rule, as the badge), so the longest one-word name fits the slot whole" },
  "Matchup Intel: glance cooldown": { sizeRem: "the glance's tile is a fifth of a phone's row (about 64px at 390), where the cooldown line is text-xs so \"140–100 s\" keeps one line (glance.tsx); the full tile's known cooldown is its big figure, text-md (ability-list.tsx: CooldownValue big)" },
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
  All Champions' preview (S5: an aside in the list's card on a desktop, a window on a phone), the
  post-game view's loadout, its three answers and its scoreboard (S6: under the card on a desktop, in
  the game's window on a phone), Matchup Intel's slots, ability tiles and the phone's glance strip
  (S7a), and Admin's person view with its Riot accounts (S9). One page visit per component and size.
*/
type Part = { name: string; selector: string; phoneSelector?: string };
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
      await expect(page.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
    },
    parts: [
      { name: "post-game: an item", selector: "[data-testid=post-game-items] [data-testid=loadout-icon]" },
      { name: "post-game: loadout name", selector: "[data-testid=loadout-name]" },
      { name: "post-game: an answer's label", selector: "[data-testid=post-game-notes] p[aria-hidden]" },
      { name: "post-game: an answer", selector: "[data-testid=post-game-note]" },
      { name: "post-game: a scoreboard K/D/A", selector: "[data-testid=post-game-scoreboard] [data-testid=participant-kda]" },
      { name: "post-game: a scoreboard name", selector: "[data-testid=post-game-scoreboard] [data-testid=participant-name]" },
    ],
  },
  {
    name: "Matchup Intel",
    path: () => "/resources/matchups?role=top&champion=Riven&vs=Darius",
    open: async (page) => {
      await expect(page.getByTestId("matchup-enemy-abilities-list").getByTestId("ability-row").first()).toBeVisible({ timeout: 15_000 });
    },
    parts: [
      { name: "Matchup Intel: your slot", selector: "[data-testid=matchup-pick-you]" },
      { name: "Matchup Intel: the enemy's slot label", selector: "[data-testid=matchup-pick-enemy-label]" },
      { name: "Matchup Intel: an ability tile's name", selector: "[data-testid=matchup-enemy-abilities-list] [data-testid=ability-name]" },
      // The Q's: a cooldown Riot's data gives (a passive's "not in Riot's data" line is drawn otherwise).
      { name: "Matchup Intel: an ability tile's cooldown", selector: "[data-testid=matchup-enemy-abilities-list] [data-testid=ability-row][data-slot=Q] [data-testid=ability-cooldown-value]" },
      // The glance strip is the phone's alone (sm:hidden): a desktop has the full tiles on its first
      // screen, so the glance's words are compared with the full tile's they repeat (its frame, a
      // phone's tile of about 62px at 375, has no desktop counterpart).
      { name: "Matchup Intel: glance cooldown", selector: "[data-testid=matchup-enemy-abilities-list] [data-testid=ability-row][data-slot=Q] [data-testid=ability-cooldown-value]", phoneSelector: "[data-testid=glance-ability][data-slot=Q] [data-testid=glance-cooldown]" },
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
