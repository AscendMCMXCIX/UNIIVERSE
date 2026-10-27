# Ranked Development

Ranked Development is a private section of **My Profile** (`/overview/development`) for a player's
Solo/Duo practice. It replaces Solo Queue Blocks and keeps every block, game, note and mistake
recorded there. A block is now a **session**, and the old addresses (`/overview/blocks…`,
`/blocks…`, `/ranked…`) redirect to it.

It has three areas:

| Area | Address | What it holds |
|---|---|---|
| **Overview** | `/overview/development` | Before you queue (the current objective, why it matters, its If–Then plan, Start or Continue); games waiting for a review; the session in progress or the last session's summary with the keep / adjust / replace choice; progress on the objective; learning priorities; recent reviews |
| **Sessions** | `/overview/development/sessions`, `…/sessions/[id]` | The session in progress with its games, reviews and confirmations; adding a missing game; every earlier session, ten per page, each with its summary |
| **Development** | `/overview/development/library` | The weakness library (objectives with progress steps, plans, evidence and reviews), patterns in the reviews, and every If–Then plan written |

Only the signed-in player sees any of it. It never appears on a profile that others open, in team
statistics, on the public page or in Leaderboards.

## Principles, and where they show up

The design draws on established ideas about practice. They are reasons for the design, not
evidence that UNIIVERSE improves anyone's LP or rank, and the app never claims that it does.

| Principle | Background reading | In the app |
|---|---|---|
| **Process goals** over outcome goals: one behaviour to practise, under the player's control | Kingston & Hardy (1997); Zimmerman & Kitsantas (1996) | One **current objective** at a time (`is_primary`, unique per player). The editor asks "What will you practise?" and points out a title that names a result such as a rank, LP or win rate (`looksLikeOutcome`). It does not refuse it. |
| **Implementation intentions** (If–Then plans) | Gollwitzer (1999); Gollwitzer & Sheeran (2006) | Each objective can carry an **If–Then plan**, written by the player or started from a template for its area and role. The plan is shown before a session, on the session card between games, and in the review window. Plans are versioned, can be reused for another objective, and can be retired. |
| **After-action reviews**: short, soon after the event, the same few questions | Ellis & Davidi (2005); Tannenbaum & Cerasoli (2013) | A review asks three things: how consistently the plan was followed (Not at all / Sometimes / Mostly / Every time), the biggest learning point, and the adjustment for the next game. Two optional areas follow ("went best", "hardest"). Every answer is optional, and **Skip** costs nothing. |
| **Deliberate practice loop**: Identify → Plan → Practise → Review → Adjust → Repeat | Ericsson, Krampe & Tesch-Römer (1993) | Library (identify) → plan editor (plan) → session (practise) → review (review) → session summary with keep / adjust / replace (adjust) → next session (repeat). |

### Honesty rules

The whole feature follows these rules:

- **Riot's figures and the player's own reports are always kept apart and labelled.** The two
  labels are "From Riot's game data" and "From your reviews · self-reported". Self-reported plan
  follow-through is never presented as verified improvement.
- **Nothing is fabricated.**
  - A comparison with too few games says "not enough games" and how many are missing.
  - An objective without a statistic says that its reviews are its record.
  - LP is shown only when stored rank snapshots bracket exactly the session's games. Otherwise the
    app says why it is unknown (`LP_REASON_TEXT`).
- **Wins never move an objective.** Only the player changes an objective's step. A suggestion to
  move on appears only when the player's own record supports it (`suggestStatus`), and it waits
  for their tap.
- **No assumption about role or champions.**
  - An objective is for any role or for one role, and for any champion or up to five chosen ones.
  - Role choices start with the player's Primary Role. Templates follow the chosen area and role,
    and never offer another role's plan.
  - Nothing is created automatically from the most-played champions.

## The flow

1. **Before ranked (Overview → Before you queue).**
   - The player sees the objective, why it matters, and the If–Then plan.
   - **Start session** asks only what it must:
     - which objective, when the library holds several;
     - which account, when the player has several (or any of them);
     - how the session ends: no limit (the default), a game limit (a reminder, never enforced),
       or "Stop after 2 losses".
   - While a session runs, the card shows it in progress with **Continue session**.
