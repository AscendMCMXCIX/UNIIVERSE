# Match notes (removed)

Until 23 Nov 2026 a game's post-game view (`src/components/match-history/post-game.tsx`) answered
three questions in a few short sentences: **Went well**, **Went wrong** and **Focus next**, each from
a written rule in `src/domain/match-notes.ts`. At the owner's request the notes were removed from the
interface entirely, together with the view's two folds (**Gold over the game** and **Build and skill
order**). Their code and tests went with them:

- `src/domain/match-notes.ts` and its tests (the rules, thresholds, wording and selection);
- the view's notes, their input (`notesInputOf`) and the lane's link to Matchup Intel under Focus
  next (`laneIntelLink`, its test `lane-intel-link.test.ts`);
- the notes' baseline on the server (`MatchDetailView.personal`, with `NOTE_FIGURES`), which loaded
  the player's stored games every time a game opened;
- the gold chart (`match-timeline-panel.tsx`, `goldStory`, the chart's helpers in
  `src/domain/match-events.ts`) and the build and skill order (`build-panel.tsx`).

What the view keeps: the result, the loadout (champion and level, spells, runes and the rune page,
items), the six figure tiles (K/D/A and KDA, CS and CS per minute, gold, damage and its share,
vision and wards, kill participation), the lane against the lane opponent at 10:00, 15:00 and the
end, and the scoreboard with every player, their ranks and the possible groups
(docs/DESIGN_SYSTEM.md §1, "The post-game view").

The Production check asserts the removed sections stay gone (`scripts/post-game-facts.mjs`,
`REMOVED_WORDS`; docs/LIVE_VALIDATION.md). The rules as they last stood are in the repository's
history, in this file before 23 Nov 2026, should the owner ask for any of them again.
