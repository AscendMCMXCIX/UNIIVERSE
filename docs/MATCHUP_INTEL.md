# Matchup Intel

**Matchup Intel is Champion Intel's Compare with a lane** (Release 19, the owner's request of 26 Nov
2026, item 4: "genuinely useful, early-game-focused information for every relevant matchup across all
five roles … distinguish human-reviewed content, automated extraction and statistical evidence …
a sustainable, patch-aware curation and validation pipeline … preserve the compact second-monitor
experience"). It has no page or sidebar entry of its own: two champions side by side in Champion
Intel (`/lookup`, docs/CHAMPION_INTEL.md) and a **Lane** chosen beside Swap put an early-lane band
above the board. The first column is the champion played ("Playing"), the second its lane opponent
("Against"). Nothing says "you": the page is opened for teammates' pairs too.

- **Address:** `/lookup?champion=Riven&champion2=Darius&lane=TOP` (`lane=TOP|JUNGLE|MID|BOTTOM|SUPPORT`,
  written only with two champions; any spelling of a position is read: `mid`, `bot`, `adc`). The page's
  queue is `queue=solo|flex|draft|clash` (Ranked Solo/Duo left out), the same parameter as the builds
  by queue. A lane is page state like a champion: chosen with `router.replace` (no history entry),
  Swap and ✕ waiting while it is on its way, the band's skeleton at once. **Swap** keeps the lane and
  shows the other side of the same games; **✕** drops the lane; changing either champion keeps it.
- **Old links:** `/resources/matchups?role=top&champion=Riven&vs=Mordekaiser` answers 308 to
  `/lookup?champion=Riven&champion2=Mordekaiser&lane=TOP` (`src/proxy.ts`, `legacyMatchupRedirect`).
  One champion alone is carried alone, without a lane; with neither, `vs2`, else `ally` alone; the old
  two-against-two is gone.
- **All Champions' preview:** an opened opponent links to "Riven vs Darius in Matchup Intel"
  (`intelHref(me, them, { lane: position })`).
