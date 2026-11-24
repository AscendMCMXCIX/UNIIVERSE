# Champion Lookup

"Choose any champion and immediately see its abilities and cooldowns" (the owner's request of
23 Nov 2026, which replaced Matchup Intel: [MATCHUP_INTEL.md](MATCHUP_INTEL.md) says what was
retired). A fast, one-screen reference for a second monitor during play: one searchable selector,
the champion's portrait and name, its Passive, Q, W, E and R with their icons and names, each
ability's base cooldown per rank from Riot's Data Dragon, those cooldowns at an ability haste the
reader chooses, and Riot's short description of each ability, folded away until asked for. The
patch and the source are on the page at all times.

It is a destination of its own, for every signed-in account: `/lookup` (`CHAMPION_LOOKUP` in
`src/lib/nav.ts`: the sidebar, a tablet's top bar, the phone's bottom bar, the phone's bar held
sideways and the installed app's shortcuts, as "Champion Lookup", or "Lookup" where a bar has no
room for the whole name). It is not **Matchups**, a player's own games against a lane opponent,
which live in a champion's window under All Champions ([MATCHUPS.md](MATCHUPS.md)).

## The page

- **Title and source line.** "Champion Lookup", and beside it what the numbers come from: "Riot
  Data Dragon 16.22.1 · patch 26.22" (the version the shown champion's abilities were read at, and
  its public patch name by `publicPatchName`), "· offline copy" where they come from the committed
  offline copy, and "· the game is on patch 26.23" (in the warning colour) where the stored
  abilities are older than the game's current patch. With no champion chosen it says "Abilities and
  cooldowns from Riot's Data Dragon · patch 26.22".
- **Toolbar.** The search, All champions, and (with a champion shown) Descriptions at its end.
- **The panel.** The champion's portrait (64px, 48px on a phone), name and title, and the haste
  choice; then the five abilities, Passive first, each a row: its icon (40px, the key as a plain
  tile where the icon is missing or fails, with a key chip on its corner), "Passive" or its key
  and its name, and its cooldown (below); then the rule's line: "At a haste: base × 100 / (100 +
  haste), Riot's general rule, applied only where Riot's data gives the cooldown. Ultimate haste
  isn't counted."
