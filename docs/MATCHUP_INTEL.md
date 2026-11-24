# Matchup Intel (retired)

**Retired on 23 Nov 2026 for [Champion Lookup](CHAMPION_LOOKUP.md)** (Release 16, the owner's
request of 23 Nov 2026: "The owner no longer wants a champion-vs-champion strategy system, curated
matchup briefings, suggested builds, rune recommendations or matchup evidence").

Matchup Intel (16–23 Nov 2026) was a static reference at `/resources/matchups` for two champions
chosen by hand, your champion and the enemy, in five roles: the enemy's abilities and base cooldowns
from Riot's Data Dragon, curated briefings for three pairs and checked notes for six champions
written from the League of Legends Wiki, facts drafted from Riot's own ability text and reviewed
automatically, an assembled reference for every other pair, interactions and level changes, Riot's
tips, cooldowns at a chosen haste, and evidence from the team's own games (runes, spells, items,
skill order). This page described all of it until Release 16; its full text, and the two reports
beside it (`MATCHUP_INTEL_RIOT_TEXT_REVIEW.md`, `MATCHUP_INTEL_ROSTER_AUDIT.md`), are in the
repository's history (`git show d086a174:docs/MATCHUP_INTEL.md`).

## What happened to it

- **The page** is Champion Lookup at `/lookup`: one champion, its five abilities, their base
  cooldowns per rank and at an ability haste, Riot's short descriptions. Every old link
  (`/resources/matchups` with any of `role`, `champion`, `vs`, `ally`, `vs2`, `ability`) redirects
  there, carrying one champion: the enemy (`vs`) where the link names one, else `champion`, then
  `vs2`, then `ally` (CHAMPION_LOOKUP.md, "Address").
- **Carried over unchanged:** the cooldown guard (what Riot's one array per slot can be trusted
  for, and the words for what it cannot: the passive, charges, two abilities in one slot, the
  exception list), Riot's general haste rule, the champion search, the Data Dragon abilities sync
  and its offline copy (now under `src/server/riot/static/` and `src/domain/champion-lookup/`).
- **Deleted:** the two-champion choice and roles, the curated briefings and lane plan, the checked
  notes and their sources, the facts from Riot's text (173 files), interactions and level changes,
  Riot's tips on the page, the evidence from the team's games, the builds' and runes' evidence, the
  admin's curation priorities, the by-hand `prep-backfill` job, the Production check's Matchup Intel
  facts, and their tests.
- **Kept as stored, with no destructive migration** (CHAMPION_LOOKUP.md, "What is stored and not
  shown"): the `account_match_prep` table and its rows (nothing writes or reads it now; an erasure
  still deletes the rows of the games it de-identifies), the build data (`riot_build_data`), the
  per-patch digests (`static_digests`, still read by Admin's Data & Integrations and `/api/health`),
  and Riot's tips inside the stored abilities. Each browser's remembered Matchup Intel choices
  (`uniiverse.matchup-intel.v1`) are no longer read; Settings → On this device → Clear all removes them.
- **Riot's registration** still describes Matchup Intel; the proposed description in
  [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) describes Champion Lookup instead (CHAMPION_LOOKUP.md,
  "For the owner").
