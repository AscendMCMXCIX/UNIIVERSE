# UNIIVERSE status

**The one status record.** Each session updates it in place: what is live, what is verified and what is still open, with the evidence for each. Detail stays in the linked PRs and docs. Last updated 6 Nov 2026, 03:40 UTC.

**Production on 6 Nov, 03:11 UTC** (read from the live site): `/api/health` answers `ok` from 77c43cd (#202's merge) in `syd1`, with the database up, the Riot key accepted and no job failing. `main` (501d704) differs from it only by docs (#195, #200, #213), which Vercel does not build, so production runs the latest code on `main`.

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
| Production monitoring | #180, #182, #184 | Verified | 29 Production check runs since 3 Nov: 27 passed, 2 cancelled by a newer deploy, none failed |
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
| Start page: every page in one Vercel function | #197 | Deployed 4 Nov, 10:45 | Every CI job passed on the PR's last commit, up to date with `main`, before the merge. Production check run 17 passed on the merge commit (75166d5): 106 checks, none failed, 1 warning (the member pages, Outstanding 1). The field result comes from the probe's `last7` on Monday 16 Nov: Team's TTFB p75 was > 3 s on desktop before it |
| Ranked progress over the 2026 year, LP on match cards, rank watch | #190, #198 | Deployed 4 Nov, 12:20 | Production check run 18 passed on 562d653 (public pages and security; the member pages have not been checked live). Data jobs run 41829346265: migration 0065 applied (`auth-audit`); the rank watch read 12 of 12 accounts, no failure; `rank-audit` as before. **Why 16 Oct:** rank readings exist only since migration 0035 (first 15 Oct 11:33 UTC; most accounts 20:51 UTC, 16 Oct in Sydney), and Riot gives only the current rank. **What exists:** 1,514 ranked games of 2026 from 8 Jan; Riot's whole-year count matches the store for 12 of 16 account/queue pairs. **LP:** 12 figures and 2 promotions are provable from the readings before today; later games get theirs from the rank watch, in every tick, or every five minutes once the owner adds the schedule (Outstanding 2) |
| Mobile redesign: a five-tab bar, Back and the page's title in the top bar, the account sheet, phone-native lists, filters in a sheet, games full screen | #203 | Verified 5 Nov | Deployed 4 Nov, 18:49. **The owner checked it on the live site on 5 Nov and reported it good.** Every CI job passed on ddb8bcd, up to date with main 2701eec; the WebKit workflow passed on the branch (16 of 16). Production check run 23 passed on bacfcfd: the public pages at three widths and security. The automated check still opens only the public pages until the verification account exists (Outstanding 1). #207 applies the rank rule to the phone Players rows too. Design and measurements: docs/MOBILE.md, docs/PERFORMANCE.md |
| Reliability: Riot request deadlines, one sync per account at a time, no lost season games, fewer Riot requests, honest job health | #201 | Deployed 4 Nov, 16:08 | Every CI job passed on f128b92, up to date with `main`. Production check run 20 passed on bffe37a (public pages and security). The scheduled Data jobs runs since (459 and 461–464) all passed. About one match request in four was for a game another account had already stored (audit of 3 Nov: 4,951 stored account games for 3,670 distinct games); those are now read from the stored record. Design: docs/DATA_PIPELINES.md, docs/MONITORING.md |
| Privacy and security: linked accounts' PUUIDs stay on the server, the setup gate on match-history actions, caches that never keep an erased person or undo an invalidation | #194 | Deployed 4 Nov, 16:50 | Every CI job passed on the PR's last commit, up to date with `main`; each fix came with a test that fails on the code before it. Production check run 21 passed on 6bedf94 (public pages and security) |
| Team insights, for administrators: which differences in the team's own games are more than chance | #193 | Deployed 4 Nov, 17:49 | Production check run 22 passed on 2701eec. Production's answer, read before members see it (`data-audit`, Data jobs run 460, read only): 7 members, 3,549 member games, 793 team games; 33 of the 50 comparisons could be tested (13 had too few games, 4 were too one-sided to estimate), and none is a finding; the typical difference these games could detect is about 22 points. Members do not see it (Decisions). Method: docs/TEAM_INSIGHTS.md |
| LP on match cards: the reason opens on a tap, not only on hover | #206 | Deployed 4 Nov, 19:40 | Production check run 24 passed on 32de4cc (public pages and security) |
| Who sees a teammate's rank, and personal-use profiles | #207 | Deployed 4 Nov, 21:15 | Every CI job passed on db0d135, up to date with `main`. Production check run 25 passed on 23e711a, and the daily run 26 on 5 Nov (public pages and security). The rules and where the code applies them: docs/PROFILE_VISIBILITY.md |
| Rejected-key alert: a scheduled run re-checks the key before it fails; the key check asks what a sync asks, within 30 s | #208 | Deployed 5 Nov, 23:11 | Every CI job passed on 49bbe40, up to date with `main`; the push to `main` reused that result. Production check run 27 passed on 2fb1ae6 (public pages and security). The step acts only in a scheduled run while health lists `riot-key` (a refusal recorded and not yet cleared), so the next recorded refusal is its first live use. It was tested offline with a stubbed `curl`: 11 stubbed cases and 6 fed real `/api/health` and `riot-check` answers produced by the code. What it does: docs/MONITORING.md |
| Retired data: `db-usage` reports what Meta & Trends left and the ranks no stored game names; the weekly backup proves they restore | #211 | Deployed 6 Nov, 00:11 | Every CI job passed on 83783a5, up to date with `main`; the push to `main` reused that result. Production check run 28 passed on 29d395a (public pages and security). Nothing deleted, no migration: its readings are the evidence #212 waits for (Outstanding 7) |
| Data integrity and reliability: backfills and catch-ups that cannot be stalled by one unreadable game, syncs that never overlap, pages that never show the "unavailable" marker as a figure or promise games that will never come, Riot error messages that name nobody | #202 | Deployed 6 Nov, 00:13 | Every CI job passed on 09d0ed0, up to date with `main` at 2fb1ae6. #211 merged two and a half minutes earlier, so the push to `main` ran the full CI on the merged tree, and it passed (run 686: unit tests, the database suite on Postgres 16, and the build and browser tests). Production check run 29 passed on 77c43cd (public pages and security). No migration. Run records (`job_runs`) are now deleted after 60 days, and the privacy notice says so |

## In progress

| Area | Who | State |
|---|---|---|
| Drop what Meta & Trends left and the ranks of players no stored game names (migration 0066) | PR #212, a draft from #211's session | **Held for the owner:** it deletes data for good (Outstanding 7) |
| #212's condition 2: the second `db-usage` reading | #212's session, a check-in at 7 Nov 00:35 UTC | Read only; the result goes in #212 |
| Premium identity and design consistency; navigation, responsiveness and the installed app; Ranked Progress's redesign and data accuracy; team personalization | Four sessions started on 6 Nov, 03:04–03:07 UTC | Started. Their PRs stay drafts, which run no CI, until there are Actions minutes for them (Outstanding 4). This record is kept by the coordinating session; the others report their PRs to it |

## Outstanding, by impact

1. **Member pages are not verified on the live site.** The Production check opens them only with a verification account, which needs the owner (about 10 minutes, docs/LIVE_VALIDATION.md, "Setting up the verification account"). Until then, every member-page change stays "Deployed".
2. **LP for future games depends on how often ranks are read.** The rank watch runs in every tick: hourly Actions (delivered 4–5 times a day), visits, and the daily cron. With those alone, most games still fall between readings several games apart and show `—`. The five-minute schedule (Supabase pg_cron, free, the owner's one-time step with the cron secret: docs/RANKED_PROGRESS.md) gives nearly every game its figure.
3. **Team's first byte.** Production check run 15's probe covered the 28 days to 4 Nov, all from before #191.
   - **Team:** TTFB p75 > 3 s on desktop (43 loads) and ≤ 3 s on phones (35 loads); 23% good.
   - **The pages people open directly:** ≤ 0.6–1 s (Players, Leaderboards, Matches, Resources, Admin).
   - **Team's own data:** 0.17 s warm and 0.52 s cold (`team.roster`, the same run).

   So the delay comes before the page's own work.

   **Found:** Vercel's builder, run locally, put `/` (the app's start page, which redirects to `/team`) and the member pages in two separate functions, because their `maxDuration` differed. Opening the app started both, one after the other.

   **Deployed:** #197 puts every page in one function (docs/PERFORMANCE.md, "The start page's two functions"), live since 4 Nov, 10:45; Production check run 17 passed on it.

   **Reading it:** a load counts its TTFB from the moment the browser starts it, so a load that opens the app at `/` includes the start page's whole answer and its redirect in Team's TTFB (web-vitals counts redirects, the connection and the request). Team is reached that way; the other pages are mostly opened directly. A high Team figure therefore does not yet say which part is slow (docs/PERFORMANCE.md, "The start page's two functions").

   **Next:** Monday 16 Nov's scheduled probe is the first whose `last7` is all after the deploy (a session check-in is scheduled to read it). Record Team's TTFB p75 from it here and in docs/PERFORMANCE.md. If it is still high, what remains is the page function's own cold start on a site opened a few times a day. Fluid compute is probably already on, so it is not a lever to count on: the handover lists the project on it, and the Hobby plan deploys `maxDuration = 300` only with it (docs/DEPLOYMENT.md, "Function duration"). The owner can confirm it in Project → Settings → Functions.
4. **GitHub Actions minutes: November's leave no room for a CI run.** Measured on 6 Nov, 03:00 UTC, from every November run's jobs (each job's time rounded up to the minute, as GitHub bills a private repository; all on Linux):
   - **Used: about 2,793 of the 3,000.** CI 2,580 (its browser job alone 1,869), Production check 75, WebKit 55, Data jobs 44, Workflow lint 18, Dependabot 13 (probably not billed) and backups 8.
   - **A full CI run bills 47 minutes** (median of 58 runs). The browser job is 39 of them.
   - **The schedule needs about 160–210 more by 30 Nov**, at its measured delivery: Data jobs 3–5 runs a day at 1 minute, the daily Production check at about 3, the weekly backup at about 3. Each deploy's Production check adds 2–3.
   - **So about 0–45 minutes are left: not one full CI run.** When the minutes run out (it happened on 15 Oct), every workflow stops: CI, the Data jobs ticks (which also read ranks for LP) and the Production check.
   - **Until 1 Dec:** code PRs stay drafts, and records go in docs-only PRs, which run no CI. To merge code before then, the owner can allow paid minutes above the allowance (GitHub → Settings → Billing and licensing → Budgets). A full CI run is about 47 minutes at Linux's per-minute rate, well under a dollar.
   - GitHub's billing page has the exact figure. This repository's tools cannot read it.
5. **Real devices.** Safari on an iPhone, the installed app, and screen readers need a person (docs/RESPONSIVE.md, the real-device checklist).
6. **Played Together misses some team games.** Production's `data-audit` (run 460) found 96 places, in 63 games, where a member's account is in the stored record of a game from a teammate's history, but the game is missing from that member's own history (2 members). Played Together reads only the members' own histories, so it leaves that member out of those games, and drops a game only one teammate has; team insights also reads the stored records, so it counts them. #201 (live before that run) lets an unfinished queue be rescanned and finish, so the next `data-audit` shows whether the gap closes by itself. #202 does not touch it: its catch-ups fill the figures and records of games already stored and add no game to a history. The audit counts these places but not why: a count by reason (no stored row for that member, or a row without a champion, which both readers skip) would tell. If it stays above zero, Played Together could read the presences from the stored records, as team insights does (the count is explained in docs/TEAM_INSIGHTS.md, "Checking it against production before activation").
7. **Retired data (#212) needs the owner.** It deletes what Meta & Trends left (`tracked_summoners` and five small tables) and the ladder ranks in `last_known_ranks` that no stored game names; no page changes. That closes docs/RIOT_COMPLIANCE.md row 5: non-members' data kept for removed features. #211's readings ran on 6 Nov. A Database backup by hand (run 7), whose restore check now covers these tables, passed and counted 32,749 `tracked_summoners` rows; `main`'s docs keep 14 Oct's 20,423, taken while the ladder was still being collected, until #212 merges. Data jobs `db-usage` (run 465) found 31,172 of the 32,724 ladder ranks in no stored game, and `tracked_summoners`'s read and write counters unchanged since 4 Nov. It waits for the owner's check of a backup with an offline copy, and an explicit go-ahead.
8. **Dependabot's security update for `minimatch` fails on every push to `main`** (6 runs since 2 Nov; Actions lists them as failed). The advisory is moderate (a pattern can take long to match) and reaches only development tools: ESLint 9 pins `minimatch` 3.1.5, and `@typescript-eslint` uses 10.2.6. The fix needs 11.0.1 or later, which ESLint 9 cannot take, so Dependabot gives up. Nothing the app runs uses it: `pnpm audit --prod` finds no known vulnerability (6 Nov). It closes when ESLint moves on. The owner can dismiss the alert as development-only (Security → Dependabot); this repository's tools cannot.

## Decisions taken on 4–5 Nov

The owner delegated the open decisions on 4 Nov. Each one can be reversed by a setting or a small change.

- **Team insights stays administrators-only** (`TEAM_INSIGHTS_AUDIENCE`). On production's games it finds no difference above chance, so members would see an empty page. Revisit when `data-audit` reports findings.
- **A teammate's rank is a statistic** (#207): shown to the player and to members with "view teammates' statistics", left out for everyone else (never shown as "Unranked"). Profiles, Players and match scoreboards now follow the Team page.
- **Personal-use profiles open only for their player and the administrators** (#207). In a team member's games they are not named or linked, and nothing is read from their linked account.
- **The rejected-key alert re-checks the key first** (#208). A scheduled Data jobs run that finds `riot-key` failing asks Riot again, the way a sync does, and fails only if the key is still refused. This replaces failing every run for hours after a short refusal; waiting for three failed runs was the alternative.
- **No change to Vercel's settings** before 16 Nov's field result (Outstanding 3). Fluid compute is probably already on.

## Retired (do not reintroduce)

- Draft, Clash Scout, Ranked Development (with Solo Queue Blocks and the Ranked Improvement journal), Meta & Trends, Patterns & Notes.
- #86 dropped the Meta & Trends, Draft and Clash Scout tables on 4 Nov. Ranked Development's records are kept; no drop is prepared for them.
