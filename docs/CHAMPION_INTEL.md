# Champion Intel

"Rework the existing Champion Lookup feature into a more complete but intentionally simple
competitive reference tool" (the owner's request of 24 Nov 2026, Release 17), refined on 25 Nov 2026
into "a premium, practical gameplay reference understood in seconds". Champion Intel is Champion
Lookup renamed and extended: one champion, or two compared on one aligned board, each with its
five abilities as rows on one grid of rank columns (cooldowns and costs per rank, the cooldowns at
that champion's own ability haste), the mechanics Riot's descriptions name as chips on each row,
Riot's whole description of each ability behind its row, the champion's facts and its base
statistics, all from Riot's Data Dragon; and, for members who may see teammates' statistics, the
**builds and runes** players chose on it in the team's stored matches (25 Nov 2026, below), as
totals with their win and pick rates. Nothing is guessed. A second-monitor reference during play. Champion Lookup (23 Nov 2026) replaced Matchup Intel
([MATCHUP_INTEL.md](MATCHUP_INTEL.md) says what was retired); `docs/CHAMPION_LOOKUP.md` is a pointer
here.

It is a destination of its own, for every signed-in account, still at `/lookup` (`CHAMPION_INTEL`
in `src/lib/nav.ts`: the sidebar, a tablet's top bar, the phone's bottom bar, the phone's bar held
sideways and the installed app's shortcuts, as "Champion Intel", or "Intel" where a bar has no room
for the whole name). The address did not change, so every link, bookmark and installed shortcut made
for Champion Lookup still opens it. It is not **Matchups**, a player's own games against a lane
opponent, which live in a champion's window under All Champions ([MATCHUPS.md](MATCHUPS.md)).

## The page

The owner's request of 25 Nov 2026 ("feels too much like a technical data table; names clip;
hierarchy needs work") reshaped the page into one board (`lookup-view.tsx`, `champion-panel.tsx`,
`ability-list.tsx`):

- **Title row.** "Champion Intel", and beside it what the numbers come from: "Riot Data Dragon
  16.22.1 · patch 26.22" (the first champion's record), "· offline copy" where it is the committed
  offline copy, and "· the game is on patch 26.23" (in the warning colour) where the stored abilities
  are older than the game's patch. At the row's end **Compare** (one champion) or **Swap** (two), in
  the toolbar button's look.
