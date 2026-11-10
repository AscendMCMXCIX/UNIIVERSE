import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from "./test";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Install App (components/install, domain/install-guide): one entry beside Settings, in the
  sidebar and the phone menu, opening one small window that installs the app the way this
  browser can. Chromium's install offer (beforeinstallprompt) is dispatched here the way the
  browser fires it; the browser's own install dialog cannot be driven from a test, so its answer
  (accepted or dismissed) is given by the offer. Other browsers are told apart by their user
  agents (Chromium emulation, not those browsers or devices).
*/

test.describe.configure({ timeout: 120_000 });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "each test opens the devices it needs"));

const PLAYER = { name: "uniiverse_view", value: "player" };
const UA = {
  // Playwright's iPhone descriptors carry its own WebKit's Safari version (27), not the iOS one.
  iphone17: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphone26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.30.97 (iPhone15,2; iOS 17_5; en_GB; en; scale=3.00; 1179x2556)",
};

async function open(browser: Browser, baseURL: string, options: BrowserContextOptions, init?: () => void) {
  const context = await browser.newContext(options);
  await context.addCookies([{ ...PLAYER, url: baseURL }]);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto("/team");
  await expect(page.locator("main")).toBeVisible();
  return { context, page };
}

/** The browser's install offer, as Chromium fires it, answering `outcome` when shown. */
async function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((answer) => {
    const offer = new Event("beforeinstallprompt", { cancelable: true });
    const w = window as unknown as { __promptShown: number };
    w.__promptShown = 0;
    Object.assign(offer, { prompt: async () => void (w.__promptShown += 1), userChoice: Promise.resolve({ outcome: answer, platform: "web" }) });
    window.dispatchEvent(offer);
  }, outcome);
}

/** Phones: the account screen behind the avatar (docs/MOBILE.md); tablets: the menu drawer. */
const phoneWidth = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
const menuOf = (page: Page) => page.locator(phoneWidth(page) ? "[data-testid=account-sheet]" : "#mobile-drawer");
/** The button that opens it, where focus returns once Install App's window closes. */
const menuButton = (page: Page) => (phoneWidth(page) ? page.getByTestId("account-sheet-button") : page.getByRole("button", { name: "Open menu" }));

/** The entry in the phone's account screen or the tablet menu (the sidebar is not shown below desktop width). */
async function drawerEntry(page: Page) {
  await expect(async () => {
    if (!(await menuOf(page).isVisible())) await menuButton(page).click({ timeout: 2_000 });
    await expect(menuOf(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  return menuOf(page).getByTestId("install-app");
}

async function productName(page: Page) {
  return ((await (await page.request.get("/manifest.webmanifest")).json()) as { name: string }).name;
}

test("desktop: Install App sits by the account menu; with the browser's offer, Install shows its dialog, then the entry goes", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 } });
  const sidebar = page.locator("aside");
  const entry = sidebar.getByTestId("install-app");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAccessibleName("Install App");
  // Beside Settings: right above the account menu, which holds Settings.
  const order = await sidebar.evaluate((el) => {
    const all = [...el.querySelectorAll("[data-testid=install-app], [data-testid=account-menu-button]")];
    return all.map((e) => e.getAttribute("data-testid"));
  });
  expect(order).toEqual(["install-app", "account-menu-button"]);

  await offerInstall(page, "accepted");
  await entry.click();
  const win = page.getByTestId("install-window");
  await expect(win).toBeVisible();
  // The window is named after the app as Branding names it (the manifest's name).
  await expect(win.getByRole("heading")).toHaveText(`Install ${await productName(page)}`);
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-phase", "offer");
  const install = win.getByTestId("install-confirm");
  await expect(install).toBeFocused();
  await install.click();
  await expect(win.getByTestId("install-status")).toContainText("Installed.");
  expect(await page.evaluate(() => (window as unknown as { __promptShown: number }).__promptShown)).toBe(1);
  await win.getByTestId("install-done").click();
  await expect(win).toBeHidden();
  // Installed from this tab: nothing left to install.
  await expect(sidebar.getByTestId("install-app")).toHaveCount(0);
  await context.close();
});

