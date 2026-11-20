import { expect, type Locator } from "@playwright/test";

/*
  Chooses an option of the app's Select (src/components/ui/select.tsx), whichever form it has here:
  the browser's own select in the phone posture (a window under 768px wide or 480px tall), the app's
  popover everywhere else. `choice` is an option's value, or its label.
*/
export async function pick(field: Locator, choice: string | { label: string }): Promise<void> {
  const control = only(field);
  await ready(control);
  if ((await control.evaluate((el) => el.tagName)) === "SELECT") {
    await control.selectOption(choice);
    return;
  }
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
  if ((await control.getAttribute("aria-expanded")) !== "true") await control.click();
  await expect(control).toHaveAttribute("aria-expanded", "true");
  const list = control.page().locator(`[id="${await control.getAttribute("aria-controls")}"]`);
  const option = typeof choice === "string" ? list.locator(`[role=option][data-value="${choice}"]`) : list.getByRole("option", { name: choice.label, exact: true });
  await option.click();
  await expect(control).toHaveAttribute("aria-expanded", "false");
}

/**
 * The control itself: a field found by its label ("Game mode") also matches its open list, which
 * the label names too.
 */
function only(field: Locator): Locator {
  return field.and(field.page().locator("select, [data-select]"));
}

/**
 * Waits for the page's code: the server draws the popover's button everywhere, and the phone posture
 * swaps it for the browser's own select as the page hydrates.
 */
export async function ready(field: Locator): Promise<void> {
  const control = only(field);
  await expect(control).toBeVisible();
  await expect.poll(() => control.evaluate((el) => el.tagName === "SELECT" || el.hasAttribute("data-ready"))).toBe(true);
}

/** The value a Select shows: the native select's, or the popover's (`data-value`). */
export async function valueOf(field: Locator): Promise<string> {
  return only(field).evaluate((el) => (el instanceof HTMLSelectElement ? el.value : (el.getAttribute("data-value") ?? "")));
}

/** The label of the option a Select shows. */
export async function shownLabel(field: Locator): Promise<string> {
  return only(field).evaluate((el) => (el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.textContent ?? "") : (el.querySelector("[data-select-label]")?.textContent ?? "")).trim());
}

/** Every option's value and label, in order (opens and closes the popover to read them). */
export async function optionsOf(field: Locator): Promise<{ value: string; label: string }[]> {
  const control = only(field);
  await ready(control);
  if ((await control.evaluate((el) => el.tagName)) === "SELECT") return control.locator("option").evaluateAll((els) => els.map((e) => ({ value: (e as HTMLOptionElement).value, label: (e.textContent ?? "").trim() })));
  await control.click();
  await expect(control).toHaveAttribute("aria-expanded", "true");
  const list = control.page().locator(`[id="${await control.getAttribute("aria-controls")}"]`);
  const found = await list.locator("[role=option]").evaluateAll((els) => els.map((e) => ({ value: e.getAttribute("data-value") ?? "", label: (e.textContent ?? "").trim() })));
  await control.press("Escape");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  return found;
}

/** Every option's label, in order. */
export async function optionLabels(control: Locator): Promise<string[]> {
  return (await optionsOf(control)).map((o) => o.label);
}

/**
 * What a Select looks like with a mouse, closed and open: the figures Chromium draws, which WebKit
 * must draw too (the WebKit project checks the same figures; PLAN S4a: "Select looks the same in
 * Chromium and WebKit"). Read from the Overview's game mode, its list open and its first option active.
 */
export const SELECT_LOOK = {
  button: { font: "14px", height: 36, background: "rgb(24, 26, 37)", radius: "6px", border: "1px", color: "rgb(238, 240, 246)" },
  list: { background: "rgb(24, 26, 37)", radius: "10px", border: "1px rgb(58, 62, 83)", shadow: true },
  option: { font: "14px", height: 36, radius: "6px" },
};

/** The figures SELECT_LOOK lists, read from a Select (`control`, closed) and then its open list. */
export async function selectLook(field: Locator) {
  const control = only(field);
  await ready(control);
  const button = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return { font: s.fontSize, height: Math.round(el.getBoundingClientRect().height), background: s.backgroundColor, radius: s.borderTopLeftRadius, border: s.borderTopWidth, color: s.color };
  });
  await control.click();
  const list = control.page().locator(`[id="${await control.getAttribute("aria-controls")}"]`);
  await expect(list).toBeVisible();
  const open = await list.evaluate((el) => {
    const s = getComputedStyle(el);
    const o = el.querySelector("[role=option]")!;
    const so = getComputedStyle(o);
    return {
      list: { background: s.backgroundColor, radius: s.borderTopLeftRadius, border: `${s.borderTopWidth} ${s.borderTopColor}`, shadow: s.boxShadow !== "none" },
      option: { font: so.fontSize, height: Math.round(o.getBoundingClientRect().height), radius: so.borderTopLeftRadius },
    };
  });
  await control.press("Escape");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  return { button, ...open };
}
