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

In Ranked Solo/Duo a party is two players at most, so a Solo/Duo game with three or more members says that not all of them queued together: a line of text on its card, under the result (whole on a stacked card; "Not all queued together" in the four columns' narrow result column, under the queue's own "Ranked Solo/Duo", with the whole sentence read out and in its title).

## Filters and summary

- **Filters:** season (from Season 2026), games (All, Ranked Solo/Duo, Ranked Flex, Normal games, Clash), size (2+, 3+, 4+, all five) and members (every chosen member on the same side).
- **Summary:** one line with the season, the games and the record. With members chosen, their record together, their most played champions and the champion combinations they repeated. The "played together most" pair rankings were removed on 19 Oct 2026.
- **Details:** a game opens under its card on tablets and desktops, and full screen on phones (Back closes it; #203), with both teams, items and runes, from the first listed member's stored history.
- **A game whose side is unknown** (no stored match details for one of its members yet) is counted as "could not be checked yet" and listed once its details arrive. A game Riot no longer serves is counted apart and left out for good: the page says how many, and their results still count on the members' profiles (#202). Both notes are behind the summary line's (i), after the rule of what "played together" means (since 18 Nov 2026; the list's own line with the count and its two (i)s is gone: the summary line counts the games).
- **The cards** (#303, then the UX pass's PR 7c): one per game, laid out by the list's own width (`@container/tm`). A game is one line of words (the result, its length, queue and date, then how many members played it; on a phone that count is read out only, the rows under it being the members). Each member is a row: the champion's 36px portrait with the member's 16px picture as a badge on its corner, the name whole (a long one wraps) with the K/D/A and the game's largest multikill right after it, then the role and champion; from sm, in a row of 19rem, the CS and damage beside them where both fit whole and on a line of their own under them otherwise, so they never cut the champion's name (on narrower rows they are the K/D/A's title and in the game's breakdown). The members go two to a row once their column is 34rem (a tablet's card; the four columns beside the open sidebar at 1440). From a 58rem list the card is one row of four columns: the result (8.5rem), the members, both teams (up to 20rem) and the bookmark; narrower cards stack them, both teams under the members from md. Bookmarked ends the filter row (beside Filters on a phone). While the page loads, its skeleton has the same shape (`src/app/(app)/matches/loading.tsx`; its shapes are hidden from screen readers, which hear the one Loading status). Team Insights, under the same folder until 23 Nov 2026, was removed with its own loading state (Release 16).

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
- `e2e/played-together.spec.ts`: the tab, labels, filters, the Solo/Duo note and the empty state, on the demo's **synthetic** shared games (match ids `DEMO_9…`, demo mode only). It also checks the cards' layout against their list's width: four columns exactly from a 58rem list, with the sidebar open and folded, and on a touch screen the result keeps its whole column; a game of four as two rows of two on the tablet and at 1440 (the 36px portrait and its 16px picture, the K/D/A right after the name), Bookmarked at the filter row's end, the Solo/Duo caveat as text, a phone's member rows of about 40px with names whole at 375 and 320px, and at 200% text on a 320px phone a page no wider than the phone.
