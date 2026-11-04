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
  context: async ({ context, pageErrors, browserName, baseURL }, run) => {
    const errors: string[] = [];
    const counts = (e: Error) => !(browserName === "webkit" && ownLoadCutShort(e, baseURL));
    if (pageErrors === "fail") context.on("page", (page) => page.on("pageerror", (e) => counts(e) && errors.push(`${page.url()}: ${e.message}`)));
    await run(context);
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});

/*
  Playwright's WebKit reports every error WebKit writes to the console as a page error, not only
  uncaught ones (it splits the text at the first colon: name "Fetch API cannot load http", message
  "/127.0.0.1:3199/… due to access control checks."). WebKit writes that line when a test's next
  page.goto cuts short a load of the page it leaves, such as a link's prefetch or the service
  worker's script. Access control never applies to the site's own address, so such a line is not
  an error in the page. The same line for any other address still fails the test.
*/
function ownLoadCutShort(e: Error, baseURL: string | undefined): boolean {
  if (!baseURL || !/cannot load https?$/i.test(e.name)) return false;
  return e.message.startsWith(`/${new URL(baseURL).host}/`) && e.message.endsWith(" due to access control checks.");
}
