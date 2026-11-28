import { expect, test, type Page } from "./test";
import { FLOOR, OWNER_CONFIGS, cfg, demoPlayerId, fits, measureWorkspace, openAt, resizeTo, withWideText, type FitsOptions, type Side, type Size } from "./workspace";

/*
  The platform's one-screen promise (the owner's requirement of 27 and 28 Nov 2026; docs/RESPONSIVE.md,
  "One-screen desktop pages"): on a desktop window every page a member or an admin works in fits the
  window. No document scroll, nothing in #content scrolling on its own, nothing a reader needs clipped
  or drawn off the screen, no text under the 12px floor, every paged region's pages whole (fits() in
  e2e/workspace.ts), at the owner's eight configurations (1366 × 768, 1440 × 900, 1648 × 900 and
  1920 × 1080, the sidebar open and folded) and at the gate's floor (1366 × 657) where the page fits
  there, all with CI's wider text (e2e/wide-text.ts: a page that passes here passes there).

  A table of pages and their states (ROWS): each row is a page, the state it is in (`then`, applied
  once it is open: a row opened, a filter), and where it fits today (`at`). It began on 28 Nov 2026
  with the pages that already fit, as a regression net; each lane that brings a page to one screen
  adds its rows or widens a row's `at`, and its page-specific tests (paging exposes every record,
  Back, the keys, the focus) go in the page's own spec. The suite's own server (the default demo);
  the desktop project only. A page is opened once per sidebar state (the sidebar's state is its
  cookie: a change needs a load) and resized in place across the sizes, as a reader's window is.
*/

type Config = { size: Size; side: Side };

/** The owner's eight configurations. */
const EIGHT: readonly Config[] = OWNER_CONFIGS;
/** The eight and the floor, the sidebar open and folded. */
const EIGHT_AND_FLOOR: readonly Config[] = [...OWNER_CONFIGS, { size: FLOOR, side: "expanded" }, { size: FLOOR, side: "collapsed" }];
/** The configurations at these sizes only (a page that does not fit the others yet). */
const at = (sizes: Size[]): Config[] => EIGHT_AND_FLOOR.filter((c) => sizes.some(([w, h]) => c.size[0] === w && c.size[1] === h));

interface OneScreenRow extends FitsOptions {
  /** The page and its state in messages: "Team Overview", "Champion Intel, one champion". */
  name: string;
  /** Its address; {player} is a demo profile's id (Demo Top's, from Players). */
  path: string;
  /** Admin Mode's view (the uniiverse_view cookie). */
  admin?: boolean;
  /** Other cookies (the demo's viewer: uniiverse_demo_viewer=member; a test hook). */
  cookies?: Record<string, string>;
  /** Where the page fits today: EIGHT, EIGHT_AND_FLOOR, or the configurations it fits measured (at()). */
  at: readonly Config[];
  /** The state, applied once the page is open (at each sidebar state's first size): it must not grow the page. */
  then?: (page: Page) => Promise<void>;
}

/*
  Measured on 28 Nov 2026 (the default demo, CI's wider text), the pages that already fit:
  - at the eight and the floor: Players, Champion Intel (empty, and with a champion), My Profile
    without a profile of one's own, a profile's Accounts, All Champions' list, Admin's Data and Audit;
  - at the eight, not the floor: Team Overview (33px over with the sidebar open, 6 folded),
    Leaderboards (87px), Admin's Accounts (36px), Admin's Access levels (10px with the sidebar open;
    it fits folded);
  - a profile's Overview fits from 1440 × 900 only (376–390px over at 1366 × 768, 487–501 at the floor).
*/
const ROWS: OneScreenRow[] = [
  { name: "Team Overview", path: "/team", at: EIGHT },
  { name: "Players", path: "/players", at: EIGHT_AND_FLOOR },
  { name: "Leaderboards", path: "/leaderboards", at: EIGHT },
  { name: "Champion Intel, empty", path: "/lookup", at: EIGHT_AND_FLOOR },
  { name: "Champion Intel, one champion", path: "/lookup?champion=Ahri", at: EIGHT_AND_FLOOR },
  { name: "Profile Overview", path: "/players/{player}", at: at([[1440, 900], [1648, 900], [1920, 1080]]) },
  { name: "My Profile, a member's own", path: "/overview", cookies: { uniiverse_demo_viewer: "member" }, at: at([[1440, 900], [1648, 900], [1920, 1080]]) },
  { name: "My Profile, no profile of one's own", path: "/overview", at: EIGHT_AND_FLOOR },
  { name: "Profile Accounts", path: "/players/{player}/accounts", at: EIGHT_AND_FLOOR },
  { name: "All Champions, the list", path: "/players/{player}/champions", at: EIGHT_AND_FLOOR, workspace: true, pager: "all-champions-pager", cards: "[data-testid=all-champions-table]", rows: "[data-testid=top-champion]", truncates: "[data-testid=top-champion] .truncate" },
  { name: "Admin Accounts", path: "/admin/people", admin: true, at: EIGHT },
  { name: "Admin Access levels", path: "/admin/people/access", admin: true, at: [...EIGHT, { size: FLOOR, side: "collapsed" }] },
  { name: "Admin Data & Integrations", path: "/admin/data", admin: true, at: EIGHT_AND_FLOOR },
  { name: "Admin Audit Logs", path: "/admin/audit", admin: true, at: EIGHT_AND_FLOOR },
];

test.describe.configure({ mode: "serial" });

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "a desktop window's one-screen pages (desktop project only)");
});

for (const row of ROWS) {
  test(`${row.name} fits one screen: ${row.at.length} configurations`, async ({ page }) => {
    test.setTimeout(120_000);
    await withWideText(page);
    const path = row.path.includes("{player}") ? row.path.replace("{player}", await demoPlayerId(page)) : row.path;
    for (const side of ["expanded", "collapsed"] as const) {
      const configs = row.at.filter((c) => c.side === side);
      for (const [i, { size }] of configs.entries()) {
        if (i === 0) {
          await page.context().clearCookies();
          await openAt(page, path, size, side, { admin: row.admin, cookies: row.cookies });
          if (row.then) {
            const before = (await measureWorkspace(page)).height;
            await row.then(page);
            await resizeTo(page, size);
            expect((await measureWorkspace(page)).height, `${cfg(size, side)}: ${row.name}: the state does not grow the page`).toBe(before);
          }
        } else await resizeTo(page, size);
        await fits(page, `${cfg(size, side)}: ${row.name}`, row);
      }
    }
  });
}
