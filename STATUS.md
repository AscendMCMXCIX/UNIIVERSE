# UNIIVERSE status

**The one status record and the one backlog.** What is live, what is verified, what is still open and what comes next, with the evidence for each. Detail stays in the linked PRs and docs. `OVERNIGHT_ENGINEERING_REPORT.md` and `SESSION_REVIEW.md` are historical records; where they differ from this file, this file is right. Last updated 6 Nov 2026, 06:50 UTC.

**One coordinating session.** Since 6 Nov, 06:30 UTC, the owner runs UNIIVERSE through one master session (`session_01CeotmQNT7Y1ygWs6eENvZr`). It keeps this record, owns the merge order and the scheduled check-ins, and merges PRs itself once every CI job on the latest commit has passed (the owner's approval of 6 Nov), one deploy at a time with its Production check read in between. Only the owner approves #212 (it deletes data) and changes to workflows, secrets or settings. The earlier sessions (design, navigation, ranked progress, personalization, reliability, security, LP tracking, mobile) were asked to stand down and report. Their open work is in the tables below.

**Production on 6 Nov, 06:24 UTC** (read from the live site): `/api/health` answers `ok` from 5724daa (#228's merge) in `syd1`, with the database up, the Riot key accepted and no job failing. **The repository has been public since 6 Nov, about 04:20 UTC.** Its effects on the backups and logs are in Outstanding ("Needs the owner").

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

| Ranked progress, compact: current rank, the 30-day change, highest recorded, a chart of the read stretch only; no season tabs | #217 | Deployed 6 Nov, 04:51 | PR CI 42162242346 passed on 36589fb (WebKit 42162293412 too). Production check 42165077302 passed on 40cf9c4: 106 passed, 0 failed. The member page has not been checked live (Outstanding 1). A review after the merge found display and wording faults, one an honest-data fault (the 30-day change could start from a reading no longer in effect); #228 fixed them (below) |
| Public repository, part 1: CI skips its suites on `main` only for a pass marker from this repository's own runs; `auth-audit` names no owner | #219 | Verified 6 Nov, 05:13 | PR CI 42163853391 passed on 634cd44. Production check 42167216831 passed on 6daefd4: 106 passed, 0 failed. Data jobs run 42167500185 (`auth-audit`) printed `"owner":"owner 1"` and the day only, in its public log |
| `rank-audit`: why four account/queue pairs are short of Riot's own count (rows without a champion, by kind) | #224 | Verified 6 Nov, 05:42 | PR CI 42165234519 passed on f0e1ca0. Production check 42168108330 passed on d8d7f98: 106 passed, 0 failed. Its first production reading (Data jobs run 42170025457) is in Outstanding 6 |
| Public repository, part 2: `/api/health` no longer shows visitors the database driver's error (it can name the host, region and user); `riot-check` no longer prints the key's last four characters; every workflow least-privilege, checkouts without persisted credentials, the pnpm action pinned to a commit; Production check screenshots of member pages only while the repository is private; the backup's key derivation set to OpenPGP's strongest; `SECURITY.md` | #225 | Verified 6 Nov, 05:25 | PR CI 42165379880 passed on 54782c9. Production check 42168421532 passed on 5aa971c: 106 passed, 0 failed, with #225's own changes to that workflow. `/api/health` read live: 200, the same keys, no host, user or key fragment |
| `data-audit`: why each member's missing Played Together place is missing (no row, or a row without a champion and which kind; by queue) | #220 | Verified 6 Nov, 05:42 | PR CI 42165237809 passed on b071a99. Production check 42168706977 passed on 8fdf593: 106 passed, 0 failed. Its first production reading (Data jobs run 42170025457) is in Outstanding 6 |

| Field performance: TTFB's two parts, `REDIRECT` (a same-origin redirect before the page, such as opening the app at `/`) and `SERVER` (the request's own time), so 16 Nov's probe says which part of Team's first byte is slow (Outstanding 3) | #226 | Verified 6 Nov, 05:54 | PR CI passed on 16534f3, and the full browser suite passed locally (530). Production check 42171217719 passed on f1e73f3: 106 passed, 0 failed. A perf probe by hand (Production check run 42171401710) on f1e73f3 returns `redirectedLoads`, `redirectP75` and `serverP75` for every page, empty until members load pages. Its `team.roster` reading: 390 ms cold, 144 ms warm |
| Ranked progress review fixes: the 30-day change starts from the reading in effect at the window's start (it could credit LP from games before it); "Not enough readings yet" instead of "No change" or "Unranked now"; "Rank known on N of M days" in local calendar days; ticks at local midnights; Bronze labels no longer clipped on phones; "Highest recorded" in full, with the day first seen | #228 | Deployed 6 Nov, 06:14 | PR CI 42169002188 passed on a770d23; 13 new tests fail on #217's code. Production check 42173274938 passed on 5724daa: 106 passed, 0 failed. The member page has not been checked live (Outstanding 1) |

## In progress

| Area | Who | State |
|---|---|---|
| Drop what Meta & Trends left and the ranks of players no stored game names (migration 0066) | PR #212, a draft from #211's session | **Held for the owner:** it deletes data for good (Outstanding 7) |
| #212's condition 2: the second `db-usage` reading | The master session, a check-in at 7 Nov 00:35 UTC | Read only; the result goes in #212, then the owner is asked |
| Merge order (one deploy at a time, a Production check between) | The master session | `main`'s push CI on 5724daa (all of #217–#228) finishes uncancelled first, then: #216 → #229 → #223 → #218 (merges main in, re-checks the frame against #223's cards) → #227 (after #223: a shared test file) → the sync deadlines PR |
| Navigation in reach: pinned section tabs on tablets and desktops, the tablet drawer a modal dialog, Back in the installed tablet app, a phone section that lands at its top | #216 | CI passed on 132c9c5; behind `main` by docs only (#230). Next to merge. WebKit passed on an earlier head |
| Repairs for Outstanding 6: the daily integrity job folds a member's missing games from the stored records that name them (at most 200 a run, no Riot request) | #229 | CI passed on 29caf17. After the merge, one Data jobs run `integrity data-audit`: no more than 96 places folded, then 0 missing. If far more are folded, stop before the next integrity run |
| Personalization everywhere: rows, cards, profile band and records carry each player's saved look; no "Unranked" for a rank never read | #223 (draft) | Merges main, full local validation, then ready and CI. It contains six side branches whole (`team/card-window-fixes`, `profile/band-identity`, `polish/champions-records`, `personalization/row-identity`, `library/site-icons`, `encounters/phone-rows`) |
| Design system: the desktop sidebar set into the page's ink, a lit brand plate, `docs/DESIGN_SYSTEM.md` | #218 (draft) | Merges main after #223, re-checks the frame, then ready and CI. A trial merge with #216 is clean |
| Lighter phone pages: pool rows draw the champion's tile, not the full splash (a 14-champion profile at 390 px: 2,253 → 429 KB); card effects exist only while hovered or focused | #227 (draft) | After #223 |
| Account syncs a person waits on end inside the lease; an open profile carries its history on | Branch `sync/panel-deadlines-watched-history`, not yet a PR | Its session was finishing validation at the handover |
| The four short Solo/Duo lists re-read from the top, each account's previous position kept | Not yet a branch | Adds rows only; each account's previous position is recorded first |
| Backup passphrase rotation: the backup refuses a passphrase under 32 characters; the privacy notice says the artifacts are public and encrypted | #231 | Outstanding 9 |

