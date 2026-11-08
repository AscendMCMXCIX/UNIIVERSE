# Live validation checklist

> **Meta & Trends was removed on 19 Oct 2026** (Solo Queue Meta, Duo Synergies, Pro Play and the global ranked, professional and aggregation jobs behind them). The first-run record below keeps those jobs as they ran then; the checks for them were removed from the list, and §21 checks that the feature is gone.
>
> **Clash Scout was removed on 23 Oct 2026** (the workspace, saved scouts, the Testing Lab and the `lab-benchmark` job). Its checks were removed from the list in the same way, and the phone tab bar checks named its three tabs (Profile, Team, Resources; five since the phone redesign of November 2026, docs/MOBILE.md); "Clash Scout removed" at the end checks that it is gone. Migration 0064 later dropped the scouts saved before then, with their tables.

**Status (13 Oct 2026, first production run at team-uniiverse.vercel.app):** the database path, accounts, the job endpoint, the GitHub Actions trigger and Data Dragon are verified live. The Riot API and Leaguepedia are not yet: the first tick showed the Riot key being rejected on every request and Leaguepedia refusing the pro query. Both now report their exact cause in Admin → Data & Riot; the Leaguepedia query was corrected (see the table below). `statistics: none · 0 games` is the expected consequence of those two failures, not a third problem: `aggregate` ran fine and had nothing to fold in.

What the first tick (GitHub Actions run #54) proved:

| Pipeline | Result | Meaning |
| --- | --- | --- |
| `version-check` | ok, patch 16.20 / Data Dragon 16.20.1, not a fixture | Data Dragon reachable, champion roster synced |
| `ranked-discover` | degraded: 3 requests, 3 errors, 0 players | every Riot request failed. The second run showed the status: **401 on `oc1`** for all three league lists, which Riot returns when the request carries no valid key (an expired key gives 403), so the `RIOT_API_KEY` value the deployment carries is not a key Riot knows (a replaced value only applies after a redeploy, and must be set for the Production environment). The job message and Admin → System Health → Environment now show the last four characters of the key in use, to compare with the developer portal, and flag a value that does not have Riot's `RGAPI-…` shape |
| `ranked-ingest` | ok, nothing queued | waiting on discovery |
| `pro-sync` | degraded: Leaguepedia refused the query | on the second run the message read "You've exceeded your rate limit": Leaguepedia refuses anonymous API clients from cloud addresses, so the adapter now logs in with a bot password (DEPLOYMENT.md §2b). The query also asked `ScoreboardGames` for a `League` column it does not have; fixed by joining `Tournaments` |
| `aggregate` | ok, 0 ranked matches, 0 pro games | correct given the above |
| `account-sync`, `integrity` | ok | nothing linked yet |

Verified later the same day with a working key (Oceania, `oc1`): discovery tracked 450 Challenger/Grandmaster/Master players and queued 375 matches; two ingestion runs stored 370 of them (5 remakes skipped, 0 failures) within the four-minute budget; aggregation folded them into statistics. Switching from the development key to the personal key showed that **Riot encrypts player ids per API key**: every stored player id answered 400 under the new key while match ids kept working. Discovery now prunes ids the current key cannot read and re-discovers players from the league lists; linked accounts re-resolve from their Riot ID.

Also observed: GitHub ran the `*/10` schedule only four to five times a day, so the workflow now runs every three hours and the ten-minute cadence is left to Supabase `pg_cron` (DEPLOYMENT.md §4). (Since then the schedule is hourly, delivered about 4 times a day, and since 7 Nov 2026 `pg_cron` runs the tick every 10 minutes and the rank watch every 5.) Earlier scheduled runs had no `APP_URL`/`CRON_SECRET` secrets and skipped; those were set before run #54.

Verified before deployment, on a real PostgreSQL 16 server in production mode (accounts required, setup key enforced): schema migrations including eight simultaneous cold starts, the owner setup → sign out → sign in flow, the Settings page and the authenticated job endpoint. The same database tests run on PostgreSQL 16 in CI on every push.

Each item says what to do, what to expect and where to look when it fails.

## Automated live check

**It runs by itself (3 Nov 2026):** GitHub's Production check (`.github/workflows/production-check.yml`) runs it after each production deployment and every day, from GitHub's runner, with no setup by anyone. Since 7 Nov 2026 it signs in as the verification account (below) and checks the member pages too; while that account is not available, or `SIGNED_IN_CHECKS` is `false`, it checks the public pages and the signed-out security only, and reports the member pages as pending. The numbered items below that need a signed-in member, and the pages the check does not open, stay for a person (`docs/MONITORING.md`).

`scripts/live-check.mjs` checks the deployed site from a browser. It runs the read-only checks that people otherwise do by hand, at desktop (1440 px), tablet (768 px) and phone (390 px) widths, and saves a screenshot of every page for review.

```
node scripts/live-check.mjs [base url] [output folder]
```

- **Base url:** defaults to https://team-uniiverse.vercel.app.
- **Output folder:** defaults to `live-check-<time>`. It holds the screenshots, `report.json` and `summary.md`. The run exits with 1 when any check fails.
- **Sign-in:** `UNIIVERSE_VERIFY_USER` and `UNIIVERSE_VERIFY_PASSWORD`, for a non-admin team member who is not in the lineup. They are read from the environment and never printed. In a cloud session they go in the environment's settings, and the site must be under its allowed domains.
- **The verification account** (no owner step; since 7 Nov 2026). The job `verify-account` keeps a member account called `verify` with **no player profile**. The Production check calls it before signing in, and it can also be run by hand from Data jobs (production only):
  - **Invisible to members:** it is in no list a member sees. Players, the lineup, leaderboards, statistics and team insights all read player profiles.
  - **Nothing collected:** it has no Riot account, so no Riot request is ever made for it. Its visits act as any member's do: opening a teammate's profile refreshes that teammate's Riot data when it is due (last synced 15 or more minutes earlier; one bounded 40 s sync), and an open game can check its players' ranks (below).
  - **Not counted as a member's use:** its page loads are left out of the field measurements (Admin → System Health → Page speed in members' browsers): `/api/vitals` drops the beacons of `verify` with no profile (`src/server/auth/verification-account.ts`). Until that change went live (7 Nov 2026, about 18:27 UTC) they were counted: about 30–40 loads per signed-in run, from the first one at 11:17 UTC that day. Those stay in the 28-day figures until 4 Dec.
  - **Access:** exactly the default member access, with no access group, no custom permissions and no administrator rights. It is the access a new member gets: Team, Players, a teammate's statistics, Matches.
  - **Sign-in:** through the normal sign-in form, with the normal password check and throttling.
  - **Its password is never typed, stored or shown.** It is worked out from `CRON_SECRET`, which the app and the Production check already hold (an HMAC with a fixed label; `src/server/jobs/verify-account.ts`). The workflow masks it the moment it computes it. Whoever holds `CRON_SECRET` could therefore sign in as this member, but they can already run every job and reach the database. After a change of `CRON_SECRET`, the next Production check updates the password by itself.
  - **What the job does:** it creates the account, changes nothing when run again, or updates the password after a secret change. It never touches an account of that name it did not make. It records its changes in Admin → Audit Logs.
  - **To turn the signed-in checks off:** set the repository variable `SIGNED_IN_CHECKS` to `false`, or deactivate `verify` in Admin. Then the member pages are reported as pending, not as a failure. Explicit `UNIIVERSE_VERIFY_USER` / `UNIIVERSE_VERIFY_PASSWORD` secrets, if set, take precedence.
  - **What it cannot show:** a member's own profile, Overview and first-time setup, because it has none of its own. CI covers those on demo data at three widths. It sees teammates' profiles as any member does.
