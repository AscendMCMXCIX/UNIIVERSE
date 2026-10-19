import { expect, test } from "@playwright/test";

/*
  Every response carries the site-wide security headers (next.config.ts): pages can be framed
  only by UNIIVERSE itself, content types are not sniffed, and the browser's camera, microphone
  and location stay off. The page policy is not sent on API routes, so the routes serving stored
  images keep their own stricter one (Next would otherwise keep the site-wide header over theirs).
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "the same headers on every screen size"));

test("pages and API routes send the security headers", async ({ request }) => {
  for (const path of ["/", "/login", "/team", "/api/health"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("SAMEORIGIN");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    if (path.startsWith("/api/")) expect(h["content-security-policy"], path).toBeUndefined();
    else {
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'self'");
      expect(h["content-security-policy"], path).toContain("object-src 'none'");
    }
  }
});

test("the admin preview studio can still frame the app's own pages", async ({ page }) => {
  // No view cookie: the local owner opens in Admin Mode.
  await page.goto("/admin/previews");
  await expect(page.getByTestId("preview-frame")).toBeVisible();
  await expect(page.frameLocator('[data-testid="preview-frame"]').locator("body")).not.toBeEmpty();
});
