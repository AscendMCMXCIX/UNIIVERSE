# Design system

The one visual standard for UNIIVERSE. Sessions that change how a page looks implement against
this page; a change to the standard itself goes through a PR that edits this page first.

- **This page:** the identity, the principles, the surfaces, colour budget, interaction states,
  motion and the app's frame (navigation), with the reasons for each decision.
- **[STANDARDS.md](STANDARDS.md):** the token tables, type scale, layout tiers, component table,
  accessibility and performance rules. Not repeated here.
- **[MOBILE.md](MOBILE.md):** phones (below 768px). The owner verified the phone redesign on 5 Nov;
  this page does not change it.
- **Code:** tokens and utilities in `src/app/globals.css`; the sidebar's shared rows in
  `src/lib/sidebar.ts`; components in `src/components/ui`. `src/app/design-tokens.test.ts` enforces
  the token rules.

## 1. Identity

UNIIVERSE is a premium esports product for one team. It should feel like the team's own war room:
dark, calm and precise, with light at the edges. It is not a generic analytics dashboard.

The personality comes from:

- **Depth:** layered, opaque surfaces with a hairline of light on their top edge.
- **Light:** the violet ambient glow, the team's art and the player's banner colours. Light sits at
  the edges, never behind the figures.
- **Precision:** one rhythm, one centre line and one radius family.
  The radii nest outward-in: a card (`rounded-card`, 16px; the sign-in and setup frames' card
  since 20 Nov 2026) holds panels and lists (`rounded-panel`, 12px), which hold controls
  (`rounded-md`, 6px; chips `rounded-lg`). A box is never rounder than the box around it (the
  design review's G3-14: Privacy's 12px contact panel sat in a 10px card).
- **Restrained motion:** short entrances that land softly. Nothing loops, bounces or demands
  attention.

It never comes from extra colour, glows on data, gradients competing with each other, or
decorative chrome.

### The benchmarks

- **Profile Overview** (`/overview`, `/players/[id]`) and **Team Overview** (`/team`) are the
  reference pages. A new page should look like it belongs beside them. They have:
  - an expressive banner or hero;
  - a compact first screen of opaque panels in a clear order of importance;
  - a single `panel-featured` lead card;
  - quiet labels and strong figures.
- **Champion Intel** (Champion Lookup, the owner's request of 23 Nov 2026 in Matchup Intel's place,
  renamed and extended on 24 Nov 2026, one aligned board since 25 Nov 2026) is the reference read in
  a glance on a second monitor: one surface, no box inside it. The header: the portrait, the name in
  the primary colour (whole, never cut or broken; it opens the window of every champion), Riot's title
  in the secondary, the champion's facts as sentence-case label and value pairs, and "Ability haste"
  with the rule in an ⓘ. The five abilities each a row Fold: the slot's key tile (P to R) beside the
  icon, the name, the mechanics Riot's description names as chips (crowd control in `warn`, the rest
  neutral: the word is the chip), and one grid of rank columns (cooldown at the haste in use primary
  and semibold, the base under it small and secondary, the cost per rank secondary); a passive's
  missing cooldown a quiet dash; column headings in `label-text`. Base statistics a small table
  beside the abilities on a desktop. Compare is the same board with two champion columns, a CSS
  subgrid of the board's rows, so each row of the two lines up; two neutral references (no colour
  for better or worse). The single view fits one viewport from 1280 × 720, Compare from 1440 × 780;
  nothing scrolls inside it (docs/CHAMPION_INTEL.md).
