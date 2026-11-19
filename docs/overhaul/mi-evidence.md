# Stage 0 · Matchup Intel: evidence and pipeline feasibility (directive §3)

Read-only audit for the owner's directive of 19 Nov 2026, taken on 19 Nov 2026 between about 07:00 and 08:30 UTC. It decides what §3 can build without making anything up.

**Sources**
- **The repository:** `origin/main` = `5e37015b` and `origin/ux/matchup-intel-dashboard`, read with `git show`.
  - The branch was `9cce9a33` when this audit began. At 07:30 UTC the import was pushed, making it `69b47a62`: 5 more commits, holding the 173 reviewed Riot-text files.
  - The local import worktree `/home/user/uniiverse-mi-import` was read only. It now tracks the branch with nothing ahead.
  - Paths below hold on both refs unless marked "branch".
- **Riot's official pages:**
  - developer.riotgames.com: `/docs/portal`, `/policies/general`, `/docs/lol`, `/docs/faqs`, and the API reference `/api-details/match-v5` and `/api-details/league-v4`;
  - Riot's 2020 article on Ability Haste (leagueoflegends.com).
  - support-developer.riotgames.com (the API Terms) answered **403**, so the terms are cited as the repository recorded them.
- **Data Dragon 16.23.1:** `versions.json`, `runesReforged.json`, `item.json`, `summoner.json`, `championFull.json` and `champion/Ornn.json`, read from ddragon.leagueoflegends.com.
- **Vercel's official docs:** `/docs/plans/hobby`, `/docs/functions/usage-and-pricing` and `/docs/functions/configuring-functions/memory`.
- **Production:** the public team page (one GET, counts only; the copy was then deleted).
- **The demo on :3871:** two GETs of Matchup Intel, with `uniiverse_view=player`.
- **Public Actions logs:** Data jobs 42372996219 (7 Nov, with `data-audit`) and Production check 44324710345 (18 Nov, database size).

**What this stage did not do**
- Nothing was edited, committed, pushed, started, stopped or triggered; no Data jobs run was started.
- No League of Legends Wiki or Weird Gloop page was fetched. One web search returned wiki results; none was opened or used.
- No personal data appears here: counts and anonymous labels only. The data-audit labels accounts `a1`… itself.

**Working files** (all under `docs/overhaul/`):
- `mi-evidence-dd/`: the Data Dragon files;
- `mi-evidence-riotdocs/`: Riot's API reference pages;
- `mi-evidence-public/`: the demo pages, the Data jobs logs and the 7 Nov data-audit extract;
- `mi-evidence-scripts/`: `dd_inspect.py`, `pools3.py`, `zod-bench.mjs`, `parse-bench.mjs`, `coverage-model.py` and `riotdoc.py`.

---

## 0. Key findings

1. **Today's Matchup Intel is a static reference, by design and by test.**
   - It makes no Riot API request: the registered description says so (RIOT_COMPLIANCE.md:25), and `src/server/riot/registration-description.test.ts:43,46,55` (branch) pins the words "no Riot API request" and "No live-game or champion-select features".
   - No branch holds rune, item, summoner-spell, skill-order, role, bot-lane or evidence-pipeline code. The demo page for Riven vs Mordekaiser and for Ornn vs Darius shows no such content; the one "Rune" on the page is Ryze's title.
   - The branch's layers:
     - L1, curated matchups: 3 pairs, all top lane;
     - L2, checked facts: 6 champions, 99 facts;
     - L3, Riot-text facts: 1,112 facts for 173 champions, reviewed automatically and by no person. They were pushed to the branch at 07:30 UTC (`69b47a62`); none is merged;
     - L4, Data Dragon cooldowns: 624 of 865 abilities show a number;
     - L5, the assembled reference: every other pair.
2. **The app already stores most of the raw ingredients, but only for members' games, and in a mix of queues and ranks.**
   - `match_details` keeps, for every participant:
     - the final items `item0..6`;
     - the two summoner spells;
     - the keystone, both paths and the five runes;
     - one merged `position` (`teamPosition || individualPosition`).
   - The **stat shards are never parsed** (`perks.statPerks`; `schemas.ts:62-66`, `match-details.ts:54`).
   - Timelines keep every player's purchases (undo-aware), skill order, gold, experience and CS per frame, and kill times. They do **not** keep positions, ability haste, level-ups, sales or plates.
   - The team's own evidence (7 Nov data-audit):
     - 14 accounts, **all on OC1**;
     - 5,246 counted games, of which only **39% are Solo/Duo** (57% normal draft);
     - 3,733 lane games with timelines.

     That is good for "your own games", not for high-elo recommendations.
3. **What Riot's data can and cannot support honestly.**
   - **Can:** from match-v5 and timelines, a **champion-level consensus** (the full rune page with shards, summoner spells, starting items, the first shop visit, the order of completed items, skill order, and ability haste and ranks by minute) and **measured lane dynamics** (gold, experience and CS differences by minute, a per-game lane end, kill timing, objective control).
   - **Cannot:** wave management, ability interactions, "how to trade", jungle pathing advice, or ahead/behind advice. These need curated notes a person has checked (verdict C).
4. **Policy: high-elo sampling is permitted in kind, but only with an owner decision and a registration update.**
   - Riot's League docs list "Aggregate player stats, without specific players" among approved use cases, and Personal keys are for "a small private community".
   - But "Your API key is approved only for the use case and game within your description" (FAQ). So the registration must describe it first.
   - It also reverses three recorded positions:
     - "makes no Riot API request" / "no champion-select features", pinned by tests;
     - the owner's standing rule "no retired feature brought back" (STATUS.md:7, :15, :309-311). Meta & Trends collected high-Elo games, and the ladder endpoints were removed with it;
     - the data-minimisation stance: #212 waits to delete 20,423 ladder players.

     That makes it a "major privacy change" under directive §8, so **the owner decides**.
5. **Budgets: storage, egress and Riot are not the constraint; Vercel is.**
   - **Storage:** the database is **173 MB, 34%**, on 18 Nov (Production check 44324710345). The task's "360–380 MB" is the 2 Nov figure, from before #86 dropped about 206 MB on 4 Nov. Compact aggregates need about 1–30 MB per patch.
   - **Egress:** negligible.
   - **Riot:** every member account is on oc1/sea, so sampling **EUW (euw1/europe) contends with nothing** and has 72,000 requests a day of room.
   - **Vercel (new finding):** Hobby also caps **Provisioned Memory at 360 GB-hours per 30 days**, about 12 GB-h a day. Functions are fixed at 2 GB and billed "even during I/O operations". The repository tracks only Active CPU.
     - A sampler held to Riot's rate limits is bound by wall-clock time, so on Vercel only about **7–12k games per patch** fit (about 0.8–1 h of slices a day, about 1.6–2 GB-h a day).
     - Anything larger needs a GitHub runner (free minutes for this public repository). That is a new workflow or schedule plus `RIOT_API_KEY` as an Actions secret: **owner approvals** (CLAUDE.md §6; STATUS.md:7).
6. **What drives the cost.**
   - Requests per game are about 2.1 whatever the scope: the match, its timeline and the amortised match-id lists. The **rarest champion you want covered sets N** (the games needed per patch).
   - The model (§4.3):

     | Games per patch | Main-role cells with n ≥ 200 | Share of picks covered | Lane games whose pair has n ≥ 30 | … n ≥ 100 |
     |---|---|---|---|---|
     | 8k | 109 of 245 | 80% | 35% | — |
     | 20k | 215 of 245 | 97% | 60% | — |
     | 40k | 245 of 245 | 100% | 77% | — |
     | 100k | 245 of 245 | 100% | 91% | 70% |

   - **Matchup-specific evidence stays partial at any personal-key scale.** An honest "matchup uncertain" view is therefore part of the design, not an edge case.
