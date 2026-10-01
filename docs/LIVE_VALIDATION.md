# Live validation checklist

**Status: the external services (Riot API, Data Dragon, Leaguepedia) have not been verified yet. The production database path has.**

Verified without the external services, on a real PostgreSQL 16 server in production mode (accounts required, setup key enforced): schema migrations including eight simultaneous cold starts, the owner setup → sign out → sign in flow, a complete draft with its playbook, the match archive, the Settings page and the authenticated job endpoint. The same database tests run on PostgreSQL 16 in CI on every push. What remains unverified is everything that needs the internet: the development sandbox had no access to `ddragon.leagueoflegends.com`, `*.api.riotgames.com`, `lol.fandom.com` or `oracleselixir.com` (every request was blocked with HTTP 403), so those integrations were tested only against recorded API shapes and fakes. The integration code follows the published API contracts, but a real run is the only proof. Work through this list once the app is deployed with real credentials and tick each item.

Each item says what to do, what to expect and where to look when it fails.

## 1. Data Dragon (champions, patches, portraits)

- [ ] Settings → Data jobs → run `version-check`. Expect status *ok* and Data health showing the real current patch (e.g. `15.19`) instead of `0.0 / offline fixture`.
- [ ] Champion portraits render as images (not lettered tiles) on Team and in the Draft Room.
- [ ] Newest champions appear in the grid. If a champion is missing a curated profile the app marks it "New champion: characteristics not yet curated" and still allows it everywhere.
- [ ] Wait for (or simulate) a patch day: `version-check` opens a new statistics period and flags reworked champions under Settings → Champion reworks.

Failure signs: "Static provider unavailable" in the job log → the host cannot reach Data Dragon (firewall/egress). The app keeps working on the last synced roster.

## 2. Riot API key and ranked ingestion

- [ ] Add `RIOT_API_KEY` and `RIOT_PLATFORMS` in the host; redeploy. Settings → Environment shows the key as *set*.
- [ ] Run `ranked-discover`: expect `players` counts per tier in the summary, no 401/403.
- [ ] Run `ranked-ingest` twice: the first run stores matches, the second stores only new ones (duplicates are impossible by primary key). Check the summary numbers.
- [ ] Run `aggregate`: Trends switches from "DEMO DATA" to real games; Settings → Data health lists `ranked` as a source. Remove demo statistics afterwards (Settings → Demo data).
- [ ] 429 handling: temporarily lower `RIOT_RATE_LIMITS` to `2:1,10:120`, run `ranked-ingest`, confirm the job slows down rather than failing with 429 errors.

Failure signs: 401/403 → the key expired (development keys last 24 h) or is wrong; 404 on `by-puuid` endpoints → wrong regional routing (check `RIOT_PLATFORMS` values like `euw1`, `kr`, `na1`).

## 3. Linked Riot accounts and proficiency

- [ ] Players → a player → Riot accounts: add your own Riot ID (exact spelling, including the tag). Expect the PUUID to resolve and the status to become *synced*; a renamed account should keep the same PUUID and adopt Riot's canonical spelling.
- [ ] Add the same Riot ID again (or an alt that resolves to a linked PUUID): expect a clear "already linked" message, never a duplicate.
- [ ] After `account-sync` (Settings → Data jobs) the Team page shows tier dots on pool champions and the Draft Room says e.g. "core comfort pick (68 games on record)".
- [ ] Unicode Riot ID (Korean/Japanese name): it must be sent and shown exactly as typed.
- [ ] Unlink an account: its history disappears from the proficiency view.

## 4. Professional data (pick order)

- [ ] With `PRO_DATA_PROVIDER=leaguepedia`, run `pro-sync`. Expect games imported with `pickOrder` > 0 (Leaguepedia `Team1Picks`/`Team2Picks`). If the Cargo fields have been renamed, the job reports "response shape changed" and keeps old data.
- [ ] Run `aggregate`; the Pre-draft page of a tournament draft shows **PRO DRAFT PATTERNS** with B1 priorities, R1/R2 pairs, R5 counterpicks and second-ban targets.
- [ ] Alternative: `PRO_DATA_PROVIDER=oracleselixir` with `PRO_DATA_CSV_URL` pointing at the current-season CSV; the `pick` column supplies the order.

## 5. Database and deployment

- [ ] Supabase: first start creates all tables (`drizzle/*.sql` run by the embedded migrator, under a transaction-scoped advisory lock that is safe behind the transaction pooler). Check the Supabase table editor for `drafts`, `matches`, `riot_accounts`, `pro_pick_slot_stats` and `uniiverse_migrations` (two rows).
- [ ] Production auth: with `DATABASE_URL`, `UNIIVERSE_AUTH_SECRET` and `UNIIVERSE_ACCESS_PASSWORD` set, the first visit shows the setup page; create the owner with the setup key. Afterwards `/login` is required for every page.
- [ ] Vercel Cron (or the GitHub Actions workflow with `APP_URL` + `CRON_SECRET`) calls `/api/jobs/tick`; Data health shows recent success times for every job within an hour.
- [ ] `/api/health` returns 200 with the patch and job summary.

## 6. Team platform flows (two browsers)

- [ ] Settings → Members: create an invite for a player, open the link in a private window, create the account, claim the player profile. The player can edit only their own pools and sees drafts live.
- [ ] Open the same draft in both windows: actions entered in one appear in the other within ~1 s; "Take control" / "Hand off" change who can act; the other window's inputs are disabled while someone else controls. Reload mid-draft: the state is restored.
- [ ] Clash mode: create a draft, add an opponent and a few Riot IDs in the scouting window; ban considerations update; partial information (one account, no accounts) still produces a plan.

## 7. Match archive

- [ ] Finish a real (non-theorycraft) draft: the Match Playbook appears and a record shows up under Matches. Record a result and notes; confirm Draft Room recommendations are unchanged afterwards.
- [ ] Link a Riot match ID with a configured key: result and duration are fetched; without a key the page says the ID was stored only.

## 8. Things to watch over the first weeks

- Settings → Data health warns when a pipeline has not succeeded for too long; take warnings seriously, they are the only alarm.
- After each patch, confirm the patch number changes within an hour and that statistics start a new period while older evidence fades (Trends shows "vs previous patch").
- If Leaguepedia or Riot change response shapes, the jobs degrade gracefully and say so; the app keeps running on existing data.
