# Match Playbook and match history

## Match Playbook v2 (`src/domain/playbook`)

Built the moment a draft completes, from the final ten champions, the lineup and the current statistics. It is pure (same draft → same playbook) and is stored with the match record.

- **Quick playbook** — eight one-liners: WIN CONDITION, EARLY PLAN, PLAY FOR, FIGHTS, SIDE LANE, OBJECTIVES, WATCH FOR, AVOID, plus the coach's note from the draft overrides when one was written.
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
- Stored: mode, event, patch, side, lineup snapshot, final assignments, both teams' bans and picks, opponent (team link and name), the playbook as drafted, and the optional result (win / loss / cancelled), duration, Riot match ID, notes and VOD link.
- `/matches` lists records with filters (mode, result, opponent, patch, player, our champion). `/matches/[id]` shows the draft, the playbook, previous meetings with the same opponent and the editable facts.
- Linking a Riot match ID stores the ID; with a Riot API key configured the result, duration and a compact participant summary are fetched. Without a key, or when Riot cannot be reached, the page says so and nothing is guessed.
- Deleting a draft keeps its match record (the link is cleared). Deleting a match record (owner only) keeps the draft.
