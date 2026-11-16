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

1. **The ten-second briefing**, where a curated one exists for this pair, in this direction: the
   threat, the opportunity and a few points about the lane. Its title is "The ten-second briefing":
   the slots above it show the pair (a screen reader hears the pair in the heading). Each point has
   chips naming the abilities it rests on ("Renekton W"), which jump to that ability's row and give
   it the focus; a champion with no ability rows on the page (none stored yet) gets plain labels,
   never links that lead nowhere. The jump goes into the address through the router's own
   history, so Back after a later choice shows the pair it was made on (a browser's own jump to an
   anchor leaves an entry the router does not restore). The briefing says which patch it was
   checked on ("Checked on patch 26.22"), and once a later patch is out, that nobody has checked it
   again for it ("Not re-checked for 26.23"). A point that rests on an ability Riot changed after
   the check is hidden, and the page says so in its place, naming the ability ("Hidden: Riot changed
   Renekton W after this briefing was checked."; Data, "Hidden points"). More than two patches
   after its check the whole briefing is hidden, and says why (Data, "Freshness"). Where no briefing
   exists, one calm line says so ("No curated briefing for Garen vs Darius yet") and that what
   follows is the enemy's general reference, naming only what it holds: "abilities and base
   cooldowns from Riot's data" for an enemy with no curated notes (Darius), "abilities, base
   cooldowns and checked notes" for one with notes, and nothing more where no abilities are stored
   (`generalReferenceWords`). It also links the curated matchups that do exist for your champion.
2. **The enemy's abilities**, one row each for P, Q, W, E and R (on a phone the icon sits beside the
   key, the name and the cooldown, and the rest takes the row's whole width under them):
   - the icon, the key and the name;
   - the base cooldown at each rank (one line per form for a champion who transforms), or why
     there is no number, and under it where it comes from: "Checked on patch 26.22" ("· not
     re-checked for 26.23" once a later patch is out), or "Riot's data, not reviewed" (see
     Cooldowns);
   - the wait between casts, refunds and attack resets; recasts;
   - the checked facts as badges (crowd control, mobility, defence, sustain, damage, empowerment,
     interaction, exception), each with an icon and a word, never colour alone, and who has the
     effect where its kind would not say ("· on the target");
   - once Riot's data changed after the check: Riot's own line, then the notes under a flag that
     says they may be out of date, their cooldown as checked included;
   - Riot's short description;
   - a details part (the native `details` element) with the longer notes and each fact's source.
3. **Interactions**: the matchup's first, then the enemy's interaction and exception facts, folded
   under one line ("Renekton's interactions and exceptions · 7") until opened: each is also on its
   ability's row, as a badge with its sentence and source in the row's details. The line carries a
   flag when any of them is from an ability Riot changed since the check. A matchup interaction on
   an ability Riot changed since is hidden and said, as a briefing point is, and all of them are
   once the briefing is too old to show.
4. **Level notes**: the levels at which something notable becomes possible, for both champions,
   each flagged ("Changed since the check") once Riot changes the ability it rests on.
5. **Your own champion's abilities**, collapsed until asked for.
6. **A quiet footer** (`matchup-footer.tsx`):
   - "Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22)"; each
     champion's own version when the two differ ("… 16.23.1 (patch 26.23) for Mordekaiser; Riot Data
     Dragon 16.22.1 (patch 26.22) for Riven"), and "an offline copy of Riot Data Dragon 16.22.1
     (patch 26.22); the game's current patch is not known" for the copy committed with the app;
   - the day and patch the curated notes on the page were checked, once when they share them;
   - the wiki's credit (Compliance): the pages the notes are written from, each once by its title
     and linked, folded into one line until opened; their authors; the licence; and that the
     wiki does not endorse the page;
   - "A static reference for preparation: no live tracking";
   - Riot's notice, the same words as the rest of the app (`riotLegal`).

Its sizes are rem, so they follow the reader's text size. On a phone the two sides are compact, so
the briefing's threat starts on the first screen (whole at 390 by 664, its first line at 320 by
568, above the tab bar: `e2e/matchup-intel.spec.ts`): a small portrait above the label and the name
on a 320 or 375px phone, beside them from a row of 22rem (a 384px phone), the two sides mirrored
around the swap and as tall as each other. On a phone at a large text size, where side by side
would leave a column a word wide, the two pickers stand one above the other with the swap between
them (under 14rem: 200%, or 150% up to 375px wide), and an ability row puts its icon above its
words and a level note its level above it (under 16rem: from 150%, or 125% on a 320px phone). The
picker's roster has columns in rem as well, so its portraits and names grow with the text, and a
name takes two lines rather than being cut. At 200% on a 390px phone nothing on the page is cut or
reaches past its box, in every state and in the picker window (`e2e/matchup-intel.spec.ts`).

The page also has a state for each of these:

- **Nothing chosen**: what to do, and links to the curated briefings so far.
- **One side chosen**: with only the enemy, its general reference and a way to choose your champion;
  with only yours, a prompt to choose the enemy and the curated matchups for your champion.
- **No ability data stored yet** for a champion: "Ability details aren't stored yet", and that they
  are read from Riot's Data Dragon once per game version.
