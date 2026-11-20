import { expect, test, type Page } from "./test";

/*
  Team Leaderboards at large text sizes on phones: the root's font size from 125% to 200%, as a
  browser's text-size setting scales every rem (the boards' layouts follow their own width in rem,
  so a 320px phone's Recent form board is 17.9rem at 100% and 7.9rem at 200%). What the reader
  sees: every word whole (a word's own range on one line, so names wrap only between their words),
  nothing cut by a clipping box, no text running into other text or a picture, and no sideways
  scroll. Recent form's rows reflow where a name cannot sit beside its figures (the win rate under
  the name, then the name under the place and picture); before, the name kept a few letters a line
  (one at 200%) and the gap ("1 win behind") ran 32px past the board. At 100% nothing changes.
  Your own row is checked with "You" put beside every name (the demo's viewer has no player
  profile, so no row of theirs): "You" drops under a name whose longest word would not fit beside
  it, where the name broke mid-word before ("Suppor|t" at 125% on a 375px phone, "Christopher" even
  at 100% on a 320px phone), and stays beside it where it fits. The role badge stays on its
  picture and the tie bracket off the names; no "·" ends or starts a line. The season records,
  multikills and milestones (on the same page, after Recent form) already reflow on their own; a
  record's qualifier there hides its "·" only when it starts a line of its own (the title's clipped
  edge), never beside its record. The boards' ⓘ bubbles stay on the screen at 200%: the records'
  definitions, longer than a phone's screen there, scroll inside theirs.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phone widths and text sizes: either side of each of the board's large-text tiers (17.5, 16.5 and 13.5rem). */
const SIZES = [
  [320, 125],
  [320, 150],
  [320, 175],
  [320, 200],
  [360, 125],
  [360, 150],
  [375, 125],
  [375, 150],
  [375, 175],
  [375, 200],
  [393, 150],
  [393, 200],
] as const;

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready);
}

/** The phone's width and the root's font size, once laid out. */
async function setSize(page: Page, width: number, root: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

// Against the layout viewport's width: a phone's (isMobile) window grows with what spills past it, so innerWidth would hide it.
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * The visible text under `selector` (never what only screen readers get): `cut`, text past the
 * nearest box that clips it sideways (an ellipsis is deliberate; so is the separator of a Records
 * qualifier, checked on its own); `broken`, a word (a run of letters or digits, so a line may still
 * break after a hyphen or a slash) whose own range takes more than one line.
 */
function textFacts(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const srOnly = (e: Element) => {
      for (let p: Element | null = e; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
      }
      return false;
    };
    const where = (e: Element) => e.closest("[data-testid]")?.getAttribute("data-testid") ?? e.tagName.toLowerCase();
    const cut: string[] = [];
    const broken: string[] = [];
    let words = 0;
    for (const root of document.querySelectorAll(sel)) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent ?? "";
        const parent = n.parentElement;
        if (!text.trim() || !parent || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        if (!rects.length) continue;
        const separator = text.trim() === "·" && !!parent.closest("[data-testid=record-qualifier]");
        for (let p: Element | null = parent; p && p !== document.documentElement && !separator; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (!/hidden|clip/.test(cs.overflowX)) continue;
          const box = p.getBoundingClientRect();
          const past = Math.max(Math.max(...rects.map((r) => r.right)) - (box.right - parseFloat(cs.borderRightWidth)), box.left + parseFloat(cs.borderLeftWidth) - Math.min(...rects.map((r) => r.left)));
          if (past > 1 && cs.textOverflow !== "ellipsis" && getComputedStyle(parent).textOverflow !== "ellipsis") cut.push(`${where(parent)} "${text.trim().slice(0, 24)}" ${Math.round(past)}px past ${where(p)}`);
          break;
        }
        for (const m of text.matchAll(/[\p{L}\p{N}'’]{2,}/gu)) {
          const word = document.createRange();
          word.setStart(n, m.index);
          word.setEnd(n, m.index + m[0].length);
          const lines = new Set([...word.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top))).size;
          words++;
          if (lines > 1) broken.push(`${where(parent)} "${m[0]}" on ${lines} lines`);
        }
      }
    }
    return { cut, broken, words };
  }, selector);
}

