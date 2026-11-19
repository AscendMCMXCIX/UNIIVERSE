import { expect, test, type Page } from "./test";

/*
  The public page's header with larger text on a phone (in-memory demo: the local owner is signed in,
  so the header ends in "Open the app"; a visitor's ends in "Sign in"). Its links (Team, Install App,
  Open the app) are wider in rem than a phone's header once the text grows: they ran past the screen,
  42px at 150% on a 320px phone and 163px at 200%, and at 125% the team's mark sat under "Team". The
  header now wraps: the links keep the mark's line while they fit beside it, and otherwise take lines
  of their own under the mark and the team's name, on the right. At 125% to 200% on 320 to 414px
  phones: no sideways scroll, every part of the header inside it, none over another, every link's
  label whole. At the usual size the header is the one line it was.
*/

const SIZES = [320, 360, 375, 393, 414].flatMap((width) => [125, 150, 175, 200].map((root) => [width, root] as const));

// Against the layout viewport's width: a phone's (isMobile) window grows with what spills past it, so innerWidth would hide it.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The header's parts, measured in one frame: whatever is wrong with them, and whether the links share the mark's line. */
function headerFacts(page: Page) {
  return page.getByTestId("public-header").evaluate((header) => {
    const problems: string[] = [];
    const hb = header.getBoundingClientRect();
    const cs = getComputedStyle(header);
    const inner = { left: hb.left + parseFloat(cs.paddingLeft) - 0.5, right: hb.right - parseFloat(cs.paddingRight) + 0.5 };
    const brand = header.querySelector(":scope > a")!;
    const mark = brand.firstElementChild!;
    const nav = header.querySelector("nav")!;
    const links = [...nav.children].filter((el) => el.getBoundingClientRect().width > 0);
    const name = (el: Element) => (el === mark ? "the mark" : `"${el.textContent?.trim() || el.getAttribute("data-testid")}"`);
    for (const el of [mark, ...links]) {
      const b = el.getBoundingClientRect();
      if (b.left < inner.left || b.right > inner.right) problems.push(`${name(el)} outside the header (${Math.round(Math.max(inner.left - b.left, b.right - inner.right))}px)`);
      if (el !== mark && el.scrollWidth > el.clientWidth + 1) problems.push(`${name(el)} cut short`);
    }
    const parts = [mark, ...links];
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [parts[i]!.getBoundingClientRect(), parts[j]!.getBoundingClientRect()];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) problems.push(`${name(parts[i]!)} over ${name(parts[j]!)}`);
      }
    const mb = mark.getBoundingClientRect();
    const besideMark = links.every((el) => {
      const b = el.getBoundingClientRect();
      return b.top < mb.bottom && b.bottom > mb.top;
    });
    return { problems, links: links.length, besideMark };
  });
}

for (const who of ["member", "visitor"] as const) {
  test(`the public page's header for a ${who} at 125% to 200% text on 320 to 414px phones: no sideways scroll, every link inside the header, whole and clear of the mark; at 100% one line`, async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "phone", "phone widths, set below");
    test.setTimeout(120_000);
    // A browser without a session is the demo's local owner, a member; the guest cookie makes it a visitor.
    if (who === "visitor") await context.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
    await page.goto("/public");
    await expect(page.getByTestId(who === "member" ? "public-open-app" : "public-sign-in")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 375, 393]) {
      await page.setViewportSize({ width, height: 700 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const facts = await headerFacts(page);
      expect(facts.problems, `${width}px at 100%`).toEqual([]);
      expect(facts.besideMark, `${width}px at 100%: the links on the mark's line`).toBe(true);
      expect(await overflow(page), `${width}px at 100%: no sideways scroll`).toBeLessThanOrEqual(0);
    }
    for (const [width, root] of SIZES) {
      await page.setViewportSize({ width, height: 700 });
      await page.evaluate((r) => {
        document.documentElement.style.fontSize = `${r}%`;
      }, root);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const at = `${width}px at ${root}%`;
      const facts = await headerFacts(page);
      expect(facts.links, `${at}: the header's links`).toBeGreaterThanOrEqual(2);
      expect(facts.problems, at).toEqual([]);
      expect(await overflow(page), `${at}: no sideways scroll`).toBeLessThanOrEqual(0);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  });
}