- **Read only:** it signs in, opens pages and opens and closes games and windows. It also switches a view and presses Back, Enter and Escape. It never submits a form after sign-in, and never presses a bookmark, edit, save, sync, refresh, invite or admin control; every other request it makes is a GET. As with any member's visit, an open game can start the app's own background reads (rank checks).
- **What it checks:**
  - The deployment: production answers from the commit just deployed (it waits up to 5 minutes, `LIVE_WAIT_SECONDS`), and `/api/health` answers 200 with the app and its database ok; `/api/health` or `/login` slower than 3 s is a warning.
  - Riot's rules for a Personal key, signed out (docs/RIOT_COMPLIANCE.md): `/riot.txt` served as plain text, `/public/leaderboards` not found, and the public team page showing no rank and Riot's required notice.
  - Signed out and with a forged session cookie (#170): the member pages (`/team`, `/players`, `/matches`, `/leaderboards`, `/overview`, `/overview/accounts`, `/me`, `/settings`), the Admin Mode pages (`/admin`, `/admin/players`, `/admin/people`, `/admin/audit`, `/admin/system`, `/admin/data`) and a real member's profile, champions, matches and Riot Accounts are turned away to sign-in and carry no player or admin data. The members' API routes (`/api/freshness`, `/api/avatars/…`, `/api/card-banners/…`) answer 401, and the jobs endpoint answers 401 without the scheduler's secret or with a wrong one. Security headers on the sign-in page.
  - Signed in as the verification account, a standard member (desktop, requests only, no page opened): `/admin`, `/admin/people`, `/admin/audit`, `/admin/system`, `/admin/data` and `/admin/settings` are turned away to Player Mode with no admin data, the jobs' freshness answers 403, and the switch to Admin Mode keeps Player Mode without setting the admin view. Other Admin Mode pages (access levels, privacy records, branding, previews, resources) are not requested; their own permission checks are covered in CI (`src/app/page-guards.test.ts`).
  - The charcoal frame (#178): the sidebar open and folded, the current page's gradient bar, and the top bar, drawer and tab bar on tablets and phones.
  - Team Overview's layout (November 2026), on whatever lineup production has (a role nobody holds, no substitutes):
    - desktop (1440 × 900, the sidebar open): the team's header sits at most 24px under the section tabs, and the lineup with its bench ends inside the window (five across the cards take the height the window leaves them, less the verification account's own "Complete your player profile" card above the tabs);
    - phone (390 × 844): the first lineup card ends above the tab bar;
    - every width: the bench lists exactly the roles that have a substitute: a button for each card that turns to one, an entry without a control only for a role nobody starts in, nothing for a starter without one.

    A fact whose precondition does not hold (the lineup not five across, no tab bar, no substitute anywhere and no bench) passes as "not applicable" with the reason. Only positions, counts and role names are reported.
  - All Champions (#178): compact rows, sorted by games, no heading cut short. The champion window still opens and closes. In a new ranked year's first six weeks, a list empty because the player has games but none in the new season yet is a warning; any other empty list fails.
  - Games (#178):
    - Team Matches opens a game under its card, with no window and `?match=` in the address;
    - a copied link opens it, and Back returns to it;
    - Enter toggles it, and "Close this game" closes it with the focus back on the card;
    - Match History and its Encounters view still open.
  - axe (#173) on the main pages at every width, with a game open, and in the champion window: WCAG 2.1 A and AA plus `label-content-name-mismatch`, with no serious or critical violation.
  - Every page at every width loads signed in (not turned away, and not the not-found or error screen, which can arrive with HTTP 200 once a page has begun streaming), with:
    - no sideways scroll;
    - no page error or app console error;
    - no failed request to the app;
    - no broken image from the app.
  - Signed in it opens 8 routes at each width: Team, Players, a teammate's profile, their All Champions, Team Matches, their Match History, Leaderboards and Settings. The teammate is the lineup's first player; if Team shows none, it opens the account's own `/overview/champions` and `/overview/matches` instead, which the verification account (no profile) cannot fill, so All Champions then fails. It never opens Resources, a teammate's Riot Accounts or Matchups tabs, the member's own `/overview/*`, `/me`, `/welcome*`, `/matches/insights` or any `/admin` page in the browser. A change to a page it renders but asserts nothing about (Ranked progress, Card Studio looks, the phone tiles) is "deployed, its pages load cleanly on production", not production-verified; CI checks its behaviour on demo data.
- **Locally:** `LIVE_LOCAL=1 node scripts/live-check.mjs http://127.0.0.1:<port>` checks a demo build started like the browser tests' server. There is no sign-in, and the security checks are skipped. On 3 Nov 2026 the demo build of `main` at `d72619a` passed all 200 checks, with no axe violation; on 7 Nov the demo build passed all 199 with the boundary checks added; on 8 Nov the demo build of `ux/team-overview` passed all 204 with Team Overview's facts, and again with Support left empty and its substitute kept (production's shape).

## 1. Data Dragon (champions, patches, portraits)

- [ ] Admin → Data & Riot → run `version-check`. Expect status *ok* and Data health showing the real current patch (e.g. `15.19`) instead of `0.0 / offline fixture`.
- [ ] Champion portraits render as images (not lettered tiles) on Team and the profiles.
- [ ] Newest champions appear in the grid. If a champion is missing a curated profile the app marks it "New champion: characteristics not yet curated" and still allows it everywhere.
- [ ] Wait for (or simulate) a patch day: `version-check` records the new patch and syncs new champions and skins within an hour.

Failure signs: "Static provider unavailable" in the job log → the host cannot reach Data Dragon (firewall/egress). The app keeps working on the last synced roster.

## 2. Riot API key

- [ ] Add `RIOT_API_KEY` in the host; redeploy. Admin → System Health → Environment shows the key as *set*.
- [ ] Link a Riot account on My profile: the account shows *Synced* with "Last updated", the server badge carries ✓ when Riot confirmed it, and the RIOT DATA panel lists champions with Very strong / Strong / … labels.
- [ ] After changing `RIOT_API_KEY`: linked accounts show "resolved again on the next sync" once and recover.
- [ ] 429 handling: temporarily lower `RIOT_RATE_LIMITS` to `2:1,10:120`, run `account-sync`, confirm the job slows down rather than failing with 429 errors.

Failure signs: 401 → the value stored as `RIOT_API_KEY` is not a key Riot recognises (wrong value, placeholder, extra characters); 403 on every endpoint → the key expired (development keys last 24 h) or was revoked; 403 on `/riot/account/v1/…` only, while `riot-check` says *accepted* → the request went to a routing value that does not serve ACCOUNT-V1 (the `sea` host did until 575a4f6; account lookups now use `asia`); 404 on `by-puuid` endpoints → wrong regional routing (check `RIOT_PLATFORMS` values like `euw1`, `kr`, `na1`, `oc1`).

- [x] `riot-check` (Admin → Data & Riot → Riot credential → **Check key now**, or the data-jobs workflow with `job=riot-check`) answers with the key's state and the HTTP status without exposing the key. *2026-10-13: `accepted`, status 200 on oc1, key fingerprint `…18eb`.*
- [x] The **Production smoke** workflow (Actions → Production smoke → Run) prints the live build from `/api/health`, 200 for `/login`, 307 → `/login?next=…` for every private page, 401 for the job endpoint without the secret, and a redirect to `/overview` for the retired Ranked Development addresses (`/overview/development`, `/overview/blocks`, `/blocks`, `/ranked`).

## 3. Linked Riot accounts and proficiency

- [ ] Players → a player → Riot accounts: add your own Riot ID (exact spelling, including the tag). Expect the PUUID to resolve and the status to become *synced*; a renamed account should keep the same PUUID and adopt Riot's canonical spelling.
- [ ] Add the same Riot ID again (or an alt that resolves to a linked PUUID): expect a clear "already linked" message, never a duplicate.
- [ ] After `account-sync` (Admin → Data & Riot) the Team page shows tier dots on pool champions.
- [ ] Unicode Riot ID (Korean/Japanese name): it must be sent and shown exactly as typed.
- [ ] Unlink an account: its history disappears from the proficiency view.

## 5. Database and deployment

- [ ] Supabase: first start creates all tables (`drizzle/*.sql` run by the embedded migrator, under a transaction-scoped advisory lock that is safe behind the transaction pooler). Check the Supabase table editor for `riot_accounts`, `pro_pick_slot_stats` and `uniiverse_migrations` (two rows).
- [ ] Production auth: with `DATABASE_URL`, `UNIIVERSE_AUTH_SECRET` and `UNIIVERSE_ACCESS_PASSWORD` set, the first visit shows the setup page; create the owner with the setup key. Afterwards `/login` is required for every page.
- [x] The GitHub Actions workflow (`APP_URL` + `CRON_SECRET`) calls `/api/jobs/tick` and prints the response; Data health shows success times for every job. *Verified on run #54.*
- [ ] Supabase `pg_cron` schedule in place (DEPLOYMENT.md §4c) so the tick runs every ten minutes; `select * from cron.job_run_details order by start_time desc limit 5;` shows recent runs.
- [ ] `/api/health` returns 200 with `deployment.commit` (the deployed commit), the patch, warnings and the job summary.

## 6. Team platform flows (two browsers)

- [ ] Accounts are created by an admin (Admin → Players & Accounts → Add Player Account, see §10). Old invitation links explain that an admin creates accounts.
- [ ] The original owner sees "Complete your player profile" once; after entering a Riot ID and role the banner disappears and the profile exists exactly once.

## 8. Ranked Improvement journal (two browsers)

- [ ] Signed in as player A: Solo Queue Blocks (Overview → Solo Queue Blocks) → add a game (champion, enemy laner, result, main mistake, notes) → it appears in BLOCK 001 with "1 of 6 games"; the dashboard counts it.
- [ ] Add five more: the sixth completes the block ("BLOCK 001 complete at 6 games"); **Start next block** opens BLOCK 002; **Finish block** closes a shorter block at its real size.
- [ ] Signed in as player B: Solo Queue Blocks shows B's own empty journal; opening A's block URL (`/overview/blocks/<id>`) answers "not found"; tagging B as the teammate on A's game changes nothing for B.
- [ ] With a synced Riot account: **Add recent ranked game** lists recent Solo/Duo games; importing one fills champion, opponent, result and date and marks it *Synced*; the same game cannot be imported twice.
- [ ] Phone (375 px): the page has no horizontal scroll, **Solo Queue Blocks** is the fifth tab, every button is at least 44 px tall.

## 9. Things to watch over the first weeks

- Admin → Data & Riot warns when a pipeline has not succeeded for too long; take warnings seriously, they are the only alarm.
- After each patch, confirm the patch number changes within an hour.
- If Riot changes response shapes, the jobs degrade gracefully and say so; the app keeps running on existing data.

## 9. Roles, Players, Overview and Admin Mode

- [ ] Owner signs in and lands in the **Player View** (Team, Players, Matches, Overview, Settings; no admin links). The sidebar (phone: the drawer) offers **Switch to Admin**; Admin Mode shows ADMIN MODE and Users & Permissions, Players & Accounts, Competition, Data & Riot, Branding, System Health; **Back to Player View** returns.
- [ ] Account creation and first sign-in: see §10.
- [ ] Signed in as that player: Players lists the team's players (Primary Role champions only); another player's profile opens read-only (roles, pools, Riot accounts, overview) with no Edit button; `/players/<their id>/edit` redirects back to the profile; `/admin/players` redirects to Team; the own profile shows **Edit my profile** and pools can be changed there.
- [ ] Team shows the five roles with the assigned Main player and labelled champion context (Recent games, Win rate, Proficiency); a player sees no Change/Assign control; an admin does, listing the team members who play that role.
- [ ] My Overview: rank, season record, one card per pool champion (portrait, games, W/L, win rate, combined mastery, proficiency, last played); the **Season** and **Game mode** dropdowns (All supported games, Ranked Solo/Duo, Ranked Flex, Normal games) change the URL and the figures; the season shows *Partial* until every account is read back to the season start; "Show other champions played" is optional; Solo Queue Blocks opens from the panel at the bottom.

## 10. Phase 1: accounts, password sign-in, permissions

- [ ] Owner signs in with username + password as before; owner profile, Riot account and pools unchanged.
- [ ] Admin → Players & Accounts → Add Player Account: a typo'd Riot ID shows *Account not found*; with a valid one *Account verified* appears and **Create account** turns on; creating shows a temporary password once (xxxxx-xxxxx-xxxx).
- [ ] In a private window: username + temporary password opens WELCOME TO UNIIVERSE at *Choose your password*; mismatched or weak passwords are refused; /team redirects back to /welcome until setup is finished; signing out mid-setup and signing in with the new password resumes setup; Finish setup opens Team.
- [ ] The temporary password no longer works once the permanent one is set. Users & Permissions → Reset password → the new temporary password signs in and asks for a new permanent password; the old password does not work.
- [ ] Deactivate the player: their open window is signed out on the next page load; Reactivate restores access with their existing password. The last admin cannot be deactivated, deleted or demoted.


## 11. Phase 2: Riot data

- [ ] GitHub → Actions → Data jobs → `data-audit`: every linked account shows Synced or Synchronising with season games per queue; ranked matches are on 16.x patches; pro games on 16.x patches.
- [ ] Ban a player's whole pool for a role: EMERGENCY PICKS — Outside Configured Pool shows about three champions; locking one does not change the profile.
- [ ] Admin → Data & Riot: the "At a glance" panel answers the five questions in plain words.

## 12. Phase 3: interface, permissions, accounts, admin and branding

- [ ] Sidebar stays put while a long page scrolls; on a phone the bottom tabs and the drawer work; a player without a capability does not see its page and gets "No access" if they open its address.
- [ ] Settings: change your username (sign-in works with the new one, case-insensitive); change your password (the checklist turns green; a password without a number or symbol is refused next to the field); add, crop and remove a profile picture.
- [ ] Settings → Riot accounts: Change Riot ID to the same account's new name renames it; a different account asks before replacing; another player's account is refused.
- [ ] A player profile: add, remove and drag champions (mouse and phone); "Saved" appears; reload keeps the order; editing the same profile in two tabs warns instead of overwriting.
- [ ] Team: five player cards with pictures and season figures; Edit opens the pool editor; no saved/recent lineups.
- [ ] Admin → Players & Accounts: the status filters count correctly; Reset password opens a dialog and then shows the temporary password once.
- [ ] Admin → Data & Riot and System Health: statuses match reality (for example Riot API Healthy only while Riot accepts the key); details open on request.
- [ ] Admin → Branding: upload a small animated GIF logo (the sidebar and the phone's top bar animate, square at the logo's own proportions; the browser tab shows a still icon; with "reduce motion" turned on in the OS they show the still frame); try a light background colour (Save stays disabled with a contrast message); Reset to defaults.
- [ ] Role icons: in a normal browser the role filter shows Riot's position icons (the sandbox used to build this could not load them, so built-in shapes are the fallback).

## 13. Phase 4: data reliability, automation, access levels, player pages

- [ ] Leave the site alone for a few hours: Admin → Data & Riot shows ranked games and statistics updated within the last hour or two (GitHub starts a tick hourly; it is best-effort, so gaps of a couple of hours can happen) and nobody pressed anything.
- [ ] Open the site after a quiet spell: within about a minute a background refresh starts (Data & Riot → jobs show trigger "visit"); the page itself loads as fast as usual.
- [ ] Link a new Riot account: it shows Updating, then Catching up on history; keep the page open and the status and figures change by themselves; Retry sync does not appear unless the status is Delayed or Needs attention.
- [ ] My Overview: edit roles and champions in place (Saved appears); the Solo Queue Blocks card shows the current block and x/6; Add game opens the journal with the form ready; the season dropdown lists last season, labelled Partial Data until its games are in.
- [ ] Team with a role emptied: the card lists registered players for that role with reasons, and Assign (for lineup managers) fills it; the "What the lineup brings" strip changes with the lineup.
- [ ] Players: search a name and a Riot ID; filter by Support; "Main lineup" shows the five.
- [ ] Admin → Users & Permissions: set a player's Access Level to Restricted Player, then Administrator, then Custom with "Manage matches"; their navigation and what the server allows change accordingly. Your own level is not editable; making someone Owner (or removing it) asks first; the last Owner cannot be demoted.
- [ ] Change your password to one under 12 characters (Save stays off), then to `qwerty123456` (refused: "too common"); an existing password still signs in.
- [ ] Admin → Branding: upload a GIF between 5 and 20 MB: the button shows upload progress, the logo animates afterwards, and a note mentions first-visit load time.

## 14. Phase 5: profiles, statistics, pools

- [ ] Team: no "What the lineup brings" strip; each card has 2–3 strength tags (or a plain "<Role> Main" while data is thin), equal heights, the chosen featured champion's art behind the header, and "+N more" when the pool is longer than three.
- [ ] My Profile (sidebar): the same layout as a teammate's profile; your own card is not in the Players list; a teammate's profile is read-only unless you are an admin.
- [ ] My Profile → Team card style: pick a featured champion and an accent; the Team page shows them after a reload.
- [ ] Profile statistics: win rate, games and KDA lead; CS, damage and vision show "per game" with how many games had details; switching season or mode updates every figure; a champion card shows its own KDA and the proficiency badge with an info (i) explanation.
- [ ] Champion pools: add a third role (Add another role), give it champions, reorder roles; add more than six champions to a pool (no limit message); drag to reorder still works.
- [ ] Solo Queue Blocks: Add game shows recent Riot games; one tap adds one (with optional mistakes and a note); only you can see your blocks.
- [ ] Sidebar: collapse it (icons only, names on hover), reload: it stays collapsed; expand again.

## 15. Phase 6: navigation, player identity, statistics, Riot accounts, access groups

- [ ] Sidebar: Team (Overview, Matches) collapses and stays collapsed after a reload; Players, Solo Queue Blocks and My Profile are top level; the collapse button sits next to the logo.
- [ ] Account menu (your name at the bottom of the sidebar, your picture on phones): My Profile, Riot Accounts, Settings, Switch to Admin (owners), Sign out; it opens fully on a short laptop screen.
- [ ] No "NEW" badge anywhere in the champion selector or on Team.
- [ ] Team: every card shows the whole pool for its role (scrolls inside when long), 2–3 tags that differ between teammates, and **Customise** on your own card only.
- [ ] Customise: choose a champion and one of its skins (skins appear after the daily static sync has run once on this version); the Team card, Players card and profile header all show it after saving.
- [ ] My Profile → Overview: the label reads "All champions · all roles · all accounts · Season 2026 · All supported games" by default; choosing a role, a champion or one account changes every figure and the label; "Everything" resets.
- [ ] Add the same champion to two role pools: both pools keep it; its card on Champions & Roles shows separate games for each role.
- [ ] Riot Accounts tab with two accounts: one Main, one Alt; "Make Main account" on the Alt swaps them and the profile's Riot ID changes; the three-dot menu is never cut off, also on a phone.
- [ ] Admin → Branding: Sign-in background and App background are separate; changing one leaves the other.
- [ ] Admin → People & Access: open **Access** for a Standard Player, add **Team Lineup Manager**, save; that player can now change the lineup on Team and nothing else changes. Remove it again; the lineup dropdown disappears for them and the server refuses a change.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0020 applied; the Owner still signs in.


## 16. Phase 7: workflow, layout and quality of life

- [ ] Team: each card shows three champions of the role's pool and "+N more" (hover it for the count); cards line up; **Edit lineup** next to the heading turns on the Change/Assign buttons, **Done** turns them off; your own card has a small brush (Personalise).
- [ ] Sidebar collapsed: pointing at it opens it over the page, moving away folds it; with its account menu open it stays open; after a reload it is still collapsed.
- [ ] My Profile: Overview, Champions & Roles, Solo Queue Blocks, Riot Accounts as tabs under the profile card, the same bar as Team's (on a phone it scrolls sideways with the current tab in view); a teammate's profile has no Solo Queue Blocks. Overview shows CS/min and damage/min; no "Show other champions played".
- [ ] Champions & Roles: no secondary role preselected; "+ Add secondary role" adds one, its bin icon removes it. Drag a champion card: it follows the pointer and the others slide; after a reload the order is kept. Keyboard: focus a grip, Space, arrows, Space.
- [ ] Solo Queue Blocks: starting a block asks how many games (nothing filled in); finishing early shows "Completed early (x of y)" in Block history; a game played with a teammate who has a linked account shows "Played with <name> · same team" and the × removes it.
- [ ] Admin creates a new account: the player's setup page shows Primary role "Not selected"; until setup is finished the player is missing from Players (admins see "Setup pending"), and Team lineup choices.
- [ ] My Profile → **Match History** (between Solo Queue Blocks and Riot Accounts): newest game first, one compact row each (Win/Loss written out, queue, time, champion, K/D/A, CS/min, damage/min, vision, kill participation, items); numbered pages, no endless scrolling; filters for mode, role, champion and (with two or more linked accounts) account. Clicking a row opens the game over the page (both teams, objectives, bans); Escape or × returns to the same page and row. A Ranked Solo/Duo game offers **Add to Solo Queue Block** once.
- [ ] My Profile: the camera badge on your own picture adds, changes or removes it; the new picture shows in the sidebar, on Team and on Players. A teammate's profile has no camera badge.
- [ ] Personalise → skin list: no chromas, no repeated or broken pictures, default first, a search box for long lists. GitHub Actions → Data jobs → `skin-audit`: `cards.on_chroma` and `cards.on_missing_art` are 0 once the static sync has run; `cleanup.splash_unchecked` falls by up to 300 per static sync.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0026 applied; the Owner still signs in.

## 17. Phase 8: player identity, navigation and UX refinement

Items in earlier sections that describe "+N more" on Team cards, blocks of six games that close
themselves, the account menu holding Riot Accounts and the Admin switch, or the old proficiency
labels are superseded by this section.

- [ ] Sidebar: the Team section lists Overview, Players, Matches; then My Profile. Collapsed, pointing at it opens it smoothly (no text jumping, icons stay put) and moving away folds it; the toggle at its foot keeps it open. With reduced motion turned on in the operating system it opens without animating.
- [ ] Account menu (your name at the foot of the sidebar): only Settings and Sign out. "Switch to Admin" is in the sidebar for those who may use it.
- [ ] My Profile: one section dropdown (Overview, Champions & Roles, Solo Queue Blocks, Match History, Riot Accounts) with a tick on the current section; Back and Forward move between sections; the season and mode chosen on Overview are kept when moving to Match History.
- [ ] Team: every card shows the whole pool for the role held in the lineup (count in "Mid pool · 6"), no "+N more" and no scrolling inside a card; cards in a row are the same height; tags describe the role held (move a player to another role with Edit lineup: their tags and statistics follow the new role).
- [ ] Team: a card whose role has a designated substitute shows a small turn icon (no text) on its artwork; it turns the card over to that substitute, with "Sub" beside their role status; clicking the card, the back arrow or Escape turns it back; a reload shows the saved lineup. A role without a substitute has no turn icon. In Edit lineup, a lineup manager (Owner, Administrator, Team Lineup Manager) chooses or removes each role's substitute from the **Sub** menu (only bench members who list the role are offered), and **Start** on the back makes the substitute the starter with the former starter as the new substitute. Members without lineup rights see neither control. Phones: a sideways swipe scrolls, it never turns a card.
- [ ] Settings → Profile: Display name and Username are separate fields. Changing the display name shows on Team, Players, your profile, cards and Leaderboards, and in the account menu (with "Username: …" beside it); you still sign in with the same username. A one-letter or invisible-character name is refused. New player: after the password, "Your name" (prefilled with the username) with a live card preview, then Roles & champions; Back keeps everything and a reload resumes; then the optional Personalise step (picture and Card Studio) with Skip for now.
- [ ] Team → Matches: both tabs open on Season 2026, with no 2025 or "All seasons" option (a later season appears once games exist); no "Played together most" section. One compact toolbar per tab (Season, Game mode, a searchable member picker, members in the game; "Clear filters"); the summary line under the title has its caveats in the (i). Switching tabs keeps the season, mode and member. An old link with `?season=15` or `?season=all` opens Season 2026.
- [ ] Champions & Roles: each role's pool is edited in place (× to remove, drag or arrow keys to reorder, **Add** opens a search right under the pool); "Saved" appears after each change; the role menu switches, moves or removes a role.
- [ ] Any champion picker starts with a search box and your pool / recently used champions; "Browse all" shows the whole list.
- [ ] Overview filters: Season and Game mode up front; Refine opens Role played, Champions and (with two or more linked accounts) Linked account; active refinements show as chips with ×; "Everything" resets.
- [ ] Proficiency labels read Main / Comfortable / Familiar / Few games / Out of practice / Not played, with evidence bars beside them. Actions → Data jobs → `proficiency-audit` reports old against new tiers (players anonymised).
- [ ] Solo Queue Blocks: start a block with a target of 3, 12 or 25 games, or "No target". At the target the block stays open ("Target reached" with Finish block and "+3 more"); further games count past the target. The target can be raised, lowered or cleared at any time; Finish block works at any count. Long blocks list games five at a time.
- [ ] Match History: the record and averages of every matching game under the title; the same filters as Overview (Refine includes "Configured pools"); on wide screens each row shows both lineups with you outlined; compact page numbers with "Games 1–7 of 36". Opening a game shows your figures with Scoreboard and Comparison tabs; Comparison shows your share of the team's damage, gold and kills, you beside your lane opponent and team average, and team totals. Nothing is graded.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0026 applied (this phase added none); the Owner still signs in.

## 18. Phase 9: UX, navigation and player experience

Items in earlier sections about strength tags, the Champions & Roles tab, blocks that need a target
before starting are superseded by this section.

- [ ] Sidebar: Team (Team Overview, Players, Matches) and My Profile (Overview, All Champions, Solo Queue Blocks, Match History, Riot Accounts) open and close smoothly; a closed group stays closed after a reload. The account menu has only Settings and Sign out.
- [ ] My Profile: the section bar under the profile card matches the sidebar; on a phone it is a compact menu; Back and Forward move between sections; the season and mode stay when switching section.
- [ ] Overview: season performance, then your Primary Role pool and Off Roles pools, one card per champion with statistics and proficiency. Add a champion from the "Add champion" cell, drag or use the keyboard to reorder, × to remove; "Saved" appears each time.
- [ ] All Champions: every champion you played, searchable and sortable; the Account filter appears only with two or more linked accounts.
- [ ] Team: no tags; each card lists every pool champion for the lineup role with games, win rate, proficiency and mastery.
- [ ] Solo Queue Blocks: "Start block" shows 0 / 1; logging a game with no block running starts one; the block grows past 6, 12 and 18 games; a target is optional and can be set or cleared; Finish block works at any count; the Ranked Focus card keeps a featured champion and your focus, and a finished block keeps the focus it was played with.
- [ ] Match History: on wide screens each row shows both teams with player names (hover for the full Riot ID). Open a game → Build: the first time, the build and skill order load from Riot (one request) and appear minute by minute; a game Riot no longer serves says so. Older games show the keystone and secondary path; games stored from now on show the full rune page.
- [ ] Tooltips (ⓘ): open on hover and close on leaving (desktop); open on tap and close on a tap elsewhere (phone); never cut off at the edge of a card or the screen.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0028 applied; the Owner still signs in.

## 19. Phase 10: Admin, account access and responsive design

Items in earlier sections about switching between Player View and Admin Mode, delegated admin
groups (Branding, Data managers), the Administrator level, or the UNIIVERSE default
logo and backdrop images are superseded by this section. Its first two items (Admin Mode as the
Owner's only workspace) are superseded in turn by "Administrator access, Player Mode and Admin
Mode" at the end.

- [ ] Sign in as `adminascend`: it opens Admin Mode (Accounts) with no Player View switch. Team Overview, Players and Matches are in the Admin sidebar and work there.
- [ ] Sign in as a team player: no Admin link anywhere; typing `/admin/people` sends them to their profile.
- [ ] Admin → Accounts lists every account, including ones created but never signed in ("Awaiting first login") and ones that have not finished setup ("Setup incomplete").
- [ ] Create two accounts one after the other, pressing Copy details after each: each copy holds that account's own username and password.
- [ ] Create a "Personal use only" account; when they sign in they see My Profile only; `/team` is refused. Manage access → Team membership → on: they gain Team (and appear in Players once set up).
- [ ] Branding: remove the logo and sign-in background: the sign-in page shows the name as text on a plain background; colours unchanged.
- [ ] Admin → Previews: Sign in and New player setup at Phone, Tablet, Laptop, Desktop; typing and choosing champions works; nothing is saved.
- [ ] Sidebar order My Profile, Team; close My Profile while on Match History: it stays closed after a reload.
- [ ] On a 1920px or larger monitor the pages fill the screen in proportion without browser zoom.
- [ ] Team cards and My Profile pool cards show CS/min; open a match: players with a stored rank show a small rank badge (last known, with its date on hover).
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0029 applied; one Owner.

## 20. Phase 11: player experience and admin refinement

Items in earlier sections about Other players, substitutes or the Coach role are superseded by this section.

- [ ] Change your card art under Customise, then open Team, Players and your profile in another tab: the new art shows everywhere after a normal page load, and on your profile header straight away.
- [ ] Team: on a wide monitor the five cards sit side by side, centred; on a laptop they wrap in balanced rows. A Support card shows "Avg vision"; a player in a role other than their primary one shows the Off Role badge.
- [ ] Players: each card shows only Primary Role champions.
- [ ] My Profile → All Champions: click each column header twice (both directions); Mastery points shows combined points; on a phone, use Sort by.
- [ ] Solo Queue Blocks: a new block reads "0 Games" with no target until one is set.
- [ ] My Profile: drag the Off Role section above the primary one: it becomes the primary role and the old primary becomes Off Role 1, champions unchanged.
- [ ] Admin → Previews → New player setup: sign in as NewPlayer / Kq4xz-Tm7Rp-9abW, try the temporary password as the new one (refused), finish the roles step, switch Account type, Restart. Nothing changes in Accounts.
- [ ] Collapse the sidebar: only the three group icons remain, the current group marked; point at it to see everything.
- [ ] Admin → Accounts → Manage access on a personal-use account: the list says what they can do (My Profile, Settings) and nothing from Team.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0031 applied; one Owner; `retiredCoachRole` 0.

## Public team page (October 2026)

- [ ] Signed out (a private window): `/` opens the public team page. It shows the five lineup cards with each player's display name and picture, no username, Riot ID, rank or statistic, and no lineup controls. There is no banner.
- [ ] **Sign in** opens a small window over the page with the username field focused; Escape closes it. A wrong password says so in the window; a correct one goes to the account's start page (a temporary password to choosing a permanent one). `/login` still works on its own and links to the team page.
- [ ] **Install App** sits in the header (the icon alone on a phone) and opens the install steps for this browser; the installed app does not show it.
- [ ] Signing out of the last account lands on the public team page.
- [ ] (While `UNIIVERSE_PUBLIC_RIOT_DATA` is unset, as on a Personal key.) The public header has no Leaderboards link and `/public/leaderboards` is not found.
- [ ] (Only after a Production key whose registration describes the public pages, with `UNIIVERSE_PUBLIC_RIOT_DATA=true` set in Vercel.) Signed out: the cards show ranks and this season's figures, the Leaderboards link opens boards that rank only the lineup and its substitutes and link to no profile, and the privacy page says the public page shows ranks and statistics.
- [ ] A role with a designated substitute shows the turn icon; it turns the card over to the substitute and back. Nothing is saved.
- [ ] Opening a card shows the champion pool, with no link to a profile. Every link on the page opens without asking to sign in, except **Sign in** itself.
- [ ] Signed in: `/public` looks the same, with **Open the app** instead of **Sign in**. Settings has no Public profile panel, and Admin has no Public Access entry.
- [ ] A lineup change shows on the public page within a minute.

## 21. Meta & Trends removed (19 Oct 2026)

- [ ] Sidebar (Player View and Admin Mode), the collapsed rail, the phone tab bar and the phone drawer show no Meta & Trends, Solo Queue Meta, Duo Synergies or Pro Play entry, and no gap where one was.
- [ ] `/trends`, `/trends/solo`, `/trends/duos` and `/trends/pro` answer *not found* for members and send visitors to sign in.
- [ ] Admin → Riot Data lists the remaining jobs only (no `ranked-discover`, `ranked-ingest`, `aggregate` or `pro-sync`), shows no Global Data Coverage and no Champion reworks panel, and its status cards cover Riot, player accounts and anything that needs you.
- [ ] Admin → System Health → Environment lists no `PRO_DATA_PROVIDER` or `LEAGUEPEDIA_*`; Diagnostics shows no ingestion backlog; `/api/health` lists no retired job.
- [ ] Team Overview, profiles, Leaderboards, Match History (including other players' ranks), Matchups and Played Together show the same figures as before; a profile's Encounters counts the games its Match History lists.
- [ ] GitHub Actions → Data jobs → `smoke perf-probe`: every step passes and no step names a retired job.

## Player Card Studio on phones (October 2026)

- [ ] Player Card Studio on a phone (portrait and sideways): every step's controls can be tapped; on Artwork the champion search, role filters, champion list and skins are each usable; Hide puts the preview away and Show brings it back; the Links step (your own card only) shows the preview's icons as you type, and Save keeps the card and the links together.

## Player Card Studio on phones and the Team logo (October 2026)

- [ ] On a phone, the Studio has one section bar instead of a row of steps: it names the section you are in with its number; previous and next work; tapping it lists all sections (your own card: 7, with Links) and marks the ones you changed; nothing scrolls sideways.
- [ ] Hide puts the preview away to a strip and the controls get the room; closing and reopening the Studio keeps it hidden; Show brings it back. Full card shows the whole card in Team card, Phone and Players views, and Done returns to the same section.
- [ ] Changes made in one section are still there after visiting the others and after turning the phone; held sideways, the preview stands beside the controls and Save is on screen.
- [ ] Typing the tagline on a real phone: the keyboard never covers the field or Save; the preview becomes a strip while typing and comes back after.
- [ ] Reset look, Cancel with changes, the close button, Android's back gesture and (on an iPhone) swiping back from the edge each ask "Discard your changes?" or "Reset the whole look?" first; Keep editing keeps every change; with nothing changed, Cancel simply closes.
- [ ] Team Overview, on a phone and on a desktop: the team logo (in the top bar on a phone held upright, in the header elsewhere) is square and whole (not taller than wide), animates, and shows only its still frame when the phone asks for reduced motion; the role bar marks the current player and shows each player's picture; each card swipes into the centre with a glimpse of the cards either side.

## Administrator access, Player Mode and Admin Mode (21 Oct 2026)

Supersedes the Admin Mode items above. Migration `0053_administrator_access` adds `users.is_admin`, false for everyone: nobody becomes an administrator by the deploy.

- [ ] (Until migration 0055; see "One Owner account again" below.) Sign in as `adminascend` (the Owner). It opens Admin Mode's **Dashboard** (the Owner has no player profile). The sidebar shows Dashboard, Users & Permissions, Platform Settings, Data & Integrations, System Health and Audit Logs, no player page, and **Return to Player Mode** at its foot.
- [ ] Users & Permissions → find your own player account → **Manage access** → **Administrator** → on → **Save access**. The row shows an **Administrator** badge, and Audit Logs → Access & permissions shows "Granted administrator access".
- [ ] Sign out, then sign in to your player account. Your profile, Riot accounts, card and statistics are unchanged, and the sidebar now has **Switch to Admin Mode**. It opens the Dashboard; **Return to Player Mode** opens Team.
- [ ] In each mode: reload, open a bookmark of a page of that mode, go Back and Forward, and open the installed app. The mode stays. The installed app (and `/`) reopens the mode used last.
- [ ] On a phone: the account sheet (your avatar, top right) holds the switch; Admin Mode's tab bar is Dashboard, Users, Settings, Health; Player Mode's is Team, Players, Leaderboards, Matches, Profile (docs/MOBILE.md).
- [ ] A player account that is not an administrator: no switch anywhere, Admin Mode never named, and typing `/admin` or `/admin/people` opens Team.
- [ ] Turn administrator access off for an account while it is signed in: its next page is Player Mode, `/admin` opens Team, and the switch is gone. Its saved mode is forgotten (`/` opens Team).
- [ ] An administrator who is not the Owner cannot change the Owner account (Manage access shows "Managed by the Owner"), nor their own administrator access.
- [ ] GitHub Actions → Data jobs → `smoke perf-probe auth-audit`: every step passes, `auth-audit` lists migration 0053 and the Owner still signs in.

## One sign-in per browser (21 Oct 2026)

Supersedes the items above that add a second account in the same browser.

- [ ] Data jobs → `smoke perf-probe`: every step passes, and `deployment.commit` is the merge commit.
- [ ] The account menu (avatar) holds Settings and Sign out only: no Switch account or Add account. Signing in as someone else ends the previous session.
- [ ] On a phone: Sign in on the team page opens a window that fills the screen; with the keyboard up, the username, password and Sign in stay in view; a wrong password shows its message above the keyboard; Close returns to the team page. Held sideways, the brand and Close stay at the top while the form scrolls.

## One Owner account again (migration 0055)

Supersedes the items above that sign in as `adminascend`. Migration `0055_restore_ascend_owner` makes `ascend` the Owner and only administrator and locks `adminascend` out. It is merged only after a production backup has succeeded (docs/BACKUPS.md).

- [ ] Before merging: the private repository `uniiverse-backups` → Actions → Database backup has a successful run from the same day (the dump restored and its counts matched production).
- [ ] Data jobs → `smoke auth-audit`: `owners` lists `ascend` only (active, with a password and a profile), `administrators.active` is 0, `migrationsApplied` ends with `0055_restore_ascend_owner`, and `deployment.commit` is the merge commit.
- [ ] Sign in as `ascend`: it opens Team (Player Mode) with the profile, Riot accounts, card and statistics as before; the sidebar has **Switch to Admin Mode**, which opens the Dashboard; **Return to Player Mode** opens Team.
- [ ] Sign-in as `adminascend` is refused with the generic message. Audit Logs shows the migration's entries (`account.role` for both accounts, `account.deactivate` for `adminascend`).
- [ ] After `ascend` has signed in as the Owner (auth-audit `owners[0].lastLoginAt` later than the deploy): the follow-up migration deletes the deactivated `adminascend` account.

## Privacy overhaul (migration 0056, 22 Oct 2026)

Never erase a real member to test this: the erasure itself is tested on synthetic data (`docs/PRIVACY.md`, "Tests").
- [ ] Data jobs → `smoke auth-audit`: every step passes, `migrationsApplied` ends with `0056_privacy_erasures`, `tablesWithoutRowLevelSecurity` is empty, and `deployment.commit` is the merge commit.
- [ ] Signed out, `/privacy` opens:
  - **Contact us about your privacy** shows `@ascend1999` and **Copy** copies `ascend1999`;
  - nothing on the page links to Discord;
  - the permanent-removal and backup paragraphs read as approved;
  - "Updated 22 October 2026";
  - on a phone, held either way, nothing scrolls sideways.
- [ ] `/public` has a **Privacy** link in its footer; Settings links to the notice.
- [ ] Admin Mode → Users & Permissions → **Personal data** opens:
  - "No one has been erased.";
  - **Export records** downloads a file with an empty `records` list.

  Every person's row has **Erase personal data**, except your own and the Owner's. Open one and **Cancel**: the preview lists what would change, and nothing changes.
- [ ] In the browser's developer tools (Application), Local storage holds no `uniiverse.clash-scout.draft.v1` and IndexedDB holds no `keyval-store` (what earlier versions of Clash Scout left). On a browser that had them, both are gone after the first visit.
- [ ] A day later, Data jobs → `integrity` reports `erasures: { records: 0, unusable: 0, people: 0, traces: 0 }`.


## Navigation, data status and Team polish (22 Oct 2026)

- [ ] Data jobs → `smoke perf-probe`: every step passes, and `deployment.commit` is the merge commit.
- [ ] On a phone:
  - the tab bar is Team, Players, Leaderboards, Matches and Profile, and the current tab's icon sits in a pill;
  - Team stays marked on Players, Leaderboards and Matches;
  - ☰ is at the top bar's left end, and the menu slides in from the left.
- [ ] On a computer, collapse the sidebar: the logo is centred above the icons.
- [ ] Your profile Overview has no status banner. Under Season performance's title and its line of scope:
  - **Refresh** (an icon and the word), apart from the filters, and an ⓘ beside it; the ⓘ has a dot unless the data is Up to date;
  - the ⓘ (hover, or tap on a phone) shows the word (Up to date, Syncing, Partial data, Delayed or Needs attention), every part ("Multikills counted in N of M games" while some lack counts) and when the accounts were last read;
  - **Refresh** turns to "Refreshing…" while Riot is read (and, while some games lack multikill counts, while up to 40 of them are fetched);
  - it ends with a notification of what happened (for example "No new games · multikills for 40 more games, 180 to go"), and the button reads Refresh again;
  - a second click within 2 minutes says when to try again, without asking Riot.
- [ ] Multikills are four cards (Double, Triple, Quadra, Pentakills) straight under the season's figures: no heading of their own, every count in the same white as the other figures, no "Partial" mark, and a quiet **By champion** under them.
- [ ] Ranked Progress names each account without a "Primary" badge.
- [ ] Roles & champion pools reads calmly, with no grips, × or role menus. **Edit** shows them, changes save as you go, and **Done** hides them again.
- [ ] Team Overview on a phone:
  - the logo and name are on one row, and the lineup status and **Edit lineup** on the next;
  - a card turned to its substitute shows no flicker of the other side, also when turned back halfway.


## One Refresh on every page (22 Oct 2026)

- [ ] Data jobs → `smoke perf-probe`: every step passes, and `deployment.commit` is the merge commit.
- [ ] On your profile, on a computer and on a phone, open Overview, All Champions, Match History and its Encounters:
  - no status banner on any of them;
  - **Refresh** (an icon and the word) sits under the section's title, at the same place on every tab, with an ⓘ beside it and nothing else (since 2 Nov 2026 at the toolbar's end, after the filters: see "Readability, colour and the toolbar's Refresh");
  - the filters stay on the right (on a phone, under Refresh).
- [ ] Press **Refresh**:
  - it reads "Refreshing…" until the figures are in, and ends with a notification of what happened (new games, no new games, multikill counts fetched, or when to try again), never "Up to date" for the press alone;
  - the figures and the games update in place, with the filters kept;
  - the ⓘ shows "Last checked: just now" and "Refreshed just now: …".
- [ ] Press it again within 2 minutes: "Refreshed … · try again in …", and nothing new is asked of Riot.
- [ ] Press it, then change tab straight away: the next tab shows "Refreshing…", and the result arrives there.
- [ ] A teammate's profile (not as an administrator): the ⓘ alone, no Refresh.
- [ ] Riot accounts: the same Refresh under the panel's title (since 2 Nov 2026 at its right, on its row); the account menu has no "Sync now"; Retry sync (only on a Delayed or Needs attention account) right after a Refresh says the account was checked recently.
- [ ] Team → Leaderboards: an ⓘ under the title with the team's status ("Every member's games, rank and mastery are up to date", or how many member accounts are being read or delayed, without names) and "The boards follow the account syncs"; no Refresh, and no "Updated from the last account sync" line.

## Total kills (22 Oct 2026)

- [ ] Data jobs → `smoke perf-probe`: every step passes, and `deployment.commit` is the merge commit.
- [ ] Your profile Overview: **Total kills** is the first of the kill cards, before Double, Triple, Quadra and Pentakills, in the same white as the other figures, with the kills per game under it.
  - On a phone it runs across the top with the four two by two under it; on a tablet it has a row of its own above the four; on a wide computer screen all five sit in one row. No card's text is cut short.
  - It changes with the season, game mode and Refine (role played, champions, account).
- [ ] All Champions: a **Kills** column after CS/min (on a phone, "N kills" in each champion's line and Kills in Sort by); clicking its heading sorts by it, and together the champions' kills are the Overview's Total kills for the same filters.
- [ ] While some games are still without Riot's full record, the ⓘ says "Kills, KDA, CS, damage and vision from N of M games", and a champion's kills from only some of its games carry a \*.

## Match History without the OP.GG button (23 Oct 2026)

- [ ] Data jobs → `smoke`: every step passes, and `deployment.commit` is the merge commit.
- [ ] Your profile → Match History, on a computer, a tablet and a phone: no "View Match History on OP.GG" button under the game-mode filter and Refine; the games start straight under the header, with no empty row where the button was, and Refresh and the filters sit where they do on Overview and All Champions.
- [ ] Open one of your games: the window still offers "View Match History on OP.GG · <account>" for the account that played it, and other players' names still link to their OP.GG profiles (or to their UNIIVERSE profile for a member).
- [ ] Riot accounts keep their OP.GG links.

## Clash Scout removed (23 Oct 2026)

- [ ] Data jobs → `smoke perf-probe`: every step passes, and `deployment.commit` is the merge commit.
- [ ] Sidebar (expanded and collapsed), the phone and tablet menu, and Admin Mode show no Clash Scout entry and no gap where it was: My Profile, Team, Resources.
- [ ] On a phone the tab bar is Team, Players, Leaderboards, Matches and Profile, filling the bar; a teammate's profile keeps Players marked, and Back in the top bar returns to where it was opened from.
- [ ] Signed in, `/clash`, `/clash/lab` and an old saved scout's address answer "This page does not exist" (no redirect to another page). Signed out, they ask to sign in first, as every members' page does.
- [ ] Admin Mode → Data & Integrations lists no `lab-benchmark` job; `/api/health` lists no retired job.
- [ ] The privacy notice lists "Clash scouts saved before Clash Scout was retired" (seen by nobody in the app, kept until the clean-up), its Clash Scout section says it is retired, and it no longer mentions jsDelivr.
- [ ] Team Overview, profiles (Overview, All Champions, Match History, Riot Accounts), Leaderboards, Matches and Encounters, Resources, the Card Studio and Admin Mode work as before. OP.GG links in the match window, Encounters, Team → Matches and Riot Accounts still open.
- [ ] (For the held clean-up, not this release.) Data jobs → `db-usage`: `retired` lists `clash_scouts` and `clash_scout_accounts` with their rows, and no reads or writes between two runs a day apart.

## Clash Scout's tables dropped (migration 0064)

- [ ] Data jobs → `smoke auth-audit`: every step passes, `deployment.commit` is the merge commit, and the migrations applied end with `0064_retire_clash_scouts`.
- [ ] Data jobs → `db-usage`: `retired` reports `clash_scouts` and `clash_scout_accounts` as gone, and the other retired tables as before.
- [ ] The privacy notice has no Clash scouts entry under "What is stored" and no Clash Scout section; its index has eight entries.
- [ ] Admin Mode → Users & Permissions → Personal data → an erasure's preview (then **Cancel**): no Clash Scout line, and nothing changes.

## Ranks in the match window (migration 0057, 24 Oct 2026)

- [ ] Data jobs → `smoke auth-audit perf-probe`: every step passes, `deployment.commit` is the merge commit, and `auth-audit` lists migrations up to `0057_participant_ranks`.
- [ ] Open one of your recent games: every player in the scoreboard has one small badge under the name: a rank ("Gold 2"), "Unranked", or "—". A player with no stored rank shows a dashed placeholder for a moment while Riot is asked, then fills in.
- [ ] On a computer, hover a rank: it names the queue, the rank with LP and the day it was checked, and says it is their rank then, not at the time of the match. In a Ranked Flex game, a Solo/Duo rank is marked "Solo"; in other games a Flex rank is marked "Flex".
- [ ] The note under the scoreboard says these are current ranks ("Last-known" if any shown is over 3 days old), checked on a day or days, and not the ranks players had in that game.
- [ ] Close and open the same game again, or reload and open it: the same badges, with no "Checking ranks with Riot…" (unless the first check said Riot was busy or did not answer for someone; those are asked again).
- [ ] On a phone (portrait and landscape): the badges fit under the names, the KDA and other columns stay in place, and nothing scrolls sideways.
- [ ] The Match History list itself shows no ranks (unchanged).
- [ ] Data jobs → `data-audit`: `participantRanks` shows the checks per day and the coverage, with no names or ids.

## Sidebar logo centred (26 Oct 2026)

This replaces "On a computer, collapse the sidebar: the logo is centred above the icons" under 22 Oct 2026. That was true of the letter mark only, not of an uploaded logo. PR #141 (Team Overview's header) was reverted in the same release, so Team Overview's layout is the one from before it.

- [ ] Data jobs → `smoke`: every step passes, and `deployment.commit` is the merge commit.
- [ ] On a computer, with the team's uploaded logo, collapse the sidebar: the logo is centred in the rail, on the same line as the icons under it. Before, it sat about 12px to the right.
- [ ] Open the sidebar: the logo stays where it was, over the icons, with the team's name beside it. It does not move while the sidebar opens or collapses, nor when pointing at the collapsed sidebar opens it over the page.
- [ ] The same in a wide window (1920px or more, where everything is drawn larger) and in a 1024px one.
- [ ] Tab to the logo: its focus ring is whole, not cut off at the sidebar's edge.
- [ ] The phone and tablet top bar, the public page's header, the sign-in window and the Team tabs: the logo starts its row, with no gap before it. On the sign-in page the logo and the name are centred together.
- [ ] Team Overview: as before PR #141, except that the header has no empty space under it (4px less on a computer, 10px on a phone).
- [ ] With "reduce motion" turned on, the logo shows its still frame everywhere; otherwise it animates.

## Window close buttons (26 Oct 2026)

- [ ] Data jobs → `smoke`: every step passes, and `deployment.commit` is the merge commit.
- [ ] On a computer and on a phone, open a game from Match History, a player from Team, a champion from a profile, Player Card Studio and the public page's Sign in: the close button (×) is alone in the top-right corner, with clear space around it; no text, link or button sits beside it or just under it.
- [ ] Profile → Match History → Encounters, a player with an OP.GG link: the link is under the player's name and summary, on the left; nothing is next to the ×.
- [ ] In that window open a game: Back is left of the ×, with a thin divider between them. Back returns to the player; Escape then closes the window, and the keyboard focus is on the player's row again.
- [ ] Team → a player: previous and next are left of the ×, past the same divider.
- [ ] On a phone, the × is easy to hit with a thumb (44px), also with the phone held sideways, where it floats over the window as before.
- [ ] Escape closes every window, and focus returns to what opened it. The windows look as before otherwise.

## Match History: opponents' ranks on the cards and OP.GG links (26 Oct 2026)

On the live site, signed in as a member, after the deployment (`smoke` shows its commit):
- [ ] Your profile → Match History on a computer: open a game whose opponents show no rank, wait for the ranks under the scoreboard, close it. Its card now shows a short rank at the end of each opponent's name line ("E2", "GM", "Unr"), in the tier's colour, and the card is no taller.
- [ ] Hover one: the same statement as the match window ("… checked <date>. Their rank then, not at the time of this match").
- [ ] Reload: the ranks are still there. Scroll and change pages: nothing waits on Riot (the list is as fast as before).
- [ ] A Flex game: a rank shown from Solo/Duo carries a small grey "s"; a Solo/Duo game's Flex-only rank an "f".
- [ ] A phone: the ranks sit under the opponents' icons, both teams' icons on one line, nothing overlapping or scrolling sideways.
- [ ] Team members on a card (a computer): a small arrow after their name opens their OP.GG profile in a new tab, and the card does not open the match. The name still opens their profile. On a phone the arrow is not shown.
- [ ] A player with an accented, Thai, Arabic or Persian Riot ID, or a recent rename: their name links to their OP.GG profile under their current name.
- [ ] Data jobs → `data-audit`: `opggLinks` counts the places with and without a link, by reason; `notLinked.no-tag` and `notLinked.server` are the remaining gaps.

## Encounters: opponents, allies and Mixed told apart (26 Oct 2026)

- [ ] Data jobs → `smoke`: every step passes, and `deployment.commit` is the merge commit.
- [ ] A profile → Match History → Encounters, on a computer and on a phone: each row has the player's name, then **Opponent** (red), **Ally** (blue) or **Mixed** (red and blue), then "Against N" and/or "Alongside N", the record and the date last met. The colour bar at the row's left edge matches.
- [ ] Opponents: the "Against" chip comes first with the record right after it; a player who was also an ally shows a quieter "Alongside" chip after it. Allies: the other way round. Everyone: both chips, then the record over all the games.
- [ ] The Opponents, Allies and Everyone choices each have a small colour key (red, blue, split).
- [ ] Open a Mixed player: the window shows the Mixed badge, the records (Against, then Alongside), and the games in two sections, "Against them" and "Alongside them", each with its count. A game opens the match window; Back returns to the player.
- [ ] On a phone, the date last met ends the name's line and the badge, chips and record share the line under it, so no name is cut short. Only on a 375 px phone (iPhone SE or mini) may a Mixed player's "small sample" mark start a third line; from 390 px every row is two lines. Nothing scrolls sideways.

## Pages that update themselves (October 2026)

On the live site, after the deployment (`smoke` shows its commit):
- [ ] Open your profile while an account of yours is due for a refresh (last updated over 15 minutes ago): within a minute or so, new games, rank and "Last updated" appear without pressing Refresh or reloading, the page stays where it was scrolled, and an open game window stays open.
- [ ] Two browsers: in one, open Players; in the other, change something teammates see (a card, a pool, the lineup). Back in the first, switch to its tab: the change shows within a second or two, without a reload.
- [ ] Leave a page open in a hidden tab: the browser's network panel shows no `/api/freshness` requests until the tab is shown again; on screen and idle, the checks become rarer (1, 2, 4, 8, then every 10 minutes).
- [ ] Admin Mode → System Health while a job runs: its result appears when it finishes, without Refresh.
- [ ] Data jobs → `data-audit`: `opggLinks.tagLengths` lists the tags outside 2–5 characters by server, length and kind (counts only); `notLinked.tag-length` equals its total.
- [ ] Data jobs → `data-audit`: `opggLinks.shortTags` says what those tags are, without showing any: `linkedAccountsCheckedByRiot` (a short tag there comes from Riot's account record itself), `recorded` (the same tag in every game, cut off from a longer one, or renamed) and `linkedAccount` (whether Riot's record agrees with the short tag the games recorded).
- [ ] After the 2-character rule (26 Oct 2026): `data-audit` → `opggLinks.notLinked.tag-length` falls from about 2,570 to a handful (tags of 1 or 6+ characters), and `linked` rises by the same number of places. On a Match History scoreboard, a player whose Riot ID has a 2-letter tag is a link, and OP.GG opens that player's profile.
- [ ] Data jobs → `egress` the next day: the day stays under its budget.

## Stored game records: the players' index (migration 0058, 26 Oct 2026)

Nothing on screen changes; the checks confirm the same answers, sooner.
- [ ] Data jobs → `smoke auth-audit perf-probe`: every step passes, `deployment.commit` is the merge commit, and `auth-audit` lists migrations up to `0058_match_details_puuids`.
- [ ] `perf-probe` → `matches.possibleGroups`: the same kind of note as before ("N earlier stored games searched · M possible groups"), and the cold time well under the 1,917 ms of 26 Oct.
- [ ] Open a game in Match History: possible groups, their evidence games and the players' OP.GG links are as before.
- [ ] A day later, Data jobs → `db-usage`: the figures backfill's `UPDATE account_matches … pg_column_size …` and the possible-groups query are no longer among the costliest statements, and `match_details`'s `index_bytes` has grown by a few MB (the new index).

## Ranked Development (migration 0059, October 2026)

Superseded on 29 Oct 2026: Ranked Development was removed (next section). Kept as the record of what was checked while it existed.

Solo Queue Blocks became Ranked Development (`docs/RANKED_DEVELOPMENT.md`). On the live site, after the deployment:
- [ ] Data jobs → `smoke auth-audit perf-probe`: every step passes, `deployment.commit` is the merge commit, `/overview/development` answers 307 to sign-in when signed out, and `auth-audit` lists migrations up to `0059_ranked_development`.
- [ ] My Profile → **Ranked Development** (between Match History and Riot Accounts; not on a teammate's profile): Overview, Sessions and Development as tabs. A player who had a Solo Queue Blocks focus sees it as their current objective (Practising), with its champions; their earlier blocks are listed under Sessions as "Session N" with their games, notes and main mistakes.
- [ ] Old addresses: `/overview/blocks`, `/overview/blocks/history`, a block's own address, `/blocks` and `/ranked` lead to Ranked Development.
- [ ] Before you queue: choose or write an objective (a rank goal such as "Reach Diamond" is pointed out), add an If–Then plan, start a session (no game limit by default; a game limit or "Stop after 2 losses" when chosen; an account when you have several).
- [ ] Play a Solo/Duo game with the page open (or open it afterwards): within a few minutes of the game ending it joins the session by itself, with "Review" and "Skip". The review takes under a minute; Skip leaves no penalty. A game played on another account than the session's stays out.
- [ ] On another device signed in to the same account, the session is there, in progress, with the same games.
- [ ] End the session with a closing note: the summary shows results (LP only when it is known, otherwise why not), champions, plan follow-through from your reviews (labelled self-reported) and suggestions only where reviews support them; then keep, adjust or replace the objective.
- [ ] Development: progress steps move only when you move them (several wins change nothing); the evidence panel says "not enough games" until there are five in each period; a removed synced game does not come back by itself.
- [ ] A teammate cannot open your session's address (not found) and never sees your objectives, plans or reviews.
- [ ] On a phone (portrait and landscape) and a tablet: nothing scrolls sideways; the review and objective windows open as sheets inside the screen; with reduced motion on, nothing pulses.

## Ranked Development removed (29 Oct 2026)

Ranked Development is retired, with Solo Queue Blocks and the Ranked Improvement journal before it (`docs/RANKED_DEVELOPMENT.md`). Items in earlier sections about Solo Queue Blocks, the ranked journal or Ranked Development no longer apply. On the live site, after the deployment:
- [ ] Data jobs → `smoke perf-probe`: every step passes, `deployment.commit` is the merge commit, and `/overview/development`, `/overview/blocks`, `/blocks` and `/ranked` answer a redirect to `/overview`.
- [ ] My Profile shows four sections, Overview, All Champions, Match History and Riot Accounts, evenly spaced under the profile card on a computer, a tablet, a phone (portrait and landscape) and the installed app; a teammate's profile shows the same four.
- [ ] Signed in, the old addresses (`/overview/development/sessions`, `/overview/blocks/history`, a block's own address, `/ranked`) open My Profile → Overview.
- [ ] Match History: a game's window has no "Add to a Ranked Development session" button; Bookmark (your own games) and the OP.GG link are still there; enemy ranks show as before.
- [ ] Overview, All Champions, Ranked progress (rank and LP), Riot Accounts, Team Overview and Leaderboards show the same figures as before the change; a new game still arrives with the next account sync.
- [ ] Privacy notice: the Ranked Development entry says the records are kept, unused, until a planned clean-up, and the date at the top is 29 October 2026.

## Match History 2.0 (29 Oct 2026)

A profile's Match History opens each game under its card (`docs/ARCHITECTURE.md` → Match History 2.0). Items above that open a Match History game "in the window" now open it under its card; Team → Matches, Matchups, Encounters and the champion window still use the window. On the live site, after the deployment:
- [ ] Data jobs → `smoke perf-probe`: every step passes and `deployment.commit` is the merge commit.
- [ ] Your profile → Match History on a computer: above the games, one line about the newest games the filters list (results as small squares, record, KDA, CS/min, KP, a streak from two games, the champions played most; "+N Solo/Duo points, 30 days" when the rank at the window's start is known, "since <date>" when the readings start inside it or several unseen games straddle its start, nothing when the rank did not change or no second reading lies inside the window). Choosing Ranked Flex in the game mode filter changes it to Flex.
- [ ] Cards: the champion's level on its portrait; the other players' ranks (teammates too) where stored, nothing where not; "Best <figure> in N" on a few games at most, and only where its hover text names at least 20 earlier games.
- [ ] Click a card: the game opens under it (the address gains `?match=`), with Scoreboard first; clicking it again closes it; opening another closes the first. Reload with `?match=` in the address: the same game is open. Opening a game adds no history entry, so Back goes to the page before Match History.
- [ ] Scoreboard: ten rows, your row tinted, members marked, the lane opponent marked "Lane" only when one enemy played the same position; ranks fill in after a moment for players with none stored; on a phone each row shows the name, KDA and items without sideways scrolling.
- [ ] Analysis: your shares of the team's kills, damage and gold, your place in the game; the lane at 10:00 and 15:00 (the first time, after the timeline loads) and at the end, or "no single lane opponent"; "Against your usual" with the number of games compared, or the reason there is no comparison (fewer than 10 earlier games of that role and queue group). Nothing is graded.
- [ ] Timeline: the gold difference line around zero, the largest lead and deficit, the end and the changes of lead; hover or the arrow keys read a minute; "Every minute as a table" lists every frame. A game Riot no longer serves says so; nothing invented. Opening Timeline again, or Build, makes no new request (Network tab).
- [ ] Build: the build steps by minute, the skill order and the rune page, as before.
- [ ] Timeline with kills and objectives (migration 0060): Data jobs → `auth-audit` lists migrations up to `0060_match_timeline_events`. Open a recent game's Timeline: ticks for each team's kills (yours along the top), lettered objectives under the curve in your team's blue or the other team's red, your kills (dot) and deaths (cross); "Largest swings" lists up to three moves with the kills and objectives of the same minutes, and its (i) says no cause is given; "Every objective, and your kills, assists and deaths" lists them as a table, matching the scoreboard's dragon and tower counts.
- [ ] An older game (opened before this release): its Timeline loads the kills and objectives the first time (one request in the Network tab), and not again when reopened. A game with a removed player shows objectives and your own kills, but no team kill ticks.
- [ ] A game with a removed (erased) player: the scoreboard shows "Removed player", and the gold difference says it cannot be drawn.
- [ ] Team → Matches, a champion's window (All Champions) and Encounters: a game opens in the window, with the same four sections; Back returns where it should.
- [ ] On a phone (portrait and landscape), a tablet and the installed app: the four sections share the width, nothing scrolls sideways, and with reduced motion on nothing slides or rises.
- [ ] Refine (Match History): Result (All, Wins, Losses), Highlights, Patch (with counts), Team members (with or against each member who shared a game, with counts), Played between and Show the games. Each choice shows as a chip, narrows the summary and the pages, stays in the address (reload keeps it) and rides along a change of season or game mode; the chip or Reset removes it.
- [ ] Team members: "Against <name>" lists only games where that member was on the other side (their name on the card's other team), "With any team member" only games with a member on your side; the counts match the number of games listed.
- [ ] Refine → Show the games → By playing session (a chip shows it): the games fall under headers (date, start and end times, games, W/L, KDA, CS/min, time played) in the same newest-first order; a session cut by the page break says how many of its games are on the page; a game still opens under its card; Every game (or the chip) restores the plain list.
- [ ] On a phone: the Refine fields sit in the opened filter panel without a sideways scroll, and the date fields are usable with the system date picker.
- [ ] Players met in other games: open a few games under their cards. A player met in another game this season (same game mode filter) carries "Met N×" after their name, and its hover text gives the games against and alongside. Teammates with a profile and players without a recorded Riot ID are never marked. Pressing it opens their games in Match History → Encounters with "N games with <player>" (the same N) and those games; Back returns to the game. A game opened in the window (Team → Matches, Encounters) has no marks. On a phone the mark fits beside the name without a sideways scroll.
- [ ] Data jobs → `perf-probe`: the step `profile.matchMeetings` passes, with counts only.

## Match History: one game, one set of figures (29 Oct 2026)

The card, the scoreboard, Analysis and the Timeline describe the same game (`docs/ARCHITECTURE.md` → Match History 2.0 → One game, one set of figures). On the live site, after the deployment:
- [ ] Data jobs → `smoke data-audit`: `matchViews` reports `contradicting` 0; `playersGoldOff`, `playersCsOff`, `playersKillsOff` and `objectivesOff` are 0 or close to it (each one is a stored game to look at, not a figure to hide).
- [ ] Your profile → Match History, open three games, one of them played from the red side: the Analysis team gold, the scoreboard's gold column added up and the Timeline's "At the end" give the same lead or deficit (yours first); your team's kills run along the top of the Timeline, and the kill and objective counts match the scoreboard.
- [ ] Only if `contradicting` is above 0: such a game's Timeline says its timeline and its record disagree and shows no gold line or lane figures; its scoreboard and Analysis are unchanged.

## Match History: ranks around each game (29 Oct 2026)

Ranks are read against the game they are shown for (`docs/ARCHITECTURE.md` → Match History 2.0 → Ranks around each game). On the live site, after the deployment:
- [ ] Data jobs → `smoke data-audit`: `participantRanks.lookupsByDay` stays under 1,000 a day; over the next days `gamesLast30Days.othersNothingStored` falls as the `rank-checks` job reaches the last week's games.
- [ ] Admin Mode → System (or Data jobs → `tick`): the `rank-checks` job runs after `account-sync`, with "N checked … M players in K recent games were waiting" in its summary, and is never "failed" because Riot was busy.
- [ ] After the pacing change (29 Oct 2026): a Data jobs `tick` whose summary has players waiting checks up to 30 in the run, with "W waits for Riot's one-second window" in the line, instead of stopping at about ten.
- [ ] Your profile → Match History: the cards of games from the last week show their players' ranks (tier colour) without anyone opening them; an older game's ranks, read later, are in the caption colour.
- [ ] Open a recent game: the note under the scoreboard says "Ranks around the time of this game."; hover a badge: "checked … after this game", or for a member "the last rank recorded before this game". Open a game from a month ago: badges read later carry a clock, and the note says so. The (i) explains both, by keyboard and by touch.
- [ ] The note under the scoreboard about possible groups is one line with its (i); the groups themselves are unchanged.

## Match History: finishing pass (29 Oct 2026)

On a real phone (and the installed app) and a desktop browser, after the deployment (`docs/ARCHITECTURE.md` → Match History 2.0 → Finishing pass):
- [ ] A profile's Match History, champions and accounts sections open under a compact band (name, role, rank, Customise) and the Overview under the full card; switching tabs changes between them without a jump in the list.
- [ ] The cards keep "… ago" in view on a phone, and a long run of team members folds to the first name and "+N".
- [ ] Open a game on a phone: each scoreboard row is three lines with the items beside the damage; at the end, "Close this game" closes it and the card is back in view.
- [ ] Refine on a phone: Result shows, the other fields open with "More filters" (it says how many are in use), and nothing scrolls sideways.
- [ ] Analysis: "Higher than N of M" (or "Your best in M") beside each figure of "Compared with your usual"; a game without a timeline shows the lane at the end only, with one line saying why; turret takedowns read "N of M" when the team's towers are recorded; your team's bar is blue in the team totals whichever side you played.
- [ ] Timeline on a phone: touch the chart or a lettered objective under it, lift the finger, and the reading stays (the objective named in it); a vertical swipe on the chart still scrolls the page. Open "Every objective…" and "Every minute as a table": each runs with the page (no box scrolling inside it), and each event row carries its mark. On a desktop, hovering reads, leaving clears, and the tables scroll in their boxes.

## Match History: final checks (30 Oct 2026)

On the live site, after the deployment:
- [ ] Data jobs → `smoke data-audit`: `participantRanks.recentChecks` lists the last runs of the rank checks after collection, newest first. `waiting` (players without a rank since their game, before each run) should fall from run to run while runs check their 30, allowing for new games; `lookupsByDay` stays under 1,000.
- [ ] Open a game with your whole team on one side: the note under the scoreboard reads "Possible groups: not enough recorded history to assess." with "<side>: no other players to assess." (or describes an inference only when the other side has a possible group), and never "an inference from 0 earlier recorded games".
- [ ] Timeline on a phone, in a long game: the lettered objectives and your kill and death marks never overlap (a busy minute takes more rows); tap each one and the reading names it, also when the tap lands just beside the mark.
- [ ] Encounters: the (i) "How encounters are counted" says how the highlights are chosen. "Toughest record against" is the first player of Opponents sorted by Worst record with a minimum of 5 (ties: more games against, then the most recent), and appears only when that record is a losing one; "Best record alongside" only with a winning one.
- [ ] **Riot images (manual: the development sandbox cannot reach the live site or Riot's image servers, so they were never seen there).** On a phone and a computer, a profile's Match History shows champion portraits on the cards. Open a game: the scoreboard shows champion portraits, items, summoner spells, runes and rank crests; Build shows the item steps and the rune page. In the browser's Network tab nothing to `ddragon.leagueoflegends.com` (champions, items, spells, runes) or `raw.communitydragon.org` (rank crests, role icons) fails. If one does, its fallback shows instead of a broken image: letters for a champion, an empty grey slot for an item, spell or rune, a dot in the tier's colour for a rank crest.

## Readability, colour and the toolbar's Refresh (2 Nov 2026)

On the live site, after the deployment (the sandbox renders demo data without Riot's images, so these are the checks it could not make):
- [ ] Data jobs → `smoke`: every step passes, `deployment.commit` is the merge commit, and the manifest's `theme_color` is `#0d0e12`. If it still reads `#080c24`, the install saved the old navy as its own colours: Admin → Branding → Reset (or choose the colours there) brings the new ones.
- [ ] Every page on a computer, a tablet and a phone (portrait and landscape) and in the installed app: a neutral charcoal page with panels a visible step lighter, no blue cast behind tables, scoreboards or lists of games; the Team banner and the player cards keep their art and light.
- [ ] Your profile → Overview, All Champions, Match History and its Encounters: Refresh is the last control of the toolbar, after the filters, never on a row of its own, at the same place on every tab; the status beside the line under the title reads "Synced … ago" (or the state in words), with one ⓘ. On a phone, the folded Filters button and Refresh share one row.
- [ ] Press Refresh: the button reads "Refreshing…" and cannot be pressed again; beside the scope line, "Checking Riot…" and then "Updating the page…"; a notification says what happened. A second press within 2 minutes says when to try again, without a request.
- [ ] Match History: each card reads Victory or Defeat in words (with its colour) and the duration, then the queue and when; the KDA stands out; the "With" line names teammates without the accent colour. Open a game: each team's band names the side, its result and its totals; your row has a tint, your name in bold and the one bright damage bar (the bars at the left edge stay for possible groups); the damage bars, gold, CS and vision are readable at arm's length on a phone. Scoreboard, Analysis, Timeline and Build: the selected tab is underlined.
- [ ] Fields, dropdowns, Refine, Refresh and the segmented choices show a visible edge on every page, also in a window; the keyboard focus ring is visible on each.
- [ ] Browser zoom at 200% and the phone's largest text size: nothing overlaps and no page scrolls sideways (wide tables scroll inside their box).

## Premium identity, Overview dashboard and All Champions (2 Nov 2026)

On the live site, after the deployment (the sandbox has no Riot images, so the artwork checks are manual):
- [ ] Data jobs → `smoke web`: every step passes, `deployment.commit` is the merge commit, and the manifest's `theme_color` is `#0a0b12`.
- [ ] Every page: a deep ink ground with a faint violet glow at the top (left of centre) and a blue one at the top right, never behind the middle of the page; panels slightly raised (a faint top sheen and a soft shadow); fields with a visible edge.
- [ ] Your profile → Overview on a computer (1440 × 900 and 1280 × 800): the banner, then Season performance's heading, then one season card (win rate with a blue/red bar, KDA and games large; CS/min, damage/min and vision smaller; the kills and multikills in one row) beside Recent form, with Ranked progress starting under Recent form on the first screen; the pools under the season card. The banner's own colours light the top of the page faintly.
- [ ] The same on a tablet and a phone: one column (season card, Recent form, Ranked progress, pools), nothing squeezed, no empty band in any card, no sideways scroll.
- [ ] Ranked progress on an account with little history (Flex with one reading): a short flat line from that reading, "Not enough readings yet" for the change; with no reading at all, one quiet line instead of the chart.
- [ ] Roles & champion pools: one row per champion under one row of column names (games, win rate, KDA, CS/min or vision), the champion's splash art fading along the row's left behind the name, no "Played a lot" or other Experience words. Edit: drag a row to reorder, the grip with the keyboard, ×, Add, the role menus; Done puts them away; a row opens the champion window.
- [ ] All Champions: no Experience column, badge or sort; the search and the champion count inside the table's card; column names in small capitals, the sorted one with a short blue-to-violet bar; a row lights up when pointed at (a tint, the portrait's ring, a bar at its left) and opens the champion window, which has no Experience line either. On a phone: Sort by and its direction toggle beside the search.
- [ ] Team Overview cards and the player details window still show the Experience label (unchanged).
- [ ] Selected tabs (a profile's sections, Team's sections, a game's Scoreboard/Analysis/Timeline/Build, a champion window's views) show the short blue-to-violet bar.

## Social links: one Show publicly switch (migration 0061, 2 Nov 2026)

On the live site, after the deployment:
- [ ] Data jobs → `smoke auth-audit`: every step passes, `deployment.commit` is the merge commit, `migrationsApplied` ends with `0061_social_links_public`, and `socialLinks.oldShape` is 0 (`switchedOn` is the number of links that were set to the public page before; nothing else is switched on).
- [ ] Settings → Profile on a computer, a phone and the installed app: YouTube, Twitch and Discord each have their name and a Show publicly switch on one line, the field under it, and no dropdown. A link that was shown on the public page is switched on; one that was kept to the team or to yourself is switched off, and shows nowhere until you switch it on.
- [ ] On a phone, tapping the words "Show publicly" turns the switch on and off, as well as tapping the switch; on is the blue track with the knob at the right.
- [ ] Switch a link on and save: it shows on your Team card, your profile, the Players directory and, signed out, the public team page. Switch it off and save: it is gone from all of them.
- [ ] The Player Card Studio → Links and the welcome step (Personalise) show the same switches; the privacy notice says "Only you, until you switch on Show publicly for a link".

## Consistency pass: Encounters, All Champions, the player window, Team Matches and Leaderboards (2 Nov 2026)

On the live site, after the deployment (the sandbox renders demo data without Riot's images; no physical devices were used):
- [ ] Data jobs → `smoke perf-probe`: every step passes and `deployment.commit` is the merge commit. The probe's `profile.encounters` step stays a few kilobytes and about as fast as before (the answer gained three counts and two dates per player shown, nothing else).
- [ ] Your profile → Match History → Encounters: the switch reads Against | Alongside | All, each with its count; Against is chosen when you arrive. Someone you have played both with and against is listed under Against and under Alongside, each with the record for that side, and All shows the two records side by side with their words (no "Mixed").
- [ ] Sort by most games, most recent, best and worst win rate (Against and Alongside); the minimum games and the search (a name or a Riot ID) keep working when you switch between Against, Alongside and All. A win rate from fewer than 5 decided games is grey and says "small sample", and sorts after the established ones.
- [ ] Open a player: their name with OP.GG beside it (only where the Riot ID is known), one summary line, then the Against and Alongside records ("Never met against" where there is none), then the games newest first: date, game mode, your champion, theirs, Against or Alongside, and Victory or Defeat from your side. A game opens the match window, and Back returns to the player. The window is no taller than its content.
- [ ] Old links: `?view=encounters&rel=allies` opens Alongside, `rel=everyone` (or `rel=shared`) opens All, `rel=opponents` opens Against.
- [ ] All Champions on a computer (sidebar open and folded), a tablet and a phone: no heading cut short or wrapped, figures right-aligned, the sorted column marked by its arrow and its figures in the main text weight (no coloured bar), no blue or violet wash over rows. The search finds a champion or a role. On a phone each champion is one compact row: win rate and games at the right, KDA, CS/min, kills, multikills and mastery as labelled pairs under the name.
- [ ] Team → a player's window: as tall as its content on a computer (no empty band), the hero with the name, rank, Full profile, links and position, then this season, then the pool under one row of column names with the first choice marked. Previous and next move between players; on a phone the window fills the screen and scrolls as one.
- [ ] Team → Matches with 2, 3, 4 and 5 members in a game: result, duration, game mode and date first; one line per member (champion, name, role, KDA with its best multikill; CS and damage from tablets up), two columns from four members where there is room, no name cut short; both line-ups with every name, also on a phone; the bookmark icon in the corner turns on and off and the Bookmarked filter shows the game. Pointing at or tabbing to a card shows its state; the card opens the game.
- [ ] Leaderboards: every category and game mode; the scope line says the season, the game mode and the games counted. From a tablet up the podium has the top three and the list continues from fourth; on a phone the leader's card is followed by the list from second (the leader is not listed twice). Equal values share a place ("2="), players under the minimum games are listed as "Not ranked yet", players without the figure as "No games with this figure". Values are in the text colour; gold marks first place only.

## UX consistency: neutral frame, compact All Champions, Team Matches games under their cards (Nov 2026)

On the live site, after the deployment (checked locally on demo data at 1440, 1920, 768 and 375 px; no physical devices were used):
- [ ] Data jobs → `smoke`: every step passes and `deployment.commit` is the merge commit.
- [ ] The sidebar on a computer, open and folded: a near-neutral charcoal, not blue. The current page shows a soft grey lift, a thin blue-to-violet bar at its left edge and a blue icon; other entries lift in grey when pointed at. Ctrl+\ folds and unfolds it, pointing at the folded rail opens it over the page, and tabbing into it opens it too. The phone and tablet top bar, the drawer and the tab bar use the same charcoal.
- [ ] A team with its own page or panel colour (Admin → Branding): the frame follows those colours, not the default charcoal.
- [ ] All Champions on a computer: rows are compact (a small portrait, the name with its role and In pool under it), the figures sit together on the right, and no heading is cut short. Folding the sidebar keeps the same. On a tablet no row wraps onto a third line. A phone still shows one compact row per champion with every figure.
- [ ] Team → Matches: pointing at a card and clicking anywhere but a name or the bookmark opens the game under it, with Scoreboard, Analysis, Timeline and Build, and the address gains `?match=`. A name opens the profile and the bookmark toggles, without opening the game. "Close this game" closes it and returns to the card. Opening another game closes the first.
- [ ] The keyboard: Tab reaches each card once, Enter or Space opens and closes the game, and the focus stays on the card.
- [ ] A copied Team Matches link with `?match=` opens that game under its card. Back and Forward follow the open game.
- [ ] Matchups, Encounters and a Match History link to a game not on the page still open the match window, as before.

## Match History and Encounters: one navigation, All first, a player's games in Match History (3 Nov 2026)

On the live site, after the deployment (checked locally on demo data at 1440, 768 and 390 px; no physical devices were used):
- [ ] Data jobs → `smoke` and `perf-probe`: every step passes and `deployment.commit` is the merge commit.
- [ ] A profile → Match History, on a computer and on a phone: Games and Encounters are two tabs directly under the profile's tabs, where the "Match History" title was; the current one is a lit pill with a blue icon. On a phone they share the width. Switching keeps the season, game mode and account, the page does not jump, and Back and Forward switch back.
- [ ] Games: the line under the tabs reads "N games · Season … · …" with the one ⓘ for how current the data is; no ⓘ stands alone.
- [ ] Encounters opens on **All** (no `rel` in the address): one row per player, the Against games, record and win rate in their own columns, a rule, then the same for Alongside, then when you last met. "never" where a side has no games. Against and Alongside filter the list (each with its count); the ⓘ beside them says how encounters are counted.
- [ ] The highlights sit in one line above the table, like the summary line on Games; each opens that player's games.
- [ ] A player (a row or a highlight): their games open in Match History itself, Encounters still the current tab, with "All encounters", their name (and OP.GG for a real Riot ID, in a new tab), "N games with … · last met …", the Against and Alongside records, and All / Against / Alongside when they were met both ways. The games are ordinary Match History cards; a game opens under its card with Scoreboard, Analysis, Timeline and Build, as on Games. There is no Encounters window any more.
- [ ] "All encounters" returns to the list as it was (the same filter, minimum and search); Back does too. A copied link to a player's games opens the same games and side.
- [ ] A game's scoreboard: "Met N×" opens that player's games with the same N.
- [ ] Admin Mode → Users & Permissions: Accounts, Access levels & groups and Personal data are the same pill tabs.
- [ ] Leaderboards is unchanged (its rules wait for your decision).

## Ranked progress and LP per game (migration 0065, November 2026)

- [ ] After the deploy: Data jobs → `auth-audit` (a migration ran), then `rank-audit`: every account and queue reports its readings, `riotCountCheck.agrees` is true where the season history is complete, and `lp` counts how many games have a figure.
- [ ] Data jobs → `rank-watch` by hand once: `read` equals `due`, no `stoppedBy`, and `requests` about one per due account.
- [ ] Once the five-minute schedule runs (`docs/RANKED_PROGRESS.md`): Admin → Data & Riot shows `rank-watch` succeeding every few minutes; after a member's next ranked game, its Match History card shows `+N LP` or `−N LP`, and the hover text names two readings minutes before and after the game.
- [ ] A member's Overview: Ranked progress is compact (about 270 px on a computer, under 520 px on a phone): rank, LP and record, the change ("Last 30 days" or "Since …"), the highest recorded, a chart that starts at the first reading; History and coverage shows the year's games week by week with the days with readings lit, and Flex is its own ladder.

