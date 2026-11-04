# Team Leaderboards

Friendly competition on the team's own Riot games: **Team → Leaderboards** (`/leaderboards`), between Players and Matches. The rules, and why, are in `docs/LEADERBOARDS_MODEL.md`.

## The two views

The views are secondary tabs under the Team tabs, like Match History's Games and Encounters.

- **Recent form** (the default, `/leaderboards`): one board.
  - **The window:** each member's latest 20 Summoner's Rift games from the last 60 days, 5 minutes or longer, from every linked account (a match seen from two accounts counts once). Ranked by win rate.
  - **Places:** equal win rates share a place ("3=").
  - **Each row says what counts:** the record ("13W 7L"), the win rate, the dates the 20 games cover, the main role in those games, and the gap to the place above in wins ("1 win behind Ash", or "Win your next game to draw level with Ash").
  - **Fewer games:** members with 10 to 19 recent games are provisional, listed after every full window. Members with fewer are listed under the board with the games they still need and the date of their last game.
  - **Under the board:** 20 games is a short sample, places within 2 wins are close, and the notes assume the players above don't play in the meantime.
  - **Styling:** neutral. No red for a cold streak; only first place's crown and your own row are marked.
- **Records & achievements** (`/leaderboards?view=records`, with `&season=` for an earlier season): it says first that these reward playing more.
  - **Seven season records:** most kills and most assists; damage, CS and vision per minute (from games of 15 minutes or more); best KDA (from games with 10 or more takedowns); the longest win streak. Each shows its holder, champion, role and date, and the viewer's own best. A tie goes to whoever set it first. A record opens its game in the holder's Match History.
  - **Multikills this season,** rarest first, with a note when not every game carries Riot's multikill figures.
  - **Milestones:** champions with 25, 50 or 100 games this season, and Riot mastery of 100K, 500K or 1M points (all-time). Each member's best three are shown, then how many more.
  - **One choice:** the season.

Older addresses (today's `?category=`, `?metric=`, `?queue=`, `?role=` and `?lineup=`) open Recent form; nothing they asked for applies.

## Who can see it, who is on it

- **Open to:** team members with the *view teammate stats* ability. The page checks this on the server (`requirePageAccess("view-teammate-stats")`); the navigation link uses the same check. Personal-use accounts have neither.
- **On the board:** every active team member with a finished account and a player profile. This is the same list as the Players page:
  - archived profiles, unfinished accounts (setup not completed) and personal-use profiles are left out;
  - the Owner's admin identity has no player profile, so it never appears.
- **Membership changes:** take effect on the next page load (see *Updates and caching*).

## The public Leaderboards

`/public/leaderboards` shows the same two views among the players the public Team page shows, by display name, linking to no profile or game. It exists only where the deployment allows Riot data on the public pages (a Production key whose registration describes them); otherwise the address is not found.

## Updates and caching

- **No Riot requests on page open.** The page reads only what the existing account syncs have stored (`account_matches`, `account_mastery`). New games appear after the next account sync; the data status behind the ⓘ under the title says how current the members' games are.
- **Per-game figures are copied once.** When a match's details are stored, each linked player's side, gold, wards, team kills, team damage and extra figures are copied onto their game row (`account_matches`, migration 0033). The leaderboard reads these plain columns instead of re-reading every match's JSON. Any game whose details arrived without the copy (the existing history, once, after the feature first deploys) is copied on the next sync or page load.
- **One read per team, cached.** The games are read in one query and cached per team for up to 15 minutes. The cache is dropped as soon as the set of linked accounts, the number of stored games, the newest game, the newest copied figures or the last sync time changes.
- **Rankings are cheap.** They are computed in memory from the cached games, a few milliseconds for every board at once.

## Privacy

- **What the board uses:** Riot match figures and mastery only.
- **What it never reads:** the records kept from the retired Ranked Development (notes, reviews, objectives and plans).
- **Production probe:** the `perf-probe` job records counts only (players, games, games with details), never names or values.

## Data changes

- **Phase 14: no migration.** The extra per-game figures go into the existing `match_details.participants` JSON (an optional `stats` object).
- **Phase 15: migration 0033 (additive).** Nullable columns on `account_matches` (`team_id`, `gold`, `wards_placed`, `team_kills`, `team_damage`, `extra_stats`, `summarised_at`) and a partial index for games still waiting for their copy. No existing value changes; the columns are filled from the stored match details.
- **New syncs:** the Riot match schema parser accepts the extra fields as optional.
- **Demo mode** (`UNIIVERSE_SEED_DEMO`, in-memory database only) seeds **synthetic** games (match ids starting `DEMO_`) so the page has something to show. These are never real player data and are never written to a real database.

## Tests

- `src/domain/leaderboard-recent.test.ts` and `src/domain/leaderboard-records.test.ts`: the window, places, gaps, provisional and not-enough members, main role, records and their tie rule, multikills and milestones.
- `src/domain/leaderboards.test.ts`: the win streak's order, and who can open Leaderboards.
- `src/server/leaderboards/recent-view.test.ts`: the addresses of the two views.
- `tests/db/leaderboards.test.ts`: eligibility, linked-account de-duplication, match-detail extraction, K/D/A that Riot reported as unavailable, cache invalidation and the probe steps.
- `tests/db/leaderboards-recent.test.ts`: both views on stored games, and the public boards linking nowhere.
- `tests/db/leaderboards-equivalence.test.ts`: the compact data answer gives the same boards as one row per game.
- `tests/db/public-access.test.ts`: who is on the public boards, and what the page sends.
- `e2e/leaderboards-recent.spec.ts` (phone, tablet, desktop): the default view, order, shared places and gap notes, each row's record, dates and role, records opening their game, multikills rarest first, axe (WCAG 2.1 AA) on both views, no sideways scroll.
