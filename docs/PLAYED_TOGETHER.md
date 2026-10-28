# Played together

**Team → Matches → Played together** (`/matches?view=together`) lists Riot games in which two or more current team members were on the same team.

## How games are found

- **Source:** the members' own synced match histories (`account_matches`). No Riot request is made when the page opens.
- **Side of each game:** copied from the stored match details when they are stored (`account_matches.team_id`, migration 0033).
- **Who counts:** the current team members only. Archived, unfinished and personal-use profiles are left out, and the Owner's admin identity has no player profile. A membership change takes effect on the next page load.
- **One person is one member.** Several linked accounts of the same player in one game count once.
- **Same side only.** Members on opposite teams never count as teammates. They are named under the game ("Also in this game, on the other team").
- **Unknown sides are never guessed.** A shared game whose match details are not stored yet is counted separately ("could not be checked yet") until its details arrive.
- **No duplicate records.** A game appears once however many members' accounts synced it.

## Party status

Riot's match data (match-v5) gives each participant's PUUID and team, but not who queued together. A game here is therefore **played together**, never a confirmed premade party; every card says "Played together · party not verified".

In Ranked Solo/Duo a party is two players at most, so a Solo/Duo game with three or more members says that not all of them queued together.

## Filters and summary

- **Filters:** games (All, Ranked Solo/Duo, Ranked Flex, Normal games, Clash), size (2+, 3+, 4+, all five) and member.
- **Summary:** the pairs who played together most (games, wins, losses).
- **Details:** opens the full match (both teams, items, runes) from a member's stored history.

## Access and privacy

- **Access:** the page needs team match access, and the Played together tab also needs teammate-statistics access. Personal-use accounts have neither.
- **Content:** Riot match figures only; Ranked Development notes, reviews and objectives are never read.

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
