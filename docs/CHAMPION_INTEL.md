# Champion Intel

"Rework the existing Champion Lookup feature into a more complete but intentionally simple
competitive reference tool" (the owner's request of 24 Nov 2026, Release 17). Champion Intel is
Champion Lookup renamed and extended: one champion, or two side by side, each with its five
abilities as folds, their costs and cooldowns at every rank, the cooldowns at that champion's own
ability haste, Riot's whole description of each ability, the mechanics those descriptions name, and
the champion's base statistics. Everything comes from Riot's Data Dragon; nothing is guessed. A
second-monitor reference during play. Champion Lookup (23 Nov 2026) replaced Matchup Intel
([MATCHUP_INTEL.md](MATCHUP_INTEL.md) says what was retired); `docs/CHAMPION_LOOKUP.md` is a pointer
here.

It is a destination of its own, for every signed-in account, still at `/lookup` (`CHAMPION_INTEL`
in `src/lib/nav.ts`: the sidebar, a tablet's top bar, the phone's bottom bar, the phone's bar held
sideways and the installed app's shortcuts, as "Champion Intel", or "Intel" where a bar has no room
for the whole name). The address did not change, so every link, bookmark and installed shortcut made
for Champion Lookup still opens it. It is not **Matchups**, a player's own games against a lane
opponent, which live in a champion's window under All Champions ([MATCHUPS.md](MATCHUPS.md)).

## The page

- **Title and source line.** "Champion Intel", and beside it what the numbers come from: "Riot Data
  Dragon 16.22.1 · patch 26.22" (the first champion's record), "· offline copy" where it is the
  committed offline copy, and "· the game is on patch 26.23" (in the warning colour) where the stored
  abilities are older than the game's patch. At the row's end, with one champion shown, a quiet
  **Add champion** (a text button with a plus, no box).
- **A champion's panel** (`champion-panel.tsx`), one surface:
  - **Header**: the champion's own splash art, faint (20%) along the header's right two thirds and
    fading into the panel (the convention of All Champions' pool rows: static, lazy, decoration
    only), under the portrait (48px), the name (which opens the window of every champion to change
    it: a chevron says so, "Ahri: change champion" is read out), Riot's title, the **haste field**
    and, on a second champion, **✕** to remove it. 70px tall on a desktop.
  - **Key mechanics** (below), then **base statistics**, folded (below).
  - **The five abilities**, Passive first, each a fold (below).
  - On one champion at a desktop's width (the panel 68rem wide) the key mechanics and the statistics
    take a 20rem column beside the abilities, so a wide screen is used without filler and the five
    abilities stay high on the screen; narrower (two champions, a tablet, a phone) the key mechanics
    sit above the abilities and the statistics after them.
