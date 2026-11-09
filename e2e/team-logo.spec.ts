import { expect, test, type Browser, type BrowserContextOptions, type Page } from "./test";
import path from "node:path";

/*
  THE TEAM LOGO: an animated logo (e2e/fixtures/animated-logo.gif, two frames, twice as wide as it
  is tall) uploaded in Admin → Branding shows at its own proportions in a square, never squeezed,
  on phones, tablets and desktops, and it animates on every one of them: the browser is given the
  animation (served as its web copy), and only someone who asks for reduced motion gets the still
  first frame. It is drawn where its place is: on the desktop sidebar's centre line with the icons,
  and at the start of its row everywhere else (the picture's still-frame source takes no place of
  its own). Team Overview's one-row header shows it at 44px held sideways, 48px on tablets and 56px
  on desktops; a phone held upright shows it in the top bar right above instead. Each test removes
  the logo again at the end, so other tests see the usual team mark.
*/

const GIF = path.join(__dirname, "fixtures/animated-logo.gif");

const SCREENS = [
  { name: "phone sideways", viewport: { width: 812, height: 375 }, isMobile: true, hasTouch: true, side: 44 },
  { name: "tablet", viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, side: 48 },
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, side: 56 },
] as const;

/** Uploads the animated logo, runs `checks`, then removes the logo again whatever happened. */
async function withLogo(page: Page, baseURL: string, checks: () => Promise<void>) {
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL }]);
  await page.goto("/admin/branding");
  const card = page.locator("[data-testid=brand-logo][data-ready=true]");
  await expect(card).toBeVisible();
  await card.locator("input[type=file]").setInputFiles(GIF);
  await expect(page.getByText(/Logo updated \(animated\)/)).toBeVisible({ timeout: 60_000 });
  try {
    await checks();
  } finally {
    // Back to the usual team mark for every other test.
    await page.goto("/admin/branding");
    await page.locator("[data-testid=brand-logo][data-ready=true]").getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("brand-logo-empty")).toBeVisible();
  }
}

/** Opens `path` in a window of its own (Player Mode unless `cookies` say otherwise), once the logo (`logo`, an img) has loaded. */
async function openPage(browser: Browser, baseURL: string, path: string, logo: string, options: BrowserContextOptions, cookies: Record<string, string> = { uniiverse_view: "player" }) {
  const context = await browser.newContext(options);
  await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: baseURL })));
  const page = await context.newPage();
  await page.goto(path);
  const img = page.locator(logo).first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  return page;
}

async function teamLogo(browser: Browser, baseURL: string, screen: (typeof SCREENS)[number], reducedMotion: "reduce" | "no-preference") {
  const page = await openPage(browser, baseURL, "/team", "[data-testid=team-header] img", { viewport: screen.viewport, isMobile: screen.isMobile, hasTouch: screen.hasTouch, reducedMotion });
  const img = page.getByTestId("team-header").locator("img").first();
  const box = (await img.boundingBox())!;
  const shown = await img.evaluate((i: HTMLImageElement) => ({ src: i.currentSrc, fit: getComputedStyle(i).objectFit, ratio: i.naturalWidth / i.naturalHeight }));
  await page.context().close();
  return { box, ...shown };
}

