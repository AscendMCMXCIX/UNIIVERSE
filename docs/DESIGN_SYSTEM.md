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
- **Matchup Intel** (the owner's request of 18 Nov 2026) is the single-screen reference, read in a
  glance on a second monitor: on a desktop its whole overview fits one viewport from 1920 × 1080 (a
  maximised 1920 × 950 window included: every page of the sweep of 19 Nov 2026), in two columns each as tall as its content, at
  `--content-wide`. Nothing in it is clipped or scrolls inside it, so a larger text size reflows and
  scrolls the page instead. Its danger and opportunity sides (a curated briefing's threat and
  opportunity, the assembled reference's Danger and Opportunity) take `warn` and `good`, as a 5%
  tint and in their label, always with an icon (a warning sign, a crosshair) and the word; facts are
  chips with their kind's icon and a word; what the dashboard leaves out is one step away (a chip's
  tip, a Details window, a fold), never cut (docs/MATCHUP_INTEL.md, "The dashboard").
- **Match History** is a finished, successful experience. Do not restyle it for novelty. Change it
  only for a bug, an accessibility fix or a product decision.
  - **The post-game view (the owner's directive of 19 Nov 2026, §5: the product decision this rule
    asks for).** An open game is one view without subtabs (`post-game.tsx`): the loadout as the
    client draws it (a 72px portrait with its level, spells and runes two by two, the six items two
    rows of three with the trinket beside the first, in inset slots), the rune page on one line with
    the stat shards where stored (icons only, neutral names, until OD7), six figure tiles with each of
    the player's figures once, the lane by role, the notes (docs/MATCH_NOTES.md: Went well, Went
    wrong, Focus next) and a compact scoreboard of 37px rows; the gold over the game and the build
    and skill order are folds. The open card folds into a 50px header with Previous, Next and Close,
    and a sticky footer repeats them. Notes use `good` for Went well and `warn` for Went wrong (never
    `red`, which means Defeat), `accent` for Focus next. The card's D8 density is unchanged.
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
| 2 | `surface-2` | rows and tiles inside panels, hovered rows on panels |
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
  now, like the page's ambient light, and the role bar's selected tab draws its blue edge as a
  ring, not a shadow. `design-tokens.test.ts` refuses `shadow-accent` (any opacity or variant), an
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

**Targets.** At least 24px everywhere and 44px on touch screens (STANDARDS.md).

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
| **Peek** | a quick look at one item from a list or a board (a team player, a champion, a game from a board) | `peek.tsx`: `usePeek`, `Peek` | a row (click, tap, Enter); ↑/↓ or J/K and ‹ › switch | ✕, Escape, Back, the selected row again; not an outside click | `?player=` (and so on) on the current page: the one history rule |
| **Unfold** | an item opened under its card, for items compared down a list (games) | `unfold.tsx`: `useUnfold`, `UnfoldRegion`, `UnfoldHeader` | the card | the card again, Escape, the pinned header's Close, Back | the one history rule |
| **Task dialog** | work that needs full attention (editors, confirmations, pickers, Card Studio, Install) | `detail-modal.tsx`: `DetailModal`; a filter sheet 34rem wide where it is a centred window (`sheetWidth="filters"`) | its button | Close, Escape, the backdrop | none |
| **Popover** | anchored choices (menus, filter dropdowns) | `menu.tsx` | click, Enter, Space | an outside click, Escape, a choice | none; a choice replaces the query |
| **Explain** | a short explanation beside a term | `info-tip.tsx`: `InfoTip` | hover, focus, tap | leaving, Escape, any tap | none |
| **Fold** | secondary content in a page | `disclosure.tsx` (native `details`) | its summary | its summary | none |

### The one history rule (`address-item.ts`)

Opening pushes one entry, switching to another item replaces it, and closing goes Back when this
page pushed that entry (otherwise it replaces the address without the item: a deep link). So Back
always closes what is open and never walks through the items seen, and Forward reopens the last
one. `useAddressItem(param, { initial, valid })` returns `{ id, open, close, toggle }`; `historyStep`
is the rule as a pure function (`peek.test.ts`).

### Pointer and posture (`posture.ts`)