## Branches with work not on `main` (reviewed 6 Nov)

Nothing here is deleted without the owner. Besides the open PRs above:
- **Contained in #223:** the six side branches named in its row. They can go once #223 merges.
- **Superseded, already on `main` another way:** `audit/missing-place-reasons` (closed #222, replaced by #220), `security-hardening` and `audit-log` (19 Oct; row-level security, the security headers and `audit_events`, migration 0043, all landed later).
- **Kept as archives of retired features, not to be merged:** `research/draft-intelligence` (the Draft pilot's protocol and results, 2 Nov) and `clash-live` (paused Clash API work, 22 Oct). Draft and Clash Scout are retired.
- **187 branches fully merged into `main`:** listed in the 6 Nov exposure audit with their tip commits. Deleting them loses nothing, but it is the owner's call.

## Engineering backlog, in order

Finishing what is open comes before anything new.
1. **Merge the queue above,** each with its Production check, and record each in Live.
2. **#229's repair reading,** then the Solo/Duo re-read as a PR. Close Outstanding 6 when `data-audit` reads 0.
3. **Sweep the by-hand Data jobs logs for the key fragment** (read only: 276 `workflow_dispatch` runs from 13 Oct, 11:53 UTC, to #225's deploy; two are confirmed). The owner then decides whether to delete those logs.
4. **The 2027 ranked year:** `RANKED_SEASONS_2026` and `RANKED_YEAR` cover 2026 only. Before 1 Jan, add 2027 and end the year's count exclusively (noted in #228).
5. **16 Nov:** read Team's TTFB from the weekly probe, now split into redirect and server time (a check-in is scheduled).
6. **A small always-run CI job,** so the owner's ruleset on `main` can require a check that docs-only PRs also report (it needs the owner's approval: it is a workflow change).

## Outstanding, by impact

**Needs the owner, most urgent first:**
- **Rotate the backup passphrase (item 9)** before 14 Nov: docs/BACKUPS.md, "Rotating the passphrase". The Database backup workflow is disabled until then, so no new backup is published.
- **The verification account (item 1),** the five-minute rank watch (item 2), #212's go-ahead (item 7).
- **Smaller, any time (item 10):** a ruleset on `main`, deleting 187 merged branches, the Dependabot alert (item 8).


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
4. **GitHub Actions minutes: no longer a limit.** The owner made the repository public on 6 Nov (04:20 UTC). GitHub does not bill the minutes its standard runners spend on a public repository, so CI, the Data jobs schedule and the Production check run without the 3,000-minute allowance that November had nearly used up (2,793 of 3,000 measured on 6 Nov, 03:00 UTC: CI 2,580, of which the browser job 1,869; Production check 75; WebKit 55; Data jobs 44; Workflow lint 18; backups 8). That record stays in `docs/CI_USAGE.md`. The code PRs held as drafts for it are being taken through CI and merged (Live, In progress); CLAUDE.md's Actions rules stay as hygiene (few, meaningful runs), no longer as a budget. **Two limits of a public repository's schedules:**
   - GitHub disables a public repository's scheduled workflows after 60 days without activity. Those are the hourly Data jobs, the daily Production check and, while it stays here, the weekly backup. Only Vercel's daily tick (04:00 UTC) does not depend on GitHub.
   - GitHub may delay or drop scheduled runs under load. No hourly Data jobs ran between 22:00 and 02:28 UTC on 6 Nov.
   - The owner's five-minute rank watch (item 2) does not depend on either.
5. **Real devices.** Safari on an iPhone, the installed app, and screen readers need a person (docs/RESPONSIVE.md, the real-device checklist).
6. **Played Together missed some team games: repaired on 6 Nov; the rest of the fold is held for the owner.** data-audit had found 96 places in 63 games (2 members): this season's games, stored from a teammate's history, with no row in the member's own history, most likely left behind by the paging before #201's rescan. #229 (live 6 Nov, d087230; Production check 42180309297 passed) folds those games in from the stored records in the daily integrity job, adding rows only and making no Riot request.
   - **First run** (Data jobs 42181539020, `integrity data-audit`, 07:32 UTC): it folded **200**, its cap per run (200 candidates, 0 skipped, 0 later, over 14 accounts). data-audit in the same run read **0 places missing**, down from 96. Team insights: no finding, as before.
   - **Why 200, not 96:** the fold takes every stored record that names any player's account and has no row for it, including games of earlier seasons and personal-use profiles' accounts. data-audit counts only this season's games of the team members. Those ~104 extra rows are real games those accounts played, but they were not what was reviewed, and a folded row can't be told apart afterwards (`account_matches` records no time of writing).
   - **Held** by #234 (`FOLD_MISSING_PRESENCES = false`): from its deploy on, the daily job only counts the candidates, by kind (this season or earlier, team member or personal use). The next integrity run without it would have been about 7 Nov, 07:30 UTC.
   - **Next:** read the held counts from the next integrity run, then the owner chooses: fold everything, fold only this season's team-member games, or stop.
   - **Still open:** the four short Solo/Duo lists (Riot's count one to six games above what's stored) need their lists re-read from the top. That isn't a PR yet.
7. **Retired data (#212) needs the owner.** It deletes what Meta & Trends left (`tracked_summoners` and five small tables) and the ladder ranks in `last_known_ranks` that no stored game names; no page changes. That closes docs/RIOT_COMPLIANCE.md row 5: non-members' data kept for removed features. #211's readings ran on 6 Nov. A Database backup by hand (run 7), whose restore check now covers these tables, passed and counted 32,749 `tracked_summoners` rows; `main`'s docs keep 14 Oct's 20,423, taken while the ladder was still being collected, until #212 merges. Data jobs `db-usage` (run 465) found 31,172 of the 32,724 ladder ranks in no stored game, and `tracked_summoners`'s read and write counters unchanged since 4 Nov. It waits for the owner's check of a backup with an offline copy, and an explicit go-ahead.
8. **Dependabot's security update for `minimatch` fails on every push to `main`** (6 runs since 2 Nov; Actions lists them as failed). The advisory is moderate (a pattern can take long to match) and reaches only development tools: ESLint 9 pins `minimatch` 3.1.5, and `@typescript-eslint` uses 10.2.6. The fix needs 11.0.1 or later, which ESLint 9 cannot take, so Dependabot gives up. Nothing the app runs uses it: `pnpm audit --prod` finds no known vulnerability (6 Nov). It closes when ESLint moves on. The owner can dismiss the alert as development-only (Security → Dependabot); this repository's tools cannot.
9. **The weekly database backups are downloadable by anyone signed in to GitHub.** Each is one gpg AES-256 file of the whole database: users with scrypt password hashes, session-token hashes, Riot accounts and IDs, social links, games and ranks. The only protection is the passphrase (`BACKUP_PASSPHRASE`), and a downloaded copy can be attacked offline. #225 sets the strongest key derivation OpenPGP allows from the next backup on.
   - **The owner's decision (6 Nov):** keep the backups in this repository, and rotate the passphrase first, because the owner is not sure the current one is long and random. The alternatives considered were a private backup repository, making this repository private again, and a private storage bucket.
   - **Done (6 Nov, 06:30 UTC):** the Database backup workflow is disabled, so Monday 9 Nov's run publishes nothing. #231 refuses a passphrase shorter than 32 characters in `scripts/backup-db.sh`, makes the privacy notice say the artifacts are public and encrypted, and adds the rotation steps to docs/BACKUPS.md.
   - **The owner's steps:** docs/BACKUPS.md, "Rotating the passphrase": keep the old passphrase, set a new random one of 32+ characters, re-enable the workflow, run it once, and decrypt that backup with the new passphrase. Do it **before 14 Nov**: the daily Production check fails once the last good backup (6 Nov, 00:24 UTC) is more than 8 days old.
   - **Published copies: five,** all encrypted with the current passphrase and gpg's default key derivation (each predates #225): the runs of 21 Oct (`database-backup-39686307330`, kept until 18 Nov), 26 Oct (`…40289883157`), 2 Nov (`…41424554552`), 3 Nov (`…41732063033`) and 6 Nov (`…42136432466`, backup run 7, until 4 Dec). Nothing recalls a copy already downloaded. #212 relies on run 7, so keep an offline copy of it. The other four are not needed by anything: deleting them shortens the window in which they can be downloaded. Deleting cannot be undone, so each waits for the owner. If the old passphrase was weak, treat the members' password hashes in them as exposed, and ask members with weak passwords to change them.
10. **Smaller public-repository items** (from the 6 Nov public-exposure audit, which found no secret in any of the 237 branches, the PR bodies or their 235 comments; every key-shaped string is a test dummy):
    - **No ruleset protects `main`.** The owner's setting. CLAUDE.md's rules are the protection meanwhile.
    - **187 merged branches older than 48 hours could be deleted.** The owner's call, since it cannot be undone.
    - **Old Clash screenshots in the history show five opponents' display names.** Accepted: removing them means rewriting history.
    - **Some free security features are off** (secret scanning's non-provider patterns, validity checks). The owner's settings.

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
