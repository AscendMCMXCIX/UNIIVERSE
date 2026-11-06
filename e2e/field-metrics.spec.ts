import { expect, test } from "./test";

/*
  FIELD PERFORMANCE (docs/MONITORING.md). A signed-in page reports its own load, reduced to buckets
  with only the page group and the device class, once, when it is hidden; Admin → System Health
  shows the counts. The beacon never carries an address, an id or a measured value.
*/

test("a page load is counted by page group and device class, and System Health shows it", async ({ browser, page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once; the phone class is set by the window width below");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  const sent: string[] = [];
  phone.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/vitals") sent.push(r.postData() ?? "");
  });
  await phone.goto("/players");
  await expect(phone.getByRole("heading", { level: 1 })).toBeVisible();
  await phone.waitForLoadState("load");
  // Switching away from the tab hides the page: that is when it reports.
  await phone.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  const beacon = JSON.parse(sent[0]!) as { page: string; device: string; metrics: Record<string, number> };
  expect(beacon.page).toBe("players");
  expect(beacon.device).toBe("phone");
  expect(Object.keys(beacon).sort()).toEqual(["device", "metrics", "page"]);
  expect(Object.keys(beacon.metrics).length).toBeGreaterThan(0);
  for (const [name, bucket] of Object.entries(beacon.metrics)) {
    expect(["LCP", "CLS", "INP", "FCP", "TTFB", "REDIRECT", "SERVER"]).toContain(name);
    expect(Number.isInteger(bucket)).toBe(true);
  }
  // Opened directly: the request's own time, and no redirect.
  expect(beacon.metrics.SERVER).toEqual(expect.any(Number));
  expect(beacon.metrics.REDIRECT).toBeUndefined();
  await context.close();

  await page.goto("/admin/system");
  const panel = page.getByTestId("field-performance");
  await expect(panel).toContainText("Page speed in members' browsers");
  await expect(panel).toContainText("not a lab test");
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("field-page-players")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("pages outside the app send nothing", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
  const context = await browser.newContext();
  await context.addCookies([{ name: "uniiverse_guest", value: "1", url: info.project.use.baseURL! }]);
  const guest = await context.newPage();
  const sent: string[] = [];
  guest.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/vitals") sent.push(r.url());
  });
  await guest.goto("/privacy");
  await expect(guest.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await guest.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await guest.waitForTimeout(500);
  expect(sent).toEqual([]);
  await context.close();
});

test("opening the app at its start page reports the redirect as part of TTFB", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
  const context = await browser.newContext();
  const tab = await context.newPage();
  const sent: string[] = [];
  tab.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/vitals") sent.push(r.postData() ?? "");
  });
  // "/" looks up the session and redirects to the account's start page, as the installed app does.
  await tab.goto("/");
  await expect.poll(() => new URL(tab.url()).pathname).not.toBe("/");
  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();
  await tab.waitForLoadState("load");
  await tab.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  const beacon = JSON.parse(sent[0]!) as { metrics: Record<string, number> };
  expect(beacon.metrics.REDIRECT).toEqual(expect.any(Number));
  expect(beacon.metrics.SERVER).toEqual(expect.any(Number));
  await context.close();
});
