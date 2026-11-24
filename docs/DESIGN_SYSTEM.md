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
- **Champion Lookup** (the owner's request of 23 Nov 2026, in Matchup Intel's place) is the
  single-screen reference, read in a glance on a second monitor: one panel at `--content-max` with
  the champion, the haste choice and its five abilities, the ranks as columns where a row has room
  for them. Any champion at any haste fits one viewport at 1440 × 900 and 1920 × 1080; nothing in it
  is clipped or scrolls inside it, so a larger text size reflows and scrolls the page instead. Colour
  is kept for meaning: the cooldown at the chosen haste in the main weight with its label in
  `accent`, the base beside it quieter, the special cases in `fg-muted` words, never a state colour;
  Riot's descriptions one press away (Descriptions), never cut (docs/CHAMPION_LOOKUP.md).
- **Match History** is a finished, successful experience. Do not restyle it for novelty. Change it
  only for a bug, an accessibility fix or a product decision.
  - **The post-game view (the owner's directive of 19 Nov 2026, §5: the product decision this rule
    asks for).** An open game is one view without subtabs (`post-game.tsx`): the loadout as the
    client draws it (a 72px portrait with its level, spells and runes two by two, the six items two
    rows of three with the trinket beside the first, in inset slots), the rune page on one line with
    the stat shards where stored (icons only, neutral names, until OD7), six figure tiles with each of
    the player's figures once, the lane by role in a tile like the figures (against the lane opponent
    at 10:00, 15:00 and the end; a game whose timeline gives no 10:00 or 15:00 shows the end alone
    and one quiet line saying why, never columns of dashes) and a compact scoreboard of 37px rows;
    its patch by the public name (`publicPatchName`: "Patch 26.20"). The open card folds into a 50px
    header with Previous, Next and Close, and a sticky footer repeats them, one set at a time: while
    the card's own are on screen the footer keeps its place and shows nothing (Release 13's review,
    finding 10; Team → Matches' cards have no steps of their own, so their footer always shows). The card's D8
    density is unchanged. The written notes (Went well, Went wrong, Focus next) and the two folds
    (Gold over the game, Build and skill order) were removed from the view on 23 Nov 2026, at the
    owner's request (docs/MATCH_NOTES.md); the Production check asserts the notes and the gold curve
    stay gone. **Release 16 (the owner's request of 23 Nov 2026):** any of the ten players is
    inspected from the scoreboard (the row is its one button, its name still the player's link; the
    row inspected is `surface-3` with an inset accent ring and `aria-current`; ↑ ↓ move between the
    rows; never in the address, so Back still closes the game); above the lane, three segmented
    headings, **Build Path | Skill Order | Runes** (`segmentedGroupClass`, radios: the view still
    has no tabs), one shown at a time; each row ends with the player's performance score, its place
    as a chip (1st … 10th), the winning team's best as MVP (a violet chip) and the losing team's as ACE (a ringed one), never in the sides' blue and red,
    in words (docs/PERFORMANCE_SCORE.md); under the scoreboard the performance panel: the score, its
    place, "Excellent" from 8.0, the timeline's one trend word with its sentence and why in a
    sentence, each team's mean on one split bar and the ten scores as a strip of small tiles (a tile
    inspects its player), both in the scoreboard's order with each team in its side's colour and
    labelled with its side and result in words ("Blue · Defeat 5.5"), never a result told by the
    side colours; on a phone each scoreboard row is three lines (the name, K/D/A and score; the
    build and CS; the rank, whole) and under 16rem (200% text) everything in it stacks, so nothing
    runs past the screen at any width or text size; on a phone (its window held near two screens:
    2.15 for the demo's first game, the overlay kit's ceiling 2.21 since Release 16) the support
    figures and the score's why, tiles and chart sit behind one row fold each, the score itself, its
    place and the "Compare with" select staying in view; the score through the game (a line in the
    brand gradient, a second player dashed in `fg-muted` with a legend, 0–10 with 5 dashed, the end
    joined by a dotted segment, a table for screen readers) and a "Compare with" select. Stacked
    (under 60rem) a "Show …'s game" link under the scoreboard takes the reader up to the player
    inspected; nothing scrolls by itself.
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
    - **the wide card** (from 50rem), one row of about 100px, unchanged.
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
  - Encounters keeps its minimum and order in a phone's Filters sheet, as chips that count with
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
6.41:1 (was 6.18:1), fg-muted 9.68:1, and control edges 3.62:1 (was 3.49:1).

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
  indicator (with the gradient), a selected segment's ring, an active filter chip;
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
the accent or a state colour, so they keep their contrast on any surface and any Branding. Gold appears only on the first place's crown.

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
there (filling its 44px group), an ⓘ's touch area 44px (S2b, 20 Nov 2026: 38px and 40px before).

