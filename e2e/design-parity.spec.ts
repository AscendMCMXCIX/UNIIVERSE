import { test, expect, type Page } from "./test";

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

type Target = { name: string; path: (mate: string) => string; phone?: (mate: string) => string; selector: string; phoneSelector?: string; open?: string };

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
];

/** Differences DESIGN_SYSTEM.md lists, by component and property, each with its reason. */
const LISTED: Record<string, Partial<Record<string, string>>> = {
  "badge (chip)": { sizeRem: "the 12px floor: text-2xs is 12px on desktops, 11px on phones (globals.css)" },
  Select: { sizeRem: "a field's text is 16px on a touch screen, so iOS does not zoom into it (STANDARDS: fields); 14px with a mouse" },
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
    const d = await look(dp, t.selector, t.open);
    const p = await look(pp, t.phoneSelector ?? t.selector, t.open);
    for (const key of Object.keys(d) as Array<keyof typeof d>) {
      if (d[key] === p[key] || LISTED[t.name]?.[key]) continue;
      problems.push(`${t.name}: ${key} is ${String(p[key])} on a phone, ${String(d[key])} on a desktop`);
    }
  }
  await desk.close();
  await phone.close();
  expect(problems).toEqual([]);
});
