# UNIIVERSE status

**The one status record.** Each session updates it in place: what is live, what is verified and what is still open, with the evidence for each. Detail stays in the linked PRs and docs. Last updated 4 Nov 2026, 08:45 UTC.

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
| Production monitoring | #180, #182, #184 | Verified | 12 Production check runs since 3 Nov: 11 passed, 1 cancelled by a newer deploy, none failed |
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
| Retired tables dropped (Meta & Trends, Draft, Clash Scout) | #86, #138 | Deployed 4 Nov, 08:21 | Production check run 12 passed: production answers from the merge commit with its health ok, and migrations apply as an instance starts. The session that merged it confirms the freed space with Data jobs `db-usage` |
| Field page speed in members' browsers | #186 | Deployed | The probe read it on production (run 8): Team LCP p75 ≤ 5 s on 81 loads, every other page ≤ 2.5 s |

## In progress

| Area | Who | State |
|---|---|---|
| Mobile redesign: phone navigation, filters, match cards, Players, Team Matches | Session "UNIIVERSE mobile redesign", since 4 Nov 06:44 | Not pushed. Its Leaderboards changes were made before #188 replaced those files |
| Ranked history: why progress starts on 16 Oct, the whole 2026 season | Session "UNIIVERSE drafting platform": #190, a read-only `rank-audit` job, in CI | Why 16 Oct: rank readings are stored only since migration 0035 (generated 15 Oct, 15:39 UTC), and Riot's league API gives only the current rank, so no earlier rank or LP history exists to recover. Win/loss results do cover the whole season (stored games) |
| LP gained or lost per ranked game | The same session | The rule is in #190 (`domain/lp-attribution`, 16 tests): a game gets a figure only where two rank readings enclose exactly that game. Showing it on match cards comes after the audit and needs a migration |
| Team Overview's first load on phones | #191, in CI | Lab: LCP 5.65 → 3.04 s on a phone, desktop unchanged. Field result: docs/PERFORMANCE.md, "Team Overview's first card" |

## Outstanding, by impact

1. **Member pages are not verified on the live site.** The Production check opens them only with a verification account, which needs the owner (about 10 minutes, docs/LIVE_VALIDATION.md, "Setting up the verification account"). Until then, every member-page change stays "Deployed".
2. **The server's first byte on a first visit.** Field TTFB p75 was ≤ 3 s on every page, and only 37% of loads were good (≤ 0.8 s), while the Team page's own server work is 0.41 s cold. The likely cause is cold functions on a site opened 4–5 times a day. The lever is Vercel's Fluid compute, a project setting for the owner: check whether it is on, and its cost on the plan.
3. **GitHub Actions minutes.** About 29 full CI runs from 1 to 4 Nov, at about 40 billed minutes each: roughly 1,000–1,200 of the month's 3,000. GitHub's billing page has the exact figure. Concurrent sessions each spend a full run per ready PR.
4. **Database size.** It was 378 MB of the free plan's 500 MB, growing about 2 MB a day. #86 (deployed 4 Nov) should free about 217 MB; confirm with the next `db-usage`.
5. **Real devices.** Safari on an iPhone, the installed app, and screen readers need a person (docs/RESPONSIVE.md, the real-device checklist).

## Retired (do not reintroduce)

- Draft, Clash Scout, Ranked Development (with Solo Queue Blocks and the Ranked Improvement journal), Meta & Trends, Patterns & Notes.
- #86 dropped the Meta & Trends, Draft and Clash Scout tables on 4 Nov. Ranked Development's records are kept; no drop is prepared for them.
