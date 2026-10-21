import { devices, expect, test, type Browser, type BrowserContext, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  THE PLAYER CARD STUDIO WORKS BY TOUCH. A member's own Studio on a small phone, a phone held
  either way, an Android phone and a tablet (Chromium's emulation of each: touch events, a mobile
  viewport and its scale; not real devices). Every control of every section can be reached and
  tapped, with nothing over it (the preview, the section bar and the action bar included); the
  window fits the screen; sliders follow a finger; and what was changed is there when the Studio
  opens again after Save, the social links included. Phones and tablets move between sections with
  the section bar's list (studio-mobile.spec.ts covers the bar itself).
*/

test.describe.configure({ timeout: 300_000 });

const DEVICES = ["iPhone SE", "iPhone 15", "iPhone 15 landscape", "Pixel 7", "iPad Mini"] as const;

async function onDevice(browser: Browser, member: BrowserContext, name: (typeof DEVICES)[number]): Promise<{ context: BrowserContext; page: Page }> {
  // Chromium for every device: their screens, touch and scale, not their browsers.
  const { defaultBrowserType: _browser, ...descriptor } = devices[name];
  const context = await browser.newContext({ ...descriptor, storageState: await member.storageState() });
  return { context, page: await context.newPage() };
}

async function openStudio(page: Page) {
  await page.goto("/overview");
  await page.getByTestId("profile-header").getByTestId("customise-card").tap();
  await expect(page.getByTestId("card-studio")).toBeVisible();
}

/** Opens a section from the section bar's list, as a finger would. */
async function goTo(page: Page, id: string) {
  await page.getByTestId("studio-section-toggle").tap();
  await page.getByTestId(`studio-section-${id}`).tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", id);
  await expect(page.getByTestId("studio-sections")).toBeHidden();
}

/** The sections in order, as the section bar's list shows them (closed again by tapping the current one). */
async function sections(page: Page): Promise<string[]> {
  await page.getByTestId("studio-section-toggle").tap();
  const list = page.getByTestId("studio-sections");
  const ids = await list.locator("[data-testid^=studio-section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("studio-section-", "")));
  await list.locator("[aria-current=step]").tap();
  await expect(list).toBeHidden();
  return ids;
}

/** A control as a person would name it (for a report of the ones that cannot be used). */
const describe = (c: Locator) => c.evaluate((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`);

/** A finger pressed on a slider at `from` (0–1 across it) and moved to `to`. */
async function fingerDrag(page: Page, slider: Locator, from: number, to: number) {
  // Scrolled to where a finger can reach it (nothing over it), as a person would.
  await slider.tap({ trial: true });
  const b = (await slider.boundingBox())!;
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width * from;
  const x1 = b.x + b.width * to;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("every Studio control can be reached and tapped on phones and a tablet, and the window fits", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one member, checked on several devices below");
  const member = await memberContext(browser, admin, undefined, { base: "Touch", role: "Top" });
  const problems: string[] = [];
  for (const name of DEVICES) {
    const { context, page } = await onDevice(browser, member.context, name);
    await openStudio(page);
    const viewport = page.viewportSize()!;
    const win = (await page.getByTestId("card-studio-window").boundingBox())!;
    if (win.x < -1 || win.y < -1 || win.x + win.width > viewport.width + 1 || win.y + win.height > viewport.height + 1) problems.push(`${name}: the window is larger than the screen (${Math.round(win.width)}×${Math.round(win.height)} on ${viewport.width}×${viewport.height})`);
    for (const id of ["studio-cancel", "save-card-style", "studio-reset-all"]) {
      await page
        .getByTestId(id)
        .tap({ trial: true, timeout: 4000 })
        .catch((e: Error) => problems.push(`${name}: action bar ${id} cannot be tapped: ${e.message.split("\n")[0]}`));
    }
    // The section bar (previous, the list, next) and the preview's own buttons (view, Full card, Hide).
    for (const area of ["studio-section-bar", "studio-preview-pane"]) {
      const buttons = page.getByTestId(area).locator("button:visible");
      expect(await buttons.count(), `${name}: ${area} has buttons`).toBeGreaterThan(0);
      for (let i = 0; i < (await buttons.count()); i++) {
        const b = buttons.nth(i);
        if (await b.isDisabled()) continue;
        await b.tap({ trial: true, timeout: 4000 }).catch(async (e: Error) => problems.push(`${name} · ${area} · ${await describe(b)}: ${e.message.split("\n")[0]}`));
      }
    }
    const steps = await sections(page);
    expect(steps, "your own card has the Links section").toEqual(["style", "artwork", "position", "colours", "identity", "links", "effects"]);
    for (const id of steps) {
      await goTo(page, id);
      const panel = page.getByTestId(`studio-panel-${id}`);
      await expect(panel).toBeVisible();
      // Every control in the step (the champion and skin lists: the first ones). A switch's
      // checkbox is for keyboards and screen readers; a finger taps its label.
      const controls = panel.locator("button:visible, input:not([type=file]):not(.sr-only):visible, select:visible, textarea:visible, label:has(> span > input.sr-only):visible");
      const n = Math.min(await controls.count(), 48);
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i);
        if (await c.isDisabled()) continue;
        await c.tap({ trial: true, timeout: 4000 }).catch(async (e: Error) => problems.push(`${name} · ${id} · ${await describe(c)}: ${e.message.split("\n")[0]}`));
      }
    }
    await context.close();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("on a phone, each kind of control works by touch, and Save keeps it all, links included", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one member, on a phone below");
  const member = await memberContext(browser, admin, undefined, { base: "Finger", role: "Mid" });
  const { context, page } = await onDevice(browser, member.context, "iPhone SE");
  await openStudio(page);

  // Style: a choice and a frame.
  await goTo(page, "style");
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "Colours only" }).tap();
  await expect(page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "Colours only" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "Champion art" }).tap();
  // A banner of your own, chosen from the phone's pictures.
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "My banner" }).tap();
  const banner = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 500;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#2a7f62";
    ctx.fillRect(0, 0, 1200, 500);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  await page.getByTestId("banner-file").setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: Buffer.from(banner, "base64") });
  await expect(page.getByTestId("banner-panel").getByRole("button", { name: /Replace banner/ })).toBeVisible();

  // Position: a finger moves the zoom.
  await goTo(page, "position");
  const zoom = page.getByRole("slider", { name: "Zoom" });
  const before = Number(await zoom.inputValue());
  await fingerDrag(page, zoom, 0.05, 0.9);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(before);
  const zoomed = await zoom.inputValue();

  // Colours: a swatch and a typed colour.
  await goTo(page, "colours");
  await page.getByRole("radiogroup", { name: "Primary colour" }).getByRole("radio").nth(2).tap();
  await expect(page.getByRole("radiogroup", { name: "Primary colour" }).getByRole("radio").nth(2)).toHaveAttribute("aria-checked", "true");
  await page.getByRole("textbox", { name: "Primary colour: hex value" }).fill("#3aa0ff");
  await expect(page.getByLabel("Primary colour: custom")).toHaveValue("#3aa0ff");

  // Identity: the keyboard for the tagline, a tap for the emblem.
  await goTo(page, "identity");
  await page.getByTestId("tagline-input").fill("Mid or feed");
  await page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=star]").tap();

  // Links: typed, with who may see them; the preview shows the icon at once.
  await goTo(page, "links");
  await page.getByLabel("YouTube", { exact: true }).fill("youtube.com/@FingerPlays");
  await page.getByTestId("social-field-youtube").getByLabel("Who can see it").selectOption("team");
  await expect(page.getByTestId("card-preview").getByTestId("card-social-preview").locator(":scope > span")).toHaveCount(1);

  // Effects: a switch.
  await goTo(page, "effects");
  const glow = page.getByRole("switch", { name: /Ambient glow/ });
  const glowWas = await glow.isChecked();
  await page.locator("label[for=fx-glow]").tap();
  await expect(glow).toBeChecked({ checked: !glowWas });

  await page.getByTestId("save-card-style").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();

  // Opened again: everything as saved.
  await openStudio(page);
  await expect(page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "My banner" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("banner-panel").getByRole("button", { name: /Replace banner/ })).toBeVisible();
  await goTo(page, "position");
  await expect(page.getByRole("slider", { name: "Zoom" })).toHaveValue(zoomed);
  await goTo(page, "identity");
  await expect(page.getByTestId("tagline-input")).toHaveValue("Mid or feed");
  await expect(page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=star]")).toHaveAttribute("aria-checked", "true");
  await goTo(page, "links");
  await expect(page.getByLabel("YouTube", { exact: true })).toHaveValue("youtube.com/@FingerPlays");
  await expect(page.getByTestId("social-field-youtube").getByLabel("Who can see it")).toHaveValue("team");
  await goTo(page, "effects");
  await expect(page.getByRole("switch", { name: /Ambient glow/ })).toBeChecked({ checked: !glowWas });
  await goTo(page, "colours");
  await expect(page.getByLabel("Primary colour: custom")).toHaveValue("#3aa0ff");
  await context.close();
});

test("someone else's card has no Links step: links are only ever your own", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
  // The local owner (open mode) manages players and may customise any card; the links stay theirs.
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  const button = page.getByTestId("profile-header").getByTestId("customise-card");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId("card-studio")).toBeVisible();
  await expect(page.getByTestId("studio-step-links")).toHaveCount(0);
});

test("the profile picture is placed with a finger on a phone: dragged, zoomed and saved", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one member, on a phone below");
  const member = await memberContext(browser, admin, undefined, { base: "Avatar", role: "Support" });
  const { context, page } = await onDevice(browser, member.context, "iPhone SE");
  await page.goto("/overview");
  await expect(page.getByTestId("profile-header")).toBeVisible();
  // A wide picture: room to move sideways.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 900;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e02020";
    ctx.fillRect(0, 0, 800, 900);
    ctx.fillStyle = "#2040e0";
    ctx.fillRect(800, 0, 800, 900);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  const frame = page.getByTestId("avatar-crop-frame");
  await expect(async () => {
    await page.getByTestId("avatar-file").setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(frame).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const image = page.getByTestId("avatar-crop-image");
  const left = () => image.evaluate(async (el) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Number(/translate3d\(([-\d.]+)px/.exec((el as HTMLElement).style.transform)?.[1] ?? NaN);
  });
  await expect.poll(left).not.toBeNaN();
  const start = await left();
  // A finger on the picture, moved right: the picture follows (the browser's own touch events).
  await frame.tap({ trial: true });
  const b = (await frame.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 4 * i, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect.poll(left).toBeGreaterThan(start + 20);
  // The zoom follows a finger too.
  const zoom = page.getByTestId("avatar-zoom");
  const z0 = Number(await zoom.inputValue());
  await fingerDrag(page, zoom, 0.05, 0.8);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(z0);
  await page.getByTestId("avatar-save").tap();
  await expect(frame).toBeHidden();
  await expect(page.getByTestId("profile-header").locator("img[src*='/api/avatars/']").first()).toBeVisible();
  await context.close();
});