2. **During.** Nothing is required: finished Solo/Duo games join the session by themselves as the
   account syncs (see *Automation*). The session card shows the plan between games.
3. **After a game.**
   - A game waiting for a review appears under the Overview's "Review your last game" and on the
     session's game list.
   - The review window opens right after a game is added by hand.
   - Reviews can be edited later; a skipped game can still be reviewed.
4. **Ending a session.**
   - **End session** takes an optional private closing note.
   - A game that Riot hands over late still joins the session it was played in.
   - The two-loss rule ends a session on its own, at the end of the second loss.
   - A session with no game for 12 hours ends on its own, dated at its last activity.
5. **Session summary.** It shows:
   - the results (games, W/L, LP when known) and the champions played;
   - from the reviews (self-reported): plan follow-through per level, what went well, what was
     hard more than once, and the learning points;
   - suggested focus, only where the reviews support it;
   - the choice for the next session: **Keep this objective**, **Adjust the plan**, or **Practise
     something else** (from the library, or a new objective).

## Sessions and games

Sessions are the rows of `ranked_blocks`, labelled "Session N". Their games are the rows of
`ranked_games`, one per player and Riot match (`ranked_games_player_match_idx`). The rules live in
`src/domain/development/sessions.ts` (pure functions) and `src/server/development/association.ts`
(applying them to stored rows):

- **Which games join.**
  - A Solo/Duo game (queue 420) joins a session when it ended after the session started collecting
    and began before the session ended (or before now, while the session runs).
  - It must be on the session's account when the session follows one.
  - The game being played when the session started is included. A game that ended before the
    session started is not.
- **Ambiguity.** A game that fits two sessions goes to the earlier one, is marked
  `needs_confirmation`, and names the other session (`alternative_block_id`). The player chooses
  **Keep** or **Move**. Nothing is moved silently, and only that game asks.
- **Idle end.** No game for `SESSION_IDLE_HOURS` (12) ends a session at its last activity, so a
  session left open yesterday does not take today's games. This is checked on every read and after
  every sync.
- **Two-loss rule.** The session ends with its second loss (in total, not in a row), at the end of
  that game. Later games stay out of it.
- **Late games.** An ended session still collects games played in it for `LATE_GAME_DAYS` (3),
  because Riot's sync can lag.
- **No duplicates.**
  - A game is never added twice: one row per player and match, plus an anti-join on insert.
  - A game typed in by hand is linked to the synced match when they agree (same session, champion
    and result, starting between one hour before and four hours after) instead of counting twice.
  - Importing a match that is already in a session is refused with a clear message.
  - A review is one set of columns on its game, so saving it again overwrites it rather than adding
    a row.
- **Removed games stay out.** A synced game the player removes from a session is remembered on that
  session (`dismissed_match_ids`) and never added again by the automatic association. The player
  can still add it back from their synced games.
- **History is preserved.**
  - Sessions finished before Ranked Development (`collects_from` is null) never collect games.
  - Deleting a session or a game removes only the journal rows. `account_matches`, Match History
    and every statistic are untouched (tested).
- **Abandoned and multi-device use.** A session lives on the server, so another device resumes it.
  A session forgotten in a tab ends by itself after 12 hours. A client that disconnects loses
  nothing: every change is a server action, and games come from the sync.

## Objectives (the weakness library)

`development_objectives`: title (3–120 characters), why it matters (optional, up to 300), area,
role or any, champions (up to 5) or any, an optional statistic, the current plan, the date
identified, the progress step and when it last changed.

- **Areas.** Sixteen areas in four groups, plus "Other" and a custom area the player names:
  - Early game: laning fundamentals, wave management, trading, jungle awareness, recall timing;
  - Map and macro: vision, map awareness, objective preparation, mid-game rotations, side-lane
    management;
  - Fights: teamfighting, positioning;
  - Habits: resource management, decision-making discipline, mechanics, mental and focus.
- **Progress steps.** Identified → Practising → Improving → Maintaining, moved only by the player.
  - Maintaining is the completed list and can be reopened at any time.
  - A maintained skill not practised for 30 days, or whose statistic has moved back, shows a
    **revisit** reminder.