- **Match History** is a finished, successful experience. Do not restyle it for novelty. Change it
  only for a bug, an accessibility fix or a product decision. The owner's requirements of 25 Nov 2026
  (§1) were one: the performance score's own place on every collapsed card, one place badge across
  the site, the score on Team → Matches' member rows, and the score through the game removed.
  - **The post-game view (the owner's directive of 19 Nov 2026, §5; redrawn at the owner's brief of
    24 Nov 2026, §1–§8).** An open game is one integrated post-game screen (`post-game.tsx`), the same
    under a card and in the match window, with nothing in it scrolling: no sideways build path, no
    scrolling panel or scoreboard, no nested scroll container, no visible scrollbar and nothing cut
    off by an overflow (e2e/match-breakdown.spec.ts and the Production check count scroll containers
    and clipped elements inside it). Fewer boxes: one surface for the scoreboard, everything else on
    the open card's own background, separated by space, never a card per figure.
    - **Layout** (the view's own width, `@container/pg`; `VIEW_GRID` in `post-game.tsx`, its four
      parts one grid's items in reading order: the player, the build panels, the lane, the
      scoreboard): from 56rem two columns, the player inspected (22rem; 24rem from 64rem, 27rem from
      80rem) over Build Path | Skill Order | Runes, beside the scoreboard over the lane; 40–56rem (a
      tablet) the player beside the build panels and the lane, the scoreboard across under both;
      under 40rem one column. The score through the game (a chart under the scoreboard, about 136px
      of the right column) was removed on 25 Nov 2026; its room went to the scoreboard's rows (36px,
      32px portraits, 22px items from a 36rem scoreboard), its place badges, the inspected player's
      score (`text-2xl` bold with its badge) and, since 26 Nov 2026 (the review: the build had got
      none of it, and 120px of the right column stood blank), the lane, now under the scoreboard
      (a 21rem column) with the scoreboard's notes beside it, and the build panels: their area takes
      whatever height the scoreboard and the lane leave beside it (the build column's row is the
      grid's flexible one), so the two columns end level and a build path of 9–11 visits shows on
      one page (paged one row at a time before at 1440 × 900). The notes beside the lane, not over
      it, keep the right column the scoreboard plus the lane (about 116px, less than the chart's
      148px with its gap), so a scoreboard with possible groups, long names and wrapping notes still
      fits 1280 × 720: with the notes over the lane, the long-names demo's tallest game read 729px
      there (room 668). In the two columns the figures, the other figures and the three panels are
      a step larger (the figures `text-lg`, the other figures `text-xs`, the build's items 26px, the
      skill grid's cells 24px, the runes 22–24px with `text-sm` names). Measured on the demo (MID's
      six newest games): the build column and the lane both end 527–555px under the view's top at
      1280 × 720 and 1440 × 900 (583–614px at 1920 × 1080), the panels' area 143–187px (the skill
      grid and the rune page 122–125px), the card and its game 602–630px at 1280 × 720 (651px for
      MID's third game before, below). Every part above the scoreboard or beside it keeps its height whoever is inspected
      (fixed lines, truncation, reserved rows: the loadout row 56px, the six figures, the other
      figures' grid with every row always drawn, the panels' area, the lane's four rows), so the rows
      never move when another player is chosen (asserted ±1px).
    - **Fit** (the owner's brief, §2): on a desktop at 100% text the card (with Previous, Next and
      Close) and its game fit the room under the pinned bars at 1280 × 720, 1366 × 768, 1440 × 900,
      1920 × 1080, 2560 × 1440 and 3440 × 1440, the sidebar open or collapsed. Measured on the demo
      (MID's third game, with a timeline, the card's top to the game's end, against the window's
      height less the pinned tabs, 52px; 58px from 1920): before (`main` 2d6b1718) 1436px at
      1280 × 720 (room 668: the two columns started at 60rem, so the sidebar open stacked them) and
      843px at 1440 × 900 (room 848); after, 651px at 1280 × 720, 1366 × 768 and 1440 × 900, the
      sidebar open or collapsed (rooms 668, 716, 848), 721px at 1920 × 1080 (room 1022), 837px at
      2560 × 1440 (1373) and 893px at 3440 × 1440 (1368); a tablet (768 × 1024, room 915) 870px. Every
      role's six newest demo games stay within the room at 1280 × 720 (the largest 663px, a possible
      duo's line under its team's band). A game opened in the upper part of the screen whose end runs below it is moved up
      just enough to show all of it (`InlineMatch`), with motion on or reduced: it is measured once
      the region has grown open (the Unfold's `data-settled`) and again as the timeline, the groups
      and the ranks arrive in its first 3 seconds, until the reader scrolls or presses a key. Measured
      once while it was still growing, it left the game's end 155–237px below the fold with motion on
      (the review of Release 17, finding 2); after, the end is at or above the window's foot at
      1280 × 720, 1366 × 768, 1440 × 900, 1920 × 1080, 2560 × 1440 and 3440 × 1440, motion on and off
      (e2e/match-breakdown.spec.ts runs it with motion on). After Previous or Next the new card is
      held where the old one's header was instead (no move into view; `holdInPlace`, which also
      ends once the page is scrolled far by anything else: run on for its 30 frames, it pulled a
      scroll made 400ms after a step back by 612px). After the panels' area was sized per game
      (below) MID's third game is 648px at 1280–1440, 716px at 1920, 830px at 2560, 886px at 3440 and
      867px on the tablet (3–8px less). The sticky footer of Previous, Next and Close is
      drawn only where the game is taller than the room (large text, a short window): a game that
      fits has its card's steps in view with all of it. A phone's window shows one of three pages
      at a time, **Player | Build | Scoreboard** (the shared segmented control; a window under 481px
      tall too), each within the screen at 100% text at 375 × 667, 390 × 844 (with an iPhone's
      insets) and 430 × 932; a tap on a scoreboard row inspects that player and shows their page.
      At 150% and 200% text the view reflows and the page (or the window's body) scrolls
      vertically, never sideways and never inside the view. On a phone at 200% (the review of Release
      17, finding 1) the loadout wraps (the items, then the score, on lines of their own under 19rem),
      the six figures go two across and the other figures' groups one under another under 19rem, the
      runes' two paths one under the other under 17rem, and labels wrap rather than end in an
      ellipsis (the scoreboard's names keep theirs, with the full name as their title); the title
      wraps rather than lose the champion; the window's footer is one row, Previous and Next 44px at
      any text size (their words for screen readers under a 17rem row) with "Game n of m" between.
      Measured at 390 × 844: the body was 580px wide in 388 and the footer 225–273px with the steps
      stacked; after, nothing wider than the body and the footer 93px (375 × 667 the same). At 100%
      text the pages are unchanged: the window's body 543, 720 and 808px at 375 × 667, 390 × 844 and
      430 × 932.
    - **The player inspected**: one line, their name (the collapsed card's name: a team member's
      profile name, else the Riot name), champion and role, with "Back to …" while another player is
      inspected; the loadout as the client draws it (a 56px portrait with its level, spells and runes
      two by two, the six items two rows of three with the trinket beside the first, in inset
      slots) with the performance score beside it in two fixed lines (the score, bold, with its place
      badge, then "3rd of 10" and one (i) that says how the score is worked out and that it is
      UNIIVERSE's own, not OP.GG's) and the line an icon names itself in; six figures in aligned columns (K/D/A, CS, gold, damage, vision, KP; each of the
      player's figures once in the view); the other recorded figures as a grid of three groups of
      aligned rows, **Combat** (taken, mitigated, CC), **Utility** (heal + shield, wards cleared,
      control wards) and **Objectives** (damage, turrets), their labels in sentence case
      (`label-text`, 25 Nov 2026, as are the six figures' and the lane table's), ordered by role (a support's utility first,
      a jungler's objectives, everyone else's combat), "—" where the record lacks a figure and "0"
      where it recorded none (`src/lib/format.ts` for every number). **Build Path | Skill Order |
      Runes** (`segmentedGroupClass`, radios: the view still has no tabs) over one area of one height
      for the game, sized per game rather than a constant (the review of Release 17, finding 3): the
      skill grid and the rune page are laid out in one grid cell, the one not chosen invisible, so the
      area is as tall as the taller of the two (109px at 1280–1440, 119px at 1920, 137px at 2560, 146px
      at 3440; the constant area was 112px at 1440, 124px at 1920 and 154px at 3440), and the build
      path is laid over it; from a 56rem view (two columns) the area also takes the height beside
      it (Layout, above), and the build path's pages are laid out again when that height changes.
      Both have one shape for every player, so inspecting another moves nothing. Under 56rem a
      one-row build path still leaves the rest of the area empty, the price of switching never
      moving the lane under it. The build path is a wrapping timeline in
      game order, each shop visit its items over its game time, a completed item ringed, a
      consumable or ward smaller, a sold item faded with a minus (and each in words for screen
      readers), one (i) in place of the legend; a path too long for the area is split into pages of
      whole rows with page buttons under it (the same segmented control), every purchase in the page;
      the skill grid alone (nothing written under it); the rune page two paths and the shards, icons
      at one size per level. The lane by role in a table against the lane opponent at 10:00, 15:00
      and the end, the bot lane's two against two as its own row; a game without a timeline shows
      the end alone, never columns of dashes. Without a timeline (23 of 56 demo games), or for a
      player missing from it, the panels open on Runes: Build Path and Skill Order are disabled, with
      "Timeline not available for this game" once beside the control as their description, so no
      band says "not available" over 96px of blank space.
    - **The scoreboard** (`scoreboard.tsx`, `Scoreboard`): both teams as one component, the player's
      team first, each team's band (its side and result in words, its kills, gold, towers, dragons
      and barons) and five rows on one grid, so K/D/A, the build, CS over damage and the score over
      its place badge sit at the same x on both teams; every row 36px (two lines; 32px until 25 Nov
      2026) from a 30rem scoreboard, as tall while the scores wait for the timeline as once they
      show (the stand-in and the score over its badge both 32px; e2e/match-breakdown.spec.ts),
      two lines on a phone (the name, the K/D/A and the score; the build, the rank and CS with
      damage; from 17.5rem to 21rem, a 320–360px phone, the score beside the K/D/A so the second
      line has the row's width), everything wrapping whole under 17.5rem. The rank is text with its tier's crest, no
      box (the match card's short form "E2" in a scoreboard 30–36rem wide, a clock for a rank read
      away from the game); the lane opponent is marked by crossed swords ("Lane", "Lane opponent"
      from 36rem and 40rem); "Met N×" is a quiet underlined link; a possible group is one line under
      its team's band with its evidence fold, its rows marked by a coloured edge. The profile's own
      player has the accent tint, the player inspected an inset accent ring (`aria-current`); the
      row is its one button (↑ ↓ move between the rows), the name still the player's link. Under it
      one quiet line: "Ranks" with its (i) ("Rank recorded near match time; older readings may
      differ. Solo/Duo unless marked Flex.", or the Flex wording in a Flex game) and a check's state
      when it is running or could not ask for everyone; "Possible groups" with its (i) ("Players
      frequently seen together in earlier games. Not confirmed premades.") only where a side has
      one; the date and patch, the bookmark and OP.GG. From a 56rem view (since 26 Nov 2026) the
      notes sit beside the lane under the scoreboard, right-aligned and wrapping in their cell
      (the date and the patch each kept whole), instead of a line over the lane.
    - **Removed on 24 Nov 2026** (the owner's brief, §3–§7; the Production check asserts each stays
      gone): the "Compare with" select, the comparison table and the chart's second line; the
      written why and the trend word under the name (`reasonText` stays in the domain; `trendOf` went with the score through the game on 25 Nov 2026);
      "Excellent"; each team's mean on a split bar and the ten score tiles (the rows carry every
      score and place); the build path's sideways row and its legend; the skill grid's sentence
      ("Maxed Q → E", the points taken); the sentences under the scoreboard (the ranks' lead, "not
      enough recorded history", "no other players to assess", "inferred from N games", the Clash and
      not-assessed lines); the support figures' sentence; the phone's folds and the "Show …'s game"
      link; the removed player's long sentence (now "Removed player · personal data erased"). The
      notes and the gold curve stay removed (23 Nov 2026, docs/MATCH_NOTES.md). The open card's
      header with Previous, Next and Close and the one history rule (Back closes the game, however
      many games were stepped through) are unchanged.
    - **Removed on 25 Nov 2026** (the owner's requirements, §1; the Production check asserts it stays
      gone): the score through the game, its heading, its (i), its chart and its "not available"
      line, and with them the timeline score's code (`timelineScores`, its damping and priors, the
      trend words `trendOf`; docs/PERFORMANCE_SCORE.md). The open card's header now shows its card's
      score and badge.
  - **Density (owner decision D8, approved 8 Nov 2026, built 18 Nov):** denser cards that keep the
    statistics, champions, ranks, LP and every interaction readable. The card follows the list's
    own width (`@container/mh`), in three tiers:
    - **a phone's card** (a list under 36rem), about 118px (131–147px before): the result line
      across the card, with a ranked game's LP at its end; the portrait, the champion and role
      with the build under them (from a 21.375rem list, where the widest K/D/A still fits beside
      a line of seven 20px items; narrower, kill participation takes that place and the build
      closes the card) and the K/D/A; then the figures. Both teams stay on the game's own screen;
    - **a two-row card** (36–50rem: tablets, and phones held sideways under 848px, such as an
      iPhone; a Pixel 7 held sideways has a 50.9rem list and keeps the wide card), about 120px on
      an iPad (about 150px before): the portrait, the result line over the champion, the K/D/A, the
      figures and the build in one row, both teams under them. The champion's name has its whole
      box (the role takes the next line when both do not fit), so even a 36rem list keeps "Nunu &
      Willump" whole;
    - **the wide card** (from 50rem), one row of about 100px, unchanged in height; since 25 Nov 2026
      the performance score has a column of its own (2.5rem) right after the K/D/A, the teams join
      from a 65rem list (61rem before), the columns sit 8px apart from 65 to 74rem (10px before),
      the chevron is left out there and the 16px and 20px gaps start at 74 and 76rem (70 and 72rem
      before), so beside the open sidebar 1366 keeps its teams (272px, against 275 before: 3 of 10
      names cut on the demo's longest roster once both sides' ranks are read) and 1440 widens them
      (334px, against about 300). The K/D/A's floor is 6em (6.25em before: "10 / 10 / 10" is 5.71em).
  - **The performance score on the card** (Release 17; its own place at the owner's request of 25 Nov
    2026, §1, OP.GG's hierarchy as the reference, not its looks; docs/PERFORMANCE_SCORE.md, "Where it
    shows"): `ScoreMark` (`components/match-history/score-mark.tsx`), the score bold in `fg` with the
    shared place badge (`PlacementBadge`, below). A wide card gives it a column of its own right
    after the K/D/A, the score (`text-xl`, the card's largest figure) over the badge, centred, at one
    x on every card (the Production check and e2e/match-score.spec.ts assert ±1px); a phone's and a
    two-row card give it a line of its own directly under the K/D/A and its ratio, the score
    (`text-md`) beside the badge, right-aligned on a phone and left-aligned on a two-row card. A card
    without a score keeps the place with a quiet dash (`ScoreMarkEmpty`, `match-score-empty`, hidden
    from screen readers). Its words for a screen reader are `scoreWords`' ("Performance score 3.5,
    9th of 10, MVP"), also in the card's label. Heights (measured 25 Nov 2026 on the demo, Demo ADC,
    against `main` 3aab01b): a phone's card 118.5px (114.5 before), +4px, 129.5 with a multikill
    (125.5), and 142.5 at 320px (138.5); a two-row card 118px (117.5), 129 with a multikill (125);
    the wide card unchanged, 102px at 1440 and 74–76px at 1280. The iPad's page (810 × 1080) went from
    1.6 to 1.617 screens (docs/MOBILE.md).
  - **The place badge** (`PlacementBadge`, `components/ui/placement-badge.tsx`, 25 Nov 2026): the one
    mark for a place everywhere one shows (the cards, the open card's header, the inspected player,
    every scoreboard row, Team → Matches' member rows). MVP: `--color-gold` text on a gold 15% wash
    with a gold ring, bold; ACE: the same in `--color-violet`; any other place: `fg-muted` on a faint
    `fg` wash, no ring. Both colours are the fixed rarity tokens, never `accent-2`, which Branding
    changes. MVP and ACE replace the ordinal ("MVP", not "1st MVP"); the ordinal stays in the
    accessible name ("MVP: highest score on the winning team, 1st of 10"). Sizes by prop (`row` 16px,
    `card` 20px, `header` 20px with 12px text), one shape and one fixed width per size whatever it
    says (`row` 2.25rem, `card` and `header` 2.5rem: the widest word, "MVP", with room either side;
    a minimum width let MVP and ACE grow past "5th", so a score beside its badge moved 2–4px from row
    to row: the owner's review of 25 Nov 2026). Hook-free and server-safe (Team → Matches renders it on the server). Contrast (worked out from the
    tokens): on `surface` gold 8.3:1, violet 6.6:1, the ordinal 9.6:1; on the selected row's
    `surface-3` 6.4, 5.1 and 7.3:1.
  - Read in the order drawn: a card's parts and the header's come in the page in the order they
    are drawn. A phone's card has its own copies of the result line (its first line) and of the
    build (beside the champion), placed where they are read; only one copy is ever displayed.
  - Around the cards: the views (Games, Encounters), Filters and Refresh share one row at every
    width where they fit, from a 320px phone up (on a phone the views drop their icons, Refresh
    shows its icon alone, and under 360px Filters too, their names kept for screen readers); the
    scope line follows; a narrowed filter's chips take the next row when they do not fit, and below
    `xl` an active refinement's always do, from the row's start, clear of the Refine panel.
  - The summary (`StatStrip`) holds every figure at once in three lines on a phone from 393px
    (an iPhone 15): the last twenty with the streak and a trend; the record, KDA, CS and kill
    participation; the champions played most and the ladder change. Its words are the approved
    design's short ones ("4W streak", "+45 Solo/Duo since 3 Nov", on a phone "Better +9 pts"), the
    full ones read by screen readers and in each figure's title. The squares share what their line
    leaves, never under 3px. A line wraps where its figures still do not fit: at 375px a streak
    beside a named trend takes a second row on the first line, and the longest ladder label or a
    two-digit record on a champion can move the ladder change to a fourth line; a 360px phone's
    ladder change, a 320px phone and a large text size wrap too. From 36rem one flowing line; from
    60rem one row of tiles with every figure at once (a trend, a streak, three champions and the
    ladder change, at their widest with both arrows too, on a 60rem list as well); from 78rem
    without a trend one line of text. Measured with demo Support (a trend, a streak and the ladder
    change) and the widest real values written in (e2e/match-history-layout.spec.ts).
  - Encounters keeps its minimum and order in a phone's Filters sheet, as segments (chips until
    Release 17; one choice each, so not chips) that count with
    the filters and that its Reset puts back; from tablets up they stay in the list's toolbar and
    are the list's own (the filters' Reset neither counts nor changes them). Its column names pin
    under the section tabs.
  - What did not change: one button per card, a game opening under its card (full screen on a
    phone), the result said three ways, the honest-data rules (LP only where the readings prove
    it, "Removed player", grey small samples), the compact profile band and every filter, link,
    figure and explanation (what moved where is in MOBILE.md, section 3).
  - Page heights against the plan's targets are in MOBILE.md, section 3; one is missed: a Pixel 7
    held sideways (863×360), where the wide card and the phone's frame leave D8 nothing to take.

### Page titles and the public header (S8a, 20 Nov 2026)

- **One h1 style** (`PAGE_TITLE`, `components/ui/page-header.tsx`): 24px, semibold, tight. Every
  page's title uses it, the sign-in, setup, recovery, welcome, Personalise, Privacy and invitation
  cards included. The wordmark's 0.2em spacing (`tracking-wordmark`) is for the team's name only.
- **The public header's links** (`components/public/nav-link.ts`): Team, Leaderboards, Install App
  and Sign in (or Open the app) in one style, the app's nav at 14px, 44px tall on touch screens.
- **Long public text on a desktop** (Privacy): from lg a table of contents sticks beside the text;
  below lg it is the row of chips under the title. The table's column (13rem) keeps every entry on
  one line (in 12rem "Cookies and your browser" wrapped, G3-15). Its contact panel leads as a
  neutral `surface-lead` panel, not a brand-blue box (G3-7). A frame holding something sticky clips sideways
  without becoming a scroll box (`BrandFrameView`'s `stickyInside`).
- **Instructions for the owner on a public page** (recovery's setup key) sit behind a fold, so the
  page leads with what it is for.

## 2. Principles

1. **Content leads, the frame recedes.** Navigation is the page's own ink, half a step lighter. In
   the frame, colour marks only where you are.
2. **One coloured mark per region.** In a group of controls, only the selected or current item is
   in the brand colour. Everything else is neutral until it is pointed at.
3. **Opaque surfaces for data.** Tables, scoreboards and lists sit on panels, never on
   translucency over art.
4. **Light at the edges.** The ambient glow, banners and card art may glow. Panels holding figures
   do not. Art inside a list row stays faint, at the row's start, and fades out before the
   figures: a pool row's splash on a profile (25%, a little brighter while pointed at), a Players
   row's strip of the member's art (tablets and up; `RowArtStrip`: 20%, the same while pointed at,
   gone by 60% of its width, before the rank and pool), so a dense list keeps each player's
   look without data on art.
5. **Neutral first, then brand, then meaning.** Use neutrals (fg overlays and the surface steps)
   for structure and hover. Use the brand blue for the selected state and primary actions. Keep
   `good`, `warn`, `bad`, `blue` and `red` for outcomes and sides.
6. **Every value is a token.** No hex in classes and no ad-hoc easing. Sizes are in rem.
7. **Motion explains, never decorates.** It respects `prefers-reduced-motion` always.

## 3. Surfaces and depth

Each surface is a step from the ground up. Lighter means closer to the reader.

| Step | Token | Where |
|---|---|---|
| 0 | `bg` + `--ambient-light` | the page ground, with violet light at the top edge and a low horizon |
| 0.5 | `chrome` (+ `chrome-light` on the sidebar) | the app's frame: sidebar, top bar, tab bar |
| 1 | `surface` + `panel-depth` | panels and cards; `panel-featured` or `surface-lead` for the one card a page leads with |
| 2 | `surface-2` | rows and tiles inside panels, hovered rows on panels (Admin's access levels, datasets, Riot API facts, resources and access dialog since S9c; never `bg-elevated`) |
| 3 | `surface-3` | selected or pressed rows on panels |
| float | `bg-elevated` + border + `shadow-2xl` | menus, popovers, pickers, a dragged card |

### The frame is the page's own ink

`--color-chrome` is `#0e0f17`: the default surface and ground mixed evenly. Branding derives it the
same way for custom colours (`brandThemeVars`: surface 50%, page 50%).

It replaced a near-neutral charcoal (`#131418`). That grey sat lighter than the indigo ground and
read as a separate grey slab beside the team's art: the "awkward colour block" in the sidebar. The
ink is darker than every panel, so panels still lift off it. Text contrast on it improves: fg-subtle
6.41:1 (was 6.18:1), fg-muted 9.68:1, and control edges 3.62:1 (was 3.49:1). Since the brighter
greys of 25 Nov 2026 (the owner's readability request): fg-muted `#c9cddb` 12.0:1, fg-subtle
`#a2a8bc` 8.1:1, and the disabled tone `#70758c` 4.2:1 on the frame (3.2:1 on `surface-3`, the
lowest, which WCAG allows for disabled controls only). The four tiers stand about 13 L* apart (95,
82.5, 69, 50), so primary, secondary and tertiary text read as three steps, not as one grey.

### Depth utilities (`globals.css`)

| Utility | What it draws | Use |
|---|---|---|
| `panel-depth` | sheen from the top, hairline of light on the top edge, soft shadow | every panel and card (`Panel` has it) |
| `panel-featured` | `panel-depth` plus a faint violet wash in the top corner | the one card a page leads with |
| `surface-lead` | `panel-featured` plus the brand's line along the top edge (accent to accent-2, fading out), drawn above the card's first row | the one card a page leads with, at most one a page (Leaderboards' Recent form board; Settings' account card; the profile's season card next) |
| `panel-lift` | rises 1px with a brighter edge on hover; none with reduced motion | cards that open something |
| `chrome-light` | sheen from the top and a faint violet glow behind the logo, on the sidebar's still layer | the desktop sidebar only |
| `brand-plate` | hairline of light around the logo (brighter on top) and a soft shadow under it | the team's logo set into the frame |

None of these creates a stacking context, so menus and tooltips inside keep their layer. There are
no blur filters on content. The phone bars' `backdrop-blur` is the frame, not content.

## 4. Colour budget

The default brand blue (`#1fc3ff`) is saturated, and too much of it reads as a generic dashboard.
It may appear only:

- on the **current or selected item** of a group: the current page's icon, a selected tab's
  indicator (with the gradient), a chosen segment's or view's underline, an active filter chip;
- on **primary actions** and inline **text links** (underlined in running text);
- on the **focus ring** (`:focus-visible`);
- as the first stop of the **brand gradient** (`from-accent to-accent-2`) on a few chosen marks:
  the selected tab bar, the current page's bar in the sidebar, the lead card's top edge, chart
  lines;
- in **eyebrows** above a page title (`PageHeader`'s `eyebrow`).

It should not appear:

- as a **fill or border on idle controls**. The sidebar's old "Switch to Admin Mode" box was one;
  it is now a neutral row whose shield turns blue while pointed at.
- as a **glow or shadow colour**. The one deliberate exception is Team Overview's stage, approved
  by the owner and restored at their request on 17 Nov 2026 (November's redesign had removed it):
  five across, the cards stand on a floor lit in the brand blue from just under them (a radial
  glow, a hairline at their foot and the team's logo or short name as a faint watermark,
  `lineup-stage-floor`), decoration only: hidden from screen readers, behind the cards and never
  sizing anything. Its light is an inline gradient, which the rule below does not read. Team
  Overview's selected card lifts with a neutral `shadow-black/40` (it had `shadow-accent/15`). The
  sign-in and setup frame's card (`BrandFrame`) glowed in the brand blue too; it is lit in violet
  now, like the page's ambient light, and the role bar's selected tab drew its blue edge as a
  ring, not a shadow (the role bar went with the phone's carousel on 23 Nov 2026: its dots mark the
  card in view by a longer pill in the brand blue, never by colour alone). `design-tokens.test.ts` refuses `shadow-accent` (any opacity or variant), an
  arbitrary shadow made of `var(--color-accent)` and the shorthand `shadow-(color:--color-accent)`;
  `shadow-accent-2`, violet, stays allowed.
- as the **colour of the logo's stand-in** (`BrandMark` without an upload). That is now a neutral
  tile lit faintly in violet, with the letter in `fg`.

Violet (`accent-2`) carries the light: the ambient glow, `panel-featured`, `chrome-light`, the
gradient's second stop and emphasis that is not a control.

Bars that are figures (Recent form's 20-game record, All Champions' share of the games: `QuietBar`)
are neutral overlays of `fg` (filled, empty and outlined segments, or one continuous share), never
the accent or a state colour, so they keep their contrast on any surface and any Branding. Gold marks first place only, as the place's own number (no crown since 25 Nov 2026: restrained placements, `Place`'s `leader`).

## 5. Interaction states

There are two families, by what the control sits on.

| On | Rest | Hover | Pressed or open | Current or selected |
|---|---|---|---|---|
| the frame (`chrome`) | transparent | `bg-fg/4` | `bg-fg/7` | `bg-fg/8` + inset top hairline (`RAIL_CURRENT`) + brand mark |
| panels (`surface`) | transparent or `surface-2` | `surface-2` | `surface-3` | `surface-3` or `accent/10` with a ring, weight or bar |

Overlays of `fg` keep their contrast on any custom Branding colour, which is why the frame uses
them. Panels keep the surface steps.

**List rows** (`DataRow`, Players' rows): hover `surface-2`, pressed `surface-3`, and pressed
`surface-2` on phones (MOBILE.md, owner-checked). Your own row is `accent/5` with a 2px accent bar
at its left edge. Only a row that is a link takes these states; its one link covers the whole row.

**Text and icons.** Idle text is `fg-muted` and idle icons `fg-subtle`. On hover both step up
(`fg`, `fg-muted`). The current item is `fg` with its icon in `accent`.

**Focus.** Every focusable element shows the same 2px accent outline (`:focus-visible`,
globals.css). Rows inside the sidebar draw it inside their edge (`-outline-offset-2`), where the
frame cannot clip it. A window opened by a tap or a click takes the focus itself, without a ring,
so nothing in it is lit up as it opens (Safari ringed the close button, the loudest thing in the
window); opened from the keyboard, its close button has the focus, ringed, so a keyboard user sees
where they are (`DetailModal`; `src/components/ui/input-kind.ts`). The window
holds that focus only until it is pressed or the focus moves on (`focusWindow`), and a press inside
any window on nothing focusable leaves nothing focused, so a click on its text leaves the focus as a
page does and the keys still scroll its body (`letGoWhenPressed`): Chromium and WebKit focus a
dialog itself at such a press, with or without a tabindex, and the keys then scrolled nothing.

**Targets.** At least 24px everywhere and 44px on touch screens (STANDARDS.md): a segment is 44px
there (36px with a mouse, the height of a field beside it), an ⓘ's touch area 44px (S2b, 20 Nov 2026: 38px and 40px before).

### Text-led controls (Release 17, 24 Nov 2026)

The owner's brief §9 retired the boxed segmented control (an outlined, filled group round a
ringed, filled selection) and the lit pill of a section's views. Every way of choosing one thing out
of a few is now words, the chosen one marked by weight, colour and a short underline; three levels
of one family, so they never compete:

| Level | Component | Size | Chosen | At rest | Hover |
|---|---|---|---|---|---|
| Section tabs (primary) | `TabBar`, the phone's `ChromeTabs` | 44px, 14px medium, icons from sm; a hairline under the row | `fg` over a 2px bar in the brand gradient at the tab's foot | `fg-muted` | `fg`, a faint bar |
| A section's views (secondary) | `SubTabs`, `compactTabClass` (the pinned row), the in-page indexes (Leaderboards', Settings') | 36px with a mouse, 44px on touch; 14px; icons | `fg` semibold, its icon `accent`, a 2px `accent` line 4px above its foot | `fg-muted` medium | `fg`, a faint `border-strong` line |
| A choice in the page (a role, a side, a sort, a queue) | `segmentedGroupClass` + `segmentClass` (`size: "md"` for a list's main filter), `RoleSegmented` | 36px / 44px; 12px (14px with `md`) | `fg` semibold over the 2px `accent` line | `fg-muted` medium | `fg`, a faint line |

- **No box:** no outline or fill round the group, no fill or ring round the chosen item, on any
  screen (the phone's track under Match History's Games and Encounters went too). The underline is
  drawn inside the item's own box (`choiceIndicatorClass`, `ui/segmented.tsx`), 4px above its foot,
  as wide as its words, so it never reaches past the item or its row (`tabIndicatorClass`'s note:
  a row that overflows by a pixel scrolls the other way too).
- **Wrapping:** a segmented group whose words outgrow the line (a narrow sheet, 200% text) wraps
  onto the next line; the boxed group scrolled sideways, which at 200% hid three of the phone
  sheet's six roles with no sign of them. Resources' index keeps its sideways row on tablets
  (`flex-nowrap`, a ScrollRow with its fading edge).
- **Focus:** the 2px accent outline, drawn inside the item (`-outline-offset-2`), where a group that
  scrolls sideways cannot clip it. **Disabled:** `fg-disabled`, no line, no hover, the not-allowed
  cursor (25 Nov 2026; `fg-subtle` at 60% before, 3:1 and drawn differently on every surface).
- **Keyboard and semantics unchanged:** radios with `aria-checked` in a `radiogroup`, toggles with
  `aria-pressed`, links with `aria-current`; the arrow keys where a group had them.
- **Counts** beside a role or a section are plain `fg-subtle` figures, not chips; a zero too (it is
  not disabled: until 25 Nov 2026 a zero was `fg-subtle` at 60%, 3:1, under AA).
- **Groups side by side** keep 24px between them (Admin Previews' page and screen size), so the
  words of one never read as the next's; an action beside them is a button with an edge (Rotate,
  Reset), not words.
- **Chips are not tabs:** a filter that can be on beside others (`chipClass`: Players' Main lineup
  and Archived, Team Matches' Bookmarked, the pinned row's `ToolbarChip`, a narrowed filter's
  removable chip `FILTER_CHIP`) keeps a round `border` outline, lit while on with an `accent/60`
  edge over an `accent/10` wash (`chipLookClass`), 36px with a mouse and 44px on touch, 12px.
- **Fields stay fields:** a search, a `Select` and a toolbar button (Refine, Filters) keep their
  `border-control` edge, which WCAG 1.4.11 asks of a field's boundary (3:1), at the segments'
  height (36px with a mouse, 44px on touch) and type (14px), so a row of fields and segments lines up.
- **Guards:** `src/app/segmented-use.test.ts` refuses a page's own boxed group (a fill, a 2px inset
  and an outline in one class list) or boxed selection (an accent ring, `bg-accent/15`) outside
  `src/components/ui`, with an allow-list of reasons (pictures chosen from a grid, dragged items,
  the phone's bottom tab bar, badges); `e2e/shared-controls.spec.ts` checks the groups of Profile,
  Match History, Encounters, Players, All Champions, Leaderboards, Champion Intel, Settings and
  Admin Previews are flat and their chosen items underlined, at the three projects' widths.

**Disabled controls, one look** (25 Nov 2026): every control that is `disabled` or `aria-disabled`
draws its words and icon in `fg-disabled`, keeps the not-allowed cursor and takes no hover. A
filled `Button` keeps a fill, the neutral `surface-2`, not its accent; an outlined one a quiet
`border` edge; a `Switch` a flat track with the knob in the disabled tone (its side still says on or
off), its label in the disabled tone and its description, often why it is off, in readable `fg-subtle`;
a Card Studio slider's readout (an `<output>`, not the control, which axe checks) `fg-subtle` too; a menu item, a select's option and the window steps (‹ ›) the same tone. Never a
half-transparent control: opacities from 30% to 70% across 25 places read differently on every
page. `opacity` stays for a picture that dims as a whole (an avatar button, a lineup choice with the
player's picture, a native range input the browser draws) and for a busy part while a choice loads
(`opacity-60`, `aria-busy`). The tone is under 4.5:1, which WCAG 1.4.3 allows for inactive controls
and axe skips; on live text it fails, so `src/app/type-hierarchy.test.ts` refuses it without a
disabled variant or condition.

**Labels are sentence case** (25 Nov 2026, the owner's readability request): `label-text` for column
headings and small labels (`text-2xs`, medium, `fg-muted`), `SectionLabel` a small `fg` heading for
a part inside a panel, `Metric` a `fg-muted` label over its figure with no box of its own. Capitals
stay only where an approved design keeps them (Team Overview's backdrop lettering, the Admin mode
marker and the admin eyebrow, the sign-in card's eyebrow, pill badges), listed in
`src/app/type-hierarchy.test.ts` with their reasons. Team Overview's labels went to sentence case
on 27 Nov 2026 (the owner's decision D4: "Team overview", the role chip's "Top", "Win rate", "Top
pool", the player window's column names, "First choice", "You", "Main role"), its card design,
spacing, artwork and colours unchanged; the labels are `label-text` (the 12px floor on desktops,
secondary), and the team's backdrop lettering and a member's "wide" name style keep their capitals. **Uppercase labels** that remain keep one letter spacing, `tracking-label`, at every width:
no width or container variant may change it (`design-tokens.test.ts`; the Team card's WIN RATE was
0.44px on a laptop and 1.32px on a phone before S2b).

## 6. Motion

| What | Duration | Curve |
|---|---|---|
| hover and colour changes | 150ms | Tailwind's default transition curve |
| entrances: menus, modals, sheets, toasts | 160–220ms | `--ease-emphasized` |
| exits | about 140ms | `ease-in` |
| the sidebar sliding open or closed | 220ms | `--ease-glide`, transforms only |
| the current page's bar growing in | 200ms | `--ease-emphasized` (opacity and scale) |
| the logo answering hover | 200ms, scale 1.04 | `--ease-emphasized`; no scale with reduced motion |
| the Team card's turn | 460ms | `--ease-turn` |

- Animate `transform` and `opacity` only, so the work stays on the compositor. The sidebar's
  hairlines shrink with `scale-x`, not width or margin.
- `prefers-reduced-motion: reduce` makes every animation and transition instant (globals.css);
  decorative effects (card shimmer and drift) stop entirely.
- Nothing animates on a page's first paint except entrances of things the reader opened. A
  `QuietBar` moves only when its value changes (a continuous share slides 200ms with
  `--ease-emphasized`); its segments never animate.

## 7. Shared containers

One set of containers, chosen by what the content is, never by page. Each is one component in
`src/components/ui`; a page uses it rather than keeping its own open state, keys or history.

| Container | For | Component | Opens | Closes | Address and history |
|---|---|---|---|---|---|
| **Peek** | a quick look at one item from a list or a board (a team player; a Players row or a Leaderboards member, `player-peek.tsx` since 20 Nov 2026, the row's name still the profile's link; a game from a board; a champion of All Champions from Release 16 until 25 Nov 2026, now a pane beside its list: below, "All Champions' champion") | `peek.tsx`: `usePeek`, `Peek` | a row (click, tap, Enter); ↑/↓ or J/K and ‹ › switch | ✕, Escape, Back, the selected row again; not an outside click, except where a consumer asks for it (`closeOnOutsidePress`; none since 25 Nov 2026) | `?player=` (and so on) on the current page: the one history rule |
| **Unfold** | an item opened under its card, for items compared down a list (games), in the flow (in the one-screen workspace a game opens in the game window instead: below) | `unfold.tsx`: `useUnfold`, `UnfoldRegion`, `UnfoldHeader` | the card | the card again, Escape, the pinned header's Close, Back | the one history rule |
| **Game window** | a game of a paged list in the one-screen workspace (Match History, Team Matches), over the list, which never moves | `MatchDetailModal` with `workspace` (`DetailModal` `size="workspace"` `workspaceWidth="game"` headless: the match window's 76rem at the workspace's height; its header line ends with Previous, "Game n of m", Next and Close; `PostGame` `fitPages`: its three pages where the view does not fit) | the card | Close, Escape, Back | the one history rule; Previous and Next replace the address and cross the list's pages |
| **Task dialog** | work that needs full attention (editors, confirmations, pickers, Card Studio, Install) | `dialog.tsx`: `Dialog` with its `size` (every one states it, `TASK_DIALOG_REM`): `form` 30rem for forms and confirmations (`ConfirmDialog`, the account and job confirmations, Change Riot ID, Position your picture), `picker` 42rem for a choice among many or an editor with a table (Access, an access level); Card Studio alone `min(100% − 3rem, 100rem)` by `min(100% − 3rem, 64rem)` (`DetailModal size="full"`, Release 17: its live preview 45% of it, docs/PLAYER_CARD_STUDIO.md); Install and sign-in 30rem (`compact`, `form`); the champion picker 42rem (`standard`). Phones and short windows: docked to the bottom edge, or the whole screen | its button | Close, Escape, the backdrop | none |
| **Paged list** | a list in a one-screen workspace that would grow past the window (All Champions' champions, 27 Nov 2026; every workspace page from 28 Nov 2026): the complete rows that fit, a pager reaching the rest | `paged-list.tsx`: `usePagedRows` (the measure, the page, the rows shown, the keys, the focus, the region's and rows' attributes) and `PagedFooter` (`WorkspaceFoot` with a leading slot and the inline `Pager`); underneath, `fit-rows.tsx`: `useRowBudget` (`mode: "cumulative"` for rows of several heights); `row-budget.ts`: `rowBudget`, `cumulativeRows`, `slotPages`, `usePagedList`, `useFollowed` (the item just closed, so a list comes back on its page) | the footer's inline pager, the list's keys (PageUp/PageDown, Home/End; ↑/↓ across a page's edge where it asks) | — | never: a page is the list's own state |
| **Paged grid** | cells in one column, or two from a width, filled column-major and paged the same way (All Champions' lane opponents and an opponent's games; Team Matches, admin resources, previews) | `paged-grid.tsx`: `usePagedGrid` (a column's cells by `useRowBudget`, an optional divider slot, the open item followed), with `PagedFooter` | the footer's pager; ↑/↓ the reading order across pages, ←/→ the other column, PageUp/PageDown, Home/End | — | never |
| **Workspace section** | a one-screen page's content in the workspace: the section that fills the frame, its cards to the frame's foot, a card's footer | `workspace.tsx`: `WorkspaceSection` (`@container/ws`), `WorkspaceCard` (`data-ws-card`), `WorkspaceFoot` (`data-ws-foot`), `useWorkspaceMarks`, `WS_COLUMN` for every wrapper above it, `wsTierClass` for the first paint's tiers | — | — | none |
| **Sectioned workspace** | a long page of sections (a form's panels, an admin page's parts) as one screen: a rail of the sections, one at a time filling the frame; stacked as before outside the workspace | `sectioned-workspace.tsx`: `SectionedWorkspace` (markers for unsaved changes, an error, a count, and `useSectionMarker` for a field's; a slot for the page's actions; every section mounted, so drafts survive a switch; `beforeLeave`; a page's own layout with `SectionRail` and `SectionPanels`: Settings' account card is its rail); the rail text-led, as a section's views (§5). Admin Branding draws the same rail itself (one form whose Save bar spans its sections) with `address-section.ts`'s `useAddressSection`, which also keeps a list's filter or a queue's view in the address (Resources, Matchup notes) | a rail link (a plain link to its address) | — | `?section=` (the first section has none), each switch an entry of its own, as a section tab's: Back steps back |
| **Details window** | what a fold opens in the flow, in a one-screen workspace, where opening it in place would grow the page (System Health's page speed by device and by page, its recent errors and job runs) | `workspace-window.tsx`: `WorkspaceWindow` (the flow's own markup outside the workspace; a row, then a window that fits with no inner scroll, one view at a time), `WorkspaceOpenFold`, `WorkspaceFlowFold` | the row | ✕, Escape, a click on the dimmed page | none |
| **Phone window shell** | the window an item opens in on a touch phone or in a short window (a Peek's, a game's) | `preview-window.tsx`: `PreviewWindow` on `DetailModal` | the item | ✕, Escape, Back, a pull down on its header (or its bar) | the item's own (`?player=`, `?match=`) |
| **Workspace window** | All Champions' pane where the workspace's section is too narrow for it (1280–1355px with the sidebar open, 28 Nov 2026): the pane's own content, paged, in a window of a fixed height | `PreviewWindow size="workspace" headless` on `DetailModal` (the content's heading names it; `useRowBudget` ends its lists at the window's foot) | a row of the list | the content's labelled Close, Escape (an opponent's games back to the grid first), a click beside it, Back; the focus then on the row of the champion shown | the pane's (`?champion=&crole=[&vs=]`) |
| **Popover** | anchored choices (menus, filter dropdowns, the pinned row's Filters) | `popover.tsx`: `Popover` (a panel of fields: the Filters, 34rem, where previews open beside the list; a touch phone keeps the sheet); `menu.tsx` (a menu) | click, Enter, Space | an outside press, Escape (focus back on its button), the focus leaving it, Done, its button leaving the screen | none of its own; a choice replaces the query. The Filters (popover or sheet) have no history entry: one under a replaced query made Back, or a close while a choice loaded, restore the old address |
| **Select** (a Popover) | one value from a short list in a toolbar or a form (game mode, season, minimum games, sort, a filter's status…) | `select.tsx`: `Select` (options as data) | click, Enter, Space, ↑/↓ | a choice, Escape, Tab, an outside press, a resize, its button leaving the screen | none; a choice calls `onValueChange`, which writes the address as the native select did |
| **Explain** | a short explanation beside a term | `info-tip.tsx`: `InfoTip` | hover, focus, tap | leaving, Escape, any tap | none |
| **Fold** | secondary content in a page: a section, the rest of a list ("3 more"), a table behind a chart | `fold.tsx`: `Fold` (native `details`), three looks with one chevron (ChevronDown, a half turn for its own fold only) and one spacing each: `panel` (boxed: a title and a line, the chevron at the end, the body under a rule with a panel's padding), `row` (the same line unboxed, inside a panel: Riot's tips) and `inline` (a line of small text, the chevron first, the body 6px under it); a `dense` panel spaces its summary 12px at the sides and 8px before the chevron (Matchup Intel's sources were its one use until 23 Nov 2026; none now); every summary a 44px row on touch screens (its own height, not an invisible area over its words), a row's or an inline fold's body 16px under it there (a panel's past its border and padding); `lazy` draws the body on first open | its summary (click, tap, Enter, Space) | its summary | none; SectionIndex opens a closed fold it links into |
| **Phone Fold** | a long section's details on a touch phone only (Profile Overview, since 20 Nov 2026: the primary pool's champions after the top three, the off roles, Ranked progress past its heading and current rank) | `phone-fold.tsx`: `PhoneFoldSection`, `PhoneFoldToggle`, `usePhoneFold`; the classes in `phone-fold-classes.ts` (`posture.ts`'s window posture as CSS, so the server's HTML is already folded) | its Show, All N or chevron (44px) | Hide, Top 3 or the chevron | none; an address with the section's `#id` opens it |
| **Record window** | everything about one record that is managed, not glanced at (Admin's person view) | `DetailModal` with `useAddressItem` (`person-view.tsx`) | a row of the list | ✕, Escape (focus back to the row), Back; ‹ › switch | `?person=`: the one history rule |

### The phone window shell (`preview-window.tsx`, `detail-modal.tsx`)

The window a Peek or a game opens in on a touch phone or in a short window (PLAN S4a, container 8;
UM.X2, X4; 20 Nov 2026):

- **A collapsing header.** Once the body scrolls, a whole-screen window's header collapses to a 56px
  bar (`modal-compact-bar`, the item's name: "Victory · Jax", a player's name) with the controls
  in place; at the top it opens again. Where the window scrolls as one (a small phone, FLOW_SHARE),
  the header scrolls away under the bar. It collapses only when the content would still scroll with
  it collapsed, so it never takes away the scroll that collapsed it. A plain title bar (Admin's
  person window, Champion Intel's All champions; Matchup Intel's picker and details until 23 Nov
  2026) collapses too (Release 10, 20 Nov 2026): its
  title on one line, cut short with an ellipsis where it would wrap (the whole title stays the
  window's name), its description for screen readers only, tighter padding; held sideways (a short
  window, which scrolls as one) it collapses on the window's own scroll. The 56px bar is 56px at
  every text size, its title on one line (in rem, with the title on a line of its own under the
  controls, it reached 224px of 568 at 320 and 200%). At 320 × 568, 375 × 667 and 568 × 320, at
  100, 150 and 200% text, 100px down, 400px down and at the end, every whole-screen window's frame
  takes at most a quarter of the screen (PLAN S2b; Admin's person window was 340px of 568 at 320
  and 200% after a scroll) (`e2e/overlay-kit.spec.ts`).
- **Its controls are 44px on touch screens at every text size** (`window-control.ts`,
  `WINDOW_CONTROL_TOUCH`): ‹ ›, ✕ and the actions beside them hold no text, so a larger text size
  gave them nothing to show; in rem they were 88px each at 200%, and the Peek's "Previous player"
  sat 9px off a 320px screen. Their icons still grow with the text. A custom header's cluster
  wraps rather than run past the screen's edge.
- **‹ › for the item's siblings** where the opener has siblings (`SiblingSteps`, the same buttons as
  the docked Peek's): a player's lineup; a game's list keeps its Previous · Game n of m · Next row.
- **Pull down to close.** A pull on the header (or the bar) closes every whole-screen window on a
  phone or in a short window, as a sheet closes; a touch anywhere else is the browser's own. The
  account screen is a screen, not a window over an item: nothing on it pulls. Unsaved edits still ask first (`canClose`).
- **The page never moves.** The browser's own close used to put the focus back on the opener itself
  and could scroll a row partly under the tab bar into view (70–109px when audited). Now nothing in
  the window holds the focus as it closes, and the focus returns with `preventScroll`. Nothing is
  scrolled back afterwards, so a scroll made on purpose as a window closes (a filter's Done bringing
  the list's start under the bars, a link to a section) stands.

### Select (`select.tsx`)

One dropdown for every toolbar and form (UD.X7, M1; since 20 Nov 2026). Until then 19 native
`<select>`s sat beside the app's own popovers, drawn by the system, and drawn differently again in
Safari.

- **By posture** (`posture.ts`, as every container): where previews open beside the list, the app's
  popover; in the phone posture (under 768px wide, or 480px tall or less) the browser's own select,
  whose wheel or sheet is what a phone's owner expects. The closed control looks the same either way
  (`selectClass`): the server draws the popover's button and a phone swaps it as the page hydrates.
  The native select draws the popover's chevron too (`select-chevron` in globals.css: lucide's
  ChevronDown, 16px, `fg-subtle`, 8px in, fixed in px at every text size, `appearance: none`), not the system's bold arrow (the
  design review's G2-6, 20 Nov 2026); the phone keeps its own picker.
- **Pattern:** WAI-ARIA's select-only combobox. The button is a `combobox` owning a `listbox`; the
  focus never leaves the button (the active option is `aria-activedescendant`), so it is on the
  button whenever the list closes. axe passes with the list open.
- **Keys:** ↑/↓, Home, End, Page Up/Down, type-ahead (half a second; typed while closed it chooses,
  as a native select does), Enter or Space to choose, Escape (the list alone: heard first and kept
  from a Peek, Refine's panel or the Filters window behind it), Tab.
- **Look:** `bg-elevated`, `border-border-strong`, `shadow-2xl`, `rounded-lg`; options 44px on a
  touch screen and 36px under a mouse, the chosen one marked with a check; groups under a quiet
  heading (an `<optgroup>`'s). A 160ms fade with a 2px slide away from the button (`popover-in`,
  `popover-in-up`); none with reduced motion. At 200% text the options grow and the list scrolls
  inside, within the screen.
- **Layer:** fixed to the screen right after its button (inside the window or panel that holds it),
  correcting for a containing block that moves (a window's opening motion).
- **Tests:** `e2e/select.ts` chooses an option in either form (`pick`, `optionsOf`, `valueOf`);
  `e2e/select.spec.ts` checks the component once; `webkit.spec.ts` checks it draws the same figures in
  WebKit (`SELECT_LOOK`); `select.test.ts` fails on any native select outside `select.tsx`.

### Conventions the design review settled (20 Nov 2026, Release 11)

The review compared desktop and phone against the benchmark pages; these held where the pages had drifted:

- **A control at rest is neutral.** Filters' sliders take the button's own colour (`fg-muted`,
  stepping up on hover), as the desktop's Refine; accent marks a narrowed list only, with its count
  (the folded toggle, the page toolbar's Filters, the top bar's). The camera badge on one's own
  picture is `bg-elevated` with a `border-strong` edge, accent only while the picture is pointed at
  or focused. A dropdown at rest carries `border-control` (Team Matches' "Played with" included).
- **One look per kind of control:** a choice of a few (Most games | Best | Worst in a champion's
  preview) is `segmentedGroupClass` and `segmentClass`, the chosen one semibold (ringed until
  Release 17; underlined since: §5, "Text-led controls").
- **One heading per profile tab:** Riot Accounts' title and lead line are its `SectionHeader`
  (20px, left to the tab on a phone), as All Champions and Season performance; the admin's person
  view keeps the panel's own header (`RiotAccountsPanel heading`).
- **Cells side by side start level** (`DataRow align="start"` where a grid row stretches them, as
  Season records); a table's figure columns are as wide as their headings (Multikills).
- **A pinned strip leaves with its item:** `UnfoldHeader`'s sticky wrapper is the strip's height
  (an empty block after it takes the room back), so it stops at the game's last pixel.
- **Sorted figures are strong where they are drawn:** a phone row of All Champions sorted by games
  sets its "15 games" semibold, as the desktop's Games column.
- **The Overview's profile band from xl** writes the off role ("Top (off)") and the rank's queue; under xl
  they are read out only, so the band stays one line.

### The one history rule (`address-item.ts`)

Opening pushes one entry, switching to another item replaces it, and closing goes Back when this
page pushed that entry, or when the entry before is the same address without the item (otherwise
it replaces the address without the item: a deep link). The second case is a page returned to by
Back after a link inside the open item left it (a person view's "See all in Audit Logs"): the
remounted page reads the entry before through the Navigation API (`entryBeforeIsWithout`), so
closing still goes Back and one more Back leaves the page; a browser without the API replaces, as
for a deep link (20 Nov 2026; `e2e/admin-people.spec.ts`). So Back
always closes what is open and never walks through the items seen, and Forward reopens the last
one. `useAddressItem(param, { initial, valid })` returns `{ id, open, close, toggle }`; `historyStep`
is the rule as a pure function (`peek.test.ts`).

### Pointer and posture (`posture.ts`)

Any window under 768px wide, where the page has the phone's frame (its top bar and tab bar), a touch
phone and a narrow window with a mouse alike, and any short window (480px tall or less, a phone held
sideways) open a preview as a sheet or a window of its own (`prefersWindow`, `useWindowPosture`);
every other screen gets the docked panel or the inline unfold. A window is above the phone's bars; a
docked panel or an inline game's pinned header and footer would sit under them. Until 20 Nov 2026 a
mouse got the docked and inline forms from 640px, and from 640 to 767px their ✕, ‹ › and Close were
under the bars (the Release 5 review; `e2e/reach.ts` checks 700 × 900 and 760 × 1000 with a mouse).

### Peek

```tsx
const peek = usePeek({ param: "player", ids, initial: searchParams.get("player") });
<li {...peek.rowProps(id)} className={PEEK_SELECTED_ROW}>…</li>
<Peek peek={peek} label="Player" title={player?.name ?? ""} itemKey={peek.id} hero={<Hero />} windowSize="standard">
  {player ? <PlayerContent player={player} /> : null}
</Peek>
```

- **Wider screens:** a panel docked at the right edge, `clamp(26rem, 34vw, 36rem)` wide (at most the
  screen), from under the tablet top bar to the bottom, over the page with a shadow and no dimming.
  The list stays live: another row switches the panel, ↑/↓ (J/K) move the selection, and the
  selected row takes `surface-3` and a 2px accent bar (`PEEK_SELECTED_ROW`). Only the panel's body
  scrolls, when its content is taller than the window, with `overscroll-behavior: contain`.
- **Touch phones and short windows:** the same content and address as a sheet (`DetailModal`,
  `size="sheet"`), its ‹ › in the header.
- **Keys:** Escape closes; ↑/↓ and J/K switch, except in a field, a menu, or under an open window.
- **Focus:** opened by a click or a tap the focus stays on the row and the panel is announced
  (a polite live region); opened with Enter it moves to the panel's heading. Escape and ✕ put it
  back on the row (`preventScroll`); the page never moves on open, switch or close.
- **Motion:** in, a 16px slide and fade over 200ms (`peek-in`, `--ease-emphasized`); a switch
  cross-fades the content over 120ms (`swap-in`); out, 140ms (`peek-out`). Instant with reduced
  motion.
- **Hero** (`hero`): the item's picture and name, edge to edge at the top of the panel's body; the
  panel's controls then sit over its top right corner and its heading is read, not shown. A hero
  drawn to clear a window's corner (`BELOW_CONTROLS`) clears only 2.5rem in the panel, and its
  minimum height (`--peek-hero-min`) is its content's: the Team player fits 1440 × 900 with no
  scrolling inside. `windowSize` and `windowHeader` give the phone's window its size and header.
- **First consumer:** the Team player (`?player=`), its ↑/↓ moving along the starters; a turned
  card opens its substitute.
- **All Champions' champion** (`?champion=&crole=[&vs=]`, `all-champions.tsx`, `champion-preview.tsx`,
  `champion-matchups.tsx`, `champion-roles.tsx`; the owner's request of 25 Nov 2026): no longer a
  Peek. From Release 16 it was the Peek's panel docked at the window's right edge, which lay over
  half the table; it is now a **master-detail pane beside the list**, in the page: the list narrows
  to `minmax(22.5rem, min(32%, 24rem))` (each champion's name, position icons and "In pool", its win
  rate over its games, under a heading row of the table's height that says "Sorted by KDA" when the
  order is a figure it no longer shows, so no row or name moves) and the pane takes the rest of the
  section. The page is the one thing that scrolls (the 25 Nov 2026 review): the pane has no scroll
  box; while it fits the window it is pinned under the section tabs, and taller it scrolls with the
  page, held between the tabs and the window's foot, its header (portrait, name, ‹ ›, a labelled
  Close) pinned under the tabs while it passes. It opens where the section has 47.5rem (from 768px
  wide, in a window taller than 480px); narrower, a short window and the phone's frame get the phone window shell's sheet with
  the same content and the same labelled Close in its header (`DetailModal`'s `closeLabel`, the shared `LABELLED_CLOSE`:
  outlined, "✕ Close", 44px on touch screens, as tall as the ‹ › beside it; a bare ✕ there until the review of 25 Nov 2026,
  the least prominent control in the header). Close, Escape, Back and the selected row again close it (an outside click does
  not: it is part of the page); ↑/↓ and J/K from the list and ‹ › move it; the address keeps the
  one history rule. Its content (docs/MATCHUPS.md): identity with mastery marked as all positions'; a
  segmented position choice that switches every figure and the opponents, each position with its
  games, win rate and record ("Top 22" over "50% · 11W 11L") where there are two or more (one
  position shows its name alone, the record being the figures right under it; its accessible name
  keeps the record); its kills and multikills on one line that wraps between items only ("0 penta"
  whole, each "·" ending its line); the position's figures as
  labels over numbers, no tiles; one table of every lane opponent (search, Most games / Highest /
  Lowest win rate, small samples quiet and ranked last); an opponent's detail beside the table from a
  38rem preview, one step in place of it below that. The list's position icons are 24px controls
  with a tooltip (hover after `HOVER_OPEN_MS`, keyboard focus; Escape closes it alone) with a mouse,
  and 14px marks on a touch screen, where the row stays the one 44px target and reads where it was
  tapped: a tap on a mark opens that position, elsewhere the most played (the tooltip's facts are
  the marks' screen-reader text and the position choice's own words). **On a desktop window it is a
  one-screen workspace** (the owner's request of 27 Nov 2026; docs/RESPONSIVE.md, "All Champions'
  workspace"): where the page used to scroll, the list, the opponents and an opponent's games are in
  pages of the rows that fit, the list's card and the pane fill the frame to the window's foot with
  their footers on one baseline (the one exception to "no card stretched to even out columns": a
  workspace's panes are the frame), the pane's summary is four bands (one identity bar, the positions
  for two or more, five figure cells, the kills line), the opponents are two columns of merged cells
  ("9 · 5W 4L") under one toolbar line, and an opponent's games open in place of the grid with
  ‹ 3 of 40 ›. Under 46 of the page's own rem the workspace takes its **short form** (`ws-short`,
  28 Nov 2026; under 48 where the section is narrow, 1356–1463px with the sidebar open, where the tall
  form's lines wrap; docs/RESPONSIVE.md, "the short form"), so every state fits down to 41rem: the totals
  ("29 games in all, 1 with no recorded position") become the identity bar's second line, and the
  figure cells become **the compact figure row**: one row of five cells, each label before its figure
  on one baseline and its sub under it ("Win rate 50% · KDA 3.22 · …"), the same cells, words and
  sizes, a 12px least gap with the spare room spread between them, each cell kept at its least width
  so long values add a line (the record's two groups, then the label) rather than overlap; the kills
  line and the coverage run as one text, the bands are 8px apart and the detail's controls 32px. The
  pane needs the opponents' two columns (a 64.75rem section); narrower (1280–1355px with the sidebar
  open), **the workspace window**: the pane's narrow form, `PreviewWindow size="workspace"` with
  `headless` (no title bar: P1 is its header, with ‹ › and the labelled Close), as tall as the screen
  less 1rem above and below and up to 56.25rem wide, the pane's surface (`bg-surface panel-depth`, its
  sheen, hairline and shadow, with no `shadow-2xl` beside it), its lists paged inside it,
  nothing scrolling; it keeps the window's focus trap, Escape (an opponent's games first: `canClose`
  hears what asked, so a click beside it closes it at once), Back and ‹ ›, and gives the focus back to
  the row of the champion it shows (`refocus`). Phones, tablets, short windows and large text keep the
  flow above.
- **Matchup Intel's abilities** (`?ability=Mordekaiser.Q`, `ability-peek.tsx`, 23 Nov 2026) were a
  consumer until Matchup Intel was retired the same day (Release 16).

### Explain (`InfoTip`)

- **Trigger:** an ⓘ (16px mark, 24px target, 44px on touch) with a specific `label` ("About KDA";
  required), or a term with a dotted underline (children).
- **Mouse:** opens once the pointer has rested on it for 150ms (`HOVER_OPEN_MS`), never by a window
  opening under a pointer at rest; the bubble takes the pointer, the 6px gap is bridged, and it closes
  100ms after the pointer has left both (`HOVER_CLOSE_MS`; WCAG 1.4.13).
- **Keyboard:** opens at once on focus; closes on blur. Escape closes the bubble alone.
- **Touch:** a tap opens it; any tap closes it (on the ⓘ, the bubble or elsewhere) and that tap does
  nothing else; scrolling closes it.
- **Placement:** above, else below, 8px inside the screen, never over its trigger; where neither side
  has room for the body-size bubble (large text on a small phone), the compact bubble (12px, up to
  18rem, the size before 25 Nov 2026; `tipStep`), and only where that has no room either, a small
  sheet at the screen's far edge with the same text. Never a bubble that scrolls.
- **Text:** one concept in plain words, one or two short sentences, at most about 25 words
  (`tip-length.test.ts`; STANDARDS, "Tooltips"), in the page's words, no needless maths or
  thresholds. Since 25 Nov 2026 the bubble's text is the body size (14px, `text-sm`; 12px before),
  in a bubble up to 20rem wide (18rem before), so a tip of 25 words keeps about four lines, wherever
  it fits beside its trigger (see Placement). Essential
  information is visible without it; a detailed breakdown is the shared breakdown popover, never a
  giant bubble. A tip on a text trigger (children) can wrap a badge or a chip, as the LP and
  the Best chip on a match card, Setup incomplete, Riot accounts' Main and Alt and "Changed since the
  check" do. (The experience label in the champion data panel and the data status's ⓘ open the shared
  breakdown on a press since the release's review, 25 Nov 2026: their texts held up to six concepts.)
- **Not a `title`:** a native title explains nothing (`title-use.test.ts`). It names an icon-only
  control or mark, or shows a cut value whole; anything else is an InfoTip, visible text or
  sr-only words.
- **Chart readouts** take the bubble's look: the rank chart's readout has the same border, corners,
  type and fade (`rank-timeline-chart.tsx`), beside the reading it describes.

### Breakdown popover (`BreakdownPopover`, 25 Nov 2026)

How a figure was worked out, one press from the figure itself: for what is too long for an InfoTip
(one concept, one or two sentences). The first is Leaderboards' multikill Score (docs/TEAM_LEADERBOARDS.md,
"The Score breakdown").

- **Trigger:** the figure itself, a `<button>` with a dotted underline (an InfoTip term's cue), named by
  the figure and what it opens ("Score 132: how it was worked out"), `aria-haspopup="dialog"` and
  `aria-expanded`; 44px on touch; the shared focus ring; above a row's own link (`relative z-[2]`).
- **Where:** on screens that open previews beside a list (posture.ts), the shared `Popover` beside the
  figure (`placement="side"`: before it, else after it, centred on it, up to the window's height), drawn
  at the page's end (a portal: a list row's `isolate` would otherwise keep it under the rows after it); a
  window under 768px wide, or a short one, gets a sheet (`DetailModal`, `size="sheet"`, the picker's width),
  whose body grows from its content (`flex-auto`, never `flex-1`: Safari 26).
- **No scrollbar of its own** at normal sizes: the beside form has the window's height to open whole; a
  phone's sheet scrolls as every sheet does.
- **Closes** on Escape (the focus back on the figure), a press outside, the focus leaving it, its ✕, or
  the figure leaving the screen. No address or history entry of its own.
- **The keyboard keeps the figure's place** (the Popover's `portaled`): drawn at the page's end, it is
  still read as if it came right after the figure. Tab past its last control closes it and goes on to
  what follows the figure; Shift+Tab out of it (from its first control or the panel itself) closes it
  with the focus back on the figure; Escape closes it wherever the focus is on the page (WCAG 2.4.3).
  The sheet keeps the focus inside until it closes, as every sheet does.
- **Content** drawn only while open, from the figure's own data (the breakdown never works the figure out
  again): plain sections with a heading each (no boxes inside boxes), the arithmetic in tabular numerals.
- **A status or a label as the trigger** (`bare`, 25 Nov 2026 review): the caller draws the trigger in the
  line's own size, with the same press, names and forms. The data status's ⓘ (`DataStatusNote`: the word
  as the heading, each part with its dot and why, the times, this visit's Refresh; "Data status: Partial
  data"; an InfoTip before, up to six concepts in a bubble) and the experience label in Riot data
  (`TierWhy`: the label as the heading, the tier's rule, then the estimate's notes; 44px on touch through
  `touch-target`, the table's rows keep their height). An ⓘ that opens a breakdown takes a press, not a
  hover: its pointer is the hand, not the help cursor of an InfoTip.

### Unfold

```tsx
const unfold = useUnfold({ param: "match", initial, valid: (id) => ids.includes(id) });
<button {...unfold.cardProps(id)}>…</button>
{unfold.id === id ? (
  <UnfoldRegion id={unfold.regionId(id)} label="Game details" header={<UnfoldHeader title="Victory · 31:20" onClose={unfold.close} />}>
    …
  </UnfoldRegion>
) : null}
```

- **One at a time.** Opening another keeps the pressed card where it was on screen: its top is noted
  before the change and the page scrolls by the difference before the next paint
  (`anchorCorrection`, in `useLayoutEffect`).
- **Close:** the card again, Escape, Back, or the compact header: it takes no room, and shows (the
  item's name and Close) pinned under the frame's bars once the item's top has scrolled under them,
  until the item leaves the screen. Closing from inside the item returns the focus to its card.
- **Height:** stable (no sub-tabs that change it, the content's part). It grows from nothing over
  200ms (`unfold-grow`, `0fr` to `1fr`) and its content fades in over 120ms; instant with reduced
  motion.
- **Touch phones and short windows** open the item as a window instead (`prefersWindow`), never
  inline.
- **Not a table's row.** All Champions' champion unfolded under its row from 23 Nov 2026 until
  Release 16, across the whole list; it pushed the rows below it down, so the owner asked for a
  compact detail beside the table instead: the Peek's docked panel, then (25 Nov 2026) a pane beside
  the narrowed list ("Peek", above, "All Champions' champion").

### Admin's pages, drawn as the benchmarks (the design review, 20 Nov 2026)

Release 9's design review (G4) measured Admin Mode against the benchmark pages; the confirmed findings
are fixed in one place each, and `e2e/design-parity.spec.ts` ("Admin's pages") and
`e2e/admin-people.spec.ts` measure them:

- **Header rhythm on phones:** an Admin page under a section row with no actions (`PageHeader admin
  sectionNamed`) shows nothing on a phone, so the whole header is read out only there and its stack
  margin goes with it: the content starts right under the bars (y 117 at 390 × 844, 133–137 before).
- **One column edge** (G4-2, superseded 23 Nov 2026): Settings in Admin Mode started at the Admin
  column's left edge (`*:ml-0`); it is now centred in it, as every narrower page is centred in the
  frame (above, *The shared frame*).
- **One depth:** every section, card and status list on a panel's surface has `panel-depth` and the
  panel radius (Branding's Name, Background visibility, Colours and image cards; StatusCards' list).
- **One fold inside a panel:** a fold inside a panel is a `row` Fold, never a box in a box (System
  Health's Technical details; Personal data's two). Accounts' "Profiles without an account" is a
  `row` fold drawn as its sibling groups' heading: the title on their line, the count quiet, the note small.
- **One state, one chip:** a verdict chip carries the status chips' icon (CheckCircle2 good, Clock
  needs work, AlertTriangle poor, CircleDashed no data).
- **Toolbar sizes:** a page-level action and a toolbar's buttons beside 14px segments are `md`
  Buttons (Add resource, Previews' Rotate and Reset, the person view's Save name); Rotate and Reset
  wrap together, and stack where one line cannot hold the two (320px at 200%).
- **Date fields:** the browser's own field and picker, its glyph drawn as a calendar in fg-subtle
  (`globals.css`); in an inline FilterBar the From and To labels show beside them from xl (`FilterField
  labelBeside`, in rem, so not at 150–200% text or on a phone held sideways, where they would push a
  field onto a row of its own), as the phone's sheet shows them above.
- **Grids that line up:** Access levels' base levels and its groups share one grid from xl, as many
  20rem columns as fit (three at 1440 × 900; fewer at a large text size, never a 181px tile); the
  image cards' hints keep two lines from md (`md:min-h-10`), so the three drop zones start on one line.
- **A wrapped index:** `SectionIndex clipLineDots` (Branding's phone index) never starts a line with a dot.

## 8. The app's frame: navigation

### Desktop sidebar (lg and up)

Two saved states, open (16rem) and collapsed to a 4.5rem rail. While collapsed, hover or keyboard
focus opens a temporary preview over the page. The choice is remembered in a cookie, so the server
renders the right width with no jump. Ctrl+\ toggles it. That behaviour is unchanged. A click on the
collapse control before the page's code has run is kept and applied once it runs (see "The
navigation contract").

**Zones.** Three zones, top to bottom, each separated by a hairline (`RAIL_DIVIDER`):

1. **Brand:**
   - the team's logo on a `brand-plate`, with the short name and the tagline (or "Admin mode")
     beside it;
   - the collapse control under it. It is quieter than the pages: `fg-subtle`, normal weight, and
     its Ctrl \ hint appears over the row's end only while the row is pointed at or focused.
2. **Pages:** My Profile, Team, Champion Intel and Resources in Player Mode (Team stands for its
   sections, the tabs at the top of its pages; Champion Intel, with the magnifier (Matchup Intel's
   place since 23 Nov 2026), and Resources, the Library, are one page each, with no tabs); Admin Mode's six sections. Folded
   to the rail, the four icons sit one 2.625rem step apart on its centre line, each named by its
   tooltip.
3. **Footer:**
   - the switch between the modes (administrators only), as a quiet row;
   - Install App;
   - the account, on a raised tile (the one surface in the footer: who you are);
   - the patch and Riot's notice.

**The centre line.** Every icon, the logo and the avatar sit on the rail's centre line, 2.25rem
from the edge, whatever the browser's text size:

- rows start 12px in, and their icon 15px in from there (`RAIL_ROW`);
- the logo centres in a rail-wide column (`SIDEBAR_RAIL_COLUMN`);
- the account's avatar sits 8px inside its tile.

Collapsed, each highlight becomes a 3rem square centred on its icon (`RAIL_HIGHLIGHT`). The
hairlines shrink to the same 3rem. `e2e/sidebar-motion.spec.ts` checks all of this to half a pixel.

**Rhythm.** The pages are one step apart (a 2.5rem row and a 2px gap). The brand zone and the
footer are set apart by more than a step and a hairline, so the logo has room. Before, the logo,
the control and the pages were one even column, and the logo sat 2px from the control's highlight.

**The current page.** It shows four signals, so it never relies on colour alone:

- a neutral lift (`bg-fg/8`) with a hairline of light on top;
- the brand gradient as a short bar at the row's edge, growing in from its centre;
- its icon in `accent`;
- its text in `fg`.

Nothing else in the frame is coloured at rest.

**Light.** The sidebar's still content layer wears `chrome-light`: the page's violet ambient light
continued into the frame behind the logo. Any uploaded logo, saturated tile or transparent mark
reads as set into the frame rather than pasted on a flat block.

**Shared rows.** `src/lib/sidebar.ts` holds the shared constants: `RAIL_ROW`, `RAIL_HIGHLIGHT`,
`RAIL_HOVER`, `RAIL_CURRENT`, `RAIL_ICON`, `RAIL_ICON_IDLE`, `RAIL_FADE` and `RAIL_DIVIDER`.

- Every row in the sidebar uses them: the pages (`nav-links.tsx`), the collapse control,
  Install App, the mode switch and the account button.
- They replace six hand-copied versions that had drifted: two hover colours (`bg-fg/5` and
  `bg-surface-2`), three fade strings, and borders on some rows only.
- A new sidebar row uses these constants and nothing else.

### Tablets and phones: frames by posture

Below `lg` the frame follows how the screen is held (MOBILE.md, "Frames by posture"; the owner's
decision of 8 Nov 2026, PR 2d), and exactly one `nav[aria-label=Primary]` is shown at a time. Every
posture shows the same destinations as the sidebar, in its order, with its names and icons
(navigation N1, 19 Nov 2026: `destinations()` in `src/lib/nav.ts`; `nav-parity.test.ts` holds the
bars to it): My Profile, Team, Champion Intel and Resources; in Admin Mode Dashboard, Users &
Permissions, Platform Settings and System. Each bar names them by one label ladder, by its own width
in rem: the whole names, then the short ones ("Profile", "Intel"; "Users", "Platform"; the rest of
each name read out only, `data-name="rest"`), then the icons alone with the names read out.

- **A phone held upright** (below `md`, taller than 480px): the top bar (a destination's tabs or a
  profile's sections as its 44px second row, `ChromeTabs`), the four-tab bar and the account screen,
  which holds the account's own items only (MOBILE.md).
- **A phone held sideways** (480px tall or less, below `lg`, whatever its width): one compact bar,
  44px plus the inset, with Back or the team's mark (in Admin Mode "Admin mode" beside it, in the
  accent, and in the mark's name), the four destinations (by the ladder, then only the current one
  named), the title where room is left, Filters and the avatar (the account screen); a destination's
  tabs or a profile's sections as its 44px second row; no bottom bar. It slides away while reading.
  The current destination is marked as the upright tab bar marks it, its icon in an accent pill and
  its name shown and in `fg` (`aria-current`), so a turn of the phone keeps the same signal.
- **A tablet** (`md` to `lg`, taller than 480px): the destinations in the top bar, one tap each, the
  current one marked with the sidebar's four signals (a neutral lift with a hairline of light, the
  brand gradient as a short bar at its foot, the icon in `accent`, the name in `fg`); the section tabs
  pinned in the page; the avatar menu (`AccountMenu`) with what the sidebar's footer holds on a
  desktop: Settings, Install App, the switch between the modes above Sign out, the patch and Riot's
  notice. There is no drawer.

They pick up the `chrome` ink automatically. On the account screen the mode switch is a row like the
others, above Sign out in a panel of their own, and in the avatar menu an item above Sign out; each
keeps the accent when it leads to Admin Mode.

With #216 (the navigation session; the full wording is in RESPONSIVE.md → Shell):

- **Pinned section tabs (tablets and desktops).** Team's, a profile's and Platform Settings'
  section tabs stay pinned at the top of the page once it has scrolled past them. They sit under
  the tablet's top bar (`--bar-top`) and at the window's edge beside the sidebar, 2.8125rem tall.
  - While pinned (`data-stuck`, set by `TabBar`), the row is frame, not content: the frame's ink
    (`chrome` at 90%) blurred like the phone top bar. At rest it is plain, part of the page, so
    "no blur on content" (§3) holds.
  - Anything pinned under it (All Champions' column headings) offsets by `--tabs-top`.
  - Nothing is pinned in a window under 481px tall.
  - **One composition at every width (PR 10, 18 Nov 2026; since 23 Nov 2026 at every window size,
    Team's four sections at `--content-wide` and every row centred with its pages: *The shared frame*
    below, which supersedes the 1600px threshold described here).** In a window from 1600px wide the pages
    of a tab set share one width (`SECTION_HUBS`' `width`): Team's four sections `--content-wide`
    (Players and Matches join Team Overview and Leaderboards there), Platform Settings'
    `--content-max`. From 1600px the bar's row of tabs takes it (`TabBar`'s `inner`,
    `ROW_WIDTH`), so where the pages stop growing and centre beside the sidebar (80rem pages from
    about 1650px with the sidebar open and from 1600px with it folded; Team's 100rem from about
    2370px and 1926px) the first tab still starts at the page's column, Team's name at the row's end
    ends where it ends, and the row never moves when you switch sections. Before, the row started at
    the room's edge: 74px left of Players at 1920 and 250px at 2560, 400 to 620px at 3440 (the
    sidebar open). In a window under 1600px every page and the row are as they always were, the
    sidebar open or folded (measured against main's build at 1280, 1366, 1440, 1536 and 1599: no
    difference; PR 2b's 44px dense tabs on touch screens from 1024px aside, below), so with the
    sidebar folded between 1417 and 1599px Players, Matches and Platform Settings still start up
    to about 79px inside the row (60px at 1536), as before. The
    line under the tabs and the pinned ink span the room beside the sidebar, as a frame does. A
    profile's tabs, and a section's views (`SubTabs`), sit inside their page's own column, so they
    always lined up. On Team Overview the column is Team's 100rem; the header and lineup keep
    their own 84rem, centred in it (its approved design), under a 1920px window, and from 1920px
    take the whole column (S2c, 19 Nov 2026), so the first tab, the logo and the first card share
    one left edge (before, the logo sat 38px inside at 1920 and 165px at 2560). Team
    Matches' filters and list take Team's whole column, centred with it (the owner's review of
    25 Nov 2026: at `--content-max`, left-aligned, the list ended about 200px left of centre on wide
    windows). A page's loading state takes the width `pageWidthOf` gives its address (a Team
    section's own; the ordinary 80rem elsewhere); Team Matches' own skeleton stands as its page
    does, its list across the column.
  - **One frame, one place for everything (S2c, 19 Nov 2026).**
    - *The shared frame* (`app-shell.tsx`, `FRAME`): one content column, at most `--content-wide`
      and centred in the room beside the sidebar, open or folded. A page narrower than it (80rem
      profiles, lists, documents, Settings, Admin) centres itself in it too, so it has the same margin
      on either side (the owner's review of 23 Nov 2026; until then it started at the frame's left
      edge, UD.X3, which with the sidebar folded left 351px spare on a profile's right at 1920 × 1080
      and none on its left). Pages of one width share one x; a set's tab row is its pages' width,
      centred as they are (`ROW_WIDTH`), and Team's four sections share `--content-wide` at every
      window size. Where the room is narrower than a page's width the page fills it (phones, tablets,
      laptops). `e2e/desktop-frame.spec.ts` measures the margins at 1440, 1920 and 2560, both ways.
    - *Settings* (UD.S2): from lg the title spans the frame, the account card is its first column.
    - *The profile's header is one band on every section* from `sm` (the `band` variant: a short
      window or 40rem and up): the Overview's card takes the band's layout (the picture, the name with
      its tagline, then the roles, rank, lineup status and links on one line, Customise at the end),
      the same height as the other sections', so the section tabs never move on a click (UD.PO1: 66px at 1280,
      86px at 2560 before). Release 17 (the Card Studio overhaul) made the band taller on desktops (lg) in
      windows taller than 480px: 6.5rem of content and a 5rem picture in a window 1000px tall or more,
      at most 120px around a 96px picture (117px at 1920 × 1080, 82 before; 122px at 2560 × 1440 and
      3440 × 1440, 95 and about 101 before), 5.25rem and a 72px picture in a shorter one, where the
      one-screen Overview leaves no more room (86px at 1440 × 900, 95px at 1920 × 950). The cap keeps
      Match History within its 1.35 screens on an ultrawide (1.353; 1.369 uncapped). Tablets keep the
      74px band (106px took Encounters on an iPad past one screen) and held sideways it stays the 80px
      band. The identity sits over a shade from the band's left edge (`CardArtLayer`'s `foot="band"`),
      and the artwork's position can be the header's own (docs/PLAYER_CARD_STUDIO.md, "Artwork position"). A phone held upright keeps the full card. Since the UX review of
      Release 13 the other sections draw that same band (`ProfileHeader`'s one `header`): the same
      labelled Customise, off roles, queue and social links, so nothing in the header changes on a
      click; only the picture's editor stays on the Overview, and an upright phone carries the other
      sections' header in its top bar.
    - *Skeletons in the page's shape* (`ui/skeleton.tsx`; UD.X4, P3): Players' rows (one, two or three
      across by the roster's width), All Champions' table, Match History's cards, Team's lineup
      (centred in the height as the lineup is: `data-fills-height`), Riot Accounts' panel (its title, lead, an
      account card and the Add button's row: `AccountsSkeleton`, 20 Nov 2026), and a profile opened from
      outside it as its band, tabs and section. Leaderboards and Team Matches had theirs.
    - *The 12px floor* (UD.X5): `text-2xs` is 12px on desktops (lg), 11px on phones and tablets,
      one token for every use (globals.css); uppercase labels keep 11px (the retired `label-caps` did too). The game cards of Match History and Team Matches
      took it in Release 11 after a measured pass at 1024, 1280, 1366, 1440, 1536, 1920 and 2560: no new wrap,
      the build whole, heights +1px at most. Where the card holds the build and the teams (a 61–70rem list,
      1366 and 1440 with the sidebar open) its columns stay 10px apart (16px from 70rem), which gives the
      teams the room 12px needs: cut roster names on the demo went from 146 to 26 at 1366 and 38 to 12 at
      1440 against the 11px cards. The one-line "With …" list of team members, already cut short with
      its full text as hover text, cuts one or two more at 1024 to 1366. `type-floor-later` has no place
      left in `design-tokens.test.ts`; `text-4xs`
      stays for letters inside small tiles (initials, the ⓘ glyph).
  - **One look at every width (S2c).** `e2e/design-parity.spec.ts` renders the shared components
    (stat label, Panel, DataRow, a badge, Button, the current section tab, InfoTip's bubble, Select)
    at 375 and at 1440 and compares their font family, size in rem, weight, letter spacing in em,
    colours, radius and border. Listed differences, the only ones allowed: the badge's size (the 12px
    floor on desktops), the stat label's size (since 25 Nov 2026 the sentence-case `label-text`, which
    takes the same floor: 11px on phones, 12px on desktops), and Select's size (16px on a touch screen, so iOS
    never zooms into the field; 14px with a mouse). Select compares the popover's button on the
    desktop with the browser's own select on the phone (§7, Select). Each later stage adds the components it creates.
    Since Release 11 (20 Nov 2026) a second test compares the components S5–S9 created, each opened
    as a member opens it: All Champions' preview (its pane, figures, an opponent, the foot line), the
    post-game view (an item and the loadout's name, a scoreboard K/D/A
    and name), Champion Intel (the champion's name, an ability's name, its Q's base cooldown and its
    cooldown at the haste; Matchup Intel's slots and tiles until 23 Nov 2026) and Admin's person view (the window, a section
    heading, the Riot accounts panel and a row). Its listed differences, each with its reason in the
    spec: the preview's surface, corners and edge (the Peek's docked panel on a desktop, beside
    the list; a sheet on a phone); the compact scoreboard's names (text-xs under a 30rem scoreboard); the person
    view's corners (DetailModal fills a phone's screen). Everything else is equal at 375 and 1440, in
    Chromium 153 and Chrome Headless Shell 156.
  - **A page's controls in reach (PR 2b, 18 Nov 2026).** Once the row is pinned and the page's own
    toolbar has gone up under it, the page's compact copy of its controls shows at the row's end
    (`PageToolbar`, `src/components/ui/page-toolbar.tsx`): Match History and Encounters
    [Games | Encounters] + [Filters · n]; Overview [Filters · n]; All Champions and Players
    [Search] + [Filters · n]; Team Matches [Filters · n] + [Bookmarked]; Leaderboards none (one
    page since 19 Nov 2026: no views, no filters). Back up at the toolbar the copy goes, and it is drawn only while it
    shows, so nothing hidden can be tabbed to. In use it stays: pressed or focused, while the sheet
    its Filters opened is open, and until that sheet has handed the focus back, so a change that
    shortens the page never leaves the focus with nowhere to return (`useHeld`). Never in a short
    window (nothing is pinned there). The row never grows: the controls are 32px with a mouse and 38px
    on touch screens (a 44px target), centred in the whole bar, the search 44px on touch screens with
    its 40px clear button, and from 1024px on touch screens the dense section tabs (Team's and
    Platform Settings') are 44px, not 40px, so the bar holds those targets and is the
    2.75rem `--tabs-top` assumes (with a mouse they stay 40px); where the row is narrower than 56rem
    (a tablet, a laptop with the sidebar open) they
    show their icons alone, named for screen readers, and Team's name at the row's end gives them its
    place. Their Filters opens the page's Filters sheet at every width, in its sheet form (labels
    shown, fields the sheet's width, a page's Refine fields in place, in one column behind More
    filters), while the toolbar in the page keeps its size; closed after a choice made in it, within
    8 s of the change arriving and before the reader scrolls, presses, types or steps Back, it brings
    the list's first item under the pinned stack; closed unchanged, or once the reader moves on,
    nothing later moves the page. Bookmarked keeps the place, as every filter does. The page's
    own toolbar is found by the page's filter bar (Match History's, Encounters'), or named by the page
    (All Champions' table search). The copy's Filters counts and names what the page's own bar narrows at its
    width (from md Encounters' Minimum games and Sort by are its list toolbar's, so the pinned row
    and the sheet there leave them out, as the inline bar does, following the width while open).
- **A tablet's avatar menu** (it replaced the drawer, which was a native `<dialog>`, when the
  destinations moved into the top bar): a menu, not a window. The focus goes to its first item, the
  arrow keys go round its items (Home and End to the first and last), Tab or a click outside closes
  it, Escape gives the focus back to the avatar; Install App closes it and opens its window, which
  gives the focus back to the avatar. Its notes (the patch, Riot's notice) are a group named by
  their words, holding one item, "Details: Riot Games notice". A change of page closes it (`Menu`'s
  `dismissKey`), and Forward never reopens it.
- **The installed app on a tablet.** It shows Back in the top bar, as phones do, because the
  installed app has no browser Back.

### The navigation contract

Every page follows the same rules, so moving around never needs thought (#266; each rule names its
test):

- **Three levels, each always in the same place.** Destinations: the sidebar (desktop), the top bar
  (tablet), the four-tab bar (a phone held upright) and the one compact bar (a phone held sideways,
  whatever its width), the same four in each, one tap each in every posture, one
  `nav[aria-label=Primary]` shown at a time. Sections: the section tabs, pinned once the page scrolls
  past them (tablet, desktop), the top bar's second row on a phone, either way round (Team's sections,
  Admin Mode's sets and a profile's: `ChromeTabs`, so the page does not repeat them on a phone). A page's own views and scope (its view
  switch, filters, search): in its header; once the header has scrolled away, still one press away:
  from md their compact copy at the pinned tabs' end (`PageToolbar`, above), on a phone either way
  round (where nothing pins sideways) Filters in the top bar, 44px with the count of narrowed
  filters, named "Filters:" and what is chosen (PR 2b). (`e2e/navigation-reach.spec.ts`,
  `e2e/mobile-nav.spec.ts`, `e2e/mobile-landscape.spec.ts`)
- **Where a page starts.** A page opened by a link or by code starts at its top
  (`ScrollOnNavigate`); Back and Forward restore the exact place (the browser and Next, untouched);
  a link to a `#fragment` lands on its target. A link that changes the address but keeps the place
  is marked `data-keep-scroll` (a profile's sections, which land at their own top themselves:
  `settleSectionTop`: on a phone just under the top bar that carries them, whenever the card had
  scrolled under it; from md under the pinned tabs, or under the top bar in a window too short for
  them to pin, whenever the reader was further down than the new section's own top; a section
  chosen with its top in view keeps the page still, never moving it down). A change of the query
  alone (a filter, a view) keeps the place: it is the same page. The next page of a list starts with
  its first item under the bars (Match History's pager). (`e2e/navigation-landings.spec.ts`; the
  sections' landing from md, `e2e/navigation-reach.spec.ts`)
- **A long page's own sections.** Where a phone's column makes a page several screens long, its
  sections are in-page links under its scope (`SectionIndex`, `ui/section-index.tsx`: Leaderboards'
  "Season records · Multikills · Milestones", the sections below Recent form, on a one-column page,
  under 59rem: phones held either way and tablets; Settings
  keeps its index in its account card: Name, Links and Password as a row of words on a phone and in
  a window 480px tall or less (chips until Release 17) and a list from md in a taller window, the
  section being read marked either way: semibold and underlined in the accent, as a view's tab is;
  the list's entries at the start of the card's column, each underline under its own words. The list
  marked it with a filled `surface-3` entry, the sidebar's look, until the Release 17 review: it is
  the page's table of contents, not the app's navigation, so the brief's §9 "no heavy filled
  selection box" covers it). Leaderboards' index under its header is plain words, 24px tall with a
  mouse and 44px on a touch screen, the link's own height (an invisible 44px area over a 24px link
  until the Release 17 review). At the page's top the first section is
  the one being read, at its end the last, and a section jumped to from the index stays marked while
  it is at the window's top (G3-5: a short first panel put the next one's top above the window's
  upper third). Each is
  a plain link to its section's anchor, so it works before the page's code has run; once it runs a
  click jumps through the router's history (`jumpToAnchor`): the
  section comes under the top bar, takes the focus, and the jump is an entry of the page's own where
  the browser has the Navigation API (the phone's Back steps past it, `backSteps`), else it replaces
  the entry. (`e2e/leaderboards-recent.spec.ts`; Safari's engine in `e2e/webkit.spec.ts`)
- **Back to the top.** On a phone, tapping the current tab on its own page goes back to the top
  (smooth; at once with reduced motion), and so does tapping the page's title once it has moved into
  the top bar; held sideways, where the section tabs do not pin, the current destination in the
  compact bar does, and the title where the bar has room for it (at least 6rem beside the
  destinations), at any width. A page under a tab (a teammate's profile under Players) still goes to
  the tab's page. The current section tab (Team's on tablets and desktops,
  Platform Settings' and a profile's everywhere, the phone's in the top bar included)
  and the frame's entry for the page shown (the sidebar's, a tablet's top bar's, the phone's account
  screen's row: Champion Intel's keeps its champion and haste) do the same, and keep the page as it is: its view and
  filters stay (the link's own address leaves the query out, and following it used to bring back
  the defaults, Leaderboards' season back to the current one). A click with a modifier key or another button still opens a new tab or window, and leaves
  this page alone (`src/lib/back-to-top.ts`; `e2e/navigation-landings.spec.ts`).
- **Back.** Phones and the installed app show their own Back, named after where it leads: the
  previous page when it is ours, else the page above (`phoneParent`). A full-screen game is a history
  entry (Back closes it); a profile's sections replace the entry (Back leaves the profile), and so
  does every filter (Team Matches', Leaderboards' season, Players' Archived, Ranked progress's queue
  and account, and a mode's other seasons included), so Back leaves the page instead of stepping back
  through each choice. A page's views (`SubTabs`: Match History's Games and Encounters) stay
  entries of their own, as each is a link with its own address. Champion Intel's champion and
  haste are the page's state, like a filter: a change replaces the entry, so Back leaves the page in
  one step (docs/CHAMPION_INTEL.md, "Address"; Matchup Intel's pairs were entries of their own where
  the browser has the Navigation API, which the top bar's Back went past: `backSteps`). An
  account without a player profile never starts at, or goes Back to, an empty Profile: its home is
  its first other page.
- **Overlays.** One sheet for every choice and editor (`DetailModal` `size="sheet"`, `Dialog` built
  on it): its choices in the body and its actions in the footer, which stays in view while only the
  body scrolls. What cannot be taken back with one click, or changes the site's setup, asks for a
  typed confirmation in that same sheet: the phrase or name above one field, the danger button
  enabled only when they match (any case), and the server checks the words again
  (`src/domain/typed-confirmation.ts`; docs/STANDARDS.md, Shared components). Where the header and footer would leave the body too little room for its tallest
  control (large text on a phone held sideways), the whole sheet scrolls as one instead, like a page,
  so nothing is ever cut short in a strip. Escape, the backdrop, Close and a pull down close the
  topmost one, focus returns to what opened it without scrolling, and the page behind never moves
  (MOBILE.md, "Every sheet and window"). Every window's body grows from its content (`flex-auto`,
  never `flex-1`): Safari 26 collapses a window as tall as its content to its header otherwise, as it
  did to the account menu on the owner's iPhone, and as WebKit 26.0 does to most sheets and to the
  compact and centred windows (MOBILE.md, "Why the account menu was a strip on iPhones"). The phone's account menu is a screen of its own instead of a sheet (`size="screen"`):
  full-width rows of at least 48px on a screen fixed to the phone's four edges. A window is in the
  browser's top layer, above the page and every z-index on it, with the rest of the page inert, so
  what must show over a window is drawn inside it (`src/components/ui/top-layer.ts`): an ⓘ's bubble
  inside the window its trigger sits in, where its trigger puts it, following the window while it
  moves; the toasts inside the topmost window at rest, in their usual place, where their buttons can
  be pressed (a moving window carries what is fixed inside it, so they go in once it has finished
  moving in and leave as it starts to close), each heard once by a screen reader. Escape on an open
  bubble closes the bubble alone, never the window; a bubble opens for a mouse as it moves over its
  ⓘ, never as a window opening brings the ⓘ under a pointer at rest (the pointer that pressed its
  opener), so that Escape closes the window (in WebKit an ⓘ scrolled under a still pointer does open,
  as a hover does); a move onto an ⓘ made while the page hydrates counts once the ⓘ has hydrated,
  the pointer resting on it. A picker's list inside a window (the Filters
  sheet's member and champion pickers) opens in the flow of
  the window's body, which stays its one scroller: no list scrolling inside it, nothing cut off at
  its edge; it fades in where it rests, and a press below it closes it on the press's click, so
  nothing moves under the finger first. (`e2e/popups.spec.ts`; Safari's engine in
  `e2e/webkit.spec.ts`)
- **Before the page's code has run.** Destinations are real links, and work at once. The frame's
  controls that code drives (the phone's avatar, the account menu's triggers on tablets and in the
  sidebar, the sidebar's collapse control) keep a tap made before it has run (`data-early`,
  `src/components/early-taps.ts`): they show pressed at once
  (`[data-early][aria-busy]`: the hover surface in an accent ring) and act once the code runs,
  exactly once. (`e2e/mobile-nav.spec.ts`, `e2e/sidebar-motion.spec.ts`)
- **The keyboard.** "Skip to content" is the first stop on every page and moves focus to the page
  (`main#content`); every control has the shared focus ring.

## 9. Brand assets (white label)

The installation's logo, colours and art come from Branding (Admin → Branding) and are never written
into a component (STANDARDS.md → Product).

- **Logo:** any square image. Where it sits in the frame or a hero, wrap it in `brand-plate`, or
  give it `ring-1 ring-border-strong` and a neutral shadow. Never give it a coloured glow: the
  logo brings its own colour.
- **No logo:** `BrandMark` draws the initial on a neutral tile lit faintly in violet, the same in
  the sidebar, the phone header, Team's hero and previews.
- **Custom colours:** derived tokens (`chrome`, `border-control`, the surface steps) follow
  `brandThemeVars`; contrast rules are in STANDARDS.md.

## 10. Known inconsistencies, not yet addressed

The audit of 6 Nov (desktop 1440, tablet 768, phone 390, with production's branding loaded into the
demo) found these outside the frame. They are recorded so the next session can take them on
deliberately. Each needs its own small PR. Check STATUS.md for the Actions-minutes budget first.

| Area | Finding | Direction |
|---|---|---|
| Hover on panels | About 50 controls use `hover:bg-surface-2`, a few `hover:bg-surface-2/70` or `bg-fg/5` | Converge on §5: surface steps on panels, fg overlays on the frame. `DataList` rows follow §5 already (`ROW_STATES`) |
| Page headers | Players, Matches and Resources open with `PageHeader`. Leaderboards (one page since 19 Nov 2026) opens with its title, member count and data status on one line (its own header: the line `PageHeader` would put under the title stands beside it, so the boards start one line higher); Settings (64rem, both modes) leads with its account card (`surface-lead`) beside or above its sections, its title over them | Intended by STANDARDS.md's three tiers |
| Eyebrows | `PageHeader`'s eyebrow is `accent`, in capitals; `SectionLabel` is a small sentence-case heading in `fg` since 25 Nov 2026 (an uppercase `fg-subtle` label before) | Keep `accent` eyebrows to Team Overview's header ("Team overview" in sentence case since 27 Nov 2026, the owner's decision D4; from `sm` in a window taller than 480px; on a phone held either way it is left to screen readers, since the selected tab says it), admin pages (`PageHeader`, in capitals: the mode's identity, the owner's decision O4) and the sign-in frames (`BrandFrame`, in capitals); every other label is sentence case |
| Tablet and phone mode switch | A row on the phone's account screen and an item of a tablet's avatar menu, each in the accent on the way to Admin Mode; a quiet row in the sidebar | Deliberate (§7). Revisit only with the owner, since phones were verified |

## 11. Working on the design

- **Ownership:** this page, `globals.css`'s tokens and utilities, `src/lib/sidebar.ts` and the
  frame components (`app-shell.tsx`, `collapsible-sidebar.tsx`, `nav-links.tsx`, `mode-switch.tsx`,
  `account-menu.tsx`, `brand-mark.tsx`) belong to the design system. A session changing them
  updates this page in the same PR.
  - `main` (`app-shell.tsx`) is the same block on every page but Team Overview: there, from `lg`,
    it is a flex column (`lg:has-[[data-testid=lineup-frame]]:flex lg:has-[[data-testid=lineup-frame]]:flex-col`),
    so the lineup's frame takes the height left under the section tabs and centres the header and
    the cards in it (October 2026; November's redesign anchored the lineup under the tabs instead,
    and the centring was restored at the owner's request on 17 Nov 2026). The lineup's layout is
    described in RESPONSIVE.md → Team Overview's lineup, and its own rules in `globals.css` where
    they matter: the art-wait rules in PERFORMANCE.md → Team Overview's first card, the cards' turn
    (`.flip-card`) in ARCHITECTURE.md → Substitute side of the Team cards. On a phone held upright
    the lineup is a carousel that loops (23 Nov 2026; ARCHITECTURE.md → The phone lineup carousel):
    the cards themselves are how the lineup is browsed, one across the width inside the page's
    gutter, with no row of the players over them; its one control of its own is the five position
    dots under the card (neutral `border-control` dots, the card in view a longer `accent` pill:
    shape and colour, never colour alone).
- **Validation:** `pnpm verify`, then `pnpm build && pnpm test:e2e`. The sidebar's geometry and
  motion are in `e2e/sidebar-motion.spec.ts` and `e2e/quality.spec.ts`; axe runs at three widths
  in `e2e/quality.spec.ts`.
- **Screenshots:** compare before and after at 1440, 768 and 390px. Use the demo with production's
  logo and background uploaded in Admin → Branding: the demo's defaults have no artwork, and most
  frame problems only show against art.
