import { expect, test, type Locator, type Page } from "./test";

/*
  Profile picture editor (Settings → the account's picture, the same editor as My Profile): the
  picture is dragged inside a fixed circle, zoomed with one slider, moved with arrow keys, reset,
  cancelled or saved. Pictures of different shapes are generated in the browser (left half red,
  right half blue) so the saved crop can be checked by its colours.
*/

async function picture(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#e02020";
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = "#2040e0";
      ctx.fillRect(w / 2, 0, w / 2, h);
      return c.toDataURL("image/png");
    },
    [width, height] as const,
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** The picture's box relative to the circle (from its inline transform and size), once pending frames have run. */
async function layout(image: Locator) {
  return image.evaluate(async (el) => {
    // Moves are applied once per animation frame: let any pending one run first.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = (el as HTMLElement).style;
    const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(s.transform);
    return { x: Number(m?.[1] ?? NaN), y: Number(m?.[2] ?? NaN), w: parseFloat(s.width), h: parseFloat(s.height), size: (el.parentElement as HTMLElement).clientWidth };
  });
}

function expectCovers(l: { x: number; y: number; w: number; h: number; size: number }) {
  expect(l.x).toBeLessThanOrEqual(0.5);
  expect(l.y).toBeLessThanOrEqual(0.5);
  expect(l.x + l.w).toBeGreaterThanOrEqual(l.size - 0.5);
  expect(l.y + l.h).toBeGreaterThanOrEqual(l.size - 0.5);
}

/** Drags the picture by (dx, dy): a mouse on desktop, touch-type pointer events on phones. */
async function dragBy(page: Page, frame: Locator, dx: number, dy: number, touch: boolean) {
  const box = (await frame.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (!touch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    return;
  }
  const base = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
  await frame.dispatchEvent("pointerdown", { ...base, clientX: x, clientY: y, buttons: 1 });
  for (let i = 1; i <= 6; i++) await frame.dispatchEvent("pointermove", { ...base, clientX: x + (dx * i) / 6, clientY: y + (dy * i) / 6, buttons: 1 });
  await frame.dispatchEvent("pointerup", { ...base, clientX: x + dx, clientY: y + dy });
}

async function open(page: Page, width: number, height: number) {
  await page.goto("/settings");
  const file = { name: `p-${width}x${height}.png`, mimeType: "image/png", buffer: await picture(page, width, height) };
  const frame = page.getByTestId("avatar-crop-frame");
  // A file chosen before the page is interactive is ignored: choose it again until the editor opens.
  await expect(async () => {
    await page.getByTestId("avatar-file").setInputFiles(file);
    await expect(frame).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const image = page.getByTestId("avatar-crop-image");
  await expect.poll(async () => (await layout(image)).w).toBeGreaterThan(0);
  return { frame, image };
}

test("the picture is dragged inside the circle and never leaves empty space, for any shape", async ({ page }, info) => {
  const touch = info.project.name === "phone";
  for (const [w, h] of [
    [1600, 900],
    [600, 1200],
    [512, 512],
  ] as const) {
    const { frame, image } = await open(page, w, h);
    const start = await layout(image);
    expectCovers(start);
    // Centred at first: the same overhang on both sides.
    expect(Math.abs(start.x + start.w / 2 - start.size / 2)).toBeLessThan(1);
    // The picture follows the drag (wide pictures have room sideways, tall ones up and down).
    await dragBy(page, frame, 30, 30, touch);
    const moved = await layout(image);
    if (w > h) expect(moved.x).toBeGreaterThan(start.x + 20);
    if (h > w) expect(moved.y).toBeGreaterThan(start.y + 20);
    expectCovers(moved);
    // Far past every edge: held at the edge, the circle still covered.
    for (const [dx, dy] of [
      [2000, 2000],
      [-4000, -4000],
    ] as const) {
      await dragBy(page, frame, dx, dy, touch);
      expectCovers(await layout(image));
    }
    await page.getByTestId("avatar-cancel").click();
    await expect(frame).toBeHidden();
  }
});

test("zoom, arrow keys and Reset; Cancel keeps the old picture and Save stores the crop shown", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard and saving once is enough");
  const current = async () => {
    const img = page.getByTestId("avatar-editor").locator("img");
    return (await img.count()) ? img.first().getAttribute("src") : null;
  };
  await page.goto("/settings");
  const before = await current();
  const { frame, image } = await open(page, 1600, 900);
  const zoom = page.getByTestId("avatar-zoom");
  const start = await layout(image);
  // Zoom: one slider, from the keyboard too; the picture grows around the centre and still covers.
  await zoom.fill("2");
  // The picture is resized on the next frame.
  await expect.poll(async () => Math.round((await layout(image)).w)).toBe(Math.round(start.w * 2));
  const zoomed = await layout(image);
  expectCovers(zoomed);
  await zoom.focus();
  await page.keyboard.press("ArrowRight");
  expect(Number(await zoom.inputValue())).toBeGreaterThan(2);
  // Arrow keys move the picture while the circle has focus.
  await frame.focus();
  await page.waitForTimeout(100);
  const k0 = await layout(image);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await layout(image)).x).toBeGreaterThan(k0.x);
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(async () => (await layout(image)).y).toBeLessThan(k0.y);
  // Reset: back to the centred, unzoomed picture.
  await page.getByTestId("avatar-crop-reset").click();
  await expect.poll(async () => Math.round((await layout(image)).x)).toBe(Math.round(start.x));
  expect(Number(await zoom.inputValue())).toBe(1);
  // Cancel discards it all: no new picture.
  await page.getByTestId("avatar-cancel").click();
  await expect(frame).toBeHidden();
  expect(await current()).toBe(before);

  // Save: drag to the far left of the wide picture (its red half) and save; the stored picture is red.
  const again = await open(page, 1600, 900);
  await dragBy(page, again.frame, 3000, 0, false);
  await page.getByTestId("avatar-save").click();
  await expect(again.frame).toBeHidden();
  const saved = page.getByTestId("avatar-editor").locator("img").first();
  await expect(saved).toHaveAttribute("src", /\/api\/avatars\//);
  const colour = await saved.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data.slice(0, 3));
  });
  expect(colour[0]).toBeGreaterThan(150);
  expect(colour[2]).toBeLessThan(100);
});