test("desktop: a dismissed offer is not wasted; the browser's own way is shown, and the entry stays", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 }, userAgent: UA.windowsEdge });
  await offerInstall(page, "dismissed");
  const entry = page.locator("aside").getByTestId("install-app");
  await entry.click();
  const win = page.getByTestId("install-window");
  await win.getByTestId("install-confirm").click();
  await expect(win.getByTestId("install-status")).toHaveText("Not installed. You can still install it this way:");
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-guide", "desktop");
  await expect(win.getByTestId("install-steps")).toContainText("App available");
  await expect(win.getByTestId("install-steps")).toContainText("Install this site as an app");
  await expect(win.getByTestId("install-confirm")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  // Focus returns to the entry, which is still there (nothing was installed).
  await expect(entry).toBeFocused();
  // Without an offer (it can be used once), the window shows the steps and no Install button.
  await entry.press("Enter");
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-phase", "ready");
  await expect(win.getByTestId("install-confirm")).toHaveCount(0);
  await context.close();
});

test("desktop: an install made with the browser's own address-bar button hides the entry", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 } });
  await expect(page.locator("aside").getByTestId("install-app")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.locator("aside").getByTestId("install-app")).toHaveCount(0);
  // A new page load in the browser forgets it: nothing is stored that could be wrong elsewhere.
  await page.reload();
  await expect(page.locator("aside").getByTestId("install-app")).toBeVisible();
  await context.close();
});

test("inside the installed app there is nothing to install: no entry, before or after the page's code runs", async ({ browser, baseURL }) => {
  // Chromium's display mode, as the installed app has it.
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 } }, () => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("display-mode") ? ({ ...real(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : real(q));
  });
  await expect(page.locator("aside").getByTestId("install-app")).toHaveCount(0);
  await context.close();
  // Before the page's code runs, the stylesheet hides it in every display mode an installed app
  // opens in. (The test browser cannot be put in those modes, so the rules themselves are read.)
  const css = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 } });
  const modes = await css.page.locator("aside").getByTestId("install-app").evaluate((el) => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList, media: string | null) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
        else if (rule instanceof CSSStyleRule) {
          if (media?.includes("display-mode") && el.matches(rule.selectorText) && rule.style.display === "none") found.push(media.replace(/\s+/g, ""));
        } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, media);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, null);
    return found.sort();
  });
  expect(modes).toEqual(["(display-mode:fullscreen)", "(display-mode:minimal-ui)", "(display-mode:standalone)", "(display-mode:window-controls-overlay)"]);
  await css.context.close();
  // iPhone and iPad: opened from the Home Screen.
  const ios = await open(browser, baseURL!, { ...devices["iPhone 15"] }, () => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
  await drawerEntry(ios.page);
  await expect(menuOf(ios.page).getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(menuOf(ios.page).getByTestId("install-app")).toHaveCount(0);
  await ios.context.close();
});

test("iPhone, Safari: Install App in the account screen closes it and shows Share → Add to Home Screen, no Install button", async ({ browser, baseURL }) => {
  for (const [label, options, webApp] of [
    ["iOS 17", { ...devices["iPhone 15"], userAgent: UA.iphone17 }, false],
    ["iOS 26", { ...devices["iPhone 15"], userAgent: UA.iphone26 }, true],
  ] as const) {
    const { context, page } = await open(browser, baseURL!, options);
    // Safari makes no install offer: even a stray one could not make a button that does nothing here.
    const entry = await drawerEntry(page);
    await entry.click();
    await expect(menuOf(page)).toHaveCount(0);
    const win = page.getByTestId("install-window");
    await expect(win.getByTestId("install-body")).toHaveAttribute("data-guide", "ios");
    const steps = win.getByTestId("install-steps").locator("li");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Share");
    await expect(steps.nth(1)).toContainText("Add to Home Screen");
    if (webApp) {
      // iOS 26: Share is in the More menu, and the sheet's Open as Web App switch stays on.
      await expect(steps.nth(0)).toContainText("More beside the address bar, then Share.");
      await expect(steps.nth(1)).toContainText("View More");
      await expect(steps.nth(2)).toContainText("Leave Open as Web App on, then tap Add.");
    } else {
      await expect(steps.nth(0)).toContainText("Share at the bottom of the screen.");
      await expect(steps.nth(1)).toContainText("Scroll down if you don't see it.");
      await expect(steps.nth(2)).toContainText("Tap Add.");
      await expect(steps.nth(2)).not.toContainText("Open as Web App");
    }
    await expect(win.getByTestId("install-confirm")).toHaveCount(0);
    // It fits the phone, portrait, and every step is readable without scrolling sideways.
    const box = (await win.boundingBox())!;
    expect(box.x, label).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, label).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    await win.getByTestId("install-done").click();
    await expect(win).toBeHidden();
    // Back where the person was: on the button that opened the menu (the menu itself has closed).
    await expect(menuButton(page)).toBeFocused();
    await context.close();
  }
});

