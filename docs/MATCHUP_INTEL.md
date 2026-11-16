# Matchup Intel

"I'm playing this champion against that champion. What do I need to know before entering lane?"
(the owner's request, 16 Nov 2026). Matchup Intel answers it as a fast, static reference in
Resources, for every signed-in account, built for a phone first.

It is not **Matchups**, a player's own games against a lane opponent, which lives in a champion's
window under All Champions ([MATCHUPS.md](MATCHUPS.md)). The two keep their names apart, and this
one's code lives under `matchup-intel`.

## What it is

You pick your champion and the enemy. The page then shows, in this order (one column on a phone,
the most important part first; side by side where a desktop has the room):

1. **The ten-second briefing**, where a person has written and checked one for this pair, in this
   direction: the threat, the opportunity and a few points about the lane. Each point has chips
   naming the abilities it rests on ("Renekton W"), which jump to that ability's row. The briefing
   says which patch it was checked on ("Checked on patch 26.22"). If Riot's numbers for those
   abilities moved after the check, it adds "Riot's numbers for these abilities changed after the
   check: may be out of date". Where no briefing exists, one calm line says so ("No curated briefing
   for Garen vs Darius yet") and that what follows is the enemy's general reference. It also links
   the curated matchups that do exist for your champion.
2. **The enemy's abilities**, one row each for P, Q, W, E and R:
   - the icon, the key and the name;
   - the base cooldown at each rank, or why there is no number (see Cooldowns);
   - recasts;
   - the checked facts as badges (crowd control, mobility, defence, sustain, damage, interaction,
     exception), each with an icon and a word, never colour alone;
   - Riot's short description;
   - a details part (the native `details` element) with the longer notes and each fact's source.
3. **Interactions**: the matchup's first, then the enemy's interaction and exception facts.
4. **Level notes**: the levels at which something notable becomes possible, for both champions.
5. **Your own champion's abilities**, collapsed until asked for.
6. **A quiet footer**:
   - "Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22)";
   - the curated notes' sources, with their licence and the day they were checked;
   - "A static reference for preparation: no live tracking";
   - Riot's notice, the same words as the rest of the app (`riotLegal`).

The page also has a state for each of these:

- **Nothing chosen**: what to do, and links to the curated briefings so far.
- **One side chosen**: with only the enemy, its general reference and a way to choose your champion;
  with only yours, a prompt to choose the enemy and the curated matchups for your champion.
- **No ability data stored yet** for a champion: "Ability details arrive with the next game-data
  update".
- **Ability data older than the current patch**: said once, above the abilities.
- **A champion the roster does not know** in the address: it is left out and the page says so,
  never repeating what the address said.

The data comes in two layers, kept apart so each can improve without the other
(`src/domain/matchup-intel/types.ts`):

- **Champion intelligence**: Riot's Data Dragon for every champion, plus the curated notes on one
  champion's abilities.
- **Matchup intelligence**: curated notes for your champion against one enemy, in that direction
  only.

Nothing is generated: what no person has checked is shown as Data Dragon gives it, or not at all.

## Where it is

- **Resources → Matchup Intel** (`/resources/matchups`). Resources is one sidebar entry for two
  sections, **Library** (`/resources`, the team's sites) and **Matchup Intel**. They are the tabs
  at the top of both pages, on phones too. A member's phone reaches Resources from the account
  screen, and Back from Matchup Intel leads to Resources, never to Team (`phoneParent` and
  `pageName`, `src/lib/nav.ts`).
- **The address** carries the choice: `?champion=<id>&vs=<id>`, Data Dragon ids, the same names as
  the champion window's. Each id is checked against the roster on the server. An id that is not on
  it is dropped. The id may also be written as a name, in any case, with accents or punctuation
  ("wukong" finds MonkeyKing). Links and attributes only ever carry the roster's own ids.
- **From a champion's window** (All Champions, Roles & champion pools): the **Matchup Intel** link
  in its scope row opens the page with that champion as yours. While Matchups is open with a lane
  opponent, the link carries the opponent too.
- **The pickers**: your champion and the enemy side by side, with the swap between them. Each slot
  opens a picker window (`DetailModal` "standard", the whole screen on a phone) with:
  - a 16px search that filters as you type, by name, ignoring case, accents, spaces and
    punctuation ("kha" finds Kha'Zix, "wu" Wukong, "dr m" Dr. Mundo);
  - with nothing typed, the champions chosen lately on that side (Recent);
  - for the enemy, the curated matchups that exist for your champion;
  - then the whole roster (`ChampionGrid` without its own toolbar).

  Enter takes the first match. Escape clears the search, then closes the window. A choice goes into
  the address at once (`router.push`): the slots show it while the page under them dims until the
  server's page arrives.
- **Remembered on this device**: the champion you choose as yours, and the last eight champions on
  each side. They live in `localStorage` under `uniiverse.matchup-intel.v1`, champion ids only, and
  are never sent anywhere. With no champion of yours in the address, the page offers the remembered
  one (Use or Forget) and never assumes it. While it is shown, the page says it is remembered. A
  champion that came from a link can be remembered with one tap.

**The code:**

| What | Where |
| --- | --- |
| The page and its loading state | `src/app/(app)/resources/matchups/` |
| The view, built on the server (`buildMatchupPageView`, its parts injected; `loadMatchupPage` wires the real ones) | `src/server/matchup-intel/view.ts` |
| The pickers, the device store, the search, the page's words and its sections | `src/components/matchup-intel/` |
| The shared types and the cooldown rules | `src/domain/matchup-intel/` |

**What a visit costs** (docs/HOSTING_USAGE.md, "Vercel Active CPU"):

- The page is rendered on each request. It reads:
  - the session (its own `requirePageAccess`);
  - the cached roster and current patch;
  - the stored abilities of at most the two champions chosen;
  - Branding's names, from the cache the app's frame has just filled.
- The curated notes are committed with the code, so reading them costs no request.
- There is no fetching from the browser, and no `next/image`.
- Links to a pair and to a champion use `prefetch={false}`.
- The curated dataset never reaches a browser bundle (`src/app/client-imports.test.ts`): only plain
  view data does.

## Data

- **Ability names, icons, ranks and base cooldowns** come from Riot's Data Dragon. The game-data job
  stores them once per game version, and the page reads them per champion with
  `loadChampionAbilities` (`src/server/matchup-intel/abilities.ts`). How they are stored and
  refreshed: [DATA_PIPELINES.md](DATA_PIPELINES.md), "Riot static data (Data Dragon)".
- **Icons** are linked from `https://ddragon.leagueoflegends.com/cdn/<version>/img/spell/<file>`
  (`img/passive/` for the passive), 48px and lazily loaded. The key on a plain tile stands in where
  one cannot load.
- **Curated notes** (`src/server/matchup-intel/curated/`: `getChampionNotes`, `getMatchupNotes`,
  `curatedEnemiesFor`) are committed and reviewed; see Curated notes below. Every fact names its
  source, and each set of notes says the patch it was checked on. A source keeps its link only when
  it is an https address on `wiki.leagueoflegends.com`, `ddragon.leagueoflegends.com` or
  `developer.riotgames.com` (`safeSourceUrl`); any other link is dropped and the title stays.
- **The patch**: the game's current patch by its public name (26.22 for Data Dragon 16.22.1),
  unknown while the game data is the offline fixture. Ability data older than the current patch is
  said once above the abilities.
- **Freshness** of curated notes, from Riot's numbers for the abilities they cover
  (`abilityFreshness`, `weakestFreshness`):
  - checked on the data's own version: "current";
  - checked earlier, with the numbers unchanged since: said only as "Checked on patch N";
  - the numbers changed after the check: flagged as possibly out of date.

  A briefing's freshness comes from the abilities it rests on.

<!-- "## Curated notes" (how the notes are written, checked and kept fresh) is added with the curated notes themselves (src/server/matchup-intel/curated/). -->

## Cooldowns

The rules are in `src/domain/matchup-intel/cooldown.ts` (`cooldownDisplay`), the words in
`src/components/matchup-intel/wording.ts`, and the numbers are written by `formatCooldowns` in
`src/lib/format.ts`. A number is shown only when the data holds it; what is not known is said as
not known, never estimated.

| Case | Shown as |
| --- | --- |
| Base cooldown per rank, without ability haste (the list says this once) | "8 / 7 / 6 / 5 / 4 s" |
| The same value at every rank | "13 s at every rank" |
| When it starts, if a source says (on cast goes without saying) | "starts after the first cast", "starts after the last recast", "starts when the effect ends", "starts after the channel" |
| Charges, from curated notes | "2 charges · one back every 20 / 18 / 16 / 14 / 12 s" |
| Charges, from Data Dragon alone (its number is the time between casts, not the recharge) | "3 charges · recharge not in Riot's data · 0.25 s between casts" |
| A passive's own cooldown, where a source states one | "12 / 9 / 6 s · at levels 1 / 7 / 13" |
| A passive without one (Data Dragon has no passive cooldown) | "Cooldown not in Riot's data", never "none" |
| No cooldown at all (curated) | "No cooldown" |
| An all-zero placeholder in Data Dragon | "No fixed cooldown in Riot's data" |
| Riot's numbers changed after the curated check | Riot's current numbers, and the row is flagged "Changed since the check" |

Decimals are written as the numbers have them, up to two ("0.25 s").

## Compliance

- **Riot's Game Integrity rules**, as [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) quotes them: no
  advantage others could not have; no information unavailable in the client; no acting for the
  player; enemy ultimate timers banned from 13 March 2025.
- **The static-reference rule**:
  - Matchup Intel shows only static data, available to anyone before a game: Data Dragon's
    published abilities and base cooldowns, and notes written from public reference pages.
  - It never has timers, trackers, live data or champion-select scouting. Nothing reads the game
    client, a game in progress or champion select, and nothing counts down.
  - The base cooldowns are the numbers every player can read in the game's own tooltips.
  - Briefings point at what matters and leave the decisions to the player: they highlight
    decisions, never dictate them.
- **The League of Legends Wiki** is under CC BY-SA 3.0:
  - the curated notes are written in our own words from its pages;
  - the footer credits each page with its title, the licence and the day it was checked;
  - the app never calls the wiki: its pages are links only, and the browser specs check that the
    page requests nothing from `wiki.leagueoflegends.com`.
- **Riot's notice**: the page's footer carries the same required notice as the rest of the app
  (`riotLegal`, with the name the installation gives itself).
- **The owner's step**: update the product's description in Riot's Developer Portal to mention
  Matchup Intel ([RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), item 9).

## Not built

For later, if wanted:

- your own notes on a matchup;
- favourite matchups;
- sharing a briefing.

Nothing here reads a player's games either: those are Matchups', in the champion window.
