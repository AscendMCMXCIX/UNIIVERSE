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