- **Library page.** For each objective: its last session and review counts, the plan, the evidence
  and its recent reviews.
- **Patterns.** Areas named as hardest in three or more reviews in the last 30 days are shown,
  labelled self-reported, with **Add to library** (the new objective starts with that area).

## If–Then plans

`development_plans`: the situation and the action (5–200 characters each), the template used (if
any), and a retired date.

- A plan that no finished session has used is edited in place.
- Once a finished session used a plan, editing it creates a new version. The session keeps the
  version it was played with.
- Editing the plan of a session in progress makes that session follow the new version.
- Plans can be reused for another objective (a copy) and retired. The plan history lists every
  plan with the sessions it was played in.

## Evidence (deterministic, no paid AI)

`src/domain/development/evidence.ts` and `measures.ts`, read by `src/server/development/evidence.ts`.

- **Statistics offered.** Each area offers only statistics that follow its habit: deaths, deaths
  before 14 minutes, CS per minute, CS at 10, vision per minute, Control Wards and kill
  participation. Areas no statistic follows (recall timing, objective preparation, resource
  management, mechanics, mental and focus) offer none.
- **Comparison.** The statistic before practice and since, in the objective's role (otherwise the
  player's main Solo/Duo role) and on its champions when it names some.
  - Games under 15 minutes are left out.
  - Each period needs at least 5 games with the figure, and uses at most its newest 20.
  - A change counts only when it exceeds the statistic's smallest meaningful difference **and**
    0.3 of the games' usual spread. Anything less reads "about the same".
  - A comparison across mostly different champions is flagged as rougher.
- **Wording.** Results read as observations ("lower than before"), with what the statistic cannot
  show. They are never verdicts on skill and never "proof".
- **Plan follow-through.** "Plan followed in X of your last N reviewed games (Mostly or Every
  time)", from the reviews and labelled self-reported. It is compared with the N reviews before.
- **Suggestions.** The suggestion to move an objective a step comes from the player's own record
  (`suggestStatus`) and never uses wins:
  - Identified → Practising: after one session played for it;
  - Practising → Improving: at least 6 rated reviews, at least 75 % of them followed, and no
    statistic moving the wrong way;
  - Improving → Maintaining: at least 8 rated reviews, at least 85 % followed, and its statistic
    moving the better way (or, without a statistic, the reviews alone).

## Automation and freshness

- **No new Riot calls.** Association reads only stored rows (`account_matches`, written by the
  existing account sync), never Riot. It runs:
  - after every sync that stored games for a player (`src/server/accounts/sync.ts`);
  - when the player opens a Ranked Development page.
- **Freshness.** A private `development` freshness scope (`/api/freshness`, only for the player
  themselves) follows the player's sessions, games, objectives and plans, so a change made on
  another device shows without a reload.
  - While a session runs, the page asks every 2 minutes. When the player's accounts were last
    synced more than 5 minutes ago, opening the page also starts the existing account refresh after
    the page is sent (the same lease, deadline and Riot rate limits as any profile visit).
  - Otherwise the profile's slower idle pace applies (1, 2, 4, 8 minutes, then every 10).
  - A hidden tab asks nothing, so there is no unbounded polling.

## Data model and migration 0059 (additive, data-preserving)

- **New tables.** `development_objectives` and `development_plans`, each with an owner and
  cascade on profile deletion. Both have RLS on, no grants for Supabase's Data API roles, and
  `SELECT` for the backup role, granted in the same migration (`docs/DATABASE_PERMISSIONS.md`).
- **New columns on `ranked_blocks`:**
  - `objective_id`, `plan_id` and `account_id` (each set null on delete);
  - `last_activity_at` and `collects_from`;
  - `start_rank`, a snapshot for LP;
  - `closing_note` and `dismissed_match_ids`.
- **New columns on `ranked_games`:**
  - `source` (manual / import / auto) and `objective_id`;
  - the review: `review_status` (none / pending / done / skipped), `execution` (0–3), `went_well`,
    `went_wrong`, `learning`, `adjustment` and `reviewed_at`;
  - `needs_confirmation` and `alternative_block_id`.
