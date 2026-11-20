import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";
import { ready, SELECT_LOOK, selectLook } from "./select";

/*
  The one Select of the toolbars (src/components/ui/select.tsx; PLAN S4a, container 4): the app's
  popover where previews open beside the list, the browser's own select in the phone posture. Its
  keyboard, its closing rules, its accessibility and its size at 200% text are the component's own,
  the same on every page, so they are checked once here on the desktop, and the phone posture once
  on the phone. The pages' own choices are checked by their specs (through e2e/select.ts).
*/

async function teammate(page: Page): Promise<string> {
  await page.goto("/team");
  return `/players/${(await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!}`;
}

test("the toolbar Select: opens, moves, types ahead and chooses from the keyboard, closes as a popover does, and the address keeps the choice", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the component's behaviour, the same at every width it shows; the phone keeps its own picker (below)");
  const profile = await teammate(page);
  await page.goto(profile);
  const mode = page.locator("#overview-mode");
  // Its look, closed and open: the figures WebKit must draw too (webkit.spec.ts).
  expect(await selectLook(mode)).toEqual(SELECT_LOOK);
  await expect(mode).toHaveAttribute("role", "combobox");
  await expect(mode).toHaveAccessibleName("Game mode");
  await expect(mode).toHaveAttribute("aria-expanded", "false");
  const list = page.getByRole("listbox", { name: "Game mode" });

  // A click opens it under the button, the current choice marked; no dimming, no address of its own.
  const before = page.url();
  await mode.click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(before);
  await expect(list.getByRole("option", { selected: true })).toHaveAttribute("data-value", await mode.getAttribute("data-value") as string);
  const b = (await mode.boundingBox())!;
  const l = (await list.boundingBox())!;
  expect(Math.round(l.y - (b.y + b.height)), "just under its button").toBeGreaterThanOrEqual(0);
  expect(Math.round(l.y - (b.y + b.height))).toBeLessThanOrEqual(8);
  expect(l.width).toBeGreaterThanOrEqual(Math.floor(b.width));
  // Its look: bg-elevated, a border and a shadow.
  const look = await list.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopWidth, shadow: s.boxShadow, animation: s.animationName };
  });
  expect(look.border).toBe("1px");
  expect(look.shadow).not.toBe("none");
  expect(look.animation).toBe("popover-in");
  // axe, with the list open.
  const scan = await new AxeBuilder({ page }).include("[data-testid=overview-filters], [data-select-list]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  // Escape closes it and the focus stays on the button; an outside press closes it too.
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(mode).toBeFocused();
  await mode.click();
  await expect(list).toBeVisible();
  await page.mouse.click(5, 450);
  await expect(list).toHaveCount(0);

  // The keyboard: Enter opens; Home, End and the arrows move the active option; type-ahead finds one.
  await mode.focus();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  const active = async () => page.evaluate(() => document.getElementById(document.activeElement!.getAttribute("aria-activedescendant") ?? "")?.getAttribute("data-value") ?? null);
  await page.keyboard.press("Home");
  expect(await active()).toBe("all");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("solo");
  await page.keyboard.press("End");
  const last = await active();
  expect(last).not.toBe("solo");
  await page.keyboard.press("ArrowDown");
  expect(await active(), "the arrows stop at the end").toBe(last);
  await page.keyboard.type("ranked f");
  expect(await active()).toBe("flex");
  // Enter chooses: the list closes, the focus is on the button, and the address holds the choice,
  // replacing the history entry as the native select did.
  const length = await page.evaluate(() => history.length);
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(page).toHaveURL(/mode=flex/);
  await expect(mode).toHaveAttribute("data-value", "flex");
  await expect(mode).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(length);
  // Space opens, and Space chooses.
  await page.keyboard.press(" ");
  await expect(list).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press(" ");
  await expect(page).toHaveURL((u) => !u.searchParams.has("mode") || u.searchParams.get("mode") === "all");

  // The button leaving the screen closes it; a scroll that keeps it in view moves the list with it.
  // (Room to scroll: the demo's Overview is barely taller than a desktop's window. Added once the
  // choice above has loaded, so the page's update does not take it away.)
  await expect(mode).not.toHaveAttribute("aria-disabled", "true");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.querySelector("main")!.insertAdjacentHTML("beforeend", '<div style="height:3000px" aria-hidden="true"></div>'));
  await mode.click();
  await expect(list).toBeVisible();
  // The wheel turned over the page, not over the list (which scrolls by itself, and keeps its scroll).
  await page.mouse.move(500, 700);
  await page.mouse.wheel(0, 40);
  await expect(list).toBeVisible();
  await expect.poll(async () => Math.round((await list.boundingBox())!.y - ((await mode.boundingBox())!.y + (await mode.boundingBox())!.height))).toBeLessThanOrEqual(8);
  await page.mouse.wheel(0, 3000);
  await expect(list).toHaveCount(0);
});

