import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardArtLayer } from "./card-art";

/*
  Team Overview's first card is a phone's largest element (Record 3, docs/PERFORMANCE.md "Team
  Overview's first card"): its art is fetched at once and ahead of everything else, every other
  card's art lazily. The server's HTML is what the browser starts on, so the attributes are checked
  there.
*/
describe("CardArtLayer: the first card's art first", () => {
  const art = { championId: "Ahri", skinNum: 0 };
  it("the priority art is eager with high fetch priority", () => {
    const html = renderToStaticMarkup(createElement(CardArtLayer, { art, accent: "#fff", kind: "splash", priority: true }));
    expect(html).toMatch(/<img[^>]*loading="eager"/);
    expect(html).toMatch(/<img[^>]*fetchPriority="high"|<img[^>]*fetchpriority="high"/i);
  });
  it("any other art is lazy, with no raised priority", () => {
    const html = renderToStaticMarkup(createElement(CardArtLayer, { art, accent: "#fff", kind: "splash" }));
    expect(html).toMatch(/<img[^>]*loading="lazy"/);
    expect(html).not.toMatch(/fetchpriority/i);
  });
});