- **A stored record that cannot be read** (not in the shape the page reads): said as that ("Riot's
  ability data for Riven could not be read"), never as missing.
- **Ability data older than the current patch**: said once, above the abilities, naming whose it is
  when only one champion's is ("Riven's ability data is from patch 26.22; the game is on patch
  26.23."): a champion whose file could not be read keeps its older record beside the other's
  current one.
- **The offline copy** (stored when Riot's servers could not be reached on a first start): the
  panel says "Offline copy of Riot Data Dragon 16.22.1", and the footer that the game's current
  patch is not known.
- **A choice on its way**: the slots show it at once, a line under them says what is loading
  ("Loading Riven vs Mordekaiser…"), and the page under them dims and is out of reach (`inert`)
  until the server's page arrives. A curated pair's link does the same. A screen reader then hears
  what came ("Riven vs Mordekaiser: curated briefing, checked on patch 26.22. Mordekaiser's
  abilities follow."), from a live region that is always there.
- **The page failed** (the roster or the abilities could not be read, with nothing cached to stand
  in): "Matchup Intel could not load", with Try again (the page read afresh) and Start again (no
  champions chosen), inside the Resources tabs (`error.tsx` beside the page).
- **A champion the roster does not know** in the address: it is left out and the page says so,
  never repeating what the address said. A repeated parameter (`?vs=a&vs=b`) reads its first value.

The data comes in two layers, kept apart so each can improve without the other
(`src/domain/matchup-intel/types.ts`):

- **Champion intelligence**: Riot's Data Dragon for every champion, plus the curated notes on one
  champion's abilities.
- **Matchup intelligence**: curated notes for your champion against one enemy, in that direction
  only.

The page generates nothing: it shows Riot's Data Dragon data, labelled "not reviewed" where nobody
has checked it, and the curated notes committed with the code. The notes go through a pull
request, where a person checks them before they ship. The first batch (16 Nov 2026) was drafted and
cross-checked by AI agents: the owner's review in this feature's pull request is its check by a
person (For the owner, step 2).

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
  opens a picker window (`DetailModal` "standard", the whole screen on a phone); a tap on a slot,
  or on the page's prompt for it, before the page's code has run is kept and opens it once the
  code runs (`data-early`, `src/components/early-taps.ts`). The window has:
  - a 16px search that filters as you type, by name, ignoring case, accents, spaces and
    punctuation ("kha" finds Kha'Zix, "wu" Wukong, "dr m" Dr. Mundo), then by a name's initials
    ("tf" Twisted Fate, "mf" Miss Fortune, "lb" LeBlanc) and a short reviewed list of nicknames
    ("j4", "asol", "ww", "gp": `NICKNAMES` in `search.ts`), after every name match. The count of
    what it found is said to screen readers as it changes. Its band stays pinned at the window's
    top, over the body's padding, so no portraits show above it. It is not the shared
    `SearchInput`, on purpose: 16px at every width (a tablet's Safari zooms into smaller text), a
    44px clear button with a mouse too, which hands the focus back to the field, and Escape that
    clears before it closes;
  - with nothing typed, the champions chosen lately on that side (Recent);
  - for the enemy, the curated matchups that exist for your champion;
  - then the whole roster (`ChampionGrid` without its own toolbar).

  Enter takes the first match. Escape clears the search, then closes the window. A choice goes into
  the address at once (`router.push`): the slots show it while the page under them dims until the
  server's page arrives (a curated pair's link goes the same way, `PairLink`).
- **Remembered on this device, for this account**: the champion you choose as yours, and the last
  eight champions on each side. They live in `localStorage` under `uniiverse.matchup-intel.v1`
  followed by the signed-in account's marker (`perAccountKey`, `src/components/account-storage.ts`,
  as a picker's recent champions are), so two people who use one browser in turn never see or
  forget each other's; champion ids only, never sent anywhere. With no champion of yours in the
  address, the page offers the remembered one (Use or Forget) and never assumes it. While it is
  shown, the page says it is remembered. A champion that came from a link can be remembered with
  one tap (a button that looks like one, with a bookmark icon).

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
  - the cached roster, current patch and list of patches (a few dozen short rows, cached for a
    minute, to count the patches since a check);
  - the stored abilities of at most the two champions chosen;
  - Branding's names, from the cache the app's frame has just filled.
- The curated notes are committed with the code, so reading them costs no request.
- No component fetches data in the browser (choosing a pair is a navigation, rendered on the
  server), and there is no `next/image`. Outside the app itself, the browser loads only the champion
  portraits and ability icons, from Data Dragon's CDN (below), as every page with champion art does.
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
  one cannot load. Champions' portraits come from the same CDN (`img/champion/`), with two letters
  standing in where one cannot load.
- **Curated notes** (`src/server/matchup-intel/curated/`: `getChampionNotes`, `getMatchupNotes`,
  `curatedEnemiesFor`) are committed and reviewed; see Curated notes below. Every fact names its
  source, and each set of notes says the patch it was checked on. A source keeps its link only when
  it is an https address on `wiki.leagueoflegends.com`, `ddragon.leagueoflegends.com` or
  `developer.riotgames.com` (`safeSourceUrl`); any other link is dropped and the title stays.
  Every source gives its `kind` (`wiki-ability`, `wiki-champion`, `wiki-reference`, `ddragon`,
  `riot-docs`), and every wiki source the `revisionTime` of the revision read; the ability details
  give that revision's day ("revision of 23 Sep 2026").
- **Facts** say who has the effect (`appliesTo`: `self`, `target`, `allies`, `area`; the notes
  always give it). A badge adds it only where the fact's kind would not say it: crowd control and
  damage fall on the target, the other kinds on the champion ("Fails on spell shields · on the
  target"). Tags from `FACT_TAGS` (`src/domain/matchup-intel/types.ts`) name the mechanics a fact
  is about. The page carries them as data (`data-tags` beside each badge), not as words: the
  badge's own label says the same.
- **The patch**: the game's current patch by its public name (26.22 for Data Dragon 16.22.1),
  unknown while the game data is the offline fixture. It comes from Data Dragon's own list of
  versions, through the version check, so it is never ahead of Data Dragon. Each champion's ability
  data is judged by its own version (a champion whose file could not be read keeps an older record
  beside the other's current one): data older than the current patch is said once above the
  abilities, naming whose it is when only one champion's is, and the footer gives each champion's
  version when they differ. Records from the committed offline copy are said to be that.
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

  `curated.test.ts` holds a matchup and the notes of each champion it rests on to one Data Dragon
  version (Curated notes, Rules), so for the committed notes the numbers the matchup was checked
  with are exactly those notes', and "changed since" means Riot moved them after both checks. The
  cases for notes on another version only keep notes from anywhere else from claiming more than is
  known.

  Riot's record cannot show most changes (a crowd-control duration or a range sits behind its
  tooltips' placeholders), so a check also ages by patch, whatever Riot's records say (`recheckOf`
  and `MAX_PATCHES_UNCHECKED`, `view.ts`). The newest patch the page knows is the later of the data's
  (both champions', for a matchup) and the game's current one; the patches since the check are
  counted by the patches the app has stored (`listPatchesDesc`), never fewer than the numbering
  shows (16.22 to 16.25 is 3; across a season, 16.22 to 17.2 is at least 2), so a new season never
  reads as hundreds of patches. With the game's patch not known (the offline fixture) nothing is
  counted. Then:
  - one or two patches since: everything shows, and each label says nobody has checked it again
    for that patch: "Not re-checked for 26.23" beside the briefing's and the notes' "Checked on
    patch 26.22", and "Checked on patch 26.22 · not re-checked for 26.23" under each checked
    cooldown;
  - more than two (the default the code follows; the owner may change it, For the owner): the
    briefing is hidden whole, its words kept on the server ("This briefing is hidden: it was
    checked on patch 26.22, three patches ago, and not since. It shows again once a person checks
    it."), and its interactions with it ("One interaction is hidden: …"); the champion notes still
    show, flagged ("Checked three patches ago: may be out of date"), on their panel's line and on
    the level notes'.

  A level note names the abilities it rests on (`basedOn`), and once Riot changes one of them after
  the check, it is flagged as that ability's notes are ("Changed since the check").

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
  "Changed since the check" in the Interactions panel (and on its folded line). A briefing hidden
  for its age is said the same way (Freshness, above), and the footer then neither dates nor
  credits it. Nothing is hidden silently.

## Curated notes

Riot's Data Dragon gives every champion's ability names, icons, ranks and base cooldown arrays. It
does not say when a cooldown starts, what a recast needs, what crowd control an ability carries or
what cancels it. The curated notes add that, in two layers. Each file is written from cited
sources, in our own words, and a person checks it in a pull request before it ships. The first
batch (16 Nov 2026) was drafted and cross-checked by AI agents, so the owner's reading of it in
this feature's pull request is its check by a person (For the owner, step 2); from then on a person
writes or checks each file, under the rules below.

| Layer | Files | What it holds |
|---|---|---|
| Champion notes (Layer 1) | `src/server/matchup-intel/curated/champions/<ChampionId>.ts`, one `ChampionNotes` each | For each ability (P, Q, W, E, R): Data Dragon's cooldown array and identity as checked, how the cooldown works (when it starts, charges, forms, recasts, refunds, resets, waits between casts), and facts, each with who has the effect and its source: crowd control, mobility, defences, sustain, empowerments, the damage that matters in lane, interactions and exceptions. Level notes where a source states one. |
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

Curated so far, checked on 16 Nov 2026 for patch 26.22 (Data Dragon 16.22.1):
- champions: Ambessa, Gwen, Mordekaiser, Ornn, Renekton and Riven;
- matchups: the three validation pairs, Ambessa vs Renekton, Gwen vs Ornn and Riven vs Mordekaiser.

### Rules

These are the owner's and Riot's rules. `curated.test.ts` checks the ones a test can (below); the
review checks the rest.

**Sources**
- Every fact, level note and interaction names the `Source.id` it rests on. Every source gives its
  `kind`, and is one of these:
  - a League of Legends Wiki page, licence `CC BY-SA 3.0`, with the `revision` id it was read at
    and that revision's `revisionTime` (a time in UTC, from the page's history). It is an ability's
    data page (`wiki-ability`,
    `https://wiki.leagueoflegends.com/en-us/Template:Data_<Champion>/<Ability>`), the champion's
    own page (`wiki-champion`), or a page that defines a term or a field (`wiki-reference`, such as
    `Template:Ability_data`);
  - one of Riot's pages, licence `Riot Games` and no revision: Data Dragon's champion file
    (`ddragon`) or `developer.riotgames.com` (`riot-docs`).
- Titles take one style, from the address: "League of Legends Wiki: Ruthless Predator (Renekton)"
  for an ability's page, "League of Legends Wiki: Renekton" for a champion's, "League of Legends
  Wiki: Template:Ability data" for any other page, which may add a few words in brackets ("(what
  each field means)"). Data Dragon's file is "Data Dragon 16.22.1: Renekton".
- A badge read from a page's field (`spellshield`, `parry`, `grounded`, `knockdown`) uses the
  meaning `Template:Ability data` gives it ("Spell shield nullifies."; "Movement is interrupted and
  overridden by enemy knockdown or displacement."), so that page is one of the file's sources.
- From now on the wiki is read by hand, in a browser: its Terms of Use forbid automated use without
  consent, so no script, job or test reads it, and Matchup Intel loads nothing from it (Compliance,
  "No automated use", which also names the one request another part of the app makes there).

**Claims**
- Never invent a number, an interaction or a matchup claim. What no source states is left out.
- A claim may apply what a page states of a whole class (any damage shield, immobilising effects,
  dashes) to a member that a page names as one in words: Ruthless Predator destroys damage shields,
  and Repudiation's page calls its shield one, so the briefing may say it destroys Repudiation's.
  Anything else that only follows from two facts is left out: a comparison of two durations, a sum,
  a timing, a tactic, or a class read only from a template's markup (Death's Grasp's pull is marked
  "airborne", but no page calls it a displacement).
- A value the wiki marks as estimated, and anything read from a template whose definition was not
  read (an interaction table's columns), is left out.
- Where Riot's own text (Data Dragon's tooltip or description) and the wiki disagree, only what both
  say goes on the page: Gwen's R recast window (8 s on the wiki, 6 s in Riot's tooltip) is not
  shown, though the two more casts are. Riot's tooltips are read only to find such disagreements,
  never as a source of numbers: most of their numbers are unresolved placeholders.
- Each file's header says, in short lines, where each cooldown start comes from, what is disputed
  and left off, and what was left out and why. Fewer points are better than one that is not
  grounded.

**Text**
- Use UNIIVERSE's own words, short and plain, in British English. Never copy a wiki sentence.
- Plain text only: no wiki markup, no `<` or `>`, no control characters, and at most 300
  characters a text. A badge label is a few words, and a detail is one sentence. Numbers of 1,000
  and more take a comma ("1,350 units"), as the app writes them.
- A number and its unit take an ordinary space ("1.625 s", "300 units", "50 Fury"); no special
  space goes in the notes. Where the page draws a curated text, and Riot's short descriptions too,
  it joins every number to the word after it (`keepUnitsWithNumbers`, `src/lib/format.ts`, applied
  in `view.ts`: a no-break space after a number, or a number with "%" or "°", whenever a word
  follows, whatever the word), so a number and the word after it always share a line and a unit
  never starts one. A unit of several words can still wrap after its first word ("80% bonus", then
  "AD" on the next line), and a number before anything but a word ("6, 11", "8 / 7", "320 (by
  level)") keeps its ordinary space. Of the lines the page writes itself, the cooldown lines hold
  their units the same way ("8 s", "3 charges"; Cooldowns), and so do a recast's "2 more times" and
  a refund's "65% of the cooldown". Its other words keep ordinary spaces: counts such as the
  picker's "12 champions found" and the footer's "13 wiki pages", and dates ("23 Sep 2026").

**Cooldowns** (how they are shown: `src/domain/matchup-intel/cooldown.ts`)
- `ddragonCooldown` is Data Dragon's `cooldown` array for the version checked, copied exactly. The
  passive's is `[]`: Data Dragon never gives a passive a cooldown.
- `ddragonIdentity` is Data Dragon's spell id, name, ranks and charges for the version checked,
  copied from `ddragon-<version>.identity.json`; the passive's is `{ id: null, name, maxRank: 1,
  charges: null }`. Every ability gives it.
- A `per-rank` cooldown repeats that array. Its `starts` comes from the page's cooldown-start field
  (`cdstart`) or its cooldown note:
  - `null` where the page gives none (13 of the 24 abilities so far): nothing is assumed;
  - `"on-cast"` where the field says on-cast, and `"after-effect-ends"` where it says post-effect;
  - `"after-first-cast"` for an ability cast again whose cooldown runs from its first cast: the
    field's on-cast names that cast (Riven's Broken Wings page gives both, on-cast and "Starts after
    first cast"), so Ambessa's Q, Renekton's E, Riven's Q and Gwen's R all read "starts after the
    first cast".
- `modifiers`, only as the page states them:
  - `refund`: a share (`percent`) or seconds per rank, and what gives it back, in our words (Gwen's
    E: 25 / 35 / 45 / 55 / 65%, "her first basic attack within the 4 seconds after the dash");
  - `resetsAttack`: the page says it resets the basic-attack timer (Riven's Q, Gwen's E,
    Renekton's W);
  - `static`: the cooldown itself is unaffected by ability haste;
  - `lockout`: a cooldown between casts that the page states as one, with `static` when ability
    haste does not shorten it (Riven's Q, 0.3125 s; Gwen's R, 1 s). A delay before a recast opens
    ("can be recast after 0.5 seconds") goes in the recast's note.
- Charges (per rank where they differ), recharge times and forms go in the `cooldown` spec, and a
  recast's count and window in `recast`. `cooldownNote` holds only what fits nowhere else, such as
  what "the effect" is for a start after it ("The mist lasts 4 s.").
- A passive gets a cooldown spec only when the page gives the passive's own cooldown, with
  `perTarget`, `static` and `starts` as stated. A timer of something else is a detail: Ornn's 4 s
  "Forge Disable Time" is the forge's, not Brittle's. Without a spec the page says Riot's data has
  none, never "no cooldown".

**Facts** (`Fact.kind`, shown as a badge)
- `crowd-control`: the effect (stun, knock-up, slow, root, fear, pull…), and its duration where the
  source states it.
- `mobility`: dashes and blinks.
- `defence`: shields, damage reduction, unstoppable, untargetable, spell shields, displacement
  immunity.
- `sustain`: heals, life steal, omnivamp.
- `damage`: only damage that matters in the matchup (true damage, a share of maximum health).
- `empowerment`: what strengthens the champion itself (bonus attack damage, an empowered next
  attack or ability), which `damage` would misname as damage dealt.
- `interaction`: what cancels, blocks or interrupts it.
- `exception`: unusual mechanics.

Every fact says who has the effect (`appliesTo`), which the badge adds only where its kind would
not say it:
- `self`: the champion whose ability it is: a dash, a shield, a heal, an immunity, an empowerment,
  a lockout of their own, a stat they steal;
- `target`: the enemy it hits or targets, one or several: crowd control, damage, a debuff, and a
  defence of theirs that stops it ("Fails on spell shields", "Health loss ignores shields");
- `allies`: the champion's allies;
- `area`: a zone, an aura or terrain rather than the enemies it happens to hit (Darkness Rise's
  aura, Volcanic Rupture's pillar).

Check the subject of each fact against the page's words, which can describe the target: Realm of
Death "will cancel and go on cooldown after its cast time if: The target is displacement immune,
crowd control immune or protected by a spell shield", so those immunities are the target's, not
Mordekaiser's. A fact with two subjects is split, or given the one its label names ("Steals 10% of
stats" is his).

`tags` name the mechanics a fact is about, from `FACT_TAGS` (`src/domain/matchup-intel/types.ts`),
each once, and only where one fits: `stun` for a stun, `spell-shield` for "a spell shield blocks
it", `ground` and `interrupt` for a dash that grounding disables and a displacement interrupts. The
page carries them as data, not words.

**Level notes**
- Only what a source states, such as an unlock or a step at a stated level.
- Each names the abilities of its champion it rests on (`basedOn: ["Q"]`; a passive's step,
  `["P"]`), each with notes in the file, so the note is flagged once Riot changes one of them.
- No power-spike rankings, and no "ultimate at 6, 11 and 16" unless a source states it for that
  champion. A level note does not add up two facts (Ornn's stat bonus at level 13).

**Matchup notes**
- One direction only: Ambessa against Renekton is not Renekton against Ambessa.
- A matchup has `briefing.threat`, `briefing.opportunity`, `briefing.lane` and `interactions`.
  Write two to four lane points where the two kits support them. The test refuses none, and more
  than four.
- Each point is one or two sentences: a consideration grounded in specific mechanics of the two
  kits. It names the abilities it rests on (`basedOn: ["Renekton.W", …]`), and each of those has
  notes in its champion's file.
- Considerations, never instructions or verdicts. Riot's policy lets a product "highlight decisions
  that are important and give multiple choices", and will not approve "Apps that dictate player
  decisions". No win rates, tiers, counter lists or guesses. The test refuses the words that
  dictate or claim too much (`REFUSED_WORDS`: always, never, must, should, you, easy, free win,
  can't lose, best, counters, punish and others) in every point and interaction, and the words
  that instruct the player or give a verdict (must, should, you, avoid, best, counters, punish,
  all-in and others: not always and never, since a mechanic may never do something) in every text
  of the champion notes the page shows: facts, details, cooldown and recast notes, refunds and level
  notes. A factual sentence that genuinely needs one goes in `ALLOWED_WORDS` with its file, place and
  reason.
- A matchup is checked against the same Data Dragon version as the champion notes it rests on. It
  holds no numbers of its own, so the page judges its freshness by those notes (Data, Freshness).
- Its sources are the champion notes' sources of the same ids, copied whole.

**Verification**
- Every file carries `verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" }`:
  the public patch, the Data Dragon version the arrays were compared with, and the day.

### Adding a champion

1. Read the champion's pages on the wiki by hand: `Template:Data_<Champion>/<Ability>` for the
   passive and each of the four abilities (the slot pages, `Template:Data_<Champion>/Q` and so on,
   redirect to them; older pages of a reworked champion remain under other titles). Note each
   page's revision id and when it was saved, which its history shows.
2. From Riot's champion file for the current version,
   `https://ddragon.leagueoflegends.com/cdn/<version>/data/en_US/champion/<ChampionId>.json`, where
   `spells[0]` to `spells[3]` are Q, W, E and R:
   - copy each `cooldown` array into the ability's `ddragonCooldown`, and into
     `ddragon-<version>.cooldowns.json` beside the index (one line per champion, `P` as `[]`);
   - copy each spell's `id`, `name`, `maxrank` and `maxammo` (as charges above 0, else `null`) into
     its `ddragonIdentity` and into `ddragon-<version>.identity.json`; the passive has no id, 1
     rank and no charges;
   - a new version gets its own files of the same shape, whose `_note` says where they came from;
   - read the tooltips and descriptions only to find where Riot and the wiki disagree.
3. Write `champions/<ChampionId>.ts`, named with Data Dragon's id (`MonkeyKing` for Wukong). It
   has `export default` a `ChampionNotes` with:
   - all five slots, each with its `ddragonCooldown`, `ddragonIdentity`, cooldown spec, modifiers
     and facts as the Rules say;
   - its sources, each with its kind, and for wiki pages the revision and its time;
   - a header that gives each cooldown start's source, the disputes left off, and what was left out
     and why.
4. Import it in `index.ts`, and add it to `CHAMPIONS`.
5. Run `pnpm exec vitest run src/server/matchup-intel`, then `pnpm verify`.

### Adding a matchup

1. Both champions need champion notes first, checked against the same Data Dragon version as the
   matchup, because a point can rest only on an ability with notes.
2. Write `matchups/<You>-vs-<Enemy>.ts` with Data Dragon's ids. The other direction is a separate
   file, written from that side.
3. List the pages the points rest on as its sources, each copied whole from the champion notes
   that cite it under the same id.
4. Re-read every point for tone: a consideration from the two kits, with none of the refused words.
   Its header says what was left out and why.
5. Import it in `index.ts`, add it to `MATCHUPS`, and run the tests.

### When a patch changes them

Riot's numbers refresh by themselves. The version-check job stores each new Data Dragon version's
abilities (`src/server/matchup-intel/abilities.ts`). The page compares each ability's current
record with the notes' `ddragonCooldown` and `ddragonIdentity` (its id, name, ranks and charges),
using `abilityFreshness` in `src/domain/matchup-intel/cooldown.ts`:
- **current**: checked against the version the page shows, and nothing compared has changed;
- **unchanged since**: checked on an earlier version, and nothing compared has changed since (or
  the data held is older than the check). It is shown as "checked on patch 26.22", never as
  current, because crowd-control durations, ranges and interactions can change without the record
  moving;
- **changed since**: the record moved after the check. The line shows only what Riot's data
  supports, the notes are flagged as possibly out of date, and the briefing points and matchup
  interactions that rest on the ability are hidden (Data, above).

A champion's label is its weakest ability's (`weakestFreshness`). A matchup's is judged against its
own check, ability by ability (Data, Freshness, above).

Re-checking is a person's work, in one pull request per pass:
1. Find the curated abilities whose record changed (the page labels them "Changed since the
   check"). Read the patch notes for changes the record does not show.
2. Read those abilities' wiki pages again by hand. Update the facts, the revision ids and times,
   `ddragonCooldown`, `ddragonIdentity` and `verified`.
3. Add `ddragon-<version>.cooldowns.json` and `ddragon-<version>.identity.json` for the version
   checked against. The test needs them for every version a champion's notes cite.
4. Re-read every matchup that rests on the champion, update or remove the points that rest on a
   changed ability (`basedOn`), and move its `verified` to the same version: the test refuses a
   matchup checked on another version than the notes it rests on.
5. Move the browser tests' pin (`E2E_DDRAGON_VERSION` in `e2e/ddragon-version.ts`) to the newest
   version the notes are now checked against: `curated.test.ts` refuses any other (What the browser
   tests pin, below). Their server then reads that version's data, so update a browser test that
   reads a number the new version changed ("13 s at every rank" for Riven's Q, in
   `e2e/matchup-intel.spec.ts`), and run the browser tests with the new pin before the pull request
   is ready.

Until that merges, the labels say what is known. Nothing is estimated.

### What the browser tests pin

The browser tests run against the in-memory demo, which stores Riot's Data Dragon at its first
start. Their server reads one version: `DDRAGON_VERSION`, set by `playwright.config.ts` to
`E2E_DDRAGON_VERSION` (`e2e/ddragon-version.ts`), 16.22.1, the version the curated notes were
checked on. CI's browser job and the WebKit workflow's Playwright step both start that server
through the config, so both read it; production never sets it. The WebKit workflow's other step,
the Safari 26 check (`scripts/webkit26-check.mjs`), starts a demo server of its own without the pin.
It opens Team, a player's profile and match history, and the public team page, never a Matchup
Intel page, and checks how each window is drawn, so nothing it checks depends on the version; a
Matchup Intel page added to it would need `DDRAGON_VERSION` passed as well.

- **Why.** Unpinned, a fresh demo stores Riot's newest version, so the specs would read whatever
  Riot had shipped: once its numbering ran more than two patches past the check (16.25, or 17.3 if
  16.24 is the year's last patch), `MAX_PATCHES_UNCHECKED` would hide every briefing, and the specs
  that read one (the threat, the opportunity and their chips, the threat on a phone's first screen,
  the announcement, and the WebKit spec's chip) would fail on every pull request until the notes
  were re-checked; a cooldown Riot changed (Riven's Q, "13 s at every rank") would fail at once.
  Pinned, the specs read the same data whatever Riot ships: the briefings as checked ("Checked on patch 26.22",
  with no "Not re-checked"), Riot's numbers as checked, and the footer's "Riot Data Dragon 16.22.1
  (patch 26.22)", which the spec asserts word for word.
- **How.** The live provider (`DataDragonProvider`, `src/server/riot/static/ddragon.ts`) returns
  only the pinned version once Data Dragon's own list of versions confirms it has it (Data Dragon
  keeps every version it has published), and the version check reads exactly that version's
  champions, abilities and item names. A pin that is not a version, or one Data Dragon does not list,
  fails the way an unreachable Data Dragon does: on a first start the offline copy, labelled as one
  (the footer's assertion then fails), otherwise the stored data kept and the run degraded with the
  reason; never another version instead. The version check's log says when it is pinned.
- **Kept honest.** `curated.test.ts` refuses a pin that is not the newest version the notes are
  checked against, or one without its `ddragon-<version>.cooldowns.json` and identity file, so a
  re-check on a newer version moves the pin in the same pull request (When a patch changes them,
  step 5), and the specs read the data the newest notes were checked on.
- **Not covered by them.** The page on later patches (the "Not re-checked for 26.23" labels, a
  briefing hidden for its age, a point hidden because Riot changed an ability, Riot's data newer
  than the notes) is the unit tests' (`view.test.ts`, `matchup-content.test.ts`,
  `src/domain/patch.test.ts`), with the patches and records injected. A server started by hand for
  the specs (`E2E_PORT`) needs the variable too, `DDRAGON_VERSION=16.22.1 pnpm start`: outside CI,
  Playwright uses a server already on the port and does not pass it its environment.

### What the test checks

`src/server/matchup-intel/curated/curated.test.ts` runs in `pnpm verify`. It refuses:
- a file in `champions/` or `matchups/` that the index does not serve under the ids in its name,
  or an index entry with no file;
- a champion id that is not in `src/server/riot/fixtures/champions.fixture.json`;
- champion notes without all of P, Q, W, E and R, or with any other slot;
- a `ddragonCooldown` that is not Data Dragon's array in `ddragon-<version>.cooldowns.json`, or
  notes checked against a version with no such file;
- an ability without its `ddragonIdentity`, or one whose id, name, ranks or charges are not Data
  Dragon's in `ddragon-<version>.identity.json`, or notes checked against a version with no such
  file;
- a saved Data Dragon file that is not well formed, or that disagrees with the committed offline
  fixture (`src/server/riot/fixtures/champion-abilities.fixture.json`) of the same version;
- a `per-rank` cooldown whose seconds differ from `ddragonCooldown`;
- a cooldown spec the page cannot show as written (it asks the display rules,
  `curatedCooldownDisplay`): numbers of seconds, whole charge counts above 0, one value or one per
  rank, levels from 1 to 18 paired with the values, two or more forms; a start outside the
  vocabulary, or forms with the same name;
- a modifier the page would leave out: a refund whose amount is not one value or one per rank, a
  share over 100%, or with nothing saying what gives it; a wait between casts that is not above 0;
- a fact without `appliesTo`, or with one that is not `self`, `target`, `allies` or `area`; a tag
  that is not in `FACT_TAGS`, or is named twice;
- any of these source faults:
  - a fact, level note or interaction that cites a source its file does not list;
  - a source listed twice, or one that is not an https page on the three hosts above;
  - a source with the wrong licence for its host, or without a `kind`, or whose kind does not fit
    its page;
  - a wiki page without its revision or its `revisionTime`, or a revision time that is not a time
    in UTC or comes after the day the notes were checked; a Riot page with a revision;
  - a wiki page's title that is not the house style for its address;
  - a matchup source that differs in any field from the champion notes' source of the same id;
- a `basedOn` or interaction reference that is not an ability, with notes, of one of the two
  champions;
- a matchup checked against another Data Dragon version than the notes of a champion it rests on;
- a word from `REFUSED_WORDS` in a briefing point or an interaction, unless `ALLOWED_WORDS` lists
  it there (by file and place) with its reason; an allowed word its text no longer uses, in a
  matchup's file or a champion's;
- any text that contains `{{`, `<`, `>` or a control character, is empty, or is over 300
  characters;
- `verified` fields of the wrong shape, or a patch that is not the Data Dragon version's;
- a matchup without a threat, an opportunity and at least one lane point, or with more than four;
- a level note outside levels 1 to 18, or one that names no ability it rests on (`basedOn`), a slot
  that is not one, a slot twice, or a slot with no notes in the file; a recast count below 1;
- a word that instructs the player or gives a verdict (the second and third groups of
  `REFUSED_WORDS`) in a text of the champion notes the page shows (a fact's label or detail, a
  detail, a cooldown or recast note, a refund, a level note), unless `ALLOWED_WORDS` lists it there
  with its reason;
- a text the page shows, in champion notes or a matchup, that gives a value as an estimate
  ("estimated", "estimate", "estimates", "approximately", "approximate" or "roughly", as whole
  words): a value the wiki marks as estimated is left out (Rules);
- a missing validation matchup;
- a browser tests' pin (`E2E_DDRAGON_VERSION`) that is not the newest Data Dragon version the notes
  are checked against, or has no committed cooldowns and identity, or that `playwright.config.ts`
  does not pass to their server as `DDRAGON_VERSION` (What the browser tests pin).

Three corrections from the review of 16 Nov 2026 are pinned too, so that they stay made: Riven's Q
gives no one window for its two recasts, Ornn's W no speed below which he does not lunge, and Gwen
vs Ornn credits the Renekton page its threat's stun rests on.

Each rule on the notes has a case that proves it fires. What no test can check is the review's:
the wording, copying, whether a point dictates play in words the list does not hold, whether a
claim is stated or only follows from two facts, and whether each fact matches the page it cites.

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
   - Taric's Q (3 s): it stores charges by Riot's own tooltip in 16.22.1 (a stack every
     `{{ stackcooldown }}` seconds, consumed by the active; its leveltip's "Max Charges"), though its
     `maxammo` is -1, so the time to regain one is not in Riot's data;
   - Aphelios's Q (9 s at six ranks): one slot for five weapon abilities, as Riot's own description
     says ("Aphelios has 5 different activated abilities, based on his main-hand weapon"), so its one
     array is no one ability's ("Several abilities share this slot in Riot's data");
   - Zoe's W (0.25 s): its active casts the spells she picks up (Riot's own tooltip), so the number
     is not their cooldown ("This slot casts spells picked up in a game").

   Riot's number is shown as it is where its own text names the ability it belongs to: Kled's Q
   (11 to 7 s, the mounted Bear Trap on a Rope, whose leveltip calls the array its cooldown), Hwei's
   subjects (one leveltip cooldown each) and Yasuo's E (its own cooldown; the limit per target is a
   separate number its description mentions).
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
| Curated per rank, Riot's record unchanged | "16 / 14 / 12 / 10 / 8 s"; the same value at every rank "13 s at every rank" | "Checked on patch 26.22" ("Checked" where the patch is not known), with "· not re-checked for 26.23" once a later patch is out |
| When it starts, where the source states it (on cast, or no start stated, goes without saying) | "· starts after the first cast", "· starts after the last recast", "· starts when the effect ends", "· starts after the channel" | |
| A static cooldown (`modifiers.static`) | "· unaffected by ability haste" | |
| Curated charges, one count or one per rank | "3 / 4 / 5 charges · one back every 35 / 30 / 25 s"; "2 charges · one back every 20 s"; "1 charge" | "Checked on patch 26.22" |
| Curated forms, one line each | "Hammer: 16 / 14 / 12 / 10 / 8 / 6 s", then "Cannon: 8 s at every rank" | "Checked on patch 26.22" |
| A passive's own cooldown, where a source states one | by level: "12 / 9 / 6 s · at levels 1 / 7 / 13", or "· by level" without the levels, "6 s at every level"; by rank: "30 / 25 / 20 s · by its rank"; and "· per target", "· unaffected by ability haste", "· starts when it takes effect", "· starts when the effect ends" ("10 s · per target · unaffected by ability haste") | "Checked on patch 26.22" |
| No cooldown (curated) | "No cooldown" | "Checked on patch 26.22" |
| Riot's record changed after the check | Riot's own line (the rows below), never the notes' start; the row's name has "Changed since the check" | "Riot's data for patch 26.23, not re-checked" ("Riot's data, not re-checked" where the data's patch is not known; "Not re-checked" under a line without a number); then the notes, under "Notes from patch 26.22 · may be out of date: Riot changed its cooldown since" (its cooldown, spell id, name, ranks or charges), with "As checked: …" |
| Riot's data, a number | "18 / 17 / 16 / 15 / 14 s" | "Riot's data, not reviewed" |
| Riot's data, the passive | "Cooldown not in Riot's data", never "none" | "Not reviewed" |
| Riot's data, charges (rule 3, and Corki's R, Teemo's R, Gangplank's E, Taric's Q) | "Riot's data lists charges but not their recharge" | "Not reviewed" |
| Riot's data, known to be wrong (Rengar's Q, W, E) | "Riot's number for this ability is known to be wrong" | "Not reviewed" |
| Riot's data, a value that is not seconds | "Riot's cooldown data can't be read" | "Not reviewed" |
| Riot's data, two abilities in one slot | "Two abilities share this slot in Riot's data" | "Not reviewed" |
| Riot's data, several abilities in one slot (Aphelios's Q) | "Several abilities share this slot in Riot's data" | "Not reviewed" |
| Riot's data, a slot that casts picked-up spells (Zoe's W) | "This slot casts spells picked up in a game" | "Not reviewed" |
| Riot's data, an empty or all-zero array | "No cooldown number in Riot's data" | "Not reviewed" |
| Riot's data, not one number per rank | "Riot's data doesn't give one number per rank" | "Not reviewed" |
| No record of the ability | "No cooldown data held yet" (a champion with no abilities stored shows "Ability details aren't stored yet" instead of rows, and one whose stored copy cannot be read "Riot's ability data for … could not be read") | |

A line without a number has nothing under it where the ability has curated notes that are not
flagged: they are the place that says more (a passive whose wiki page gives no cooldown, for
example).

**The modifiers** follow the line, one short line each, only as the source states them:
- "0.3125 s between casts, unaffected by ability haste" (`lockout`);
- "Refunds 25 / 35 / 45 / 55 / 65% of the cooldown: her first basic attack within the 4 seconds
  after the dash", or "Refunds 2 s of the cooldown: …" (`refund`: a share or seconds, one value or
  one per rank, and what gives it back);
- "Resets the basic-attack timer" (`resetsAttack`).

`cooldownNote` holds the rest, in words. Once Riot's record changed, the modifiers go with the
flagged notes.

Decimals are written as the numbers have them, up to four ("0.25 s", "0.3125 s"): a checked value
is never rounded into another. The "s" follows its number after a no-break space (`formatPerRank`,
and the wait between casts and a recast's window in `wording.ts`), so a line never ends between
them.

## Compliance

What Riot's policies, the League of Legends Wiki's licence and its host's terms say about this
page, and how the page keeps to them. It is a reading of those pages, not legal advice. Riot's
pages were read on 16 Nov 2026: the League of Legends documentation
(https://developer.riotgames.com/docs/lol, "League docs" below), the General Policies
(https://developer.riotgames.com/policies/general) and the portal page
(https://developer.riotgames.com/docs/portal). The app-wide checklist is
[RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), where Matchup Intel is item 9.

### What Riot allows

| Riot's words (where) | How the page keeps to them |
| --- | --- |
| Data Dragon's game data and assets: "All of which can be used by third-party developers." (League docs, Data Dragon) | Ability names, icons, ranks, base cooldowns and short descriptions come from Data Dragon, and only from the fields it publishes for them (below). |
| "Game overlays that provide static data that is available prior to the game." (League docs, approved use cases) | A web page rather than an overlay, with static data only, for two champions chosen by hand: the same before any game. |
| "Products should not remove game decisions, but may highlight decisions that are important and give multiple choices to help players make good decisions." (League docs and General Policies, Game Integrity) | A briefing names a threat, an opportunity and what to weigh in lane, each resting on named abilities. It points at decisions and leaves them to the player. |

### What Riot forbids

| Riot's words (where) | How the page stays clear of it |
| --- | --- |
| "Products must not use or incorporate information not present in the game client that would give players a competitive edge (e.g., automatically or manually allowing tracking enemy ultimate cooldowns)…" (League docs, Game Integrity). Riot Developer Relations banned "Enemy Ultimate Timers" from 13 March 2025. | Base values per rank only. No timer, countdown, "used" or "ready at" control, alert or shared timer, for ultimates or anything else, and nothing records when an ability was used. |
| "Products may not provide any game-session-specific information that would be previously unknown to the player." (League docs, unapproved use cases) | Nothing comes from a game in progress or from champion select: no live-game or Spectator request, and no detection of the enemy. Both champions are chosen by hand. |
| "Products cannot identify or analyze players who are deliberately hidden by the game." (League docs, Game Integrity) | The page names no player and scouts no one. |
| "Apps that dictate player decisions." (League docs, unapproved use cases); "Products should increase, and not decrease the diversity of game decisions" (Game Integrity) | Briefings are considerations, never instructions (Curated notes, Rules), and the review checks their wording. No win rates, tiers, counter-pick or ban lists, and no single answer. |
| "Products cannot create an unfair advantage for players, like a cheating program or giving some players an advantage that others would not otherwise have." (Game Integrity) | Everything on the page is public: Riot's published data and the wiki's pages, which anyone can read. |
| "Products cannot closely resemble Riot's games or products in style or function." (General Policies) | The app's own design, not the game's tooltip or HUD, and no Riot logo. |
| The League Client API "is not officially supported for use with third party applications." (League docs) | No client integration, overlay, memory reading or automatic pick. |

### What Riot requires

| Riot's words (where) | How the page meets them |
| --- | --- |
| "You must post the following legal boilerplate to your product in a location that is readily visible to players" (General Policies) | The footer shows the full notice (`riotLegal`, with the installation's name), as well as the app's other places for it. |
| "Any new features or changes to a product must be audited through the product's page in the Developer Portal" (General Policies); "You must make sure its description and metadata are kept up to date with the current version of your product." (League docs) | Open until the owner updates the product's description (Open compliance questions; For the owner, step 1). |
| "Products should use supported services from Riot Games for data ingestion" (General Policies) | Data Dragon only: no CommunityDragon data, and no value taken from the game's files. |
| "You may not run your application for public consumption using a personal key" (portal page) | Signed-in accounts only. `/resources/*` is not a public path (`src/proxy.ts`), the page calls `requirePageAccess` itself, and the Production check proves that a signed-out request, or one with a forged session cookie, is sent to sign-in (LIVE_VALIDATION.md). |

### Data Dragon: data and icons

- **Data.** Read by the version-check job once per game version, never while a page renders.
  Riot warns that Data Dragon "is not always updated immediately after a patch" (League docs), so
  the page names the version and patch it shows ("Riot Data Dragon 16.22.1 (patch 26.22)"), each
  champion's own when they differ, and says so when Data Dragon already has a newer version than the
  abilities stored. It cannot tell when Data Dragon itself lags the game: the game's patch it knows
  comes from Data Dragon's own list of versions. The fields read, and those never read (tooltips,
  ranges, costs and their placeholders), are in [DATA_PIPELINES.md](DATA_PIPELINES.md), "Champion
  abilities (Matchup Intel)".
- **Icons.** Each ability's and passive's icon, and each champion's portrait, is linked from Riot's
  CDN (`ddragon.leagueoflegends.com/cdn/<version>/img/spell/`, `img/passive/` and `img/champion/`),
  never copied or hosted by the app.
- **Riot's words.** Each ability's short description is Riot's own text from Data Dragon, with its
  markup removed.

### The League of Legends Wiki

- **Licence.** The wiki's text is under CC BY-SA 3.0 (as the wiki reported on 16 Nov 2026),
  "applied to all creative work added to the wiki with the exception of Riot Games' Intellectual
  Property" (the wiki's Copyrights page). Most of Weird Gloop's other wikis are under CC BY-NC-SA
  3.0, several of them since 2025–2026, so whoever re-checks the notes checks the licence in the
  wiki's footer; each source records its own.
- **Credit.** Weird Gloop, which hosts the wiki, asks for "A hyperlink (where possible) or URL to
  the page or pages you are re-using" (https://meta.weirdgloop.org/w/Meta:Copyrights). CC BY-SA
  3.0 (https://creativecommons.org/licenses/by-sa/3.0/legalcode.en) asks for the author, the title
  and the address, "reasonable to the medium" (section 4(c)), and the licence's address (4(a)), and
  forbids implying "any connection with, sponsorship or endorsement by the Original Author" (4(c)).
  The footer (`matchup-footer.tsx`) gives each:
  - the pages the notes are written from, each by its title and linked, each once;
  - "League of Legends Wiki contributors" as their authors;
  - CC BY-SA 3.0, linked;
  - how they were used: "written in our own words from";
  - "The wiki and its contributors do not endorse this page."

  Each ability's details also link the page behind each fact. `matchup-footer.test.ts` proves
  each part of the credit, and the browser spec checks it on the demo.
- **Our own words.** The notes state facts in UNIIVERSE's own words and copy no sentence, so the
  page holds no adaptation of the wiki's text, and the footer never says "adapted". Share-alike
  ("If you make modifications or additions to the page you re-use, you must license them under the
  same, or a compatible license", Meta:Copyrights) is about adapted text. Whether to license the
  curated files anyway is an open question (below).
- **Images.** "Non-text media on our wikis should not be assumed to be available under the same
  license as the text." (Meta:Copyrights) No image on Matchup Intel comes from the wiki.
- **No automated use.** Weird Gloop's Terms of Use (https://weirdgloop.org/terms, updated 31
  January 2025) do not allow "Attempting to use our Sites in an automated fashion without prior
  consent from the Company", and the wiki's robots.txt disallows `/*api.php` and `/*?action=` for
  every crawler. From now on, curators read the wiki in a browser (Curated notes, Rules). No
  script, job or test of the app reads the wiki's pages, and Matchup Intel loads nothing from it:
  the page only links to it, and the browser spec checks, with Playwright's request events and with
  the page's own resource timing, that it loads nothing from `wiki.leagueoflegends.com`. One request
  does go there, from another part of the app: the Library (Resources → Library) draws each link
  with its site's icon, and one of its default links is the League of Legends Wiki
  (`src/domain/resources.ts`), so a visitor's browser loads `wiki.leagueoflegends.com/favicon.ico`,
  as it loads every linked site's icon. The browser specs that open the Library without blocking
  icons (`account-screen`, `quality` and `webkit`) can load it too, in CI: a small automated request
  (Open compliance questions, "Scripted reads of the wiki").

## Open compliance questions

Each has a default that the code follows today. Only the owner changes one.

| Question | The default the code follows now | Who decides |
| --- | --- | --- |
| **The Developer Portal description.** Riot audits every new feature through the product's registered description (above). | The description in [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) ("Description for the registration") includes Matchup Intel. The registered one must say the same before the page reaches production, so the merge, which deploys, waits for it. | The owner (For the owner, step 1) |
| **A licence header on the curated files.** The repository is public and has no licence of its own. | Our own words, credited, not relicensed: each file's header says its texts are UNIIVERSE's own summaries, its sources list each page with its revision, and the footer credits them. No file declares a licence for itself. A scan of the notes against the pages they cite finds no copied sentence, only runs of numbers and game terms (six to ten words), so the risk that a passage counts as adapted is small, but not none. The recommended choice is a conditional header in each file ("Any material in this file adapted from the League of Legends Wiki is available under CC BY-SA 3.0"), which would cover any such passage without saying anything was adapted; it is not added, because a licence grant is the copyright holder's act. | The owner |
| **Scripted reads of the wiki** (for example drafts of changes on patch day). | None of its pages. Weird Gloop's prior consent would be needed first (its Terms of Use, above). If it were given, a script would only draft changes for a person to review in a pull request, never publish them. One small automated request exists today, outside Matchup Intel: the browser specs that open the Library can load the wiki's favicon in CI (No automated use, above). Blocking that request in those specs, or a built-in icon for the Library's link to the wiki, would end it. | The owner, after asking Weird Gloop |
| **Who curates, and who approves briefings.** The owner's rule is a briefing only where a person wrote and checked it. | Notes change only through pull requests, reviewed there: the page generates nothing, and nothing is published by itself. The first notes (16 Nov 2026) were drafted and cross-checked by AI agents, for a person's review in this feature's pull request: until the owner names the people, the owner's reading there is the only check by a person, and the merge waits for it (For the owner, step 2). | The owner |
| **How the first notes were researched.** On 16 Nov 2026, between 06:13 and 06:43 UTC, while researching the first batch, AI agents made 35 scripted requests to wiki.leagueoflegends.com and 7 to Weird Gloop's own sites. The wiki's: its robots.txt first, which disallows `/*api.php` and `/*?action=` for every crawler; then 33 to its API, all at `/en-us/api.php?action=…`; and one page. Weird Gloop's: the robots.txt of meta.weirdgloop.org and of weirdgloop.org, Meta:Copyrights twice, and its Terms of Use three times (one a redirect). They saved copies of the pages the notes cite and of others they consulted (other champions' ability data, the six champions' patch histories and main pages, the wiki's modules and policy pages), and drafted and cross-checked the notes from those copies, which were never committed; all 34 cited revisions come from them. The Terms of Use (above) do not allow automated use without prior consent. | Disclosed in this feature's pull request, and here. Nothing in the app, its jobs or its tests reads the wiki's pages (the one request they make there is the Library's favicon: No automated use, above), and curators read it in a browser from now on. The remedy is not chosen: a person re-reads each cited revision in a browser and records it in the pull request, or Weird Gloop is asked for consent after the fact, or both. | The owner |
| **Riot's "Legal Jibber Jabber" sentence**: "[The title of your Project] was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project." (https://www.riotgames.com/en/legal) | Not shown. The app shows the Developer Portal's notice word for word, which the General Policies require. | The owner |

## Not built

For later, each its own decision:
- your own notes on a matchup (the notebook, below);
- favourite matchups;
- sharing a briefing.

Nothing here reads a player's games either: those are Matchups', in the champion window.

### The notebook: a member's own notes on a matchup

Described here, not built: no table, migration or code exists. Building it needs the owner's
go-ahead first. STANDARDS.md lists Patterns & Notes, the retired notes of the ranked focus, among
the features not to revive, and a notebook is close enough to ask. It would not reuse that
feature's retired column (`ranked_profiles.notes`).

**What it would be.** Under the briefing, a few lines a member writes for themselves about this
pair, in this direction only, with the patch they were written on. Plain text. Keeping it on the
device alone (like the remembered champion) would need no table, but a note would not follow its
author to another device and would vanish with the browser's data, so the design keeps it on the
server.

**Private, and owned by one account.**
- Private by default and never public: in the app, only its author sees a note. Administrators
  do not see members' notes there; the database and its encrypted backups hold them, as they hold
  everything else. Sharing with teammates is not part of it; if it were ever wanted, it would be a
  separate decision, off by default, and never on the public team page.
- Owned by the signed-in account that wrote it (`users.id`), not by a player profile, so an
  account without a profile (the verification account, a personal-use account) has its own.

**The table**, `matchup_intel_notes` (never "matchups": that name is the personal Matchups
feature's):

| Column | Type | What it holds |
| --- | --- | --- |
| `id` | `uuid`, primary key, random | |
| `user_id` | `uuid` not null, references `users(id)` on delete cascade | the author: the session's account, never a value from the browser |
| `champion_id` | `text` not null | your champion, by its Data Dragon id, checked against the roster when saved |
| `vs_id` | `text` not null | the enemy, checked the same way |
| `body` | `text` not null | the note: plain text, at most 2,000 characters |
| `patch` | `text` | the public patch when it was last saved ("26.22"), so the page can say how old it is |
| `created_at`, `updated_at` | `timestamptz` not null, default now | |

- A unique index on (`user_id`, `champion_id`, `vs_id`): one note per pair and direction.
- The migration carries the grants block of [DATABASE_PERMISSIONS.md](DATABASE_PERMISSIONS.md)
  ("How a new table gets its grants"): RLS on with no policies, nothing for the Data API's
  `anon` and `authenticated`, `SELECT` for `uniiverse_backup`. The id is a uuid, so there are no
  sequence lines. Then an `auth-audit` run after the deploy (CLAUDE.md §5).

**Ownership, on the server.**
- Every query names `user_id = session.userId` in the same statement, for a read, a save and a
  delete. The session comes from the server (`requireSession`); no id from the browser chooses
  whose note it is. A session without an account (`userId` null, the automatic local owner of a
  development machine) has no notes, and saving is refused.
- Two server actions in a `"use server"` module, `saveMatchupNoteAction(championId, vsId, body)`
  and `deleteMatchupNoteAction(championId, vsId)`, each with `requireSession()` first
  (`src/server/actions/guards.test.ts` checks it). They check the ids against the roster and the
  text as plain text (as `plainText` does for Resources, `src/domain/resources.ts`), cap its
  length, and log nothing of the text.
- Tests: a database test that one account can neither read, change nor delete another's note,
  whatever it sends; that a deleted or erased account's notes are gone; and the grants, which
  `src/server/db/migration-grants.test.ts` and `tests/db/data-api-grants.test.ts` already check in
  every new migration.

**How it joins the page.**
- A separate, member-only part, loaded beside the view and never inside it.
  `buildMatchupPageView` stays the same for everyone: the stored abilities are cached per champion
  (`cachedFor`), and a member's note must never pass through that or any other cache shared
  between requests.
- The page reads the note with one keyed query on each render, only when both champions are
  chosen, and hands it to a client component of its own (the editor). The page is already rendered
  on each request (`force-dynamic`), so nothing is kept across members.
- Saving changes only that part: no `revalidatePath` of a shared page.
- Its words say whose it is ("Only you can see this note"), and "Written on patch 26.22" once the
  patch has moved.

**With the member, when they leave or ask.**
- Deleted with the account: the foreign key cascades, and permanent erasure deletes the account
  (`src/server/privacy/erasure.ts`), so the notes would go too. The erasure's preview would count
  them.
- A note that names someone else: erasure already replaces an erased person's names in notes
  others wrote (`notesToEdit` in `erasure.ts`). The table would join that list. Its rows belong to
  an account (`user_id`), where that list's belong to profiles, so its owner filter would compare
  the account.
- After a restore from a backup: importing the erasure records (`pnpm privacy:records import`,
  `scripts/privacy-records.ts`) re-applies them before the app is used. That deletes the erased
  accounts again, and their notes with them.
- Access: a member reads all their own notes in the app, which is their copy. A request is
  answered as any other (docs/PRIVACY.md, "Handling a request"): the owner says what is stored,
  and never sends anyone another member's notes.
- The privacy notice (`src/app/privacy/page.tsx`, "What is stored") would gain a line: the notes, the
  two champions, the patch and when they were saved; for the member's own preparation; seen only
  by them; kept until they delete them or their account, and in the encrypted weekly backups for
  up to 28 days. It needs the owner's approval and a new `PRIVACY_UPDATED` (docs/PRIVACY.md,
  "Changing the notice").
- Riot: a member's own text is not Riot data and needs no Riot request, but it is a change to the
  product, so the registered description would gain a few words with it.

**No AI.** It is the member's own text, stored and shown back. Nothing reads, summarises, suggests
or generates from it, and building it needs no model, key or outside service.

**What must be stable first.**
- The address and its ids: notes are keyed on Data Dragon's champion ids, as the address is
  (`?champion=&vs=`), one direction per pair, as the briefings are.
- The page's layout on a phone, so the notes get a fixed place without moving what is there.
- The owner's open decisions on Matchup Intel (For the owner), and the privacy notice's new line.
- The held migrations: the next free number after them (0066 is held by PR #212).

## For the owner

The steps only the owner can take, in order. The first three come before the merge, because the
merge deploys.

1. **Update the product's description in Riot's Developer Portal** before Matchup Intel reaches
   production: replace it with the description in RIOT_COMPLIANCE.md ("Description for the
   registration"; Registering the product, step 2). No key or endpoint changes. Its Matchup Intel
   part, word for word (`src/server/riot/registration-description.test.ts` keeps the two copies
   the same):

   > Matchup Intel, for signed-in accounts, is a static reference for two champions chosen by hand: each ability's base cooldowns per rank from Data Dragon, and notes written from the League of Legends Wiki (cited, with the patch), with briefings for selected matchups. It makes no Riot API request and has no timers or tracking.
2. **Say who curates the notes, and who approves briefings.** The first batch was drafted and
   cross-checked by AI agents, so until the owner names the people, the owner's reading is its only
   check by a person: read the three briefings (Ambessa vs Renekton, Gwen vs Ornn, Riven vs
   Mordekaiser) and the six champions' notes in the pull request, and record the sign-off there (a
   review comment for each file, or the name of the person who checked them), before approving it.
   If that check is on another day than 16 Nov 2026, each file's `verified.checkedOn` moves to it.
   Three readings to confirm with the rest: Ambessa's Q, Renekton's E and Gwen's R say "starts after
   the first cast", read from their pages' on-cast and Riven's page, which gives both (Cooldowns,
   `"after-first-cast"`); their own pages say only on-cast. The owner's rule is a briefing only where
   a person wrote and checked it.
3. **Approve the Resources navigation change**: Resources becomes one sidebar entry for two
   sections, Library and Matchup Intel, with their tabs at the top of both pages, phones included
   (Where it is). If not, the fallback leaves the sidebar as it was and links the two pages from
   under their headers.
4. **Approve the merge**, which deploys to production (CLAUDE.md §4: within the deploy budget, the
   "merge" method and the exact head), then read the Production check on the deployed commit.
5. **Decide whether the Production check opens Matchup Intel signed in.** Today it proves only that
   the page is closed to visitors (LIVE_VALIDATION.md). Opening one pair at desktop width would
   check the heading, the enemy's five rows (or the "not stored yet" state, as a warning), the Data
   Dragon version and the licence link in the footer, and axe. It costs Vercel Active CPU on every
   run, after each deploy and daily: a member page took 37–105 ms of server CPU in the local
   measurements (HOSTING_USAGE.md), and this one is not measured. Until then a change to the page
   is "deployed", not production-verified (CLAUDE.md §5).
6. **Decide whether Riot's own numbers show where nobody has checked them** (the design's D7).
   Today they do, on every champion without curated notes, only where they pass the guard
   (Cooldowns) and labelled "Riot's data, not reviewed": 600 of the 865 abilities in Data Dragon
   16.22.1. The other choice is curated numbers only, which needs a code change: no switch exists.
7. **Decide how long a check holds.** Today a briefing is hidden, and champion notes are flagged,
   once more than two patches have come since their check (`MAX_PATCHES_UNCHECKED`, Data,
   "Freshness"), the design's default; one or two patches on, they show with "Not re-checked for
   26.23".
8. **Decide how long a briefing may be.** The ten-second briefing reads in about 45 to 60 seconds
   today (177 to 247 words; up to 300 characters a text and four lane points, `curated.test.ts`).
   Options: a one-line headline for the threat and the opportunity, shorter texts and fewer points
   (with the test's limits tightened to match), lane points folded on a phone, or a title without
   "ten-second" until the texts are that short.

The open compliance questions above keep their defaults unless the owner decides otherwise.
