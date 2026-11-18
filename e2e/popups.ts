import { expect, type Locator, type Page } from "./test";

/*
  Popups over and inside windows: what e2e/popups.spec.ts (Chromium: phone, tablet, desktop) and
  e2e/webkit.spec.ts (Safari's engine) share. A window is a modal <dialog> in the browser's top
  layer; what must show over it (an ⓘ's bubble, the toasts) is drawn inside it
  (src/components/ui/top-layer.ts).
*/

export const touches = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

/** A tap on a touch screen, a click with a mouse. */
export async function press(page: Page, target: Locator, options: { timeout?: number } = {}) {
  if (await touches(page)) await target.tap(options);
  else await target.click(options);
}

/** A picture made in the page (left half red, right half blue), as a PNG file to choose. */
export async function picture(page: Page) {
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e02020";
    ctx.fillRect(0, 0, 160, 240);
    ctx.fillStyle = "#2040e0";
    ctx.fillRect(160, 0, 160, 240);
    return c.toDataURL("image/png");
  });
  return { name: "picture.png", mimeType: "image/png", buffer: Buffer.from(data.split(",")[1]!, "base64") };
}

export const NOT_A_PICTURE = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") };
/** The error a file that is not a picture raises in the picture editor (avatar-upload.tsx). */
export const NOT_A_PICTURE_ERROR = "Use a PNG, JPEG or WebP picture.";

/**
 * Settings' picture editor, opened by choosing a picture, and at rest. A file chosen before the page
 * is interactive is ignored: it is chosen again until the editor opens.
 */
export async function openPictureEditor(page: Page): Promise<Locator> {
  await page.goto("/settings");
  const win = page.getByRole("dialog", { name: "Position your picture" });
  const file = await picture(page);
  await expect(async () => {
    await page.getByTestId("avatar-file").setInputFiles(file);
    await expect(win).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await untilAtRest(win);
  return win;
}

/** Until nothing in `target` moves any more: every finite motion in it (its own included) has run. */
export async function untilAtRest(target: Locator) {
  await expect
    .poll(() => target.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity).length))
    .toBe(0);
}

/**
 * An open bubble and its trigger, measured on screen: which window holds it, whether it is what is
 * drawn at its centre (its pointer-events lifted for the moment), and both boxes.
 */
export function bubbleFacts(bubble: Locator, triggerTestId: string) {
  return bubble.evaluate((el, id) => {
    const trigger = document.querySelector(`dialog[open] [data-testid="${id}"]`)!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    (el as HTMLElement).style.pointerEvents = "auto";
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    (el as HTMLElement).style.pointerEvents = "";
    return {
      window: el.closest("dialog[open]")?.getAttribute("data-testid") ?? null,
      onTop: !!hit && el.contains(hit),
      bubble: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width },
      trigger: { left: trigger.left, top: trigger.top, bottom: trigger.bottom, width: trigger.width },
      screen: { width: innerWidth, height: innerHeight },
    };
  }, triggerTestId);
}

/** Where placeTip puts a bubble: centred on its trigger (held 8px inside the screen), 6px above it, or below it. */
export function placedRight(f: Awaited<ReturnType<typeof bubbleFacts>>): boolean {
  const left = Math.min(Math.max(8, f.trigger.left + f.trigger.width / 2 - f.bubble.width / 2), Math.max(8, f.screen.width - 8 - f.bubble.width));
  const above = Math.abs(f.bubble.bottom - (f.trigger.top - 6)) <= 1 || Math.abs(f.bubble.top - 8) <= 1;
  const below = Math.abs(f.bubble.top - (f.trigger.bottom + 6)) <= 1;
  return Math.abs(f.bubble.left - left) <= 1 && (above || below);
}

/**
 * A toast and its dismiss button once its entrance motion has run (toast-in scales it by 0.98 at
 * first): where it is drawn (in a window or on the page), how many live regions hold it, whether it
 * is what a finger finds where it is drawn, and the button's layout size and box on screen.
 */
export async function toastFacts(toast: Locator) {
  await untilAtRest(toast);
  return toast.evaluate((el) => {
    const t = el.getBoundingClientRect();
    const dismiss = el.querySelector<HTMLElement>('button[aria-label="Dismiss notification"]')!;
    const b = dismiss.getBoundingClientRect();
    const at = (x: number, y: number) => document.elementFromPoint(x, y);
    let live = 0;
    for (let e: Element | null = el; e; e = e.parentElement) if (e.hasAttribute("aria-live")) live++;
    const hit = at(t.left + 24, t.top + t.height / 2);
    return {
      inWindow: !!el.closest("dialog[open]"),
      live,
      role: el.getAttribute("role"),
      onTop: !!hit && el.contains(hit),
      dismiss: {
        width: dismiss.offsetWidth,
        height: dismiss.offsetHeight,
        box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
        reached: at(b.left + b.width / 2, b.top + b.height / 2)?.closest("button") === dismiss,
      },
      toast: { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
    };
  });
}