- **Layout.** At `--content-max`, centred like every page. Each ability row measures itself
  (`@container/ab`): from 44rem (the icon, the name's 9rem, the kind's 6rem label and six 4rem ranks, Udyr's, with their gaps: 43.5rem) the name has its own column and the ranks line up as columns under
  the "Cooldown, s · Rank 1 2 3 4 5" heading; narrower (a phone, and 200% text), the cooldown goes
  under the name as one line per kind, "7 / 7 / 7 / 7 / 7 s", wrapping between ranks only. Nothing
  scrolls inside the page and nothing is wider than the screen from 320px up. The whole page fits
  one screen with any champion and any haste at 1440 × 900 and 1920 × 1080, and at the owner's own
  windows (23 Nov 2026): 1920 × 950 (a 1920 × 1080 screen less the browser's bars and the taskbar)
  with the sidebar folded or open, and 1440 × 780 (what a 1440 × 900 screen leaves the page), the
  haste choice and the five abilities on the first screen (`e2e/champion-lookup.spec.ts`); with the
  descriptions shown it may scroll.
- **Loading.** A champion chosen on the page is built on the server: until it arrives the panel
  shows the new champion's name and portrait with a spinner, is dimmed and out of reach (`inert`),
  and a status line says "Loading Ahri…". The route's `loading.tsx` takes the page's own shape.

## Choosing a champion

- **Search** (`champion-search.tsx`): one field (16px on phones and touch screens, so iOS never
  zooms in) that finds any champion on the roster as you type, by name with case, accents, spaces and
  punctuation ignored ("kha" Kha'Zix, "dr m" Dr. Mundo), by the initials of a name of more than one
  part ("tf" Twisted Fate, "mf" Miss Fortune), and by a short reviewed list of nicknames ("j4"
  Jarvan IV, `search.ts`). Its matches drop down under it, best first, at most eight, with how many
  more there are ("12 more: keep typing, or open All champions"), never a list that scrolls inside
  the page. The WAI-ARIA combobox with a list: the focus stays in the field, ↑/↓ move through the
  matches, Enter takes the one marked (the first when none is), Escape closes the list, then clears
  the field; a press on a match takes it. "/" anywhere on the page outside a field puts the focus in
  the search (a second monitor's quick reach). With a mouse the field keeps the focus after a choice,
  for the next search; on a touch screen it lets go, so the keyboard goes down and the abilities are
  in view.
- **All champions** (`champion-picker.tsx`): a window (a task dialog, DESIGN_SYSTEM.md §7: the
  whole screen on a phone, 42rem wider up, no history entry) with its own search and every champion
  on the roster as a portrait grid (the shared `ChampionGrid`, arrows moving between portraits),
  after a Recent row: the champions this device looked up lately (`recent.ts`, at most eight, ids
  only, per account in this browser, listed in Settings → On this device as "Champions looked up
  lately"; never sent to the server). With no champion chosen, the page offers the same Recent row
  under "Choose a champion".

## Address

`/lookup?champion=<id>&haste=<n>`, so a reload, a bookmark and a shared link open the same champion
at the same haste (`address.ts`). The champion may be its Data Dragon id or its name in any case,
with accents and punctuation ignored ("Wukong" opens MonkeyKing); the page checks it against the
roster and writes the champion's own id back into the address. One the roster lacks is left out
with a line saying so ("This address names a champion that is not on the roster"), never repeated
back. The haste is a whole number from 0 to 300; a larger one is held to 300, anything else is 0,
and 0 is left out of the address. Both are the page's state, like a filter: a change replaces the
address and adds no history entry, so Back leaves the page in one step however many champions
were looked at. A champion is built on the server (`router.replace`); a haste changes the numbers
in the browser at once and only rewrites the address (`history.replaceState`), with no request.

**Old links.** Matchup Intel's address, `/resources/matchups` with any of its parameters (`role`,
`champion`, `vs`, `ally`, `vs2`, `ability`), redirects here carrying one champion: the enemy
(`vs`) where it names one, since the old page was built around the enemy's cooldowns; else your
champion (`champion`); else the bot lane's other enemy (`vs2`); else your duo partner (`ally`)
(`legacyMatchupRedirect`). The lane and an ability's details have no place here and are dropped.
`/resources/matchups?champion=Riven&vs=Mordekaiser` lands on `/lookup?champion=Mordekaiser`.
(`/overview/matchups` and `/players/[id]/matchups` are older addresses of a player's own Matchups,
not Matchup Intel's; they still lead to All Champions.) All Champions' preview links an opened lane
opponent here: "Renekton's abilities in Champion Lookup →".

## Cooldowns

From Riot's Data Dragon alone (`src/domain/champion-lookup/cooldown.ts`, `ddragonCooldownDisplay`;
the rules were Matchup Intel's and carry over unchanged). Data Dragon gives one cooldown array per
ability slot. It is right for most abilities and misleading for some, so it is shown as the
cooldown only when it passes the guard; otherwise the row says why there is no number, in words, and
no number is made up. The rules, in order:

1. **The passive**: Data Dragon has no passive cooldown field, so "No cooldown in Riot's data",
   with "Riot's data gives passives no cooldown." under it, never "no cooldown".
2. **The exception list** (`NOT_THE_COOLDOWN`), each pinned to the array that was checked, so a
   different array is judged by the rules below: Rengar's Q, W and E (0.25 s, reported to Riot as
   wrong: "Riot's number for this ability is known to be wrong"); Corki's R, Teemo's R, Gangplank's E
   and Taric's Q (the wait between casts of an ability that holds charges: "Charges: recharge not in
   Riot's data"); Aphelios's Q ("Several abilities share this slot in Riot's data"); Zoe's W ("This
   slot casts spells picked up in a game").
3. **Charges** (`maxammo` above 0): the array is the wait between casts and the recharge is not in
   Riot's data: "Charges: recharge not in Riot's data", with "Riot's number is the wait between
   casts, not the time to regain a charge." Neither a number nor a count is shown.
4. **A value that is not a number of seconds**: "Riot's cooldown data can't be read".
5. **Two abilities in one slot** (a name with " / "): one array for the two forms of a champion who
   transforms (Jayce, Nidalee, Elise, Gnar, Rek'Sai) or the two parts of an ability cast again (Lee
   Sin, Ambessa's Q), which Data Dragon does not tell apart: "Two abilities share this slot in
   Riot's data", with "Riot's data doesn't say which one its cooldown is. Riot lists 10 / 9 / 8 /
   7 / 6 s for the slot." Riot's array is said as Riot's, for the slot, never as either ability's
   cooldown, and never with haste applied.
6. **An empty or all-zero array**: a placeholder, not "no cooldown": "No cooldown number in Riot's
   data".
7. **Not one number per rank**: "Riot's data doesn't give one number per rank".
8. **Everything else**: Riot's array, one number per rank.

At Data Dragon 16.22.1 (the offline fixture, 173 champions, 865 abilities) that is 623 abilities
with a cooldown per rank; 173 passives; 26 slots of two abilities, each with Riot's array listed
(Ambessa Q, Aurelion Sol R, Briar W, Elise Q W E, Fizz E, Gnar Q W E, Jayce Q W E R, Lee Sin Q W E,
Nidalee Q W E, Qiyana Q, Rek'Sai Q W E, Skarner Q, Sylas E); 22 with charges; 16 with no number
(among them Ashe's Q, Singed's Q, Twisted Fate's E, Vayne's W and Zeri's Q, whose effects are not on
a cooldown of their own); Rengar's three; Aphelios's Q; Zoe's W.

**How a cooldown is written.** Decimals as the number has them, up to four ("0.25"); the ranks in
columns with "Rank 1" over the first, or in a line "8 / 7 / 6 / 5 / 4 s" on a narrow row. Screen
readers hear "Rank 1: 8 seconds" for each.

## Haste

`src/domain/champion-lookup/haste.ts`. Riot's published rule (patch 10.23, 2020): **cooldown =
base × 100 / (100 + ability haste)**, to two decimals. The choice sits in the panel's header:
"Ability haste", the quick values 0, 10, 20, 30, 40, 50, 60, 80 and 100 as one press each (a group
of nine, five and four on a phone; 44px targets on touch screens), and "Other", a field for any
whole number from 0 to 300 (digits only; a larger number is held to 300 and says "Held to 300"; on
leaving the field it shows the value taken). Beside the label: "Base cooldowns" at 0, "Cooldowns
16.7% shorter" at 20 (100 × haste / (100 + haste)).

At 0 each ability shows its base line only. Above 0 the base line stays (quieter) and a second line,
"At 20 haste", gives the cooldown at that haste, in the main text weight. **The rule is applied
only to a cooldown that passed the guard** (`cooldownAtHaste` returns nothing for any other):
every row that says why it has no number adds "· no haste applied" above 0, and a slot of two
abilities keeps Riot's listed array as it is. Riot's data does not list the abilities the rule
does not apply to, so the page calls it Riot's general rule, never "checked". Ultimate haste (from
some runes and items, for R alone) is not counted, which the rule's line says. Summoner spells are
not on the page. Never a timer, a countdown or "ready at": only the cooldown's length (game
integrity, below).

Examples at Data Dragon 16.22.1: Ahri's Q, 7 s at every rank, is 5.83 s at 20 haste and 3.5 s at
100; Darius's R, 120 / 100 / 80 s, is 75 / 62.5 / 50 s at 60; Teemo's R says "Charges: recharge not
in Riot's data · no haste applied"; Lee Sin's Q says "Two abilities share this slot in Riot's data"
with "Riot lists 10 / 9 / 8 / 7 / 6 s for the slot."

## Descriptions

Each ability's short description is Riot's own text from Data Dragon, its markup removed
(`cleanDescription` in `src/server/riot/static/abilities.ts`; a description whose placeholders stood
for numbers is dropped rather than shown half-filled, and the row says "Riot's description isn't
shown: it relies on numbers Riot's data leaves out"; none at 16.22.1). Folded away by default so the
cooldowns stay on one screen: Descriptions in the toolbar (a toggle, `aria-pressed`) shows them all,
each under its ability's row; pressed again it hides them.

## Data

- **Where it comes from.** Each champion's abilities are read from Riot's Data Dragon by the
  version-check job once per game version and stored in `app_settings` ("champion_abilities",
  `src/server/riot/static/abilities.ts`; [DATA_PIPELINES.md](DATA_PIPELINES.md), "Champion
  abilities"): the passive and Q, W, E, R in that order, each with its name, icon, ranks, base
  cooldown array, `maxammo` and cleaned description. Where the server cannot reach Data Dragon (the
  champions came from the offline fixture, or a demo has none stored), the committed offline copy
  (Data Dragon 16.22.1, `src/server/riot/fixtures/champion-abilities.fixture.json`, built by
  `scripts/static/build-ability-fixture.mjs`) is stored instead, labelled as such, and the first
  real sync replaces it.
- **What the page reads.** The session, the cached roster and current patch, and the stored
  abilities of the one champion the address names (one statement, cached ten minutes): no player,
  no game, no Riot request (`src/server/champion-lookup/view.ts`).
- **What is stored and not shown.** Kept as they are, with no destructive migration, though no page
  reads them since Matchup Intel was retired:
  - each champion's Riot tips (`allytips`, `enemytips`) and each ability's text hash, inside the
    stored abilities (rules format 3; the hash still feeds the per-patch digests);
  - `account_match_prep` (Matchup Intel's evidence from the team's own games): nothing writes or
    reads it any more (the sync, the timeline backfill and a game's timeline no longer make its rows,
    and the by-hand `prep-backfill` job is gone); a row still goes with its game, and an erasure
    still deletes the rows of the games it de-identifies;
  - `riot_build_data` (items' shop facts, summoner spells' cooldowns, rune trees' slots), still
    stored once per version by the version-check job from the files it already downloads;
  - `static_digests`, still recorded once per patch, read by Admin's Data & Integrations and
    `/api/health` (counts only).

## Compliance

The app-wide checklist is [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), where Champion Lookup is item 9.

- **Data Dragon only.** Riot publishes it for third parties ("All of which can be used by
  third-party developers", League docs). Names, icons, ranks, base cooldowns and short descriptions,
  read once per game version, never while a page renders; icons and portraits are linked from
  Riot's CDN, never copied.
- **Static data, for a champion chosen by hand.** "Game overlays that provide static data that is
  available prior to the game" are an approved use; this is a web page with the same static data,
  the same before any game and on a second screen during one. Nothing comes from a game in progress
  or from champion select, nothing names a player.
- **No timers.** "Products must not use or incorporate information not present in the game client
  that would give players a competitive edge (e.g., … tracking enemy ultimate cooldowns)". Base values
  per rank and their value at a chosen haste only: no timer, countdown, "used" or "ready at", and
  nothing records when an ability was used (`words.test.ts` and the browser spec check the words).
- **Signed-in accounts only.** `/lookup` is not a public path (`src/proxy.ts`), the page calls
  `requirePageAccess` itself, and the Production check proves that a signed-out request, or one
  with a forged session cookie, is sent to sign-in ([LIVE_VALIDATION.md](LIVE_VALIDATION.md)).
- **Riot's notice** is in the sidebar ("Not endorsed by Riot Games" → Details) on every page, and in
  Admin's Health → Riot Games compliance.

## Tests

- Unit: `src/domain/champion-lookup/cooldown.test.ts` (the guard, rule by rule, and every ability of
  the fixture), `haste.test.ts` (the formula on every ordinary ability at every quick value and the
  maximum, never on a special case, the clamp), `view.test.ts` (the roster resolver, icons, patch
  names, a record's shape), `words.test.ts` (the words, no timer or "verified"),
  `src/components/champion-lookup/address.test.ts` (the address and the old links), `search.test.ts`,
  `recent.test.ts`; `src/server/riot/static/abilities.test.ts` (what is read from Data Dragon, the
  fixture and its build script).
- Database: `tests/db/champion-abilities.test.ts` (the sync and the per-champion reads).
- Browser: `e2e/champion-lookup.spec.ts` (search, keyboard, All champions, haste quick values and
  Other, the special cases, Descriptions, the address and the old links, one screen at 1440 × 900
  and 1920 × 1080, phones at 320 and 390 with 200% text, axe), with the shared specs (navigation,
  the label ladder, page budgets, quality, design parity, WebKit).
- Production check: `scripts/champion-lookup-facts.mjs` (LIVE_VALIDATION.md, "What it checks").

## For the owner

**The registration's description** (Riot's Developer Portal) still describes Matchup Intel, as the
owner updated it on 23 Nov 2026. Champion Lookup reads and shows less than Matchup Intel did (Data
Dragon's names, icons, base cooldowns and short descriptions only: no wiki notes, no facts from
Riot's text, no tips), so nothing new needs approving before it ships; but the description should
say what the product does now ("You must make sure its description and metadata are kept up to date
with the current version of your product", League docs). The owner's action at the next update: paste
the proposed description in RIOT_COMPLIANCE.md ("Proposed description for the registration"), whose
Champion Lookup part is, word for word (`src/server/riot/registration-description.test.ts` keeps the
two copies the same):

> Champion Lookup, for signed-in accounts, is a static reference for one champion chosen by hand: each ability's name, icon, short description and base cooldowns per rank from Data Dragon, and those cooldowns at an ability haste the reader chooses, by Riot's published formula. It makes no Riot API request and has no timers or tracking.
