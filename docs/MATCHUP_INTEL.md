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
   naming the abilities it rests on ("Renekton W"), which jump to that ability's row and give it
   the focus. The jump goes into the address through the router's own history, so Back after a
   later choice shows the pair it was made on (a browser's own jump to an anchor leaves an entry
   the router does not restore). The briefing says which patch it was checked on ("Checked on
   patch 26.22"). A point that rests on an ability Riot changed after the check is hidden, and the
   page says so in its place, naming the ability ("Hidden: Riot changed Renekton W after this
   briefing was checked."; Data, "Hidden points"). Where no briefing
   exists, one calm line says so ("No curated briefing for Garen vs Darius yet") and that what
   follows is the enemy's general reference. It also links the curated matchups that do exist for
   your champion.
2. **The enemy's abilities**, one row each for P, Q, W, E and R:
   - the icon, the key and the name;
   - the base cooldown at each rank (one line per form for a champion who transforms), or why
     there is no number, and under it where it comes from: "Checked on patch 26.22", or "Riot's
     data, not reviewed" (see Cooldowns);
   - the wait between casts, refunds and attack resets; recasts;
   - the checked facts as badges (crowd control, mobility, defence, sustain, damage, empowerment,
     interaction, exception), each with an icon and a word, never colour alone, and who has the
     effect where its kind would not say ("· on the target");
   - once Riot's data changed after the check: Riot's own line, then the notes under a flag that
     says they may be out of date, their cooldown as checked included;
   - Riot's short description;
   - a details part (the native `details` element) with the longer notes and each fact's source.
3. **Interactions**: the matchup's first, then the enemy's interaction and exception facts. A
   matchup interaction on an ability Riot changed since is hidden and said, as a briefing point is.
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
  `pageName`, `src/lib/nav.ts`). Each pair chosen is an entry in the browser's history, so the
  browser's Back steps through them; the top bar's Back, named after Resources, goes past them to
  Resources (`backSteps`).
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
  `loadChampionAbilities` (`src/server/matchup-intel/abilities.ts`). Each ability's record holds
  its spell id, name, icon, ranks, cooldown array, charges (Data Dragon's `maxammo` above 0, else
  none) and Riot's short description. How they are stored and refreshed:
  [DATA_PIPELINES.md](DATA_PIPELINES.md), "Riot static data (Data Dragon)".
- **Icons** are linked from `https://ddragon.leagueoflegends.com/cdn/<version>/img/spell/<file>`
  (`img/passive/` for the passive), 48px and lazily loaded. The key on a plain tile stands in where
  one cannot load.
- **Curated notes** (`src/server/matchup-intel/curated/`: `getChampionNotes`, `getMatchupNotes`,
  `curatedEnemiesFor`) are committed and reviewed; see Curated notes below. Every fact names its
  source, and each set of notes says the patch it was checked on. A source keeps its link only when
  it is an https address on `wiki.leagueoflegends.com`, `ddragon.leagueoflegends.com` or
  `developer.riotgames.com` (`safeSourceUrl`); any other link is dropped and the title stays. A
  source may also give its `kind` (`wiki-ability`, `wiki-champion`, `wiki-reference`, `ddragon`,
  `riot-docs`) and the `revisionTime` of the wiki revision read; the ability details give that
  revision's day ("revision of 23 Sep 2026").
- **Facts** say who has the effect where the notes give it (`appliesTo`: `self`, `target`,
  `allies`, `area`). A badge adds it only where the fact's kind would not say it: crowd control and
  damage fall on the target, the other kinds on the champion ("Fails on spell shields · on the
  target"). Tags from `FACT_TAGS` (`src/domain/matchup-intel/types.ts`) name the mechanics a fact
  is about. The page carries them as data (`data-tags` beside each badge), not as words: the
  badge's own label says the same.
- **The patch**: the game's current patch by its public name (26.22 for Data Dragon 16.22.1),
  unknown while the game data is the offline fixture. Ability data older than the current patch is
  said once above the abilities.
- **Freshness** of curated notes, against Riot's record of each ability they cover (`abilityChanges`,
  `abilityFreshness` and `weakestFreshness`, `src/domain/matchup-intel/cooldown.ts`). What is
  compared is the cooldown array (`ddragonCooldown`) and, where the notes record them, the spell
  id, name, ranks and charges (`ddragonIdentity`): a rework can keep its cooldowns (Mel's Q was
  renamed in 16.22.1 with the same array). The identity is written out, not hashed, so a reviewer
  can read it against Riot's file; a hash would also move with fields the page never shows. The
  description is not compared: the stored one is the index's cleaned text, so a change in the
  cleaning would read as Riot's.
  - checked on the data's own version, and nothing compared changed: "current";
  - checked on an earlier version, and nothing compared changed since: said only as "Checked on
    patch N";
  - the data held is older than the check: a difference is the data's age, not Riot's change, so
    this too is said only as "Checked on patch N", and the notes stay the line;
  - something compared changed after the check: "changed since". The ability's line is then only
    what Riot's data supports (Cooldowns, below), and its notes follow under "Notes from patch
    26.22 · may be out of date: Riot changed its cooldown since", their cooldown as checked
    included ("As checked: 16 / 14 / 12 / 10 / 8 s · starts when the effect ends"). The champion's
    line says how many changed ("Riot changed one ability after the check: its notes are
    flagged").

  A briefing's freshness comes from the abilities it rests on, judged against the matchup's own
  check (`matchupAbilityFreshness`, `src/server/matchup-intel/view.ts`). A matchup holds no numbers
  of its own, only the Data Dragon version it was checked on; the numbers a person took are the
  champion notes', on their own version. So, for each ability:
  - the data shown is the matchup's version: "current", whichever version the champion's notes
    were checked on;
  - the champion's notes took their numbers on the matchup's version or later, and Riot's record
    moved since them: the change came after the matchup's check, so it is "changed since";
  - anything else (notes checked before the matchup, data older than the notes, no notes) is not
    known, and is said only as "Checked on patch N".

  So a matchup re-checked on a new patch is current even where a champion's older notes are
  flagged, and numbers that moved between a matchup's check and a later check of the champion's
  notes go unflagged: telling those apart needs the matchup's own numbers, which it does not hold.

- **Hidden points.** A briefing point, the threat, the opportunity or one of the matchup's
  interactions that rests on an ability "changed since" its check is hidden (`matchupIntel`,
  `view.ts`): its words stay on the server, and the page says in their place what changed, with
  chips to those abilities' rows:
  - in place of the threat or the opportunity: "Hidden: Riot changed Renekton W after this
    briefing was checked.";
  - after the lane points shown: "One point is hidden: Riot changed Renekton W after this briefing
    was checked.";
  - when nothing is left to show: "This briefing is hidden: Riot changed Renekton W after it was
    checked.";
  - in the Interactions panel: "One interaction is hidden: Riot changed Renekton W after it was
    checked."

  The points that rest on nothing that changed keep "Checked on patch N", and the briefing's
  freshness is that of what it shows. The enemy's facts from a changed ability keep their row's
  "Changed since the check" in the Interactions panel. Nothing is hidden silently.

## Curated notes

Riot's Data Dragon gives every champion's ability names, icons, ranks and base cooldown arrays. It
does not say when a cooldown starts, what a recast needs, what crowd control an ability carries or
what cancels it. The curated notes add that, in two layers. A person writes each file from cited
sources, and it is reviewed in a pull request. Nothing in them is generated.

| Layer | Files | What it holds |
|---|---|---|
| Champion notes (Layer 1) | `src/server/matchup-intel/curated/champions/<ChampionId>.ts`, one `ChampionNotes` each | For each ability (P, Q, W, E, R): Data Dragon's cooldown array as checked, how the cooldown works (when it starts, recasts), and facts, each with its source: crowd control, mobility, defences, sustain, the damage that matters in lane, interactions and exceptions. Level notes where a source states one. |
| Matchup notes (Layer 2) | `src/server/matchup-intel/curated/matchups/<You>-vs-<Enemy>.ts`, one `MatchupNotes` each | Your champion against one enemy, in that direction only: a threat, an opportunity, lane points and interactions, each naming the abilities it rests on. |

The types are in `src/domain/matchup-intel/types.ts`. The page reads the notes through
`src/server/matchup-intel/curated/index.ts`:
- `getChampionNotes(id)` returns a champion's notes;
- `getMatchupNotes(you, enemy)` returns the notes for that direction only;
- `curatedEnemiesFor(you)` lists the enemies a matchup is written for.

They return `null` or an empty list where nothing is written. Without champion notes the page shows
Data Dragon's data alone. Without matchup notes it shows the enemy's champion notes.

The index imports every file statically, and it is server-only. No client component imports it:
`src/app/client-imports.test.ts` refuses any path from browser code into `src/server`, apart from
the few shared modules it lists. The browser gets only the plain view built from it.

Curated so far, on 16 Nov 2026 for patch 26.22 (Data Dragon 16.22.1):
- champions: Ambessa, Gwen, Mordekaiser, Ornn, Renekton and Riven;
- matchups: the three validation pairs, Ambessa vs Renekton, Gwen vs Ornn and Riven vs Mordekaiser.

### Rules

These are the owner's and Riot's rules. `curated.test.ts` checks the ones a test can (below); the
review checks the rest.

**Sources**
- Every fact, level note and interaction names the `Source.id` it rests on. Every source is one of
  these:
  - a League of Legends Wiki page, with the `revision` id it was read at and the licence
    `CC BY-SA 3.0`. That is an ability's data template
    (`https://wiki.leagueoflegends.com/en-us/Template:Data_<Champion>/<Ability>`) or the
    champion's page;
  - one of Riot's pages, on Data Dragon (`ddragon.leagueoflegends.com`) or
    `developer.riotgames.com`, licence `Riot Games`.
- The wiki is read by hand, in a browser. Its Terms of Use forbid automated use without consent,
  so no script, job or page requests it.
- Never invent a number, an interaction or a matchup claim. What no source states is left out, and
  the file's header says what was left out and why. A fact that only follows from two others, but
  is stated nowhere, is left out too. Fewer points are better than one that is not grounded.

**Text**
- Use UNIIVERSE's own words, short and plain, in British English. Never copy a wiki sentence.
- Plain text only: no wiki markup, no `<` or `>`, no control characters, and at most 300
  characters a text. A badge label is a few words, and a detail is one sentence.

**Cooldowns** (how they are shown: `src/domain/matchup-intel/cooldown.ts`)
- `ddragonCooldown` is Data Dragon's `cooldown` array for the version checked, copied exactly. The
  passive's is `[]`: Data Dragon never gives a passive a cooldown.
- A `per-rank` cooldown repeats that array. Its `starts` comes from the wiki's cooldown-start field
  or its cooldown notes, and is `null` where the source states none: nothing is assumed. Use
  `"on-cast"` only when the source says so, with a comment saying which.
- `ddragonIdentity` is Data Dragon's spell id, name, ranks and charges for the version checked,
  copied from `ddragon-<version>.identity.json` (optional while the files are filled in).
- Charges (per rank where they differ), recharge times, forms, recast windows and counts, static
  cooldowns, waits between casts, refunds and resets go in only as the wiki gives them: in the
  `cooldown` spec and `modifiers`, and in `cooldownNote` only what fits neither.
- A passive gets a cooldown only when the wiki gives one. Otherwise its notes have none, and the
  page says Riot's data has none, never "no cooldown".

**Facts** (`Fact.kind`, shown as a badge)
- `crowd-control`: the effect (stun, knock-up, slow, root, fear, pull…), and its duration where the
  source states it.
- `mobility`: dashes and blinks.
- `defence`: shields, damage reduction, unstoppable, untargetable, spell shields, displacement
  immunity.
- `sustain`: heals, life steal, omnivamp.
- `damage`: only damage that matters in the matchup (true damage, a share of maximum health).
- `empowerment`: what strengthens the champion itself (bonus attack damage, an empowered next
  attack), which `damage` would misname as damage dealt.
- `interaction`: what cancels, blocks or interrupts it.
- `exception`: unusual mechanics.

**Level notes**
- Only what a source states, such as an unlock or a step at a stated level.
- No power-spike rankings, and no "ultimate at 6, 11 and 16" unless a source states it for that
  champion.

**Matchup notes**
- One direction only: Ambessa against Renekton is not Renekton against Ambessa.
- A matchup has `briefing.threat`, `briefing.opportunity`, `briefing.lane` and `interactions`.
  Write two to four lane points where the two kits support them. The test refuses none, and more
  than four.
- Each point is one or two sentences: a consideration grounded in specific mechanics of the two
  kits. It names the abilities it rests on (`basedOn: ["Renekton.W", …]`), and each of those has
  notes in its champion's file.
- Considerations, never instructions. Riot's policy lets a product "highlight decisions that are
  important" but not "dictate player decisions". No win rates, tiers, counter lists or guesses.

**Verification**
- Every file carries `verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" }`:
  the public patch, the Data Dragon version the arrays were compared with, and the day.

### Adding a champion

1. Read the champion's pages on the wiki by hand: `Template:Data_<Champion>/<Ability>` for the
   passive and each of the four abilities. Note each page's revision id, which its history shows.
2. Copy the cooldown arrays from Riot's champion file for the current version,
   `https://ddragon.leagueoflegends.com/cdn/<version>/data/en_US/champion/<ChampionId>.json`.
   There, `spells[0]` to `spells[3]` are Q, W, E and R.
   - Put each array in the ability's `ddragonCooldown`.
   - Add them to `ddragon-<version>.cooldowns.json`, beside the index: one line per champion,
     with `P` as `[]`.
   - A new version gets its own file of the same shape, whose `_note` says where the arrays came
     from.
   - Copy each ability's id, name, `maxrank` and `maxammo` (as charges above 0, else `null`; the
     passive has no id, 1 rank and no charges) into its `ddragonIdentity` and into
     `ddragon-<version>.identity.json`, the same way.
3. Write `champions/<ChampionId>.ts`, named with Data Dragon's id (`MonkeyKing` for Wukong). It
   has `export default` a `ChampionNotes` with:
   - all five slots;
   - its sources;
   - a header that gives the cooldown starts and what was left out.
4. Import it in `index.ts`, and add it to `CHAMPIONS`.
5. Run `pnpm exec vitest run src/server/matchup-intel`, then `pnpm verify`.

### Adding a matchup

1. Both champions need champion notes first, because a point can rest only on an ability with
   notes.
2. Write `matchups/<You>-vs-<Enemy>.ts` with Data Dragon's ids. The other direction is a separate
   file, written from that side.
3. List the pages the points rest on as its sources. Each has the same id, address and revision
   as in the champion's notes, which the test checks.
4. Import it in `index.ts`, add it to `MATCHUPS`, and run the tests.

### When a patch changes them

Riot's numbers refresh by themselves. The version-check job stores each new Data Dragon version's
abilities (`src/server/matchup-intel/abilities.ts`). The page compares each ability's current
record with the notes' `ddragonCooldown` and, where given, `ddragonIdentity` (its id, name, ranks
and charges), using `abilityFreshness` in `src/domain/matchup-intel/cooldown.ts`:
- **current**: checked against the version the page shows, and nothing compared has changed;
- **unchanged since**: checked on an earlier version, and nothing compared has changed since (or
  the data held is older than the check). It is shown as "checked on patch 26.22", never as
  current, because crowd-control durations, ranges and interactions can change without the record
  moving;
