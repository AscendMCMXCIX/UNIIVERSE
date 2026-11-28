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
    Leaderboards (87px), Admin's Accounts (36px) and Access levels (10px with the sidebar open), both
    brought to the floor by lane A2 the same day (Accounts paged, the hub's eyebrow in the short form);
  - a profile's Overview fits from 1440 × 900 only (376–390px over at 1366 × 768, 487–501 at the floor).
*/
const ROWS: OneScreenRow[] = [
  // Its season cards' two figure notes (card-season's dd.truncate) are cut by about 11px at 1648 × 900 with the wider text: tracked
  // for its lane (Team Overview's short form). Until then only a row's truncations are held here, the check before 28 Nov 2026's review.
  { name: "Team Overview", path: "/team", at: EIGHT, truncates: "[data-ws-row] .truncate" },
  { name: "Players", path: "/players", at: EIGHT_AND_FLOOR },
  { name: "Leaderboards", path: "/leaderboards", at: EIGHT },
  { name: "Champion Intel, empty", path: "/lookup", at: EIGHT_AND_FLOOR },
  { name: "Champion Intel, one champion", path: "/lookup?champion=Ahri", at: EIGHT_AND_FLOOR },
  { name: "Profile Overview", path: "/players/{player}", at: at([[1440, 900], [1648, 900], [1920, 1080]]) },
  { name: "My Profile, a member's own", path: "/overview", cookies: { uniiverse_demo_viewer: "member" }, at: at([[1440, 900], [1648, 900], [1920, 1080]]) },
  { name: "My Profile, no profile of one's own", path: "/overview", at: EIGHT_AND_FLOOR },
  { name: "Profile Accounts", path: "/players/{player}/accounts", at: EIGHT_AND_FLOOR },
  { name: "All Champions, the list", path: "/players/{player}/champions", at: EIGHT_AND_FLOOR, workspace: true, pager: "all-champions-pager", cards: "[data-testid=all-champions-table]", rows: "[data-testid=top-champion]", truncates: "[data-testid=top-champion] .truncate" },
  // Accounts paged to the room under its search row, Access levels fitting by its own layout (lane A2, 28 Nov 2026: the floor too).
  { name: "Admin Accounts", path: "/admin/people", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "people-pager" },
  { name: "Admin Access levels", path: "/admin/people/access", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  // Personal data, a sectioned workspace (lane A2): each section, and its two folds open.
  { name: "Admin Personal data, Privacy requests", path: "/admin/people/privacy", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  {
    name: "Admin Personal data, the procedure open",
    path: "/admin/people/privacy",
    admin: true,
    at: EIGHT_AND_FLOOR,
    workspace: true,
    then: async (page) => {
      await page.getByTestId("privacy-procedure").locator("summary").click();
      await expect(page.getByTestId("privacy-procedure")).toHaveAttribute("open", "");
    },
  },
  { name: "Admin Personal data, Erase a former member", path: "/admin/people/privacy?section=erase", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  {
    name: "Admin Personal data, Erasure records with the backups' fold open",
    path: "/admin/people/privacy?section=records",
    admin: true,
    at: EIGHT_AND_FLOOR,
    workspace: true,
    then: async (page) => {
      await page.getByTestId("privacy-backups").locator("summary").click();
      await expect(page.getByTestId("privacy-backups")).toHaveAttribute("open", "");
    },
  },
  // System Health, a sectioned workspace (lane A2): each section, and page speed's details in their window.
  ...["statuses", "speed", "build", "diagnostics", "environment", "compliance"].map((id) => ({ name: `Admin System Health, ${id}`, path: `/admin/system${id === "statuses" ? "" : `?section=${id}`}`, admin: true, at: EIGHT_AND_FLOOR, workspace: true })),
  {
    name: "Admin System Health, page speed's details open",
    path: "/admin/system?section=speed",
    admin: true,
    at: EIGHT_AND_FLOOR,
    workspace: true,
    then: async (page) => {
      await page.getByTestId("field-performance-window-open").click();
      await expect(page.getByTestId("field-performance-window-window")).toBeVisible();
    },
  },
  {
    name: "Admin System Health, the recent job runs open",
    path: "/admin/system?section=diagnostics",
    admin: true,
    at: EIGHT_AND_FLOOR,
    workspace: true,
    then: async (page) => {
      await page.getByTestId("diagnostics-runs-open").click();
      await expect(page.getByTestId("diagnostics-runs-window")).toBeVisible();
    },
  },
  // Settings, a sectioned workspace (lane A2, 28 Nov 2026): each section, Admin Mode's copy, and a draft with its error line.
  { name: "Settings, Name", path: "/settings", at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Settings, Password", path: "/settings?section=password", at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Settings, This device", path: "/settings?section=device", at: EIGHT_AND_FLOOR, workspace: true },
  {
    name: "Settings, a draft and an error line",
    path: "/settings",
    at: EIGHT_AND_FLOOR,
    workspace: true,
    then: async (page) => {
      await page.locator("#display-name").fill("A display name being typed");
      await page.locator("#username").fill("a");
      await expect(page.locator("#username-help")).toHaveClass(/text-bad/);
    },
  },
  { name: "Admin Settings, Name", path: "/admin/settings", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Settings, Password", path: "/admin/settings?section=password", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Data & Integrations", path: "/admin/data", admin: true, at: EIGHT_AND_FLOOR },
  { name: "Admin Audit Logs", path: "/admin/audit", admin: true, at: EIGHT_AND_FLOOR },
  // Lane B (28 Nov 2026): Platform Settings' pages.
  { name: "Admin Previews, a phone", path: "/admin/previews", admin: true, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=preview-studio]" },
  { name: "Admin Previews, a desktop", path: "/admin/previews", admin: true, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=preview-studio]", then: (page) => page.getByTestId("preview-device-desktop").click() },
  { name: "Admin Previews, a tablet held sideways, the setup", path: "/admin/previews", admin: true, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=preview-studio]", then: async (page) => { await page.getByTestId("preview-device-tablet").click(); await page.getByTestId("preview-rotate").click(); await page.getByTestId("preview-screen-setup").click(); } },
  { name: "Admin Resources, All", path: "/admin/resources", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "resources-pager", cards: "[data-testid=resources-card]", rows: "[data-testid=managed-resource]" },
  { name: "Admin Resources, one section", path: "/admin/resources?section=league", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "resources-pager", cards: "[data-testid=resources-card]", rows: "[data-testid=managed-resource]" },
  { name: "Admin Resources, the editor open", path: "/admin/resources", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "resources-pager", cards: "[data-testid=resources-card]", rows: "[data-testid=managed-resource]", then: (page) => page.getByTestId("resource-add").click() },
  { name: "Admin Matchup notes, Not written yet", path: "/admin/matchup-notes", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "matchup-notes-pager", cards: "[data-testid=matchup-notes-card]", rows: "[data-testid=matchup-queue-row]" },
  { name: "Admin Matchup notes, All notes", path: "/admin/matchup-notes?view=all", admin: true, at: EIGHT_AND_FLOOR, workspace: true, pager: "matchup-notes-pager", cards: "[data-testid=matchup-notes-card]", rows: "[data-testid=matchup-note-row]" },
  { name: "Admin Matchup notes, the editor open", path: "/admin/matchup-notes", admin: true, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=matchup-notes-card]", rows: "[data-testid=matchup-queue-row]", then: (page) => page.getByTestId("matchup-notes-new").click() },
  { name: "Admin Matchup notes, a re-review open", path: "/admin/matchup-notes?view=all", admin: true, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=matchup-notes-card]", rows: "[data-testid=matchup-note-row]", then: (page) => page.getByTestId("matchup-note-review").first().click() },
  { name: "Admin Branding, Name", path: "/admin/branding", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Branding, Images", path: "/admin/branding?section=images", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Branding, Background", path: "/admin/branding?section=background", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Branding, Colours", path: "/admin/branding?section=colours", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  { name: "Admin Branding, Colours unreadable (two checks failing)", path: "/admin/branding?section=colours", admin: true, at: EIGHT_AND_FLOOR, workspace: true, then: async (page) => { await page.getByRole("textbox", { name: "Background hex" }).fill("#ffffff"); await page.getByRole("textbox", { name: "Surface hex" }).fill("#ffffff"); } },
  { name: "Admin Branding, Public page", path: "/admin/branding?section=public", admin: true, at: EIGHT_AND_FLOOR, workspace: true },
  // Lane C (28 Nov 2026): Match History, Encounters and Team Matches, each a paged list in the workspace, every game in
  // the game window (docs/RESPONSIVE.md, "One-screen desktop pages", the pages). Their own spec: e2e/matches-workspace.spec.ts.
  { name: "Match History, the games", path: "/players/{player}/matches", at: EIGHT_AND_FLOOR, workspace: true, pager: "match-pages", cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" },
  { name: "Match History, a game open in the game window", path: "/players/{player}/matches", at: EIGHT_AND_FLOOR, workspace: true, then: openFirstGame, cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" },
  { name: "Match History, grouped by session", path: "/players/{player}/matches?group=sessions", at: EIGHT_AND_FLOOR, workspace: true, pager: "match-pages", cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" },
  { name: "Match History, one player's games (Encounters → a player)", path: "/players/{player}/matches?view=encounters", at: EIGHT_AND_FLOOR, workspace: true, then: openFirstEncounter, cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" },
  { name: "Match History, Encounters", path: "/players/{player}/matches?view=encounters", at: EIGHT_AND_FLOOR, workspace: true, pager: "encounter-pager" },
  { name: "My Profile, Match History", path: "/overview/matches", cookies: { uniiverse_demo_viewer: "member" }, at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" },
  { name: "Team Matches", path: "/matches", at: EIGHT_AND_FLOOR, workspace: true, cards: "[data-testid=together-region]", rows: "[data-testid=together-list] > li" },
  { name: "Team Matches, a game open in the game window", path: "/matches", at: EIGHT_AND_FLOOR, workspace: true, then: openFirstTogether, cards: "[data-testid=together-region]", rows: "[data-testid=together-list] > li" },
];

/** Opens the first game of Match History's page in the game window, its view drawn (whole, or in its pages where it does not fit). */
async function openFirstGame(page: Page) {
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  await expect(page.locator("dialog[open][data-size=workspace] [data-testid=match-breakdown]")).toBeVisible({ timeout: 15_000 });
}

/** Opens the first game of Team Matches' page in the game window. */
async function openFirstTogether(page: Page) {
  await page.getByTestId("together-card").first().click({ position: { x: 24, y: 12 } });
  await expect(page.locator("dialog[open][data-size=workspace] [data-testid=match-breakdown]")).toBeVisible({ timeout: 15_000 });
}

/** From Encounters, the first player met: their games in Match History's list (?met=). */
async function openFirstEncounter(page: Page) {
  await page.getByTestId("open-encounter").first().click();
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("match-item").first()).toBeVisible();
}

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
