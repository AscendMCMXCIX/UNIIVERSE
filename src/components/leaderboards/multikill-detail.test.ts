import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MultikillDetail } from "@/server/leaderboards/recent-view";
import { MultikillPeekDetail } from "./multikill-detail";

/*
  The reason behind a multikill score in the player Peek (the board's row opens it on every device):
  the score and its spread by chance, each kind made over its usual, the games; without a score, why.
*/

const RANKED: MultikillDetail = {
  score: "124",
  status: "ranked",
  gamesText: "46 games",
  chance: "±9",
  kinds: [
    { key: "double", label: "Doubles", made: "33", usual: "18" },
    { key: "triple", label: "Triples", made: "3", usual: "6.2" },
    { key: "quadra", label: "Quadras", made: "1", usual: "1.6" },
    { key: "penta", label: "Pentas", made: "0", usual: "0.4" },
  ],
  note: null,
  usualIs: "usual for their roles and champions",
};
const html = (detail: MultikillDetail) => renderToStaticMarkup(createElement(MultikillPeekDetail, { detail, seasonLabel: "Season 2026" }));
const text = (h: string) => h.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the multikills in the player Peek", () => {
  it("lead with the score and its spread by chance, then each kind made over its usual, then the games", () => {
    const h = html(RANKED);
    expect(text(h)).toBe("Multikills · Season 2026 124 ±9 Doubles 33 usual 18 Triples 3 usual 6.2 Quadras 1 usual 1.6 Pentas 0 usual 0.4 46 games · each multikill once, at its largest · usual for their roles and champions");
    expect(h).toContain('<span class="sr-only"> multikill score</span>');
    expect(h).toContain('<span class="sr-only">, give or take 9 by chance</span>');
    expect(h).toContain('aria-labelledby="peek-multikills-title"');
    // A description list: each kind a term and its figures.
    expect((h.match(/<dt /g) ?? []).length).toBe(4);
    expect(h).not.toMatch(/<p[ >](?:(?!<\/p>)[\s\S])*<(div|ul|ol|p|dl)[ >]/);
  });

  it("say why there is no score, with the counts still shown", () => {
    const h = html({ ...RANKED, score: null, status: "not-enough", chance: null, kinds: RANKED.kinds.map((k) => ({ ...k, usual: null })), note: "5 games with multikill counts: a score needs 10." });
    expect(h).not.toContain("peek-multikills-score");
    expect(h).not.toContain("usual ");
    expect(text(h)).toContain("Doubles 33 Triples 3 Quadras 1 Pentas 0 5 games with multikill counts: a score needs 10.");
  });
});