A touch phone (a coarse pointer and a side under 768px), a window under 640px wide or a short window
(480px tall or less) opens a preview as a sheet or a window of its own (`prefersWindow`,
`useWindowPosture`); every other screen gets the docked panel or the inline unfold. Width alone does
not decide.

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
- **The in-card variant (All Champions, S5: `all-champions.tsx`, `champion-preview.tsx`):** where
  the list has 26rem or more beside its Win rate column on a pointer screen of 1024px or more, the
  preview unfolds inside the list's card instead of the docked panel. The columns after Win rate
  fold (`visibility: hidden` through `group-data-[folded=true]/card:invisible`, so no width
  changes), Champion, Games and Win rate keep their x, and the panel takes the folded space with the
  card's surface, a hairline `border-border-strong` at its left and the card's right radius. It is
  sticky under the pinned tabs and as tall as its content (`max-w-xl`); it slides 12px outward and
  fades in (`unfold-in`, 200ms, `--ease-emphasized`). With less room the page falls back to `Peek`
  (the docked panel, then the sheet by posture), with the same content and address
  (`?champion=&crole=[&vs=]`, two keys, so the page keeps its own address hook with the same
  history rule). Nothing is drawn until the room is measured after hydration, so a linked preview
  never appears in one place and moves to another.

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
- **Text:** one plain sentence, at most about 25 words (`tip-length.test.ts`; STANDARDS, "Tooltips").

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
2. **Pages:** My Profile, Team, Matchup Intel and Resources in Player Mode (Team stands for its
   sections, the tabs at the top of its pages; Matchup Intel, with the swords, and Resources, the
   Library, are one page each, with no tabs, since 18 Nov 2026); Admin Mode's six sections. Folded
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
bars to it): My Profile, Team, Matchup Intel and Resources; in Admin Mode Dashboard, Users &
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
  - **One composition at every width (PR 10, 18 Nov 2026).** In a window from 1600px wide the pages
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
    always lined up. On Team Overview the column is Team's 100rem and the header and lineup keep
    their own 84rem, centred in it (its approved design): the first tab starts at the column and the
    logo (column − 84rem)/2 further in, 38px at 1920, 165px at 2560 and 176px at 3440 with the
    sidebar open (before, 38, 208 and 576px from the first tab), 140px at 1920 with it folded. Team
    Matches' list keeps `--content-max` under Team's wider header, left-aligned, so a game's row is
    never longer than before. A page's loading state takes the width `pageWidthOf` gives its address
    (a Team section's own; the ordinary 80rem elsewhere); Team Matches' own skeleton stands as its
    page does, its list at `--content-max`.
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
  section being read marked either way). Each is
  a plain link to its section's anchor, so it works before the page's code has run; once it runs a
  click jumps through the router's history (`jumpToAnchor`, which Matchup Intel's chips share): the
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
  screen's row: Matchup Intel's keeps its pair) do the same, and keep the page as it is: its view and
  filters stay (the link's own address leaves the query out, and following it used to bring back
  the defaults, Leaderboards' season back to the current one). A click with a modifier key or another button still opens a new tab or window, and leaves
  this page alone (`src/lib/back-to-top.ts`; `e2e/navigation-landings.spec.ts`).
- **Back.** Phones and the installed app show their own Back, named after where it leads: the
  previous page when it is ours, else the page above (`phoneParent`). A full-screen game is a history
  entry (Back closes it); a profile's sections replace the entry (Back leaves the profile), and so
  does every filter (Team Matches', Leaderboards' season, Players' Archived, Ranked progress's queue
  and account, and a mode's other seasons included), so Back leaves the page instead of stepping back
  through each choice. A page's views (`SubTabs`: Match History's Games and Encounters) stay
  entries of their own, as each is a link with its own address, and so do Matchup Intel's pairs
  (each pair chosen, and a chip's jump to an ability) where the browser has the Navigation API: the
  browser's Back steps through them, and the top bar's Back, named after the page before Matchup
  Intel, goes past them (`backSteps`). Without it (Safari before 26.2, Firefox before 147) each
  pair replaces the entry, as a filter does, so both Backs leave the page in one step
  (`historyShowsEntries`; docs/MATCHUP_INTEL.md). An
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
    (`.flip-card`) in ARCHITECTURE.md → Substitute side of the Team cards.
- **Validation:** `pnpm verify`, then `pnpm build && pnpm test:e2e`. The sidebar's geometry and
  motion are in `e2e/sidebar-motion.spec.ts` and `e2e/quality.spec.ts`; axe runs at three widths
  in `e2e/quality.spec.ts`.
- **Screenshots:** compare before and after at 1440, 768 and 390px. Use the demo with production's
  logo and background uploaded in Admin → Branding: the demo's defaults have no artwork, and most
  frame problems only show against art.
