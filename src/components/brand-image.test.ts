import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandImage, STILL_MEDIA } from "./brand-image";

describe("BrandImage", () => {
  it("serves the still frame to phones held either way and to reduced motion", () => {
    expect(STILL_MEDIA.split(", ")).toEqual(["(prefers-reduced-motion: reduce)", "(max-width: 39.99rem)", "(max-height: 480px)"]);
    const html = renderToStaticMarkup(createElement(BrandImage, { src: "/api/branding/logo?v=1", still: "/api/branding/logo-static?v=1", className: "h-8" }));
    // Exactly the picture: no preload hint that would fetch the animation on a phone too.
    expect(html).toBe(`<picture><source srcSet="/api/branding/logo-static?v=1" media="${STILL_MEDIA}"/><img src="/api/branding/logo?v=1" alt="" class="h-8"/></picture>`);
  });

  it("is a plain image when there is no separate still frame", () => {
    for (const still of [null, "/api/branding/background?v=1"]) {
      const html = renderToStaticMarkup(createElement(BrandImage, { src: "/api/branding/background?v=1", still }));
      expect(html).toContain(`<img src="/api/branding/background?v=1" alt=""/>`);
      expect(html).not.toContain("<picture>");
    }
  });
});
