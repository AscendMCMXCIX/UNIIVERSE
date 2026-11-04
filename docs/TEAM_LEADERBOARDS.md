# Team Leaderboards

Friendly competition on the team's own Riot games: **Team → Leaderboards** (`/leaderboards`), between Players and Matches.

## The proposed boards (awaiting the owner's approval)

The replacement described in `docs/LEADERBOARDS_MODEL.md` (Recent form and Records & achievements) is built and tested. Its ranking rules are the owner's decision, so members still get the boards described below.

- **Administrators can open it on live data:** `/leaderboards?preview=recent-form`. A banner says it is a preview.
- **Everyone else gets today's boards from that address.** The check runs on the server (`opensRecentFormPreview` in `src/server/leaderboards/recent-view.ts`), so members see no change.
- **What it shows:**
  - **Recent form:** one board. Each member's latest 20 Summoner's Rift games from the last 60 days, ranked by win rate. Each row has the record, the dates, the main role and the gap to the place above in wins. Members with 10 to 19 recent games are provisional, listed after every full window. Members with fewer are listed below the board with the games they still need.
  - **Records & achievements:** one season's single-game records (each opens its game), multikills (rarest first) and champion milestones (games on one champion this season, and all-time mastery). The page says that these reward playing more.
- **Activation:** after approval, `/leaderboards` (and `/public/leaderboards`) render these boards by default and today's categories, seasons and filters are retired. That is a separate pull request with no data change, so a revert restores today's boards.

## Who can see it, who is on it

- **Open to:** team members with the *view teammate stats* ability. The page checks this on the server (`requirePageAccess("view-teammate-stats")`); the navigation link uses the same check. Personal-use accounts have neither.
- **On the board:** every active team member with a finished account and a player profile. This is the same list as the Players page:
  - archived profiles, unfinished accounts (setup not completed) and personal-use profiles are left out;
  - the Owner's admin identity has no player profile, so it never appears.
- **Active lineup only:** a filter limits the board to the five players in the current lineup.
- **Membership changes:** take effect on the next page load (see *Updates and caching*).

## Filters

Each filter is held in the URL, so a board can be bookmarked or shared. Switching category or metric keeps every filter.

