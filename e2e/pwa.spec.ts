import { expect, test } from "./test";

/*
  UNIIVERSE installs like an app (manifest.ts, public/sw.js). The manifest and icons are public;
  the service worker only replaces the browser's offline error with a small offline page and keeps
  nothing else on the device.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "the same files on every screen size"));

test("the manifest, icons and service worker are served to anyone, and pages link the manifest", async ({ request, page }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as { name: string; display: string; start_url: string; icons: Array<{ src: string; sizes: string }> };
  expect(manifest.name).toBeTruthy();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toBe("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/offline.html")).status()).toBe(200);
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
});

test("offline, a page shows the offline notice instead of the browser's error, and nothing else is cached", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/team");
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 15_000 });
  await context.setOffline(true);
  await page.goto("/players").catch(() => undefined);
  await expect(page.getByTestId("offline-page")).toBeVisible();
  await context.setOffline(false);
  // The offline page reloads itself once back online; that reload finishes before the next
  // navigation, which it would otherwise abort.
  await expect(page.getByTestId("offline-page")).toHaveCount(0);
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/team");
  await expect(page.getByTestId("offline-page")).toHaveCount(0);
  await expect(page.locator("main")).toBeVisible();
  const cached = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) paths.push(new URL(req.url).pathname);
    return paths;
  });
  expect(cached).toEqual(["/offline.html"]);
});
