# Live validation checklist

> **Meta & Trends was removed on 19 Oct 2026** (Solo Queue Meta, Duo Synergies, Pro Play and the global ranked, professional and aggregation jobs behind them). The first-run record below keeps those jobs as they ran then; the checks for them were removed from the list, and §21 checks that the feature is gone.

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

Also observed: GitHub ran the `*/10` schedule only four to five times a day, so the workflow now runs every three hours and the ten-minute cadence is left to Supabase `pg_cron` (DEPLOYMENT.md §4). Earlier scheduled runs had no `APP_URL`/`CRON_SECRET` secrets and skipped; those were set before run #54.

Verified before deployment, on a real PostgreSQL 16 server in production mode (accounts required, setup key enforced): schema migrations including eight simultaneous cold starts, the owner setup → sign out → sign in flow, the Settings page and the authenticated job endpoint. The same database tests run on PostgreSQL 16 in CI on every push.

Each item says what to do, what to expect and where to look when it fails.

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
- [x] The **Production smoke** workflow (Actions → Production smoke → Run) prints the live build from `/api/health`, 200 for `/login`, 307 → `/login?next=…` for every private page (including `/overview/blocks`) and 401 for the job endpoint without the secret.

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
- [ ] Admin → Branding: upload a small animated GIF logo (the sidebar animates; the browser tab shows a still icon; with "reduce motion" turned on in the OS the sidebar shows the still frame); try a light background colour (Save stays disabled with a contrast message); Reset to defaults.
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
- [ ] My Profile: Overview, Champions & Roles, Solo Queue Blocks, Riot Accounts (a section picker on a phone); a teammate's profile has no Solo Queue Blocks. Overview shows CS/min and damage/min; no "Show other champions played".
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
logo and backdrop images are superseded by this section.

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

## Clash Scout (October 2026)

- [ ] Team → **Clash Scout**: paste a real ranked scouting screenshot (Ctrl+V). The first time, "Loading text recognition" shows while Tesseract downloads (a few MB from jsDelivr). Five cards fill; compare every name, rank and figure with the screenshot. Unsure names show **Check name** with a crop.
- [ ] Paste the mastery screenshot: the same five cards gain mastery, nothing else changes, and the upload area folds into a bar.
- [ ] Reload: the draft is still there. Another member's `/clash` does not show it (it is not saved).
- [ ] Open a player, type the full Riot ID from OP.GG, **Check with Riot**: **Verified**, and **Open OP.GG profile** opens the right profile in a new tab. An unverified player has no profile link.
- [ ] **Save scout**: it opens at its own address and appears in Saved scouts for a teammate; search finds it by opponent and by a player's name.
- [ ] As a member, someone else's scout is read-only; a lineup manager can archive and restore; only the Owner sees **Delete**.
- [ ] Signed out, `/clash` asks to sign in, and `/public` has no Clash Scout link.

## Public page (October 2026)

- [ ] Signed out (a private window): `/` is the public page itself (the address stays `/`): the welcome, Meet the Team, Our Community, Playing With Us and the footer with Riot's notice. Meet the Team shows the five lineup cards with each player's display name and picture, no username, Riot ID, rank or statistic, and no lineup controls. There is no banner.
- [ ] **Sign In** opens a small window over the page with the username field focused; Escape closes it. A wrong password says so in the window; a correct one goes to the account's start page (a temporary password to choosing a permanent one). `/login` still works on its own and links back.
- [ ] Admin → Branding → Public page: a link that is not a Discord invitation is refused; an invitation shows **Join Our Community**; switching **Open to new players** off changes Playing With Us; the sign-off shows in the footer. Without an invitation the page has no Discord link.
- [ ] Signing out of the last account lands on the public page.
- [ ] A role with a designated substitute shows the turn icon; it turns the card over to the substitute and back. Nothing is saved.
- [ ] Opening a card shows the champion pool, with no link to a profile. Every link on the page opens without asking to sign in, except **Sign In** itself.
- [ ] Signed in: `/` opens the app's start page, never the public page; `/public` looks the same as for visitors, with **Open App** instead of **Sign In**. Settings has no Public profile panel, and Admin has no Public Access entry.
- [ ] A lineup change shows on the public page within a minute.

## 21. Meta & Trends removed (19 Oct 2026)

- [ ] Sidebar (Player View and Admin Mode), the collapsed rail, the phone tab bar (Profile, Team, Matches) and the phone drawer show no Meta & Trends, Solo Queue Meta, Duo Synergies or Pro Play entry, and no gap where one was.
- [ ] `/trends`, `/trends/solo`, `/trends/duos` and `/trends/pro` answer *not found* for members and send visitors to sign in.
- [ ] Admin → Riot Data lists the remaining jobs only (no `ranked-discover`, `ranked-ingest`, `aggregate` or `pro-sync`), shows no Global Data Coverage and no Champion reworks panel, and its status cards cover Riot, player accounts and anything that needs you.
- [ ] Admin → System Health → Environment lists no `PRO_DATA_PROVIDER` or `LEAGUEPEDIA_*`; Diagnostics shows no ingestion backlog; `/api/health` lists no retired job.
- [ ] Team Overview, profiles, Leaderboards, Match History (including other players' ranks), Matchups, Played Together and Encounters show the same figures as before.
- [ ] GitHub Actions → Data jobs → `smoke perf-probe`: every step passes and no step names a retired job.
