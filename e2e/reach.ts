import { expect, type Locator, type Page } from "./test";

/*
  Controls a pointer can reach: the point at a control's centre hits the control itself (or what is
  inside it), never something drawn over it. Under 768px the page has the phone's frame (its top bar,
  `mobile-topbar`, and tab bar, `phone-tabbar`): a docked panel or an inline game's pinned controls
  there sat under those bars with a mouse (640–767px, before 20 Nov 2026), so a window opens instead.
*/

/** Windows of 640–767px with a mouse, where the phone's frame meets a mouse (the review's two sizes). */
export const NARROW_MOUSE_WINDOWS = [
  { width: 700, height: 900 },
  { width: 760, height: 1000 },
] as const;

/** What the point at the centre of `control` hits: "itself", or the test id (or tag) of what covers it. */
export const hitAtCentre = (control: Locator) =>
  control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && (hit === el || el.contains(hit))) return "itself";
    return hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing";
  });

/** Every control in reach of a pointer, inside the screen. */
export async function expectInReach(page: Page, controls: Locator[]) {
  const { width, height } = page.viewportSize()!;
  for (const control of controls) {
    await expect(control).toBeVisible();
    await expect.poll(() => hitAtCentre(control)).toBe("itself");
    const box = (await control.boundingBox())!;
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, "inside the screen").toBe(true);
  }
}
