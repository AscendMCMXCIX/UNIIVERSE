# Matchup Intel

A static champion reference: a member picks their champion and an enemy, and reads the enemy's
abilities, base cooldowns and the mechanics that matter in lane. Nothing is read from a game in
progress, and there are no timers.

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
  or its cooldown notes. Use `"on-cast"` only when the source says so or gives no special start,
  with a comment saying which.
- Charges, recharge times, recast windows and counts, static cooldowns between casts, refunds and
  resets go in only as the wiki gives them.
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
abilities (`src/server/matchup-intel/abilities.ts`). The page compares each ability's current array
with the notes' `ddragonCooldown`, using `abilityFreshness` in
`src/domain/matchup-intel/cooldown.ts`:
- **current**: checked against the version the page shows, and the array still matches;
- **unchanged since**: checked on an earlier version, and the array has not changed since. It is
  shown as "checked on patch 26.22", never as current, because crowd-control durations, ranges and
  interactions can change without the array moving;
- **changed since**: the array moved after the check. The page shows Riot's new numbers, and the
  notes may be out of date.

A champion's or a matchup's label is its weakest ability's (`weakestFreshness`).

Re-checking is a person's work, in one pull request per pass:
1. Find the curated abilities whose array changed (the page labels them "changed since"). Read the
   patch notes for changes the arrays do not show.
2. Read those abilities' wiki pages again by hand. Update the facts, the revision ids,
   `ddragonCooldown` and `verified`.
3. Add `ddragon-<version>.cooldowns.json` for the version checked against. The test needs one for
   every version a champion's notes cite.
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
- a `per-rank` cooldown whose seconds differ from `ddragonCooldown`;
- any of these source faults:
  - a fact, level note or interaction that cites a source its file does not list;
  - a source listed twice, or one that is not an https page on the three hosts above;
  - a source with the wrong licence for its host, or a wiki page without its revision;
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