- **Backfill.** Old games keep their main mistake and notes:
  - a game with either counts as reviewed, and its mistake is mapped onto the new areas;
  - a player's old ranked focus sentence becomes their current objective (Practising) with its
    champions, and `ranked_profiles` is left untouched;
  - a block in progress follows that objective and collects only from the migration onwards;
  - finished blocks collect nothing.
- **Rollback.** Drop the two tables and the added columns. No earlier value was changed.

## Privacy and security

- **Ownership.**
  - The owner always comes from the signed-in session, never from the address or the request.
  - Every server action establishes who is asking before anything else (`guards.test.ts`).
  - Every query filters by the owner. Another player's session reads as "not found" (tested in
    `tests/db/ranked-development.test.ts` and `e2e/ranked-development.spec.ts`).
- **Where the data appears.**
  - Profiles opened by others never show the section (`PROFILE_SECTIONS` `own: true`).
  - The freshness scope is the player's alone, administrators included (`canWatchFreshness`).
- **Personal-data erasure** (`src/server/privacy/erasure.ts`):
  - It deletes the player's objectives, plans, sessions and reviews.
  - It removes their name from other players' private notes that mention them (review learning
    points and adjustments, session focus and closing notes, objective titles and explanations,
    plan text), keeping the rest of each note (`tests/db/privacy-erasure.test.ts`).
- **Deletion.** Deleting a session or a game never deletes Riot match history.
- **Cost.** No new paid service, workflow, schedule or Riot API use case.

## Performance

- **Bounded queries.**
  - Association reads games since the earliest collecting session, at most `LATE_GAME_DAYS` back.
  - History is paginated (10 per page).
  - Evidence reads at most the newest 20 games per period.
  - Library review histories are read for the first 12 objectives.
- **Indexes.** The new queries use `account_matches_recent_idx`, `ranked_games_player_match_idx`,
  `ranked_games_objective_idx`, `ranked_blocks_player_status_idx`,
  `development_objectives_player_idx` and `development_plans_player_idx`.
- **Pace.** The freshness pace is a single small query per check.

## Tests

| Where | What |
|---|---|
| `src/domain/development/*.test.ts` | Association windows, ambiguity, idle and two-loss ends; summaries and suggestions; reviews and follow-through; areas, objectives, plans, templates, outcome wording; statistics, comparisons, "not enough games"; session wording |
| `tests/db/ranked-development.test.ts` | On Postgres in CI: sessions (start, resume, end, notes), synced-game association (window, account, queue, idempotency, ambiguity and moving, idle, two-loss, late games, removed games, legacy sessions), no duplicates (typed then synced, re-import, review overwrite), objectives and plans (CRUD, steps, reopening, versions, reuse, retire), reviews and skips, progress and evidence with missing data, privacy, freshness version, history preserved |
| `tests/db/ranked-development-migration.test.ts` | Migration 0059 on Solo Queue Blocks data: every block, game, note and mistake kept, the focus carried over, grants |
| `tests/db/privacy-erasure.test.ts` | Erasure of the new tables and names in other players' new text fields |
| `e2e/ranked-development.spec.ts` | On member accounts: objective and plan, outcome note, start, resume on a second device, a game by hand with its review, a skipped review, end with a note, summary and keep, library steps, phones and tablets held both ways, reduced motion, axe (WCAG 2.1 A/AA), another member refused |

## Limitations

- **Synced games need Riot access.** With no Riot key (the in-memory demo, local development),
  games come only from manual entry.
- **LP is often unknown.** Rank snapshots are taken by the account sync, so a session's LP is known
  only when snapshots bracket its games exactly. The app then says why it is unknown instead of
  estimating.
- **Some statistics need timelines.** CS at 10 and early deaths come from match timelines, which
  are stored only for some games. Games without them are counted as missing, not as zero.
- **The evidence is observational.** It compares periods without controlling for opponents,
  teammates, patches or matchmaking. It is worded accordingly, and it is no substitute for the
  player's own judgement or a coach.
- **Reviews are self-reported.** The app treats them as the player's view and never as verified
  gameplay improvement.
