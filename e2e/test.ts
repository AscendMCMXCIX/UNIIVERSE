import { test as base, expect } from "@playwright/test";

export * from "@playwright/test";

/*
  Every browser test also fails on an uncaught error in its pages: a crash, or React failing to
  hydrate the server's HTML (it then throws that part of the page away and draws it again), even
  when the test's own checks pass. A hydration mismatch shows no symptom a test would look for, so
  without this it goes unnoticed (it happened on Settings). A test that expects such an error opts
  out with test.use({ pageErrors: "allow" }). Pages of contexts a test opens itself
  (browser.newContext) are not watched.
*/
export const test = base.extend<{ pageErrors: "fail" | "allow" }>({
  pageErrors: ["fail", { option: true }],
  context: async ({ context, pageErrors }, run) => {
    const errors: string[] = [];
    if (pageErrors === "fail") context.on("page", (page) => page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`)));
    await run(context);
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});
