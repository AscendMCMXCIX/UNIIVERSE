import { expect, type Page } from "./test";

/*
  Team Overview's header against its cards, for the layout tests (team-layout.spec.ts) and Safari's
  engine (webkit.spec.ts): one measurement, so both hold the page to the same rules.
*/

/**
 * Where the header's parts stand against the cards in view (all five side by side, or the one a
 * phone's track shows): the identity (the logo, the visible text and the lineup's state), the two
 * lines it takes on phones, Edit lineup and the header itself. Text counts by its glyphs (a block is
 * as wide as its column), and text nobody sees is left out: a label for screen readers only, or the
 * line kept in place for the other mode.
 */
export function headerLayout(page: Page) {
  return page.evaluate(() => {
    const edges = (rects: Array<DOMRect | null | undefined>) => {
      const drawn = rects.filter((r): r is DOMRect => !!r && r.width > 0);
      const left = Math.min(...drawn.map((r) => r.left));
      const right = Math.max(...drawn.map((r) => r.right));
      return { left, right, centre: (left + right) / 2 };
    };
    const header = document.querySelector<HTMLElement>('[data-testid="team-header"]')!;
    const seen = (el: Element | null): el is Element => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.visibility === "visible" && style.position !== "absolute";
    };
    const glyphs = (el: Element | null) => {
      if (!seen(el)) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const logo = header.querySelector('[data-testid="brand-mark-text"], img')!.getBoundingClientRect();
    const eyebrow = glyphs(header.querySelector("p:not([data-testid])"));
    const name = glyphs(header.querySelector('[data-testid="team-name"]'));
    const subtitle = [...header.querySelectorAll('[data-testid="team-subtitle"] > span')].map(glyphs);
    const statusEl = header.querySelector('[data-testid="lineup-status"]');
    const status = seen(statusEl) ? statusEl.getBoundingClientRect() : null;
    const edit = header.querySelector('[data-testid="edit-lineup"]')?.getBoundingClientRect() ?? null;
    const cards = [...document.querySelectorAll('[data-testid="lineup-cell"]')].map((c) => c.getBoundingClientRect()).filter((r) => r.left > -1 && r.right < innerWidth + 1);
    const box = header.getBoundingClientRect();
    return {
      identity: edges([logo, eyebrow, name, ...subtitle, status]),
      firstLine: edges([logo, name, ...subtitle]),
      foot: edges([status, edit]),
      cards: { ...edges(cards), top: Math.min(...cards.map((r) => r.top)) },
      header: { left: box.left, right: box.right, bottom: box.bottom },
      edit: edit && { right: edit.right, middle: edit.top + edit.height / 2 },
      statusMiddle: status ? status.top + status.height / 2 : null,
      sideways: document.documentElement.scrollWidth - innerWidth,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
}

/** Wherever the cards stand side by side: the identity on their centre line, the header on their edges, Edit lineup at the right one. */
export function expectHeaderAligned(m: Awaited<ReturnType<typeof headerLayout>>, label: string) {
  expect(Math.abs(m.identity.centre - m.cards.centre), `${label}: the identity is centred on the cards`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.header.left - m.cards.left), `${label}: the header starts where the cards do`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.header.right - m.cards.right), `${label}: the header ends where the cards do`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.edit!.right - m.cards.right), `${label}: Edit lineup at the cards' right edge`).toBeLessThanOrEqual(1);
  // In rem: the type, and the spacing with it, grows on very large screens.
  expect(m.cards.top - m.header.bottom, `${label}: the header sits right above the cards`).toBeLessThanOrEqual(1.5 * m.rem + 0.5);
  expect(m.sideways, `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}
