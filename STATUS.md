# UNIIVERSE status

**The one status record.** Each session updates it in place: what is live, what is verified and what is still open, with the evidence for each. Detail stays in the linked PRs and docs. Last updated 4 Nov 2026, 09:40 UTC.

**Statuses:**
- **Verified:** deployed and checked on the live site after the deploy.
- **Deployed:** on `main` and live. Its member pages have not been checked on the live site (see Outstanding 1). CI checked them on demo data.
- **In progress:** a session or an open PR is on it.
- **Retired:** removed on purpose. Do not bring it back.

## Live

| Area | PRs | Status | Evidence |
|---|---|---|---|
| Security: every member page checks access | #170 | Verified | Every Production check run turns away signed-out and forged-session requests to member pages, including a real member's profile, champions and matches |
| Security hardening | #172 | Deployed | Server-side fixes, each with its own tests |
| Production monitoring | #180, #182, #184 | Verified | 15 Production check runs since 3 Nov: 13 passed, 2 cancelled by a newer deploy, none failed |
| Backups | #179 | Verified | The Database backup run of 3 Nov restored all 72 tables with matching counts |
| Riot key and compliance | #175, #181 | Verified | The key is Personal: the same key was accepted 24 h 39 min apart. Public pages carry no Riot API data (checked on every run) |
| Season figures speed | #169 | Verified | Production perf probe: Team roster 535 → 329–353 ms cold |
| Public pages: layout and axe at 1440, 768 and 390 px | #173, #180 | Verified | Every Production check run |
| Readability, palette, premium identity, Profile Overview | #164, #165 | Deployed | |
| Consistency passes: compact All Champions, Team Matches' games under their cards, phone match cards | #167, #178, #187 | Deployed | |
| Accessibility on member pages | #173 | Deployed | axe in CI at three widths, on demo data |
| Match History 2.0, shared match expansion | #153–#162 | Deployed | |
| Match History and Encounters: one navigation | #183 | Deployed | |
| Social links: "Show publicly" | #166 | Deployed | |
| Leaderboards: Recent form, Records & achievements | #177, #185, #188 | Deployed 4 Nov, 07:40 | Production check run 11 passed (public pages and security). The member page has not been checked live |
| Installed app on a computer: shortcuts, one window | #171 | Deployed | Needs a real install on Windows or Chrome to verify |
| Retired tables dropped (Meta & Trends, Draft, Clash Scout) | #86, #138 | Verified | Production check run 12 passed on the merge commit. Run 15 read the database at 161 MB, 32% of the plan, down from 378 MB |
| Field page speed in members' browsers | #186, #191 | Verified | Production check run 15's probe returned it with #191's split by page, device and the last 7 days |
| Team Overview's first load on phones | #191 | Deployed 4 Nov, 08:52 | Every CI job passed on the merged tree. The browser suite finished at 09:09, 19 minutes after the merge. Production check run 14 passed: the public Team page, which has the same cards, at three widths. The field result comes from a probe after 11 Nov (`last7`): Team on phones was LCP p75 ≤ 6 s, 10% good, before it |

## In progress

| Area | Who | State |
|---|---|---|
| Mobile redesign: phone navigation, filters, match cards, Players, Team Matches | Session "UNIIVERSE mobile redesign", since 4 Nov 06:44 | Not pushed. Its Leaderboards changes were made before #188 replaced those files |
| Ranked history: why progress starts on 16 Oct, the whole 2026 season | Session "UNIIVERSE drafting platform": #190 merged on 4 Nov (a read-only `rank-audit` job); the redesign is in #198 | **Why 16 Oct:** rank readings are stored only since migration 0035 (15 Oct), and Riot's league API gives only the current rank. The first reading was at 11:33 UTC on 15 Oct; most accounts' first was at 20:51 UTC, which is 16 Oct in Sydney (Data jobs run 41805048588). **What exists:** 1,514 ranked games of 2026 for 10 accounts. The first games on patches 16.1, 16.9 and 16.15 fall on 8 Jan, 29 Apr and 29 Jul. Riot's whole-year count matches the stored games for 12 of 16 account/queue pairs; the other four are 1, 1, 1 and 6 games short. **#198** (draft) draws the year from 8 Jan with each week's games, and the rank from the first reading. |
| Data integrity and reliability: collection that cannot be stalled by one unreadable game, syncs that never overlap, pages that never show the "unavailable" marker as a figure or promise games that will never come, job runs that died recorded as failures, Riot error messages that name nobody | Session "Autonomous Data Integrity & Reliability Engineering", 4 Nov: branch `reliability/data-integrity`, a draft PR | One commit per confirmed defect, each with the test that fails without it (reproduced first, then verified by independent reviewers). `pnpm verify` 613 tests; the database suite on Postgres 16. No migration, no visible design change; a few status sentences are more precise. |
| LP gained or lost per ranked game | The same session: #198, a draft held for the owner's approval of migration 0065 | A game gets a figure only where two rank readings enclose exactly that game (`domain/lp-attribution`, 17 tests). On production data, today's readings prove 12 figures and 2 promotions; 1,442 games have no figure, each with its reason. #198 adds the rank watch and reading confirmations, so future games get their figure; the optional five-minute schedule decides how many |

## Outstanding, by impact

1. **Member pages are not verified on the live site.** The Production check opens them only with a verification account, which needs the owner (about 10 minutes, docs/LIVE_VALIDATION.md, "Setting up the verification account"). Until then, every member-page change stays "Deployed".
2. **Team's first byte.** Production check run 15's probe covered the 28 days to 4 Nov, all from before #191.
   - **Team:** TTFB p75 > 3 s on desktop (43 loads) and ≤ 3 s on phones (35 loads); 23% good.
   - **The pages people open directly:** ≤ 0.6–1 s (Players, Leaderboards, Matches, Resources, Admin).
   - **Team's own data:** 0.17 s warm and 0.52 s cold (`team.roster`, the same run).

   So the delay comes before the page's own work. Team is where the app starts: a cold function on a site opened a few times a day, plus the start page's redirect. The installed app opens `/`, which looks up the session and redirects to `/team`, so two server answers come before Team's first byte.

   `/` and the member pages declare different `maxDuration`s, so they may run in separate functions and both start cold. That is not checked: Vercel's function list for a deployment shows it.

   **Levers:**
   - Vercel's Fluid compute: the owner's project setting; check its cost on the plan first.
   - Deciding the start page without a server render of `/`: a code change.
   - Measure first: add the navigation's redirect time to the field data.
3. **GitHub Actions minutes.** About 29 full CI runs from 1 to 4 Nov, at about 40 billed minutes each: roughly 1,000–1,200 of the month's 3,000. GitHub's billing page has the exact figure. Concurrent sessions each spend a full run per ready PR.
4. **Real devices.** Safari on an iPhone, the installed app, and screen readers need a person (docs/RESPONSIVE.md, the real-device checklist).

## Retired (do not reintroduce)

- Draft, Clash Scout, Ranked Development (with Solo Queue Blocks and the Ranked Improvement journal), Meta & Trends, Patterns & Notes.
- #86 dropped the Meta & Trends, Draft and Clash Scout tables on 4 Nov. Ranked Development's records are kept; no drop is prepared for them.