- **Under the panels, once**: the haste rule ("At a haste: base × 100 / (100 + haste), Riot's general
  rule, applied only where Riot's data gives the cooldown. Ultimate haste isn't counted.") and what
  Riot's data does not hold ("Riot's published data has no damage values or scaling for abilities,
  so none are shown: a description names the damage type where Riot's words do."), said once, never
  per row and never as a zero.
- **Width.** One champion: `--content-max` (80rem). Two: `--content-wide` (100rem), so each panel
  keeps its ranks in columns on a large screen. Centred in the room beside the sidebar, open or
  folded, like every page.
- **Loading.** A champion chosen is built on the server: until it arrives its panel shows the new
  champion's name and portrait with a spinner, is dimmed and out of reach (`inert`), and a status line
  says "Loading Jinx…"; the other panel stays as it is. The route's `loading.tsx` takes the page's
  shape.

## Abilities

Each ability is one row and one fold (the shared `Fold`, `variant="row"`: a native `<details>`, so it
opens with Enter or Space, by find-in-page, and before the page's code runs).

- **Folded** (the quick reference): the icon (36px; the key as a plain tile where the icon is missing
  or fails), "Passive" or its key and its name; the **cost** where Riot's data supports one (below);
  the **cooldown at every rank**: the base and, at a haste above 0, the cooldown at that haste; or,
  where Riot's data gives no cooldown that passed the guard, why not ("Two abilities share this slot
  in Riot's data · no haste applied"). The fold's chevron at the row's end.
- **Opened**: Riot's whole description, the words that name each mechanic marked in it (an accent
  underline) and listed under it ("Named in it: Charm · Magic damage"); why a cooldown has no number,
  in full ("Riot's data doesn't say which one its cooldown is. Riot lists 10 / 9 / 8 / 7 / 6 s for the
  slot."); on a narrow row at a haste, the base cooldown ("Base cooldown 7 s at every rank"); and,
  where the sync knows it, what Riot changed in the last patch ("Riot changed this ability's text and
  cooldowns since patch 26.22. The numbers shown are the current ones."). A row opened grows the page;
  nothing scrolls inside it.
- **Layout.** Each row measures itself (`@container/ab`): from 42rem the name and cost have their own
  column and the ranks line up as columns under the "Ability · Cooldown, s · Rank 1 2 3 4 5" heading
  (the icon, the name's 8.5rem, the kind's 6rem label and 3.5rem a rank for the most ranks any ability
  here has, Udyr's six, the gaps and the chevron: 41.25rem); narrower, the cost follows the name on its
  line where it fits and the cooldown goes under the name as one line ("7 / 7 / 7 / 7 / 7 s"),
  wrapping between ranks only; at a haste above 0 the narrow row keeps the line at that haste ("At 20
  5.83 / … s") and the base moves into the opened row, so five rows fit a short screen.
- **Descriptions** are Riot's own words from Data Dragon, their markup removed (`cleanDescription`);
  since rules format 4 they are kept whole, up to 1,000 characters (none at 16.22.1 is longer; 8 were
  cut at 400 before, Aurelion Sol's R the longest). A description whose placeholders stood for numbers
  is dropped rather than shown half-filled, and the row says "Riot's description isn't shown: it
  relies on numbers Riot's data leaves out" (none at 16.22.1).
- **The tooltip is never shown.** Riot's tooltips hold the numbers (damage, durations), but as
  placeholders Data Dragon leaves unfilled: at 16.22.1 only 10 of the 692 tooltips have every
  placeholder filled by the ability's own Data Dragon values, and that counts `effectBurn`, which is
  stale for many abilities. Too few to show, and a partly filled one would present a guess, so damage
  values, scaling and durations are not on the page (the line under the panels says so once). The
  only third-party source that holds them in a machine-readable form, CommunityDragon's copy of the
  game files, is permitted by RIOT_COMPLIANCE.md for rank crests and role icons only; using it for
  numbers is an owner decision, not taken here. The wiki's terms forbid automated use.

## Cost

`src/domain/champion-lookup/cost.ts`. Each spell has a `cost` array and Riot's own resource line,
the words the game writes under an ability's name, with placeholders: "{{ cost }}
{{ abilityresourcename }}" (556 of 692 spells at 16.22.1), "No Cost" (93), "{{ healthcost }} Health"…
The cost array is the value of "{{ cost }}", the champion's resource the value of
"{{ abilityresourcename }}", so a cost is shown only where every placeholder of Riot's line is filled
from the ability's own data:

1. "No Cost": **No cost**, Riot's words.
2. The line above (or "{{ cost }} Mana"), a Mana or Energy champion, one number per rank: the cost per
   rank, "55 / 65 / 75 / 85 / 95 Mana", "30 Mana" where every rank is the same. Every rank 0 is a
   placeholder, never "free": nothing is shown (Aphelios's E, Kindred's E, Samira's R, Sivir's E,
   Tahm Kench's E at 16.22.1).
3. A line with no placeholder: Riot's words as they are ("Generates 1 Ferocity", "Requires 100 Dragon
   Fury", "1 Seed").
4. Anything else (a health cost, a cost per second, a placeholder Data Dragon does not fill): nothing.

At 16.22.1: 552 per rank, 93 no cost, 5 in Riot's words, 42 nothing (`cost.test.ts`).

**Range is not shown.** Data Dragon's `range` is a cast range for some abilities, an effect radius for
others, 25000 for self-casts and globals (129 rank values at 16.22.1), 0 or 20 for others (146); no
field tells which, and no line of Riot's names it, so no rule could be validated across the roster.

## Cooldowns

From Riot's Data Dragon alone (`src/domain/champion-lookup/cooldown.ts`, `ddragonCooldownDisplay`;
the rules were Matchup Intel's and carry over unchanged). Data Dragon gives one cooldown array per
ability slot. It is right for most abilities and misleading for some, so it is shown as the cooldown
only when it passes the guard; otherwise the row says why there is no number, in words, and no number
is made up. The rules, in order:

1. **The passive**: Data Dragon has no passive cooldown field, so "No cooldown in Riot's data", with
   "Riot's data gives passives no cooldown." in the opened row, never "no cooldown".
2. **The exception list** (`NOT_THE_COOLDOWN`), each pinned to the array that was checked: Rengar's Q,
   W and E (0.25 s, reported to Riot as wrong); Corki's R, Teemo's R, Gangplank's E and Taric's Q
   (charges: "Charges: recharge not in Riot's data"); Aphelios's Q ("Several abilities share this slot
   in Riot's data"); Zoe's W ("This slot casts spells picked up in a game").
3. **Charges** (`maxammo` above 0): "Charges: recharge not in Riot's data", with "Riot's number is the
   wait between casts, not the time to regain a charge." Neither a number nor a count is shown.
4. **A value that is not a number of seconds**: "Riot's cooldown data can't be read".
5. **Two abilities in one slot** (a name with " / "): the two forms of a champion who transforms
   (Jayce, Nidalee, Elise, Gnar, Rek'Sai) or the two parts of an ability cast again (Lee Sin, Ambessa's
   Q): "Two abilities share this slot in Riot's data", Riot's array said as Riot's for the slot,
   never hasted.
6. **An empty or all-zero array**: "No cooldown number in Riot's data".
7. **Not one number per rank**: "Riot's data doesn't give one number per rank".
8. **Everything else**: Riot's array, one number per rank.

At Data Dragon 16.22.1 (173 champions, 865 abilities): 623 with a cooldown per rank; 173 passives;
26 slots of two abilities; 22 with charges; 16 with no number; Rengar's three; Aphelios's Q; Zoe's W.
Screen readers hear "Rank 1: 8 seconds" for each rank.

## Haste

`src/domain/champion-lookup/haste.ts`. Riot's published rule (patch 10.23, 2020): **cooldown = base ×
100 / (100 + ability haste)**, to two decimals. Each champion has its own **haste field** in its
header (`haste-field.tsx`; the quick values and Other of Champion Lookup were removed at the owner's
request): "Haste" and a compact field, 0 by default, that changes the cooldowns as it is typed in;
under it "Base" at 0, "16.7% shorter" at 20.

- **Validation** (`readHasteField`): digits only, letters and spaces dropped ("4a5x" is 45, a paste of
  "20 haste" is 20); a fraction is cut to its whole part ("12.5" takes 12, "Whole numbers only"); a
  minus takes 0 ("Taken as 0"); more than 300 is held to 300 ("Held to 300"); empty is 0. On leaving
  the field it shows the value taken. The field selects its value when focused, so typing replaces it.
- A numeric keypad (`inputmode="numeric"`), "Haste: ability haste for Ahri, a whole number from 0 to
  300" read out, its note announced (`aria-live`), 44px tall with 16px text on touch screens and
  phones, 32px with a mouse.
- **The rule is applied only to a cooldown that passed the guard** (`cooldownAtHaste` returns nothing
  for any other): every row that says why it has no number adds "· no haste applied" above 0.
  Ultimate haste is not counted. Never a timer, a countdown or "ready at".

Examples at 16.22.1: Ahri's Q, 7 s at every rank, is 5.83 s at 20 haste and 3.5 s at 100; Darius's R,
120 / 100 / 80 s, is 75 / 62.5 / 50 s at 60; Teemo's R says "Charges: recharge not in Riot's data · no
haste applied".

## Key mechanics

`src/domain/champion-lookup/mechanics.ts`, `key-mechanics.tsx`. A compact block under the header:

- **Riot's facts for the champion**: its attack range (Data Dragon's `stats.attackrange`, "550"), its
  resource (`partype`: "Mana", "Energy", "Fury"…; "None" said as "None"; Bel'Veth's empty one left
  out), and Riot's classes (`tags`: "Mage · Assassin"). No "melee" or "ranged" word: Data Dragon has
  no such field, and the range alone misleads for the champions who change form (Jayce's, Nidalee's
  and Gnar's base ranges are their melee forms').
- **What Riot's descriptions name**, by group: crowd control (stun, root, knock up, knock back, pull,
  slow, silence, fear, charm, taunt, suppression, ground, polymorph, sleep, blind, disarm), mobility
  (dash, leap, blink, move speed), damage (physical, magic, true), sustain (heal, life steal),
  defence (shield, spell shield, untargetable, invulnerable, damage reduction, crowd control
  immunity, cleanse, stealth) and casting (recast, cooldown reset, toggle, form swap). Each kind with
  the keys of the abilities whose description names it; a key opens that ability's row, where Riot's
  sentence is marked. "From Riot's descriptions" says where they come from (its tip: "Named in Riot's
  own ability descriptions, found by fixed word rules: open an ability to read Riot's sentence.").
  No duration, no number, no judgement: a group the descriptions do not name is left out.

**The rules.** Fixed word patterns on each ability's stored description (`MECHANIC_RULES`), one fact
per kind and ability, each with Riot's sentence and the position of the words matched. The
exceptions the whole roster showed are rules too: an effect someone is freed from or immune to
("immune to all slowing effects", "removing all crowd control effects") is not that effect; nor its
trigger ("charges his roar by stunning"); nor crowd control on minions only ("fearing nearby enemy
minions"), on the champion itself ("roots herself", "knocks Caitlyn back"), or a state another effect
caused ("a stunned enemy"); "pulls back her orb" pulls no one; healing someone loses ("reduces their
self healing") is not a heal; "his shield" is an object, not a shield; damage a champion takes less of
("reducing incoming physical and magical damage") is not a damage type it deals. Charges come from
Riot's data (the guard), never from the word "charges" (Vi "charges forward"). Twenty-three matches
the sentence shows are not the effect are listed in `NOT_THE_MECHANIC` with why ("Taste Their Fear" is
Kha'Zix's passive's name; "Kalista teleports the Oathsworn ally": the ally moves), each pinned to the
hash of Riot's text, so the rules judge it again once Riot changes the text. The tooltip is not read.

**Measured** at 16.22.1 (`mechanics.test.ts`): 1,015 facts on 647 of the 865 abilities, at least one
for every champion. Against the facts Matchup Intel's review recorded from the same descriptions
(19 Nov 2026, automated reviewers, retired with it, not revived and not committed again): of the 673
facts it drew from descriptions in the kinds both name, the rules find 659 (98%); of the rules' matches
in those kinds, 42 are not in the review, every one read and judged supported by Riot's sentence (most
are another kind of movement: the review called Malphite's R a dash, the rules a leap). The damage
types and move speed are new kinds.

## Base statistics

`src/domain/champion-lookup/stats.ts`, `base-stats.tsx`. Folded ("Base statistics and growth per
level"): health, health regen per 5 s, mana or energy and its regen (only for a Mana or Energy
champion: other resources' `mp` is no pool, Viego's is 10000), attack damage, attack speed (its growth
a percentage of the base), armor, magic resist, attack range and move speed; each with Riot's growth
per level where it is above 0. Attack damage growth is 0 for all 173 champions at 16.22.1, which no
champion has in the game: a placeholder, so no growth is shown and the note says "Riot's data gives
attack damage no growth per level, so none is shown." A growth of 0 elsewhere (Thresh's armour, an
energy pool) shows no growth, never "+0". No value at a later level is computed. Critical strike is 0
for every champion and not listed.

## Changed this patch

`src/domain/champion-lookup/changes.ts`. When the version-check job reads a champion at a new game
version it compares the new record with the one it holds, and stores per ability whether Riot's text
(its hash), the base cooldowns or the cost changed, and whether the base stats did. The row shows a
quiet "· changed since 26.22" after the name and, opened, which of the three changed; the statistics
say "Riot changed these since patch 26.22". Only whether, never by how much: the numbers shown are the
new ones. Data Dragon cannot show a change Riot made without changing its data, so no mark means
"unchanged in Riot's data", not in the game. The marks first appear with the first game version after
rules format 4 is deployed (production holds 16.23.1, and reading it again at 16.23.1 has nothing
earlier to compare); the offline copy carries none.

**Ability max orders are not shown**: no permitted source holds them without collecting games
(Data Dragon has none; the retired Matchup Intel evidence and any global statistics collection are
out of scope by the owner's request).

## Two champions

The owner's bot-lane case: both opposing champions at once. One champion by default; **Add champion**
opens the window of every champion ("Add a champion") and adds the one chosen beside the first, at
haste 0, its name then focused. Each panel is the same component with its own haste, its own folds and
its own name to change it; **✕** ("Remove Jinx") removes the second at once, the focus back on the
first. Two panels sit side by side, equal, from a page 56rem wide (`@container/intel`: a desktop, the
sidebar open or folded); narrower (a tablet, a phone, a desktop window under about 1000px) a
**switcher** of the two champions (the shared segmented control, each with its portrait and name)
shows one full-width panel at a time. Both panels stay in the page, the other hidden, so each keeps
its haste and its open folds while the other is read. The same champion twice is allowed (two hastes
side by side). No role and no "your champion" is asked for.

## Choosing a champion

- **A champion's name** opens the window of every champion (`champion-picker.tsx`; a task dialog,
  DESIGN_SYSTEM.md §7: the whole screen on a phone, 42rem wider up, no history entry) with its own
  search (focused with a mouse), the Recent row (`recent.ts`: the champions this device showed lately,
  ids only, per account, never sent to the server) and every champion as a portrait grid. Enter takes
  the first match; the focus comes back to the name, or goes to the new champion's name once it has
  arrived.
- **"/"** anywhere on the page outside a field opens the window for the champion in view (a second
  monitor's quick reach).
- **With nothing chosen**: "Choose a champion", the search (`champion-search.tsx`: a WAI-ARIA
  combobox that finds any champion as typed, by name, by initials, "tf", or a reviewed nickname,
  "j4"; ↑/↓, Enter, Escape twice; 16px on phones), All champions, and the Recent row.

## Address

`/lookup?champion=<id>&haste=<n>&champion2=<id>&haste2=<n>` (`address.ts`, `intelHref`), so a reload,
a bookmark and a shared link open the same champions at the same hastes. A champion may be its Data
Dragon id or its name in any case, accents and punctuation ignored ("wukong" opens MonkeyKing); the
page writes each champion's own id back. One the roster lacks is left out with a line saying so,
never repeated back. A second champion with no first (or a first the roster lacks) becomes the first,
its haste with it. Each haste is a whole number from 0 to 300, held to 300 above it, 0 otherwise and
left out. All of it is the page's state, like a filter: a change replaces the address and adds no
history entry, so Back leaves the page in one step. A champion is built on the server
(`router.replace`); a haste changes the numbers at once and only rewrites the address
(`history.replaceState`), with no request.

**Old links.** Matchup Intel's address, `/resources/matchups` with any of its parameters, redirects
here (HTTP 308, `src/proxy.ts`) carrying one champion: the enemy (`vs`) where it names one, else your
champion, else the bot lane's other enemy, else your duo partner (`legacyMatchupRedirect`).
`/resources/matchups?champion=Riven&vs=Mordekaiser` lands on `/lookup?champion=Mordekaiser`. All
Champions' preview links an opened lane opponent here: "Renekton's abilities in Champion Intel →".

## Fit and measurements

Measured on 24 Nov 2026 with the demo build, Data Dragon 16.22.1, 100% text (`e2e/champion-lookup.spec.ts`
holds each; screenshots before and after in the lane's notes, never in the repository):

- **One screen, folded**: the header, the haste and the five ability rows of every panel shown are on
  the first screen at 1280 × 720, 1440 × 900, 1440 × 780, 1920 × 1080, 1920 × 950, 2560 × 1440 and
  3440 × 1440, the sidebar open and folded, with one champion (Ahri at 100 haste, Udyr's six ranks,
  Aphelios at 300) and two (Ahri and Jinx at 20, Udyr and Lee Sin at 40, Teemo and Jayce, whose four
  two-ability slots are the longest rows). At 1280 × 720 with Ahri and Jinx at 20 the last row ends at
  674px; with one champion at 1440 × 900, 441–457px.
- **Nothing scrolls inside the page** at any size, every row open included; nothing is wider than the
  window from 320px up, at 200% text too (phones at 320, 375, 390 and 430).
- **Phones and a tablet** (768 × 1024): two champions under the switcher, one panel at a time; on a
  phone the page scrolls, as every phone page does.
- **Centred** in the room beside the sidebar, open or folded, within 2px.

## Data

- **Where it comes from.** Each champion's record is read from Riot's Data Dragon by the version-check
  job once per game version and stored in `app_settings` ("champion_abilities",
  `src/server/riot/static/abilities.ts`; [DATA_PIPELINES.md](DATA_PIPELINES.md), "Champion
  abilities"): the passive and Q, W, E, R, each with its name, icon, ranks, base cooldown array,
  `maxammo`, description, text hash, and (rules format 4) each spell's `cost` and Riot's `resource`
  line, the champion's `partype`, `tags` and `stats`, and the patch marks. Where the server cannot
  reach Data Dragon, the committed offline copy (Data Dragon 16.22.1,
  `src/server/riot/fixtures/champion-abilities.fixture.json`, built by
  `scripts/static/build-ability-fixture.mjs`, which can still download it:
  `node scripts/static/build-ability-fixture.mjs --version 16.22.1`) is stored instead, labelled as
  such, and the first real sync replaces it. Rules format 4 makes the next version-check read all 173
  champions again; nothing else is needed (no migration).
- **What the page reads.** The session, the cached roster and current patch, and the stored records
  of the one or two champions the address names (one statement, cached ten minutes): no player, no
  game, no Riot request (`src/server/champion-lookup/view.ts`).
- **What is stored and not shown.** Kept as they are, with no destructive migration, though no page
  reads them since Matchup Intel was retired:
  - each champion's Riot tips (`allytips`, `enemytips`), inside the stored abilities;
  - `account_match_prep` (Matchup Intel's evidence from the team's own games): nothing writes or
    reads it any more; a row still goes with its game, and an erasure still deletes the rows of the
    games it de-identifies;
  - `riot_build_data` (items' shop facts, summoner spells' cooldowns, rune trees' slots);
  - `static_digests`, recorded once per patch, read by Admin's Data & Integrations and `/api/health`
    (counts only).

## Compliance

The app-wide checklist is [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), where Champion Intel is item 9.

- **Data Dragon only.** Riot publishes it for third parties ("All of which can be used by
  third-party developers", League docs). Names, icons, ranks, base cooldowns, costs, descriptions,
  base statistics, resource and classes, read once per game version, never while a page renders;
  icons, portraits and splash art are linked from Riot's CDN, never copied. No wiki, no
  CommunityDragon numbers, no new source.
- **Static data, for champions chosen by hand.** "Game overlays that provide static data that is
  available prior to the game" are an approved use; this is a web page with the same static data, the
  same before any game and on a second screen during one. Nothing comes from a game in progress or
  from champion select, nothing names a player, and two champions side by side are two references,
  never a verdict on a matchup.
- **No timers.** Base values per rank and their value at a chosen haste only: no timer, countdown,
  "used" or "ready at", and nothing records when an ability was used (`words.test.ts` and the browser
  spec check the words). No advice, ranking or matchup verdict.
- **Signed-in accounts only.** `/lookup` is not a public path (`src/proxy.ts`), the page calls
  `requirePageAccess` itself, and the Production check proves that a signed-out request, or one with
  a forged session cookie, is sent to sign-in ([LIVE_VALIDATION.md](LIVE_VALIDATION.md)).
- **Riot's notice** is in the sidebar ("Not endorsed by Riot Games" → Details) on every page, and in
  Admin's Health → Riot Games compliance.

## Tests

- Unit: `src/domain/champion-lookup/cooldown.test.ts` (the guard, every ability of the fixture),
  `haste.test.ts` (the formula at every haste from 0 to 300 on every ordinary ability, never on a
  special case, the clamp, the field's validation), `cost.test.ts` (the cost rule on all 692 spells),
  `stats.test.ts` (the statistics of all 173 champions, the placeholder growth), `mechanics.test.ts`
  (the rules on all 865 descriptions, the hard cases both ways, the exceptions pinned), `changes.test.ts`
  (the patch marks), `view.test.ts`, `words.test.ts` (no timer or "verified"),
  `src/components/champion-lookup/address.test.ts` (both champions in the address, the old links),
  `search.test.ts`; `src/server/riot/static/abilities.test.ts` (what is read from Data Dragon, the
  fixture against Data Dragon's own numbers, the build script).
- Database: `tests/db/champion-abilities.test.ts` (the sync, the per-champion reads, the patch marks).
- Browser: `e2e/champion-lookup.spec.ts` (the page, the key mechanics opening their ability, folds by
  keyboard, the haste field and every invalid input, the special cases, unusual champions, "/" and the
  search, the window, two champions, the address, the switcher, the old links, one screen at every
  desktop size single and dual, the ranks' columns, phones at 200% text, axe), with the shared specs
  (navigation, the label ladder, journeys, page budgets, quality, design parity, WebKit).
- Production check: `scripts/champion-lookup-facts.mjs` (LIVE_VALIDATION.md, "What it checks").

## For the owner

**The registration's description** (Riot's Developer Portal) still describes Matchup Intel. Champion
Intel shows less than Matchup Intel did (no wiki notes, no reviewed facts, no tips, no evidence from
the team's games; its mechanics are Riot's own descriptions with Riot's sentence beside each), so
nothing new needs approving before it ships; but the description should say what the product does
now. The owner's action at the next update: paste the proposed description in RIOT_COMPLIANCE.md
("Proposed description for the registration"), whose Champion Intel part is, word for word
(`src/server/riot/registration-description.test.ts` keeps the two copies the same):

> Champion Intel, for signed-in accounts, is a static reference for one or two champions chosen by hand: each ability's name, icon, description, cost and base cooldowns per rank from Data Dragon, those cooldowns at an ability haste the reader chooses, by Riot's published formula, each champion's base statistics from Data Dragon, and the mechanics its ability descriptions name, with Riot's sentence for each. It makes no Riot API request and has no timers or tracking.

**Decisions left to the owner**: whether damage values, scaling and durations should come from a
source beyond Data Dragon (CommunityDragon's game files hold them; RIOT_COMPLIANCE.md permits that
source for rank crests and role icons only); and whether the canonical address should become `/intel`
(it stays `/lookup`, so nothing that links to it changes).
