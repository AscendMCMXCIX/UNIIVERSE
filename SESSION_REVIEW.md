# UNIIVERSE: session review (17–19 October 2026)

A report for an independent reviewer of the work an AI coding agent (Claude Code) did on UNIIVERSE in one long session. It separates what was **verified**: checked against the repository, GitHub, CI runs or production job output. It marks what is an **assumption**: inferred and not confirmed.

## How this report was written, and its limits

- **Sources.** The report draws on:
  - the git history and pull requests of `AscendMCMXCIX/UNIIVERSE`;
  - GitHub Actions runs and logs;
  - the output of the app's read-only Data jobs on production;
  - the code and documentation in the repository.
- **The conversation itself is only partly available.** The session ran long enough that its earlier part was condensed into a summary. The exact wording of early requests, and some intermediate reasoning, are no longer available to the author of this report. Where this report describes earlier requests, it does so from that summary and from the pull requests themselves, not from the original messages.
- **No access to the hosting dashboards.** Nothing here was read from the Vercel or Supabase dashboards. Usage figures from those dashboards are the owner's, quoted from their request.
- **No secrets.** None were requested or handled. Production was reached only through the existing Data jobs workflow, which holds its own secret.

## Working rules followed

These come from `CLAUDE.md` and the owner's instructions:
- one branch per change, never pushing to `main`;
- local validation before pushing: `pnpm verify`, the database suite on PostgreSQL, a production build and the Playwright suite;
- pushing to a ready PR only with a validated batch, to save GitHub Actions minutes;
- merging only on green CI, with the merge method and the expected head SHA;
- one post-deploy check per production change;
- additive migrations only.

The owner gave blanket approval to proceed and merge ("Don't need my approval for anything go ahead with everything"). Destructive data changes, plan upgrades, billing changes and deleting production resources were excluded and still need explicit approval. None were made.

## Merged pull requests (verified on GitHub)

| PR | Merged (UTC) | What it did |
|---|---|---|
| #49 | 17 Oct 16:56 | Team → Matches → Encounters: players members keep meeting in recorded games |
| #50 | 17 Oct 23:49 | Background visibility becomes team branding, set in Admin → Branding |
| #51 | 18 Oct 01:48 | Release A: functional corrections (refresh, possible groups, Team Matches window, Blocks focus, experience labels) |
| #52 | 18 Oct 02:39 | Release B: background on every page, centred Team Overview, player window, Leaderboards identity |
| #53 | 18 Oct 03:14 | Release C: Patterns & Notes |
| #54 | 18 Oct 03:42 | Release D: mobile-first audit fixes (touch targets, label sizes) |
| #55 | 18 Oct 04:38 | Remove Patterns & Notes (owner's later decision) |
| #56 | 18 Oct 05:18 | Match History: minimal header |
| #57 | 19 Oct 00:12 | Profile picture: drag-to-reposition circular editor |
| #58 | 19 Oct 00:57 | Public pages, Release A: consent, allowlist, public Team Overview, admin switch |
| #59 | 19 Oct 01:56 | Remove the Draft feature permanently (code only, no database change) |
| #60 | 19 Oct 03:26 | Team Overview: turn each lineup card over to its substitutes |
| #61 | 19 Oct 03:56 | Profile Overview: Refine opens as an anchored panel |
| #63 | 19 Oct 05:22 | Data jobs: read-only `db-usage` report (table sizes, top queries) |
| #62 | 19 Oct 06:56 | Team → Matches: Season 2026 onwards, no pair rankings, one compact filter toolbar per tab |
| #65 | 19 Oct 08:41 | Display names separate from usernames; first-time setup asks for a name, then offers Personalise |
| #64 | 19 Oct 09:36 | Hosting usage: smaller deployments, previews on request, less database egress |

