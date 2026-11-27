import { spawn, type ChildProcess } from "node:child_process";
import { E2E_DDRAGON_VERSION } from "./ddragon-version";
import { expect, test, type Page } from "./test";
import { widenText } from "./wide-text";

/*
  Leaderboards with the owner's full roster (Release 19, the owner's request of 26 Nov 2026: the full
  active roster of eight or nine on one screen wherever reasonably possible, without scrolling, hidden
  information or tiny text). The default demo has seven active players (the two members still in setup
  have no games), so the one-screen specs never saw nine. This file starts its own demo server with
  UNIIVERSE_DEMO_FULL_ROSTER=1 (src/server/demo/seed.ts, applyFullRosterFixture: the two members in
  setup play too), on the suite's port plus 17, and stops it at the end; the default demo is unchanged.

  Held: with nine active players, all four boards end at least SPARE above the page's bottom padding at
  1440 × 900, 1920 × 950 and 1920 × 1080 (sidebar open and folded), the rankings' rows are 36px (their
  names 14px, nothing under the 12px floor), and at 1366 × 768 both rankings end in the window (the
  achievements under them may scroll a little: docs/TEAM_LEADERBOARDS.md, One screen). Once more with
  CI's wider text (e2e/wide-text.ts).
*/

const PORT = Number(process.env.E2E_PORT ?? 3199) + 17;
const BASE = `http://127.0.0.1:${PORT}`;
/** The least room under the boards at the sizes held (CI's text is wider: e2e/wide-text.ts). */
const SPARE = 12;
let server: ChildProcess | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browserName }, info) => {
  void browserName;
  if (info.project.name !== "desktop") return;
  info.setTimeout(180_000);
  // The suite's server's settings (playwright.config.ts), with the full roster.
  server = spawn("pnpm", ["start", "-p", String(PORT)], {
    env: { ...process.env, UNIIVERSE_DB_MODE: "memory", UNIIVERSE_SEED_DEMO: "true", UNIIVERSE_REQUIRE_AUTH: "false", UNIIVERSE_JOB_LOGS: "silent", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "", RIOT_API_KEY: "", UNIIVERSE_FAKE_RIOT_IDS: "1", DDRAGON_VERSION: E2E_DDRAGON_VERSION, UNIIVERSE_DEMO_FULL_ROSTER: "1" },
    stdio: "ignore",
    detached: true,
  });
  const until = Date.now() + 150_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/leaderboards`);
      if (r.ok) break;
    } catch {
      // not answering yet
    }
    if (Date.now() > until) throw new Error(`the full-roster demo server did not answer on ${PORT}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
});

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid);
    } catch {
      server.kill();
    }
  }
  server = null;
});

/** The boards' bottoms, the room under the lowest, the rankings' room, and the rows' heights and names' sizes. In px. */
const read = (page: Page) =>
  page.evaluate(() => {
    const bottom = (id: string) => document.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect().bottom + scrollY;
    const pad = parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom);
    const limit = innerHeight - pad;
    const rows = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)].map((r) => r.getBoundingClientRect().height);
    const names = [...document.querySelectorAll<HTMLElement>("[data-testid=leaderboards-grid] [data-testid=board-member-name]")].map((n) => parseFloat(getComputedStyle(n).fontSize));
    // Text under the 12px floor (the ⓘ mark's letter, drawn in a 16px tile and hidden from screen readers, is a glyph, not text).
    const small = [...document.querySelectorAll<HTMLElement>("[data-testid=leaderboards-grid] *")].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && /\S/.test(c.textContent ?? "")) && e.getClientRects().length && !e.closest(".sr-only, [aria-hidden=true]") && parseFloat(getComputedStyle(e).fontSize) < 12).length;
    return {
      count: Number(document.querySelector("[data-testid=scope-count]")?.getAttribute("data-count")),
      formRows: rows("form-row"),
      multikillRows: rows("multikill-row"),
      names,
      small,
      rankings: Math.round(limit - Math.max(bottom("form-board"), bottom("records-multikills"))),
      spare: Math.round(limit - Math.max(...["form-board", "records-multikills", "records-book", "records-milestones"].map(bottom))),
      scrolls: document.documentElement.scrollHeight > innerHeight,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

for (const wide of [false, true]) {
  test(`nine active players on one screen with room to spare at 1440 × 900, 1920 × 950 and 1920 × 1080, rows 36px and names 14px, the rankings whole at 1366 × 768${wide ? ", with CI's wider text" : ""}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "explicit window sizes, and the full-roster server");
    test.setTimeout(180_000);
    if (wide) await widenText(page);
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: BASE }]);
    for (const sidebar of ["expanded", "collapsed"] as const) {
      await context.addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: BASE }]);
      for (const [width, height, held] of [
        [1366, 768, "rankings"],
        [1440, 900, "all"],
        [1920, 950, "all"],
        [1920, 1080, "all"],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(`${BASE}/leaderboards`);
        await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
        await page.evaluate(() => document.fonts.ready);
        const f = await read(page);
        const at = `${width} × ${height}, sidebar ${sidebar}${wide ? ", wider text" : ""}`;
        expect(f.count, `${at}: nine active players`).toBe(9);
        expect(f.formRows, `${at}: Recent form ranks nine`).toHaveLength(9);
        expect(f.multikillRows, `${at}: the multikills rank nine`).toHaveLength(9);
        // Rows of the roster's height (36px with nine; a shorter board's rows grow into its spare room, board-fill.ts), never under it.
        expect(Math.min(...f.formRows, ...f.multikillRows), `${at}: no ranking row under 36px`).toBeGreaterThanOrEqual(35.5);
        expect(Math.min(...f.names), `${at}: names 14px`).toBeGreaterThanOrEqual(14);
        expect(f.small, `${at}: no text under the 12px floor`).toBe(0);
        expect(f.sideways, `${at}: no sideways scroll`).toBeLessThanOrEqual(1);
        if (held === "all") {
          expect(f.spare, `${at}: room under the four boards`).toBeGreaterThanOrEqual(SPARE);
          expect(f.scrolls, `${at}: the page does not scroll`).toBe(false);
        } else {
          // 1366 × 768: both rankings end in the window with room to spare; the achievements under them may scroll a little.
          expect(f.rankings, `${at}: room under the two rankings`).toBeGreaterThanOrEqual(SPARE);
        }
      }
    }
  });
}
