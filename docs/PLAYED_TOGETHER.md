# Played together

**Team → Matches** (`/matches`) is Played together: Riot games in which two or more current team members were on the same team.

## How games are found

- **Source:** the members' own synced match histories (`account_matches`). No Riot request is made when the page opens.
- **Side of each game:** copied from the stored match details when they are stored (`account_matches.team_id`, migration 0033).
- **Who counts:** the current team members only (`listPlayers`): archived and personal-use profiles are left out; a member whose first-time setup is unfinished still counts. The Owner's admin identity has no player profile. A membership change takes effect on the next page load.
- **One person is one member.** Several linked accounts of the same player in one game count once.
- **Same side only.** Members on opposite teams never count as teammates. They are named under the game ("Also in this game, on the other team").
- **Unknown sides are never guessed.** A shared game whose match details are not stored yet is counted separately ("could not be checked yet") until its details arrive.
- **No duplicate records.** A game appears once however many members' accounts synced it.

## Party status

Riot's match data (match-v5) gives each participant's PUUID and team, but not who queued together. A game here is therefore **played together**, never a confirmed premade party. The page says so once, behind the (i) beside its summary line, rather than on every card.

In Ranked Solo/Duo a party is two players at most, so a Solo/Duo game with three or more members says that not all of them queued together.

## Filters and summary

- **Filters:** season (from Season 2026), games (All, Ranked Solo/Duo, Ranked Flex, Normal games, Clash), size (2+, 3+, 4+, all five) and members (every chosen member on the same side).
- **Summary:** one line with the season, the games and the record. With members chosen, their record together, their most played champions and the champion combinations they repeated. The "played together most" pair rankings were removed on 19 Oct 2026.
- **Details:** a game opens under its card on tablets and desktops, and full screen on phones (Back closes it; #203), with both teams, items and runes, from the first listed member's stored history.
- **A game whose side is unknown** (no stored match details for one of its members yet) is counted as "could not be checked yet" and listed once its details arrive. A game Riot no longer serves keeps an unknown side for good.

## Access and privacy

- **Access:** the page needs team match access, and the Played together tab also needs teammate-statistics access. Personal-use accounts have neither.
- **Content:** Riot match figures only; the records kept from the retired Ranked Development are never read.

## Caching

- **Cache:** the result is cached per team and dropped as soon as any of these changes: the members, their linked accounts, their stored games, the copied sides, or the last sync.
- **Query cost:** one indexed query over the members' games; the shared games are found inside the database.

## Tests

- `src/domain/played-together.test.ts`: same side, opposite sides, one person on two accounts, unknown side, filters.
- `tests/db/played-together.test.ts`:
  - personal-use exclusion and promotion;
  - membership changes;
  - details that arrive later.
- `e2e/played-together.spec.ts`: the tab, labels, filters, the Solo/Duo note and the empty state, on the demo's **synthetic** shared games (match ids `DEMO_9…`, demo mode only).
