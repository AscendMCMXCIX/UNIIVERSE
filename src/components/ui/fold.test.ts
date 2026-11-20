import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Fold, type FoldVariant } from "./fold";

/* The one fold (S4a container 6): every look is a native details with one chevron of its own. */

const render = (variant: FoldVariant, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Fold, { variant, summary: "More", testId: "f", ...extra, children: createElement("p", null, "Body") } as ComponentProps<typeof Fold>));

describe("Fold", () => {
  it.each<FoldVariant>(["panel", "row", "inline"])("%s: a closed details, its summary first, one chevron that turns for its own fold only", (variant) => {
    const html = render(variant);
    expect(html).toMatch(/^<details[^>]*data-testid="f"[^>]*data-fold="/);
    expect(html).not.toMatch(/^<details[^>]*\sopen/);
    expect(html).toMatch(/^<details[^>]*><summary /);
    expect(html.match(/data-fold-chevron/g)).toHaveLength(1);
    expect(html).toContain("[details[open]&gt;summary&gt;&amp;]:rotate-180");
    expect(html).not.toMatch(/group-open/);
  });

  it("keeps a lazy body out of the page until the first open", () => {
    expect(render("panel", { lazy: true })).not.toContain("Body");
    expect(render("panel", { lazy: true, defaultOpen: true })).toContain("Body");
  });

  it("passes data attributes to the details", () => {
    expect(render("inline", { "data-size": 2 })).toMatch(/^<details[^>]*data-size="2"/);
  });
});