test("the team logo keeps its proportions in a square everywhere, and animates unless motion is reduced", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one upload, checked on several screens below");
  test.setTimeout(180_000);
  await withLogo(page, baseURL!, async () => {
    for (const screen of SCREENS) {
      const moving = await teamLogo(browser, baseURL!, screen, "no-preference");
      // A square of the header's size, whatever the window (a crowded phone header included).
      expect(Math.round(moving.box.width), `${screen.name}: width`).toBe(screen.side);
      expect(Math.round(moving.box.height), `${screen.name}: height`).toBe(screen.side);
      // The picture inside keeps its own shape (2:1 here), drawn whole.
      expect(moving.fit).toBe("contain");
      expect(moving.ratio).toBeCloseTo(2, 1);
      // The animation, not the still frame.
      expect(new URL(moving.src).pathname, `${screen.name}: animated`).toBe("/api/branding/logo");
      const still = await teamLogo(browser, baseURL!, screen, "reduce");
      expect(new URL(still.src).pathname, `${screen.name}: reduced motion`).toBe("/api/branding/logo-static");
      expect(Math.round(still.box.width)).toBe(screen.side);
      expect(Math.round(still.box.height)).toBe(screen.side);
    }
    // A phone held upright: the top bar shows the same logo, square too, drawn whole, and the page's
    // header leaves it out; reduced motion gets its still frame there too.
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const phone = await openPage(browser, baseURL!, "/team", "[data-testid=mobile-topbar] img", { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, reducedMotion });
      const logo = phone.getByTestId("mobile-topbar").locator("img").first();
      const bar = (await logo.boundingBox())!;
      expect(Math.round(bar.width)).toBe(Math.round(bar.height));
      const shown = await logo.evaluate((i: HTMLImageElement) => ({ src: new URL(i.currentSrc).pathname, fit: getComputedStyle(i).objectFit }));
      expect(shown, `phone, ${reducedMotion}`).toEqual({ src: reducedMotion === "reduce" ? "/api/branding/logo-static" : "/api/branding/logo", fit: "contain" });
      await expect(phone.getByTestId("team-header").locator("img")).toBeHidden();
      await phone.context().close();
    }
  });
});

/** Desktop windows. From 1536px the root font size grows, and the sidebar's rail and logo with it. */
const DESKTOPS = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;

/** Across the desktop sidebar: the centres of its logo, its icons (the collapse control's and the entries') and its slot. */
const sidebarCentres = (page: Page) =>
  page.evaluate(() => {
    const mid = (e: Element) => {
      const r = e.getBoundingClientRect();
      return (r.left + r.right) / 2;
    };
    const aside = document.querySelector("[data-testid=sidebar]")!;
    const logo = aside.querySelector<HTMLImageElement>("a[title] img")!;
    return {
      logo: mid(logo),
      src: new URL(logo.currentSrc).pathname,
      icons: [...aside.querySelectorAll("[data-testid=sidebar-toggle] svg, nav a svg")].map(mid),
      slot: mid(document.querySelector("[data-testid=sidebar-slot]")!),
    };
  });

/** Freezes every running transition `ms` into it (Web Animations API). */
const freezeAt = (page: Page, ms: number) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);

test("on the desktop sidebar the logo sits on the icons' centre line, collapsed or open, at every width and while the sidebar slides", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one upload, checked on several windows below");
  test.setTimeout(180_000);
  await withLogo(page, baseURL!, async () => {
    for (const viewport of DESKTOPS) {
      for (const sidebar of ["collapsed", "expanded"] as const) {
        const at = `${viewport.width}px, ${sidebar}`;
        const p = await openPage(browser, baseURL!, "/team", "[data-testid=sidebar] a[title] img", { viewport }, { uniiverse_view: "player", uniiverse_sidebar: sidebar });
        // The pointer away from the sidebar: no preview opens over the page.
        await p.mouse.move(viewport.width - 10, viewport.height - 10);
        await expect(p.getByTestId("sidebar")).toHaveAttribute("data-collapsed", String(sidebar === "collapsed"));
        const c = await sidebarCentres(p);
        expect(c.src, `${at}: the uploaded logo`).toBe("/api/branding/logo");
        for (const icon of c.icons) expect(Math.abs(c.logo - icon), `${at}: the logo's centre ${c.logo}, an icon's ${icon}`).toBeLessThanOrEqual(0.5);
        // Collapsed, that line is the rail's centre: the logo is centred in the sidebar.
        if (sidebar === "collapsed") expect(Math.abs(c.logo - c.slot), `${at}: the logo's centre ${c.logo}, the rail's ${c.slot}`).toBeLessThanOrEqual(0.5);
        await p.context().close();
      }
    }
    // While the sidebar slides (its transitions frozen part-way), collapsing and then opening: the logo never moves.
    const p = await openPage(browser, baseURL!, "/team", "[data-testid=sidebar] a[title] img", { viewport: { width: 1440, height: 900 } }, { uniiverse_view: "player", uniiverse_sidebar: "expanded" });
    const rest = await sidebarCentres(p);
    for (const toward of ["collapsed", "open"] as const) {
      // The control's icon, which is in the rail either way.
      await p.getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
      await p.mouse.move(1430, 890);
      for (const ms of [16, 60, 110, 160, 210]) {
        await freezeAt(p, ms);
        const { logo } = await sidebarCentres(p);
        expect(Math.abs(logo - rest.logo), `${toward}, ${ms} ms in: the logo's centre ${logo}, ${rest.logo} at rest`).toBeLessThanOrEqual(0.5);
      }
      await p.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
      await expect(p.getByTestId("sidebar")).toHaveAttribute("data-collapsed", String(toward === "collapsed"));
    }
    await p.context().close();
  });
});

