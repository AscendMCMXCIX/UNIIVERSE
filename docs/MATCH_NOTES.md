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

**Release 16 (23 Nov 2026):** at the owner's request the build and the skill order came back, not as
the fold, but as two of three segmented headings above the lane (**Build Path | Skill Order |
Runes**, `src/components/match-history/participant-panels.tsx`), for whichever player is inspected,
with sales and completed items marked where the timeline and Data Dragon support them. The notes and
the gold curve stay removed.

**24 Nov 2026 (the owner's brief, Release 17):** the post-game view was redrawn as one integrated
screen with nothing in it scrolling (docs/DESIGN_SYSTEM.md §1, "The post-game view"), and the
remaining automated commentary left the default view: the written why under the player's name
("Stood out: …", "Held back by …") and the trend word with its sentence ("Steady: Held much the same
level throughout."). The why's rules stay in `src/domain/performance-score.ts` (`reasonText`,
tested), unused by the interface, should the owner ask for it again; the trend words (`trendOf`) went
with the score through the game at the owner's request of 25 Nov 2026 (docs/PERFORMANCE_SCORE.md,
"The score through the game (removed)"). The comparison of two players
(the select, the table and the chart's second line), the team averages and the ten score tiles, the
build path's legend and the grey notes under the scoreboard went with them; the figures that served
supports and tanks moved from a sentence into a grid of three groups. After the release's UX review,
Build Path | Skill Order | Runes is sized per game (the taller of the skill grid and the rune page),
and a game without a timeline opens on Runes with the other two disabled and the reason beside them.

The Production check asserts the removed sections stay gone (`scripts/post-game-facts.mjs`,
`REMOVED_WORDS`; docs/LIVE_VALIDATION.md). The rules as they last stood are in the repository's
history, in this file before 23 Nov 2026, should the owner ask for any of them again.