- **The board**, one surface (no box inside it). One champion's column (`ChampionPanel`, a
  `<section data-testid="lookup-panel">`):
  - **Header**: the portrait (48px), the **name** (text-xl, the primary colour; it opens the window
    of every champion to change it: a chevron says so, "Ahri: change champion" is read out), Riot's
    title under it (secondary), the champion's **facts** (below), and its **Ability haste** field
    with the rule in its ⓘ. The champion's splash art, faint (15%), fades in from the header's right
    (decoration only, approved on 24 Nov 2026, dimmer since 25 Nov). The name is never cut,
    abbreviated or broken: the name block takes the width the name needs (`flex-none`), so it stays
    on one line at every desktop width ("Nunu & Willump", "Aurelion Sol", "Renata Glasc"), and wraps
    between words only where the header itself is narrower than the name (a phone at a large text
    size, where the portrait moves above it). Words break inside only where one word is wider than
    the whole line (`break-words`, never `overflow-wrap: anywhere`, never `truncate` or a line clamp).
  - **Facts**, once, as label and value pairs: "Attack range 550 · Resource Mana · Classes Mage ·
    Assassin" (sentence-case labels in the secondary colour, values in the primary; Data Dragon's
    `stats.attackrange`, `partype`, `tags`). No "melee" or "ranged" word (no such field; Jayce's,
    Nidalee's and Gnar's base ranges are their melee forms').
  - **Abilities**: their heading ("Abilities" with the ⓘ for what Riot's data holds, and over the rank
    columns "Cooldown (s)" and each rank's number), then the five rows (below).
  - **Beside the abilities** where the board is 64rem wide (a desktop; 24rem from 76rem): the
    **base statistics**, open. Narrower (a tablet, a phone), after the abilities, folded.
  - **Builds and runes** across the board's whole width, under the abilities and the statistics
    (below), so their rows have the room to sit side by side and the page stays on one screen.
- **Width.** One champion: `--content-max` (80rem). Two: `--content-wide` (100rem). Centred in the
  room beside the sidebar, open or folded, like every page.
- **Loading.** A champion chosen is built on the server: until it arrives its column shows the new
  champion's name and portrait with a spinner, is dimmed and out of reach (`inert`), and a status line
  says "Loading Jinx…"; the other column stays as it is. The route's `loading.tsx` takes the board's
  shape.
- **What is gone** (25 Nov 2026): the "PASSIVE/Q/W/E/R" label before every name and the 10px key on
  the icon (one key tile now), the grouped key mechanics block (the chips replace it, a duplicate),
  the "Named in it" list in an opened row (the chips again), attack range among the statistics (the
  facts say it), the two lines under the panels (now the two ⓘ), "Base" under a haste field at 0, the
  phone's switcher of two champions, and the uppercase tracked labels ("HASTE", "ATTACK RANGE",
  "CROWD CONTROL", "COOLDOWN, S", "RECENT").

## Abilities

Each ability is one row and one fold (the shared `Fold`, `variant="row"`: a native `<details>`, so it
opens with Enter or Space, by find-in-page, and before the page's code runs).

- **Folded** (the quick reference), one grid of rank columns for the five rows:
  - the slot's **key tile** (P, Q, W, E, R; `SlotKey`, 28px, the primary colour) beside the icon (36px;
    the key as a plain tile where the icon is missing or fails); a screen reader hears "Q: Orb of
    Deception" (the slot name is in the heading, the tile is drawn);
  - the ability's **name** (text-md semibold, the primary colour) and the **chips** of what Riot's
    description names (below), crowd control first, then "Changed since 26.22" where it is known;
  - the **cooldown at every rank** in aligned rank columns (tabular figures, the primary colour,
    semibold): at a haste above 0 the cooldown at that haste is *the* cooldown, and the base sits
    under each value, smaller and secondary, labelled "base"; at 0 the base alone;
  - the **cost at every rank** on the same grid (secondary), labelled with the champion's resource
    ("Mana", "Energy"), or Riot's words ("No cost", "Generates 1 Ferocity");
  - where Riot's data gives no cooldown that passed the guard, why not, in words, across the grid
    ("Two abilities share this slot in Riot's data · no haste applied"); a **passive**, whose cooldown
    Data Dragon never gives, has a quiet "—" in its first rank column instead of the sentence on
    every passive, its words ("No cooldown in Riot's data") for a screen reader and its why in the
    abilities' ⓘ.
  The fold's chevron at the row's end.
- **Opened**: Riot's whole description (the primary colour), the words behind each chip marked in it
  (an accent underline); why a cooldown has no number, in full ("Riot's data doesn't say which one its
  cooldown is. Riot lists 10 / 9 / 8 / 7 / 6 s for the slot."); and, where the sync knows it, what Riot
  changed in the last patch ("Riot changed this ability's text and cooldowns since patch 26.22. The
  numbers shown are the current ones."). A row opened grows the page; nothing scrolls inside it.
- **Layout.** The rank grid is a 3rem label column and one 3.25rem column per rank (4rem on a wide
  row), as many as the champion's abilities have at most (`rankColumns` in
  `src/domain/champion-lookup/board.ts`: five, six for Udyr's and Jayce's basic abilities), the
  same in every row of that champion and in the heading, so rank n always sits in the same place.
  Each row measures itself (`@container/cell`) and takes one of three forms, the same in every row
  of a column:
  - **wide** (a desktop): the grid at the row's top right, the name and chips beside it and, where
    long, under it (the grid floats), so a long name or many chips use the row's whole width;
  - **stacked** (a narrower column): the name and chips, the grid under them at the right;
  - **line** (a phone, a narrow Compare column): one line per kind, "13 / 12 / 11 / 10 / 9 s", "base
    16 / 15 / 14 / 13 / 12 s", "Mana 60 / 65 / 70 / 75 / 80", wrapping between ranks only; a Compare
    column under 11rem leaves the icon out (the slot's key is in the board's own column), and one
    champion's row under 14rem (a small phone at a large text size) puts the name and values under
    the key and the icon.
- **Descriptions** are Riot's own words from Data Dragon, their markup removed (`cleanDescription`);
  since rules format 4 they are kept whole, up to 1,000 characters (none at 16.22.1 is longer; 8 were
  cut at 400 before, Aurelion Sol's R the longest). A description whose placeholders stood for numbers
  is dropped rather than shown half-filled, and the row says "Riot's description isn't shown: it
  relies on numbers Riot's data leaves out" (none at 16.22.1).
- **The tooltip is never shown.** Riot's tooltips hold the numbers (damage, durations), but as
  placeholders Data Dragon leaves unfilled: at 16.22.1 only 10 of the 692 tooltips have every
  placeholder filled by the ability's own Data Dragon values, and that counts `effectBurn`, which is
  stale for many abilities. Too few to show, and a partly filled one would present a guess, so damage
  values, scaling and durations are not on the page (the abilities' ⓘ says so). The only third-party
  source that holds them in a machine-readable form, CommunityDragon's copy of the game files, is
  permitted by RIOT_COMPLIANCE.md for rank crests and role icons only; using it for numbers is an
  owner decision, not taken here. The wiki's terms forbid automated use.
- **Per-ability range is not shown** (owner decision recorded 25 Nov 2026, below and in "For the
  owner"): the owner's request lists "range"; only the champion's attack range is honest (Cost,
  below).

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

**Per-ability range is not shown.** Data Dragon's `range` is a cast range for some abilities, an
effect radius for others, 25000 for self-casts and globals (129 rank values at 16.22.1), 0 or 20 for
others (146); no field tells which, and no line of Riot's names it, so no rule could be validated
across the roster, and it is not stored (rules format 4). The page shows the champion's attack range
once, in its facts. Showing ability ranges would need the owner's decision and a new reviewed rule
(`ABILITY_RULES_FORMAT` 5, a fixture rebuild and a roster-wide rule like the cost rule).

## Cooldowns

From Riot's Data Dragon alone (`src/domain/champion-lookup/cooldown.ts`, `ddragonCooldownDisplay`;
the rules were Matchup Intel's and carry over unchanged). Data Dragon gives one cooldown array per
ability slot. It is right for most abilities and misleading for some, so it is shown as the cooldown
only when it passes the guard; otherwise the row says why there is no number, in words, and no number
is made up. The rules, in order:

1. **The passive**: Data Dragon has no passive cooldown field, so "No cooldown in Riot's data", never
   "no cooldown". The opened row does not repeat it (it said "Riot's data gives passives no cooldown."
   until the Release 17 review).
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
100 / (100 + ability haste)**, to two decimals (5.83 s, 116.67 s): the precision this page has
documented and tested since it first applied a haste, kept at the Release 17 review, which noted
"116.67 / 100 / 83.33 s". Each champion has its own **haste field** in its
header (`haste-field.tsx`; the quick values and Other of Champion Lookup were removed at the owner's
request): "Ability haste" (sentence case, said once per champion) and a compact field, 0 by default,
that changes the cooldowns as it is typed in; the rule in the ⓘ beside it ("Cooldowns at a haste use
Riot's rule: base × 100 / (100 + haste). It applies only where Riot's data gives a cooldown. Ultimate
haste isn't counted.", `HASTE_RULE_WORDS`); at a haste above 0, "16.7% shorter" after it (one
champion; in Compare it is said to a screen reader only, the base line under each value saying it).
At 0 nothing more (the "Base" under the field was noise and went on 25 Nov 2026).

- **Validation** (`readHasteField`): the field takes a whole number from 0 to 300 written in digits;
  spaces around it are ignored (" 7 " is 7, "045" is 45) and an empty field is 0. More than 300 is
  held to 300 ("Held to 300"). Anything else is **not taken**: a number with a point ("12.5", "Whole
  numbers only") and anything that is not digits alone ("-20", "+5", "1e3", "4a5x", a pasted "20
  haste": "Digits only") leave the cooldowns at the haste already in use, so no number the reader
  did not type is applied. The text stays as typed while the field is in use; whenever it is held or
  not taken, the note says so and the field is `aria-invalid` until the next edit. On leaving the
  field it shows the haste in use. The field selects its value when focused, so typing replaces it.
  Until the Release 17 review, letters were dropped as typed and a minus took 0, so "-20" typed key
  by key read "020" and took 20, and "1e3" took 13.
- A numeric keypad (`inputmode="numeric"`), "Ability haste: ability haste for Ahri, a whole number from 0 to
  300" read out, its note announced (`aria-live`), 44px tall with 16px text on touch screens and
  phones, 32px with a mouse.
- **The rule is applied only to a cooldown that passed the guard** (`cooldownAtHaste` returns nothing
  for any other): every row that says why it has no number adds "· no haste applied" above 0 (a
  passive's dash needs no such words).
  Ultimate haste is not counted. Never a timer, a countdown or "ready at".

Examples at 16.22.1: Ahri's Q, 7 s at every rank, is 5.83 s at 20 haste and 3.5 s at 100; Darius's R,
120 / 100 / 80 s, is 75 / 62.5 / 50 s at 60; Teemo's R says "Charges: recharge not in Riot's data · no
haste applied".

## Mechanics (the rows' chips)

`src/domain/champion-lookup/mechanics.ts`, `mechanicChips` in `board.ts`. Each ability's row carries
chips for the kinds of mechanic Riot's description of it names, crowd control first (in the warning
tone: the one group a player reacts to), then mobility, damage (said "Magic damage", "Physical
damage", "True damage"), sustain, defence and how it is cast (neutral chips). The word is the chip,
never the colour alone; no duration, no number, no judgement. Opened, the row's description marks the
words each chip comes from. Where the descriptions name none, the row has no chips. The abilities' ⓘ
says where they come from ("Mechanics are named from the words of Riot's descriptions. Riot's data
has no damage values or scaling, and no cooldown for passives (—).", `DATA_LIMIT_WORDS`). The
grouped block under the header (each kind with the keys of its abilities) was removed on 25 Nov 2026:
it repeated the chips.

The kinds: crowd control (stun, root, knock up, knock back, pull, slow, silence, fear, charm, taunt,
suppression, ground, polymorph, sleep, blind, disarm), mobility (dash, leap, blink, move speed),
damage (physical, magic, true), sustain (heal, life steal), defence (shield, spell shield,
untargetable, invulnerable, damage reduction, crowd control immunity, cleanse, stealth) and casting
(recast, cooldown reset, toggle, form swap).

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
for every champion (1.17 chips a row on average, at most 6). Against the facts Matchup Intel's review
recorded from the same descriptions (19 Nov 2026, automated reviewers, retired with it, not revived
and not committed again): of the 673 facts it drew from descriptions in the kinds both name, the
rules find 659 (98%); of the rules' matches in those kinds, 42 are not in the review, every one read
and judged supported by Riot's sentence (most are another kind of movement: the review called
Malphite's R a dash, the rules a leap). The damage types and move speed are new kinds.

## Base statistics

`src/domain/champion-lookup/stats.ts`, `base-stats.tsx`. One small table, "Base stats": each
statistic, its value at "Level 1" (primary) and its growth "Per level" (secondary), Riot's numbers:
health, health regen per 5 s, mana or energy and its regen (only for a Mana or Energy champion: other
resources' `mp` is no pool, Viego's is 10000), attack damage, attack speed (its growth a percentage of
the base), armor, magic resist and move speed. Attack range is not listed: the champion's facts say
it once (`listedStats`). A growth above 0 only: attack damage growth is 0 for all 173 champions at
16.22.1, which no champion has in the game, a placeholder, so no growth is shown; a growth of 0
elsewhere (Thresh's armour, an energy pool) shows none, never "+0". No value at a later level is
computed. Critical strike is 0 for every champion and not listed. The ⓘ: "Riot's numbers at level 1
and per level; attack speed grows by a share of its base." and, where it applies, "Attack damage has
no growth in Riot's data." (`statsTipWords`); "Changed since 26.22" beside the heading where Riot
changed them. Open beside the abilities on a desktop; a fold after them narrower; in Compare one fold
per column on the same rows (`alignedStats`: a statistic only one champion has, mana beside Garen's
none, gets "—" in the other's), the two opening and closing together.

## Changed this patch

`src/domain/champion-lookup/changes.ts`. When the version-check job reads a champion at a new game
version it compares the new record with the one it holds, and stores per ability whether Riot's text
(its hash), the base cooldowns or the cost changed, and whether the base stats did. The row shows
"Changed since 26.22" after the name and chips and, opened, which of the three changed; the statistics
say "Changed since 26.22" beside their heading. Only whether, never by how much: the numbers shown are the
new ones. Data Dragon cannot show a change Riot made without changing its data, so no mark means
"unchanged in Riot's data", not in the game. The marks first appear with the first game version after
rules format 4 is deployed (production holds 16.23.1, and reading it again at 16.23.1 has nothing
earlier to compare); the offline copy carries none.

**Skill max orders** are counted from the team's stored games and shown with the builds (below):
Data Dragon has none. A global collection of games stays out of scope (OD4, "For the owner").

## Compare

The owner's bot-lane case, and their request of 25 Nov 2026 ("Optional Compare"): one champion by
default; **Compare** (the title row's button, `lookup-add`; Add champion until 25 Nov 2026) opens the
window of every champion ("Compare with") and adds the one chosen as a second column, at haste 0, its
name then focused. No compare is forced, and it is no destination of its own.

- **One aligned board.** A narrow first column holds each ability row's slot key (P to R), then the
  two champions' columns, each a `<section data-testid="lookup-panel">` that is a CSS subgrid of the
  board's ten rows: the header, the facts, the abilities' heading, P, Q, W, E, R, the builds row and
  the base statistics. The same row of both champions therefore has the same height and top, with no
  script measuring anything: their cooldowns by rank (each at its own champion's haste), costs, chips,
  facts and statistics line up side by side. A row opened in one column grows that row in both
  (the other cell keeps the space empty), and the columns stay level.
- **Each champion its own haste** (its header's field, `haste` and `haste2` in the address), its
  own folds, and its own builds row (its role, `role` and `role2` in the address, and its view of
  choices).
- **Swap** (the title row, "Swap Ahri and Jinx") exchanges the two: each keeps its haste and its open
  rows (the columns are keyed by champion, so the browser moves them), shown at once while the
  address catches up. **Change** either from its name. **✕** on either column removes it: removing the
  first makes the second the first, its haste with it (`withoutHref`, `swappedHref` in `address.ts`);
  the focus goes to the champion that stays. The same champion twice is allowed (two hastes).
- **Neutral.** Two references, never a verdict: no colour or word says which value is better, no
  difference is computed, nothing is "faster" (RIOT_COMPLIANCE.md item 9; the browser spec checks the
  words).
- **Every width.** From a phone up both champions sit side by side in every row (a phone's columns
  use the line form, values wrapping between ranks; the portrait above the name, the name a size
  smaller; ✕ in the column's corner); only where the board is under 17rem (a small phone at 150–200%
  text) the two columns stack, each with its own slot keys. Never wider than the screen, nothing
  scrolling inside. Every control a 44px target on a touch screen.

## Builds and runes

The owner's request of 25 Nov 2026 ("Recommended builds and runes": a compact, patch-aware
section; the most reliable combination by default, never the highest raw win rate on a tiny
sample; Standard and Highest-performing apart, one where they are effectively the same; the
sample, patch, rank and queue filters and the data source said). What players chose on the
champion in the team's stored matches, counted in the database and shown as compact icon rows
(`champion-builds.tsx`; rules in `src/domain/champion-builds.ts`, words in
`src/domain/champion-builds-words.ts`, the counts in `src/server/champion-builds/`).

**The source.** Legitimate sources were checked first: Data Dragon is static (no usage figures);
Riot's API has no aggregate statistics; reading OP.GG, U.GG and the like is forbidden
(RIOT_COMPLIANCE.md). So: the stored match records (`match_details.participants`, all ten players)
and timelines (`match_timelines.participants`: purchases in order, sales, skill level-ups) of
**Summoner's Rift draft games** (Normal Draft, Ranked Solo/Duo, Ranked Flex, Clash: queues 400,
420, 440, 700; Swiftplay and Quickplay run a faster economy, Blind Pick is not drafted) that a
**current team member played** (an `account_matches` row of a linked account of a team member's
profile that is not archived: a personal-use or archived profile's own games never count), remakes
and broken durations left out (5 minutes to 4 hours), every player on the champion on **both
teams**, by Riot's position, an erased player never. `account_match_prep` is not the source (the
retired Matchup Intel's members-only rows, about 55% complete and frozen since 23 Nov 2026); its
rules were reused, written afresh.

**The patch.** The game's current patch (the stored static data's); where the champion has fewer
than 20 games in a role on it, the previous patch is added and the source line says so ("patches
26.21–26.22", in the warning colour, its ⓘ giving both counts). Never across a season; never an
older patch alone: with fewer than 20 games on the two together the section is one honest line,
"Not enough games on patch 26.22 in the team's matches yet" (its ⓘ: how many there are, and that
builds show from 20 in one role).

**The parts** (each counts its own games, said in its row's ⓘ):

| Part | From | Counted as |
|---|---|---|
| Runes | every record kept from 14 Oct 2026 (the full page) | the primary tree's keystone and three runes, the secondary tree and its two |
| Stat shards | records kept from 20 Nov 2026 | the three, named by their row ("Offense shard", "Flex shard", "Defense shard": Data Dragon has icons but no names) |
| Summoner spells | every record | the pair, either order |
| Skill order | games with the player's timeline | the skills in the order they reached **their own last rank** (each ability's Data Dragon `maxrank`: Aphelios's six, Udyr's R levelled like the others), then the rest by points; a game where two unmaxed skills have as many points, or nothing is maxed, is left out; with the first three points beside it |
| Starting items | timelines | bought in the first minute, less what was sold in it (timelines kept from 20 Nov 2026 hold sales) |
| Boots | timelines | the first boots of the second tier bought (Gunmetal Greaves, which has no Boots tag, counts as boots), or "No boots" for a game that completed three items without any |
| Core items | timelines | the first three **completed** items, in the order bought: purchasable, 1,000 gold or more, not boots, a consumable or a trinket, and building into nothing a player can buy (so Manamune, Archangel's Staff, Winter's Approach and Whispering Circlet count when bought, as they only turn into Muramana, Seraph's Embrace, Fimbulwinter and Diadem of Songs) |
| Full build | timelines | the most common core, then the item most often bought fourth after it and the one most often bought fifth, each common enough on its own; a composition, so its ⓘ gives each later item's share instead of a win rate |

A game whose timeline holds an item the current static data does not know is left out of the item
parts (an old item is never skipped over, which would shift the order). The items' rules read
`riot_build_data` (Data Dragon's shop facts, current version), unread since Matchup Intel.

**The choices.**

- **Near-identical builds are one choice**: the same three core items in another order (shown in
  their most common order), the same keystone and secondary tree with other minor runes (shown as
  its most common page), the same skill order with other first points.
- **Most common** (the default, the Standard build): the choice made in the most games among those
  made in at least 10 games and a tenth of the part's games.
- **Highest win rate** (the Highest-performing build): among choices made in at least 20 games and
  15% of the part's games, the one with the best **95% Wilson lower bound** of its win rate (the
  rate a few lucky games cannot lift), shown only where it is another choice, its bound higher and its
  win rate at least 2 points above the most common's. Where any part has one, a two-way switch ("Most
  common", "Highest win rate") shows those, the rows that differ marked with a dot; where none does,
  the switch is not there and one build is shown. A small sample never wins.
- A part with fewer than 20 games recorded says "Too few recorded yet (12 games)"; one whose
  choices are all rarer than the threshold, "No common choice in 31 games". Nothing is filled in.

**On the page.**

- Title "Builds and runes", the role (its icon and name; a switch where the champion has 20 games
  or more in more than one role, the most played on the current patch first and the default; the
  role chosen joins the address as `role` or `role2`, left out for the default, and a role the
  champion has too few games in opens the default), and, where a part has a choice that wins
  clearly more, the switch of the two views.
- The source line, "From 143 games in the team's matches · patch 26.22 · all ranks · Draft and
  Ranked", each part its own ⓘ: the games (runes and spells from all of them; items and skills from
  those with a timeline; how many are the team's own), the data source ("Counted from the games of
  the team's stored matches (both teams). Not a global sample of League players."), the patch, the
  rank ("Riot's game records hold no rank, so these games are not filtered by rank": other players'
  ranks are kept only as the latest reading, so a rank filter would drop and misdate most games) and
  the queues.
- Two groups of rows (runes, stat shards, summoner spells, skill order; starting items, boots, core
  items, full build), side by side where the section is 52rem wide (one champion on a desktop), one
  under the other in a column of Compare; in each, the part's name, its choice as Riot's icons (20–26px;
  a stand-in tile with the initials where the static data has no picture), its **win rate**
  (primary, its ⓘ: "Won 54% of the 87 games with this rune page; 61% of the 143 games with a full
  rune page recorded made it.") and its **pick rate**. The label goes over its icons in a narrow
  column, the figures under them in the narrowest (Compare on a small phone).
- **Single view**: a band across the board under the abilities and the base statistics (the slot
  `ChampionPanel` takes as `builds`). **Compare**: its own row of the board after R (row 9), one cell
  per champion, so the two builds line up; Swap and ✕ carry each, with its role, with its champion.
- Streamed in after the abilities (an async server component in a `<Suspense>` with a skeleton of its
  shape), so the abilities never wait for it; a failure shows "Builds can't be loaded right now" and
  is logged, never failing the page.
- Factual statistics, never advice: no "recommended", "best", "should" or verdict
  (`champion-builds-words.test.ts` and `words.test.ts` check the words).

**Who sees it.** Accounts holding "view-teammate-stats" (the default member access): the team
members' own games are among the counts, and a champion only one member plays would show that
member's choices and results. Anyone else sees no section at all.

**Cost.** One statement per champion and patch window (`readBuildCounts`): it opens only that
champion's records through `match_details_champions_idx` (a GIN index on the records' champions,
migration `0069`; the statement's condition is the index's own expression, and the database test
checks the plan), reads each player's timeline entry inside the database (never the frames or
events), runs with JIT off, and returns about one short row per counted value: 2–9 KB on the demo
(Leona's two roles on two patches, the most), estimated 5–20 KB for a popular champion in
production. Cached six hours in Next's data cache (shared by every server instance), keyed by the
champion, the patch window, the abilities' ranks, the item data's version and the rules' format
(`BUILDS_FORMAT`): a new patch is a new key; an erasure drops the tag at once
(`src/server/privacy/after-erasure.ts`). The in-memory demo is counted every time. A team of about
eleven opening 20 champions a day: well under 1 MB of egress a day (HOSTING_USAGE.md, "26 Nov 2026").

**The demo** (in-memory only, `src/server/demo/builds-fixture.ts`): its records are all of patch
16.20 with one build per role, so Thresh's support games move to the current patch with two builds
(a less common one that wins more: the Highest win rate view), Nasus's top games with one build, and
Leona's games to the current and previous patches in two roles; everything else stays, so Ahri and
the other champions the browser tests open show the honest line. The same on every fresh demo
(`tests/db/champion-builds-demo.test.ts`).

## Choosing a champion

- **A champion's name** opens the window of every champion (`champion-picker.tsx`; a task dialog,
  DESIGN_SYSTEM.md §7: the whole screen on a phone, 42rem wider up, no history entry) with its own
  search (focused with a mouse), the Recent row (`recent.ts`: the champions this device showed lately,
  ids only, per account, never sent to the server) and every champion as a portrait grid, every
  name whole under its portrait (the shared `ChampionGrid`'s `wholeNames`: 6rem columns, one size,
  wrapping between words only, never clamped to two lines; the other pickers keep their denser grid).
  In the search's list a name is never cut either: Riot's title beside it gives way first. Enter takes
  the first match; the focus comes back to the name, or goes to the new champion's name once it has
  arrived.
- **"/"** anywhere on the page outside a field opens the window for the champion whose column holds
  the focus, else the first (a second monitor's quick reach).
- **With nothing chosen**: "Choose a champion", the search (`champion-search.tsx`: a WAI-ARIA
  combobox that finds any champion as typed, by name, by initials, "tf", or a reviewed nickname,
  "j4"; ↑/↓, Enter, Escape twice; 16px on phones), All champions, and the Recent row.

## Address

`/lookup?champion=<id>&haste=<n>&role=<role>&champion2=<id>&haste2=<n>&role2=<role>` (`address.ts`,
`intelHref`), so a reload, a bookmark and a shared link open the same champions at the same hastes,
each builds section on its chosen role (left out for its default; a role is `TOP`, `JUNGLE`, `MID`,
`ADC` or `SUPPORT` in any case, anything else ignored). A champion may be its Data
Dragon id or its name in any case, accents and punctuation ignored ("wukong" opens MonkeyKing); the
page writes each champion's own id back. One the roster lacks is left out with a line saying so,
never repeated back. A second champion with no first (or a first the roster lacks) becomes the first,
its haste with it. Each haste is a whole number from 0 to 300, held to 300 above it, 0 otherwise and
left out. All of it is the page's state, like a filter: a change replaces the address and adds no
history entry, so Back leaves the page in one step. A champion is built on the server
(`router.replace`); a haste or a builds role changes the page at once and only rewrites the address
(`history.replaceState`), with no request. A champion changed drops its column's role.

**Old links.** Matchup Intel's address, `/resources/matchups` with any of its parameters, redirects
here (HTTP 308, `src/proxy.ts`) carrying one champion: the enemy (`vs`) where it names one, else your
champion, else the bot lane's other enemy, else your duo partner (`legacyMatchupRedirect`).
`/resources/matchups?champion=Riven&vs=Mordekaiser` lands on `/lookup?champion=Mordekaiser`. All
Champions' preview links an opened lane opponent here: "Renekton's abilities in Champion Intel →".

## Fit and measurements

Measured on 25 Nov 2026 with the demo build, Data Dragon 16.22.1, 100% text (`e2e/champion-lookup.spec.ts`
holds each; screenshots before and after in the lane's notes, never in the repository):

- **One screen, folded**: the header, the haste and the five ability rows are on the first screen
  with one champion at 1280 × 720, 1440 × 900, 1440 × 780, 1920 × 1080, 1920 × 950, 2560 × 1440 and
  3440 × 1440, the sidebar open and folded (Ahri at 100 haste, Udyr's six ranks, Aphelios at 300), the
  base statistics beside them from 64rem; and with two (Ahri and Jinx at 20, Udyr and Lee Sin at 40,
  Teemo and Jayce, whose four two-ability slots are the longest rows) from 1366 wide (the 25 Nov 2026
  decision: compare fits at 1440 × 900 and above; at 1280 × 720 with the sidebar open two columns
  of the aligned board run a little past the screen, about 800px). One champion at 1440 × 900: the
  last row ends near 600px; at 1366 × 768, near 620px. Two at 1440 × 900: Aurelion Sol and Nunu at 20
  end near 690px, Teemo and Jayce near 840px.
- **Names**: the champion's name whole and on one line at 1366, 1440 and 1920, the sidebar open and
  folded, one champion and two ("Nunu & Willump", "Aurelion Sol", "Renata Glasc", "Twisted Fate",
  "Heimerdinger", "Fiddlesticks"); no ability name broken inside a word; whole in the search's list
  and the window's grid.
- **Nothing scrolls inside the page** at any size, every row open included; nothing is wider than the
  window from 320px up, at 200% text too (phones at 320, 375, 390 and 430, one champion and two).
- **Phones and a tablet** (768 × 1024): two champions side by side in every row, level; on a phone the
  page scrolls, as every phone page does.
- **Centred** in the room beside the sidebar, open or folded, within 2px.
- **With the builds** (26 Nov 2026, `e2e/champion-builds.spec.ts`): one champion's whole board,
  builds included, ends within the screen at 1366 × 768, 1440 × 900, 1920 × 1080 and 2560 × 1440,
  the sidebar open and folded: Thresh's board ends near 715px at 1366 × 768 and 1440 × 900 (the
  band 205px; Leona's 725px with the role switch), 791px at 1920 × 1080, 918px at 2560 × 1440; a
  champion with too few games adds one line (45px). At 1280 × 720 with the sidebar open the band
  ends near 768px, past the screen (folded, 715px), the five rows still on it. In Compare the builds
  row comes after R, below the first screen at 1440 × 900 (the board near 1,050px), as the brief
  allows.

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
- **What the page reads.** The session, the cached roster and current patch, the stored records
  of the one or two champions the address names (one statement, cached ten minutes;
  `src/server/champion-lookup/view.ts`), and, for members who may see teammates' statistics, each
  champion's build totals (one statement each, cached six hours; above): only counts, no player, no
  Riot request.
- **What is stored and not shown.** Kept as they are, with no destructive migration, though no page
  reads them since Matchup Intel was retired:
  - each champion's Riot tips (`allytips`, `enemytips`), inside the stored abilities;
  - `account_match_prep` (Matchup Intel's evidence from the team's own games): nothing writes or
    reads it any more (the builds count the records and timelines themselves); a row still goes with
    its game, and an erasure still deletes the rows of the games it de-identifies;
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
  from champion select, nothing names a player, and two champions compared are two references, never
  a verdict on a matchup: aligned side by side, with no better/worse colouring, no difference
  computed and no "faster" or winner wording.
- **No timers.** Base values per rank and their value at a chosen haste only: no timer, countdown,
  "used" or "ready at", and nothing records when an ability was used (`words.test.ts` and the browser
  spec check the words). No advice, ranking or matchup verdict.
- **Builds: post-game totals, worded as observations.** The builds are counted from completed games
  already collected for the members' match history (no new endpoint, no Riot request, no new
  storage), shown to members as totals with their sample ("From 143 games in the team's matches",
  "not a global sample"), "Most common" and "Highest win rate", never "recommended" or "best":
  statistics of what was played, as registered Riot API products publish, not an app that dictates
  a player's decisions. Only counts leave the database; no player is named. The registration's
  description should say it (RIOT_COMPLIANCE.md item 9; "For the owner").
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
  (the rules on all 865 descriptions, the hard cases both ways, the exceptions pinned), `board.test.ts`
  (rank columns across the roster, the statistics listed and aligned for two champions, the chips'
  order on every ability), `changes.test.ts` (the patch marks), `view.test.ts`, `words.test.ts` (no
  timer or "verified"; each ⓘ at most 25 words), `src/components/champion-lookup/address.test.ts` (both
  champions in the address, Swap, removing either, the old links), `search.test.ts`;
  `src/server/riot/static/abilities.test.ts` (what is read from Data Dragon, the fixture against Data
  Dragon's own numbers, the build script).
- Database: `tests/db/champion-abilities.test.ts` (the sync, the per-champion reads, the patch marks);
  `tests/db/champion-builds.test.ts` (the counts: only current members' draft games, no remake, both
  teams and both spellings of a position, never an erased player, the item and skill rules the
  domain's, totals only and their size, the champion index in the plan, the section only for
  members with teammates' statistics); `tests/db/champion-builds-demo.test.ts` (the demo's builds,
  the same on every fresh demo).
- Builds, unit: `src/domain/champion-builds.test.ts` (the item rules on Data Dragon 16.22.1's items,
  `tests/fixtures/ddragon-16.22.1-item-builds.json` built by `scripts/static/build-item-builds-fixture.mjs`;
  the starting set; the skill order with six-rank abilities and Udyr; the Wilson bound; the choices:
  a small sample never wins, near-identical builds merged, one build where they agree; the patch
  window, the roles and the empty state), `src/domain/champion-builds-words.test.ts` (every ⓘ one
  idea in 25 words, no advice).
- Browser: `e2e/champion-lookup.spec.ts` (the page, its facts, slot keys, chips and costs per rank,
  the passive's dash, the chips marked in the description, folds by keyboard, the haste field and every
  invalid input, the special cases, unusual champions, "/" and the search, the window, Compare on one
  aligned board, Swap and ✕ on either column, the base statistics' folds together, names never cut or
  broken, the address, phones and tablets side by side, the old links, one screen at every desktop
  size single and dual, the rank columns, phones at 200% text, axe), with the shared specs
  (navigation, journeys, page budgets, quality, design parity, shared controls, WebKit).
- Browser, builds: `e2e/champion-builds.spec.ts` (icon rows with win and pick rates and the source
  line, each ⓘ by keyboard and touch, the Highest win rate view, the honest empty line, two roles in
  the address with the haste, Compare's level rows and Swap with roles, phones at 320 and 390 at
  100% and 200%, one screen at the desktop sizes, axe).
- Production check: `scripts/champion-lookup-facts.mjs` (LIVE_VALIDATION.md, "What it checks"),
  the builds among its facts.

## For the owner

**The registration's description** (Riot's Developer Portal) still describes Matchup Intel. Champion
Intel's static reference shows less than Matchup Intel did (no wiki notes, no reviewed facts, no
tips; its mechanics are Riot's own descriptions with Riot's sentence beside each). Its builds (25 Nov
2026) show more: totals of the team's stored completed games, from the records already collected,
with no new endpoint or request. The description should say both. The owner's action at the next update: paste the proposed description in RIOT_COMPLIANCE.md
("Proposed description for the registration"), whose Champion Intel part is, word for word
(`src/server/riot/registration-description.test.ts` keeps the two copies the same):

> Champion Intel, for signed-in accounts, is a static reference for one or two champions chosen by hand: each ability's name, icon, description, cost and base cooldowns per rank from Data Dragon, those cooldowns at an ability haste the reader chooses, by Riot's published formula, each champion's base statistics from Data Dragon, and the mechanics its ability descriptions name, with Riot's sentence for each. For members who may see teammates' statistics it also shows totals of the rune pages, summoner spells, items and skill orders observed in the team's stored completed games on the current patch (both teams, counts only, no player named), with their win rates, pick rates and numbers of games, labelled as the team's games and not a global sample, and no advice. It makes no Riot API request and has no timers or tracking.

**Decisions left to the owner**: whether damage values, scaling and durations should come from a
source beyond Data Dragon (CommunityDragon's game files hold them; RIOT_COMPLIANCE.md permits that
source for rank crests and role icons only); whether per-ability ranges should be shown (25 Nov 2026:
not shown; Data Dragon's are unreliable and not stored, so only the champion's attack range is, once;
showing them needs a reviewed rule and rules format 5); and whether the canonical address should
become `/intel` (it stays `/lookup`, so nothing that links to it changes).

**Builds: blocked and decided here, for the owner** (25–26 Nov 2026):

- **Global population statistics are blocked** (the requirement's "broader LoL population
  statistics"): Riot's API has no aggregate endpoint, and the only legitimate route is collecting
  other players' games (the high-elo collector built and switched off for Matchup Intel, commit
  `6dfccdd`, reverted in `14a9f10`; its design in `git show 6dfccdd:docs/HIGH_ELO_EVIDENCE.md`). It
  waits on the owner (OD4): the Developer Portal registration updated to cover anonymous aggregate
  collection from high-elo ranked games, retargeted to Champion Intel's builds, with the LEAGUE-V4
  apex ladder requests listed; the privacy notice's row (PRIVACY.md, "Prepared, not active"); and
  Vercel's usage readings (OD5) before it is switched on. Even then a per-build win rate needs
  thousands of games per choice, which a personal key does not reach. The section is built so a
  second source could join it (its words say "in the team's matches" and "not a global sample").
- **No rank filter**: Riot's game records hold no rank, and other players' ranks are kept only as
  the latest reading; the source line says "all ranks".
- **The queues**: Normal Draft, Ranked and Clash; Swiftplay, Quickplay and Blind Pick are left out
  (a faster economy, no draft). The owner may want them in.
- **The thresholds** (20 games for the section and each part, 10 games and a tenth of them for a
  choice, 20 games and 15% for the highest win rate, 2 points apart): the owner may tune them;
  production's team-scale samples will show "Highest win rate" rarely, and many champions the
  honest line, which is the truthful outcome.
- **The registration**: paste the description above at the next update (the build totals are new
  in it).