test("everywhere else the logo starts its row: nothing unseen stands before it, beside it or under it", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one upload, checked on several screens below");
  test.setTimeout(180_000);
  const phone = { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true };
  const desktop = { viewport: { width: 1440, height: 900 } };
  await withLogo(page, baseURL!, async () => {
    const rows = [
      { name: "the phone's top bar", path: "/team", options: phone, row: "[data-testid=mobile-topbar] a[title]" },
      { name: "the tablet's top bar", path: "/team", options: { viewport: { width: 768, height: 1024 }, hasTouch: true }, row: "[data-testid=mobile-topbar] a[title]" },
      { name: "the Team tabs", path: "/players", options: desktop, row: "[data-testid=team-tabs-identity]" },
      { name: "the public page's header", path: "/public", options: desktop, row: '[data-testid=public-header] a[href="/public"]' },
    ];
    for (const r of rows) {
      const p = await openPage(browser, baseURL!, r.path, `${r.row} img`, r.options);
      const inset = await p.locator(r.row).first().evaluate((el) => el.querySelector("img")!.getBoundingClientRect().left - el.getBoundingClientRect().left - parseFloat(getComputedStyle(el).paddingLeft));
      expect(Math.abs(inset), `${r.name}: the logo starts ${inset}px into its row`).toBeLessThanOrEqual(0.5);
      await p.context().close();
    }
    for (const options of [desktop, phone]) {
      const at = `${options.viewport.width}px`;
      // The sign-in page (as a visitor): the logo and the team's name centred together.
      const signIn = await openPage(browser, baseURL!, "/login", "[data-testid=brand-frame-block] img", options, { uniiverse_guest: "1" });
      const off = await signIn.getByTestId("brand-frame-block").evaluate((block) => {
        const img = block.querySelector("img")!;
        const row = img.closest("div")!;
        const r = row.getBoundingClientRect();
        return (img.getBoundingClientRect().left + row.querySelector(":scope > span")!.getBoundingClientRect().right) / 2 - (r.left + r.right) / 2;
      });
      expect(Math.abs(off), `${at}: the sign-in page's logo and name are ${off}px off centre`).toBeLessThanOrEqual(0.5);
      await signIn.context().close();
      // Team Overview's header, one row: nothing unseen makes it taller than what it shows (an
      // empty row under its own, as the still-frame source once added to it).
      const team = await openPage(browser, baseURL!, "/team", options === phone ? "[data-testid=mobile-topbar] img" : "[data-testid=team-header] img", options);
      // Measured once the header is in place: while the page streams in, its parts can stand in a
      // hidden container (nothing has a size there yet).
      await expect(team.getByTestId("team-header")).toBeVisible();
      const fit = await team.getByTestId("team-header").evaluate((h) => {
        // The logo's <picture> takes no box of its own (display: contents): its image is the part.
        const shown = [...h.querySelectorAll(":scope > *, :scope > picture > *")].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        return { header: h.getBoundingClientRect().height, tallest: Math.max(...shown.map((r) => r.height)) };
      });
      expect(fit.header, `${at}: the header (${fit.header}px) is as tall as its tallest part (${fit.tallest}px)`).toBeLessThanOrEqual(fit.tallest + 0.5);
      await team.context().close();
    }
  });
});