test("iPhone, other browsers and in-app browsers: their own route, a way to Safari, and a copyable link", async ({ browser, baseURL }) => {
  const chrome = await open(browser, baseURL!, { ...devices["iPhone 15"], userAgent: UA.iphoneChrome });
  await (await drawerEntry(chrome.page)).click();
  let win = chrome.page.getByTestId("install-window");
  await expect(win.getByTestId("install-steps")).toContainText("Share in the address bar");
  await expect(win).toContainText("Open this page in Safari");
  await expect(win.getByTestId("install-copy-link")).toBeVisible();
  await chrome.context.close();

  const insta = await open(browser, baseURL!, { ...devices["iPhone 15"], userAgent: UA.instagram });
  await (await drawerEntry(insta.page)).click();
  win = insta.page.getByTestId("install-window");
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-guide", "in-app");
  await expect(win).toContainText("Instagram's built-in browser, which can't install apps");
  await expect(win.getByTestId("install-confirm")).toHaveCount(0);
  await insta.context.close();
});

test("iPad: the iPad's Share button, also when Safari presents the iPad as a Mac", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1180, height: 820 }, hasTouch: true, userAgent: UA.ipadDesktop }, () =>
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }),
  );
  await page.locator("aside").getByTestId("install-app").click();
  const win = page.getByTestId("install-window");
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-guide", "ios");
  await expect(win.getByTestId("install-steps").locator("li").first()).toContainText("Tap Share at the top right.");
  await context.close();
});

test("Android: Install shows the browser's dialog when offered; otherwise the menu's own words, per browser", async ({ browser, baseURL }) => {
  const pixel = { ...devices["Pixel 7"], userAgent: UA.android };
  const offered = await open(browser, baseURL!, pixel);
  await offerInstall(offered.page, "accepted");
  await (await drawerEntry(offered.page)).click();
  const win = offered.page.getByTestId("install-window");
  await expect(win).toContainText("Adds it to your home screen.");
  await win.getByTestId("install-confirm").click();
  await expect(win.getByTestId("install-status")).toContainText(/Installed\. .+ is on your home screen\./);
  await offered.context.close();

  const samsung = await open(browser, baseURL!, { ...pixel, userAgent: UA.samsung });
  await (await drawerEntry(samsung.page)).click();
  const steps = samsung.page.getByTestId("install-window").getByTestId("install-steps");
  await expect(steps).toContainText("Add page to, then Home screen");
  await expect(samsung.page.getByTestId("install-confirm")).toHaveCount(0);
  await samsung.context.close();
});

test("Firefox on a computer: an honest alternative (Edge or Chrome), the link to copy, and a bookmark is not an app", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { viewport: { width: 1440, height: 900 }, userAgent: UA.firefox, permissions: ["clipboard-read", "clipboard-write"] });
  await page.locator("aside").getByTestId("install-app").click();
  const win = page.getByTestId("install-window");
  await expect(win).toContainText("Firefox doesn't install web apps.");
  await expect(win.getByTestId("install-steps")).toContainText("Microsoft Edge or Google Chrome");
  await expect(win).toContainText("isn't an installed app");
  await win.getByTestId("install-copy-link").click();
  await expect(win.getByTestId("install-copy-link")).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/", baseURL!).toString());
  await context.close();
});

test("the window is accessible and fits phones held either way", async ({ browser, baseURL }) => {
  for (const options of [{ viewport: { width: 1440, height: 900 } }, { ...devices["iPhone 15"] }, { ...devices["iPhone 15 landscape"] }, { ...devices["Pixel 7"], userAgent: UA.android }]) {
    const { context, page } = await open(browser, baseURL!, options);
    const desktop = (options.viewport?.width ?? 0) >= 1024;
    await (desktop ? page.locator("aside").getByTestId("install-app") : await drawerEntry(page)).click();
    const win = page.getByTestId("install-window");
    await expect(win).toBeVisible();
    const box = (await win.boundingBox())!;
    const view = page.viewportSize()!;
    expect(box.x + box.width).toBeLessThanOrEqual(view.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height + 0.5);
    const scan = await new AxeBuilder({ page }).include("[data-testid=install-window]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await context.close();
  }
});

test("iPhone and iPad take the Home Screen name from Branding, as Android does from the manifest", async ({ page }) => {
  await page.goto("/login");
  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as { short_name: string };
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", manifest.short_name);
});