| Filter | Options | Default |
|---|---|---|
| Season | every season with stored games, plus the current one | current season |
| Games | All supported games (Ranked Solo/Duo, Ranked Flex, Normal Draft/Blind, Quickplay, Swiftplay, Clash: the queues the account sync collects), All ranked, Ranked Solo/Duo, Ranked Flex, Normal games | All supported games |
| Role | All roles, or the role **actually played** in each game (not a player's preferred role) | All roles |
| Active lineup only | on / off | off |

## Fairness rules

- **Totals and averages are labelled.** Every board shows its kind:
  - **Total** adds up over the games in scope, so more games means more chances.
  - **Average** and **Rate** are per game or per minute.
  - **Record** is the single best game.
- **Minimum games.** Averages and rates need **10 games** in scope, or **5 games in the role** when a role is selected. Players below the minimum are listed under the board with their progress (for example "3 of 10 games"); they are never ranked.
- **Champion boards** count a champion only after **10 games** on it.
- **Missing data is left out, never counted as zero:**
  - a game without K/D/A (Riot sometimes omits it) is skipped by K/D/A metrics;
  - a game without stored match details is skipped by the match-detail metrics;
  - a player with no data for a metric is listed as "no data", not ranked last.
- **Remakes** (games under 5 minutes) are left out of per-minute figures and per-minute records.
- **Linked accounts:** every linked Riot account counts toward its player. A match seen from two of a player's accounts counts once, and the copy that has stored match details is kept.
- **Ties** share a place (1, 1, 3).
- **Lower is better:** only "Fewest deaths per game" is ranked low-to-high, and it is labelled.

## Statistics

The "Data" column says where each figure comes from:
- **games:** stored per-game figures, available for every synced game.
- **details:** the full match details UNIIVERSE stores, so only games that have them count.
- **extra:** figures UNIIVERSE keeps on games synced from this release onwards. Older games are left out until they are synced again; no backfill has been run.
- **mastery:** Riot's all-time champion mastery on every linked account. It is not limited by the season, queue or role filters.

### Overview

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Highest win rate | rate | games | Wins ÷ games with a result, in the selected season, queues and role. |
| Most wins | total | games | Games won in scope (a total: more games, more chances). |
| Most games played | total | games | Games played in scope, each match once even when several linked accounts were in it. |
| Best KDA | average | games | (Total kills + total assists) ÷ total deaths over the games with K/D/A; with no deaths at all, kills + assists per game. |
| Highest kill participation | average | details | (Kills + assists) ÷ the team's kills, summed over the games with full match details. |
| Fewest deaths per game (lower is better) | average | games | Average deaths per game over the games with K/D/A (lower is better). |
| Most assists per game | average | games | Average assists per game over the games with K/D/A. |
| Most champions played | total | games | Different champions played in scope. |
| Longest win streak | record | games | Most consecutive wins in scope, in the order the games were played. |
| Highest total mastery | total | mastery | Champion mastery points on every linked account, all champions (Riot's all-time figure: not limited to the season, queue or role). |

### Combat

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Most kills | total | games | Kills in scope (a total). |
| Most kills per game | average | games | Average kills per game over the games with K/D/A. |
| Highest damage per minute | average | games | Total damage to champions ÷ total minutes of the games that have both (remakes left out). |
| Highest average champion damage | average | games | Average damage dealt to champions per game. |
| Highest team damage share | average | details | Your damage to champions ÷ your team's, summed over the games with full match details. |
| Most solo kills | total | extra | Kills with no allied help, as Riot's match statistics count them, in the games with that data. |
| Most first bloods | total | extra | Games where you got the first kill, in the games with that data. |
| Most assists | total | games | Assists in scope (a total). |

### Multikills

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Most double kills | total | extra | Double kills in the games with multikill data (every new game, and older Season 2026 games as their records are fetched again). |
| Most triple kills | total | extra | Triple kills in the games with multikill data. |
| Most quadra kills | total | extra | Quadra kills in the games with multikill data. |
| Most pentakills | total | extra | Pentakills in the games with multikill data. |

These boards use the same counts as the profile's Multikills section (`src/domain/multikills.ts`): Riot's own count per game, on records stored since Phase 14 (871 of 4,779 stored games on 20 Oct 2026) and, as the `figures-backfill` job fetches them again a few an hour, on the older Season 2026 games too (`src/server/accounts/figures-backfill.ts`). Until it finishes they cover part of the season, and they are never career totals.

### Farming

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Highest CS per minute | average | games | Lane minions + monsters ÷ total minutes of the games that have both (remakes left out). |
| Most CS per game | average | games | Average lane minions + monsters per game. |
| Highest gold per minute | average | details | Gold earned ÷ total minutes, over the games with full match details. |
| Most total CS | total | games | Lane minions + monsters in scope (a total). |

### Vision

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Highest vision score per game | average | games | Average vision score per game. |
| Highest vision score per minute | average | games | Vision score ÷ total minutes of the games that have both. |
| Most wards placed per game | average | details | Average wards placed per game, over the games with full match details. |
| Most wards cleared per game | average | extra | Average enemy wards destroyed per game, over the games with that data. |
| Most control wards bought per game | average | extra | Average control wards bought per game, over the games with that data. |
| Most crowd control per game | average | extra | Average seconds of crowd control applied to enemy champions per game (Riot's own measure), over the games with that data. |

### Objectives

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Highest objective damage per game | average | extra | Average damage to objectives (towers, dragons, Baron and other epic monsters, inhibitors) per game, over the games with that data. |
| Highest tower damage per game | average | extra | Average damage to buildings (towers and inhibitors) per game, over the games with that data. |
| Most turret takedowns | total | extra | Turrets you destroyed or helped destroy, in the games with that data (a total). |

### Champions

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Highest mastery on one champion | record | mastery | Mastery points on a single champion, added up over the linked accounts (Riot's all-time figure). |
| Most games on one champion | record | games | Games on the player's most played champion in scope. |
| Best champion win rate | rate | games | The player's best win rate on one champion with at least 10 games in scope (ties go to the champion with more games). |
| Most champions with real experience | total | games | Champions with at least 10 games in scope. |
| Biggest specialist | average | games | Share of the player's games on their most played champion: high for one-trick specialists. |

### Records

| Metric | Kind | Data | Definition |
|---|---|---|---|
| Most kills in one game | record | games | The highest kill count in a single game in scope. |
| Most assists in one game | record | games | The highest assist count in a single game in scope. |
| Highest KDA in one game | record | games | (Kills + assists) ÷ deaths in one game (a deathless game counts as dying once). |
| Most damage in one game | record | games | The highest damage to champions in a single game in scope. |
| Highest vision score in one game | record | games | The highest vision score in a single game in scope. |
| Best CS per minute in one game | record | games | The best CS per minute in a single game of normal length (remakes left out). |
| Most CS in one game | record | games | The most lane minions + monsters in a single game in scope. |
| Most gold in one game | record | details | The most gold earned in a single game with full match details. |

## Metric audit

| Status | Statistics |
|---|---|
| **Ready now** (stored per game) | games, wins, win rate, kills, deaths, assists, KDA, CS, CS/min, champion damage, damage/min, vision score, vision/min, champions played, win streaks, single-game records, mastery |
| **Available with existing processing** (from stored match details, no new Riot requests) | gold/min, most gold in a game, wards placed, kill participation (team kills), team damage share |
| **Kept from now on** (read from match details already being fetched; no extra Riot requests) | double/triple/quadra/pentakills, solo kills, first bloods, wards cleared, control wards bought, crowd-control time, objective damage, tower damage, turret takedowns |
| **Requires additional Riot data** (not built) | historical backfill of the "kept from now on" figures for older games: one match request per game; no backfill has been run |
| **Not reliably available** (left out) | dragon, Baron and Herald participation per player (needs timeline attribution); vision denial and roaming (no Riot figure); "clutch" or impact scores (no objective definition) |

## Comparisons on the page

- **Top-three podium:** each player in their own card colours over a static crop of their card artwork (`CardArtLayer`, no card effects), with avatar, rank emblem and value.
- **Highlights tiles:** the leader's identity first: a band with their card artwork and colours behind the statistic's name and your place, the leader's avatar, name and role, then the value in their colour with its sample, and the runner-up (avatar, name, value). The artwork is the same saved customisation as the Team card (`LeaderboardPlayer.art` from `cardArt`), drawn as one lazy image per tile; no full player card is mounted.
- **Full ranking:** every ranked player, with the sample behind each value (games counted, and for records the game's champion and date).
- **Your position** (when you are on the board): your place, how far you are from first ("Chase #1"), or how many games you still need to be ranked.
- **Your strengths:** the boards where you are in the top three.
- **Personal bests** (Records category): your best game next to the team record.
- **Record holders:** who holds the headline records, with links to each board.
- **Category leaders:** each metric in the list shows its current leader and your place.

## Updates and caching

- **No Riot requests on page open.** The page reads only what the existing account syncs have stored (`account_matches`, `account_mastery`). New games appear after the next account sync; **Last updated** shows the newest successful sync of any member's account.
- **Per-game figures are copied once.** When a match's details are stored, each linked player's side, gold, wards, team kills, team damage and extra figures are copied onto their game row (`account_matches`, migration 0033). The leaderboard reads these plain columns instead of re-reading every match's JSON. Any game whose details arrived without the copy (the existing history, once, after the feature first deploys) is copied on the next sync or page load.
- **One read per team, cached.** The games are read in one query and cached per team for up to 15 minutes. The cache is dropped as soon as the set of linked accounts, the number of stored games, the newest game, the newest copied figures or the last sync time changes.
- **Rankings are cheap.** They are computed in memory from the cached games, a few milliseconds for every board at once.

## Page structure

1. **Header:** title, the scope in words (season · games · role · lineup), the number of games and players, and when the data was last updated; the filters beside it (behind a one-line summary on phones).
2. **Categories** with icons; **statistics rail** with each statistic's leader and your place (a swipeable row on phones).
3. **The board:** name, type (Total / Average / Rate / Record), definition and arrows to step to the next statistic; the top three on plinths (wider screens) or the leader spotlight (phones); the full ranking with a bar against the leader for every player.
4. **Your standing:** your place, Chase #1 (the leader against you, the gap, and for averages a reminder that it closes over several games), and the boards where you rank best; record holders when you are not on the board.

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

- `src/domain/leaderboards.test.ts`: calculations, minimums, missing data, ties, streak order, records, role filtering, lower-is-better and the chase text.
- `tests/db/leaderboards.test.ts`:
  - eligibility;
  - linked-account de-duplication;
  - match-detail extraction;
  - K/D/A that Riot reported as unavailable;
  - the viewer's position;
  - the lineup and role filters;
  - cache invalidation on new games and membership changes;
  - the probe step.
- `src/server/auth/permissions.test.ts`: the navigation link is hidden from personal-use accounts.
- `e2e/leaderboards.spec.ts` (phone, tablet, desktop):
  - the default scope;
  - podium order, including lower-is-better boards;
  - category switching keeps the filters;
  - the lineup filter;
  - the data notes;
  - totals and averages labelled;
  - records;
  - no horizontal overflow.