test("the toolbar Select at 200% text: every option whole and inside the screen, the list scrolling inside when it must, and no motion with reduced motion", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the component's own sizing");
  const profile = await teammate(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(profile);
  const mode = page.locator("#overview-mode");
  await ready(mode);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await mode.scrollIntoViewIfNeeded();
  await mode.click();
  const list = page.getByRole("listbox", { name: "Game mode" });
  await expect(list).toBeVisible();
  const facts = await list.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const options = [...el.querySelectorAll<HTMLElement>("[role=option]")];
    return {
      inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
      clipped: options.filter((o) => { const t = o.querySelector("span")!; return t.scrollWidth > t.clientWidth + 1; }).map((o) => o.textContent),
      short: options.filter((o) => o.getBoundingClientRect().height < 36).length,
      animation: parseFloat(getComputedStyle(el).animationDuration) * 1000,
    };
  });
  expect(facts.inside).toBe(true);
  expect(facts.clipped).toEqual([]);
  expect(facts.short).toBe(0);
  expect(facts.animation).toBeLessThan(1);
});

test("on a phone, the Select is the browser's own select, with the phone's own picker", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone posture");
  const profile = await teammate(page);
  await page.goto(`${profile}/champions`);
  const sort = page.locator("#all-champions-sort-by");
  await ready(sort);
  expect(await sort.evaluate((el) => el.tagName)).toBe("SELECT");
  // Drawn with the app's own chevron, not the system arrow (the design review's G2-6), its text clear of it.
  expect(await sort.evaluate((el) => { const s = getComputedStyle(el); return [s.appearance, s.backgroundImage.startsWith("url("), parseFloat(s.paddingRight) >= 28]; })).toEqual(["none", true, true]);
  await sort.selectOption("games");
  await expect(sort).toHaveValue("games");
});

test("without JavaScript, a form's Select is the browser's own select, so the Overview's filters form still carries the choice", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the server's own markup, the same at every width");
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await ctx.newPage();
  await page.goto("/team");
  const id = await page.locator("[data-testid=lineup-row-MID]").first().getAttribute("data-player-id");
  await page.goto(`/players/${id}`);
  const mode = page.locator("form[method=get] select#overview-mode");
  await expect(mode).toHaveCount(1);
  await expect(mode).toHaveAttribute("name", "mode");
  await expect(page.locator("form[method=get] input[type=hidden][name=mode]")).toHaveCount(0);
  await ctx.close();
});

test("on a touch tablet, a tapped option is chosen and the focus goes back to the Select's button", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a touch screen where the app's popover shows (768px wide)");
  const profile = await teammate(page);
  await page.goto(profile);
  const mode = page.locator("#overview-mode");
  await ready(mode);
  await mode.tap();
  const list = page.getByRole("listbox", { name: "Game mode" });
  await expect(list).toBeVisible();
  const option = list.getByRole("option").nth(1);
  const label = (await option.textContent())!.trim();
  await option.tap();
  await expect(list).toBeHidden();
  await expect(mode).toContainText(label);
  await expect(mode).toBeFocused();
});