- **Builds:** with a lane, each column's builds open on that role where the champion has builds in it
  (20 games: the builds' own rule); a role chosen in the builds still wins.

## The band: three blocks, each named by the kind of evidence it is

One surface (no card inside it), three blocks side by side from a 60rem band, stacked below (notes,
team's matches, Riot's data). Each block's heading says what it is, in words; colour never carries a
label. Figures in the main text colour, labels in the secondary, the sample line in the quietest grey;
no colour for good or bad. The section is named "Matchup Intel, Top: Riven against Darius".

| Block | Kind | Who sees it | Source | Patch-aware how |
|---|---|---|---|---|
| **Reviewed notes** | human-reviewed | every signed-in account | notes a team administrator writes and reviews in Admin → Platform Settings → Matchup notes | fresh on the patch reviewed and the next; "not re-checked" two and three patches on; hidden from the fourth, and at once when Riot's data for either champion changed since the review |
| **In the team's matches** | statistical evidence | accounts holding `view-teammate-stats` (as the builds) | the team's stored records and timelines, every lane of them, counted on read | the season, or only the games since Riot's latest recorded change to either champion where 10 of them exist, said either way |
| **From Riot's data** · Level 1 | automated extraction | every signed-in account | Data Dragon as version-check stored it | rebuilt at every read from the stored version; what changed since the previous stored version is named |

### From Riot's data (`src/domain/matchup/early-kit.ts`)

- Level-1 differences of the same quantity only, in this order: attack range, move speed, health,
  armor, magic resist. Each line is "{n} more for {name}" or "the same": never faster, slower, better,
  worse, stronger, favoured or a verdict. The numbers are the columns' own (built from the same
  `LookupChampion`), never a value at a later level (Riot's growth formula is not in Data Dragon), never
  two different quantities compared. Attack damage is left out (its growth is a 0 placeholder in
  Riot's data; its level-1 figure is in each column).
- Rank-1 cooldowns and costs stay in the board's rows (each row's rank-1 cell is tinted with a lane
  chosen); the mechanics stay as each row's chips. The band repeats none of them.
- **Ranges (D3):** only through Champion Intel's reviewed range rule (`src/domain/champion-lookup/range.ts`),
  and only where it marks a cast range as reviewed: a line joins through `earlyKitLines(a, b, { ranges })`
  (`RangeLineSource`). None is drawn until then; nothing is estimated.
- Where an ability's or the statistics' "Changed since" mark is set, one line names what changed
  ("Riot's data for Darius changed since 26.22: E text and cooldowns, base stats"), never by how much.
- Riot's tips (`allytips`, `enemytips`) are not shown (OD-M6): they are often instructions and may
  predate changes.

### In the team's matches (`src/domain/matchup/lane-evidence.ts`, `src/server/matchup/lane-query.ts`)

- **Games:** stored records of draft games (Ranked Solo/Duo 420, Ranked Flex 440, Normal Draft 400,
  Clash 700) that a current team member played (a linked account of a team member's profile that is
  not archived: personal-use and archived profiles' games never count), of the current season, that
  lasted 10:00 or more. In them, **every lane, both teams**: the two champions each other's lane
  opponent by the one lane opponent rule (`laneOpponentOf`: Riot's team position, else its individual
  position compared with everyone's; old records by their merged position, then not with an erased
  seat in the game). An erased player is never a seat.
- **One statement per pair, role and season**, every queue at once (each row carries its queue), found
  by the champions' GIN index (`jsonb_path_query_array(participants, '$[*].championId') ?& ARRAY[lo, hi]`,
  the database test checks the plan). Per game only anonymous numbers leave the database (patch, queue,
  result, whether a member held a seat, the first 12 frame times and the two seats' gold, experience and
  CS, their kill and death times before 10:00, every death time before 10:00, two first-blood flags):
  never a match id, PUUID or name (the database test checks the answer's keys). About 0.6–0.8 KB a game.
  JIT off. Its egress label is `with match_details <hash>`, the sample opening `WITH lane_rec AS MATERIALIZED`.
- **Cache:** `unstable_cache` for 6 hours, keyed by the unordered pair, the role, the season and
  `LANE_FORMAT` (so Swap and a queue change read nothing), tag `lane-matchups`, dropped by an erasure.
  The in-memory demo is read each time.
- **10:00** is read between the two frames around it (`valueAt`), never by frame number; a game whose
  timeline does not reach 10:00, or has none, is counted only as "without a timeline".
- **`MIN_LANE_GAMES` = 10** games with a timeline (OD-M4). Below it no share, median or count shows:
  "4 games in the team's matches (Ranked Solo/Duo, Season 2026). Figures show from 10." From it:

  | Line | Rule |
  |---|---|
  | Sample | "14 games · Season 2026 · since 26.22"; its ⓘ: the window, the games before Riot's change, the games on the current patch and those without a timeline |
  | Riven ahead in gold at 10:00 | "9 of 14 · 64% (39–84%)": above 0 only (an even game counts in the games), 95% Wilson range; where the range includes 50% the ⓘ says these games show no difference beyond chance |
  | Median at 10:00 | "gold +180 · CS +6 · XP +120", the first column's minus the second's in the middle game (rounded half away from zero, so Swap gives the same numbers with the sign flipped); the ⓘ gives the middle half of the gold; no CS for supports |
  | Kills on each other before 10:00 | from 10 games with kill times (timelines kept since 29 Oct 2026): a time in one's kills that is also in the other's deaths, counted only where no other death in the game shares that millisecond |
  | First blood | from 10 games with the records' flags: "Riven 3 · Darius 2 · others 9" |
  | Riven's side won | "8 of 14 · 57% (33–79%)", a counted result ("won"), never "wins" |

- **Window (OD-M3, include and say it):** Riot's latest recorded change to either champion is the
  newest patch at which its `static_digests` hash differs from the patch recorded before it. With 10
  games on or after it, only those count ("since 26.22"); otherwise the season, the ⓘ saying how many
  came before the change. Where digests do not reach back: "Riot's data before 26.22 was not compared."
- **Queues (D5, OD-M2 strict):** Ranked Solo/Duo by default; Flex, Normal Draft and Clash each on their
  own, chosen in the block's own select (and with it the page's queue); never pooled. Swiftplay,
  Quickplay and Blind Pick are not counted.
- **Mirror:** a champion is picked once in a draft game, so the same champion twice has no games.
- **High-elo (D2):** off. When the D2 lane enables its collection, Master+ lane aggregates join as a
  second sub-block, never mixed with the team's; the ⓘ says "high-elo games are not collected" until then.
- **No ranking anywhere for members:** one pair at a time, chosen by hand; no list of opponents by win
  rate, no "counters", no suggestion.

### Reviewed notes (`src/domain/matchup/notes.ts`, `src/server/matchup/notes-store.ts`)

- **Two scopes:** an *opponent note* (role + opponent) shows for every pair whose lane opponent it is;
  a *pair note* (role + champion + opponent) for that pairing in that direction. The band shows pair
  points first, then opponent points: two visible (one where the first likely fills the block's lines
  by itself), "N more · sources" opening the rest in place.
- **Height (27 Nov 2026):** with the blocks side by side the shown points take at most five lines
  (`BAND_POINT_LINES`, one line-clamp over the list: the demo's typical two points whole, 3 + 2 lines at
  1440 × 900), four beside the heading's "not re-checked" line (which wraps to a second line) and three
  beside a hidden note's line, so the notes block is never taller than with the demo's notes and both
  champions' five abilities stay on the first screen at 1440 × 900 whatever the notes hold (the longest:
  four points of 35 words with four abilities each). A longer point ends in "…"; opening the fold lifts
  the clamp, and where the shown points are likely cut and nothing more is folded the summary reads
  "Full text · sources". Stacked (phones, tablets, large text) nothing is clamped. Before, two valid
  35-word points pushed the R rows to about 940px.
