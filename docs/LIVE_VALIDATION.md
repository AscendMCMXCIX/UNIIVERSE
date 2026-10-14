# Live validation checklist

**Status (13 Oct 2026, first production run at team-uniiverse.vercel.app):** the database path, accounts, the job endpoint, the GitHub Actions trigger and Data Dragon are verified live. The Riot API and Leaguepedia are not yet: the first tick showed the Riot key being rejected on every request and Leaguepedia refusing the pro query. Both now report their exact cause in Admin → Data & Riot; the Leaguepedia query was corrected (see §4). `statistics: none · 0 games` is the expected consequence of those two failures, not a third problem: `aggregate` ran fine and had nothing to fold in.

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

Verified before deployment, on a real PostgreSQL 16 server in production mode (accounts required, setup key enforced): schema migrations including eight simultaneous cold starts, the owner setup → sign out → sign in flow, a complete draft with its playbook, the match archive, the Settings page and the authenticated job endpoint. The same database tests run on PostgreSQL 16 in CI on every push.

Each item says what to do, what to expect and where to look when it fails.

## 1. Data Dragon (champions, patches, portraits)

- [ ] Admin → Data & Riot → run `version-check`. Expect status *ok* and Data health showing the real current patch (e.g. `15.19`) instead of `0.0 / offline fixture`.
- [ ] Champion portraits render as images (not lettered tiles) on Team and in the Draft Room.
- [ ] Newest champions appear in the grid. If a champion is missing a curated profile the app marks it "New champion: characteristics not yet curated" and still allows it everywhere.
- [ ] Wait for (or simulate) a patch day: `version-check` opens a new statistics period and flags reworked champions under Admin → Competition → Champion reworks.

Failure signs: "Static provider unavailable" in the job log → the host cannot reach Data Dragon (firewall/egress). The app keeps working on the last synced roster.

## 2. Riot API key and ranked ingestion

