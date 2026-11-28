# Standards

How UNIIVERSE is built, so every change looks, reads and behaves like the rest of the platform.
The visual identity, colour budget, interaction states and the app's frame are in
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
CLAUDE.md says how a change is developed, tested and merged; this page says what it should be.
Where a rule has an automated check, the check is named. Detailed rules live in the pages linked
from each section; this page does not repeat them.

## Product

- Improve the product that exists. No revived features (Draft, Meta & Trends, Patterns & Notes),
  no features added to make the platform look bigger, no promotional clutter.
- Player Mode and Admin Mode stay separate. Administrative pages live under `/admin` in the
  `(admin)` route group; the server enforces every permission (see Security below), the interface
  only follows.
- The public team page and sign-in stay minimal. There is no public sign-up; administrators
  create accounts. `/login` stays as the plain fallback.
- White label: UNIIVERSE is this installation's name, not the software's. Text a visitor reads
  comes from Branding (`getBranding`) or speaks of "the team"; never write the installation's
  name, logo or colours into a component.
- Seasons: filters offer the supported seasons only (`FIRST_SEASON` and `offeredSeasons` in
  `src/domain/season.ts`); older history stays stored but is not offered.
- Riot: keep the required notices and the rules in [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md). Riot
  data is for signed-in team members: the public pages show no Riot ID or match, and no rank,
  statistic or Leaderboards unless `UNIIVERSE_PUBLIC_RIOT_DATA=true`, which is meant only for a
  Production key registered for it.

## Honest data

