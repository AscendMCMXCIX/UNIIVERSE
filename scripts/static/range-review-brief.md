# Ability range review: the reviewers' brief (Champion Intel, owner decision D3)

The brief each independent reviewer of `src/server/riot/static/ability-ranges.reviewed.json` works from (docs/CHAMPION_INTEL.md, "Ranges", "The review"). The evidence is `node scripts/static/review-ability-ranges.mjs --version <v> --draft drafts.json` with each spell's `draft` and `row` taken out, so the reviewer judges blind to the rules' opinion. Used for the first review on 27 Nov 2026 (Data Dragon 16.23.1) and for each patch's changed rows.

The owner wants ability ranges in Champion Intel only "where they can be reliably sourced, reviewed and maintained across patches. Do not invent or estimate unavailable values."

The number the page shows is ALWAYS Riot's own Data Dragon `range` for the spell, on the patch given (the version under review, e.g. 16.23.1, live patch 26.23). You never supply or correct a number. Your only job, per spell, is to classify WHAT Riot's number measures, so the page knows whether showing it as "Range N" is honest.

You are one of two independent reviewers. Judge every spell in your chunk on its own. Use Riot's description and tooltip (markup removed; `#` is a placeholder number), the range array (one value per rank), the champion's basic attack range, and your own knowledge of how the ability plays. Do NOT browse the web or read any repository files; the evidence file is all the evidence.

## Kinds (choose exactly one per spell)
- `reach`: Riot's number IS the ability's reach as a player means it: how far from where the champion stands they can cast, aim, target, dash, blink or fire it on this patch (cast range of a targeted or ground-targeted spell, the length of a skillshot, a dash's distance). Only if, to your knowledge, the number given matches that reach for EVERY rank. If the real reach differs from Riot's number (e.g. Riot's number is a missile's travel, a leash, an effect radius or an internal engine value), it is NOT reach.
- `global`: the ability is truly unlimited or whole-map and Riot's number is 5,000 or more.
- `self`: cast on or around the champion with no aim (a self-buff, an aura, an area centred on the champion, an empowered next attack); the number is not a reach to show.
- `none`: the number is not the reach. Give `why`, one of:
  - `placeholder`: 0, 1, 20, 25000 on a non-global ability, or another dummy value;
  - `two-forms`: the slot holds two abilities (a form swap, a name with " / " or " | ");
  - `not-the-reach`: the number measures something else (a radius, a travel distance that differs from the cast range, a leash, an engine number);
  - `scales-in-game`: the real reach changes in a game in a way the per-rank array does not capture (stacks, attack range, charge time, level-based beyond ranks);
  - `several-abilities`: the slot casts several distinct abilities with different reaches (recasts, stances, modes).
- `unsure`: you are not confident. Prefer this over a guess: a wrong range shown to the team is worse than none.

## Rules
- A `reach` must have one number per rank that never gets smaller at a higher rank; otherwise it cannot be `reach`.
- Do not use the draft rules' opinion (you do not have it); be independent.
- Keep `note` to at most 20 words, factual (e.g. "Line skillshot; 1,100 matches its length" or "Number is the missile travel; cast range is 600").
- Return exactly one verdict per spell in the evidence, in its order, with the champion and slot copied exactly.

## How the verdicts are combined (not shown to reviewers)
- Both reviewers give the same kind and it is the drafting rules' kind: the row is written with that kind (`automated review`).
- Both give `self`, or both `none`: written so (nothing is shown either way).
- Both give `reach` (or `global`) where the rules did not: two adjudicators, a verifier and a skeptic, each judge every such case from the same evidence; written as `reach` (`global`) only when both confirm it.
- Anything else (a reviewer unsure, the two split, an adjudicator not confirming): `none`, why `unconfirmed`. Nothing is shown, and `--write` never drafts it again.
