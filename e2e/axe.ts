import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "./test";

/**
 * axe (WCAG 2.1 A and AA) on the parts of the page named, or the whole page: no critical or serious
 * violation. Each finding is listed with its rule and up to three of its elements.
 */
export async function expectNoSeriousAxe(page: Page, label: string, include: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const selector of include) builder = builder.include(selector);
  const result = await builder.analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), label).toEqual([]);
}
