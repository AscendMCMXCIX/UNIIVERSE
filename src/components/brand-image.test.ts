import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandImage, STILL_MEDIA } from "./brand-image";

describe("BrandImage", () => {
  it("animates on every screen, phones included, and serves the still frame to reduced motion only", () => {
    expect(STILL_MEDIA).toBe("(prefers-reduced-motion: reduce)");
    const html = renderToStaticMarkup(createElement(BrandImage, { src: "/api/branding/logo?v=1", still: "/api/branding/logo-static?v=1", className: "h-8" }));
    // Exactly the picture: no preload hint that would fetch the animation for reduced motion too.
    // The picture itself takes no part in the layout, so the image's classes size it. Nor does its
    // source (hidden): otherwise it is an empty box in the parent's flex row or grid, beside the image.
    expect(html).toBe(`<picture class="contents"><source srcSet="/api/branding/logo-static?v=1" media="${STILL_MEDIA}" class="hidden"/><img src="/api/branding/logo?v=1" alt="" class="h-8"/></picture>`);
  });

  it("is a plain image when there is no separate still frame", () => {
    for (const still of [null, "/api/branding/background?v=1"]) {
      const html = renderToStaticMarkup(createElement(BrandImage, { src: "/api/branding/background?v=1", still }));
      expect(html).toContain(`<img src="/api/branding/background?v=1" alt=""/>`);
      expect(html).not.toContain("<picture");
    }
  });
});