**Uppercase labels** keep one letter spacing, `tracking-label`, at every width: no width or container
variant may change it (`design-tokens.test.ts`; the Team card's WIN RATE was 0.44px on a laptop and
1.32px on a phone before S2b).

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
| **Peek** | a quick look at one item from a list or a board (a team player; a Players row or a Leaderboards member, `player-peek.tsx` since 20 Nov 2026, the row's name still the profile's link; a game from a board; a champion of All Champions, since Release 16) | `peek.tsx`: `usePeek`, `Peek` | a row (click, tap, Enter); ↑/↓ or J/K and ‹ › switch | ✕, Escape, Back, the selected row again; not an outside click, except where the panel is its row's contextual detail (`closeOnOutsidePress`: All Champions) | `?player=` (and so on) on the current page: the one history rule |
| **Unfold** | an item opened under its card, for items compared down a list (games) | `unfold.tsx`: `useUnfold`, `UnfoldRegion`, `UnfoldHeader` | the card | the card again, Escape, the pinned header's Close, Back | the one history rule |
| **Task dialog** | work that needs full attention (editors, confirmations, pickers, Card Studio, Install) | `dialog.tsx`: `Dialog` with its `size` (every one states it, `TASK_DIALOG_REM`): `form` 30rem for forms and confirmations (`ConfirmDialog`, the account and job confirmations, Change Riot ID, Position your picture), `picker` 42rem for a choice among many or an editor with a table (Access, an access level); Card Studio alone 76rem (`DetailModal size="wide"`); Install and sign-in 30rem (`compact`, `form`); the champion picker 42rem (`standard`). Phones and short windows: docked to the bottom edge, or the whole screen | its button | Close, Escape, the backdrop | none |
| **Phone window shell** | the window an item opens in on a touch phone or in a short window (a Peek's, a game's) | `preview-window.tsx`: `PreviewWindow` on `DetailModal` | the item | ✕, Escape, Back, a pull down on its header (or its bar) | the item's own (`?player=`, `?match=`) |
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
  person window, Champion Lookup's All champions; Matchup Intel's picker and details until 23 Nov
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
  preview) is `segmentedGroupClass` and `segmentClass`, the chosen one ringed and semibold.
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
- **All Champions' champion** (`?champion=&crole=[&vs=]`, `all-champions.tsx`, `champion-preview.tsx`;
  Release 16, the owner's request of 23 Nov 2026): a champion's detail is a compact panel docked
  beside its table, so the table never moves (until then it unfolded under its row and pushed the
  list down, with a tall list of opponents). Its content, the same in the panel and the phone's sheet:
  the portrait, role and record, four tiles of averages, a line of kills and the four multikills
  (the columns the panel lies over on a wide table), and the lane opponents as a dense table
  (Opponent, Games, Record, Win; Most games, Best, Worst; the first five with 3+ games, the rest one
  click away) whose opened opponent shows its games under its row in the same panel, never a second
  panel. Its tallest content (five opponents with 3+ games, both "more" toggles, an opponent open
  with its three newest games) fits without scrolling at 1440 × 900 and at 1920 × 950 (the owner's
  window, the sidebar folded); in a shorter window, such as 1280 × 800, its body is the panel's one
  scroll region, its header with ✕ and ‹ › staying in place.
  It also closes on a click outside it (`closeOnOutsidePress`: not on a row, which switches it, a
  link, a window or a popover; a click, so a touch that scrolls never closes it). ↑/↓ and J/K move it
  from the list (its own keys inside the panel stay its own); its address keeps the page's two-key
  hook with the one history rule, so Back closes it. Nothing is drawn until hydration has decided
  between the panel and the sheet.
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
  has room, a small sheet at the screen's far edge with the same text. Never a bubble that scrolls.