- [ ] Add `RIOT_API_KEY` and `RIOT_PLATFORMS=all` in the host; redeploy. Admin → System Health → Environment shows the key as *set*; Admin → Data & Riot → Global Data Coverage lists 17 configured servers.
- [ ] Run `ranked-discover` twice and `ranked-ingest` once: the coverage table moves servers from *Pending* to *No data* (players tracked, ids queued) to *Active* (current-patch games), and the job summary's `requestsByHost` shows several hosts.
- [ ] Link a Riot account on My profile: the account shows *Synced* with "Last updated", the server badge carries ✓ when Riot confirmed it, and the RIOT DATA panel lists champions with Very strong / Strong / … labels.
- [ ] Run `ranked-discover`: expect `playersUpserted` > 0 and `matchesQueued` > 0 in the summary, no 401/403. A degraded result quotes the Riot status: 403 means the key was rejected (development keys expire after 24 hours), 401 that no valid key was sent, 404 a wrong platform code. *First production runs: 401 (an expired development key, deleted on Riot's side); with a fresh key: 450 players, 375 matches queued, 0 errors.*
- [x] Run `ranked-ingest` twice: the first run stores matches, the second stores only new ones (duplicates are impossible by primary key). *199 then 171 matches stored, queue drained, 0 failures.*
- [x] Run `aggregate`: Admin → Data & Riot lists `ranked` as a source with the game count. *370 games.*
- [ ] After changing `RIOT_API_KEY`: the next `ranked-discover` reports `playersPruned`/`playersDropped` and then scans normally; linked accounts show "resolved again on the next sync" once and recover.
- [ ] 429 handling: temporarily lower `RIOT_RATE_LIMITS` to `2:1,10:120`, run `ranked-ingest`, confirm the job slows down rather than failing with 429 errors.

Failure signs: 401 → the value stored as `RIOT_API_KEY` is not a key Riot recognises (wrong value, placeholder, extra characters); 403 on every endpoint → the key expired (development keys last 24 h) or was revoked; 403 on `/riot/account/v1/…` only, while `riot-check` says *accepted* → the request went to a routing value that does not serve ACCOUNT-V1 (the `sea` host did until 575a4f6; account lookups now use `asia`); 404 on `by-puuid` endpoints → wrong regional routing (check `RIOT_PLATFORMS` values like `euw1`, `kr`, `na1`, `oc1`).

- [x] `riot-check` (Admin → Data & Riot → Riot credential → **Check key now**, or the data-jobs workflow with `job=riot-check`) answers with the key's state and the HTTP status without exposing the key. *2026-10-13: `accepted`, status 200 on oc1, key fingerprint `…18eb`.*
- [x] The **Production smoke** workflow (Actions → Production smoke → Run) prints the live build from `/api/health`, 200 for `/login`, 307 → `/login?next=…` for every private page (including `/overview/blocks`) and 401 for the job endpoint without the secret.

## 3. Linked Riot accounts and proficiency

- [ ] Players → a player → Riot accounts: add your own Riot ID (exact spelling, including the tag). Expect the PUUID to resolve and the status to become *synced*; a renamed account should keep the same PUUID and adopt Riot's canonical spelling.
- [ ] Add the same Riot ID again (or an alt that resolves to a linked PUUID): expect a clear "already linked" message, never a duplicate.
- [ ] After `account-sync` (Admin → Data & Riot) the Team page shows tier dots on pool champions and the Draft Room says e.g. "core comfort pick (68 games on record)".
- [ ] Unicode Riot ID (Korean/Japanese name): it must be sent and shown exactly as typed.
- [ ] Unlink an account: its history disappears from the proficiency view.

## 4. Professional data (pick order)

- [ ] Set `LEAGUEPEDIA_USERNAME` / `LEAGUEPEDIA_PASSWORD` (bot password, DEPLOYMENT.md §2b) and redeploy. Without them `pro-sync` reports the rate limit and says what to configure. *First production run: anonymous, refused.*
- [ ] With `PRO_DATA_PROVIDER=leaguepedia`, run `pro-sync`. Expect the log line "logged in to Leaguepedia as …", `fetched` > 0 and `inserted` > 0 with `pickOrder` > 0 (Leaguepedia `Team1Picks`/`Team2Picks`). If Cargo refuses the query the job quotes Cargo's message ("Leaguepedia rejected the query: …") and keeps old data; if the Tournaments join is what it refuses, the adapter retries without it and the league column stays blank. *First production run: refused, because the query named a `League` column `ScoreboardGames` does not have; corrected.*
- [ ] Run `aggregate`; the Pre-draft page of a tournament draft shows **PRO DRAFT PATTERNS** with B1 priorities, R1/R2 pairs, R5 counterpicks and second-ban targets.
- [ ] Alternative: `PRO_DATA_PROVIDER=oracleselixir` with `PRO_DATA_CSV_URL` pointing at the current-season CSV; the `pick` column supplies the order.

## 5. Database and deployment

- [ ] Supabase: first start creates all tables (`drizzle/*.sql` run by the embedded migrator, under a transaction-scoped advisory lock that is safe behind the transaction pooler). Check the Supabase table editor for `drafts`, `matches`, `riot_accounts`, `pro_pick_slot_stats` and `uniiverse_migrations` (two rows).
- [ ] Production auth: with `DATABASE_URL`, `UNIIVERSE_AUTH_SECRET` and `UNIIVERSE_ACCESS_PASSWORD` set, the first visit shows the setup page; create the owner with the setup key. Afterwards `/login` is required for every page.
- [x] The GitHub Actions workflow (`APP_URL` + `CRON_SECRET`) calls `/api/jobs/tick` and prints the response; Data health shows success times for every job. *Verified on run #54.*
- [ ] Supabase `pg_cron` schedule in place (DEPLOYMENT.md §4c) so the tick runs every ten minutes; `select * from cron.job_run_details order by start_time desc limit 5;` shows recent runs.
- [ ] `/api/health` returns 200 with `deployment.commit` (the deployed commit), the patch, warnings and the job summary.

## 6. Team platform flows (two browsers)

- [ ] Accounts are created by an admin (Admin → Players & Accounts → Add Player Account, see §10). Old invitation links explain that an admin creates accounts.
- [ ] The original owner sees "Complete your player profile" once; after entering a Riot ID and role the banner disappears and the profile exists exactly once.
- [ ] Open the same draft in both windows: actions entered in one appear in the other within ~1 s; "Take control" / "Hand off" change who can act; the other window's inputs are disabled while someone else controls. Reload mid-draft: the state is restored.
- [ ] Clash mode: create a draft, optionally type the enemy players' names on the pre-draft page, draft blind; the names appear on the match record.
- [ ] Scrim as a best of 3: start game 1 on blue, record a win, press Next game, start game 2 on red (optionally with a substitute in the lineup), record a win: the series shows "wins 2-0" under Matches and offers no game 3.

## 7. Match archive

- [ ] Finish a real (non-theorycraft) draft: the Match Playbook appears and a record shows up under Matches. Record a result and notes; confirm Draft Room recommendations are unchanged afterwards.
- [ ] Link a Riot match ID with a configured key: result and duration are fetched; without a key the page says the ID was stored only.

## 8. Ranked Improvement journal (two browsers)

- [ ] Signed in as player A: Solo Queue Blocks (Overview → Solo Queue Blocks) → add a game (champion, enemy laner, result, main mistake, notes) → it appears in BLOCK 001 with "1 of 6 games"; the dashboard counts it.
- [ ] Add five more: the sixth completes the block ("BLOCK 001 complete at 6 games"); **Start next block** opens BLOCK 002; **Finish block** closes a shorter block at its real size.
- [ ] Signed in as player B: Solo Queue Blocks shows B's own empty journal; opening A's block URL (`/overview/blocks/<id>`) answers "not found"; tagging B as the teammate on A's game changes nothing for B.
- [ ] With a synced Riot account: **Add recent ranked game** lists recent Solo/Duo games; importing one fills champion, opponent, result and date and marks it *Synced*; the same game cannot be imported twice.
- [ ] Phone (375 px): the page has no horizontal scroll, **Solo Queue Blocks** is the fifth tab, every button is at least 44 px tall.

## 9. Things to watch over the first weeks

- Admin → Data & Riot warns when a pipeline has not succeeded for too long; take warnings seriously, they are the only alarm.
- After each patch, confirm the patch number changes within an hour and that statistics start a new period while older evidence fades (Trends shows "vs previous patch").
- If Leaguepedia or Riot change response shapes, the jobs degrade gracefully and say so; the app keeps running on existing data.

## 9. Roles, Players, Overview, Admin Mode and the Draft Room

- [ ] Owner signs in and lands in the **Player View** (Team, Draft, Players, Matches, Overview, Trends, Settings; no admin links). The sidebar (phone: the drawer) offers **Switch to Admin**; Admin Mode shows ADMIN MODE and Users & Permissions, Players & Accounts, Competition, Data & Riot, Branding, System Health; **Back to Player View** returns.
- [ ] Account creation and first sign-in: see §10.
- [ ] Signed in as that player: Players lists Main and Other players; another player's profile opens read-only (roles, pools, Riot accounts, overview) with no Edit button; `/players/<their id>/edit` redirects back to the profile; `/admin/players` redirects to Team; the own profile shows **Edit my profile** and pools can be changed there.
- [ ] Team shows the five roles with the assigned Main player and labelled champion context (Recent games, Win rate, Proficiency); a player sees no Change/Assign control; an admin does, and Other players appear only after ticking "Show substitutes".
- [ ] My Overview: rank, season record, one card per pool champion (portrait, games, W/L, win rate, combined mastery, proficiency, last played); the **Season** and **Game mode** dropdowns (All supported games, Ranked Solo/Duo, Ranked Flex, Normal games) change the URL and the figures; the season shows *Partial* until every account is read back to the season start; "Show other champions played" is optional; Solo Queue Blocks opens from the panel at the bottom.
- [ ] Draft Room on a desktop: BLUE column left, champion grid with search and **Pool only** in the centre, RED column right, RECOMMENDED / ALTERNATIVES below, deeper panels collapsed. As a player the room shows "Watching live": the grid and the Lock/Ban buttons are inert and a direct action is refused by the server; in a draft they created, picks and bans work.

## 10. Phase 1: accounts, password sign-in, permissions

- [ ] Owner signs in with username + password as before; owner profile, Riot account and pools unchanged.
- [ ] Admin → Players & Accounts → Add Player Account: a typo'd Riot ID shows *Account not found*; with a valid one *Account verified* appears and **Create account** turns on; creating shows a temporary password once (xxxxx-xxxxx-xxxx).
- [ ] In a private window: username + temporary password opens WELCOME TO UNIIVERSE at *Choose your password*; mismatched or weak passwords are refused; /team redirects back to /welcome until setup is finished; signing out mid-setup and signing in with the new password resumes setup; Finish setup opens Team.
- [ ] The temporary password no longer works once the permanent one is set. Users & Permissions → Reset password → the new temporary password signs in and asks for a new permanent password; the old password does not work.
- [ ] Deactivate the player: their open window is signed out on the next page load; Reactivate restores access with their existing password. The last admin cannot be deactivated, deleted or demoted.
- [ ] A player creates a draft and can pick/ban/undo in it; another player sees "Watching live" with inert controls; an admin can act in any draft.


## 11. Phase 2: Riot data, draft intelligence, match management

- [ ] GitHub → Actions → Data jobs → `data-audit`: every linked account shows Synced or Synchronising with season games per queue; ranked matches are on 16.x patches; pro games on 16.x patches.
- [ ] GitHub → Actions → Data jobs → `engine-probe`: lineup players have proficiency rows and the report states whether player data changed the projected team.
- [ ] New draft: Ranked 5s and Ranked Flex are separate options; enemy players are an optional list (Add player), no roles.
- [ ] Ban a player's whole pool for a role: EMERGENCY PICKS — Outside Configured Pool shows about three champions; locking one does not change the profile.
- [ ] Complete a draft: the Quick Playbook fits the screen; Detailed analysis opens separately; on a phone the Essentials tab comes first.
- [ ] Match History: the creator (or an admin) edits the mode/result and deletes a record after confirming; the record disappears and a series score updates.
- [ ] Admin → Data & Riot: the "At a glance" panel answers the five questions in plain words.

## 12. Phase 3: interface, permissions, accounts, draft, admin and branding

- [ ] Sidebar stays put while a long page scrolls; on a phone the bottom tabs and the drawer work; a player without a capability does not see its page and gets "No access" if they open its address.
- [ ] Settings: change your username (sign-in works with the new one, case-insensitive); change your password (the checklist turns green; a password without a number or symbol is refused next to the field); add, crop and remove a profile picture.
- [ ] Settings → Riot accounts: Change Riot ID to the same account's new name renames it; a different account asks before replacing; another player's account is refused.
- [ ] A player profile: add, remove and drag champions (mouse and phone); "Saved" appears; reload keeps the order; editing the same profile in two tabs warns instead of overwriting.
- [ ] Team: five player cards with pictures and season figures; Edit opens the pool editor; no saved/recent lineups.
- [ ] Draft: mode cards, the lineup with pictures, optional enemy Riot IDs, Start; no Draft History. In the room at 1366×768: Blue left, grid centre, Red right, recommendation above the grid, no page scroll needed to pick or ban; no enemy-player editor in the room.
- [ ] Complete a draft: the final board and the Quick Playbook are readable without zooming.
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
- [ ] Change your password to one without a capital letter: refused with "Include at least one capital letter."; an existing password still signs in.
- [ ] Trends: Highest presence, Most picked, Most banned, Strong performing, By role; Rising and Falling only once the previous patch has 500+ games (otherwise a note says why); pool alerts name champions properly.
- [ ] Admin → Branding: upload a GIF between 5 and 20 MB: the button shows upload progress, the logo animates afterwards, and a note mentions first-visit load time.
- [ ] Actions → Data jobs → Run workflow with `data-sufficiency`: the report's held-out accuracy and evidence medians are the numbers to compare with docs/DATA_AUDIT.md as data grows.

## 14. Phase 5: profiles, statistics, pools, Fearless

- [ ] Team: no "What the lineup brings" strip; each card has 2–3 strength tags (or a plain "<Role> Main" while data is thin), equal heights, the chosen featured champion's art behind the header, and "+N more" when the pool is longer than three.
- [ ] My Profile (sidebar): the same layout as a teammate's profile; your own card is not in the Players list; a teammate's profile is read-only unless you are an admin.
- [ ] My Profile → Team card style: pick a featured champion and an accent; the Team page shows them after a reload.
- [ ] Profile statistics: win rate, games and KDA lead; CS, damage and vision show "per game" with how many games had details; switching season or mode updates every figure; a champion card shows its own KDA and the proficiency badge with an info (i) explanation.
- [ ] Champion pools: add a third role (Add another role), give it champions, reorder roles; add more than six champions to a pool (no limit message); drag to reorder still works.
- [ ] Draft with a player whose main pool is banned out: the recommendation uses their secondary or additional role and says so; emergency picks only appear when no pool champion is left.
- [ ] Solo Queue Blocks: Add game shows recent Riot games; one tap adds one (with optional mistakes and a note); only you can see your blocks.
- [ ] Sidebar: collapse it (icons only, names on hover), reload: it stays collapsed; expand again.
- [ ] Draft page: an unfinished draft lists Resume / Abandon / Delete for its creator or an admin; each asks first; completed matches and series stay.
- [ ] New Bo3 series with Draft rules = Fearless: game 2 greys out every champion picked in game 1 for both teams (badge "Fearless"), bans from game 1 are available again; correcting game 1's picks changes game 2's locks.
- [ ] New draft: five enemy-player fields (all optional); between series games the enemy roster can be changed and earlier games keep their own list.

## 15. Phase 6: navigation, player identity, statistics, Riot accounts, access groups

- [ ] Sidebar: Team (Overview, Draft, Matches) collapses and stays collapsed after a reload; Players, Trends, Solo Queue Blocks and My Profile are top level; the collapse button sits next to the logo.
- [ ] Account menu (your name at the bottom of the sidebar, your picture on phones): My Profile, Riot Accounts, Settings, Switch to Admin (owners), Sign out; it opens fully on a short laptop screen.
- [ ] No "NEW" badge anywhere in the champion selector or on Team.
- [ ] Team: every card shows the whole pool for its role (scrolls inside when long), 2–3 tags that differ between teammates, and **Customise** on your own card only.
- [ ] Customise: choose a champion and one of its skins (skins appear after the daily static sync has run once on this version); the Team card, Players card and profile header all show it after saving.
- [ ] My Profile → Overview: the label reads "All champions · all roles · all accounts · Season 2026 · All supported games" by default; choosing a role, a champion or one account changes every figure and the label; "Everything" resets.
- [ ] Add the same champion to two role pools: both pools keep it; its card on Champions & Roles shows separate games for each role.
- [ ] Riot Accounts tab with two accounts: one Main, one Alt; "Make Main account" on the Alt swaps them and the profile's Riot ID changes; the three-dot menu is never cut off, also on a phone.
- [ ] Trends: ten rows per list, no "Show more"; the professional list says pick + ban.
- [ ] Admin → Branding: Sign-in background and App background are separate; changing one leaves the other.
- [ ] Admin → People & Access: open **Access** for a Standard Player, add **Team Lineup Manager**, save; that player can now change the lineup on Team and nothing else changes. Remove it again; the lineup dropdown disappears for them and the server refuses a change.
- [ ] Admin → Riot Data shows "Champion updates (reworks)"; Draft Settings no longer does.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0020 applied; the Owner still signs in.


## 16. Phase 7: workflow, layout and quality of life

- [ ] Team: each card shows three champions of the role's pool and "+N more" (hover it for the count); cards line up; **Edit lineup** next to the heading turns on the Change/Assign buttons, **Done** turns them off; your own card has a small brush (Personalise).
- [ ] Sidebar collapsed: pointing at it opens it over the page, moving away folds it; with its account menu open it stays open; after a reload it is still collapsed.
- [ ] Draft: Start draft → Opponent scouting (five optional fields; a known Riot ID shows Checking account → Verified / Scouting ready / Limited data; an unknown one says Unable to verify) → Continue → choose Blue or Red → Begin pick/ban. Before the first ban the side can be switched from the header; afterwards the button is gone.
- [ ] Draft room: no enemy name fields. A Bo3 second game opens with the first game's enemy roster.
- [ ] Trends: Overall and Top / Jungle / Mid / Bot / Support tabs and a Presence / Pick / Ban / Win switch; at most ten rows, each champion once; fewer than ten rows explain why; the page fits a laptop screen.
- [ ] My Profile: Overview, Champions & Roles, Solo Queue Blocks, Riot Accounts (a section picker on a phone); a teammate's profile has no Solo Queue Blocks. Overview shows CS/min and damage/min; no "Show other champions played".
- [ ] Champions & Roles: no secondary role preselected; "+ Add secondary role" adds one, its bin icon removes it. Drag a champion card: it follows the pointer and the others slide; after a reload the order is kept. Keyboard: focus a grip, Space, arrows, Space.
- [ ] Solo Queue Blocks: starting a block asks how many games (nothing filled in); finishing early shows "Completed early (x of y)" in Block history; a game played with a teammate who has a linked account shows "Played with <name> · same team" and the × removes it.
- [ ] Admin creates a new account: the player's setup page shows Primary role "Not selected"; until setup is finished the player is missing from Players (admins see "Setup pending"), Team lineup choices and draft setup.
- [ ] My Profile → **Match History** (between Solo Queue Blocks and Riot Accounts): newest game first, one compact row each (Win/Loss written out, queue, time, champion, K/D/A, CS/min, damage/min, vision, kill participation, items); numbered pages, no endless scrolling; filters for mode, role, champion and (with two or more linked accounts) account. Clicking a row opens the game over the page (both teams, objectives, bans); Escape or × returns to the same page and row. A Ranked Solo/Duo game offers **Add to Solo Queue Block** once.
- [ ] My Profile: the camera badge on your own picture adds, changes or removes it; the new picture shows in the sidebar, on Team and on Players. A teammate's profile has no camera badge.
- [ ] Personalise → skin list: no chromas, no repeated or broken pictures, default first, a search box for long lists. GitHub Actions → Data jobs → `skin-audit`: `cards.on_chroma` and `cards.on_missing_art` are 0 once the static sync has run; `cleanup.splash_unchecked` falls by up to 300 per static sync.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0026 applied; the Owner still signs in.

## 17. Phase 8: player identity, navigation and UX refinement

Items in earlier sections that describe "+N more" on Team cards, blocks of six games that close
themselves, the account menu holding Riot Accounts and the Admin switch, or the old proficiency
labels are superseded by this section.

- [ ] Sidebar: the Team section lists Overview, Players, Draft, Matches; then Meta & Trends and My Profile. Collapsed, pointing at it opens it smoothly (no text jumping, icons stay put) and moving away folds it; the toggle at its foot keeps it open. With reduced motion turned on in the operating system it opens without animating.
- [ ] Account menu (your name at the foot of the sidebar): only Settings and Sign out. "Switch to Admin" is in the sidebar for those who may use it.
- [ ] My Profile: one section dropdown (Overview, Champions & Roles, Solo Queue Blocks, Match History, Riot Accounts) with a tick on the current section; Back and Forward move between sections; the season and mode chosen on Overview are kept when moving to Match History.
- [ ] Team: every card shows the whole pool for the role held in the lineup (count in "Mid pool · 6"), no "+N more" and no scrolling inside a card; cards in a row are the same height; tags describe the role held (move a player to another role with Edit lineup: their tags and statistics follow the new role).
- [ ] Champions & Roles: each role's pool is edited in place (× to remove, drag or arrow keys to reorder, **Add** opens a search right under the pool); "Saved" appears after each change; the role menu switches, moves or removes a role.
- [ ] Any champion picker outside the draft room starts with a search box and your pool / recently used champions; "Browse all" shows the whole list. The draft room still shows every legal champion.
- [ ] Overview filters: Season and Game mode up front; Refine opens Role played, Champions and (with two or more linked accounts) Linked account; active refinements show as chips with ×; "Everything" resets.
- [ ] Proficiency labels read Main / Comfortable / Familiar / Few games / Out of practice / Not played, with evidence bars beside them. Actions → Data jobs → `proficiency-audit` reports old against new tiers (players anonymised).
- [ ] Solo Queue Blocks: start a block with a target of 3, 12 or 25 games, or "No target". At the target the block stays open ("Target reached" with Finish block and "+3 more"); further games count past the target. The target can be raised, lowered or cleared at any time; Finish block works at any count. Long blocks list games five at a time.
- [ ] Match History: the record and averages of every matching game under the title; the same filters as Overview (Refine includes "Configured pools"); on wide screens each row shows both lineups with you outlined; compact page numbers with "Games 1–7 of 36". Opening a game shows your figures with Scoreboard and Comparison tabs; Comparison shows your share of the team's damage, gold and kills, you beside your lane opponent and team average, and team totals. Nothing is graded.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0026 applied (this phase added none); the Owner still signs in.

## 18. Phase 9: UX, navigation and player experience

Items in earlier sections about strength tags, the Champions & Roles tab, blocks that need a target
before starting, or Trends with a PRO tab are superseded by this section.

- [ ] Sidebar: Team (Team Overview, Players, Draft, Matches), Meta & Trends (Solo Queue Meta, Pro Play) and My Profile (Overview, All Champions, Solo Queue Blocks, Match History, Riot Accounts) open and close smoothly; a closed group stays closed after a reload. The account menu has only Settings and Sign out.
- [ ] My Profile: the section bar under the profile card matches the sidebar; on a phone it is a compact menu; Back and Forward move between sections; the season and mode stay when switching section.
- [ ] Overview: season performance, then your Primary Role pool and Off Roles pools, one card per champion with statistics and proficiency. Add a champion from the "Add champion" cell, drag or use the keyboard to reorder, × to remove; "Saved" appears each time.
- [ ] All Champions: every champion you played, searchable and sortable; the Account filter appears only with two or more linked accounts.
- [ ] Team: no tags; each card lists every pool champion for the lineup role with games, win rate, proficiency and mastery.
- [ ] Pro Play shows professional draft patterns straight away and never mixes with Solo Queue data.
- [ ] Solo Queue Blocks: "Start block" shows 0 / 1; logging a game with no block running starts one; the block grows past 6, 12 and 18 games; a target is optional and can be set or cleared; Finish block works at any count; the Ranked Focus card keeps a featured champion and your focus, and a finished block keeps the focus it was played with.
- [ ] Match History: on wide screens each row shows both teams with player names (hover for the full Riot ID). Open a game → Build: the first time, the build and skill order load from Riot (one request) and appear minute by minute; a game Riot no longer serves says so. Older games show the keystone and secondary path; games stored from now on show the full rune page.
- [ ] Tooltips (ⓘ): open on hover and close on leaving (desktop); open on tap and close on a tap elsewhere (phone); never cut off at the edge of a card or the screen.
- [ ] GitHub Actions → Data jobs → `auth-audit`: migrations up to 0028 applied; the Owner still signs in.