/**
 * In each Recent form row (ranked or without enough games), the boxes that must not meet: its
 * visible text, its picture and the tie bracket beside the place (under 13.5rem, where the names
 * run under the place, the bracket steps aside). `roleOff`: a role badge more than 0.5rem from its
 * own picture, whose lower right it sits on (under 13.5rem it keeps to the picture's line rather
 * than float down the row, over the win rate). The badge is held to its picture rather than kept
 * off the text: it hangs 0.25rem below the picture by design, and under 13.5rem that reaches the
 * top of the name's line box under it, above the letters. `roles` and `brackets`: how many were
 * measured, so neither check is idle.
 */
function rowBoxes(page: Page) {
  return page.locator("[data-testid=form-row], [data-testid=form-not-enough-member]").evaluateAll((els) => {
    const shown = (e: Element) => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const hits: string[] = [];
    const roleOff: string[] = [];
    let roles = 0;
    let brackets = 0;
    els.forEach((row, i) => {
      const srOnly = (e: Element) => {
        for (let p: Element | null = e; p && p !== row; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
        }
        return false;
      };
      const boxes: { owner: number; what: string; r: DOMRect }[] = [];
      row.querySelectorAll("[data-avatar-frame]").forEach((a) => boxes.push({ owner: -1, what: "picture", r: a.getBoundingClientRect() }));
      const role = row.querySelector("[data-testid=form-role]");
      if (role && shown(role) && !srOnly(role)) {
        roles++;
        const r = role.getBoundingClientRect();
        const picture = row.querySelector("[data-avatar-frame]")!.getBoundingClientRect();
        const apart = Math.max(picture.left - r.right, r.left - picture.right, picture.top - r.bottom, r.top - picture.bottom, 0);
        if (apart > 0.5 * rem) roleOff.push(`row ${i + 1}: role badge ${Math.round(apart)}px from its picture`);
      }
      // The bracket follows its place, both the row's own children (Place).
      const bracket = row.querySelector(":scope > [data-testid=form-place] + [aria-hidden]");
      if (bracket && shown(bracket)) {
        brackets++;
        boxes.push({ owner: -2, what: "tie bracket", r: bracket.getBoundingClientRect() });
      }
      const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let owner = 0;
      for (let n = walk.nextNode(); n; n = walk.nextNode(), owner++) {
        const parent = n.parentElement;
        // The picture's own initial is the picture.
        if (!n.textContent?.trim() || !parent || parent.closest("[data-avatar-frame]") || !shown(parent) || srOnly(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) boxes.push({ owner, what: `"${n.textContent.trim().slice(0, 16)}"`, r });
      }
      for (let a = 0; a < boxes.length; a++)
        for (let b = a + 1; b < boxes.length; b++) {
          const [x, y] = [boxes[a]!, boxes[b]!];
          if (x.owner === y.owner) continue;
          if (x.r.left < y.r.right - 1 && y.r.left < x.r.right - 1 && x.r.top < y.r.bottom - 1 && y.r.top < x.r.bottom - 1) hits.push(`row ${i + 1}: ${x.what} over ${y.what}`);
        }
    });
    return { hits, roleOff, roles, brackets };
  });
}

/**
 * Each visible "·" in Recent form's second lines, its captions and its "Not enough recent games"
 * rows, and in the index of the page's sections, that ends or starts a line: with a character of its
 * own text either side of it on its line, it does neither.
 */
function danglingDots(page: Page) {
  return page.locator("[data-testid=form-meta], [data-testid=form-not-enough-member], [data-testid=form-not-enough-head], [data-testid=form-provisional-head], [data-testid=section-index]").evaluateAll((els) =>
    els.flatMap((el) => {
      const srOnly = (e: Element) => {
        for (let p: Element | null = e; p && p !== el.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
        }
        return false;
      };
      const chars: { c: string; mid: number }[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const parent = n.parentElement;
        if (!parent || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
        const text = n.textContent ?? "";
        for (let k = 0; k < text.length; k++) {
          if (!text[k]!.trim()) continue;
          const range = document.createRange();
          range.setStart(n, k);
          range.setEnd(n, k + 1);
          const box = [...range.getClientRects()].find((b) => b.width > 0.1);
          if (box) chars.push({ c: text[k]!, mid: box.top + box.height / 2 });
        }
      }
      return chars.flatMap((ch, k) => {
        if (ch.c !== "·") return [];
        const [before, after] = [chars[k - 1], chars[k + 1]];
        const ends = !after || Math.abs(after.mid - ch.mid) > 4;
        const starts = !before || Math.abs(before.mid - ch.mid) > 4;
        return ends || starts ? [`${el.getAttribute("data-testid")}: a "·" ${ends ? "ends" : "starts"} a line`] : [];
      });
    }),
  );
}

test("Recent form at 125% to 200% text on 320 to 393px phones: names wrap only between words, nothing cut or overlapping (the tie bracket too, the role badge on its picture), no dangling \"·\", no sideways scroll; at 100% the win rate stays beside the name", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await open(page, "/leaderboards");
  await expect(page.getByTestId("form-row").first()).toBeVisible();
  const rows = await page.getByTestId("form-row").count();
  expect(rows, "the demo's ranked rows").toBeGreaterThanOrEqual(7);
  await expect(page.getByTestId("form-not-enough-member")).not.toHaveCount(0);

  // At 100% the board keeps its narrow layout: on every row the win rate beside the name, to its right.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    const beside = await page.getByTestId("form-row").evaluateAll((els) =>
      els.map((row) => {
        const name = row.querySelector("[data-testid=card-name]")!.getBoundingClientRect();
        const rate = row.querySelector("[data-testid=form-win-rate]")!.getBoundingClientRect();
        return rate.left >= name.right - 1 && rate.top < name.bottom && rate.bottom > name.top;
      }),
    );
    expect(beside, `${width}px at 100%: each win rate beside its name`).toEqual(beside.map(() => true));
  }

  let [roles, brackets] = [0, 0];
  for (const [width, root] of SIZES) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    expect.soft(await sideways(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    const text = await textFacts(page, "[data-testid=form]");
    expect.soft(text.words, `${at}: the board's words measured`).toBeGreaterThan(100);
    expect.soft(text.cut, `${at}: nothing cut`).toEqual([]);
    expect.soft(text.broken, `${at}: every word whole`).toEqual([]);
    // In each row (ranked or without enough games) no text runs into other text, the picture or the tie bracket; the role badge stays on the picture.
    const boxes = await rowBoxes(page);
    expect.soft(boxes.hits, `${at}: no text over other text, a picture or a tie bracket`).toEqual([]);
    expect.soft(boxes.roleOff, `${at}: each role badge on its picture`).toEqual([]);
    [roles, brackets] = [roles + boxes.roles, brackets + boxes.brackets];
    // No "·" ends or starts a line: the second lines' record and dates share a line or take one each; elsewhere the "·" keeps to its words.
    expect.soft(await danglingDots(page), `${at}: no "·" ending or starting a line`).toEqual([]);
  }
  expect(roles, "role badges measured").toBeGreaterThan(0);
  expect(brackets, "tie brackets measured (the demo's three tied for 4th, from 13.5rem)").toBeGreaterThan(0);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

/** MemberCell's "You" (Badge tone="accent") as your own row draws it. */
const YOU = '<span class="inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-tight bg-accent/15 text-accent-strong border-accent/30">You</span>';

test("Recent form, your own row, at 100% to 200% text on 320 to 393px phones: \"You\" drops under a name it would break and stays beside one it fits, words whole, nothing overlapping", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await open(page, "/leaderboards");
  await expect(page.getByTestId("form-not-enough-member")).not.toHaveCount(0);
  // Every row made your own, "You" put in MemberCell's line beside the name; from the third ranked
  // row on, single words of 9 to 11 letters for names (the first two keep theirs, "Demo Support"
  // and "Demo Sub (Support)", and so do the not-enough rows).
  const own = await page.evaluate((you) => {
    const words = ["Christopher", "Doublelift", "Moonlight", "Shadowfax", "Supportive"];
    const rows = [...document.querySelectorAll("[data-testid=form-row], [data-testid=form-not-enough-member]")];
    rows.forEach((row, i) => {
      const name = row.querySelector("[data-testid=card-name]")!;
      // The line holds the box around CardName, then "You".
      const line = name.parentElement!.parentElement!.parentElement!;
      const word = row.matches("[data-testid=form-row]") ? words[i - 2] : undefined;
      if (word) name.textContent = word;
      const badge = document.createElement("span");
      badge.className = "inline-flex shrink-0";
      badge.dataset.testid = "card-you";
      badge.innerHTML = you;
      line.append(badge);
    });
    return rows.length;
  }, YOU);
  expect(own, "rows made your own").toBeGreaterThanOrEqual(9);
  // "You" beside its name (after it, on its first line) or under it.
  const youPlaces = () =>
    page.getByTestId("card-you").evaluateAll((badges) =>
      badges.map((b) => {
        const [you, name] = [b.getBoundingClientRect(), b.parentElement!.firstElementChild!.getBoundingClientRect()];
        return you.left >= name.right - 1 && you.top < name.bottom - 1 ? "beside" : "under";
      }),
    );

  for (const [width, root] of [[320, 100], [375, 100], ...SIZES] as const) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    expect.soft(await sideways(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    const text = await textFacts(page, "[data-testid=form]");
    expect.soft(text.cut, `${at}: nothing cut`).toEqual([]);
    expect.soft(text.broken, `${at}: every word whole`).toEqual([]);
    expect.soft((await rowBoxes(page)).hits, `${at}: no text over other text, a picture or a tie bracket`).toEqual([]);
    const places = await youPlaces();
    expect.soft(places.length, `${at}: "You" in every row`).toBe(own);
    // Beside every name on a 375px phone at 100% (each word fits beside it), under the longest words on a 320px one.
    if (width === 375 && root === 100) expect.soft(places, `${at}: "You" beside every name`).toEqual(places.map(() => "beside"));
    if (width === 320 && root === 100) expect.soft(places.filter((p) => p === "under").length, `${at}: "You" under the names it would break`).toBeGreaterThan(0);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("the season records, multikills and milestones at 125% to 200% text on 320 to 393px phones: words whole, nothing cut but the separator of a qualifier on a line of its own, no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await open(page, "/leaderboards");
  await expect(page.getByTestId("season-record").first()).toBeVisible();
  await expect(page.getByTestId("record-qualifier")).not.toHaveCount(0);
  for (const [width, root] of [[320, 100], [375, 100], ...SIZES] as const) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    expect.soft(await sideways(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    const text = await textFacts(page, "[data-testid=records-book], [data-testid=records-multikills], [data-testid=records-milestones]");
    expect.soft(text.words, `${at}: the boards' words measured`).toBeGreaterThan(100);
    expect.soft(text.cut, `${at}: nothing cut`).toEqual([]);
    expect.soft(text.broken, `${at}: every word whole`).toEqual([]);
    // The qualifier's "·" shows beside its record, inside the title; it is hidden past the title's
    // clipped edge only when the qualifier starts a line of its own, so no line starts with it.
    const separators = await page.getByTestId("record-title").evaluateAll((titles) =>
      titles.flatMap((title) => {
        const qualifier = title.querySelector("[data-testid=record-qualifier]");
        if (!qualifier) return [];
        const lineBoxes = (n: Node) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          return [...r.getClientRects()].filter((b) => b.width > 0.5);
        };
        const label = lineBoxes(title.querySelector("[data-testid=record-label]")!).at(-1)!;
        const own = [...qualifier.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim()).at(-1)!;
        const first = lineBoxes(own)[0]!;
        const besideRecord = first.top < label.bottom - 1 && first.bottom > label.top + 1;
        const dot = lineBoxes(qualifier.querySelector("[aria-hidden]")!)[0]!;
        const box = title.getBoundingClientRect();
        const shown = dot.left >= box.left - 0.5 && dot.right <= box.right + 0.5;
        return shown === besideRecord ? [] : [`${title.closest("[data-record]")?.getAttribute("data-record")}: qualifier ${besideRecord ? "beside its record, its · cut" : "on its own line, its · shown"}`];
      }),
    );
    expect.soft(separators, `${at}: each qualifier's · shown beside its record, hidden only on a line of its own`).toEqual([]);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("the boards' ⓘ bubbles at 200% text on 375 and 320px phones: never taller than the screen; the season records' definitions scroll inside theirs, a finger's drag scrolls it, a tap closes it", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await open(page, "/leaderboards");
  const cdp = await page.context().newCDPSession(page);
  const drag = async (x: number, from: number, to: number) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
    for (let y = from - 10; y >= to; y -= 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  for (const [width, height] of [
    [375, 667],
    [320, 568],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const at = `${width} × ${height} at 200%`;
    for (const id of ["form-footnote", "records-definitions"]) {
      const tip = page.getByTestId(id);
      await tip.scrollIntoViewIfNeeded();
      await tip.tap();
      const bubble = page.getByTestId(`${id}-bubble`);
      await expect(bubble, `${at}: ${id}`).toBeVisible();
      const f = await bubble.evaluate((b) => {
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, screen: innerHeight, scrolls: b.scrollHeight > b.clientHeight + 1, pointer: getComputedStyle(b).pointerEvents };
      });
      // The bubble on the screen, 8px inside its edges, however long its text.
      expect(f.top, `${at}: ${id} inside the screen's top`).toBeGreaterThanOrEqual(7.5);
      expect(f.bottom, `${at}: ${id} inside the screen's foot`).toBeLessThanOrEqual(f.screen - 7.5);
      // A bubble that fits lets the pointer through, as every bubble did; one whose text is longer scrolls, and takes it.
      expect(f.pointer, `${at}: ${id}`).toBe(f.scrolls ? "auto" : "none");
      if (id === "records-definitions") {
        expect(f.scrolls, `${at}: the definitions longer than the screen`).toBe(true);
        // A finger's drag on the bubble scrolls its text, and leaves it open.
        await drag(f.left + f.width / 2, f.bottom - 40, f.top + 60);
        await expect.poll(() => bubble.evaluate((b) => b.scrollTop), { message: `${at}: the drag scrolled the definitions` }).toBeGreaterThan(0);
        await expect(bubble).toBeVisible();
        // Scrolled to its end, its last line inside the bubble: every definition can be read.
        const end = await bubble.evaluate((b) => {
          b.scrollTop = b.scrollHeight;
          const last = [...b.querySelectorAll("span")].at(-1)!.getBoundingClientRect();
          return { last: last.bottom, box: b.getBoundingClientRect().bottom, text: b.textContent ?? "" };
        });
        expect(end.text, `${at}`).toContain("A tie goes to whoever set it first.");
        expect(end.last, `${at}: the definitions' last line in view`).toBeLessThanOrEqual(end.box + 0.5);
      }
      // A tap closes it: on the bubble where it takes the pointer, as anywhere else.
      if (f.scrolls) await bubble.tap({ position: { x: 20, y: 20 } });
      // Anywhere else on the page: the scope line (the h1 is read out only on phones, the sections row naming the page).
      else await page.getByTestId("scope-count").tap();
      await expect(bubble, `${at}: ${id} closed by a tap`).toHaveCount(0);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});