After production deploys, one Data jobs run checked `deployment.commit` and the probe timings. Examples:
- run 39197313317 reported commit `a8c4e27` (#61);
- run 39204826986 reported `e976f86` (#63) and produced the `db-usage` figures below;
- run 39232481955 reported `4fb941c` (#64), with health OK, no failing jobs and a 297 MB database.

## Work open at the time of writing

See "Final state" at the end for what happened to each.
- **#62 Team → Matches cleanup.**
  - Its first CI run failed one Playwright test, `filter-consistency.spec.ts:61` on desktop: "no inline filter controls", on both attempts.
  - Locally the test passed in isolation and in the full suite in CI order, on Chromium 141 (the container's) and on Chromium 153 (the version CI installs, downloaded for the purpose): 280/280 each time.
  - The cause was not found. The test read the controls once, straight after navigating; it now waits for them and names the bar and page if it fails. That change is a robustness fix, not a proven root cause.
- **#64 Hosting usage.** See the next section.
- **Display names separate from usernames (branch `display-names`):** a two-step first-time setup (name, then roles and champions) plus an optional Personalise step with the real Card Studio. Settings changes the display name everywhere it shows, never the username.
- **One designated substitute per role, and the public team page always on (branch `public-team`):** see "Substitutes and the public page".

## Hosting usage (Supabase and Vercel free plans)

The owner reported:
- Supabase egress at 6.25 GB of 5 GB;
- database size at 0.311 GB of 0.5 GB;
- a Vercel 10 GB allowance described as "Functions Storage" at 100%.

The full analysis is in `docs/HOSTING_USAGE.md` (PR #64).

**Verified:**
- `db-usage` on production: database 286 MB. Largest tables: `champion_matchups` 68 MB, `ranked_participants` 66 MB, `champion_synergies` 28 MB, `match_details` 28 MB, `ranked_bans` 21 MB, `brand_assets` 18 MB.
- `pg_stat_statements` (since 13 Oct) shows the largest result sets came from:
  - the Draft engine's full loads of three patches' matchups, synergies and role records, 212 calls each. That code was removed in #59.
  - the old Duo Synergies loader, 12.6 M rows, rewritten on 15 Oct.

  The remaining large readers:
  - a player's stored games on every profile page (5.1 M rows);
  - Duo Synergies' pair rows (7.1 M);
  - postgres-js's per-connection array-type lookup (7.8 M rows over 18,346 connections);
  - branding images (86 reads of several MB each).
- Every one of the 68 server functions traced PGlite, the embedded demo database, which production never loads. Measured on the same commit with a `DATABASE_URL` set: 1,555 MB traced, 1,284 MB of it PGlite. After #64's change: 270 MB, none of it PGlite.
- A Postgres build started with the PGlite package hidden: the app connects and `/api/health` reports the Postgres database as healthy. This mattered because drizzle's PGlite driver imports PGlite when it loads; a top-level import would have stopped every function from starting.
- On a seeded local database, behind a byte-counting proxy, the perf probe drew 5.83 MB from Postgres on `main` and 1.84 MB with #64. Three runs in one process: 17.38 MB and 5.38 MB.
- The new Duo Synergies SQL produced reports identical to the previous code for every role pair, orientation, patch option, sort and lineup filter (4,410 listed rows), on PGlite and on PostgreSQL. That comparison was a temporary test, not committed.

**Assumptions (not verified):**
- Byte figures for production queries are estimates from rows × columns. Supabase does not break egress down per query.
- Vercel's Hobby plan has no item named "Functions Storage". It may be the stored size of deployments' functions (what was measured and reduced), or Vercel's 10 GB "Fast Origin Transfer". The owner should check the Vercel usage page.
- Vercel's CDN cache is assumed to be cleared by each deployment, which would make every deployment re-read the branding images. The 86 reads fit that pattern, but it was not confirmed.
- Preview deployments are assumed to have shared the production database. Their scope depends on the project's environment variables, which were not visible.

**Behaviour change to note:** branch pushes no longer build Vercel previews unless the branch is named `preview/...` or the commit message contains `[preview]`. Production builds are unchanged.

## Substitutes and the public page

**Substitutes:**
- Each role has at most one designated substitute, in a new table `lineup_substitutes` (migration 0041, additive).
- Lineup managers choose or remove substitutes in Edit Lineup: Owner, Administrator and the Team Lineup Manager access group. The server action requires `manage-lineup` and refuses starters, archived or non-members, and players who do not list the role.
- The card's turn control is a small icon, shown only when the role has a substitute. The 3D turn is unchanged and visual only.
- The owner's brief said "Team Leader". That role was retired earlier in the project, so it was mapped to the existing lineup-management permission.

**Public page:**
- `/public` is always available, with no Admin switch and no banner.
- The per-member opt-in from #58 is removed. Lineup players and designated substitutes appear under their display names.
- Each public card is built field by field from an allowlist. A test pins its keys, and no rank, statistic, Riot ID or username is sent.
- A browser test, signed out, follows every link on the page and confirms none leads to sign-in. Members' pages stay closed.
- The old consent columns and the setting row are left in place, unused. Removing them would be a destructive migration.

## Clash Scout

A team-only page (Clash Scout, its own sidebar entry right below Team) that reads the opponents' Clash scouting screenshots in the browser and shows their five players side by side. Full description: `docs/CLASH_SCOUT.md`.

**Verified:**
- On three synthetic Clash screens (made by a script in the repository, at 1600 and 1280 px), the real recognition pipeline read:
  - every name exactly, in Cyrillic, Hangul, Japanese and Chinese;
  - the opponent's name, ranks, win rates, games and mastery.

  This held in Node, and in Chromium with the same Tesseract files the CDN serves (12.6 s for both screenshots, including downloads).
- Database tests: team isolation, the permission rules, signed verifications, and recognising earlier scouts by Riot account id only.
- Browser tests, with a stand-in for OCR: reading, the draft surviving a reload unsaved, replacing a screenshot, pasting, verifying, saving, the history, permissions, and phone and desktop layouts.

**Not verified / limitations:**
- No real client screenshot was tested. Real ones show real players and were not available. Real fonts, effects or a changed Clash layout may read worse; every value can be corrected, and unsure readings are marked.
- Latin `x`/`X` can be read either way.
- KDA can lose its decimal point at small sizes.
- Champion recognition was tested against synthetic portraits only. Data Dragon was not reachable from the development container.
- The jsDelivr CDN that serves Tesseract was blocked from the development container, so the CDN download itself was not exercised. The same files were served locally instead. A network that blocks jsDelivr shows an error after 60 s instead of reading.
- Riot verification was tested with the in-memory demo's stand-in Riot client, not Riot's API.

## Things the owner should decide or know

1. **2025 bookmarks (not done).** A one-off migration to delete bookmarks of 2025 games was prepared for the Matches cleanup. The agent's safety check stopped it as a destructive production data change. It was not worked around. 2025 games are hidden at read time instead, so nothing visible depends on deleting them. Deleting the rows needs the owner's explicit go-ahead.
2. **Draft tables (not done).** #59 removed the Draft feature's code but kept its tables. Dropping them is a separate, approval-gated migration.
3. **Branding images.** About 18 MB are stored in the database and re-read after deployments. A smaller background (MP4 or WebP instead of a large GIF), or object storage, would cut that.
4. **Vercel and Supabase usage pages.** Check after a few days that the reported items are falling, and which Vercel item was at 100%.
5. **Previews are now opt-in** (see above).

## Testing notes for a reviewer

- Local browser runs must not share a folder or a server. Two Playwright runs started in one worktree erase each other's `test-results`. A second run reuses the first run's server (`reuseExistingServer`) and so inherits its changed demo data. Both happened once in this session and produced false failures, which were then re-run cleanly.
- CI showed three flaky tests on #62's first run, each passing on retry: phone detail panel, phone team layout, tablet pool-champion window. They did not fail locally.
- GitHub Actions minutes are limited (about 16 billed minutes per full CI run; `docs/CI_USAGE.md`). Pushes were batched accordingly.

## Modernisation brief (19 Oct, from about 09:00 UTC)

The owner then sent a staged brief: audit first, fix two bugs at once, then security, automation, administration, installability and reliability. The audit is a separate document, written for the owner. These branches came out of it; each was tested locally as described in its pull request.

| Branch / PR | What it does | Database change |
|---|---|---|
| #68 `opgg-seasons` | OP.GG links use the newest known Riot ID (renamed players); Season 2026 is the earliest season offered anywhere | none |
| `season-start` | A season's match lists start when its first patch appeared, if that came before 1 January | none |
| `security-hardening` | Row Level Security on every table; security headers | RLS on (needs the owner's approval for production) |
| `audit-log` | Append-only record of admin and security actions | new table `audit_events` |
| `pwa` | Installable app: manifest, icons, offline page | none |
| #67 `remove-meta-trends` | Meta & Trends removed | strips the retired permission from stored lists (to add) |

**Verified:** on production (run 39232481955), the database statistics show Supabase's Data API (PostgREST) querying the database about 16,900 times since 13 Oct. So the Data API is active, and no table has Row Level Security.

**Not verified:** whether the API's `anon` role holds grants on the tables. Supabase grants them by default, but the dashboard was not visible.

## Final state

As of 19 Oct 10:30 UTC:
- **Merged and live:** everything in the merged table above, last #64. Production reports commit `4fb941c`.
- **Ready, CI running:** #66 (substitutes, public team page). The local full browser suite passed: 289 passed, 0 failed.
- **Draft, waiting their turn:** #68 and #67. They merge one at a time, each updated from `main` and re-tested first.
- **Pushed, no PR yet:**
  - `season-start`, `security-hardening`, `audit-log` and `pwa`.
  - `clash-scout`, which is stacked on #66.
- **Waiting for the owner:**
  - Row Level Security in production.
  - Dropping the retired Meta & Trends and Draft tables.
  - The 2025 bookmark deletion.
  - The other decisions listed in the audit document.