- **Content rules (validated on every save on the server, and live in the editor):** 1 to 4 points, each
  at most 35 words, plain text, sentence case, each naming the abilities it rests on (refs `Darius.E`
  that exist in the stored kits of the scope's champions), an optional level tag (Levels 1–3, Level 6).
  Refused, in the points and in the sources' titles alike (a title is shown in the band too): the
  refused words, the estimate words, a Riot ID's tag, and any account's username or display name,
  player's name or linked Riot name (a champion's name is never one of them). At least one source, each
  with a kind (in-game client tooltip, Riot patch notes, Riot's Data Dragon, League of Legends Wiki read
  in a browser, the team's games, other), a title, a patch and, where given, an https address that names
  no player either: not a player's profile on a statistics site (a `/summoner(s)/`, `/profile(s)/` or
  `/player(s)/` path), no Riot ID's tag (`#EUW`, or `%23EUW` written in the address) and no account's or
  player's name in its path, query or fragment. A wiki source carries the credit (League of Legends Wiki
  contributors, CC BY-SA 3.0), its title and the licence each a link underlined at rest. **No script
  reads the wiki** (Weird Gloop's terms): the editor says so.
- **The refused words are one list** (`src/domain/matchup/refused-words-list.mjs`, plain JavaScript):
  absolutes (always, never, guaranteed…), instructions (should, must, avoid, need to, you, your…), and
  verdicts (easy, win, wins, best, optimal, counter, punish…, outplay…, recommend…, all-in, favoured,
  advantage, stronger, weaker, better, worse, faster, slower…; "…" every longer form). A word is
  letters, digits and "_", so "should've" and "easy-to-land" are refused as "should" and "easy". The
  notes' save and editor (`refused-words.ts`), the band's own sentences (`words.test.ts`), the browser
  tests and the Production check's "no instruction or verdict words in the band" (`scripts/matchup-facts.mjs`,
  each text of the band apart) all read this list, so a note the editor accepts can never fail the
  check (`src/server/ops/live-check-matchup.test.ts`). Until 27 Nov 2026 the notes had their own,
  shorter list (no better, worse, faster, slower; outplay but not outplayed) and titles skipped it,
  while the check refused those words. "won" (a counted result, "Riven's side won") is not on it.
