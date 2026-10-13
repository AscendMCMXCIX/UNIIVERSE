# Live validation checklist

**Status (13 Oct 2026, first production run at team-uniiverse.vercel.app):** the database path, accounts, the job endpoint, the GitHub Actions trigger and Data Dragon are verified live. The Riot API and Leaguepedia are not yet: the first tick showed the Riot key being rejected on every request and Leaguepedia refusing the pro query. Both now report their exact cause in Settings → Data jobs and Data health; the Leaguepedia query was corrected (see §4). `statistics: none · 0 games` is the expected consequence of those two failures, not a third problem: `aggregate` ran fine and had nothing to fold in.

What the first tick (GitHub Actions run #54) proved:

| Pipeline | Result | Meaning |
| --- | --- | --- |
| `version-check` | ok, patch 16.20 / Data Dragon 16.20.1, not a fixture | Data Dragon reachable, champion roster synced |
| `ranked-discover` | degraded: 3 requests, 3 errors, 0 players | every Riot request failed. The second run showed the status: **401 on `oc1`** for all three league lists, which Riot returns when the request carries no valid key (an expired key gives 403), so the `RIOT_API_KEY` value the deployment carries is not a key Riot knows (a replaced value only applies after a redeploy, and must be set for the Production environment). The job message and Settings → Environment now show the last four characters of the key in use, to compare with the developer portal, and flag a value that does not have Riot's `RGAPI-…` shape |
| `ranked-ingest` | ok, nothing queued | waiting on discovery |
| `pro-sync` | degraded: Leaguepedia refused the query | on the second run the message read "You've exceeded your rate limit": Leaguepedia refuses anonymous API clients from cloud addresses, so the adapter now logs in with a bot password (DEPLOYMENT.md §2b). The query also asked `ScoreboardGames` for a `League` column it does not have; fixed by joining `Tournaments` |
| `aggregate` | ok, 0 ranked matches, 0 pro games | correct given the above |
| `account-sync`, `integrity` | ok | nothing linked yet |

Verified later the same day with a working key (Oceania, `oc1`): discovery tracked 450 Challenger/Grandmaster/Master players and queued 375 matches; two ingestion runs stored 370 of them (5 remakes skipped, 0 failures) within the four-minute budget; aggregation folded them into statistics. Switching from the development key to the personal key showed that **Riot encrypts player ids per API key**: every stored player id answered 400 under the new key while match ids kept working. Discovery now prunes ids the current key cannot read and re-discovers players from the league lists; linked accounts re-resolve from their Riot ID.

Also observed: GitHub ran the `*/10` schedule only four to five times a day, so the workflow now runs every three hours and the ten-minute cadence is left to Supabase `pg_cron` (DEPLOYMENT.md §4). Earlier scheduled runs had no `APP_URL`/`CRON_SECRET` secrets and skipped; those were set before run #54.

Verified before deployment, on a real PostgreSQL 16 server in production mode (accounts required, setup key enforced): schema migrations including eight simultaneous cold starts, the owner setup → sign out → sign in flow, a complete draft with its playbook, the match archive, the Settings page and the authenticated job endpoint. The same database tests run on PostgreSQL 16 in CI on every push.

Each item says what to do, what to expect and where to look when it fails.

## 1. Data Dragon (champions, patches, portraits)

- [ ] Settings → Data jobs → run `version-check`. Expect status *ok* and Data health showing the real current patch (e.g. `15.19`) instead of `0.0 / offline fixture`.
- [ ] Champion portraits render as images (not lettered tiles) on Team and in the Draft Room.
- [ ] Newest champions appear in the grid. If a champion is missing a curated profile the app marks it "New champion: characteristics not yet curated" and still allows it everywhere.
- [ ] Wait for (or simulate) a patch day: `version-check` opens a new statistics period and flags reworked champions under Settings → Champion reworks.

Failure signs: "Static provider unavailable" in the job log → the host cannot reach Data Dragon (firewall/egress). The app keeps working on the last synced roster.

## 2. Riot API key and ranked ingestion

- [ ] Add `RIOT_API_KEY` and `RIOT_PLATFORMS=all` in the host; redeploy. Settings → Environment shows the key as *set*; Settings → Global Data Coverage lists 17 configured servers.
- [ ] Run `ranked-discover` twice and `ranked-ingest` once: the coverage table moves servers from *Pending* to *No data* (players tracked, ids queued) to *Active* (current-patch games), and the job summary's `requestsByHost` shows several hosts.
- [ ] Link a Riot account on My profile: the account shows *Synced* with "Last updated", the server badge carries ✓ when Riot confirmed it, and the RIOT DATA panel lists champions with Very strong / Strong / … labels.
- [ ] Run `ranked-discover`: expect `playersUpserted` > 0 and `matchesQueued` > 0 in the summary, no 401/403. A degraded result quotes the Riot status: 403 means the key was rejected (development keys expire after 24 hours), 401 that no valid key was sent, 404 a wrong platform code. *First production runs: 401 (an expired development key, deleted on Riot's side); with a fresh key: 450 players, 375 matches queued, 0 errors.*
- [x] Run `ranked-ingest` twice: the first run stores matches, the second stores only new ones (duplicates are impossible by primary key). *199 then 171 matches stored, queue drained, 0 failures.*
- [x] Run `aggregate`: Settings → Data health lists `ranked` as a source with the game count. *370 games.*
- [ ] After changing `RIOT_API_KEY`: the next `ranked-discover` reports `playersPruned`/`playersDropped` and then scans normally; linked accounts show "resolved again on the next sync" once and recover.
- [ ] 429 handling: temporarily lower `RIOT_RATE_LIMITS` to `2:1,10:120`, run `ranked-ingest`, confirm the job slows down rather than failing with 429 errors.

Failure signs: 401 → the value stored as `RIOT_API_KEY` is not a key Riot recognises (wrong value, placeholder, extra characters); 403 → the key expired (development keys last 24 h) or was revoked; 404 on `by-puuid` endpoints → wrong regional routing (check `RIOT_PLATFORMS` values like `euw1`, `kr`, `na1`, `oc1`).

## 3. Linked Riot accounts and proficiency

- [ ] Players → a player → Riot accounts: add your own Riot ID (exact spelling, including the tag). Expect the PUUID to resolve and the status to become *synced*; a renamed account should keep the same PUUID and adopt Riot's canonical spelling.
- [ ] Add the same Riot ID again (or an alt that resolves to a linked PUUID): expect a clear "already linked" message, never a duplicate.
- [ ] After `account-sync` (Settings → Data jobs) the Team page shows tier dots on pool champions and the Draft Room says e.g. "core comfort pick (68 games on record)".
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

- [ ] Settings → Members: create an invite link, open it in a private window, enter a username, a Riot ID and a main role, skip the password. Expect to land on My profile with the player profile and the Riot account already there, a "no password set" banner, and (after `account-sync`) the account resolved. Set a password under My profile; sign in again from another window with "Remember this device".
- [ ] The original owner sees "Complete your player profile" once; after entering a Riot ID and role the banner disappears and the profile exists exactly once.
- [ ] Open the same draft in both windows: actions entered in one appear in the other within ~1 s; "Take control" / "Hand off" change who can act; the other window's inputs are disabled while someone else controls. Reload mid-draft: the state is restored.
- [ ] Clash mode: create a draft, optionally type the enemy players' names on the pre-draft page, draft blind; the names appear on the match record.
- [ ] Scrim as a best of 3: start game 1 on blue, record a win, press Next game, start game 2 on red (optionally with a substitute in the lineup), record a win: the series shows "wins 2-0" under Matches and offers no game 3.

## 7. Match archive

- [ ] Finish a real (non-theorycraft) draft: the Match Playbook appears and a record shows up under Matches. Record a result and notes; confirm Draft Room recommendations are unchanged afterwards.
- [ ] Link a Riot match ID with a configured key: result and duration are fetched; without a key the page says the ID was stored only.

## 8. Things to watch over the first weeks

- Settings → Data health warns when a pipeline has not succeeded for too long; take warnings seriously, they are the only alarm.
- After each patch, confirm the patch number changes within an hour and that statistics start a new period while older evidence fades (Trends shows "vs previous patch").
- If Leaguepedia or Riot change response shapes, the jobs degrade gracefully and say so; the app keeps running on existing data.
