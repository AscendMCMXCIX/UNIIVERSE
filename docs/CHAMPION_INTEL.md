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
    description names (below), crowd control first, then its **range** where the review of what
    Riot's number measures is current ("Range 970", "Global": small and secondary, in the same flow,
    under the chips where the row has no room, never a grid line of its own; "Ranges", below), then
    "Changed since 26.22" where it is known;
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
  cooldown is. Riot lists 10 / 9 / 8 / 7 / 6 s for the slot."); where the range comes from and who
  decided what it measures, or why it waits for a review ("Ranges", below); and, where the sync knows it, what Riot
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
    16 / 15 / 14 / 13 / 12 s", "Mana 60 / 65 / 70 / 75 / 80", wrapping between ranks only, each "/" ending the line it follows (a
    no-break space before it), so no line starts with "/", and the "s" held to the last value (until
    the review of 25 Nov 2026 a 390px phone's Compare drew "13 / 12 / 11 / 10" then "/ 9 s"); a Compare
    column under 11rem leaves the icon out (the slot's key is in the board's own column) and under
    15rem sets the name and the cooldown a size smaller (text-sm), so a long word keeps its line; one
    champion's row under 14rem (a small phone at a large text size), and a stacked Compare column's,
    puts the name and values under the key and the icon.
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
- **Per-ability ranges** are shown only where a committed review says what Riot's number measures
  and Riot's data is still what was reviewed (the owner's decision D3 of 26 Nov 2026; "Ranges",
  below). The champion's attack range is in its facts, once.

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

## Ranges

`src/domain/champion-lookup/range.ts` (the rule), `src/server/riot/static/ability-ranges.reviewed.json`
(the reviewed table), `scripts/static/review-ability-ranges.mjs` (the drafting and checking script).
The owner's decision D3 (26 Nov 2026): "Include ability ranges where they can be reliably sourced,
reviewed and maintained across patches. Do not invent or estimate unavailable values."