- **Freshness (OD-M4), computed at every read:** each published note keeps the patch and Data Dragon
  version it was reviewed on and each scope champion's **kit hash** (`src/server/matchup/kit-hash.ts`:
  base statistics and each ability's cooldowns, ranks, charges, text hash, cost, resource line and Data
  Dragon range per rank, from the stored abilities: a range Riot changes without a word of its text hides
  the note too, as the band's "E range" says; range joined on 27 Nov 2026). Any kit hash that differs hides the note ("A reviewed note is hidden: Riot's data
  for Darius changed after its review on 26.23."). Otherwise the distance in the stored patches list
  (a year's boundary, 26.24 → 27.1, is one patch): 0–1 fresh ("Patch 26.23"), 2–3 shown and labelled
  ("Reviewed on 26.21 · not re-checked for 26.23"), 4 or more hidden. Drafts and retired notes never show.
  A current patch newer than the stored list counts as the list's newest: an instance keeps the list
  ten minutes and the current patch one, so right after a sync another instance could read the new
  current patch with the old list, and until 27 Nov 2026 every note there read as "its review patch is
  no longer listed" for up to ten minutes.
- Members see the reviewer as "an administrator" (the ⓘ); Admin shows the reviewer's display name.
- **What is not here:** Riot's tips, the old AI-drafted briefings and checked notes (OD-M7: not restored;
  the owner may rewrite any of them in the editor), and the bot lane's two against two (OD-M8).

## Curation (Admin → Platform Settings → Matchup notes)

`/admin/matchup-notes`, `requirePageAccess("manage-branding")`; every action checks `manage-branding`
first (`src/server/actions/matchup-notes.ts`; OD-M5: administrators only).

- **Header:** "N published · N need re-review · N drafts · current patch 26.23", and New note.
- **Queue** (`src/server/matchup/queue.ts`, `src/domain/matchup/curation.ts`): the members' lane
  opponents (by role) and pairings this season in draft games, from `account_matches` (the lane opponent
  the rule stored), each game once however many members' accounts hold it, remakes and personal-use or
  archived profiles out, the top 200 pairings and 30 opponents a role, cached an hour (tag
  `matchup-queue`). Sections: **Needs re-review** (published notes not fresh, the most met first), **Not
  written yet** (opponents first, then pairings, the most met first, the first ten of each shown and the
  rest behind one fold), **Drafts**, **Published and fresh** (folded). Each row: role, champions, games
  this season, with a timeline, last met, its state in words, and Write, Re-review or Edit. Champion names
  and counts only, never whose games: with a handful of members a role's pairing can point at one person,
  so these figures stay on this page (never in a log, a job's output, `/api/health`, the Production check
  or these docs).
- **All notes:** every note with its state, its reviewer and Edit, Re-review, Unpublish, Delete (a draft
  never published) and Retire.
- **Editor** (a task dialog): the scope, the lane, the champion(s), points with the abilities they rest on
  (each champion's P–R as toggles), the level tag, sources, a live preview; Save draft or Publish (which
  records the review: the account, the time, the current patch and version, the kit and ability hashes).
  Changing the scope, the champion played or the opponent keeps only the refs of champions still in the
  note (`rescope`): a ref to a champion that left had no toggle, and its error could not be cleared.
- **Re-review:** what changed in Riot's data for each champion since the review (its abilities' hashes
  then and now), Riot's patch notes for every patch since (links for a person to read: nothing reads them
  automatically), then Confirm for the current patch, Edit, Unpublish or Retire.
