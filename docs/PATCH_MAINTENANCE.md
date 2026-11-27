# Patch day

What happens when Riot ships a game version, what runs by itself, and the few steps a person (or an engineering session) takes. Riot ships a patch about every two weeks; nothing here needs a deploy unless a step finds a problem.

## What runs by itself

- **`version-check`** (hourly) stores Data Dragon's new version: champions, items, runes, summoner spells, every champion's abilities, and the per-patch digests (`src/server/riot/static/`). Champion Intel's "Changed this patch" marks follow from the digests (`src/domain/champion-lookup/changes.ts`).
- **`/api/health`** alarms on a failed or stale refresh (`staticData`, `digests`; docs/MONITORING.md), and a scheduled Data jobs run fails while it is listed.
- **The builds' patch window** moves on with the current patch (`patchesAfter`, `src/domain/patch.ts`, handles the yearly rollover 16.24 → 17.1).
- **The season** follows the current patch's major version (17.x is Season 2027): every season view moves by itself (docs/RANKED_PROGRESS.md, "The 2027 ranked year").
- Where a rule meets something it does not know, it degrades honestly in production: no chip, no cost, "not in Riot's data", never a guess.

## The steps (about 15 minutes)

1. **Wait for the new patch** on `/api/health` (`patch`), within an hour of Data Dragon's.
2. **Run the patch check** from a checkout of `main`:

   ```sh
   pnpm exec tsx scripts/patch-check.ts            # Data Dragon's latest version
   pnpm exec tsx scripts/patch-check.ts --version 16.24.1
   ```

   Read only: it downloads Data Dragon's public files into memory and writes nothing. It runs the app's own rules (`compactChampionAbilities`, the cost, cooldown and mechanics rules, the item haste parser and the build path's item kinds) over every champion and item, and prints counts beside the committed offline fixture's: champions, spells, costs per kind, cooldowns per kind, mechanics chips, champions new or gone, abilities whose Riot text, cooldown or cost changed, **exceptions that no longer match** (a mechanics exception pinned to a text hash, a cooldown exception pinned to an array), and items whose ability haste the parser cannot read. It exits 1 when a champion cannot be read, when the share of spells with a resolved cost or cooldown drops by more than 5 points (`--max-drop`), or when an item's haste cannot be read: a format change.

   On 27 Nov 2026 against 16.23.1: 173 champions, 0 unreadable, 680 of 692 spells with a cost or cooldown (as at 16.22.1), 1,015 mechanics chips, 1 ability text, 1 cooldown and 2 costs changed, no stale exception, 72 of 72 haste items read.
3. **Read Admin → Data & Integrations:** the new version's digest counts and "Changed this patch".
4. **A stale exception** (step 2 names it): open its entry (`NOT_THE_MECHANIC` in `src/domain/champion-lookup/mechanics.ts`, `NOT_THE_COOLDOWN` in `cooldown.ts`), read Riot's new text or array, and either pin the exception to the new hash or array (the evidence still holds) or remove it (Riot fixed the data). A dedicated pull request, with its test.
5. **A format change** (step 2 exits 1): follow docs/CHAMPION_INTEL.md, "Data": update the rules in both `src/server/riot/static/abilities.ts` and `scripts/static/build-ability-fixture.mjs`, bump `ABILITY_RULES_FORMAT` in both, and rebuild the fixture.
6. **Ability ranges and Matchup Intel's reviewed notes**, where they are in use: the ranges' review (`--check`, docs/CHAMPION_INTEL.md) and the reviewed notes' staleness, which a note older than its patch limit shows as needing review (docs/MATCHUP_INTEL.md). Across the yearly rollover the patch count uses `patchesAfter`, so 16.24 → 17.1 counts as one patch.
7. **The browser tests' pin** (`E2E_DDRAGON_VERSION` in `e2e/ddragon-version.ts`, 16.22.1, the offline fixture's version) stays where it is on patch day: the specs then see the same champions whatever Riot ships. Bump it only in a dedicated pull request: rebuild the fixture (`node scripts/static/build-ability-fixture.mjs --version X`), check it (`CHAMPION_FULL_JSON=… pnpm vitest run src/server/riot/static/abilities.test.ts`), rebuild the item digest (`node scripts/static/build-item-digest.mjs --version X`), and update what the specs read from the pin (the `lookup-source` text in `e2e/champion-lookup.spec.ts`, the demo's patches).

## Once a year

- **The ranked year** (early January): Riot resets ranks; each account's ladder ends at its own reset reading. When Riot publishes the date, set `RANKED_2027_FROM` and `confirmed: true` in `src/domain/ranked-year.ts` (docs/RANKED_PROGRESS.md, "The 2027 ranked year"). A year after 2027 needs its entry in `RANKED_YEARS` before its first day.
- **The Production check's first weeks of a season:** All Champions' empty list is a warning, not a failure, in a calendar year's first 42 days (`scripts/live-check.mjs`).
- **The 60-day schedule rule:** GitHub stops a repository's schedules 60 days after its last commit (docs/DEPLOYMENT.md §4 b).