7. **Code findings that matter for §3 and §4.**
   - **(i)** The stored lane opponent is the **first** enemy with the same merged position, without a uniqueness check (`sync.ts:787`). The champion window's per-opponent records count it (`matchups.ts:219,235`), while its lane figures require exactly one such enemy (`matchups.ts:170`). Tighten this before §4's "win rate against each opposing champion".
   - **(ii)** Lane comparisons use fixed 10:00 and 15:00 (`match-analysis.ts:192-193`, "the early lane and its usual end"). The directive forbids a fixed-minute lane end; a per-game lane end is measurable (§2.3).
   - **(iii)** Riot already sends `statPerks`, frame `position`, `championStats.abilityHaste` and `LEVEL_UP`; the app drops them at parse time. Keeping them costs no extra request.
   - **(iv)** Data Dragon:
     - Riot's own champion tips (`enemytips`, `allytips`) exist for **147 and 149 of 173** champions and are unused;
     - there are **no recommended item sets** (0 of 173);
     - there are **no stat shards**: `runesReforged.json` has 62 runes and no 5000-series id, although the shard icons are served (9 checked, HTTP 200);
     - item ability haste is not a stat field: it appears only in the `<stats>` text of 70 Summoner's Rift shop items.

---

## 1. What the app has today

### 1.1 The Riot key and its terms, as recorded

- **A Personal key**, by evidence: Riot answered with the default limits (20 a second, 100 every 2 minutes), and the key outlived a development key's 24 hours (RIOT_COMPLIANCE.md:9, :13). The owner still has to confirm the product type in the portal: "Needs the owner" 7 is open "partly".
- **The registered description** (RIOT_COMPLIANCE.md:23-25, reported pasted by the owner on 17 Nov) ends:

  > "Matchup Intel, for signed-in accounts, is a static reference … It makes no Riot API request and has no timers or tracking. No live-game or champion-select features, no client integration, no data shared outside the team."

  The branch's proposed text (:27-29) keeps both sentences.
- **Endpoints in use** (RIOT_COMPLIANCE.md:57; `src/server/riot/api/endpoints.test.ts:13-23`, which fails on any unlisted path):
  - `account-v1`: by-riot-id, by-puuid and active region;
  - `match-v5`: a linked account's ids, matches and timelines;
  - `league-v4`: entries by PUUID only;
  - `champion-mastery-v4`;
  - `lol-status-v4`.

  The **ladder endpoints** (challenger, grandmaster and master leagues) were removed with Meta & Trends (docs/ARCHITECTURE.md:195-201).
- **Recorded decisions:**
  - "Considered and not built: a Match-V5 sample of every participant's history … It needs the owner to update the registration first" (RIOT_COMPLIANCE.md:128-137);
  - "No timers, cooldown tracking, champion-select scouting, counter or ban lists" (branch :200);
  - Matchup Intel decision: "Data Dragon only: no CommunityDragon data" (branch MATCHUP_INTEL.md, "What Riot requires").

### 1.2 What the jobs fetch and store

**Riot requests in use** (docs/DATA_PIPELINES.md:39-77):
- account sync, every 15 minutes, of members' linked accounts;
- the rank watch, every 5 minutes, at half of each rate-limit window;
- rank checks of the other players in members' games, at most 1,000 a day and half of each window;
- timelines when a game is opened, plus the hourly `timeline-backfill` of members' rift games with a lane opponent.

Every request goes through one client with a sliding-window limiter per host. It follows the limits Riot reports (`x-app-rate-limit`), honours `Retry-After` on 429, backs off exponentially on 5xx with bounded retries, and respects per-run deadlines (`client.ts`, `rate-limiter.ts:18`). It does not track **method** limits (no `x-method-rate-limit` handling).

**Which hosts the app uses.**
- The 7 Nov data-audit: all 14 linked accounts are on `oc1` (`"platform":"oc1"` ×14).
- The traffic therefore goes to `oc1` (league-v4, mastery), `sea` (match-v5) and `asia`. `asia` carries account-v1 for OC1 accounts: `accountRegionFor` maps sea to asia (`riot-platforms.ts:69-71`).
- **`europe`, `americas`, `euw1`, `kr` and `na1` carry no traffic from the app.**

**Stored fields that matter for the briefing:**