- Never show an invented value. Missing is "—", nothing recorded is said in words ("No games
  this season"), and a figure states what it covers (a season, a queue, the games that have the
  figure). A sample too small to mean much says so. "Unranked" means a rank check found no
  placement: a player without a linked Riot account gets no rank line at all ("No Riot account"
  in its place on the Players rows; nothing on the first sign-in's card preview).
- Never present an uncertain identity or relationship as certain: what is only possible is
  labelled as possible (a match's possible groups, for example, never "premade").
- Two players' relationship is what the stored games record: against (opposite teams) or
  alongside (the same team), each with its own record and its own last game. Someone met both ways
  is listed under both, never folded into a third "mixed" kind; the All view shows the two records
  side by side, each with its word, not told apart by colour alone (`src/domain/encounters.ts`).
- Explanations sit next to the figure (`InfoTip`, `Metric` labels from `src/domain/metrics.ts`),
  in plain language. **Tooltips** (one behaviour, DESIGN_SYSTEM §7, "Explain"):
  - one concept in plain words for an ordinary League player, one or two short sentences: at most
    about 25 words, never more than 40, and no needless maths or thresholds (25 Nov 2026: "Arrows
    show only when the difference is clear", not the four gaps it takes)
    (`src/components/ui/tip-length.test.ts` counts every literal InfoTip text, `title` and `hint`,
    a state's `means`, the tip constants, the metric tips and each state of the LP tip; tips composed
    in JSX are counted by their component's own test, as the rank's in `ranked-progress.test.ts`; its
    allowlist is empty since S8b, and an entry needs its reason; `player-data-panel.test.ts` holds
    every tip the Riot data panel renders to 25 words). Essential information stays visible without
    the tip. A detailed breakdown is the shared breakdown popover
    (`src/components/ui/breakdown-popover.tsx`: Leaderboards' Score, the data status, the experience
    label's why), never a giant bubble or one that scrolls;
  - in the page's words, never the code's: no "PUUID", "Riot's API", "frame" for a minute of the
    timeline, "sync window", "Population:", "Source:" or "SELECT" in member-facing help (the same
    test). A source reads "from …"; a stored reading of a rank is a "rank check";
  - an ⓘ has a specific name (`label`, required: "About KDA"), never "More information";
  - a `title` only names an icon-only control or mark, or shows a truncated value whole: never the
    only copy of a fact (a phone, a keyboard and a disabled button never show it). A reason goes
    beside what it explains (a failed save's reason, why a button is locked); a figure's words for
    screen readers go in sr-only text (`StatTile`'s `detail`). `src/components/ui/title-use.test.ts`
    finds every `title` on an element or a component that hands it on, and passes a short literal
    name; every other one is listed there with what it names or shows whole (Admin Mode's are the
    administration stage's);
  - wording reads right on anyone's page: no "you/your" in a text a teammate's page shows too
    (neutral words, or `lib/tip-words.ts`, tested).
- How current a page's Riot data is goes in the same two places on every page, in the fixed words
  of `src/domain/data-status.ts`, never a banner: the status in a few quiet words ("Synced 5 min
  ago", or the state when it is short of up to date) with one ⓘ that opens the details in the
  shared breakdown (a press, not a hover: several parts are too much for a tip), beside the line
  that says what is counted (`DataStatusNote`); and Refresh at the end of the section's
  toolbar, after the filters, never on a row of its own (`RefreshButton`). `SectionHeader` places
  both; a panel puts Refresh in its header's actions. Figures and cards carry no status marks of
  their own. A Refresh does something real (it asks Riot now, then reads the page again from what
  is stored), shows which of the two is running beside the scope line, and says what happened,
  never "updated" for a click alone; a second press joins the run, and a press during the cooldown
  is answered without a request. Where nothing can be refreshed (no right to, no Riot account Riot
  can be asked about, no Riot on the server) the status stands alone, with no button that does
  nothing.

## Design tokens

All values live in `@theme` in [src/app/globals.css](../src/app/globals.css); components use the
Tailwind classes they generate. `src/app/design-tokens.test.ts` refuses font sizes in px,
arbitrary values that equal a token (`text-[0.6875rem]` is `text-2xs`), Tailwind's names for the
panel and card radii, colours written as hex in a class, easing curves that are not tokens,
uppercase labels spaced other than `tracking-label`, a size, weight, case or letter spacing beside
`label-text` (the sentence-case label, which sets its size and weight; Tailwind would drop the size
silently), the standing-alone
measure written as a number (`max-w-[72rem]`, `max-w-6xl`) instead of `max-w-[var(--measure)]`, a
safe-area padding (`pb-safe`, `pt-safe` and their `-N` forms) beside another padding for the same
edge, an arbitrary `max(…, env(safe-area-inset-…))` top or bottom padding that `pt-safe-N` or
`pb-safe-N` writes (RESPONSIVE.md → Safe areas), and the brand blue as a glow or shadow colour
(`shadow-accent`, a shadow made of `var(--color-accent)` or `shadow-(color:--color-accent)`: shadows
are neutral and violet carries the light, DESIGN_SYSTEM.md §4), and a text field whose 16px drops
below it from a breakpoint on every screen (`sm:text-sm`, `md:text-sm` beside `text-base` in a
field's classes: a field's smaller text is for a mouse only, `md:pointer-fine:text-sm`, as iOS zooms
the page into a focused field under 16px; RESPONSIVE.md → Primitives). SVG charts drawn 1:1 in px
keep their text in px, so it fits the chart's fixed gutters; the test lists them.

**Colour** (semantic, never raw values). The ground is a deep ink with a faint indigo undertone,
each surface one visible step lighter than the one below it. The identity is a pair: the brand
blue (`accent`) for what is selected or can be acted on, and violet (`accent-2`) for the light: the
page's ambient glow (`--ambient-light`, at the window's top edge and a low horizon, also over the
team's background artwork), and the **brand gradient** (`from-accent to-accent-2`) on a few chosen
marks only: the selected tab (`tabIndicatorClass`), the headline card's top edge, a chart's line. Violet also marks emphasis that is not a control (a "Primary role"
label). Beyond that colour is kept for meaning: the sides and results of a match, states. The light
stays at the edges: the ambient glow, the player's own card colours spilling from their banner
over the top of their profile, player cards' art. Dense content (tables, scoreboards, lists of
games) sits on opaque panels, never on a translucent panel over imagery; champion art inside a
list fades out before the figures (a pool row's left half).

| Token | Use |
| --- | --- |
| `bg`, `bg-elevated` | page background; fields, menus and popovers (a step above the panel they sit on) |
| `chrome` | the app's frame: sidebar, top bar and tab bar. The page's own ink, half a step up, so navigation recedes; colour in it marks only the current page (a neutral lift, the brand gradient as a thin bar, the icon in `accent`). The frame's zones, rows and states: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| `surface`, `surface-2`, `surface-3` | panels and cards; raised rows and tiles inside them; selected or hovered |
| `border`, `border-strong`, `border-control` | structure (dividers, panel and card edges); emphasis (a menu's or dialog's edge, a hovered row); the edge of a field, toolbar button, chip or switch (a segmented group has none since Release 17), 3:1 against the page, the panels and popovers (WCAG 1.4.11; Branding derives it from custom colours) |
| `fg`, `fg-muted`, `fg-subtle` | text in three tiers (25 Nov 2026): primary, secondary, tertiary (the mapping is under Type); 12.8:1, 9.2:1 and 6.2:1 or more on every surface, `surface-3` included, and Branding keeps `fg` and `fg-subtle` at 4.5:1 on a team's own colours |
| `fg-disabled` | the words and icons of a disabled control only (`disabled:` or `aria-disabled:` variants, or behind the code's disabled condition): 3.2:1, which WCAG 1.4.3 allows for inactive controls and axe skips; on anything else it fails AA (`src/app/type-hierarchy.test.ts`) |
| `accent`, `accent-strong`, `accent-2`, `highlight` | the brand: blue (`accent`) for controls and selected states, violet (`accent-2`) for light, emphasis and the second stop of the brand gradient (Branding can change them); selected states pair colour with a ring, weight or bar, never colour alone |
| `good`, `warn`, `bad`, `info` | states and outcomes; never the only signal (pair with text or an icon) |
| `blue`, `red` | the two sides of a match, and its result (Victory blue, Defeat red), always with the word |
| `gold`, `violet`, `bronze`, `bronze-fg` | rarities and places (third place in bronze); never to set one statistic apart from its neighbours: multikill counts are plain `fg` like every other figure |

**Primary-colour figures never replace semantic colours** (checked page by page in Release 19's visual review, 27 Nov 2026). A figure in
the primary tier (`fg`) is the default for what a reader compares; a semantic colour replaces it only where it carries its meaning, and
then always with its word: a game's result (Victory `blue`, Defeat `red`), a coloured win rate (`good` at or above 50% on enough games,
DESIGN_SYSTEM.md), the gold first place, MVP's gold and ACE's violet, a milestone's rarity, a ranked tier's colour. The brand `accent` is
never a figure's or a label's colour: it marks what can be acted on or is selected (links, tabs, the brand's marks). The one conflict
found, Match History's and Team Matches' multikill words in the accent beside a card's blue Victory, gold MVP and violet ACE (they read
as links and as one more state), is fixed: a double is `fg-muted`, a triple or quadra `fg`, a pentakill a small neutral tag
(`multikill-tag.tsx`). Two neutral exceptions are deliberate: Recent form and Leaderboards keep win rates plain `fg` (a ranking of recent
games, no colour for a cold streak), and Champion Intel's builds show a choice's pick rate as a qualifier of its win rate (`fg-muted`,
as a record under a win rate), the win rate being the figure compared.
| `tier-iron` … `tier-challenger` | a ranked tier written as small text (an opponent's "E2" in a match card); each 5:1 or more on the panels |

Rank crests keep their own artwork and fallback colours (`rank-emblem.tsx`, `tierTextClass` for the text tokens), as do social brands (`brand-icons.tsx`).

**Type.** Tailwind's scale from `text-xs` (12px) up, plus `text-2xs` (the smallest text:
chips, badges, captions, column headings, labels; 11px on phones and tablets, 12px on desktops: the
12px floor, globals.css; uppercase labels keep 11px), `text-4xs` (10px: letters inside small tiles,
such as initials or a count, never running text), `text-md` (15px: a list row's primary value) and
`text-figure` (28px: headline figures from `sm` up). Hierarchy comes from size and weight first:
a page's title, a section's title (`text-xl`), a panel's title (`text-base` semibold); a headline
figure, then a supporting figure a step smaller; a label in `fg-muted`, its metadata and
timestamps in `fg-subtle` at `text-xs`. Statistics a reader compares (a scoreboard's KDA, damage,
gold, CS and vision) are `text-xs` or larger. Sizes are rem, so they follow the reader's browser text size; the root size grows gently above
1536px wide (globals.css).

The text colour follows one rule (the owner's readability request, 25 Nov 2026), so the page is not
grey and not blindly white:

| Tier | Token | For | Never for |
| --- | --- | --- | --- |
| Primary | `text-fg` | names (players, champions, items, runes), headings and titles, every figure a reader reads or compares (KDA, win rate, CS, damage, games, scores, LP, ranks, cooldowns), every value in a table (the sorted column is marked by its arrow and semibold, not by greying the others), the selected or current item, field values | |
| Secondary | `text-fg-muted` | labels of figures and fields, column headings (`label-text`), a section's description and scope line, a figure that qualifies a primary one ("13W 7L" under a win rate), units, idle tabs, segments and navigation words, empty-state words | a figure on its own |
| Tertiary | `text-fg-subtle` | timestamps and "3h ago", queue and duration meta, separators, counts beside a tab or role (a zero too: it is not disabled), footnotes and coverage lines, placeholders, idle icons and chevrons, the ⓘ mark, `kbd` hints, "—" and "None yet", small-sample figures (with the words "small sample"), Riot's notice | a label over a figure; a figure that is not a small sample |
| Disabled | `text-fg-disabled` | a control that is disabled or `aria-disabled`, and its label: `disabled:text-fg-disabled disabled:cursor-not-allowed`, no hover; a filled button keeps a fill (the neutral `surface-2`), never half-transparent | anything that is not disabled (axe fails it); what explains a disabled control or reads its value (a switch's description, often why it is off; a slider's readout): `fg-subtle` while it is off |

Semantic colours stay as they are: good, warn, bad, info, the blue and red sides, accent, gold,
violet, bronze and the tier colours. `opacity` dims only a picture (a portrait out of the pool, an
avatar button, a native range input) and a busy part while a choice loads; never a control's
words, and never an alpha on a text colour (`text-fg-subtle/60` measured 3:1).

Labels and column headings are sentence case: `label-text` (globals.css: `text-2xs`, medium weight,
`fg-muted`; a colour may replace the grey, nothing else beside it), a part's heading inside a panel
`SectionLabel` (a small `fg` heading), a list's group heading `text-xs` medium `fg-muted` (as
`MenuLabel` and Select's groups). Capitals remain only where an approved design keeps them, each
listed with its reason in `src/app/type-hierarchy.test.ts`: Team Overview's backdrop lettering (the
team's short name as artwork; its card, player window, eyebrow, role chip and "You" badge went to
sentence case on 27 Nov 2026, the owner's decision D4), the Admin mode marker and the admin pages'
eyebrow (`PageHeader`) and the sign-in card's "PRIVATE" (the mode's identity, the owner's decision
O4), a member's own "wide" name style, and a round pill badge (`rounded-full`). Capitals typed into
the text itself ("PRIMARY RIOT ID *") are caught too: the same test refuses JSX text with a word of
four or more capitals, on a line of its own as well, and a string a JSX expression shows
(`{required ? "PASSWORD *" : …}`), outside the abbreviations (ARAM, HTTP, JPEG…) and its listed exceptions. Capitals use `tracking-label`. `label-caps` (the 11px uppercase label in
`tracking-label`) is retired: its utility left globals.css on 26 Nov 2026, once no page used it,
and `type-hierarchy.test.ts` refuses the class. The team's name as a
wordmark uses `tracking-wordmark`, and the Team page's backdrop name `tracking-tagline`. Numbers
that line up use `tabular-nums`.

**Space and shape.** Tailwind's 4px spacing scale. Radii: `rounded-sm` 4px (small controls),
`rounded-md` 6px (buttons, inputs), `rounded-lg` 10px (menus, chips), `rounded-panel` (panels),
`rounded-card` (cards, page sections, dialogs); not Tailwind's `rounded-xl` and `rounded-2xl`,
which are the same sizes under other names. Page widths: `--content-max` (text and card pages),
`--content-wide` (Team, statistics and data pages), and `--measure` (72rem: a board or table that
stands alone, as `max-w-[var(--measure)]`).

**Layers.** Inside a component: `z-0` to `z-10`. Pinned section tabs (`sticky-tabs`): `z-30`. Sticky bars (top bar, sidebar): `z-40`.
Pickers and popovers: `z-50`. Menus and toasts: `z-[60]`. Tooltips: `z-[100]`. Detail windows and
dialogs are native `<dialog>` elements in the browser's top layer, above everything: no z-index
lifts anything over an open window, so a tooltip's bubble and the toasts are drawn inside it while
it is open (`src/components/ui/top-layer.ts`), and a picker's list inside a window opens in the flow
of its body.

**Elevation.** Panels and cards sit slightly raised from the page: an opaque surface, a hairline
border and `panel-depth` (globals.css: a faint sheen along the top, a hairline of light on the top
edge, a soft shadow; `Panel` has it). The card a page leads with may use `panel-featured` instead
(the same depth with a faint wash of the violet light in its corner), or `surface-lead`, the one
card a page leads with (at most one a page: `panel-featured` plus the brand's line along its top
edge; Recent form's board). A card that opens something
can add `panel-lift` (it rises a pixel and its edge brightens while pointed at; no movement with
reduced motion). The frame has its own two: `chrome-light` (the sidebar's light) and `brand-plate`
(the logo set into it); see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). None of them makes a stacking context, so tooltips and menus inside keep their layer. What floats above
the page (a menu, picker or popover, a card being dragged) is `bg-bg-elevated`, lighter than the
panels, with a border and `shadow-2xl`. No blur filters on content.

**Density by context.** One system, not one look: the profile Overview is a compact dashboard
(several related cards on the first screen, the figures in a clear order of importance, no card
kept at a size its content does not fill); All Champions is a dense analytical table; Match
History is detailed and scannable, its cards dense by the owner's decision D8 (about 118px on a
phone, two rows on a tablet, one row from a 50rem list: DESIGN_SYSTEM.md §1); banners are
expressive; Settings and forms are plain and roomy. Empty or thin data shrinks a card rather than
leaving a frame to fill, and no card is stretched to even out a dashboard's columns (a Ranked
progress filled to the pools' end made a few LP look like a swing: the UX review of Release 13). The
Overview's 2×2 balances its columns with its own data instead: there Ranked progress heads the rail
and Recent form, under it, lists the champions of its games that fit above the window's bottom (one
to three by the window's height in the server's drawing, a row fewer than fits, then as many as fit
with a guard band of 1rem above the page's bottom padding: `RecentChampions`, `FitChampions`,
`FIT_GUARD_REM`; "and N more" on its heading's line), and a primary pool of more than six shows its
first five champions with a Show all on its heading's line (`PRIMARY_POOL_TOP`,
`PRIMARY_POOL_FOLD_OVER`); in the 2×2 a pool of six folds its sixth row the same way where six would
end within that guard band and five do not (`usePoolFit`, the owner's decision O1 of 26 Nov 2026),
and where the pools' column itself runs past the window (large text) the rail lists its champions down
to that column's end. At 1440 × 900, 1920 × 950 and 1920 × 1080 the whole Overview is on the first
screen with at least 12px to spare (Release 19: 1–4px had been left, and CI's slightly wider text
scrolled the page) for every member of the demo, with and without a second Riot account, sidebar open
and folded, and with text 1% wider (`e2e/home-layout.spec.ts`, `e2e/wide-text.ts`); at 1440 × 780 a
pool of four or more rows still runs past the window, which is reported rather than folded,
docs/TEAM_LEADERBOARDS.md, "One screen"); on small screens and at large text sizes readability wins
over the one screen. Leaderboards is one screen from a 59rem page too (docs/TEAM_LEADERBOARDS.md,
"One screen"): every board shows every row, the rankings' rows following the roster (40px for up to
seven players, 36px for nine), so a full roster of nine fits 1440 × 900, 1920 × 950 and 1920 × 1080.
All Champions is one screen on a desktop window too (the owner's request of 27 Nov 2026: its
one-screen workspace, docs/RESPONSIVE.md): at 1366 × 768, 1440 × 900, 1648 × 900 and 1920 × 1080,
the sidebar open and folded, with text 1% wider, the page never scrolls; its champions, lane opponents
and an opponent's games are in pages of the rows that fit (`useRowBudget`, `Pager`), and its two cards
fill the frame to the window's foot, their footers on one baseline (a workspace's panes are its frame,
the one exception to "no card stretched"). A shorter desktop window, down to a laptop's browser
window (41rem tall: 656px at 16px), keeps the workspace with fewer rows; under 46rem the workspace
takes its short form (the totals in the identity bar, the figures in one row, an 8px rhythm, the
page's 12px foot), and under 48rem where the section is narrow (1356–1463px with the sidebar open,
where the tall form's lines wrap), and every state fits, a champion of five positions with an opponent's games open
and every optional line drawn included, the 12px margin too. Where the section is too narrow for the
pane (1280–1355px with the sidebar open) the preview opens in the workspace window, paged inside it,
nothing scrolling. Phones, tablets, windows under 41rem and large text keep its scrolling page.

**A layout held to a measure keeps a margin** (Release 19, the owner's request of 26 Nov 2026). A test
that holds a layout to the window ("one screen", "fits", a row's height) asserts at least 12px of room,
measured above the page's own bottom padding, never only "no scroll"; and it runs once more with
`widenText` (`e2e/wide-text.ts`: every glyph 1% of its size wider, twice the difference of CI's
browser), so a layout that passes here passes there. A list fitted to the window keeps the guard band
itself (`fit-rows.tsx`), so its margin does not depend on the test. On every workspace page (All
Champions the first) the frame fills to `#content`'s bottom padding by construction, so the margin is
measured inside each card: **from a list's last row to its footer, at least 12px**, the paged list's
own guard band (`useRowBudget`). It holds everywhere the workspace applies, from 41rem tall and in a
workspace window, with the wider text too. `e2e/workspace.ts` holds the measure (`fits`, `MARGIN`),
for every page's spec and the platform's (`e2e/one-screen.spec.ts`).

**One screen on a desktop** (the owner's requirement of 28 Nov 2026; docs/RESPONSIVE.md, "One-screen
desktop pages"). On a desktop window, at normal zoom, every page a member or an admin works in is one
screen.

- **What it means:**
  - the document never scrolls, and no list or panel scrolls on its own;
  - nothing is clipped or hidden to make it fit (no `overflow: hidden` to conceal, no cut name);
  - no text goes below the 12px floor;
  - a long list shows the complete rows that fit and pages the rest, so a shorter window shows fewer
    rows, never smaller text;
  - a detail opens in place or in a window that fits, never growing the page.
- **Where:** the platform's gate (`ws`: a fine pointer, from 80rem wide, at least 41rem tall).
  Phones, tablets, touch screens and a larger text size keep their scrolling page, unchanged.
  Long-form reading pages (the privacy policy) keep their scroll.
- **How:** the shared modules (`ui/workspace.tsx`, `ui/paged-list.tsx`, `ui/paged-grid.tsx`,
  `ui/sectioned-workspace.tsx`), never a page's own copy.
- **Checked by:**
  - `src/app/design-tokens.test.ts`: no workspace class conceals or shrinks;
  - `e2e/one-screen.spec.ts`: each page at the owner's eight configurations and, where it fits there,
    the 1366 × 657 floor.

**Page layout.** One frame for every page, so pages differ by their content, not their scaffolding:
- **The shared frame** (S2c, `app-shell.tsx`): every page sits in one column, at most `--content-wide`
  and centred in the room beside the sidebar, open or folded; a narrower page centres itself in it
  too, so its content has the same margin on either side (the owner's review of 23 Nov 2026: until then
  a narrower page started at the frame's left edge, which with the sidebar folded left all the spare
  room on its right). Pages of one width share one x. A loading state takes its page's shape and
  centring (`ui/skeleton.tsx`), not generic panels.
- **Width:** `--content-max` for profiles, lists of cards, documents and forms; `--content-wide` for
  the grids that gain from more columns (Team Overview's lineup, Leaderboards). The pages of one tab set share one width at every window size, so its
  tabs, centred as the pages are, line up with each and never move between them (`SECTION_HUBS`'
  `width`, `PAGE_WIDTH` and `ROW_WIDTH` in `src/lib/nav.ts`): Team's four sections take
  `--content-wide` (Players and Matches since 23 Nov 2026; under a 1600px window they were 80rem). Team Matches' filters and list take that whole column too (since the owner's review of
  25 Nov 2026: at `--content-max`, left-aligned, the list ended about 200px left of centre at 1920
  folded, 2560 and 3440), so they start under the first tab and end under the team's name, centred
  with the sidebar open and folded (e2e/played-together.spec.ts). A board or table
  that stands alone on such a page (Recent form) stops at `--measure` (`max-w-[var(--measure)]`,
  72rem), left-aligned: one left edge with the header, never centred in the space. The page's
  padding comes from the app shell; a page adds none of its own.
- **Headings, in three tiers:**
  - a team or admin page opens with `PageHeader` (one `h1`, `text-2xl`, then its scope line);
  - a profile's `h1` is the player's name in its banner, and each section of it opens with
    `SectionHeader` (an `h2`, `text-xl`);
  - the two landing pages (Team Overview and a profile's Overview) have a larger hero title. They
    are the only exceptions.
- **Toolbars:** the filters first, then the page's own actions at the end (Refine, Refresh,
  Bookmarked), never on a row of their own. A page's toolbar sits under its scope line; a profile
  section's moves beside its title from `xl` (`SectionHeader`). Match History's (Games and
  Encounters) shares its views' row at every width where it fits (`toolbarBesideNav`, owner decision
  D8): on a phone from 320px the views, Filters and Refresh are one row (FilterBar's
  `compactToggle`: Filters its icon alone under 360px), and a narrowed filter's chips take the next
  row when they do not fit (`toolbarFills`; below `xl` an active refinement's always do, from the
  row's start, clear of the Refine panel that opens from the right). The scope line comes after
  the toolbar in the page as on screen, so the header is read and tabbed in the order drawn. On a
  long page its compact copy stays in reach once it has scrolled away (`PageToolbar` at the pinned
  tabs' end from md; Filters in the phone's top bar).
- **Density, by what the page is for:**
  - an analytical table has 2rem portraits and rows of about 48px wherever it is a table. Its
    figure columns are as wide as their heading needs and a little more (at least room for the sort
    arrow beside the heading, clear of the heading before it), and the name column takes the rest,
    so figures stay together on a wide screen. The name column never gets less than the name and the
    line under it need, each on one line (a role and "In pool"), so every row keeps one height at
    the table's narrowest. Where the table is wide enough for all its columns, the figures sit in
    groups, as they are read (All Champions from a 76rem list: the record, the play, the four
    multikills, mastery), with a clearly larger space before each group's first heading than inside
    a group. On phones the rows become compact pairs;
  - a list of games is one card per game, and a game opens under its card;
  - a dashboard's cards are as large as their content.

**Tables and rankings.** Columns of figures are right-aligned in `tabular-nums` under headings
that never wrap (`label-text`, `whitespace-nowrap`; the sort arrow sits outside the heading's
text, so a heading keeps its place when it is sorted). Every figure is primary text; the sorted
column is marked by its arrow and its heading and figures in semibold (25 Nov 2026: the unsorted
columns were grey before, which read as less important, not as unsorted); no gradient, glow or bar behind a figure unless the bar is
the figure itself: Recent form's record as 20 neutral segments, wins first (`QuietBar`), in the
text's own grey, never a state colour, and All Champions' share of the games, one continuous
`QuietBar` under each champion's games (its games over every game in the filters, said by a key
in the table's toolbar, and in words in the cell's title (the bar's name) and to screen readers; a share is never
written "0%" or "100%" when it is neither). Win rates take their colour only from `winRateTone`
(`src/domain/stats/win-rate.ts`), except on Recent form, which stays neutral; below the minimum
games they stay grey and say "small sample", and a sort by win rate ranks established records
before small samples. A ranking gives equal values the same place, written "2=" (titled and read
out "Tied for 2nd"), and the tied rows are joined by a bracket in the place column. On phones a
table becomes compact rows: the one or two figures that matter most at the right, the others as
labelled pairs underneath (`dl`) or one line under the name, every figure still there; the pair
the list is sorted by comes first, in semibold. With a large text size, where the row's list is
narrower than 17rem, the figures at the right go under the name instead, so no name is squeezed
out.

**Windows.** A detail window (`DetailModal`) is as tall as its content, up to the screen: no
empty band under a short window. Its header holds who or what it is about and the actions that
belong to them (Full profile, OP.GG beside the name), then a summary, then the detail.

**Motion.** Short and purposeful: entrances 160 to 220ms with `--ease-emphasized`, exits about
140ms with ease-in, the sidebar with `--ease-glide`, the Team card's turn (460ms) with
`--ease-turn`. Script-driven animations use the same curves. Everything becomes instant for
`prefers-reduced-motion` (globals.css); decorative effects stop entirely.

## Components

Use the shared component before writing a new one (`src/components/ui`):

| Need | Use |
| --- | --- |
| Page title, eyebrow, actions | `PageHeader` |
| A titled section | `Panel`, `PanelHeader`, `PanelBody`, `SectionLabel` |
| A figure with its label and explanation | `Metric`, `MetricLabel`, `InfoTip` |
| A game in a list of games (Match History, Team → Matches) | Opens under its card: `MatchExpansion` (`match-history/inline-match.tsx`), one game at a time, `?match=` in the address by the one history rule (`ui/address-item.ts`): the first open adds one history entry, at every width, so Back closes the game; another game replaces it; closing goes Back when the list added it. The match window is only for where a list cannot open it in place (inside another window, a preview such as All Champions', or a link to a game not on the page), and under 768px and in short windows (`ui/posture.ts`), where the game is a window of its own with the same entry, so Back closes it ([MOBILE.md](MOBILE.md)) |
| A record opened from a list (a player met in Encounters) | The page that already lists its data, filtered to it, with a way back (Encounters opens a player's games in Match History: `match-history/encounter-games.tsx`), never a second window that repeats that page |
| Details over the page (a match, a player, a champion) | `DetailModal` (the standard size fits its content up to the screen's height); a custom `header` keeps clear of the close button's corner with `CLEAR_OF_CONTROLS` (content beside it) or `BELOW_CONTROLS` (content that starts under it), never a fixed padding |
| A question or a short form | `Dialog`, `ConfirmDialog` |
| An action that cannot be taken back with one click, or changes the site's setup (Admin's setup and repair jobs, a job's schedule turned off, deleting with a profile, a profile without an account, erasure) | A typed confirmation: a `Dialog` whose danger button stays disabled until the phrase or name above its field is typed, `typedMatches` (`src/domain/typed-confirmation.ts`: letter case, outer and repeated spaces do not count), and the server action checks the same words again, so a request without the page is refused too. Never for an ordinary edit, which autosaves |
| Choices in a list | `Menu`, `MenuItem`, `MenuLink` |
| Filters | `FilterBar`, `RefineButton`, `FilterField`, `SearchInput`, `ToggleChip` (a segment since Release 17: one role of a few). On phones the bar folds to a Filters button that opens a sheet, with what is narrowed as removable chips beside it (`chips`). A bar with several filters keeps to one row inline with `compact` (a narrower search to start from, Reset as its icon below `xl`). A profile section's bar (Season performance, All Champions, Match History: `OverviewFilters`) is one row from md: the active refinements as chips (the phone's pill and words, `FILTER_CHIP`), then season, game mode and Refine joined as one group (shared edges, no gaps), then Reset; never a second row of chips under it (23 Nov 2026). One bar a page; once it has scrolled away its sheet also opens from the frame (the pinned row's `FiltersControl`, the phone's top bar), at any width in its sheet form (`useInFilterSheet`, `InFilterSheet` for fields the page draws itself, as Refine's) |
| A long page's controls kept in reach | `PageToolbar` (`ui/page-toolbar.tsx`): the page's compact controls, shown at the pinned section tabs' end once its own toolbar has scrolled away: `SubTabs size="compact"`, `FiltersControl`, a `SearchInput` with `COMPACT_SEARCH`, `ToolbarChip` for a page's own action. `land` names the list's first item for the sheet closed after a change; `fallback` for a shared part's own (OverviewFilters' Filters), outranked by the page's |
| One choice out of a few that filters what a page shows (a role, a side, a sort) | `segmentedGroupClass` with `segmentClass` (`size: "md"` for a list's main filter, as Encounters' All, Against and Alongside), `RoleSegmented` (`compactBelow="xl"`: icons only for the roles not chosen on tablets and laptops, in a crowded toolbar). Never to move between views or pages |
| A page's sections (primary) | `TabBar`: a profile's Overview, All Champions, Match History and Riot Accounts; Team's sections. On tablets and desktops the bar stays pinned at the top of the page once it scrolls (`sticky`; [RESPONSIVE.md](RESPONSIVE.md) → Shell). A bar wider than the pages under it (`SectionTabs`, a child of `main`) gives its row their width, centred as they are (`inner`, `ROW_WIDTH`), so its first tab starts at their column. Admin Mode's Users & Permissions, Platform Settings and System use the same bar. On phones every one of these rides in the top bar as its second row (`ChromeTabs`: a destination's tabs from `SECTION_HUBS`, a profile's through `ProfileTabs variant="chrome"`) |
| Equal views of one section, or related pages (secondary) | `SubTabs` (`ui/sub-tabs.tsx`): links with `aria-current`, directly under the primary tabs, in the section title's place (`SectionHeader`'s `nav`): Match History's Games and Encounters. `size="compact"` for their copy in the pinned row (`PageToolbar`; its test ids prefixed with `toolbar-`). Separate pages are sections, not views: Users & Permissions' pages use `TabBar` (since 19 Nov 2026) |
| Views inside one panel (a champion's views; a game has none since the post-game view of 19 Nov 2026) | `role="tablist"` buttons with `tabIndicatorClass` |
| Tabs that filter one list | none: a `FilterBar` (Audit Logs retired `TabLinks`, its last use, in the overhaul's S9) |
| Buttons and links that look like buttons | `Button`, `buttonClass` (links never wrap buttons) |
| Fields | `Input`, `Textarea`, `Select`, `Label`, `Switch` |
| A section that opens and closes, or the rest of a list | `Fold` (`ui/fold.tsx`: `panel`, `row` or `inline`); never a `details` of its own |
| A list in a one-screen workspace that would grow past the window (All Champions' champions, lane opponents, an opponent's games) | Pages of the rows that fit: `useRowBudget` (`ui/fit-rows.tsx`), `usePagedList` and `slotPages` (`ui/row-budget.ts`), and the shared `Pager` (`ui/pager.tsx`, `layout="inline"` in a card's footer; Match History's `layout="stacked"`); never a list that scrolls on its own |
| A table that can be wider than the screen | `ScrollRegion` with a `label`: the keyboard can focus and scroll it, and screen readers name it |
| A status or a tag | `Badge` |
| Nothing to show | `EmptyState`: the default `block` (a dashed panel of its own, `compact` for less padding), `variant="row"` in place of a group of rows inside a `DataList`, `variant="inline"` as one line of running text (a `<p>`: phrasing content only) |
| Loading | `Skeleton`, `PageSkeleton` (route `loading.tsx`; `width` from `pageWidthOf`: a Team section's own width, else 80rem) |
| Saving | `SaveStatusIndicator`, `toast` |
| Images from Riot or another host | `RemoteImage`, `useImageFailure`, `ChampionPortrait`, `Avatar` |
| A time ago that stays current | `RelativeTime`, `useNow` |
| How current a page's Riot data is, and Refresh | `DataStatusNote` beside the scope line, `RefreshButton` at the toolbar's end (`usePlayerRefresh` in `refresh-store.ts` behind every Refresh of a player, `usePlayerRefreshState` for what only shows it); `compact` where it shares a phone's row with a section's views (Match History: its icon alone below `sm`, a 44px square, its name kept for screen readers) |
| A line of figures over a list (Match History's summary of its newest games) | `StatStrip`, `StatLine` and `StatTile` (`ui/stat-strip.tsx`): by the strip's own width, its lines one under the other on a phone (a figure's value and label on one baseline; `valueClassName` lets a value fill its line), one flowing line from 36rem, one row of tiles (the value over an 11px caption, a `labelFirst` caption over its value, hairlines between) from 60rem, and with `wideLine` one text line from 78rem where the figures fit. Each tile in the order it is drawn. Test it with the widest real values, not only the demo's |
| A section of Riot data's heading: title, scope line and status, a toolbar of filters ending in Refresh | `SectionHeader` |
| A button in a toolbar beside the filters (Refine, Refresh) | `toolbarButtonClass` (`filter-bar.tsx`) |
| A player's identity on a card (picture and links, name, rank and labels, tagline) | `CardIdentity` (`players/player-card.tsx`) inside a `@container/card` |
| A member's name in a list row (Players, Leaderboards) | `CardAvatar` and `CardName` (`players/card-look.tsx`) under the card's colour variables (`cardColourVars` on the row), so the saved name style, emblem and avatar frame follow the member off their card; `CardTagline lines={1}` where a row has room for the tagline. No frame or effect on a row; Players' rows may carry a faint strip of the member's art (below). One exception: in a season record's cell under 36rem (a phone, the two columns of cells on a tablet and at 1440, the column beside Recent form at 1920 × 1080 with the sidebar open) Leaderboards' season records show a record's holder by name alone (`CardName`, in their colours), the row's picture being the champion's (`MemberCell`'s `avatarClassName`) |
| A player on Players (one row of the roster, every width) | `RosterRow` (`players/roster-row.tsx`) in the roster's one panel: picture, name and status, then role, rank and the pool counted to fit (`PoolPreview fit="count" size="xs"`); one link over the row, the social icons (`CardSocialIcons size="row"`) above it; what shows follows the row's own width (`@container/row`). From tablets up, `RowArtStrip` (`players/card-art.tsx`): the player's banner or skin tile at 20% opacity, at rest and while pointed at, behind the picture and name only, faded out by 60% of its width so the rank and pool never sit on art; never on phones |
| A champion pool's rows (first choice marked, win rate, games, KDA, CS) | `PoolChampionTile` under `PoolColumnNames` (`players/player-card.tsx`) |
| A ranked list or board of rows (Leaderboards' Recent form, season records, multikills and milestones) | `DataList` (`ui/data-list.tsx`): one surface (`surface="lead"` for the card a page leads with), the column template per tier as `--dl-cols`, a title row when the board names itself (`title`: every Leaderboards board, `BoardTitle`: its heading, an ⓘ and a note saying what it counts), headings (`DataHead`, aria-hidden) and groups (`DataGroup`, with a caption) split by one hairline each. The board's own width picks each row's layout (`@container/list`: under 36rem, from 36rem, from 58rem, and any width a board needs, such as the multikills' 21rem), so a fact is one element placed per tier, never a phone copy and a column copy. A board of cells that each measure themselves (Leaderboards' season records, a grid of one or two columns) gives each cell its own `@container/list` and column template, its row `DataRow as="div"` inside the cell's li, in `BOARD_PANEL` |
| One row of a `DataList` | `DataRow`: its cells in reading order (place, link, member, figures), its height per tier (`density`: 36, 40, 48, 52 or 64px; slim and compact are 44px on a touch screen), your own row's wash and bar, and the hover and pressed states only when it links. One `RowLink` per row covers it (a whole-row target at every width, named by the member's name); a control that must keep its own press sits above it with `ROW_CONTROL`. The row's explanations go in its RowLink's `hint`, an aria-hidden layer over the link that carries the title: a title on the li becomes the list item's accessible name, and one on the link its description |
| A long page's own sections, on a phone | `SectionIndex` (`ui/section-index.tsx`): a line of in-page links under the page's scope (Leaderboards': "Season records · Multikills · Milestones", the sections below Recent form); each jump brings its section under the bars and focuses it, an entry the phone's Back steps past (`jumpToAnchor`). Quiet text, never a view switch (`SubTabs`) or a filter. Settings keeps its index in its account card, drawn as chips on a phone and in a window 480px tall or less (`chipClass`: the approved plan's look there, in-page links all the same) and as a list from md in a taller window, the section being read marked: the optional `spy`, `listClassName`, `linkClassName` and `separatorClassName` |
| A place in a ranking | `Place`: "4=" said and titled "Tied for 4th", with a bracket segment per row (`tieRuns` from the ranking's places); first place in gold (`leader`; no crown since 25 Nov 2026); "–" said "Provisional" without a place |
| A figure in a row, and a member in a row | `FigureCell` (tabular, never cut, its own words for screen readers: "13 wins, 7 losses"); `MemberCell` (`CardAvatar` and `CardName` in the member's colours, "You"; the name hidden from screen readers when the row's link says it) |
| A bar that is the figure itself (Recent form's record, All Champions' share of the games) | `QuietBar` (`ui/quiet-bar.tsx`): a count in segments (wins first; a window's missing games outlined) or a continuous share, in neutral `fg` overlays; the inset 2px line at a row's foot on narrow boards; no motion on first paint |
| Both teams of a game | `TeamComposition` (`match-history/team-composition.tsx`); `keepNames` where the line-ups are what the card is for (Team → Matches), so phones keep the names too |
| Two players' relationship in recorded games (against, alongside) | `RelationTag` (`match-history/encounters-view.tsx`): the word with the side's colour |
| Bookmarking a game from a dense card | `BookmarkButton` with `iconOnly` (a 44px target on touch screens, its label kept for screen readers) |

## Dates and numbers

Write them only through [src/lib/format.ts](../src/lib/format.ts): one form ("21 Oct 2026, 9:30
am") in the installation's time zone (`NEXT_PUBLIC_UNIIVERSE_TIME_ZONE`, Sydney by default), the
same on the server and in every browser. Counts use `formatCount`, decimals `formatNumber`, a
count in a tight space `formatCompactCount` ("45K"), and a place in words `formatOrdinal` ("4th",
"Tied for 11th"). A relative time in a client component uses
`RelativeTime`, which updates after hydration. An ESLint rule refuses `toLocaleString`,
`toLocaleDateString`, `toLocaleTimeString` and the `Intl` formatters in pages and components;
`src/lib/format.test.ts` proves it fires.

## Images

Every image from another host has a designed stand-in (initials, a tier dot, a plain tile) and
never shows a broken-image glyph: use `RemoteImage` or `useImageFailure`, which also catch images
that fail before the page is interactive. A missing picture and a failed one never look alike: a
Riot item, spell or rune icon (`IconImg`) is a plain tile where the slot is empty and the icon's
initials, named in its title, where its image failed. Give images their width and height, load
below-the-fold ones lazily, and keep uploaded brand images small ([HOSTING_USAGE.md](HOSTING_USAGE.md)).

## Responsive and accessible

- Layouts follow [RESPONSIVE.md](RESPONSIVE.md): Tailwind's breakpoints, the `short:` variant for
  phones held sideways, safe areas, nothing wider than the screen from 320px up. Phones have their
  own frame and patterns ([MOBILE.md](MOBILE.md)): the bottom tab bar, a top bar with Back and the
  page's title (held sideways, one compact bar holding the destinations instead), filters in a
  sheet, lists as rows, games opened over the whole screen; a tablet has its destinations in the
  top bar (MOBILE.md, "Frames by posture").
- A layout chosen from the room a box has never changes that room. Where scrollbars take room
  (classic scrollbars: Windows, Linux, a Mac set to always show them), the page's own scrollbar
  narrows every box while the page scrolls, and what the layout holds decides whether it does: a
  choice made from a box's width near its bound (a container query, a measure) takes turns with the
  scrollbar it brings (All Champions' pane and sheet, every 140ms or so, until 28 Nov 2026). Choose
  from the box's width with the page's scrollbar given back, the same whether or not the page
  scrolls, and where the page may scroll ask for the bound with the scrollbar in the box
  (`paneFits`); once the page decides, the CSS draws what it decided (one decision, never two that
  can disagree). Not a reserved gutter (`scrollbar-gutter: stable` on one page shifts it between pages
  and changes `100vw`, so the root's clamp) and not a choice held from history (the same window then
  gets different layouts). Test it with the browser's scrollbars shown
  (`ignoreDefaultArgs: ["--hide-scrollbars"]`, as `e2e/all-champions-workspace.spec.ts` and
  `e2e/section-tabs-scrollbar.spec.ts` do: Playwright hides them by default).
- Targets are at least 24px everywhere and 44px on touch screens (`pointer-coarse:`,
  `touch-target`, `Button` does it).
- Focus: every element the keyboard reaches shows the same accent ring (`:focus-visible` in
  globals.css); a control never removes it unless it marks focus another way (a text field's accent
  border). `e2e/quality.spec.ts` tabs through pages and checks.
- WCAG 2.2 AA: visible focus, text contrast of 4.5:1 (3:1 for large text and controls), labels on
  every control (an icon button has `aria-label`), headings in order, no meaning by colour alone,
  motion that respects reduced motion. Links inside running text are underlined.
- A link's or button's accessible name starts with its visible words (WCAG 2.5.3): an
  `aria-label` that adds detail keeps them first ("Edit on profile: Demo Mid's champions").
  - An `aria-label` replaces everything the control shows, and axe and speech control compare it
    with the text on screen, even text hidden from screen readers.
  - So a control that shows a lot (a game card, a portrait whose letters stand in for it) is named
    by its content, plus hidden words where needed (`<span className="sr-only">`), not by
    `aria-label`.
  - A lettered stand-in for a picture is named like the picture (`ChampionPortrait`).
- A name (`aria-label`, `aria-labelledby`) only on an element whose role may be named: never on a
  `div`, `span` or `p` with no role (axe's aria-prohibited-attr; screen readers drop the name).
  `src/app/aria-naming.test.ts` refuses it.
  - A loading placeholder is a polite status (`role="status"`) whose sr-only text says what loads
    ("Loading the notes"), its pulsing shapes hidden; `e2e/match-breakdown.spec.ts` runs axe with a
    game's notes held back (#323: the notes' placeholder failed the Production check's axe).
  - A row of things with a name is `role="group"`; a mark that means something ("—" for not counted
    yet) is hidden, with its meaning in sr-only text beside it.
- A state that follows an element through an IntersectionObserver (a pinned bar, a header gone
  under the frame) reads the callback's newest entry: a late callback carries every change since
  the last, oldest first (#323: the pinned row stayed marked at rest).
  `src/components/ui/observer-entries.test.ts` refuses `([entry]) =>`, `entries[0]` and
  `const [entry] = entries`.
- Axe runs on every player and admin page at desktop and phone width, on a teammate's profile, and
  in the Team player and champion windows (`e2e/quality.spec.ts`).
- Valid nesting: no block inside a paragraph, no link inside a link or button. The browser
  rearranges such markup and the page fails to hydrate.

## Performance

- Targets on a phone: LCP 2.5s or less, INP 200ms or less, CLS 0.1 or less. How to measure:
  [PERFORMANCE.md](PERFORMANCE.md).
- Server components by default; a client component only for interaction. Heavy parts load when
  opened (`next/dynamic`, `AfterOpen`).
- Browser code never reaches server code, and large libraries load only when needed.
  `src/app/client-imports.test.ts` follows every `"use client"` module through its imports and its
  `import()` calls. It fails when one reaches Node's built-ins, the database, image or session
  libraries, or `src/server` (other than server actions and the shared modules it lists). It also
  fails when one imports `zod` directly instead of through `import()`, unless the
  module is listed with its reason.
- Nothing moves after it appears: reserve space for images and late content, and read browser-only
  state (local storage, the window size) without changing the height of what is already shown.
- Database reads select only the columns they use, above all on paths every page runs (the shell,
  the scheduler): the hosting plan's egress is limited ([HOSTING_USAGE.md](HOSTING_USAGE.md)).

## Security and privacy

- Every server action establishes who is asking before it does anything else (`requirePermission`,
  `requireSession`, ..., or `getSession` followed at once by a refusal when there is none).
  `src/server/actions/guards.test.ts` reads every `"use server"` module and fails for an action
  whose first asynchronous step is anything else; the few public ones (signing in, setup,
  recovery) are listed there with what protects them. Hiding a control is never the protection.
- Every member and admin page calls `requirePageAccess` itself (signed in, setup finished, and
  the permission). A layout's check does not protect its pages: Next.js renders a layout and its
  page at the same time, so a page without its own check still runs and its data is sent in the
  response even when the layout redirects. `src/app/page-guards.test.ts` fails for a page under
  `(app)` or `(admin)` that does not call it; pages that only redirect, and the "no access" page,
  are listed there with the reason.
- No secrets in URLs, logs, error messages or reports. Job endpoints take the secret in the
  `Authorization` header only. An action shows a caught error through `publicErrorMessage`
  (`src/server/errors.ts`): database and driver errors, which carry SQL text and values, become a
  plain sentence and are logged without their parameters.
- An address a visitor supplies is never followed as it is: a return path after signing in goes
  through `safeReturnPath` (`src/lib/return-path.ts`), and Riot requests only go to hosts built from
  a known routing value (`RiotApiClient`).
- Sign-in, setup and recovery count an attempt before checking it (`claimAttempt`,
  `src/server/auth/throttle.ts`), so parallel requests get no more tries than sequential ones.
- Database changes follow [DATABASE_PERMISSIONS.md](DATABASE_PERMISSIONS.md): grants in the
  migration that creates the table, Row Level Security on, no grants to the Data API roles
  (`src/server/db/migration-grants.test.ts`). Nothing destructive without a tested recovery path
  and the owner's approval.
- Personal data stays with the team: what is stored and for how long is on the privacy page; a
  social icon appears only when its owner switched on its Show publicly switch.
- Browser storage (`localStorage`, `sessionStorage`, IndexedDB) holds per-viewer conveniences only
  (layout choices, recent picks, favourites), never personal data read or typed in the app.
- Code that stores Riot identities (match records, sync, linking an account) honours
  the erasure records (`erasureFilter`, `src/server/privacy/ledger.ts`), and log lines name
  accounts by id, never by Riot ID (`docs/PRIVACY.md`).

## Tests

- Pure logic: unit tests next to the code (`*.test.ts`, run by `pnpm verify`).
- Database and server logic: `tests/db`, against PGlite and real Postgres (CLAUDE.md).
- Pages: Playwright in `e2e/`, on a phone, a tablet and a desktop. Every browser test fails on an
  uncaught page error, hydration mismatches included (`e2e/test.ts`).
  `e2e/cross-device.spec.ts` covers another time zone and language, unreachable image hosts,
  invalid nesting, cut-off figures and target sizes; `e2e/quality.spec.ts` runs axe.
- A fix comes with the test that would have caught it.
- Locally, run the tests for what changed. CI runs every test on each ready pull request and is the
  full-suite gate (CLAUDE.md §2, since 28 Nov 2026). How much review a change gets depends on its
  risk (CLAUDE.md §8).
- A test passes in any year (16 Nov 2026). It fixes its own dates and passes them as `now`, and
  where the code it calls reads the clock itself it pins it (`vi.useFakeTimers({ toFake: ["Date"] })`
  and `vi.setSystemTime`), or it works out the dates it expects.
  - Seasons: on the offline fixture's static data the current season is the calendar year's, so a
    database test whose games are Season 2026's makes a Season 2026 patch current
    (`makeSeason2026Current`, `tests/db/helpers.ts`).
  - Browser tests: the demo is seeded in the current season, dated back from when it starts, so a
    test takes the season from `/api/health` (`e2e/demo-season.ts`) and checks a date against the
    demo's own dates, never against a year.
  - To check, move `Date` for a whole run with a temporary setup file that calls
    `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime`, never the machine's clock.
    Vitest 4 has no `--setupFiles` flag: a temporary config that adds `setupFiles` to
    `vitest.config.mts` goes in `--config`. Use PGlite for the database suite (no
    `TEST_DATABASE_URL`): its `now()` follows the faked clock, while PostgreSQL's stays on today. Run
    the same at today's date as well: a few tests fail under any faked clock, because rows written
    a moment apart get the same time.
  - What stays tied to the date is the app's ranked years (`src/domain/ranked-year.ts`: 2026, and
    2027 since Release 19, its first day an estimate until Riot publishes it). Each account's year
    ends at its own reset reading, not at a date (docs/RANKED_PROGRESS.md, "The 2027 ranked year"),
    so Ranked progress names its season and draws its readings in 2027 too, and Match History's LP
    marks are worked out for games on any ranked year's patches (16.x and 17.x,
    `rankedYearOfPatch`). The browser tests that depended on it take the year from the page
    (`e2e/progress.spec.ts`: the tracking line's year, which the record's must equal, a ranked year
    the app knows) or name none (`e2e/match-lp.spec.ts`, `e2e/webkit.spec.ts`'s LP dash). A year
    after 2027 needs its entry in `RANKED_YEARS` before its first day, or each account stays on
    2027's ladder until it does (the tests at fixed clocks in `src/domain/rank-timeline.test.ts`,
    `src/components/players/ranked-progress.test.ts` and `tests/db/rank-audit-2027.test.ts` show
    how the boundary behaves).
