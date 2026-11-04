# UNIIVERSE status

**The one status record.** Each session updates it in place: what is live, what is verified and what is still open, with the evidence for each. Detail stays in the linked PRs and docs. Last updated 4 Nov 2026, 12:35 UTC.

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
| Ranked progress over the 2026 year, LP on match cards, rank watch | #190, #198 | Deployed 4 Nov, 12:20 | Production check run 18 passed on 562d653 (public pages and security; the member pages have not been checked live). Data jobs run 41829346265: migration 0065 applied (`auth-audit`); the rank watch read 12 of 12 accounts, no failure; `rank-audit` as before. **Why 16 Oct:** rank readings exist only since migration 0035 (first 15 Oct 11:33 UTC; most accounts 20:51 UTC, 16 Oct in Sydney), and Riot gives only the current rank. **What exists:** 1,514 ranked games of 2026 from 8 Jan; Riot's whole-year count matches the store for 12 of 16 account/queue pairs. **LP:** 12 figures and 2 promotions are provable from the readings before today; later games get theirs from the rank watch, in every tick, or every five minutes once the owner adds the schedule (Outstanding 2) |

## In progress

| Area | Who | State |
|---|---|---|
| Mobile redesign: phone navigation, filters, match cards, Players, Team Matches | Session "UNIIVERSE mobile redesign", since 4 Nov 06:44 | Not pushed. Its Leaderboards changes were made before #188 replaced those files |
| Data integrity and reliability: backfills and catch-ups that cannot be stalled by one unreadable game, syncs that never overlap, pages that never show the "unavailable" marker as a figure or promise games that will never come, Riot error messages that name nobody | Session "Autonomous Data Integrity & Reliability Engineering", 4 Nov: branch `reliability/data-integrity`, PR #202 | One commit per confirmed defect, each with the test that fails without it (reproduced first, then verified by independent reviewers), merged with #197, #198 and #201 from `main`. `pnpm verify` and the database suite on Postgres 16. No migration, no visible design change; a few status sentences are more precise, and run records are deleted after 60 days. Found and handed to the access PR: the Players directory and the profile header show a teammate's rank to viewers the Team page withholds it from (the fix needs a `showRank` flag, not a null rank, which renders "Unranked") |

## Outstanding, by impact

1. **Member pages are not verified on the live site.** The Production check opens them only with a verification account, which needs the owner (about 10 minutes, docs/LIVE_VALIDATION.md, "Setting up the verification account"). Until then, every member-page change stays "Deployed".
2. **LP for future games depends on how often ranks are read.** The rank watch runs in every tick: hourly Actions (delivered 4–5 times a day), visits, and the daily cron. With those alone, most games still fall between readings several games apart and show `—`. The five-minute schedule (Supabase pg_cron, free, the owner's one-time step with the cron secret: docs/RANKED_PROGRESS.md) gives nearly every game its figure.
3. **Team's first byte.** Production check run 15's probe covered the 28 days to 4 Nov, all from before #191.
   - **Team:** TTFB p75 > 3 s on desktop (43 loads) and ≤ 3 s on phones (35 loads); 23% good.
   - **The pages people open directly:** ≤ 0.6–1 s (Players, Leaderboards, Matches, Resources, Admin).
   - **Team's own data:** 0.17 s warm and 0.52 s cold (`team.roster`, the same run).

   So the delay comes before the page's own work.

   **Found:** Vercel's builder, run locally, put `/` (the app's start page, which redirects to `/team`) and the member pages in two separate functions, because their `maxDuration` differed. Opening the app started both, one after the other.

   **In progress:** the start-page PR puts every page in one function (docs/PERFORMANCE.md, "The start page's two functions"). If Team's TTFB is still high a week after it deploys, the remaining lever is Vercel's Fluid compute: the owner's project setting, with its cost on the plan checked first.
4. **GitHub Actions minutes.** About 29 full CI runs from 1 to 4 Nov, at about 40 billed minutes each: roughly 1,000–1,200 of the month's 3,000. GitHub's billing page has the exact figure. Concurrent sessions each spend a full run per ready PR.
5. **Real devices.** Safari on an iPhone, the installed app, and screen readers need a person (docs/RESPONSIVE.md, the real-device checklist).

## Retired (do not reintroduce)

- Draft, Clash Scout, Ranked Development (with Solo Queue Blocks and the Ranked Improvement journal), Meta & Trends, Patterns & Notes.
- #86 dropped the Meta & Trends, Draft and Clash Scout tables on 4 Nov. Ranked Development's records are kept; no drop is prepared for them.