- **History:** Audit Logs (`matchup-note.create`, `update`, `publish`, `confirm`, `unpublish`, `retire`,
  `delete-draft`), the target named by champion names only, in a sentence ("Riven against Darius in
  Top"), the patch in the details. No history table.
- **Dashboard:** "N matchup notes need re-review after patch 26.24" in Needs you (counts only).
- **Health:** `/api/health` `matchupNotes: { published, fresh, stale, hidden }`, numbers only, cached ten
  minutes per instance.

## Data (migration 0071, `matchup_notes`)

One table, additive (`src/server/db/schema/matchup-notes.ts`): `scope`, `role`, `opponent_id`,
`champion_id` (null for an opponent note), `status` (draft, published, retired), `points` and `sources`
(jsonb), `reviewed_by`, `reviewed_at`, `reviewed_patch`, `reviewed_version`, `kit_hashes`,
`ability_hashes`, `created_by`/`created_at`, `updated_by`/`updated_at`. Checks on the scope, role, status
and a published note's review; one live note (draft or published) per scope (`matchup_notes_live_idx`;
retiring frees it); the band's read index on published notes. RLS on, nothing for Supabase's Data API
roles, `SELECT` for the backup role (docs/DATABASE_PERMISSIONS.md). The three account links are set to
NULL by an erasure (and by the account's deletion); the notes' text never names a player, so nothing in
it is scrubbed. No table for the lane figures (counted on read) or Riot's data (derived on read).

## Budgets

| Item | Effect |
|---|---|
| version-check, scheduled jobs | none new |
| Page reads | the lane statement: a pair with 50 games about 35 KB uncached (most under 20 games, about 14 KB), cached 6 h; the notes: one indexed read, cached 10 min. About 2 MB a day realistic, 7 MB worst, against 120 MB |
| Database CPU | a GIN lookup and JSON over at most a few hundred records (20–150 ms estimated cold); the perf probe's `matchup.lane-evidence` step measures it (Ahri vs Zed, Mid) |
| Vercel CPU | a few ms a view; the band is a server component, the lane control and the team block client islands |
| Admin queue | about 15 KB a view, cached an hour |
| Production check | one page load and one request a run (about one CPU-second, about 40 KB) |
| data-audit (by hand) | `matchupCoverage`: counts of pairings by queue, the members' own lanes and every lane of their games, and the notes by state; never a champion's name |

## Coverage (what to expect; the design map's model until data-audit reads production)

- **From Riot's data:** every ordered pair of different champions in every role (173 × 172 × 5 =
  148,780), every line for every pair (all five statistics exist for all 173 champions at 16.22.1).
- **In the team's matches:** at team scale, a few hundred pairings reach 10 games over a season (the
  model: about 470 over every lane, about 80 of the members' own lanes; Solo/Duo alone about 140), well
  under 1% of the pairs, where the team plays (20–40% of its lane games). A patch-only window gives almost
  nothing, which is why the window is the season with Riot's latest change said. Most pairs show the
  honest "figures show from 10" line: that is the truthful outcome.
- **Reviewed notes:** 0 until the owner writes them. Opponent notes reach furthest: the top 10 opponents
  a role (50 notes) cover about half of the members' lane games (the model); then about 3–6 re-reviews a
  patch.

Data-audit's `matchupCoverage` (run once after the release, in the Data jobs run with `auth-audit` and
`perf-probe`) gives production's real counts; `MIN_LANE_GAMES` and the window rule are confirmed or tuned
from them in a docs note.

## Compliance (docs/RIOT_COMPLIANCE.md)