| Briefing ingredient | In Riot's answer | Parsed by the app | Stored | Evidence |
|---|---|---|---|---|
| Role / lane | `teamPosition`, `individualPosition` (match-v5) | both | **one merged field** `position = teamPosition \|\| individualPosition`; the source is lost | `schemas.ts:16-17`, `match-details.ts:40`, `fold-input.ts:61` |
| Lane opponent | derived | — | `account_matches.enemy_champion_id`: the **first** enemy with the same merged position | `sync.ts:787-789` |
| Rune page | `perks.styles[].selections[].perk` | yes | keystone, both paths, `primaryPerks` (4), `secondaryPerks` (2); older records hold the keystone and paths only | `match-details.ts:54`; schema comment `accounts.ts` `MatchParticipantDetail.runes` |
| **Stat shards** | `perks.statPerks {offense, flex, defense}` (Riot's reference: `PerkStatsDto`) | **no** | **no** | `schemas.ts:62-66` parses `styles` only |
| Summoner spells | `summoner1Id`, `summoner2Id` | yes | `spells[2]` | `match-details.ts:52` |
| Items | `item0..6` (at the end of the game) | yes | `items[7]`; **no build order** in the record | `match-details.ts:51` |
| Purchases in order | timeline `ITEM_PURCHASED`, `ITEM_UNDO` (also `ITEM_SOLD`, `ITEM_DESTROYED`) | purchased and undone only | `match_timelines.participants[].purchases [ms, itemId]`, **all 10 players**, undos removed | `match-timeline.ts:144-172` |
| Skill order | timeline `SKILL_LEVEL_UP` | yes (EVOLVE skipped) | `skills[]` | `match-timeline.ts:169` |
| Gold, XP, CS by minute | frame `participantFrames` | `totalGold`, `xp`, CS | `frames {t, p: {g, x, c}}` | `match-timeline.ts:41-47` |
| **Positions by minute** | frame `position {x, y}` (Riot's reference: `ParticipantFrameDto.position`) | **no** | **no** | `schemas.ts:107-117` |
| **Ability haste by minute** | frame `championStats.abilityHaste` (Riot's reference: `ChampionStatsDto`) | **no** | **no** | same |
| Level-ups, plates, wards | timeline events | no | no | same |
| Kills, deaths and assists times | `CHAMPION_KILL` | yes (no positions) | `kills`, `deaths`, `assists` [ms] | `match-timeline.ts:152-158` |
| Objectives | `ELITE_MONSTER_KILL`, `BUILDING_KILL` | yes | `events.objectives` | schema `MatchEvents` |
| Riot's lane challenge figures | `challenges.*` (for example `laningPhaseGoldExpAdvantage`, `maxCsAdvantageOnLaneOpponent`, `maxLevelLeadLaneOpponent`, `jungleCsBefore10Minutes`, `initialCrabCount`, `enemyJungleMonsterKills`, `junglerKillsEarlyJungle`, `playedChampSelectPosition`) | **only `soloKills`** | `extraStats.soloKills` | `schemas.ts:52` |

**Scope:**
- the queues 420, 440, 400, 430, 480, 490 and 700 (`sync.ts:26`), all on Summoner's Rift;
- only games a linked member played.

### 1.3 Data Dragon in use

`version-check` runs hourly; `static-sync` forces a refresh (`static-sync.ts:98-110`). It reads:
- **Champions and skins:** `champion.json` and the per-champion files.
- **Abilities** (Matchup Intel), stored in `app_settings."champion_abilities"`:
  - name, icon, ranks (`maxrank`), the base `cooldown` array, `maxammo`, the short description, and a hash of the description plus tooltip;
  - never `tooltip` text, `effect`, `vars`, `range` or `cost` (DATA_PIPELINES.md:9-37).
- **Items, summoner spells and runes:** `item.json`, `summoner.json` and `runesReforged.json`, **names and icons only** (`assets.ts:16-37,52`). Not the item gold, tags, recipe or haste, not the spell cooldowns, and not the rune slot structure.
- **Rank crests and role icons:** linked art from CommunityDragon, not data (RIOT_COMPLIANCE.md "Static art").

**What Data Dragon 16.23.1 holds** (`dd_inspect.py`):
- **`runesReforged.json`:** 5 paths and 62 runes. **No stat-shard ids** (5001–5013 absent) and no "StatMod" text. The shard **icons** are served: `cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png` and 8 others answered 200, but no file maps `statPerks` ids to names or icons.
- **`item.json`:**
  - 863 items, with fields `gold`, `from`, `into`, `depth`, `tags`, `maps`, `stats`, `description` and more;
  - the stat keys hold **no ability haste**;
  - the haste appears only in each item's `<stats>` text (`<attention>20</attention> Ability Haste`): 289 items mention it, **70 Summoner's Rift shop items carry a figure**;
  - by class: 15 starters, 138 completed items (no `into`, total of 2,000 gold or more), 6 tier-2 boots.
- **`summoner.json`:** cooldowns per spell, for example Flash 300, Teleport 300, Ignite 180, Smite 15.
- **The champion files:**
  - `spells[].cooldown` per rank, `maxrank` and `maxammo`;
  - base stats per level;
  - `recommended: []` for **all 173 champions** (Riot publishes no builds here);
  - `enemytips` for **147** champions (2–3 each; for example Ornn: "Try to stay away from walls. Ornn is much less strong if he cannot stun you.");
  - `allytips` for 149.

### 1.4 Matchup Intel's layers (branch `ux/matchup-intel-dashboard`, MATCHUP_INTEL.md:31-69)

| Layer | Holds | Count (19 Nov) |
|---|---|---|
| L1 Curated matchup | threat, opportunity, lane points, interactions | 3 pairs (Ambessa–Renekton, Gwen–Ornn, Riven–Mordekaiser), checked on 26.22. Hidden after 2 unchecked patches (`MAX_PATCHES_UNCHECKED`), so before 26.25 |
| L2 Checked facts | crowd control, mobility, defence, sustain and the rest; how cooldowns behave | 6 champions, 99 facts, 24 checked cooldowns, 7 level notes |
| L3 Facts from Riot's text | kinds of mechanic with the quoted clause; no numbers; reviewed by two automated reviews and an adjudicator | 173 files, 1,112 facts, version 16.22.1, `review.checkedByPerson: false`. On the branch since its 07:30 UTC push (`69b47a62`; 0 at `9cce9a33`) |
| L4 Riot's data | names, icons, base cooldowns per rank | 173 champions and 865 abilities: 624 with a number, 241 without (every passive, charges, two forms, placeholders, known-wrong arrays) |
| L5 Assembled reference | each side's L2, else L3, facts grouped by kind; no verdict | 29,753 of 29,756 pairs, plus mirrors |

Decisions that constrain §3 (branch MATCHUP_INTEL.md:1250-1275):
- **2**, "group, never judge": no ranking or "biggest threat" chosen by code;
- **3**, no pairings by rule between the two kits;
- **4**, Riot's tooltips are read for kinds only, never numbers;
- **13**, "a static reference: no live tracking".

`refused-words.ts` bars "you/your", "should", "must", "avoid", "win/wins", "best", "optimal", "counter", "punish", "all-in" and others in curated text and fixed sentences.

### 1.5 The team's own evidence (counts only)

- **7 Nov data-audit** (Data jobs 42372996219):

  | | |
  |---|---|
  | Accounts | 14, all on `oc1` |
  | Counted games (summed over accounts; a shared game counts once per account) | 5,246 |
  | Normal draft (queue 400) | 2,999 (57%) |
  | Solo/Duo (queue 420) | 2,038 (39%) |
  | Flex (440) | 160 |
  | Clash (700) | 33 |
  | Swiftplay (480) | 16 |
  | Lane games with timelines | 3,733 (`withFrames` 3,733) |

- The 8–9 Nov production copy held 7,555 match records and 4,898 timelines (HOSTING_USAGE.md, "How it was measured").
- **The public team page's champion pools** (`pools3.py`, counts only):

  | | |
  |---|---|
  | Player profiles | 7 |
  | Distinct (role, champion) pairs | **48** |
  | Distinct champions | 45 |
  | TOP | 6 |
  | JUNGLE | 13 |
  | MID | 14 |
  | ADC | 9 |
  | SUPPORT | 6 |

- **What this evidence can carry:** per patch, members' games give a common champion a few dozen observations in a role, at the team's own ranks, mostly normal games. Honest for "in your own games" (each member's own rune pages, starts and skill orders, labelled with n). **Not** honest as a high-elo recommendation.

### 1.6 Code-level findings (each a small, fixable item)

- **F1. The lane opponent is not checked for uniqueness where win rates are counted.**
  - `sync.ts:787` stores the first enemy whose merged position equals the player's. With the `individualPosition` fallback, two enemies can share it.
  - The champion window's opponent list and per-opponent records count `enemy_champion_id` directly (`matchups.ts:219,235`), while its lane figures demand exactly one enemy (`matchups.ts:170`, `count(*) = 1`).
  - **For §4:** count a pair only with `teamPosition` on both, exactly one per lane per team, and the same in `individualPosition` (or the lane-occupancy check, §2.2). Report "lane opponent unclear" games in `data-audit`.
- **F2. A fixed lane end.** `LANE_MINUTES = [10, 15]`, "the early lane and its usual end" (`match-analysis.ts:192-193`), feeds Match History's Analysis (`match-analysis-panel.tsx:112`) and Matchups.
  - The page labels them as "10:00" and "15:00", which is honest as snapshots.
  - Any "laning phase" claim in §3 or §5 must use a per-game lane end (§2.3).
- **F3. Data Riot already sends is dropped at parse time:**
  - `statPerks`;
  - the separate `teamPosition` and `individualPosition`;
  - frame `position`, `championStats.abilityHaste` and `level`;
  - the `LEVEL_UP`, `ITEM_SOLD`, `ITEM_DESTROYED` and `TURRET_PLATE_DESTROYED` events;
  - the `challenges` lane figures.

  Keeping them for games collected from now on costs no extra request: an additive change to schema and compaction.
  - Storage: shards and both positions add about 0.5 KB per match record.
  - Per-frame positions and haste add about 2–4 KB per timeline before compression.
  - A per-player summary (lane occupancy, haste at given minutes) costs a few bytes.
- **F4. Unused Riot-published content:** Data Dragon's `enemytips` and `allytips` (147 and 149 champions). They are Riot's own words, champion-level, possibly older than later changes, and the version check already downloads them.
- **F5. The registration tests block any Riot use for Matchup Intel** (branch `registration-description.test.ts:43,46,55`). They must change together with the owner's portal update. The same holds for `endpoints.test.ts` for the ladder endpoints.

---

## 2. What Riot's data offers for each briefing item

Legend for the sources:
- **M:** match-v5 match (`/lol/match/v5/matches/{id}`), one request a game;
- **T:** match-v5 timeline (`…/{id}/timeline`), one request a game;
- **S:** static data (Data Dragon, Riot's published rules);
- **—:** not in Riot's data.

| Briefing item | What Riot provides | Measurable how | Not derivable (needs curated, person-checked notes) |
|---|---|---|---|
| **Complete rune page with stat shards** | M: `perks.styles` (keystone, 3 primary runes, 2 secondary, both paths) and `perks.statPerks {offense, flex, defense}`. S: names and icons of the runes (`runesReforged.json`) | Whole-page frequencies per (patch, role, champion[, opponent]); shown as a real page players used, never per-slot modes stitched together | Shard names: S lacks them, so a 7-row id → name table needs a person to check it in the client (or the owner allows CommunityDragon for it) |
| **Summoner spells** | M: `summoner1Id/2Id`. S: names, icons, cooldowns (`summoner.json`) | Pair frequencies (order ignored) | — |
| **Starting items** | T: `ITEM_PURCHASED` / `ITEM_UNDO` before the player first leaves the fountain. S: item names, tags, gold | Frequencies of the starting purchase set | — |
| **Early recall purchases** | T: purchase clusters after the start; `CHAMPION_KILL` (victim) tells a death from a recall. Frame `currentGold`/`totalGold` once a minute | "First shop visit": time, gold spent, items; split into after a death and voluntary | Recall is not an event: "recall timing goals" are inferred, labelled as such |
| **Core build to about 3 completed items** | T: purchase order. S: `item.json` (`into`, `from`, `depth`, `tags`, `gold`) to classify completed items and boots (a small curated override list for edge cases) | Frequencies of ordered completed-item sequences (first 1, 2 and 3), boots apart; completion times | Why an item fits a matchup |
| **Starting ability and early skill order** | T: `SKILL_LEVEL_UP` (`skillSlot`, `levelUpType` NORMAL/EVOLVE) | Frequencies of the first 3 levels and of the max order | — |
| **Enemy cooldowns with ranks and modifiers** | S: base `cooldown` per rank (in use). S: Riot's haste rule ("10 Ability Haste = 10% more abilities cast…", leagueoflegends.com, 2020), so CD = base × 100/(100+AH). S: item haste from `item.json` `<stats>` text (70 items). T: **observed** `championStats.abilityHaste` per minute and ranks from `SKILL_LEVEL_UP` | Static table at chosen haste values (A); "typical haste and ranks at minute X in high-elo games" (B) | Refunds, resets, passive cooldowns, the recharge of charges, "starts when the effect ends": not in S numbers (passives have none), so curated (L2 has 6 champions). Never a timer or "ready at" (game integrity) |
| **Ability interactions** | S: L3 kinds of mechanic from Riot's text (no numbers, no pairing) | — | **C**: which ability beats which needs a person's judgement (decision 3) |
| **Trading opportunities and threats** | T: gold, XP and CS differences by minute between confirmed lane opponents; `CHAMPION_KILL` timing (solo, with assists); `LEVEL_UP` (level 2, 3 and 6 timing). M: `challenges.soloKills`, `maxLevelLeadLaneOpponent` | "Where the lead tends to change", "first kill by minute X": measured patterns with n | **C**: *how* to trade (spacing, cooldown windows) |
| **Power spikes** | T: lead changes around item completions and levels. M: results by game length | Measured "the lead tends to move after …", with n | **C**: the explanation |
| **Wave management and recall objectives** | T: CS by minute, plate events, first-back timing and gold. **No minion or wave state** | Measured CS difference at the lane end, plates, back timing | **C**: freeze, slow push, crash-and-recall advice |
| **Jungle clear, duels, invades, objectives** | T: jungle CS and positions **once a minute**; `ELITE_MONSTER_KILL` (dragon, grubs, herald, baron) with times and sides; `CHAMPION_KILL` jungler versus jungler. M: `challenges.initialCrabCount`, `scuttleCrabKills`, `enemyJungleMonsterKills`, `junglerKillsEarlyJungle`, `killsOnLanersEarlyJungleAsJungler`, `jungleCsBefore10Minutes` | Measured first-objective share by matchup, invade frequency, early duel outcomes | **C**: pathing. Once-a-minute positions cannot reconstruct a clear path reliably |
| **Bot-lane coordination, 2v2** | M+T: both sides' BOTTOM and UTILITY | Pairwise tables (ADC vs ADC, support vs support, ADC vs enemy support, the duo's own pairing); the full 2v2 combination only where n allows | **C**: coordination advice. The four-champion combination is almost never sampled enough |
| **Short ahead/behind adjustments** | T: the gold difference at the lane end, then the next items and outcomes | Descriptive: "when behind at the lane end, players most often build …", with n | **C**: advice. Confounded by game state, so never presented as cause |
| **Matchup known vs uncertain** | — | Evidence tiers per pair (§2.4); "blind" falls back to the champion level | — |

### 2.1 A confirmed lane opponent versus co-occurrence

- **Co-occurrence:** two champions in the same game on opposite teams, in any roles. **Never used as matchup evidence.** It is what a match list alone gives.
- **A confirmed lane opponent**, all of these:
  1. Both players have a non-empty **`teamPosition`** equal to the lane, on opposite teams. Riot's reference: "teamPosition is the best guess … if we add the constraint that each team must have one top player, one jungle, one middle, etc. Generally the recommendation is to use the teamPosition field over the individualPosition field" (`/api-details/match-v5`). **No fallback to `individualPosition`** for evidence, unlike `match-details.ts:40`.
  2. Exactly one player per lane per team (a team's five `teamPosition` values are all different).
  3. `individualPosition` agrees for both. Where it disagrees, the game is kept only if the lane-occupancy test (3) passes; otherwise it is counted as "role unclear".
  4. **Lane occupancy (timeline):** in the frames from about 2:00 to the measured lane end, both players' `position` is inside the lane's region of the map in most frames, with fountain frames excluded. The regions are calibrated once from the data itself: where `teamPosition = TOP` players stand at minutes 3–8. This catches lane swaps, 2v1s and roams.
  5. The game counts: queue 420, duration of at least 15 minutes, not a remake or early surrender, and none of the ten flagged as AFK (match-v5 has the early-surrender flags and `challenges.hadAfkTeammate`).
- **Bot lane:** both sides' BOTTOM and UTILITY are confirmed this way, giving a 2v2 sample.
- **Jungle:** both `teamPosition = JUNGLE`, Smite (spell 11) and jungle CS as most of their early CS. That gives a "jungler versus jungler" sample: no lane, but the same two-player structure the directive asks for.

### 2.2 Validating role assignment

Every run reports these as quality metrics (counts only) and gates publication on them:
- the agreement rate of `teamPosition` and `individualPosition` per role and champion;
- the share that passes lane occupancy;
- Smite on the jungler;
- the support's starter item (World Atlas line, from `item.json`);
- the CS share of laners.

If a patch's agreement drops markedly (a Riot change, an off-meta strategy), the build is held (§5).

### 2.3 The end of the laning phase, measured per game (no fixed minute or level)

Per game and per lane:
- the **earliest** of:
  - the lane's outer turret destroyed (`BUILDING_KILL`, `laneType`, `towerType = OUTER_TURRET`);
  - either player leaving the lane region for two consecutive frames, with trips to the fountain excluded (a roam, or the team grouping);
- for the jungle, the first two-team epic objective fight or the first contested objective (`ELITE_MONSTER_KILL`) is the comparable boundary.

The lane's gold, experience and CS differences are read at that time (interpolated between frames, as `valueAt` already does). The page reports the distribution of lane ends ("the lane usually broke between 11:40 and 15:10, median 13:20, n = …"). It never asserts one minute. The 14:00 end of turret plating is a game rule and may be cited as context, not as the lane end.

### 2.4 Sample sizes and when advice is reliable

Computed exactly (Wilson intervals; two-proportion power at 95% and 80%):

| What is claimed | Statistic | n needed | Why |
|---|---|---|---|
| "Most common X" (rune page, spells, start, skill order) | share of games | Show at **n ≥ 100** (a 50% share is ±9.6 pts); "Common choice" at **n ≥ 200** (±6.9); "Clear consensus" when the lower bound is ≥ 50% | Popularity among high-elo players is a description, not a claim that it wins |
| Alternatives | share | Show while its share is ≥ 15% at n ≥ 200 | "Multiple choices" (Riot's game-integrity line) |
| A matchup's own deviation from the champion's usual choice | two-proportion test with FDR at 5% across all pairs tested in the patch; empirical-Bayes shrinkage towards the champion's baseline (prior strength about 50 games; `domain/stats/shrinkage.ts` exists) | pair **n ≥ 50** to test, ≥ 100 to state | Thousands of pairs per patch: uncorrected, about 5% would "differ" by chance |
| Lane outcome (gold, XP, CS difference at the measured lane end) | mean with 95% CI | **n ≥ 30** "limited", **n ≥ 100** "evidence". With an assumed standard deviation of 1,000–1,500 gold: ±358–537 at 30, ±196–294 at 100 (to be measured in the pilot) | Continuous outcomes need far fewer games than win rates |
| Matchup win rate | proportion with CI | ±5 pts needs about **384**; ±3 pts about **1,067**; "favoured" only when the CI excludes 50% | — |
| Win rate of one build against another | difference | 2 pts about **9,800 per arm**; 3 pts about 4,400; 5 pts about 1,600 | **Not shown at personal-key scale.** It is also confounded: builds follow game state |
| Patch relevance | — | Current patch first. The previous patch is shown **labelled**, and only if Data Dragon shows no change to the champion (base stats, ability cooldown, cost and text hash), the items or the runes involved. Never silently pooled; never more than 2 patches | Data Dragon cannot show hidden number changes (MATCHUP_INTEL.md "Freshness") |

**Biases to state on the page:**
- the sampled players' rank (the **ladder tier of the sampled player** is known; the other nine players' ranks are not: the same caveat as the retired peer sample, MATCHUPS.md:38);
- the region (EUW, say);
- popularity is not proof that something is good;
- one-trick bias, if players were ever chosen by champion (not recommended).

---

## 3. Riot's policies and limits for this key

### 3.1 Key types and rate limits (developer.riotgames.com/docs/portal)

**Personal keys:**
- "Personal API keys should be used for products that are intended for just the developer or a small private community."
- "You may not run your application for public consumption using a personal key", and "public consumption includes open alpha/beta tests".
- "20 requests every 1 second" and "100 requests every 2 minutes".
- "These products can be registered without the verification process, but won't be approved for rate limit increases."
- "Personal keys require a detailed description of the product."

**Production keys** ("500 requests every 10 seconds", "30,000 requests every 10 minutes") are "for products that are intended for large communities or the Internet as a whole". They do not fit a private team tool.

**How limits apply:**
- "Method rate limits apply individually to each application" and "are also enforced per region". "Rate limits are enforced per region … you could make 20 requests every 1 second to both the NA and EUW … endpoints simultaneously."
- The API reference shows no method-limit figures without signing in, so they are **unverified** here. A sampler should read `X-Method-Rate-Limit(-Count)` and use only 3 ladder requests a day.

### 3.2 What a Personal key may do (FAQ, developer.riotgames.com/docs/faqs)

- "products for yourself and a small group": UNIIVERSE fits, signed in and about eleven accounts.
- "Your API key is approved only for the use case and game within your description": **any new use needs the description first.**
- "you may NOT have multiple applications to bypass rate limits": one product, one key, also from a GitHub runner.

### 3.3 Game integrity: what the page may say

From the General Policies and `/docs/lol`:
- "Products should not remove game decisions, but may highlight decisions that are important…"
- "Products should increase, and not decrease the diversity of game decisions (builds, compositions, characters, decks)."
- "Apps that dictate player decisions" are unapproved.
- "Products may not provide any game-session-specific information that would be previously unknown to the player."
- No tracking of enemy cooldowns (the ultimate-timer ban of 13 March 2025, as recorded).

**Implication:**
- show the most common choice **with alternatives and their shares**, never "the best build";
- static cooldown tables at given haste values are fine; timers or "ready at" are not;
- the two champions are chosen by hand, so nothing comes from a live game.

The registration's "No … champion-select features" is UNIIVERSE's own sentence, not Riot's rule. The directive's "reference quickly during champion select" needs it reworded, for example "no automatic champion-select integration; champions are chosen by hand".

### 3.4 High-elo sampling: allowed, and how much

- **Allowed in kind.** `/docs/lol` lists "Aggregate player stats, without specific players" among its approved examples (the fetch tool paraphrased the list; that item was quoted). Nothing in the General Policies, the FAQ or the portal page forbids reading other players' ranked matches for aggregates. It is the same pattern as the retired Meta & Trends, which this key ran from 6 to 19 Oct.
- **What it needs:** the description must say it (§3.2, and "Any new features or changes to a product must be audited through the product's page in the Developer Portal", General Policies).
- **The ladder:** `league-v4` `challengerleagues`, `grandmasterleagues` and `masterleagues` `/by-queue/RANKED_SOLO_5x5` return whole leagues. Riot's reference confirms `LeagueItemDTO.puuid`, "Player's encrypted puuid". `match-v5` `by-puuid/{puuid}/ids` accepts `queue`, `startTime` and `endTime` ("The matchlist started storing timestamps on June 16th, 2021").
- **Volume:** bounded only by the key's limits; there is no documented daily cap. One routing host allows at most 100 per 2 minutes, which is 72,000 a day; the retired collector's audit recorded "the hosts would allow roughly 70,000 requests a day each" (DATA_AUDIT.md §2).
- **Take only a share:** at most half of a host's windows (the app's own rule for rank checks), or up to about 80% of a host the members never use. EUW (`euw1` + `europe`) is used by **none** of the 14 accounts (§1.2).

### 3.5 Data handling (API Terms as recorded; the page itself answered 403)

- **The terms** (RIOT_COMPLIANCE.md rows 5–6):
  - delete Game Information when the terms end;
  - act on the deletion requests Riot forwards, "by sharing a list of identifiers".
- **The design stores no identifiers at all:**
  - PUUIDs, match ids and Riot IDs live only in memory during a run;
  - no ladder list is kept: it is re-read each run;
  - nothing is deduplicated by match id across runs. Runs use non-overlapping, one-hour-lagged **game-start time windows**, so each game is seen by one run and deduplicated in memory.
- **What it stores:** counts per (patch, role, champion[, opponent], choice). Forwarded deletion requests then have nothing to match.
- **Public logs** (Actions): counts only, as everywhere else.

### 3.6 What the registration must say (the owner's action, a draft)

Replace the Matchup Intel part of the description with, for example:

> "Matchup Intel, for signed-in accounts, is a reference for two champions chosen by hand: each ability's base cooldowns per rank from Data Dragon; the kinds of mechanic Riot's own ability text names, labelled as reviewed automatically; notes written from the League of Legends Wiki (cited, with the patch); and **aggregate statistics from high-elo ranked games, without specific players**: once a day it reads the Challenger and Grandmaster Solo/Duo ladders of one region (LEAGUE-V4), recent ranked match ids of some of those players, and those matches and timelines (MATCH-V5), and reduces them at once to counts per patch, role and champion (and lane opponent): runes and stat shards, summoner spells, starting items, first purchases, completed items in order, skill order, ability haste by minute and lane outcomes. No player identifier, name or match id is stored, nothing is shown about any player, and counts older than the previous patch are deleted. At most half of the key's rate limits; no timers or tracking; no automatic champion-select integration; no live-game data."

**Changes that go with it:**
- `endpoints.test.ts:13-23`: add the three ladder paths and widen the uses of `by-puuid/ids`, `matches` and `timeline`;
- RIOT_COMPLIANCE.md "Endpoints used" and item 9;
- `registration-description.test.ts`;
- MATCHUP_INTEL.md "For the owner";
- the privacy notice (`PRIVACY_UPDATED`), the owner's call, to say aggregate statistics of non-members' ranked games are kept, without identifiers.

---

## 4. Budgets and the cost of a sampling pipeline

### 4.1 The budgets as they stand

| Budget | Figure | Evidence | Note |
|---|---|---|---|
| Vercel Active CPU | 4 CPU-h per 30 days, **about 480 CPU-s a day**; expected use 100–150 a day after #274 | HOSTING_USAGE.md:15, :29, :75 | An expectation; the real daily figure is only in the owner's dashboard. The recon's finding (rank schedule off since 18 Nov) adds about 86 CPU-s a day if true. "Waiting on … Riot is not counted" (:29) |
| **Vercel Provisioned Memory** | **360 GB-h per 30 days, about 12 GB-h a day. Hobby functions are always 2 GB / 1 vCPU, and memory is billed "even during I/O operations"** | vercel.com/docs/plans/hobby; /docs/functions/usage-and-pricing; /docs/functions/configuring-functions/memory | **Not tracked anywhere in the repository** (`git grep` finds no "GB-h"). Exceeding any Hobby allowance pauses the deployment (503) |
| Vercel function duration | 300 s at most (Hobby); the tick's budget is 240 s (`scheduler.ts:54`) | Hobby docs | A sampler must work in slices |
| Supabase storage | 500 MB plan; **173 MB (34%) on 18 Nov**; an issue opens at 80% (400 MB) | Production check 44324710345 ("the database is 173 MB, 34% of its 500 MB plan"); production-check.yml:256-266 | **Corrects the task's "360–380 MB":** that was 2 Nov (HOSTING_USAGE.md:432), before #86 dropped about 206 MB on 4 Nov. It grows about 2 MB a day |
| Supabase egress | 5 GB a month; alert above **120 MB a day** | HOSTING_USAGE.md:112 | Writes are not egress |
| Riot | 20 a second and 100 per 2 minutes per host. The members' traffic is on oc1, sea and asia only | §3.1, §1.2 | europe and euw1 are free |
| Deploys | about 3 a day, a batch counting as one | CLAUDE.md:45 | The pipeline adds none once built |
| GitHub Actions | free minutes (public repository); jobs up to 6 h. **No new workflow, schedule or matrix without the owner's approval** (CLAUDE.md:60); a new secret also needs it (STATUS.md:7) | data-jobs.yml:31-37, :124-127 | Data jobs calls `/api/jobs/<name>` for any `[a-z-]` name, so an **app-side** job runs by hand with no workflow change. Scheduled workflows stop after 60 days without repository activity (STATUS "record 4") |

### 4.2 Unit costs (measured or derived)

- **Requests per sampled game:**

  | Request | Count |
  |---|---|
  | The match | 1 |
  | Its timeline | 1 |
  | Match-id lists | about 0.05–0.3, amortised (one list per sampled player per run) |
  | Ladder lists | 2–3 a run |

  That is about **2.1 per game**. A match-only mode (no timeline) is about 1.1 per game, but loses the skill order, starting items, first back, item order, ability haste and every lane measure.
- **CPU per game (measured locally):** reading a synthetic Riot-shaped match (69 KB) and timeline (427 KB) with the app's own zod schemas (`schemas.ts`, zod 4.6.7, Node 22.23) takes **2.48 ms**; `JSON.parse` alone takes 1.18 ms (`zod-bench.mjs`, 100 runs).

  **Budget 5–10 ms a game on Vercel**, for TLS, gunzip, extraction and the batched database write (HOSTING_USAGE: Vercel's per-call CPU "likely somewhat higher" than local).
- **Wall time:** bound by Riot. At half of one host (50 per 2 minutes) that is 1,500 requests an hour; at 80%, 2,400.
- **Memory if run on Vercel:** 2 GB × wall time.
- **Storage:** compact counts only (§4.5).

  The lesson from Meta & Trends: its raw and uncapped tables reached about 217 MB (`ranked_participants` 71.2 MB, `champion_matchups` 70.7 MB; HOSTING_USAGE.md:432-442). **Never store raw sampled games, and cap the aggregates.**

### 4.3 The three scopes

**The model** (`coverage-model.py`): per role, pick shares follow p_k ∝ (k+3)^-1.25. The most played champion has about 12% of its role's picks, the 10th about 2.8%, the 20th about 1.3%. A cell's n is 2·N·p; a directed pair's n is 2·N·p_A·p_B. These are **assumptions to replace with a pilot's measured distribution.**

| Scope | What must be covered | N games per patch needed (model) | Evidence reached | Requests a day (14-day patch) | Wall time a day | If on Vercel | Storage per patch (aggregates) |
|---|---|---|---|---|---|---|---|
| **(a)** The team's pools: 48 (role, champion) cells, 45 champions | champion level for the team's cells; their lane opponents | **8k** covers cells with a pick share ≥ 1.2%; **20k** covers ≥ 0.5% (rarer team picks flagged "insufficient") | 8k: 109 of 245 main-role cells n ≥ 200; pairs n ≥ 30 for 35% of lane games, n ≥ 100 for 10% | 1,540 (8k) to 3,260 (20k), **2–4.5% of one host** | 1.0–2.2 h at half a host | **8k only:** about 0.8–1 h of slices, about 1.6–2.1 GB-h a day (13–17% of the memory allowance), 3–6 CPU-s a day plus cold starts | about 1–3 MB |
| **(b)** The five roles' common champions (about 245 cells, pick ≥ about 0.4%) | champion level for all common picks; pairs for the common matchups | **20–40k** | 20k: 215 of 245 cells n ≥ 200 (97% of picks); pairs n ≥ 30 for 60% (n ≥ 100 for 27%). 40k: all cells; 77% (46%) | 3,260–6,110 (4.5–8.5% of a host) | 2.2–4.1 h at half a host (1.4–2.6 h at 80%) | **No:** 4.3–8.2 GB-h a day is 36–68% of the memory allowance | about 5–12 MB |
| **(c)** Every champion, off-role picks included (about 400–500 cells, pick ≥ about 0.1%) | champion level for rare picks | **≥ 100k** | 100k: pairs n ≥ 30 for 91% of lane games (n ≥ 100 for 70%); rare off-role cells still thin | about 14,700 (20% of a host) | about 10 h at half a host, so 2–3 hosts in parallel | **No:** about 19.6 GB-h a day is above the allowance | about 15–30 MB |

What the table shows:
- **Scope changes storage about 10×, not requests per game.** One cannot ask Riot for "games with Ornn". Even (a) needs the N set by its rarest champion: with 48 cells covering about 30% of each role's picks, about 97% of games contain at least one of them, so skipping irrelevant timelines saves almost nothing.
- **(c) is the scale of Meta & Trends.** It means several hosts and hours a day on a runner.

### 4.4 The cheapest design that gives honest recommendations (three tiers)

**Tier 0: now, no owner action, no new Riot use (A).** All in the existing jobs and page.
1. **Riot assets** (`assets.ts`): extend them with:
   - item `gold`, `tags`, `from`/`into`/`depth` and the haste figure parsed from `<stats>`, with a test against the 70 items;
   - summoner spell cooldowns;
   - rune slot structure.
2. **A haste-adjusted cooldown table:** base per rank × 100/(100+AH) at a few haste values, citing Riot's 2020 rule. Static only; no timer.
3. **Riot's `enemytips`/`allytips`**, labelled "Riot's tip (may predate later changes)". Mention them at the next registration update; no new endpoint.
4. **Additive capture from now on:** `statPerks`, separate `teamPosition` and `individualPosition`, and per-player lane occupancy and haste at a few minutes in the timeline compaction (F3). One migration, with the grants block from DATABASE_PERMISSIONS.md.
5. **Fix F1** (a strict lane opponent) and report "lane opponent unclear".
6. **The evidence framework on the page:**
   - an evidence tier per item: "No high-elo evidence (not collected)", "Limited (n = …)", "Common (n = …)";
   - a "matchup uncertain / blind" champion-level view;
   - "In your games" (the member's own pages, starts and skill order, with n). This is the member's own data, honest under the current registration.

**Tier 1: the owner approves aggregate high-elo processing and pastes the registration (B). Runs on Vercel within budget.**
- **`mi-sample`**, an app-side job in the existing tick:
  - an hourly slice of at most 120 s;
  - on **euw1/europe** only (no member traffic), at most 80 requests a slice;
  - reads the Challenger and Grandmaster lists (2 requests), picks about 30 players by a keyed hash of (player, slice), reads their Solo/Duo ids for a game-start window [t−2 h, t−1 h);
  - fetches about 22 new games with their timelines, validates and extracts them, and adds counts in **one batched upsert** together with advancing the window, so the work is exactly once.

  That gives about **530 games a day, about 7.4k a patch**, about 0.8 h of instance time a day (about 1.6 GB-h) and about 5–10 CPU-s.
- **`mi-build`**, daily: thresholds, intervals, FDR, validation, an atomic publish (§5).
- Champion-level consensus for common champions. Pair-level only "limited", for the commonest pairs.
- **Before switching it on:** the owner reads Usage → Provisioned Memory and Active CPU. No API on Hobby gives either.

**Tier 2: plus the owner approves a workflow and schedule and `RIOT_API_KEY` as an Actions secret (B).**
- The same sampler code, run as a **GitHub Actions** job (daily, `timeout-minutes` ≤ 300, `permissions: {}`, counts-only logs):
  - 2–4 h at up to 80% of europe gives **20–40k games a patch**;
  - it posts **count deltas**, no identifiers, to `/api/jobs/mi-ingest` with the existing `CRON_SECRET`, so no database credential is added;
  - Vercel only validates and upserts (about 0.1–0.3 CPU-s a day).
- Covers scope (b): champion level for nearly every common pick, and pair-level evidence for most common matchups.

### 4.5 Storage design

Tables (smallint ids; RLS on; no Data API grants; `SELECT` for the backup role):

| Table | Holds | Rows per patch (scope b) |
|---|---|---|
| `mi_cells (patch, role, champion)` | games, wins, confirmed lane games, sums and squares of the lane-end gold, XP and CS differences, the lane-end time, first-kill counts | about 250–500 |
| `mi_pairs (patch, role, champion, opponent)` | the same for confirmed opponents; the bot pairwise tables | about 3–15k |
| `mi_choices (patch, role, champion, opponent \| null, kind, key)` | `count` and `wins`, for these kinds: rune page (keystone, 5 runes, 3 shards), spells, start, first shop visit, completed-item path (1–3), skill order, boots, haste at minutes | champion-level about 50–90k before pruning. Pair-level keys only for the "deviation" kinds and pairs with n ≥ 30: about 20–40k |
| `mi_builds` (or `app_settings`) | the published build's pointer, validation summary and counts | 1 |

- **Pruning** at each build:
  - delete patches older than the current one minus one;
  - at a patch's close, drop keys seen once;
  - cap each cell's keys at its top 20 plus an "other" count.
- **Total:** at most about 30 MB for two patches at scope (b), against 227 MB before the 80% alert.
- **Egress:** a page reads about 100 rows (10–20 KB), cached per instance.

---

## 5. The pipeline the directive asks for: where each part runs and how it is tested

| Requirement | Design | Runs in | Tested by |
|---|---|---|---|
| **Detect relevant patches** | The existing `version-check` (hourly; `patches`), **plus** each sampled game's `gameVersion` (major.minor) puts it in its patch. Data Dragon "is not always updated immediately", so the game's own version decides the bucket | app tick (existing); `mi-sample` | unit: version to patch; DB: a new patch opens a bucket |
| **Refresh champion information** | The existing static sync (champions, abilities, assets) extended (Tier 0 §4.4 1), plus a **per-version diff** (base stats, each ability's cooldown, cost and text hash, items' stats, gold and text hash, runes' text hash) stored with counts | `version-check` | unit: a diff between two fixture versions; the existing abilities tests (`tests/db/matchup-intel-abilities.test.ts`) |
| **Reassess as evidence changes** | `mi-build` recomputes from cumulative counts daily; the page computes nothing heavy. A **change log** between builds ("most common start changed on 26.23") | app job, daily (by tick interval or by hand via Data jobs) | DB: the build is deterministic on seeded counts; e2e on the demo seed |
| **Flag outdated or unreliable advice** | Each item carries (patch, n, interval, build date). Below threshold: not called "common". On a new patch, the previous patch's items show **labelled**, and only if the diff shows no change to that champion, item or rune; otherwise they are hidden with the reason. The curated layers keep their own freshness (`MAX_PATCHES_UNCHECKED`) | page and `mi-build` | unit: threshold and labelling rules; e2e: the label wording |
| **Validate before publishing** | A staged build passes these invariants before the pointer moves: <br>• each role's cells total 2 × the patch's games; <br>• role agreement and lane occupancy within the band set by the pilot; <br>• every id exists in that patch's Data Dragon; <br>• no published row under its threshold; <br>• no identifier columns (an allowlisted schema); <br>• drift: a top choice moving more than 30 pts at n ≥ 400 is held for review. <br>On failure the **last good build stays** and the run is degraded | `mi-build` | DB tests per invariant (a failing fixture keeps the old pointer) |
| **Retry transient failures** | The existing client: `Retry-After`, bounded 5xx back-off, deadlines; `recordFailure`-style skipping of a bad record (`MAX_SKIPPED_RECORDS`); a 401 or 403 stops the run. The window advances only with the batch that holds its counts | `mi-sample` | unit (mocked client): 429, 5xx, timeout, a refused key; DB: a re-run of a window adds nothing twice |
| **Safe fallbacks** | No build or a stale one: "Evidence not available (last built …)", with the static layers (L1–L5, cooldown tables, Riot's tips) unchanged. A pair under threshold: the champion-level view, saying "matchup uncertain". A champion under threshold: "Not enough high-elo games on patch …" | page | e2e: each state on the demo |
| **Monitor pipeline health** | `data_refresh_status` rows for `mi-sample` and `mi-build`; `/api/health` lists a failing job (existing rule) **and** a stale build (none for 36 h while a patch has games); the scheduled Data jobs run fails on health, so the owner is emailed; Admin → Data health shows counts; the **Production check** (signed in; the branch already loads Matchup Intel once, decision 11) asserts the evidence label and a build under 3 days old | app, Data jobs, Production check | `route.ts` tests; live-check facts |
| **Privacy** | No identifiers stored; logs give counts only; aggregates shown only to signed-in members | all | a schema test (no `puuid`, `match_id` or `riot_id` columns in `mi_*`); the live check's existing key scan |
| **Budget guards** | Each slice stops at 120 s and 80 requests; `mi-sample` records CPU-ms and the slice's wall time in its summary. A host used by any linked account is never sampled (all on oc1 today) | `mi-sample` | unit; a `perf-probe` once after the first deploy (CLAUDE.md §5) |

**The deploy plan:** Tier 0 is about 2 PRs with 1 migration (then `auth-audit`), batched into 1–2 deploys. Tier 1 is 1 PR merged **after** the owner's portal update, with the tests and docs of §3.6.

**Video analysis** (directive "may be considered"): not recommended. It needs footage rights, terms and costly processing, and blocks nothing above.

---

## 6. Verdict per briefing item

- **A:** buildable now, from evidence already permitted, within budget.
- **B:** buildable with owner action. O1–O6 are defined in §7.
- **C:** not honestly buildable without person-checked curation.

| Briefing item | Verdict | What is buildable | Owner action | Honest fallback the page shows otherwise |
|---|---|---|---|---|
| Complete rune pages with stat shards | **B** | High-elo whole-page frequencies with alternatives | O1, O2, O3. Shards also need **O6** (a person checks 7 shard names in the client, or CommunityDragon is allowed for the shard map) | "No high-elo evidence collected"; "In your games: your most-used page (n = …)". Shards only for your games stored after the additive change |
| Summoner spells | **B** (static parts A) | Pair frequencies; spell cooldowns from Data Dragon (A) | O1–O3 | Cooldowns (A) and "In your games" |
| Starting items | **B** | Starting sets from timelines | O1–O3 | "In your games" (all 10 players' purchases exist in stored timelines, but only members' own rows should be shown) |
| Early recall purchases | **B** | "First shop visit": time, gold, items; after a death or voluntary | O1–O3 | "In your games" |
| Core build (about 3 completed items) | **B** | Ordered completed-item paths, boots apart | O1–O3 | "In your games" |
| Starting ability and early skill order | **B** | First 3 levels and max order | O1–O3 | "In your games" |
| Enemy cooldowns with ranks and modifiers | **A** (base per rank exists; the haste table from Riot's rule and item text) / **B** (typical haste and ranks at minute X) / **C** (refunds, resets, passives, recharge) | A now; B with O1–O3 | O1–O3 for the measured part | "Cooldown not in Riot's data" (existing rules); L2 for the 6 curated champions |
| Ability interactions | **C** | — | The owner, as sole curator (17 Nov), writes and checks them | L2/L3 facts side by side (exists) plus Riot's `enemytips` (A), labelled; "No person has checked how these kits interact" |
| Trading opportunities and threats | **B** (measured lane dynamics) + **C** (how) | Lead change by minute and level, first-kill timing, solo kills | O1–O3; curation for advice | Riot's tips (A) and the champions' facts; "No curated trading notes" |
| Power spikes | **B** + **C** | Lead movement around levels and items; results by game length | O1–O3 | "Not measured yet" |
| Wave management and recall objectives | **C** (B only for back timing, plates and CS) | Measured first-back timing, gold, CS difference at the lane end | curation | "No wave guidance for this matchup"; measured back timing if collected |
| Jungle clear, duels, invades, objectives | **B** (measured) + **C** (pathing) | Objective control and timing by matchup, invade frequency, early duel outcomes | O1–O3 | "No path guidance: Riot records positions once a minute" |
| Bot-lane coordination and 2v2 | **B** (pairwise) + **C** | ADC vs ADC, support vs support, cross pairs, the duo's own pairing; the full 2v2 only where n allows | O1–O3 (Tier 2 for useful n) | Pairwise evidence, "this 2v2 combination has too few games" |
| Short ahead/behind adjustments | **B** (descriptive) + **C** (advice) | "When behind at the lane end, players most often build …" (n), never causal | O1–O3 | none shown |
| Matchup known vs uncertain | **A** (framework) + **B** (evidence) | Tiers and the blind view | — | The champion-level view |

Two more verdicts:
- **Inputs (two champions; four for bot): A.** No full team, no jungle input, as the directive says.
- **A lane end without a fixed minute: A** for members' games once positions are captured, **B** for high elo.

---

## 7. What the owner must decide or do (one message)

- **O1. Allow aggregate processing of non-members' high-elo ranked games?** Directive §8 calls this a major privacy change, and it bends the standing rule "no retired feature brought back" (Meta & Trends). The design stores no identifier (§3.5).
  - Answer: yes or no, the region (EUW recommended: no member plays there), and Tier 1 or Tier 2.
- **O2. Paste the new registration text** (§3.6) in the Developer Portal and confirm the product is **Personal** ("Needs the owner" 7). This is also the owner's step 10 of the Matchup Intel branch. A **privacy-notice line** (`PRIVACY_UPDATED`) is recommended.
- **O3. Where it runs:**
  - **Tier 1, on Vercel:** read Usage → **Provisioned Memory** and Active CPU first. The 360 GB-h allowance is untracked.
  - **Tier 2, on GitHub Actions:** approve one scheduled workflow (CLAUDE.md §6) and add `RIOT_API_KEY` (the same key) as an Actions secret (STATUS.md:7).
- **O4. Confirm Fluid compute** ("Needs the owner" 16). The memory model above assumes it.
- **O5. Curation:** who writes and checks interactions, wave, trading and jungle notes (C items). The rule since 17 Nov: the owner alone. Plus the open compliance remedy for the 16 Nov scripted wiki reads ("Needs the owner" 19).
- **O6. Shard names:** a person checks the 7 current shards in the client (recorded with the patch), or the owner allows CommunityDragon for that one map. The current rule is "Data Dragon only".

Also needed, but the session can decide under the directive (product wording, not policy):
- revisit decisions 2 and 3 and the refused-words list for evidence-backed sentences;
- keep "multiple choices, no commands";
- never use "best" or "wins more" below the thresholds of §2.4.

---

## 8. Recommendations, in order

1. **The local import is now pushed** (`ux/matchup-intel-dashboard` at `69b47a62`, 07:30 UTC), so L3 is no longer only local. It still needs a PR, CI and the owner's portal step 10 before it merges.
2. **Tier 0 now** (A, no owner action): the extended assets, the haste table, Riot's tips (labelled), the additive capture of `statPerks`, both positions, occupancy and haste, the fix for F1, and the evidence-tier UI with "matchup uncertain" and "In your games". It holds every item's honest fallback before any sampling exists.
3. **Ask O1–O6 in one message**, with the registration draft and the cost table (§4.3). Until O1 and O2 are answered, the page must say "No high-elo evidence collected", never a placeholder recommendation.
4. **On a yes:**
   1. a 1-week **pilot** of Tier 1 on EUW: measure the real pick distribution, the role-agreement and occupancy rates, and the lane-end and gold-difference spread, so the thresholds rest on data;
   2. publish champion-level consensus only;
   3. move to Tier 2 if pair-level coverage is wanted.
5. **Keep §5's validation, fallback and monitoring in the first sampler PR**, not later: the live-check facts, the health staleness rule and the schema test with no identifiers.
6. **Correct the record:**
   - the database is 173 MB (34%), not 360–380 MB;
   - Vercel's Hobby memory allowance (360 GB-h) belongs in HOSTING_USAGE.md beside Active CPU.

---

## Appendix A. Commands and measurements (reproducible)

- **Branch heads:** `git -C /home/user/uniiverse fetch -q origin`, then `git rev-parse --short origin/<branch>`:
  - main 5e37015b;
  - matchup-intel-dashboard 9cce9a33 at the start, 69b47a62 after the 07:30 UTC push (5 commits; `riot-text/` holds 174 files, 173 JSON plus `index.ts`; the registration test still pins "no Riot API request");
  - nav-refinements 0fdc9226;
  - leaderboards-dashboard 903b7e42;
  - large-text-final da34ce1d.
- **Schema and code facts:** `git show origin/ux/matchup-intel-dashboard:src/server/db/schema/accounts.ts` (lines 133–281); `git grep -n "teamPosition\|individualPosition"`; `git grep -n "enemyChampionId"`; the line numbers as cited.
- **Data Dragon:** `curl https://ddragon.leagueoflegends.com/api/versions.json` gives 16.23.1 latest. `runesReforged.json`, `item.json`, `summoner.json`, `champion/Ornn.json` and `championFull.json`, inspected by `dd_inspect.py` and inline scripts:
  - 62 runes and no shard ids;
  - 863 items, no haste stat key, haste text on 289 items (70 SR store items);
  - `recommended` empty for 173 of 173; `enemytips` 147, `allytips` 149;
  - 9 shard icons, HTTP 200 each.
- **Riot's API reference:** `curl https://developer.riotgames.com/api-details/match-v5` (and `league-v4`), parsed by `riotdoc.py`:
  - `PerkStatsDto {defense, flex, offense}`;
  - the `teamPosition` guidance (quoted in §2.1);
  - `ParticipantFrameDto.position`;
  - `ChampionStatsDto.abilityHaste`;
  - the `startTime` note;
  - `LeagueItemDTO.puuid`.
- **Own data:** Data jobs 42372996219 job log via `gh api repos/AscendMCMXCIX/UNIIVERSE/actions/jobs/<id>/logs`, the data-audit section summed: 14 accounts, all oc1, 5,246 counted games by queue as in §1.5, 3,733 lane games with timelines.
- **Database size:** `recon-work/pc-44324710345.log`: "ok: the database is 173 MB, 34% of its 500 MB plan."
- **Pools:** the public team page, one GET; `pools3.py` counts 7 profiles and 48 (role, champion) cells. The copy was deleted after counting.
- **Demo:**
  - `curl -b uniiverse_view=player http://127.0.0.1:3871/resources/matchups?champion=Riven&vs=Mordekaiser`: 200 in 0.33 s, "Curated briefing" ×4, no rune, spell, item or skill-order content;
  - `…?champion=Ornn&vs=Darius`: "Assembled reference" ×4, "not reviewed" ×6.
- **CPU:** `node --experimental-strip-types zod-bench.mjs`: 2.48 ms a game with the app's schemas, 1.18 ms for `JSON.parse` alone (synthetic 69 KB match and 427 KB timeline).
- **Coverage and costs:** `coverage-model.py` (the model in §4.3) and the Wilson and power figures in §2.4 (inline Python).

## Appendix B. Riot's and Vercel's statements quoted

- **Portal** (developer.riotgames.com/docs/portal):
  - "Personal API keys should be used for products that are intended for just the developer or a small private community."
  - "You may not run your application for public consumption using a personal key."
  - "20 requests every 1 second" and "100 requests every 2 minutes."
  - "Method rate limits apply individually to each application." "Method rate limits are also enforced per region."
  - "Personal keys require a detailed description of the product."
- **FAQ** (developer.riotgames.com/docs/faqs):
  - "Your API key is approved only for the use case and game within your description."
  - "Please note you may NOT have multiple applications to bypass rate limits."
- **General Policies** (developer.riotgames.com/policies/general):
  - "All products must be registered in, and audited by Riot Games through the Developer Portal."
  - "Any new features or changes to a product must be audited through the product's page in the Developer Portal."
  - "Products should use supported services from Riot Games for data ingestion."
  - "Products should increase, and not decrease the diversity of game decisions (builds, compositions, characters, decks)."
  - "Products should not remove game decisions, but may highlight decisions that are important…"
- **League docs** (developer.riotgames.com/docs/lol), as returned by the fetch tool:
  - approved examples include "Aggregate player stats (no specific players)" and "Game overlays that provide static data that is available prior to the game";
  - unapproved: "Apps that dictate player decisions"; "Products may not provide any game-session-specific information that would be previously unknown to the player"; Data Dragon "is not always updated immediately after a patch."
- **match-v5 reference:** "Generally the recommendation is to use the teamPosition field over the individualPosition field." "The matchlist started storing timestamps on June 16th, 2021."
- **Riot, "Preseason 2021 Champion Class Item Goals"** (leagueoflegends.com): "Ability Haste will provide a linear power scaling model for more ability casts." "So 10 Ability Haste = 10% more abilities cast, 20 = 20% more, 30 = 30% more."
- **Vercel** (/docs/plans/hobby; /docs/functions/usage-and-pricing; /docs/functions/configuring-functions/memory):
  - Hobby includes "Active CPU 4 CPU-hrs", "Provisioned Memory 360 GB-hrs", "Function Invocations First 1,000,000", and a "Vercel Function maximum duration 300s".
  - Provisioned Memory "Continues billing while handling requests, even during I/O operations."
  - "Hobby users will always use the default memory size of 2 GB (1 vCPU)."
