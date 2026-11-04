# Ranked Development (retired)

Ranked Development was removed from UNIIVERSE on 29 October 2026, together with what it grew from:
Solo Queue Blocks and, before them, the Ranked Improvement journal. It was a private Solo/Duo
practice space in My Profile (objectives, If–Then plans, sessions, game reviews). Ranked statistics
are a separate feature and are unchanged: Solo/Duo and Flex statistics, rank and LP progression,
Match History with enemy ranks, champion statistics and mastery, and Riot account sync.

## What was removed

- **The section and its pages:** My Profile → Ranked Development with its Overview, Sessions and
  Development areas. My Profile now has four sections: Overview, All Champions, Match History and
  Riot Accounts, on your own profile and on every teammate's.
- **Everything in it:** objectives (the weakness library), If–Then plans, game reviews, session
  tracking and summaries, the evidence panel, and the older Solo Queue Blocks and journal screens.
- **Match History's "Add to a Ranked Development session" button** and the lookups that marked
  which games were in a session.
- **Background processing:** the association of newly synced Solo/Duo games with sessions after
  every account sync; the private `development` freshness scope with its two-minute polling while
  a session ran, and the five-minute account refresh it asked for; the death times kept from
  match timelines for its laning statistic.
- **Code:** its server actions, repositories, page loaders, domain rules, journal metric
  definitions, components (and the champion slot and picker only it used), unit, database and
  browser tests.
- **Addresses:** `/overview/development`, `/overview/blocks`, `/blocks` and `/ranked`, with
  everything below them, redirect to `/overview` (temporary redirects in `next.config.ts`, so the
  addresses stay free). The post-deploy smoke check (Data jobs → `smoke`) fails if one of them does
  not.

## What is kept, and why

Its records stay in the database until a separate, approved clean-up (below). Nothing is deleted
by this change.

| Table | Held | Read or written by |
|---|---|---|
| `ranked_profiles` | Each player's old ranked focus: champions, counter pick, focus sentence, and the retired Patterns & Notes text | Permanent erasure only |
| `ranked_blocks` | Sessions (formerly blocks): number, dates, game limit, objective, plan and account, closing note | Permanent erasure only |
| `ranked_games` | Session games: match id, champion, enemy champion, result, role, mistakes, notes, reviews, "played with" | Permanent erasure only |
| `development_objectives` | Objectives (the weakness library) | Permanent erasure only |
| `development_plans` | If–Then plans | Permanent erasure only |

- **Migrations stay as they are** (`0005`, `0023`, `0027`, `0038`, `0039`, `0059`). The tables stay
  defined in `src/server/db/schema/ranked-improvement.ts` and `development.ts` (marked retired), so
  `drizzle-kit generate` never emits a `DROP`.
- **Security is unchanged:** Row Level Security on, no Data API grants, the backup role's
  `SELECT` (`docs/DATABASE_PERMISSIONS.md`).
- **Privacy:** deleting a player profile deletes that player's rows (foreign keys cascade), and
  permanent removal of a person's information deletes theirs and takes their name out of other
  players' retained notes (`src/server/privacy/erasure.ts`, `tests/db/privacy-erasure.test.ts`).
  The privacy notice says the records are kept, unused, until a planned clean-up.
- **Measured before any drop:** Data jobs → `db-usage` lists the five tables among `retired`, with
  their rows, reads, writes and anything outside them that depends on them.

## Data-retirement plan (not started)

Deleting these rows cannot be undone. It is a separate change, made only when all of this holds:

1. **A verified backup.** The owner has checked a recent encrypted backup restores
   (`docs/BACKUPS.md`) and holds an offline copy.
2. **Nothing uses them.** Two `db-usage` runs at least a day apart show no writes to the five
   tables (reads only from erasure), and no dependent other than their own keys to `players`,
   `riot_accounts` and each other.
3. **The owner's go-ahead,** including whether players should be offered an export of their own
   records first.
4. **One held migration** (a draft PR, as for the other retired tables) that drops the five tables,
   removes their schema files, the erasure code and tests that read them and their `db-usage`
   entries, and updates the privacy notice.
5. **After deploy:** `auth-audit` lists the migration, `db-usage` reports the tables as gone, and
   the privacy notice no longer lists them.

## History

- **Ranked Improvement journal:** the first version, a private Solo/Duo journal of blocks and games.
- **Solo Queue Blocks:** its later name and redesign, with optional block targets, focus champions,
  quick add and Riot import.
- **Ranked Development** (migration `0059`, PR #151, 28 Oct 2026): blocks became sessions, with
  objectives, If–Then plans and reviews.
- **Removed** on 29 Oct 2026.