- **Text:** one plain sentence, at most about 25 words (`tip-length.test.ts`; STANDARDS, "Tooltips"),
  in the page's words. A tip on a text trigger (children) can wrap a badge or a chip, as the LP and
  the Best chip on a match card, Setup incomplete, Riot accounts' Main and Alt, the experience label
  in the champion data panel and "Changed since the check" do.
- **Not a `title`:** a native title explains nothing (`title-use.test.ts`). It names an icon-only
  control or mark, or shows a cut value whole; anything else is an InfoTip, visible text or
  sr-only words.
- **Chart readouts** take the bubble's look: the rank chart's readout has the same border, corners,
  type and fade (`rank-timeline-chart.tsx`), beside the reading it describes.

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
  compact detail beside the table instead: the Peek's docked panel (above, "Peek").

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
2. **Pages:** My Profile, Team, Champion Lookup and Resources in Player Mode (Team stands for its
   sections, the tabs at the top of its pages; Champion Lookup, with the magnifier (Matchup Intel's
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
bars to it): My Profile, Team, Champion Lookup and Resources; in Admin Mode Dashboard, Users &
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
    Matches' list keeps `--content-max` under Team's wider header, left-aligned, so a game's row is
    never longer than before. A page's loading state takes the width `pageWidthOf` gives its address
    (a Team section's own; the ordinary 80rem elsewhere); Team Matches' own skeleton stands as its
    page does, its list at `--content-max`.
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
      74px like the other sections', so the section tabs never move on a click (UD.PO1: 66px at 1280,
      86px at 2560 before). A phone held upright keeps the full card. Since the UX review of
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
      one token for every use (globals.css); uppercase labels (and `label-caps`) keep 11px. The game cards of Match History and Team Matches
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
    floor on desktops), and Select's size (16px on a touch screen, so iOS
    never zooms into the field; 14px with a mouse). Select compares the popover's button on the
    desktop with the browser's own select on the phone (§7, Select). Each later stage adds the components it creates.
    Since Release 11 (20 Nov 2026) a second test compares the components S5–S9 created, each opened
    as a member opens it: All Champions' preview (its panel, figures, an opponent, the foot line), the
    post-game view (an item and the loadout's name, a scoreboard K/D/A
    and name), Champion Lookup (the champion's name, an ability's name, its Q's base cooldown and its
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
  keeps its index in its account card: Name, Links and Password as chips on a phone and in a window
  480px tall or less (the approved plan's look there) and a list from md in a taller window, the
  section being read marked either way: a chosen chip on a phone, `surface-3` and semibold in the
  list, a step above the `surface-2` of a pointed-at entry). At the page's top the first section is
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
  screen's row: Champion Lookup's keeps its champion and haste) do the same, and keep the page as it is: its view and
  filters stay (the link's own address leaves the query out, and following it used to bring back
  the defaults, Leaderboards' season back to the current one). A click with a modifier key or another button still opens a new tab or window, and leaves
  this page alone (`src/lib/back-to-top.ts`; `e2e/navigation-landings.spec.ts`).
- **Back.** Phones and the installed app show their own Back, named after where it leads: the
  previous page when it is ours, else the page above (`phoneParent`). A full-screen game is a history
  entry (Back closes it); a profile's sections replace the entry (Back leaves the profile), and so
  does every filter (Team Matches', Leaderboards' season, Players' Archived, Ranked progress's queue
  and account, and a mode's other seasons included), so Back leaves the page instead of stepping back
  through each choice. A page's views (`SubTabs`: Match History's Games and Encounters) stay
  entries of their own, as each is a link with its own address. Champion Lookup's champion and
  haste are the page's state, like a filter: a change replaces the entry, so Back leaves the page in
  one step (docs/CHAMPION_LOOKUP.md, "Address"; Matchup Intel's pairs were entries of their own where
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
| Eyebrows | `PageHeader`'s eyebrow is `accent`; `SectionLabel` is `fg-subtle` | Both are valid. Keep `accent` eyebrows to Team Overview's header (from `sm` in a window taller than 480px; on a phone held either way it is left to screen readers, since the selected tab says it), admin pages (`PageHeader`) and the sign-in frames (`BrandFrame`) |
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