Statistics of completed games and reviewed notes, worded as observations, one pair at a time chosen by
hand: no matchup ranking, counter or ban list, tier list, pick suggestion or advice. Neutral words only
(the refused words hold the band's fixed sentences and every note). Riot's registration description
gains the band (the D1 text; proposed sentence below): until the owner pastes it, the registered text
describes the old Matchup Intel.

> In Compare, for a lane chosen by hand, it also states the differences between the two champions' Data
> Dragon values in neutral words, totals of the lane at 10 minutes (gold, experience and CS differences,
> kills between the two, first blood and results) over the team's stored completed games of that pairing
> in that role, with the number of games and shown from 10 games, and short notes the team's
> administrators write and review, labelled as reviewed notes with the patch each was reviewed on,
> marked as not re-checked from the second patch after that review and hidden from the fourth, or at
> once when Riot's data for either champion changes. It shows one pair at a time, with no matchup
> ranking, counter list, pick suggestion or advice.

## Owner decisions (defaults the code follows)

- **OD-M1** inside Compare with a lane, no sidebar entry; the band titled "Matchup Intel", subtitled
  "Early lane" [as shipped].
- **OD-M2** strict D5 for the lane figures (no combined "all draft queues") [as shipped].
- **OD-M3** the season window across a recorded change, said [as shipped]; strict would show far fewer figures.
- **OD-M4** 10 games, 95% Wilson ranges; notes fresh 1 patch, not re-checked 2–3, hidden from 4 or on any
  change [as shipped].
- **OD-M5** administrators curate (`manage-branding`) [as shipped]; a delegated curator group is possible later.
- **OD-M6** no Riot tips; **OD-M7** the old AI-drafted briefings not imported; **OD-M8** no two against two.

## For the owner

1. **Write notes** in Admin → Matchup notes, starting from the queue's "Not written yet": the top 5–10
   opponents per role first (about 10–15 minutes each), then per patch the notes the dashboard flags, and
   Confirm on the "not re-checked" ones every second patch. Read the wiki only in a browser, and cite it.
2. **Riot Developer Portal:** paste the updated registration description (D1, with the sentence above)
   at the next update.
3. **Privacy notice:** the rows for the lane totals and the notes ship with `PRIVACY_UPDATED`
   (docs/PRIVACY.md).

## Tests

- Unit: `src/domain/matchup/{early-kit,lane-evidence,notes,curation,refused-words,words}.test.ts`,
  `src/server/matchup/{kit-hash,longest-notes}.test.ts`, `src/components/champion-lookup/address.test.ts`,
  `src/proxy.test.ts`, `src/server/ops/live-check-matchup.test.ts` (the check's words are the save's),
  `src/server/demo/test-hooks.test.ts`, `src/server/riot/registration-description.test.ts`.
- Database: `tests/db/lane-matchups.test.ts` (both teams, the lane rule, members only, queues apart,
  10:00, anonymous keys, the index, permissions, the window, erasure: games shared with a second member
  stay for her lane, the erased seat never counts; coverage counts),
  `tests/db/matchup-notes.test.ts` (actions refused to non-admins, publish records the review, one live
  note per scope, refused words, audit, freshness, checks, erasure), `tests/db/matchup-queue.test.ts`.
- Browser: `e2e/champion-matchup.spec.ts` (lane control and address, labels, figures, few and none, the
  queue, the notes' states through the demo's cookies `uniiverse-test-note-age` and
  `uniiverse-test-kit-changed`, Swap and ✕, one screen at 1366, 1440 and 1920 with the sidebar open and
  folded, and with the longest notes a note may hold (`uniiverse-test-longest-notes`,
  `src/server/matchup/longest-notes.ts`), fresh and not re-checked, with text a little wider too
  (`e2e/wide-text.ts`), 12px to spare; phones and tablets at 100% and 200%, the longest points whole
  there; every text of the band against the refused words; axe), `e2e/admin-matchup-notes.spec.ts`
  (also a title's refused word, a profile address, a change of scope, and a wiki source's links).
- Demo data: `src/server/demo/matchup-fixture.ts` (Ahri vs Zed in Mid, 14 Solo/Duo games; Riven vs
  Darius in Top, 4; two published opponent notes, Zed in Mid and Darius in Top).

## History

Matchup Intel was first a page of its own at `/resources/matchups` (16–23 Nov 2026: curated briefings,
checked notes, facts from Riot's text reviewed automatically, evidence from the members' own games),
retired on 23 Nov 2026 for Champion Lookup at the owner's request then (commit a4a794be; its full
documentation: `git show d086a174:docs/MATCHUP_INTEL.md`). Of it, only the refused-words lists and the
curation queue's member rule came back; its `account_match_prep` table stays as stored and unread.
