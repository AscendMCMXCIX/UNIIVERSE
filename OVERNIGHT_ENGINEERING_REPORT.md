# Overnight engineering report (2–3 November 2026)

A record of one autonomous session on UNIIVERSE's long-term quality: desktop evolution, performance,
UI consistency, security and maintainability. It is updated as the work goes. Every claim says how it
was checked; anything not verified is marked as such.

**Delivery status** (from 3 Nov, at your request, every change is described by where it actually is):
- **Implemented:** the code exists on a branch, and nothing more is claimed.
- **Tested:** it passed the named checks (unit, database, browser suites, CI), on a branch.
- **Deployed:** merged to `main` and running in production (Vercel deploys `main`).
- **Production-verified:** deployed, and checked on the live site after the deploy (smoke run, and
  for anything visible, the live pages themselves).

Only production-verified work is described as done. Work in a draft or open pull request is at most
tested.

Other labels used below:
- **Prototype**: works in isolation, not intended for production as is.
- **Proposal**: a recommendation, not built.

## Starting state (2 Nov 2026, 11:23 UTC)

- **`main`** at `8a36217` (PR #168, docs only). Production runs `8b079e9` (PR #167): the post-deploy
  `smoke` and `perf-probe` run passed on 2 Nov.
- **Open pull requests:**
  - #163 Dependabot: next 16.4.2 → 16.4.3, jose, lucide-react, PGlite, eslint-config-next. CI was green
    on 31 Oct; `main` has moved since.
  - #86 and #138: held drops of retired tables. They wait for the owner's backup check and stay held.
- **Unmerged research:** `research/draft-intelligence` (offline Draft pilot, concluded; never merged).
- **GitHub Actions this month:** four full CI runs on 2 Nov (about 31 to 35 minutes each), their four
  merges and the scheduled Data jobs runs: about 150 of the 3,000 included minutes.
- **Database:** 361 MB of the free plan's 0.5 GB, growing about 2 MB a day (`docs/HOSTING_USAGE.md`).
- **Riot:** production runs on a Development key. Registering a Personal key is the owner's step, and a
  re-keying job must exist first (`docs/RIOT_COMPLIANCE.md`, findings 1 and 2).

## Ground rules for this session

From the owner's brief and `CLAUDE.md`:
- work on isolated branches; prepare pull requests but **merge nothing** (a merge to `main` deploys to
  production, and this session's changes are unreviewed);
- no production data, credentials, Riot keys or migrations touched; no paid services;
- no Draft, no League client integration without a documented Riot review, no game-memory access;
- measure before and after any performance change, and keep the evidence.

## Plan

1. Architecture and product audit (read only).
2. Desktop options against this repository: Tauri 2 (dedicated frontend or thin shell), Electron, the
   PWA. A prototype only if justified.
3. Performance: existing measurements first, then a local baseline; fixes only with before/after
   evidence.
4. Security and Riot compliance review; fix realistic gaps.
5. UI consistency and accessibility through shared components.
6. Maintainability: dead code, dependencies, tests.
7. Recommendation, roadmap, release requirements and approvals.

## Branches and pull requests (at the end of the session; the release is below)

| Branch | PR | What | Status |
|---|---|---|---|
| `security/page-guards` | #170 | Every member page checks access itself (high finding) | **Deployed** (c17b002), smoke passed. Not yet production-verified: the live forged-cookie request is still to run (section 7) |
| `security/hardening` | #172 | Redirects, throttle, errors, Riot hosts, public images, timing, dead actions | **Deployed** (37c19f6), smoke passed. Its fixes are server-side and covered by tests; none was exercised on the live site |
| `perf/season-patch-memo` | #169 | Season figures read each game's patch once | **Production-verified** (33590c7): the production perf-probe measured the gain |
| `a11y/label-in-name-scroll-regions` | #173 | Names that match what controls show; wide tables the keyboard can scroll; axe at phone width and in two windows | **Deployed** (90dabfb), smoke passed. Not yet production-verified: its screens were not checked on the live site |
| `pwa-windows-integration` | #171 (draft) | Installed app: jump-list shortcuts, one reused window | Optional; unit tests, build and its browser spec pass; full suite in CI when marked ready |
| `overnight/engineering-report` | #174 | This report | Docs only (CI and Vercel skip it) |
| `ops/riot-id-family-audit` | #175 | Riot key evidence: the key's tier from Riot's stated limits, and which stored games carry the current player ids | **Production-verified** (`1538524`): its reports ran on production (run 41602528625). The key is Personal and no stored game needs re-keying; `docs/RIOT_COMPLIANCE.md` is updated in #181 |
| `leaderboards-model` | #177 | Leaderboards' proposed model, as tested domain code, and its production audit; the page is unchanged | **Deployed** (`d72619a`), smoke passed; its audit ran on production (run 41597099104). Findings and the proposed rules: [the Leaderboards report](https://claude.ai/artifact/UtfbhTL5RJqub513acZpDJ) |
| `dependabot/…minor-and-patch…` | #176 | next 16.4.3, eslint-config-next 16.4.3, lucide-react 1.65.0, PGlite 0.5.13 | **Deployed** (`cda9a66`), smoke and perf-probe passed (run 41606535813) |
| `ops/backup-retired-tables` | #179 | Each backup proves the retired tables that #86 and #138 would drop restore with all their rows | **Deployed** (`9b6c09f`). Its first production run (Database backup, run 41732063033) restored all 72 tables with matching counts, including the 24 retired ones (992,581 rows), and the encrypted copy (67 MB) decrypts to the same dump |
| `ops/live-check` | #180 | A read-only live check of the deployed site at three widths, and the fix for a flaky Encounters browser test (Findings, 3b) | **Deployed** (`e2c5169`). It now runs from GitHub's runner after every production deployment and daily, inside the Production check (#182) |
| `docs/riot-key-evidence` | #181 | `docs/RIOT_COMPLIANCE.md`: the key is Personal, no re-keying, and every check that needs no portal access | **Merged** (`4391e51`, docs only). The Personal key is confirmed by a second `riot-check` 24 h 39 min after the first |
| `ops/production-automation` | #182 | The Production check after every deployment and daily (security, Riot rules, public pages at three widths with axe, backup age, database size, Monday perf probe), one issue per failing check, the Riot endpoints pinned by a test | **Deployed** (`7bdaf42`). Its first run on production: 100 checks passed, none failed (run 41736960841) |
| `ux/encounters-navigation` | #183 | Match History and Encounters: one navigation, All first, a player's games in Match History itself | **Deployed** (`508f0b3`). CI and WebKit green; the Production check passed on the deployed commit (run 41739546456). Not production-verified: the member pages need the verification account (section 7) |
| `ops/db-size-alert` | #184 | The database's size reaches you from 80% (one issue, with the remedy); a real member's pages tried signed out and with a forged session on every check | **Deployed** (`196f866`). The Production check on it (run 41744264790): 106 passed, none failed, including a real member's profile, champions and matches, signed out and with a forged session, all turned away with no player data: the #170 fix confirmed on production |
| `ux/layout-consistency` | #178 | Neutral frame, compact All Champions, Team Matches opens games under their cards, the layout rules | **Deployed** (5e11ba5), smoke passed. Not yet production-verified: its screens were not checked on the live site (this environment cannot reach it, section 7) |

Before the release, all six original branches merged cleanly with `main` and with one another (all 15
pairs, checked with `git merge-tree` on 2 Nov).

## Release (2–3 Nov 2026, approved by you)

You approved releasing #170, #172, #169 and #173, in that order and one at a time, and #178 on 3 Nov.
Each one was:
1. reviewed;
2. brought up to date with `main` (`main` merged in, never rebased) and validated locally again;
3. merged with the merge method and its expected head commit, once every CI job on that commit had
   passed;
4. checked in production with one Data jobs run before the next one started.

| PR | Merged as | CI on the merged commit | Production check (Data jobs) |
|---|---|---|---|
| #170 page guards (high) | `c17b002` | all four jobs green | smoke, run 41532558447: production on `c17b002`, health ok |
| #172 hardening | `37c19f6` | all four jobs green (run 41533293385) | smoke, run 41540033680: production on `37c19f6`, database 5 ms, no failing job |
| #169 season figures | `33590c7` | all four jobs green (run 41540441511) | smoke and perf-probe, run 41546289924: production on `33590c7`, health ok, database 3 ms, no failing job |
| #173 accessibility | `90dabfb` | all four jobs green (run 41547593587) | smoke and perf-probe, run 41553164525: production on `90dabfb`, health ok, no failing job |
| #177 Leaderboards model (no page change) | `d72619a` | all jobs green on the PR's head (run 41584341897) | smoke and data-audit, run 41597099104: production on `d72619a`, health ok, database 5 ms, no failing job; the audit's findings are in [the Leaderboards report](https://claude.ai/artifact/UtfbhTL5RJqub513acZpDJ) |
| #175 Riot key evidence (read only) | `1538524` | all jobs green on the PR's head (run 41597156093) | smoke, riot-check and data-audit, run 41602528625: production on `1538524`, health ok. The key was accepted with Riot's default limits (not Production) and has not expired in more than seven days (not Development), so it is Personal. All 4,951 member places in stored games carry the current ids. Public Riot data is off |
| #176 Dependabot (next 16.4.3 and others) | `cda9a66` | all jobs green on the PR's head after updating it with `main` (run 41602111811) | smoke and perf-probe, run 41606535813: production on `cda9a66`, health ok, database 4 ms, no failing job. Warm times unchanged (roster 188 ms); the first cold reading after the deploy was higher (roster 429 ms, Encounters 1,113 ms), within the spread single readings have shown, so it is re-measured before any conclusion |
| #178 UX consistency | `5e11ba5` | all jobs green on the PR's head (run 41579132017: 517 browser tests passed, 353 skipped by design, none retried) and WebKit (run 41579431950); the push to `main` reused that result | smoke, run 41583580731: production on `5e11ba5`, health ok, database 2 ms, no failing job; member pages redirect signed-out visitors to sign-in |

Every pre-merge revalidation passed:
- #172: unit 560, database 470, build, 9 targeted browser specs (52 passed).
- #169: unit 562, database 470, build, 5 targeted browser specs (35 passed).
- #173: unit 562, build, 5 targeted browser specs (48 passed).

Nothing failed, so the sequence never had to stop.

**#178's first CI run failed, and was fixed before the merge.** On d07a35f two browser tests failed in
CI only (run 41573700916). Neither failure came from #178's changes:
- **A scoreboard rank badge on a 375 px phone** ended 7.5 px inside the KDA column. The badge, and the
  pulsing stand-in shown while ranks are checked, were fixed-width. The badge now shrinks and ends
  its text in an ellipsis; the whole rank stays in its title and for screen readers.
- **The champion window's accessibility audit** ran while the window was dimmed on purpose, during
  loading. The test now waits for the window to settle. The page is unchanged.

Both were validated locally (verify, build, the affected specs on every viewport) before the push,
and the next CI run and WebKit passed.

**Performance in production:** perf-probe before the release (run 41412153154, 2 Nov 08:19 UTC,
`8b079e9`), then twice after it (run 41546289924 at 23:33 UTC on `33590c7`, and run 41553164525 at
00:29 UTC on `90dabfb`, the final state). Times are in ms, cold / warm:

| Step | Before | After (23:33) | After (00:29) |
|---|---|---|---|
| Team Overview roster (`team.roster`) | 535 / 256 | 353 / 183 | 329 / 185 |
| A player's overview (`player.overview`) | 71 / 30 | 58 / 29 | 71 / 19 |
| Leaderboards data (`leaderboards.data`) | 281 / 48 | 224 / 42 | 289 / 100 |
| Played together (`matches.playedTogether`) | 94 / 51 | 104 / 41 | 98 / 34 |
| Matchup window (`matchups.window`) | 623 / 39 | 651 / 87 | 565 / 39 |
| Encounters (`profile.encounters`) | 828 | 1,031 | 737 |
| Database round trip (`db.ping`) | 4.3 | 3.5 | 2.8 |

- **The roster's gain is #169's,** and both runs agree: cold 535 → 329–353 ms (about −36%), warm
  256 → 183–185 ms (−28%). Locally it was 62% faster warm. In production the warm read still includes
  its database reads (76 KB) and the function's own overhead.
- **Single readings move a lot:** Encounters read 1,031 ms and then 737 ms, an hour apart, on the
  same data. Leaderboards' warm read moved from 42 to 100 ms. So only differences that both runs
  agree on, like the roster's, count. Neither the matchup window nor Encounters is touched by the
  released changes.
- **Encounters stays the slowest step,** at 0.7 to 1 s cold. The planned fix is a stored summary
  table (section 3).

**Security in production:**
- **The high finding (#170):** production runs code that refuses these requests. The page-guards
  test fails any page that does not check access itself.
- **Not done:** a request to production with a made-up session cookie, as the local reproduction
  used. This session's network cannot reach the production site. Section 7 gives the one command
  that confirms it.
- **#172's fixes** are in the deployed commit, each covered by its own tests.

## Findings and work

### 1. Architecture audit (verified from the repository)

**Stack.** Next.js 16.4 App Router with React 19.3, React Server Components and server actions;
Drizzle ORM over postgres.js (Supabase Postgres, free plan); PGlite for local, demo and browser tests;
Vercel Hobby in `syd1`, with the database in the same region (`db.ping` 2 to 4 ms in production);
GitHub Actions CI (typecheck, lint and unit tests; database tests on PostgreSQL 16; one build and the
Playwright suite on phone, tablet and desktop).

**Size and tests:**
- 47 pages, 10 API route groups, 114 client modules, 13 server-action modules exporting 88 actions,
  158 server modules, 62 domain modules;
- on `main`: 548 unit tests (83 files), 466 database tests (71 files), 63 Playwright specs run on
  three viewports, and page-wide axe scans of every player and admin page (desktop width).

**Boundaries already enforced by tests:**
- browser code never reaches server-only code (`client-imports.test.ts`);
- every server action establishes who is asking first (`guards.test.ts`);
- design tokens and the date and number formatting rule.

**What a second client could share:**

| Layer | Shareable with another client? | Evidence |
|---|---|---|
| Domain logic (62 modules) | Yes, as plain TypeScript | None imports React, Next.js or server code |
| UI (114 client modules) | Only inside this Next.js app, or a window that shows it | 43 use Next.js routing; 33 call server actions directly |
| Data and mutations | No: server-rendered pages and 88 server actions, no JSON API | API routes cover health, freshness, vitals, images, jobs and mode only |
| Sign-in | Browser cookies only | Opaque HTTP-only session cookie, 24 hours from sign-in, no refresh token |

**What must stay on the server:** the Riot API key and every Riot request, database credentials,
session checks and permissions, the job scheduler and its `CRON_SECRET`, image processing, egress
accounting, and the privacy and erasure tools.

**What a separate frontend (desktop or otherwise) would need first:** a versioned JSON API covering
about 47 pages' data and 88 mutations, a token sign-in with refresh and revocation, CORS and
per-client rate limits, API contract tests, and support for older installed versions. That is a
second product to build and maintain, not a restructuring.

### 2. Desktop: recommendation (Proposal)

**Recommendation: keep one product, the web app and its installable PWA, and do not build a native
Windows app now.** Improve the installed PWA where Windows rewards it. If you want a Store presence,
publish the same PWA in the Microsoft Store: it's free, Microsoft signs it, and the listing can be
private. Reconsider a native shell only when a desktop-only capability is approved. In practice that
means reading the League client for automatic post-game sync, which needs a documented Riot review
and Riot's approval first. No prototype was built: under the brief's own condition ("if a desktop
application is justified"), the evidence below does not justify one.

**Why, with evidence:**
1. **A dedicated React/Vite desktop frontend (the brief's leading option) would be a second
   product.** The audit above shows why: half the UI is tied to Next.js routing or server actions,
   there is no data API, and sign-in is a browser cookie. For about 11 members, that doubles the UI,
   the API surface and the tests.
2. **No speed gain is available from a native shell.**
   - UNIIVERSE's measured slowness is on the server (production `perf-probe`, 2 Nov: roster 535 ms
     cold, Encounters 828 ms cold), and every client waits for it equally.
   - The one Windows benchmark found with a stated method (empty apps, October 2026) measured
     Tauri 2.12 at about 576 ms to start against Electron's 153 ms, with similar memory (about
     300 MB). Tauri's advantage was installer size only.
   - This session's server fix cuts the roster's warm time by 62% for every client at once.
3. **The capabilities that would justify a desktop app are not available to UNIIVERSE today:**
   - the League client API is "not officially supported" for third-party apps, and its use is
     approval-gated;
   - Riot has blocked game-memory access for third-party apps since 6 Oct 2026;
   - champion-select tools fall under the retired Draft feature.

   Without them, a desktop app adds a tray icon, start at login and hotkeys, which matter little
   for a post-game team tool.
4. **Distribution would cost money and keys:**
   - SmartScreen trust needs a paid signature. Azure Artifact Signing ($9.99 a month) takes
     individuals only in the US and Canada; otherwise an OV certificate costs about $150–300 a year,
     kept on hardware. Unsigned installers show "Windows protected your PC".
   - Tauri's updater needs a signing key whose loss strands every installed copy, and private
     GitHub Releases need a proxy to serve updates.
   - Windows CI minutes cost more than Linux ones.
5. **Maintenance:** Electron needs a release about every 24 weeks to stay on a supported version.
   Tauri relies on the self-updating WebView2, but adds a Rust toolchain, keys and a release
   pipeline. A Tauri security fix in 2.11.1 (May 2026) shows how much the version matters for a
   shell that exposes native commands to remote content.

**What the PWA already gives on Windows:**
- install from Edge or Chrome, with a Start menu entry, a taskbar icon and its own window;
- self-update on every deploy;
- an offline notice, and install guidance in the app.

Chromium also offers taskbar jump lists (`shortcuts`), reusing the open window (`launch_handler`),
app badges, protocol handlers, and Web Push notifications. Web Push would need a server-side push
job and a subscriptions table.

**Options compared** (✓ good, ~ partial, ✗ poor):

| | Web and PWA (recommended) | Tauri 2 thin shell around the site | Tauri 2 with its own Vite UI | Electron |
|---|---|---|---|---|
| Code shared with the website | ✓ all | ✓ all UI and server; plus a small native layer | ✗ needs a JSON API, token sign-in and a second UI | ~ like either Tauri option |
| New infrastructure | none | Windows build job, update host, signing | the same, plus the API | the same as the Tauri shell |
| Signing and trust | none needed; Store MSIX free | OV certificate or Artifact Signing | the same | Store MSIX possible; otherwise the same |
| Updates | every deploy, automatic | signed updater; key custody | the same | electron-updater or the Store |
| Desktop-only abilities | jump list, badges, push, window reuse | tray, start at login, League client (if approved) | the same | the same |
| Maintenance for one owner | lowest | moderate | highest | moderate to high (Chromium releases) |
| Riot surface | unchanged | a review is needed before any League client use | the same | the same |

**When to revisit:** Riot approves a specific League client use for UNIIVERSE's registered product,
and you approve the signing cost. Then build a Tauri 2 thin shell around the deployed site:
- version 2.11.1 or later;
- remote IPC allowed only for the site's own origin, with no shell, file or process permissions;
- single-instance with deep links, start at login off by default;
- a signed updater whose private key is held outside the repository.

### 3. Performance (Verified locally, then in production: see Release)

**Where the time goes,** by layer, from existing measurements first:
- **Network:** the functions (Vercel `syd1`) and the database sit in the same region. A database
  round trip is 2 to 4 ms (`perf-probe`). Members' own network times are in the field data (Admin →
  System Health → "Page speed in members' browsers"), which only you can open.
- **Server:** production `perf-probe` on 2 Nov named the slowest steps: Encounters 828 ms cold,
  the matchup window 623 ms, Team Overview's roster 535 ms (256 ms warm) and Leaderboards 281 ms.
  - Encounters and matchups read large stored records (match players, timelines) that Postgres
    keeps compressed, so a cold read is mostly unpacking. The real fix is a stored summary table:
    deferred until database space is freed (see risks).
  - The roster was CPU, fixed below.
- **Rendering:** documented in `docs/PERFORMANCE.md`:
  - opening a window on a long Match History page costs one long frame (142 to 367 ms), from the
    native modal's style recalculation;
  - changing profile tab has a 100 ms longest frame;
  - each page's own client code is 62 to 121 KB compressed.
- **Perceived:** loading states cover each section group and the profile tabs; pages update
  themselves without a reload.

**Fix: season figures read each game's patch once** (PR #169, branch `perf/season-patch-memo`):
- **Found:** a CPU profile of the roster at production volume. Re-parsing each game's patch text
  took about 920 of the 1,537 ms spent building player overviews.
- **Change:** memoise two pure functions (bounded), and group a season's games by champion in one
  pass. A unit test compares the new grouping with the old four scans on 600 generated games.
- **Measured** on a local database scaled to production volume (3,878 games), with the code
  switched back and forth three times (medians):

  | Measure | Before | After |
  |---|---|---|
  | First roster load (in-memory caches empty) | 388 ms | 229 ms |
  | Roster, warm | 185 ms | 71 ms |
  | One player's season overview, warm | 28.3 ms | 10.3 ms |

- **Checks:**
  - locally: `pnpm verify` (550 unit tests), the database suite (466) and the full browser suite
    (867) pass;
  - CI on PR #169 is green on every job.
  - In production after the merge: the roster went from 535 to 353 ms cold and from 256 to 183 ms
    warm (Release, above).

**Found, not changed:** 38 places call `router.refresh()` after a server action. Several follow
actions that already revalidate the page, so the server renders the page twice; the user does not
wait for the second render, but it costs server time and database reads. Each needs its own check
before removal.

### 3a. UI consistency and accessibility (Verified locally; released with #173)

The visual consistency passes of the last two weeks (readability, premium identity, consistency
across Encounters, All Champions, Team Matches and Leaderboards) are recent and documented in
`docs/STANDARDS.md`. Redoing them would only repeat that work. The evidence-based gap was
accessibility coverage: axe ran only at desktop width, and never on a teammate's profile or in
the Team player window.

**A wider sweep** (axe, WCAG 2.0 to 2.2 A and AA, every impact level) covered every player and admin
page on phone, tablet and desktop, a teammate's four profile tabs, and the Team player window. It
found two serious issue types and nothing moderate or minor:
- **Label in name (2.5.3):**
  - a champion's lettered stand-in, shown whenever a portrait cannot load, put two letters into
    links named "Rumble: open its statistics";
  - Team's "Edit on profile" link carried a name that did not contain its visible words.
- **Keyboard (2.1.1):** System Health's field-data table scrolled sideways on phones with nothing
  the keyboard could reach.

**Fixed through shared components** (branch `a11y/label-in-name-scroll-regions`):
- A new `ScrollRegion` makes a wide table focusable and named; five tables use it.
- Team's link name now starts with its visible words.
- **Links and game cards named by what they show:**
  - The first fix named the portrait stand-in like a picture and hid its letters from screen
    readers. Unit tests passed, but the full browser suite showed axe still failing the links: axe
    compares an `aria-label` with the text on screen, hidden or not.
  - A speech-control user sees the same letters, so the fault was real.
  - The pool preview's links now take their name from the portrait ("Rumble") plus hidden words
    (": open its statistics"), the pattern already used in Access.
  - Checking the windows the sweep had not opened (the champion window, Encounters' details, the
    match window, a game's four tabs) found one more case: the champion window's game cards, whose
    name left out the figures they show. They are now named by their content.
  - Every other window was clean at desktop and phone width.
- **Kept fixed:** `e2e/quality.spec.ts` now runs axe at 375px on every page, on a teammate's
  profile, and in the Team player and champion windows.

**Not covered by automation:** screen reader and speech-control behaviour on real devices. Those
belong on the real-device checklist.

### 3b. A flaky browser test on `main` (found by #180's CI; fix in #180)

- **What failed:** `e2e/encounters.spec.ts` ("Against, Alongside and All") on phone, tablet and
  desktop at once, on #180, whose diff has no app code. Alongside listed nobody.
- **Cause:** the demo's Encounters fixture placed its recurring players by a hash of each game's
  match id. A member's games are named after their player id, which is random, so every fresh demo
  placed them differently. **Measured on `main`:** in 12 fresh demos, the Mid laner met nobody twice
  alongside in 2, the list this test opens. CI starts one demo per run, so roughly one run in six
  would fail (an estimate from those 12).
- **Fix (in #180, 021a0a0):** the placement follows the member's name and the game's number, so
  every fresh demo is the same. `tests/db/demo-encounters.test.ts` seeds two demos and checks the
  placements match and the lists the test reads are not empty. It fails on `main`'s fixture and
  passes with the fix. Production is unaffected: the fixture never runs against its database.
- **How often it cost a run:** of the last 60 CI runs (36 passed, 21 skipped as docs only, 3
  failed), this failure is one. A second, on 29 Oct, failed another test in the same spec on every
  device at once, the same pattern; its log does not prove the cause. The third was #178's two
  real bugs.
- **Left as it is:** the demo's game timelines are also seeded from those ids, so they vary
  between starts too. No failure in those 60 runs traces to them, so they are unchanged.

### 4. Security (one high finding fixed; branches ready)

A read-only review of the whole repository (all 13 server-action modules, all 12 route handlers,
sessions, uploads, headers, dependencies) found no critical issue. Every finding below was checked
against the code before acting; the high one was reproduced.

**High: a teammate's profile data reached signed-out requests** (PR #170, branch `security/page-guards`,
**merge first**):
- **What happened:**
  - Next.js renders a layout and its page at the same time, so the profile layout's access check
    did not stop the page from running.
  - A request with any made-up cookie of the right shape (the proxy only checks the shape) got a
    redirect to `/login`, but the redirect's body still carried the page's data: linked Riot IDs,
    PUUIDs and ranks.
  - Player ids appear on the public team page.
- **Reproduced:** on a local production build in sign-in mode, 4 of 37 member pages leaked; all
  four are profile tabs.
- **Fixed:** every member and admin page now calls `requirePageAccess` itself (also refusing
  sessions that still owe setup).
- **Prevented:** a new test, `src/app/page-guards.test.ts`, fails for any page that does not call
  it. It fires on 11 pages on `main`.
- **Verified:** after the fix the same requests return no member data, and a signed-in owner still
  opens every page. `pnpm verify` and the database suite pass.
- **Production:** it runs the same code, so it was very likely exposed. This cannot be confirmed
  without probing production, which this session did not do.

**Medium and low** (PR #172, branch `security/hardening`):
- **Open redirect after sign-in:** `/login?next=/\evil.example` passed the check.
- **Throttle race:** parallel sign-in, setup-key or recovery attempts all passed the 8-per-15-minutes
  check. Attempts are now counted before they are checked.
- **Egress:** anonymous requests for public member pictures read the whole image from the database
  every time. The bytes are now kept for a minute per instance, and the member check still runs on
  every request.
- **Raw database errors** (SQL text and values) reached the browser in 16 places.
- **Riot platform not validated:** it was stored as typed, and the client builds the API host from
  it. Both are now checked.
- **`UNIIVERSE_REQUIRE_AUTH=false` worked on Vercel:** one stray variable would have made every
  visitor the owner.
- **Timing:** a wrong username answered faster than a wrong password, and the setup key comparison
  revealed the key's length.
- **Statistics without access:** a teammate's season figures and Riot IDs were sent to viewers
  without "view teammates' statistics".

**Not changed, for you to decide:**
- scrypt's cost (2^14, below OWASP's current 2^17; raising it needs rehash-at-sign-in);
- a nonce-based Content-Security-Policy;
- the database connection's certificate check (`require` without verification);
- `/api/health` naming missing variables and the pooler host in errors;
- the setup key's strength. It is a permanent Owner credential, so make it long and random.

**Dependencies:**
- `pnpm audit --prod` reports 0 advisories across 106 packages.
- Production's Next.js 16.4.2 already carries the 14 October 2026 security fixes, which shipped in
  16.4.1 ([Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026)).
  `sharp` 0.35.5 meets that advisory's workaround.
- No advisory is newer than 14 October: that is the latest entry on Next.js's own
  [advisory page](https://github.com/vercel/next.js/security/advisories), read on 2 Nov.
  - 16.4.3 (23 Oct) is described as bug fixes only. That comes from a secondary source
    ([guardlayer](https://www.guardlayer.io/blog/nextjs-latest-safe-version)), checked through
    search results only.
  - 16.4.4 reached npm on 2 Nov at 10:49 UTC. Its GitHub release had no notes yet when read.
- Dependabot PR #163 was green on 31 Oct and needs `main` merged in. It is useful, not urgent.
  - Dependabot opened #176 on 2 Nov with the same group (next 16.4.3, lucide-react, PGlite,
    eslint-config-next). Its CI is green. Merging it is yours to approve.
- **Dependabot alert #9 (moderate):** minimatch below 11.0.1 (GHSA-g3hv-75wg-m249), reached only
  through eslint and eslint-config-next. It is development tooling and never ships; `pnpm audit
  --prod` stays clean.

### 4b. Riot compliance and the key (investigated 2 Nov; no credential or data changed)

The compliance review of earlier today (`docs/RIOT_COMPLIANCE.md`, PR #168) still stands. Nothing
in this session changed what UNIIVERSE reads from Riot or shows, and no key or secret was read,
changed or printed. The key is identified only by the four-character fingerprint the app reports,
and this report does not repeat it.

**The key, from evidence** (your questions of 2 Nov):
1. **Is there a working key?** Yes. `riot-check` succeeds in production (last on 2 Nov at
   22:08 UTC), and account syncs keep succeeding.
2. **Development or Personal?** **Personal (confirmed 3 Nov at 22:47 UTC).**
   - The same key, by fingerprint, has answered for at least seven days. A Development key expires
     24 hours after it is issued.
   - The limits Riot applies are 20 requests a second and 100 every 2 minutes. Development and
     Personal keys share those limits; a Production key has more.
   - **Made certain:** the `riot-check` of 3 Nov at 22:47 UTC (run 41733812716) found the same
     fingerprint, accepted, 24 h 39 min after the one of 2 Nov at 22:08 UTC (run 41534575560). That
     rules out a Development key. The fingerprint is not written here.
   - #175 also makes `riot-check` report the limits Riot states for the key and the tier they imply.
3. **Can it be used without migrating the stored player ids?** Yes, for every stored game:
   #175's audit (`data-audit` → `riotIdFamily`, run 41602528625) found all 4,951 member places in
   stored games carrying the member's current id, at every age, and none carrying another.
4. **What a safe transition needs:** nothing, while the key stays the same. #175 is merged, its
   audit ran, every age carries the current ids, and `docs/RIOT_COMPLIANCE.md` item 1 is corrected
   (#181). A re-keying job is needed only if production ever moves to another application's key.

   No Vercel setting or key change is needed for any of this.

**Also:**
- **A Personal key is enough** while public pages carry no Riot data (the default).
  `UNIIVERSE_PUBLIC_RIOT_DATA` stays off; #175's audit reports it.
- **Hardened tonight:** the Riot API key can only travel to `*.api.riotgames.com` (L7, now deployed
  with #172), and every page that shows Riot data checks access itself (#170, deployed).
- **No League client integration,** game-memory access or automation exists or was added. Since
  6 Oct 2026, Riot blocks third-party game-memory access anyway. A desktop companion using the League
  client would need its own registration and Riot's approval (section 2).

### 4a. Maintainability (Verified by reference counts and the test suites)

- **Removed** (hardening branch):
  - five server actions with no caller anywhere, which Next.js gave no action id;
  - the `jose` package, unused since sessions moved to the database.
- **Candidates left for you to decide** (a reference count over `src`, `e2e`, `tests` and `scripts`;
  running knip was refused by this session's permission policy, so a local script did the count):
  - 39 exported names are used nowhere, not even in their own file. Some are deliberate: schema
    tables of retired features stay while their tables exist.
  - Clear examples of dead code: `SeasonTiles` (`players/player-card.tsx`), `RoleTag`
    (`role-icon.tsx`), three unused profile-model functions in `champion-model/derived.ts`, invite
    helpers in `repositories/users.ts`, `getDb` in `db/client.ts`.
  - `updatePlayerAction` and `deletePlayerAction` are reachable only from the database tests, which
    use them to check permissions. Retiring them means moving those checks to the live actions.
  - 359 more exports are used only inside their own file: `export` could go, cosmetic only.
- **Boundaries:** the client-imports, action-guard and (new) page-guard tests keep server code,
  identity checks and page checks where they belong. The domain layer (62 modules) has no
  framework imports.
- **Tests added this session:**
  - season-figure equivalence;
  - patch memo;
  - page guards;
  - return paths;
  - error words;
  - Riot hosts;
  - auth mode on Vercel;
  - throttle bursts;
  - the public picture cache;
  - PWA shortcuts;
  - axe at phone width, on a teammate's profile and in the Team player and champion windows.

### 5. Roadmap (ordered; Proposal)

**Necessary: the platform you already have.**
1. **Merge the security fix for profile pages** (#170): a confirmed data exposure.
2. **Merge the hardening PR** (#172), the season figures speed-up (#169) and the accessibility
   fixes (#173).
   Afterwards, run one Data jobs run with `smoke perf-probe`.
3. **Free database space before it runs out:**
   - 361 MB of the free plan's 0.5 GB, growing about 2 MB a day: about two months left;
   - once your backup is verified and an offline copy kept, the held drops (#86, #138) free about
     217 MB.
4. **Riot key:** the re-keying job (rehearsed on a copy), then you register a Personal key
   (`docs/RIOT_COMPLIANCE.md`).
5. **Real-device checklist:** signed out, phone and computer.
6. **Dependabot #163:** merge `main` into it first; next 16.4.4 has followed since.

**Optional: chosen only if wanted.**
7. **The installed app on a computer** (branch `pwa-windows-integration`, draft): jump-list
   shortcuts and one reused window.
8. **A Microsoft Store listing** of the same PWA through PWABuilder: free, signed by Microsoft, and
   can be private to named accounts. It needs your Partner Center account (ID check). Adding
   screenshots to the manifest first improves the listing.
9. **Notifications for new games** (Web Push to installed apps on Windows, Android and iOS 16.4+):
   - needs a push key in Vercel, a subscriptions table (a migration) and a sending step in the tick;
   - worth it only if members ask for it.
10. **A stored "who met whom" summary** for Encounters (828 ms cold): a new table, after step 3.
11. **A native desktop shell:** only on the conditions in section 2.

### 6. Release requirements (Proposal; most are already enforced)

| Area | Requirement | Enforced by |
|---|---|---|
| Correctness | Typecheck, lint, 550+ unit tests, 466+ database tests, the browser suite on three viewports | CI on every ready PR; `pnpm verify` locally |
| Security | Every server action and every member page establishes access itself | `guards.test.ts`; `page-guards.test.ts` (new) |
| Security | No known advisories in production dependencies; Dependabot PRs reviewed weekly | `pnpm audit --prod`; Dependabot |
| Security | Production refuses to run without its secrets; Vercel never runs open | `auth/mode.ts` and its tests |
| Accessibility | No serious or critical axe violations on any player or admin page, at phone and desktop width | `quality.spec.ts`: desktop width today; phone width, a teammate's profile and the player window once the accessibility branch merges |
| Performance, server | `perf-probe` after data changes. Proposed budgets: roster at most 120 ms warm and 400 ms cold; no step over 1 s cold | Manual Data jobs run; the budgets are not automated |
| Performance, members | Field LCP at the 75th percentile at most 2.5 s, INP at most 200 ms, CLS at most 0.1 | System Health field data; you read it |
| Reliability | Health, failing jobs, stale sync and egress budget checked about 4 times a day; alert by GitHub email | Scheduled Data jobs |
| Release | Merge only on green CI, up to date with `main`; one smoke run after each production deploy; rollback by reverting the merge, which Vercel redeploys | `CLAUDE.md` §4–5 |
| Real devices | Safari and installed-app changes go through the WebKit workflow and the real-device checklist | By hand |

A native desktop app would add signed releases, update-signature verification, a Windows build
job, a key custody plan and a rollback channel. That is one more reason to keep the PWA route
until a native capability is approved.

### 7. Decisions and approvals that are yours

**Done with your approval:** the release of #170, #172, #169, #173 and #178; on 3 Nov, #179, #180, #181, #182, #183 and #184, each once every check on its head had passed.

**Now automatic, with nothing for you to do:**
- **The Production check** (#182) runs after every production deployment and every day, from GitHub's runner, which reaches the site. It checks:
  - that production answers from the commit just deployed, and its health;
  - that member pages turn away signed-out and forged-session requests;
  - the security headers and Riot's rules for a Personal key;
  - the public pages at three widths, with axe.

  Daily it also checks that a backup passed within 8 days, and the database's size. A failure opens one GitHub issue with what failed; the next passing run closes it.
- **Since #184** the forged-session checks include a real member's own pages (the case of the high finding, replacing the `curl` this section asked you to run), and the database's size opens an issue from 80% of its plan.
- **The weekly backup** proves that every table restores, including the retired ones, and opens an issue if it fails or nears its size limit.

**Still yours (only these):**
1. **Your backup check before any table drop** (#86, #138):
   - download the newest Database backup artifact (run 41732063033 keeps one until 1 Dec);
   - open it with the passphrase from your password manager (`docs/BACKUPS.md`, "Open and check a backup");
   - keep that file offline;
   - then approve the drops, which free about 217 MB.

   The database is 378 MB of the free plan's 500 MB and grows about 2 MB a day, so this matters within about two months. The Production check opens an issue from 80%.
2. **Leaderboards:** one decision (Approve, Change or Reject) under "Final recommendation" in [the Leaderboards report](https://claude.ai/artifact/UtfbhTL5RJqub513acZpDJ).
3. **The Riot Developer Portal** (about 10 minutes): check that the application is a Personal product and that its description matches `docs/RIOT_COMPLIANCE.md` ("Registering the product"). Keep the key.
4. **Optional:** a non-admin verification account, stored as the repository secrets `UNIIVERSE_VERIFY_USER` and `UNIIVERSE_VERIFY_PASSWORD`. With it, the Production check also opens the member pages (Team, Match History, Encounters). Without it, changes to member pages stay "deployed", and you see them on the live site yourself.

Nothing else needs you: the PWA draft (#171) and a desktop app stay optional ideas, and the one moderate Dependabot alert (`minimatch`, inside ESLint) is development-only.

## Executive summary

**3 Nov, evening: the autonomous maintenance you asked for.**
- **Production is now checked automatically** (#182, deployed): after every deployment and every day. Both runs so far passed: on #182's own deployment (100 checks, none failed) and on #183's.
- **Backups proved on production** (#179, deployed): every table restores with matching counts, including the 24 retired ones (992,581 rows), and the encrypted copy decrypts to the same dump.
- **Match History and Encounters** (#183, deployed): one navigation, All first, a player's games in Match History itself. The live check covered the public pages and security. The member pages are checked automatically only with the verification account (section 7, optional).
- **Riot:** the key is confirmed Personal, and everything that can be checked without the portal is checked (#181); a test pins the endpoints.
- **Leaderboards:** one final recommendation and one decision, in the Leaderboards report.
- **What is left for you:** section 7, three items and one optional.

**Released** (approved by you; one PR at a time; CI green on each merged
commit; one production check after each deploy):
- **Security, high (#170). Deployed.** A teammate's profile data reached signed-out requests. It
  was reproduced and fixed, and a test now stops it coming back. Production runs the fixed code
  (smoke run 41532558447). Since 4 Nov the Production check confirms it from outside on every run (run 41744264790).
- **Security, medium and low (#172). Deployed.** Nine fixes, each with tests: an open redirect, a throttle
  race, an egress risk, raw database errors, Riot host validation, open mode on Vercel, two timing
  leaks, and statistics without access.
- **Performance (#169). Production-verified.** Team Overview's roster in production, in two runs after the release:
  535 → 329–353 ms cold and 256 → 183–185 ms warm.
- **Accessibility (#173). Deployed.** Four serious axe findings fixed through shared components:
  three label-in-name cases and a table the keyboard could not scroll. axe now also runs at phone
  width and in the Team player and champion windows. The production smoke passed (run
  41553164525); its screens were not checked on the live site.
- **UX consistency (#178). Deployed** (`5e11ba5`; smoke run 41583580731):
  - a neutral charcoal frame with restrained blue and violet;
  - All Champions rows 57 → 51 px on a laptop and 74 → 51 px on a tablet, with the figures grouped;
  - Team Matches opens games under their cards, like Match History;
  - layout rules in `docs/STANDARDS.md`.

  Not yet production-verified: its screens need a live check, by you or by me once this
  environment can reach the site (section 7).

**Prepared, waiting for you:**
- **Riot key evidence (#175). Production-verified.** The key is Personal (Riot's default limits,
  no 24-hour expiry), every stored game carries the current player ids, and public Riot data is off.
- **Dependencies (#176). Deployed** (`cda9a66`): Next.js 16.4.3 and three smaller updates.
- **Leaderboards (#177). Deployed** (the model and its audit; the page is unchanged). Measured on
  the team's own games: the overall All games board ranks all 7 members, but role boards and the
  Ranked view are too thin or tied to rank. Ten proposed rules wait for your decision in
  [the Leaderboards report](https://claude.ai/artifact/UtfbhTL5RJqub513acZpDJ).
- **Backup proof for the retired tables (#179)**: tested; CI green; waits for your approval to merge.
- **The automated live check (#180)**: tested against a local demo build; CI green; waits for your
  approval to merge, and for this environment to reach the live site to run it there. It also fixes a browser test that fails on `main` whenever a
  fresh demo leaves one list empty: 2 of 12 measured (Findings, 3b).
- **The PWA's Windows integration (#171, draft).**

**Remaining concerns:**
- **Encounters is the slowest step** in production (about 1 s cold, and growing with the season's
  games). The fix, a stored summary table, waits for database space.
- **Database space:** 378 MB of the free plan's 500 MB, growing about 2 MB a day. The held table
  drops need your backup check first; the Production check opens an issue from 80%.
- **Not verified automatically:** the member pages' screens on the live site (they need the
  verification account), field data, Windows, and real devices with a screen reader. The
  forged-cookie requests against production now run on every Production check.

**Corrected during the session:** my first accessibility fix did not satisfy axe. The full browser
suite caught it before any PR was opened, and the cause is now in `docs/STANDARDS.md`.
