# Match Playbook and match history

## Match Playbook v2 (`src/domain/playbook`)

Built the moment a draft completes, from the final ten champions, the lineup and the current statistics. It is pure (same draft → same playbook) and is stored with the match record.

- **Quick Playbook** (one screen, shown in the draft room when the draft completes and full screen at `/draft/[id]/playbook`) — WIN CONDITION, EARLY GAME, TEAMFIGHTS, OBJECTIVES, WATCH OUT and PLAYER JOBS (one short job each), with the coach's note when one was written. It fits 1366×768, 1440×900 and 1920×1080 without scrolling; phones get tabs (Essentials: win condition, main threat, early plan, your job). Everything below is the separate **Detailed analysis** (`?view=detail`).
- **Per-player jobs** — one job, a lane note and a fight role for each of the five players, derived from kit traits (initiator, sider, primary damage, protector, pick/poke threats, jungle tempo) and the lane evaluation.
- **IF → THEN** — rules that react to the enemy's kits (their engage missing, their diver going onto our carry, their sider alone, poke at objectives, disengage up) and to our power curve.
- **Ahead / Even / Behind** — three short scenario plans.
- **Deny their plan** — their inferred win condition and how we deny it (their carry, their engage, their split, their scaling).
- **Self-critique** — honest structural weaknesses (thin frontline, no engage, weak waveclear, one damage type, three resource-hungry champions, demanding execution, bad interaction notes, lanes we must protect).
- **Threat map** — explicit champion-to-champion threats, shared with the draft room.
- The detailed plan (lanes, teamfight, side lane, objectives) stays available underneath, and "Copy for Discord" produces the compact text.

## Match history (`src/server/matches`, `/matches`)

**Archive only.** Nothing in the archive feeds back into recommendations: winning once, losing once or writing a note changes no number anywhere. A test (`tests/db/matches.test.ts`) pins this down by comparing recommendations before and after a result is recorded.

- A match record is created automatically when a non-theorycraft draft completes (idempotent per draft). Theorycraft drafts never archive automatically; a completed one can be saved by hand ("Save as match record").
- Stored: mode, series and game number (if any), event, patch, side, lineup snapshot, final assignments, both teams' bans and picks, enemy champions, optional enemy player names by role, optional opponent label, the playbook as drafted, and the optional result (win / loss / cancelled), duration, Riot match ID, notes and VOD link.
- `/matches` lists records with filters (mode, result, opponent label, patch, player, our champion); games of one series are grouped under a series header with its score. `/matches/[id]` shows the draft, the playbook, the series (with Next game / End series / Cancel), previous meetings with the same opponent label, and the editable facts.
- **Series**: scrim, tournament, custom, practice and other games can be started as a single game, best of 3 or best of 5. Each game is its own draft with its own side (blue or red, game by game), lineup, bans, picks, playbook and record. After a game, *Next game* starts the following game with the mode, event and opponent inherited and everything else fresh. The series ends by itself at 2-0 / 2-1 (best of 3) or 3-0 to 3-2 (best of 5), or by hand (end by score, or cancel). Archive only: nothing about a series changes recommendations.
- Linking a Riot match ID stores the ID; with a Riot API key configured the result, duration and a compact participant summary are fetched. Without a key, or when Riot cannot be reached, the page says so and nothing is guessed.
- **Corrections**: the draft's creator or an admin can edit a record (mode — not inside a series —, result, duration, Riot match ID, enemy names, opponent label, notes, VOD) and delete it after an inline confirmation. Deletion archives the record (it disappears from Match History and its page answers *not found*), keeps the draft, and re-scores the series; saving the draft as a match again restores it. Every rule is checked on the server.
- Deleting a draft keeps its match record (the link is cleared).

## Personal Match History compared with OP.GG and U.GG (October 2026)

**What could and could not be inspected.** The review was meant to compare the profile's Match
History with OP.GG and U.GG directly. Neither site could be opened from the development
environment (its network policy refuses both hosts), so no page, interaction or current layout of
either site was inspected. The comparison below rests on general, long-standing knowledge of how
those sites present a match list (a colour-coded row per game; an expandable scoreboard; team
comparisons; build details) and should be read as such: anything they changed recently is not
reflected, and nothing here claims an interaction was tried.

| | |
|---|---|
| **Already competitive** | Result, queue, time and duration on every row; champion with spells and runes; K / D / A with ratio; CS/min, damage/min, vision, kill participation; final items with trinket; a full scoreboard of both teams (damage bars, CS/min, vision, items, levels, objectives, bans); registered teammates named in the game; more filters than either site's list (season, mode, role, configured pool or one champion, linked account); honest states for records still being collected or no longer served. |
| **Needed improvement (done)** | Row hierarchy (K/D/A now the largest figure); no view of the two lineups on the row (both teams' champions now shown on wide screens, the player outlined); no summary of what the filters match (record, win rate, KDA, CS/min and damage/min of every matching game now under the title, same arithmetic as the Overview); filters laid out differently from the Overview (now the same component: season and mode up front, role, champions and account behind Refine); pagination took a full-width bar (now compact, with "Games 1–7 of 36"); the detail ran past the screen (now the player's figures on top and Scoreboard / Comparison tabs, each fitting a 1366×768 screen). |
| **Missing but valuable (done)** | A **Comparison** view built only from the game's record: the player's share of their team's champion damage, gold and kills; CS/min, damage/min, gold/min and vision beside the enemy in the same recorded position and the own team's average (no opponent shown when positions were not recorded, rather than a guess); team totals side by side (kills, gold, champion damage, towers, dragons, barons). |
| **Missing, not added** | Item purchase order, skill order and gold-over-time graphs: they need Riot's match timeline, one extra request per game, which the account sync does not fetch and which would multiply the Riot budget; not worth it for a team tool. Multikill badges: Riot sends them, but the stored record does not keep them yet; adding them needs the sync to record one more field (a later, data-only change). Average rank of the lobby: one ranked lookup per participant per game; refused for cost. |
| **Unnecessary** | Performance grades and labels such as "OP Score", MVP/ACE badges or letter grades: subjective scores this app avoids on purpose; live-game lookups; infinite "show more" lists (numbered pages keep the place and the URL); advertising and summoner-search features. |

Data integrity: every figure comes from the stored Riot record or the season ledger (one row per
match across a player's accounts, a shared game counted once). Team shares are shown only when the
figure is recorded for every member of the team; per-minute figures leave out remakes (under five
minutes). Rendering the list never calls Riot; only opening a game whose record was never
collected fetches it once.
