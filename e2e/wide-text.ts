import type { Page } from "@playwright/test";

/*
  Wider text, as CI's browser draws it (Release 19). GitHub's runners use a slightly newer Chromium
  than this container's, and it sets text about 0.5% wider: two one-screen specs of Release 18 passed
  here and failed there by a pixel or two (STATUS.md, Release 18's follow-ups). A spec that holds a
  layout to a margin ("one screen", "fits", a row's height) runs a pass with every glyph 1% of its size
  wider (`letter-spacing: 0.01em` on the root, inherited as a length: twice CI's difference), so a
  layout that passes here with it passes there.

  The style goes in before the page's own scripts run (an init script, on every page the tab opens
  from then on, in the document's head, which React's hydration leaves alone), so a measured layout
  (a fitted list, a folded pool) is measured with the wider text from the first paint.
*/

/** Each glyph's extra width: 1% of the text's size (CI's browser: about 0.5%). */
export const WIDE_TEXT = "0.01em";

/** From now on, every page this tab opens draws its text `spacing` wider; the page already open too. */
export async function widenText(page: Page, spacing: string = WIDE_TEXT): Promise<void> {
  const css = `html{letter-spacing:${spacing}!important}`;
  await page.addInitScript((rule: string) => {
    const add = () => {
      if (!document.head || document.head.querySelector("style[data-e2e-wide-text]")) return !!document.head;
      const style = document.createElement("style");
      style.setAttribute("data-e2e-wide-text", "");
      style.textContent = rule;
      document.head.appendChild(style);
      return true;
    };
    if (!add()) {
      const watch = new MutationObserver(() => {
        if (add()) watch.disconnect();
      });
      watch.observe(document, { childList: true, subtree: true });
    }
  }, css);
  await page.evaluate((rule: string) => {
    if (!document.head || document.head.querySelector("style[data-e2e-wide-text]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-e2e-wide-text", "");
    style.textContent = rule;
    document.head.appendChild(style);
  }, css);
}

/** Whether the page draws the wider text (a spec says so in its messages). */
export const isWide = (page: Page) => page.evaluate(() => !!document.querySelector("style[data-e2e-wide-text]"));