**Why a review.** Data Dragon gives every spell a `range`, one number per rank (all 692 at 16.22.1;
the passive has none), the number the game's range indicator draws. The number has no type: a cast
range, a skillshot's length, a dash, a radius around the champion (Garen's E, 325, is his spin), an
attack modifier (Kog'Maw's W, 530), the engine's "unlimited" (25000 on 32 spells, about 7 of them
global) or a placeholder (0, 1, 20, 40; 81 spells hold a number of 50 or less, or 10,000 or more),
and nothing in Riot's data says which. Riot's text names a range for one ability of 692 (Twisted
Fate's R, through a placeholder). A one-off research comparison with the game's files (41
champions, CommunityDragon's copy; a measurement, never a source) found Data Dragon's number is the
game's indicator value or cast range for 155 of 164 spells: current, not hand-kept, though it differs
from the mechanical cast range by 10 to 100 units for about 17% of real reaches (Morgana's Q 1,250
against 1,300). Taken as given, 26% of the numbers that are not placeholders mislead as a reach (a
hand classification of that sample). So a number is shown only where a review says what it measures.

**The rule** (`rangeDisplay`). A spell's range is shown only when:
1. its stored record carries Data Dragon's `range` (rules format 5; Q, W, E or R);
2. the table has a row for its champion and slot with the same Data Dragon spell id, the same range
   array element for element, and the same text hash (Riot's description and tooltip, `textHash`);
3. the row's kind is `reach` and the numbers pass validation (one per rank, each above 50 and below
   10,000, never smaller at a higher rank, not a slot of two abilities: " / " or " | " in its name),
   or `global` and Riot's number is 5,000 or more.

Then "Range 970" (one number where every rank has the same), "Range 2,000 / 2,500 / 3,000" (per rank
where they differ, through `formatCount`), or "Global". A row of kind `self` (cast on the champion)
shows nothing (the owner's decision, Release 19), as do `none` (the number is not the reach), no row,
the passive and a record from before format 5. When the key no longer matches (Riot changed the spell
id, its range or its text), the range is hidden and the opened row says "Range not shown: Riot changed
this ability after patch 26.23, when its range was last checked." Nothing is estimated, carried over
or rounded: the number shown is always Data Dragon's current one, which is then the reviewed one, and
no number from the table is ever shown on its own. A mid-patch hotfix Data Dragon does not publish is
not reflected until the next version, as with cooldowns.

**On the page.** Folded, a short item after the chips (text-xs, the secondary colour, tabular
figures), in the name-and-chips flow, spaced like a chip: on the name's line where there is room,
under the chips where there is none, never a grid line or column of its own, so the measured
one-screen fits hold ("Fit and measurements"); a per-rank range wraps between values only, each "/"
with the value before it, and a screen reader hears "Range 970 units". The row is marked
`data-range-status` "shown", "self", "changed" or "none" (the tests and the Production check read
it). Opened, one line: "Range from Riot's data, in game units. Classified by fixed rules from Riot's
text on patch 26.23, not by a person." for an automated draft ("Reviewed against Riot's text by an
automated review on patch 26.23, not by a person." for an automated review, "Reviewed by the team on
patch 26.23." for the owner's), or the line above when it waits for a review; nothing for a row
without a range. The abilities' ⓘ: "Mechanics come from Riot's descriptions; ranges only where checked
against Riot's text. Riot's data has no damage values or scaling, and no cooldown for passives (—)."
In Compare each column shows its own, with no difference, colour or comparing word. Never
"estimated", "about", "approximately", "accurate" or "verified" (`words.test.ts`).

**The table.** One row per reviewed spell, one per line, by champion and slot: champion, slot, Data
Dragon's spell id, `kind` (`reach`, `global`, `self`, or `none` with `why`: `placeholder`,
`two-forms`, `not-the-reach`, `scales-in-game`, `several-abilities`), Data Dragon's range array as
reviewed (written out so a reviewer reads it against Riot's file, and compared element for element:
no separate hash is needed), the text hash, the Data Dragon `version` reviewed at, the date, the
`reviewer` by role (`automated draft`, `automated review` or `owner`; never a name, the repository is
public) and, for a draft, the `rule` that decided. A row applies at any version where its key still
matches: the rows drafted at 16.23.1 match 16.22.1 (the browser tests' pin) row for row. It is read on
the server only (`src/server/riot/static/ability-ranges.ts`, joined in
`src/server/champion-lookup/view.ts`; `client-imports.test.ts` keeps `src/server` out of browser
code): the browser gets each ability's computed range. It changes through pull requests, so git
history is the review log. A committed file rather than a database table: no migration, no grants,
reviewable as a diff, held to the offline fixture in CI.

**The drafting rules** (`draftRange`, fixed, no champion named; each spell's draft with its
evidence, Riot's description and tooltip with the markup taken out, from `--draft`):
- `none`, high confidence: not one number per rank, two abilities in the slot, a number of 50 or
  less, a range smaller at a higher rank;
- `global`, high: every rank 10,000 or more and Riot's text says the whole map ("regardless of
  distance", "anywhere on the map", "across the map", "all enemy champions"…); 10,000 or more
  without those words is `none`, medium (a map-wide projectile the words miss is left to a
  reviewer);
- `reach`, high: Riot's description or tooltip aims the ability in its first sentence (thrown,
  fired, launched; the champion dashes, leaps or blinks; cast at a target, a location or in a
  direction), or the tooltip says "the first enemy hit", and nothing anywhere in Riot's text casts
  doubt: no radius or change to attacks ("nearby", "around him", "next attack", "attack range",
  "gains", "empowered"…), no parts or modes ("Passive:", "Recast:", "instead", "at 2 stacks"), no
  charge or hold, no words about range or distance, not the whole map, not equal to the champion's
  attack range (Tristana's E grows with it in a game), not a projectile shorter than the champion's
  attack range (Xayah's Q, 400: its cast field, not the daggers' flight), and between 100 and 5,000;
- `self`, high: the description's first sentence is about the champion itself (its next attack, a
  toggle, a passive, an area around it) and Riot's text has no sign of aim at all;
- anything else is medium or low confidence, "needs a reviewer", and the script never writes it.

Measured on Data Dragon 16.23.1 against the hand classification of 41 champions (164 spells) made
for the design: the high-confidence reaches were right 33 of 33 (finding 33 of the sample's 106 real
reaches) and the globals 6 of 6; the other high-confidence rows show nothing either way. The table
first held the rules' high-confidence drafts only (165 rows: 89 reaches, 7 Global, 2 self, 67 none).

**The review** (27 Nov 2026, Data Dragon 16.23.1; every row is now `automated review`). Every one of
the 692 spells was classified by two independent automated reviewers from the same evidence as the
drafts, without the draft (the brief: `scripts/static/range-review-brief.md`). They agreed with each
other on 641 and with the draft on 353. The verdicts are combined by fixed rules (in the brief):
- both reviewers give the drafting rules' kind: that kind (353);
- both say `self`, or both `none`: so (112; nothing is shown either way);
- both say `reach` or `global` where the rules did not (103): two adjudicators, a verifier and a
  skeptic, judge each from the same evidence; written so only when both confirm it (99; Bard's E,
  Illaoi's E, Syndra's R and Zoe's E were not);
- anything else, a reviewer unsure or the two split: `none`, why `unconfirmed`, never shown, and
  `--write` never drafts it again (124, with the 4 above).

The review is stricter than the drafts about the number itself: a reviewer who recalled a different
in-game reach (Ezreal's Q, 1,150 in Data Dragon against the 1,200 often cited; Caitlyn's Q, Thresh's
Q, Morgana's Q) made it `unconfirmed`, so where Data Dragon's indicator value and the mechanical
range are known to differ, nothing is shown rather than a number a player may read as wrong. It also
took back two high-confidence drafts that were wrong (Kled's Q, two forms; Ziggs's Q, whose bomb
bounces past Data Dragon's 850). The table holds 692 rows: **269 reaches and 11 Global shown**, 181
cast on the champion, 231 not the reach (128 of them `unconfirmed`); at 16.22.1 (the browser tests'
pin) the same, but Mel's W, which Riot changed at 16.23.1 (a self row). The owner may confirm or
change any row (reviewer `owner`), and spot-check rows on the page ("For the owner").

**Each patch** (after the version-check reads a new version; part of the patch-day procedure):
1. `node scripts/static/review-ability-ranges.mjs --version <new> --check` (or `--from
   championFull.json`; `--was <previous championFull.json>` adds Riot's old and new text): the rows
   Riot changed (spell id, range, text), rows whose spell is gone, and the count of spells with no
   row; exit 1 when a row no longer matches. Admin → Data & Integrations shows the same as a count
   ("3 ranges are hidden until reviewed again: Riot changed those abilities.").
2. Review each changed row against Riot's new text, as the first review did (`--draft out.json`
   writes every spell's draft and evidence; the changed rows go to two independent reviewers with
   `scripts/static/range-review-brief.md`, the draft taken out, and the verdicts are combined by its
   rules); `--write` keeps the matching rows, keeps a confirmed row that no longer matches (hidden
   until reviewed again), redrafts a stale automated draft from the fixed rules, and adds the new
   high-confidence drafts. A reviewed row gets the new version, date and reviewer.
3. Open a pull request; the table is in `src/`, so it deploys (batch it with other merges). Until
   then only the changed rows' ranges are hidden; every other range stays.

Measured churn (the design's drift measurements): rows whose key moves, 0 at 16.22.1 → 16.23.1 for
the committed table, about 7 a patch averaged over 2026 (155 spells over 21 patches, 139 of them a
tooltip change only); a rework moves 4 at once, spell ids included (Shyvana's, Skarner's), which the
key catches. Without a re-review coverage erodes by about 1% of spells a patch, which the counts make
visible.

**Counts.** The version-check job counts the table against the stored abilities once per version,
and again after a deploy that changes the table (`RANGE_TABLE_HASH`): ranges shown, "Global", cast
on the champion, not the reach, hidden since Riot changed them, not reviewed, and stored before
rules format 5. It stores them in `app_settings` "ability_range_review" (a few hundred bytes), logs
one line ("Ability ranges 16.23.1: 269 shown, 11 global, 181 cast on the champion (not shown), 231 not
the reach; 0 hidden until reviewed again; 0 not reviewed (692 rows).") and adds them to its summary
(`abilityRanges`): counts only, no champion named. An ordinary run reads only the stored counts.
Admin → Data & Integrations shows them under "Riot's static data between patches".

**Sources.** Data Dragon only, for the number and the text. No wiki: its values are often the
mechanical cast range and would contradict the number shown for about 17% of reaches, and its terms
forbid automated use. No CommunityDragon: RIOT_COMPLIANCE.md permits it for rank crests and role
icons only; it was read once to measure Data Dragon (above), and never by a job, a test or the table.

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
that changes the cooldowns as it is typed in; the rule in the ⓘ beside it, two short sentences
("Cooldowns at a haste use Riot's rule: base × 100 / (100 + haste), only where Riot's data gives
one. Ultimate haste isn't counted.", `HASTE_RULE_WORDS`; `words.test.ts` holds every ⓘ of the page
to 25 words in at most two sentences); at a haste above 0, "16.7% shorter" after it (one
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
says where they come from ("Mechanics come from Riot's descriptions; ranges only where checked
against Riot's text. Riot's data has no damage values or scaling, and no cooldown for passives (—).",
`DATA_LIMIT_WORDS`; until 27 Nov 2026 "Mechanics are named from the words of Riot's descriptions.").
The
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
per column on the same rows (`columnStats`, `board.ts`: a statistic only one champion has, mana
beside Garen's none, gets "—" in the other's), the two opening and closing together. A champion whose
statistics are not stored (a record from before rules format 4, or Riot's that failed the schema)
shows none, alone or in Compare: never a column of "—", which would say it has none of them.

The table is a grid with a table's roles (`role="table"`), laid out by its own width
(`@container/stats`): from 15rem the statistic, then "Level 1" and "Per level" in fixed columns
(3.25rem and 3.75rem), so two Compare columns as wide as each other wrap their labels alike;
narrower (a Compare column on a phone) each statistic's name takes a line of its own, its two numbers
under the headings in two halves, the ⓘ over the headings' left edge (under 7.5rem, a 320px phone at
200% text, the ⓘ on a line of its own and the figures a size smaller, so two still fit side by side). Where the two columns word a row differently ("Mana" beside "Energy", "Mana regen per
5 s" beside "Energy regen per 5 s"), each label keeps the room of the other (drawn invisibly), and a
"Changed since" mark in one column's summary keeps its room in the other's, so the two tables' rows
stay level at every width (26 Nov 2026, the review: an auto-sized table overran a 390px phone's
column by up to 35px, and wrapped "Per level" in one column and not the other).

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
  board's 21 rows: the header, the facts, the abilities' heading, P, Q, W, E, R, the builds' twelve
  rows (their heading, their source line, and each group's headings and parts, which the builds
  section takes as its own subgrid) and the base statistics. The same row of both champions therefore
  has the same height and top, with no script measuring anything: their cooldowns by rank (each at
  its own champion's haste), costs, chips, facts, each part of the builds and the statistics line up
  side by side. A row opened in one column grows that row in both (the other cell keeps the space
  empty), and the columns stay level.
- **Each champion its own haste** (its header's field, `haste` and `haste2` in the address), its
  own folds, and its own builds row (its role, `role` and `role2` in the address, and its view of
  choices).
- **Swap** (the title row, "Swap Ahri and Jinx") exchanges the two: each keeps its haste and its open
  rows (the columns are keyed by champion, so the browser moves them), shown at once while the
  address catches up. **Change** either from its name. **✕** on either column removes it: removing the
  first makes the second the first, its haste with it (`withoutHref`, `swappedHref` in `address.ts`);
  the focus goes to the champion that stays. The same champion twice is allowed (two hastes).
- **While a change is on its way** (a champion built on the server, a swap, a removal: a few hundred
  ms warm, seconds on a cold start), Swap and both ✕ wait: `aria-disabled`, never `disabled`, so the
  keyboard that pressed one keeps its focus, and pressing again does nothing (26 Nov 2026, the
  review: a ✕ pressed while the other column loaded dropped the champion just chosen, and on the
  first Compare did nothing at all; a disabled Swap dropped the focus to the page). A champion chosen
  for the other column meanwhile keeps the one still loading ("Loading Lux and Caitlyn…"). A haste
  typed, or a builds role chosen, while the page's own change is on its way stays when it arrives:
  the page tells its own address from one opened elsewhere (a link, Back), which brings its own.
- **Neutral.** Two references, never a verdict: no colour or word says which value is better,
  nothing is "faster" (RIOT_COMPLIANCE.md item 9; the browser spec checks the words). Without a lane
  no difference is computed; only with a lane chosen does Matchup Intel's band state differences of
  the same quantity in neutral words ("22 more for Darius", "the same"), never better, worse, faster,
  favoured or a verdict (27 Nov 2026).
- **Matchup Intel** (27 Nov 2026, the owner's request of 26 Nov 2026, item 4; [MATCHUP_INTEL.md](MATCHUP_INTEL.md)):
  the **Lane** control beside Swap (icons, the chosen lane named; "No lane" first, Compare as it
  was) puts the early-lane band between the title and the board: Reviewed notes, In the team's
  matches (accounts that may see teammates' statistics) and From Riot's data, each named in words.
  The first column reads "Playing", the second "Against"; each ability row's rank-1 cell is tinted.
  A lane is chosen like a champion (the server builds the band; Swap and ✕ wait meanwhile); Swap
  keeps it and shows the other side of the same games; ✕ drops it; each column's builds open on the
  lane's role where the champion has builds in it.
- **Every width.** From a board of 22rem (a 390px phone at 100% text) up both champions sit side by
  side in every row (a phone's columns use the line form, values wrapping between ranks, the
  abilities' names and cooldowns a size smaller; the portrait above the name, the name a size
  smaller, the chevron under it where the two do not fit; ✕ in the column's corner). Under a 22rem
  board (phones of 375px and less, or a large text size) the two columns stack, each read as one
  champion's rows with its own slot keys: a 320px phone's columns side by side left an ability's
  name 77px, and broke "Resonating" and "Wingborne" inside the word (26 Nov 2026, the review; until
  then the columns stacked only under 17rem). Never wider than the screen, nothing scrolling inside,
  no name broken inside a word. Every control a 44px target on a touch screen.

## Builds and runes

The owner's request of 25 Nov 2026 ("Recommended builds and runes": a compact, patch-aware
section; the most reliable combination by default, never the highest raw win rate on a tiny
sample; Standard and Highest-performing apart, one where they are effectively the same; the
sample, patch, rank and queue filters and the data source said). What players chose on the
champion in the team's stored matches, counted in the database and shown as compact icon rows
(`champion-builds.tsx`; rules in `src/domain/champion-builds.ts`, words in
`src/domain/champion-builds-words.ts`, the counts in `src/server/champion-builds/`). The owner's
request of 26 Nov 2026 (Release 19) added two rules: **D5**, Ranked Solo/Duo is the default source
and Ranked Flex, Normal Draft and Clash are kept apart, never mixed; **D6**, a build with very few
games is never presented as the best because of its raw win rate (both below).

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

**The queue (D5).** One statement counts every queue at once and every counted row carries its
queue (`readBuildCounts`); each queue is a view of its own (`championBuildsViews`), never added to
another. **Ranked Solo/Duo** is the default; **Ranked Flex**, **Normal Draft** and **Clash** are each
a choice in the section's heading (the shared `Select`: the popover from 768px, the phone's own
picker below; its accessible name "Thresh's builds: queue"; its ⓘ: "Each queue is counted on its
own and never mixed. Swiftplay, Quickplay, Blind Pick and ARAM are not counted."). The queue is the
page's, not a column's: in Compare both columns read the same queue (one population side by side),
changing either changes both, and Swap, ✕ and a new champion keep it. Choosing a queue reads nothing
(every queue's counts came with the page) and only rewrites the address (`queue=flex|draft|clash`,
left out for Ranked Solo/Duo; anything else reads as Solo/Duo). A queue with too few games says so
in its own words ("Not enough Ranked Flex games on patch 26.22 in the team's matches yet", its ⓘ:
"Builds need 20 games in one role and queue. The team's Ranked Flex games have 18 as Support on this
patch and the one before.") and, where another queue has builds, offers it as a button: "Show Ranked
Solo/Duo (50 games as Support)" (the queue with the most games in the role asked, else in its own
most played role). Nothing switches by itself: the reader chooses, and the focus then goes to the
queue choice. Solo/Duo alone cuts the team's samples (the demo's Thresh: 50 of his 68 games), so more
champions show the honest line than before; that is the honest outcome.

**The patch.** The game's current patch (the stored static data's); where the champion has fewer
than 20 games in a role and queue on it, the previous patch is added (per queue and per role: Solo/Duo
may be widened while Flex is not) and the source line says so ("patches
26.21–26.22", in the warning colour, its ⓘ giving both counts). Where the current patch has no game
yet (the first days of every patch), the line names the previous patch alone, as that: "patch 26.21,
none yet on 26.22" (its ⓘ: "Patch 26.22 has no games yet, so only the 25 games on 26.21 are
counted."), never a range that would put the current patch in the sample. Never across a season;
with fewer than 20 games on the two together the section is one honest line naming its queue, as
above.

**The parts** (each counts its own games, said in its row's ⓘ):

| Part | From | Counted as |
|---|---|---|
| Runes | every record kept from 14 Oct 2026 (the full page) | the primary tree's keystone and three runes, the secondary tree and its two; drawn as each tree's icon (its name read out) before its runes |
| Stat shards | records kept from 20 Nov 2026 | the three, named by their row ("Offense shard", "Flex shard", "Defense shard": Data Dragon has icons but no names) |
| Summoner spells | every record | the pair, either order |
| Skill order | games with the player's timeline | the skills in the order they reached **their own last rank** (each ability's Data Dragon `maxrank`: Aphelios's six, Udyr's R levelled like the others), then the rest by points; a game where two unmaxed skills have as many points, or nothing is maxed, is left out; with the first three points beside it |
| Starting items | timelines | bought in the first minute, less what was sold in it (timelines kept from 20 Nov 2026 hold sales) |
| Boots | timelines | the first boots of the second tier bought (Gunmetal Greaves, which has no Boots tag, counts as boots), or "No boots" for a game that completed three items without any |
| Core items | timelines | the first three **completed** items, in the order bought: purchasable, 1,000 gold or more, not boots, a consumable or a trinket, and building into nothing a player can buy (so Manamune, Archangel's Staff, Winter's Approach and Whispering Circlet count when bought, as they only turn into Muramana, Seraph's Embrace, Fimbulwinter and Diadem of Songs) |
| Full build | timelines | the most common core, then the item most often bought fourth after it and the one most often bought fifth, each common enough on its own; a composition, so its ⓘ gives each later item's share instead of a win rate. In the "Highest win rate" view it starts from the core with the highest win rate, and its ⓘ says so ("The core items with the highest win rate, then those most often bought fourth …") |

A game whose timeline holds an item the current static data does not know is left out of the item
parts (an old item is never skipped over, which would shift the order). The items' rules read
`riot_build_data` (Data Dragon's shop facts, current version), unread since Matchup Intel.

**The choices.**

- **Near-identical builds are one choice**: the same three core items in another order (shown in
  their most common order, said to a screen reader), the same keystone and secondary tree with other
  minor runes (shown as its most common page, said to a screen reader), the same skill order with
  other first points (shown as "most often first Q E W"). The figures count the whole choice, and the
  words say what was counted together: "Won 54% of 87 games with this keystone and secondary tree,
  likely 43–64%", "… with these core items in any order" (26 Nov 2026, the review: "with this rune
  page" claimed the whole family's games for one exact page).
- **Most common** (the default, the Standard build): the choice made in the most games among those
  made in at least 10 games and a tenth of the part's games.
- **Highest win rate** (the Highest-performing build; D6, 26 Nov 2026): a statement that one choice
  won more, so it must hold up against chance. Among the other choices made in at least **30 games**
  and **15%** of the part's games, the one with the best 95% Wilson lower bound is shown only where
  **the 99% interval of its win rate's difference from the most common's lies wholly above 0**
  (Newcombe 1998, method 10, from the two Wilson intervals: `differenceInterval`), it won at least
  **2 points** more, and **no one player holds more than a third of its games** (a main's skill is
  not a build's: the most games one player had with each value is counted inside the database, the
  player never leaving it, and the family's sum is the upper bound used). Its ⓘ: "Among choices of 30
  games or more, one that won clearly more than the most common, 99% sure not by chance. Shown only
  then." Where any part has one, a two-way switch ("Most common", "Highest win rate") shows those,
  the rows that differ marked with a dot; where none does, the switch is not there and one build is
  shown.
- **Why (the simulation, map2-builds-elo §2.2, 4,000 seeded trials a size):** the old rule (20
  games, the two Wilson lower bounds compared) offered the "Highest win rate" switch in **93% of
  100-game sections where no build was better**, most of it from fewer than 30 games; the D6 rule in
  at most **about 4%** (1.5% at 100 games), and **never from fewer than 30 games**. The price is
  power: at the team's sample sizes (sections of 20–300 games) an honest rule will almost never show
  "Highest win rate": a choice 10 points better in a section of 250 games has about an 8% chance.
  The demo's Thresh shows the case D6 is for: a less common rune page of 20 games with 16 wins (80%)
  is a choice with its win rate, never the "Highest win rate". The Master+ source (below, thousands
  of games) is where the view becomes useful.
- **Every win rate's likely range.** Its ⓘ gives the 95% Wilson interval ("likely 43–64%",
  `percentRange` in `src/lib/format.ts`). A win rate from fewer than **30** games (±17 points or
  wider) is drawn in the tertiary colour, not bold, and read out as "(small sample)"; the "Win rate"
  heading's ⓘ says why: "Win rates from fewer than 30 games are greyed: they swing a lot. Each one's ⓘ
  gives its likely range."
- A part with fewer than 20 games recorded says "Too few recorded yet (12 games)"; one whose
  choices are all rarer than the threshold, "No common choice in 31 games". Nothing is filled in.

**On the page.**

- Title "Builds and runes", the role (its icon and name; a switch where the champion has 20 games
  or more in more than one role, the most played on the current patch first and the default; the
  role chosen joins the address as `role` or `role2`, left out for the default, and a role the
  champion has too few games in opens the default), and, where a part has a choice that wins
  clearly more, the switch of the two views.
- The queue choice (above), and the source line, "From 143 games in the team's matches · patch
  26.22 · all ranks" (the queue left the line on 26 Nov 2026: the choice beside it says it), each
  part its own ⓘ: the games (runes and spells from all of them; items and skills from
  those with a timeline; how many are the team's own), the data source ("Counted from the games of
  the team's stored matches (both teams). Not a global sample of League players."), the patch, the
  rank ("Riot's game records hold no rank, so these games are not filtered by rank": other players'
  ranks are kept only as the latest reading, so a rank filter would drop and misdate most games).
- Two groups of rows (runes, stat shards, summoner spells, skill order; starting items, boots, core
  items, full build), side by side where the section is 52rem wide (one champion on a desktop), one
  under the other in a column of Compare; in each, the part's name, its choice as Riot's icons (20–26px;
  a stand-in tile with the initials where the static data has no picture), its **win rate**
  (primary from 30 games, its ⓘ: "Won 54% of 87 games with this keystone and secondary tree, likely
  43–64%. 61% of 143 games with a full rune page recorded made it.") and its **pick rate**. Each row
  carries its counts for the Production check (`data-games`, `data-wins`, `data-total`, `data-key`:
  ids only; in the other view the most common's beside them). The label goes over its icons in a narrow
  column, the figures under them in the narrowest (Compare on a small phone).
- **Single view**: a band across the board under the abilities and the base statistics (the slot
  `ChampionPanel` takes as `builds`). **Compare**: its own twelve rows of the board after R (rows
  9–20: the heading, the source line, each group's headings and four parts), which the section takes
  as a subgrid, so each part of the two champions' builds sits on one line, whatever the other
  column's heading holds (a role switch, the view switch, a longer source line). A container breaks
  a subgrid, so in Compare the rows' forms follow the board's width instead of the group's own
  (`FORMS.compare` in `champion-builds.tsx`). Swap and ✕ carry each, with its role, with its
  champion.
- Streamed in after the abilities (an async server component in a `<Suspense>` with a skeleton of its
  shape), so the abilities never wait for it; a failure shows "Builds can't be loaded right now" and
  is logged, never failing the page.
- Factual statistics, never advice: no "recommended", "best", "should" or verdict
  (`champion-builds-words.test.ts` and `words.test.ts` check the words).

**Who sees it.** Accounts holding "view-teammate-stats" (the default member access): the team
members' own games are among the counts, and a champion only one member plays would show that
member's choices and results. Anyone else sees no section at all.

**Cost.** One statement per champion and patch window, every queue in it (`readBuildCounts`): it opens only that
champion's records through `match_details_champions_idx` (a GIN index on the records' champions,
migration `0069`; the statement's condition is the index's own expression, and the database test
checks the plan), reads each player's timeline entry inside the database (never the frames or
events), runs with JIT off, and returns about one short row per counted value and queue: 2–11 KB on
the demo (25–70% more rows than when the queues were pooled, each a few bytes longer), estimated
7–30 KB for a popular champion in production. Cached six hours in Next's data cache (shared by every server instance), keyed by the
champion, the patch window, the abilities' ranks, the item data's version and the rules' format
(`BUILDS_FORMAT`): a new patch is a new key; an erasure drops the tag at once
(`src/server/privacy/after-erasure.ts`). The in-memory demo is counted every time. A team of about
eleven opening 20 champions a day: well under 1 MB of egress a day (HOSTING_USAGE.md, "26 Nov 2026").

**The demo** (in-memory only, `src/server/demo/builds-fixture.ts`): its records are all of patch
16.20 with one build per role, so games are moved by queue: Thresh's Ranked Solo/Duo support games
to the current patch with two builds (a less common one of 20 games and 16 wins: shown as a choice,
never the "Highest win rate", the D6 case) and his 18 Ranked Flex games too (too few: Flex offers
Solo/Duo back); Nasus's Solo/Duo top games with one build; Leona's Solo/Duo games to the current and
previous patches (widened; her bot lane has too few in Solo/Duo, so one role). Everything else stays,
so Ahri and the other champions the browser tests open show the honest line in every queue. The same
on every fresh demo (`tests/db/champion-builds-demo.test.ts`). The "Highest win rate" view and a role
switch between two roles are the Master+ demo's (below).

**The Master+ source (D2: prepared, switched off).** Anonymous counts of Master, Grandmaster and
Challenger players' Ranked Solo/Duo builds in every region, made by a sampler that stores no player,
game or Riot ID (docs/HIGH_ELO_EVIDENCE.md). **Collection is off** until Riot's registration describes
it and the owner switches it on, so production offers no Master+ source (a Production check fact
holds it to `/api/health`'s `highElo`). When on, the queue choice gains a group "Master+ ranked
games" with one option, "Ranked Solo/Duo · all regions" (`source=master` in the address; never the
default: owner decision OB2). The same parts and the same rules, on the counts' **effective number
of games** ((Σw)²/Σw², never more than the games observed): the source line "From 1,240 Master+ games
· all regions · patch 26.23" (its ⓘs: "1,240 games observed, worth 810 as a sample once weighted:
figures and thresholds use 810." and "Anonymous counts from Master, Grandmaster and Challenger
players' Ranked Solo/Duo games in every region, weighted by each region's players. No player is
stored."), "No Master+ games counted on patch 26.23 yet" or "Not enough Master+ games on patch 26.23
yet". No player is known, so the one-player guard has nothing to hold: the 30 effective games and the
99% test carry the rule. The builds' values are made by `observeBuild`
(`src/domain/champion-builds-observe.ts`), which `tests/db/champion-builds-observe.test.ts` holds
equal to the team's statement over every demo record, queue by queue: one rule set for both sources.
The browser tests show it with a cookie over the in-memory demo's synthetic counts (Thresh with a
"Highest win rate", Leona in two roles, Nasus too few once weighted, Ahri none).

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

`/lookup?champion=<id>&haste=<n>&role=<role>&champion2=<id>&haste2=<n>&role2=<role>&lane=<lane>&queue=<queue>&source=<source>`
(`address.ts`, `intelHref`), so a reload, a bookmark and a shared link open the same champions at the
same hastes, each builds section on its chosen role (left out for its default; a role is `TOP`,
`JUNGLE`, `MID`, `ADC` or `SUPPORT` in any case, anything else ignored), in Compare Matchup Intel's
lane (`lane=TOP|JUNGLE|MID|BOTTOM|SUPPORT`, only with two champions), and the page's queue (`solo`,
the default, left out; `flex`, `draft`, `clash`; anything else reads as Solo/Duo: `queueFromAddress`,
one parameter for the builds and Matchup Intel's lane figures alike) and the builds' source (`master`
only where the page offers it; with it no queue is written, as Master+ is Solo/Duo by definition). A champion may be its Data
Dragon id or its name in any case, accents and punctuation ignored ("wukong" opens MonkeyKing); the
page writes each champion's own id back. One the roster lacks is left out with a line saying so,
never repeated back. A second champion with no first (or a first the roster lacks) becomes the first,
its haste with it. Each haste is a whole number from 0 to 300, held to 300 above it, 0 otherwise and
left out. All of it is the page's state, like a filter: a change replaces the address and adds no
history entry, so Back leaves the page in one step. A champion is built on the server
(`router.replace`); a haste, a builds role, the queue or the source changes the page at once and only
rewrites the address (`history.replaceState`), with no request. A champion changed drops its column's
role and keeps the page's queue.

**Old links.** Matchup Intel's old address, `/resources/matchups` with any of its parameters,
redirects here (HTTP 308, `src/proxy.ts`, `legacyMatchupRedirect`): since 27 Nov 2026 your champion
(`champion`) and the enemy (`vs`) as the two champions and the old lane (`role`) as the lane, so
`/resources/matchups?role=top&champion=Riven&vs=Mordekaiser` lands on
`/lookup?champion=Riven&champion2=Mordekaiser&lane=TOP`; one of the two alone is carried alone (no
lane); with neither, the bot lane's other enemy, else your duo partner. All Champions' preview links an
opened lane opponent here: "Riven vs Renekton in Matchup Intel" (both champions, the position as the
lane).

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
- **Matchup Intel's band** (27 Nov 2026, Compare with a lane; `e2e/champion-matchup.spec.ts` holds
  each with 12px to spare, and was checked with every letter 1% wider, as CI's Chromium sets text):
  at 1440 × 900 with the sidebar open the band ends near 300px (its three blocks side by side) and
  both champions' five rows near 860px for a typical pair (Ahri and Zed, with the demo's figures and
  a note: 875px with wider text); Teemo and Jayce's longest rows put R past 900px but P to E end near
  785px (the documented exception: the band and P–E on screen for every pair, all five rows for the
  typical ones). At 1366 × 768 the band is on screen (it ends near 300px), at 1920 × 1080 the band
  and all five rows (near 880px; Teemo and Jayce near 905px). On phones and tablets the blocks stack
  above the board and the page scrolls; nothing is wider than the screen at 320 to 430px and 200% text.
- **Names**: the champion's name whole and on one line at 1366, 1440 and 1920, the sidebar open and
  folded, one champion and two ("Nunu & Willump", "Aurelion Sol", "Renata Glasc", "Twisted Fate",
  "Heimerdinger", "Fiddlesticks"); no ability name broken inside a word; on phones of 320, 375, 390
  and 430 at 100% and 200% text, single and compared, no champion's or ability's name broken inside a
  word or past its column; whole in the search's list and the window's grid.
- **Nothing scrolls inside the page** at any size, every row open included; nothing is wider than the
  window from 320px up, at 200% text too (phones at 320, 375, 390 and 430, one champion and two).
- **Phones and a tablet** (768 × 1024): two champions side by side in every row, level, from a 390px
  phone (one column under the other at 375px and less, and at large text sizes); the base statistics
  and each part of the builds level too; on a phone the page scrolls, as every phone page does.
- **Centred** in the room beside the sidebar, open or folded, within 2px.
- **Ranges** (27 Nov 2026, measured with the demo build at 16.22.1, before and after, and again with
  text widened by 0.01em for CI's Chromium): the item sits after the chips on the name's line where
  there is room ("Range 975" beside Charm) and otherwise wraps to a line of its own under the chips,
  aligned with them (Ahri's Q, at 1366 × 768 with the sidebar open: that row 24px taller, the board's
  last row 512 → 536px, the builds' line 557 → 581px); elsewhere a row grows by 0 to 9px. One
  champion with builds at 1366 × 768 ends at 717px (Thresh, 743px with widened text) and 724px
  (Leona, 744px), within the screen with 24px to spare; at 1440 × 900, 714 and 720px. Compare at
  1440 × 900: Ahri and Jinx 671 → 679px, Teemo and Jayce 694px unchanged; at 1280 × 720 (not held
  to one screen) Ahri and Jinx 756 → 780px. Phones grow by a line where a row has a range (390 ×
  844: Ahri 873 → 897px), nothing wider than the screen at 320 to 820px and 200% text.
- **With the builds** (26 Nov 2026, measured again 27 Nov 2026 with the queue choice in the heading,
  `e2e/champion-builds.spec.ts`): one champion's whole board, builds included, ends within the
  screen at 1366 × 768, 1440 × 900, 1920 × 1080 and 2560 × 1440, the sidebar open and folded, with
  12px to spare (the test's margin, so text drawn a little wider in CI's browser never flips it):
  Thresh's board ends near 715px at 1366 × 768 and 1440 × 900 (the band 180px; Leona's 725px at
  1366 × 768 with the sidebar open, her heading on two lines), 791px at 1920 × 1080, 918px at
  2560 × 1440. A queue with too few games and its offer is one or two lines (Thresh in Ranked Flex:
  599px at 1366 × 768). The Master+ source (switched on only in the browser tests), its heading
  wrapping on two lines at 1366 × 768, ends near 746px. At 1280 × 720 with the sidebar open the
  board ends near 788px, past the screen (folded, 715px), the five rows still on it. In Compare the
  builds row comes after R, below the first screen at 1440 × 900 (the board near 1,050px), as the
  brief allows.

## Data

- **Where it comes from.** Each champion's record is read from Riot's Data Dragon by the version-check
  job once per game version and stored in `app_settings` ("champion_abilities",
  `src/server/riot/static/abilities.ts`; [DATA_PIPELINES.md](DATA_PIPELINES.md), "Champion
  abilities"): the passive and Q, W, E, R, each with its name, icon, ranks, base cooldown array,
  `maxammo`, description, text hash, and (rules format 4) each spell's `cost` and Riot's `resource`
  line, the champion's `partype`, `tags` and `stats`, and the patch marks, and (rules format 5, 27
  Nov 2026) each spell's `range` as Riot gives it. Where the server cannot
  reach Data Dragon, the committed offline copy (Data Dragon 16.22.1,
  `src/server/riot/fixtures/champion-abilities.fixture.json`, built by
  `scripts/static/build-ability-fixture.mjs`, which can still download it:
  `node scripts/static/build-ability-fixture.mjs --version 16.22.1`) is stored instead, labelled as
  such, and the first real sync replaces it. Rules format 4, and format 5 after it, made the next
  version-check read all 173 champions again; nothing else is needed (no migration). Until a
  champion is read under format 5 its record has no range and shows none.
- **The reviewed ranges** (`ability-ranges.reviewed.json`, "Ranges") are part of the deployed code,
  read on the server; the version-check counts them against the stored abilities once a version
  (`app_settings` "ability_range_review").
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
  third-party developers", League docs). Names, icons, ranks, base cooldowns, costs, ranges (Data
  Dragon's own number, only where the review of what it measures is current), descriptions, base
  statistics, resource and classes, read once per game version, never while a page renders;
  icons, portraits and splash art are linked from Riot's CDN, never copied. No wiki, no
  CommunityDragon numbers, no new source.
- **Static data, for champions chosen by hand.** "Game overlays that provide static data that is
  available prior to the game" are an approved use; this is a web page with the same static data, the
  same before any game and on a second screen during one. Nothing comes from a game in progress or
  from champion select, nothing names a player, and two champions compared are two references, never
  a verdict on a matchup: aligned side by side, with no better/worse colouring and no "faster" or
  winner wording. Only with a lane chosen (Matchup Intel, [MATCHUP_INTEL.md](MATCHUP_INTEL.md)) does
  the band state differences of the same quantity in neutral words, beside totals of the team's
  completed games from 10 games with their 95% ranges and notes the team's administrators review:
  one pair at a time, chosen by hand, no ranking, counter list or pick suggestion.
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
  (rank columns across the roster, the statistics listed and aligned for two champions, the other
  column's label kept, none for a champion without statistics, the chips' order on every ability),
  `changes.test.ts` (the patch marks, a range change among them), `range.test.ts` (the ranges' rule on
  every branch, and on every spell of the fixture with the committed table: never on a passive, never
  a placeholder, the counts at 16.22.1), `view.test.ts`, `words.test.ts` (no timer or "verified";
  each ⓘ at most 25 words in at most two sentences; the range words, never "estimated" or
  "approximate"), `src/components/champion-lookup/address.test.ts` (both
  champions in the address, Swap, removing either, the old links), `search.test.ts`;
  `src/server/riot/static/abilities.test.ts` (what is read from Data Dragon, the fixture against Data
  Dragon's own numbers, ranges included, the build script); `ability-ranges.test.ts` (the reviewed
  table's shape, one row per spell, every row against the fixture so a stale table fails CI, the
  drafting script's fixed rules giving its automated drafts unless a review decided the row, `--write`
  keeping reviewed rows); `src/domain/champion-lookup/range.test.ts` (every spell of the fixture under
  the rule: 269 reaches, 11 Global; Ahri's Q, E and R);
  `range-review.test.ts` (the version-check's counts); `src/components/admin/static-diff.test.ts`
  (Admin's ranges line).
- Matchup Intel (Compare with a lane): its own tests, listed in [MATCHUP_INTEL.md](MATCHUP_INTEL.md),
  "Tests" (`src/domain/matchup/*.test.ts`, `tests/db/lane-matchups.test.ts`,
  `tests/db/matchup-notes.test.ts`, `tests/db/matchup-queue.test.ts`, `e2e/champion-matchup.spec.ts`,
  `e2e/admin-matchup-notes.spec.ts`).
- Database: `tests/db/champion-abilities.test.ts` (the sync, the per-champion reads, the patch marks;
  rules format 5: ranges stored as given, a format-4 record read again, a range change marked and
  hidden, the counts once per version and table, never on an unchanged run, counts only in the log);
  `tests/db/champion-builds.test.ts` (the counts: only current members' draft games, no remake, both
  teams and both spellings of a position, never an erased player, the item and skill rules the
  domain's, totals only and their size, the champion index in the plan, the section only for
  members with teammates' statistics); `tests/db/champion-builds-demo.test.ts` (the demo's builds,
  the same on every fresh demo).
- Builds, unit: `src/domain/champion-builds.test.ts` (the item rules on Data Dragon 16.22.1's items,
  `tests/fixtures/ddragon-16.22.1-item-builds.json` built by `scripts/static/build-item-builds-fixture.mjs`;
  the starting set; the skill order with six-rank abilities and Udyr; the Wilson bound; the choices:
  a small sample never wins, near-identical builds merged, one build where they agree; the patch
  window, the previous patch alone while the current has no game, the roles and the empty state),
  `src/domain/champion-builds-words.test.ts` (every ⓘ one idea in 25 words, no advice, what was
  counted together, the full build's core in each view), `src/server/champion-builds/query.test.ts`
  (the statement's label in the egress counts, as HOSTING_USAGE.md names it).
- Browser: `e2e/champion-lookup.spec.ts` (the page, its facts, slot keys, chips and costs per rank,
  the ranges (Ahri's Q, E and R, "Global", per rank, none on the passive, a two-ability slot, a number
  that is not the reach or a reach the review could not confirm, the opened row's line, Compare's
  columns each their own),
  the passive's dash, the chips marked in the description, folds by keyboard, the haste field and every
  invalid input, the special cases, unusual champions, "/" and the search, the window, Compare on one
  aligned board, Swap and ✕ on either column, Swap by keyboard keeping its focus, Swap and ✕ waiting
  while a change is on its way (the server's answer held back), a haste typed during a swap kept, the
  base statistics' folds together, level and inside their columns, names never cut or broken, the
  address, phones and tablets side by side, the old links, one screen at every desktop size single
  and dual, the rank columns, phones at 320–430px and 200% text with names whole, axe), with the shared specs
  (navigation, journeys, page budgets, quality, design parity, shared controls, WebKit).
- Browser, builds: `e2e/champion-builds.spec.ts` (icon rows with win and pick rates and the source
  line, both rune trees, each ⓘ by keyboard and touch with its likely range, small samples greyed and
  said, the D6 case never the highest, the queue chosen in the page with no request and kept in the
  address and on reload, the offer of another queue and the focus after it, the honest line naming
  its queue, Compare's parts level row by row with the page's queue in both columns and kept by Swap
  and ✕, phones at 320 and 390 at 100% and 200% with the queue choice and the offer 44px, one screen
  at the desktop sizes with 12px to spare, axe; and the Master+ source over the demo's synthetic
  counts with the browser tests' cookie: not offered without it, chosen in the queue choice, its
  words, the Highest win rate view and its full build, two roles in the address, too few and none,
  Compare level in both views, axe); `e2e/webkit.spec.ts` (the queue choice as the iPhone's own
  picker, the offer a 44px target).
- Builds, unit and database (Release 19): `src/domain/champion-builds.test.ts` (Newcombe's published
  intervals, the D6 rule and its old verdict side by side, the one-player guard, weighted counts,
  queues never pooled, the offer), `src/domain/champion-builds-audit.test.ts`,
  `src/domain/high-elo/*.test.ts`, `tests/db/champion-builds-observe.test.ts` (observeBuild equal to
  the statement), `tests/db/builds-audit.test.ts`, `tests/db/high-elo.test.ts`.
- Production check: `scripts/champion-lookup-facts.mjs` (Ahri: the builds on Ranked Solo/Duo with no
  queue in the address, one queue named, the honest line naming its queue, no Master+ source while
  `/api/health` says its collection is off) and `scripts/builds-facts.mjs` (the populated builds of
  the champions the builds audit found: LIVE_VALIDATION.md, "What it checks").

## For the owner

**The registration's description** (Riot's Developer Portal) still describes Matchup Intel. The
proposed description (RIOT_COMPLIANCE.md, "Proposed description for the registration"; the owner's D1
of 26 Nov 2026) covers everything Release 19 shows or prepares: Champion Intel's static reference,
the ability ranges where reviewed (D3), the builds by queue with their uncertainty rule (D5, D6),
Compare's early-lane band (Matchup Intel's return in this form), and the anonymous high-elo
collection, prepared and switched off until it is reviewed (D2). Its Champion Intel part is, word for
word (`src/server/riot/registration-description.test.ts` keeps the two copies the same):

> Champion Intel, for signed-in accounts, is a static reference for one or two champions chosen by hand: each ability's name, icon, description, cost and base cooldowns per rank from Data Dragon, those cooldowns at an ability haste the reader chooses, by Riot's published formula, each ability's range where Data Dragon's value has been reviewed for the patch, each champion's base statistics from Data Dragon, and the mechanics its ability descriptions name, with Riot's sentence for each. For members who may see teammates' statistics it also shows totals of the rune pages, summoner spells, items and skill orders observed in the team's stored completed games, one queue at a time (Ranked Solo/Duo by default; Ranked Flex, Normal Draft and Clash each on its own, never mixed), of the current patch, or of the previous one too where the current has too few (both teams, counts only, no player named), with their win rates, likely ranges, pick rates and numbers of games, labelled as the team's games and not a global sample, and no advice; a choice is marked as winning more only from 30 games and only where the difference is statistically clear. In Compare, for a lane chosen by hand, it also states the differences between the two champions' Data Dragon values in neutral words, totals of the lane at 10 minutes (gold, experience and CS differences, kills between the two, first blood and results) over the team's stored completed games of that pairing in that role, with the number of games and shown from 10 games, and short notes the team's administrators write and review each patch, labelled as reviewed notes. It shows one pair at a time, with no matchup ranking, counter list, pick suggestion or advice. The same kinds of totals also come, shown apart and labelled as such, from anonymous high-elo games (switched on only after this description is reviewed): about once an hour a background job reads the Challenger, Grandmaster and Master Ranked Solo/Duo ladders of one server per region (LEAGUE-V4), recent Ranked Solo/Duo match ids of a few of those players, and some of those matches and timelines (MATCH-V5), within a small share of the key's rate limits, and reduces them at once to counts per patch, region, role and champion (and lane opponent); no player identifier, name, Riot ID or match id is stored, nothing is shown about any player, and counts older than the previous patch are deleted. Champion Intel's pages make no Riot API request and have no timers or tracking.

Pasting it is the owner's action (docs/HIGH_ELO_EVIDENCE.md, "For the owner", step 1). Where a part
does not ship before the paste, RIOT_COMPLIANCE.md lists the exact clause to delete. At 3,159
characters the whole text is more than twice the registered text's length: if the portal's field refuses it,
tell the session the limit.

**What to expect from "Highest win rate"** (D6): on the team's own games it will almost never appear.
The rule asks for 30 games and a difference that chance cannot explain at 99%; at the team's sample
sizes (sections of 20–300 games) only a difference of 10 points or more in a section of 250 games
has even an 8% chance. That is the honest outcome: under the old rule the switch appeared in 93% of
sections where no build was better. The Master+ source (D2), once switched on, is where it becomes
useful.

**Matchup Intel** (27 Nov 2026, Compare with a lane) adds to what the description must say: its
proposed sentence and the owner's actions (writing and re-reviewing notes in Admin → Matchup notes,
the registration paste, the privacy rows) are in [MATCHUP_INTEL.md](MATCHUP_INTEL.md), "For the owner";
the D1 description (Release 19) carries the sentence into the text above.

**Decisions left to the owner**: whether damage values, scaling and durations should come from a
source beyond Data Dragon (CommunityDragon's game files hold them; RIOT_COMPLIANCE.md permits that
source for rank crests and role icons only); whether the Master+ source should become the builds' default once its samples are large (OB2:
recommended no, revisit after a month of counts); and whether the canonical address should
become `/intel` (it stays `/lookup`, so nothing that links to it changes).

**Ranges** (the owner's decision D3, 26 Nov 2026; built 27 Nov 2026, "Ranges"): shown only where a
committed review of what Data Dragon's number measures is current; abilities cast on the champion
show nothing (the owner's decision). Every spell has been reviewed by two independent automated
reviewers, with two adjudicators where they differed from the drafting rules (not by a person):
269 ranges and 11 "Global" are shown; wherever a reviewer had any doubt, nothing is. The owner may
spot-check rows on the page (open a champion's ability: the opened row says how its range was
decided) and say which, if any, should change, or confirm rows as the team's (reviewer `owner`). After each patch a session runs
the script's `--check`, reviews the rows Riot changed the same way and opens a pull request (about 1
to 10 a patch);
without it only those rows' ranges are hidden, and Admin's count says how many. The registration's
description should name "ranges where reviewed" among Data Dragon's facts (the description lane's
text, RIOT_COMPLIANCE.md).

**Builds: blocked and decided here, for the owner** (25–26 Nov 2026):

- **Global population statistics: built, switched off** (D2, 26 Nov 2026; docs/HIGH_ELO_EVIDENCE.md).
  Riot's API has no aggregate endpoint, so the only legitimate route is sampling other players'
  games. The sampler (ported from `6dfccdd`, retargeted to these builds), its tables (migration
  `0072`), its job, its Admin state and the page's Master+ source are in place and **off**: the Riot
  client has no apex-ladder request and the deployment's switch is unset. Switching on is the owner's
  steps in docs/HIGH_ELO_EVIDENCE.md, "For the owner" (the registration, key type and limits, the
  privacy notice's row, Vercel and Supabase readings, the switch), then the enabling pull request.
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