- **changed since**: the record moved after the check. The line shows only what Riot's data
  supports, the notes are flagged as possibly out of date, and the briefing points and matchup
  interactions that rest on the ability are hidden (Data, above).

A champion's label is its weakest ability's (`weakestFreshness`). A matchup's is judged against its own check, ability by ability (Data, Freshness, above).

Re-checking is a person's work, in one pull request per pass:
1. Find the curated abilities whose record changed (the page labels them "Changed since the
   check"). Read the patch notes for changes the record does not show.
2. Read those abilities' wiki pages again by hand. Update the facts, the revision ids,
   `ddragonCooldown`, `ddragonIdentity` and `verified`.
3. Add `ddragon-<version>.cooldowns.json` and `ddragon-<version>.identity.json` for the version
   checked against. The test needs them for every version a champion's notes cite.
4. Re-read the matchup points that rest on a changed ability (`basedOn`), then update or remove
   them.

Until that merges, the labels say what is known. Nothing is estimated.

### What the test checks

`src/server/matchup-intel/curated/curated.test.ts` runs in `pnpm verify`. It refuses:
- a file in `champions/` or `matchups/` that the index does not serve under the ids in its name,
  or an index entry with no file;
- a champion id that is not in `src/server/riot/fixtures/champions.fixture.json`;
- champion notes without all of P, Q, W, E and R, or with any other slot;
- a `ddragonCooldown` that is not Data Dragon's array in `ddragon-<version>.cooldowns.json`, or
  notes checked against a version with no such file;
- a `ddragonIdentity` whose id, name, ranks or charges are not Data Dragon's in
  `ddragon-<version>.identity.json`, or one given for a version with no such file;
- a saved Data Dragon file that is not well formed, or that disagrees with the committed offline
  fixture (`src/server/riot/fixtures/champion-abilities.fixture.json`) of the same version;
- a `per-rank` cooldown whose seconds differ from `ddragonCooldown`;
- a cooldown spec the page cannot show as written (it asks the display rules,
  `curatedCooldownDisplay`): numbers of seconds, whole charge counts above 0, one value or one per
  rank, levels from 1 to 18 paired with the values, two or more forms; a start outside the
  vocabulary, or forms with the same name;
- a modifier the page would leave out: a refund whose amount is not one value or one per rank, a
  share over 100%, or with nothing saying what gives it; a wait between casts that is not above 0;
- a fact's tag that is not in `FACT_TAGS` or is named twice, or a subject that is not `self`,
  `target`, `allies` or `area`;
- any of these source faults:
  - a fact, level note or interaction that cites a source its file does not list;
  - a source listed twice, or one that is not an https page on the three hosts above;
  - a source with the wrong licence for its host, or a wiki page without its revision;
  - a source whose `kind` does not fit its page, or whose `revisionTime` is not a time in UTC, has
    no revision, or comes after the day the notes were checked;
  - a matchup source that differs from the champion notes' source of the same id;
- a `basedOn` or interaction reference that is not an ability, with notes, of one of the two
  champions;
- any text that contains `{{`, `<`, `>` or a control character, is empty, or is over 300
  characters;
- `verified` fields of the wrong shape, or a patch that is not the Data Dragon version's;
- a matchup without a threat, an opportunity and at least one lane point, or with more than four;
- a level note outside levels 1 to 18, or a recast count below 1;
- a missing validation matchup.

Each rule on the notes has a case that proves it fires. What no test can check is the review's:
the wording, copying, whether a point dictates play, and whether each fact matches the page it
cites.

## Cooldowns

The rules are in `src/domain/matchup-intel/cooldown.ts` (`cooldownDisplay`, and
`ddragonCooldownDisplay` for Riot's data alone), the words in
`src/components/matchup-intel/wording.ts`, and the numbers are written by `formatCooldowns` and
`formatPerRank` in `src/lib/format.ts`. A number is shown only when the data holds it; what is not
known is said as not known, never estimated.

**Which line.** While an ability's curated notes still describe Riot's record (not "changed
since", Data above), their cooldown spec is the line, as checked. Otherwise, or where the notes
give no spec, or a spec the page cannot read, the line is what Riot's data alone supports, with no
claim about when it starts. Riot's array passes only these rules, in this order:

1. the passive: Data Dragon has no passive cooldown, so there is none to show;
2. the exception list (`NOT_THE_COOLDOWN`): arrays the saved evidence shows are not the cooldown,
   each pinned to the array that was checked, so a different array is judged by the rules below:
   - Rengar's Q, W and E, 0.25 s at every rank, reported to Riot as wrong (RiotGames/developer-relations
     issue 787, closed 26 Apr 2025, still 0.25 in 16.22.1);
   - Corki's R (2 s), Teemo's R (0.25 s) and Gangplank's E (0): the wait between casts of an
     ability that holds charges, whose recharge the wiki gives (20 s; 35 to 25 s; 17 to 13 s);
3. `maxammo` above 0: with charges the array is the wait between casts, and the count is not
   reliable alone (Rengar's Q, W and E list 1; whether Warwick's W and LeBlanc's R, which list 2,
   hold charges is not verified), so neither a number nor a count is shown;
4. a value that is not a number of seconds (malformed data);
5. a name with two abilities (" / "): one array for the two forms of a champion who transforms
   (Jayce, Nidalee, Elise, Gnar, Rek'Sai) or the two parts of an ability cast again (Ambessa's Q,
   Lee Sin's Q, W and E); Data Dragon does not tell them apart. Where curated notes checked one
   array per rank for the slot, a later array is read as that ability's, unless Riot's id, name or
   ranks moved from what the notes recorded (`ddragonIdentity`);
6. an empty or all-zero array: a placeholder, not "no cooldown";
7. not one number per rank;
8. everything else: Riot's array per rank.

**What the line says, and under it where it comes from:**

| Case | The line | Under it |
| --- | --- | --- |
| Curated per rank, Riot's record unchanged | "16 / 14 / 12 / 10 / 8 s"; the same value at every rank "13 s at every rank" | "Checked on patch 26.22" ("Checked" where the patch is not known) |
| When it starts, where the source states it (on cast, or no start stated, goes without saying) | "· starts after the first cast", "· starts after the last recast", "· starts when the effect ends", "· starts after the channel" | |
| A static cooldown (`modifiers.static`) | "· unaffected by ability haste" | |
| Curated charges, one count or one per rank | "3 / 4 / 5 charges · one back every 35 / 30 / 25 s"; "2 charges · one back every 20 s"; "1 charge" | "Checked on patch 26.22" |
| Curated forms, one line each | "Hammer: 16 / 14 / 12 / 10 / 8 / 6 s", then "Cannon: 8 s at every rank" | "Checked on patch 26.22" |
| A passive's own cooldown, where a source states one | by level: "12 / 9 / 6 s · at levels 1 / 7 / 13", or "· by level" without the levels, "6 s at every level"; by rank: "30 / 25 / 20 s · by its rank"; and "· per target", "· unaffected by ability haste", "· starts when it takes effect", "· starts when the effect ends" ("10 s · per target · unaffected by ability haste") | "Checked on patch 26.22" |
| No cooldown (curated) | "No cooldown" | "Checked on patch 26.22" |
| Riot's record changed after the check | Riot's own line (the rows below), never the notes' start; the row's name has "Changed since the check" | "Riot's data for patch 26.23, not re-checked" ("Riot's data, not re-checked" where the data's patch is not known; "Not re-checked" under a line without a number); then the notes, under "Notes from patch 26.22 · may be out of date: Riot changed its cooldown since" (its cooldown, spell id, name, ranks or charges), with "As checked: …" |
| Riot's data, a number | "18 / 17 / 16 / 15 / 14 s" | "Riot's data, not reviewed" |
| Riot's data, the passive | "Cooldown not in Riot's data", never "none" | "Not reviewed" |
| Riot's data, charges (rule 3, and Corki's R, Teemo's R, Gangplank's E) | "Riot's data lists charges but not their recharge" | "Not reviewed" |
| Riot's data, known to be wrong (Rengar's Q, W, E) | "Riot's number for this ability is known to be wrong" | "Not reviewed" |
| Riot's data, a value that is not seconds | "Riot's cooldown data can't be read" | "Not reviewed" |
| Riot's data, two abilities in one slot | "Two abilities share this slot in Riot's data" | "Not reviewed" |
| Riot's data, an empty or all-zero array | "No cooldown number in Riot's data" | "Not reviewed" |
| Riot's data, not one number per rank | "Riot's data doesn't give one number per rank" | "Not reviewed" |
| No record of the ability | "No cooldown data held yet" (a champion with no abilities stored shows "Ability details arrive with the next game-data update" instead of rows) | |

A line without a number has nothing under it where the ability has curated notes that are not
flagged: they are the place that says more (a passive whose wiki page gives no cooldown, for
example).

**The modifiers** follow the line, one short line each, only as the source states them:
- "0.3125 s between casts, unaffected by ability haste" (`lockout`);
- "Refunds 25 / 35 / 45 / 55 / 65% of the cooldown: her first attack within 4 seconds", or
  "Refunds 2 s of the cooldown: …" (`refund`: a share or seconds, one value or one per rank, and
  what gives it back);
- "Resets the basic-attack timer" (`resetsAttack`).

`cooldownNote` holds the rest, in words. Once Riot's record changed, the modifiers go with the
flagged notes.

Decimals are written as the numbers have them, up to four ("0.25 s", "0.3125 s"): a checked value
is never rounded into another.

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
