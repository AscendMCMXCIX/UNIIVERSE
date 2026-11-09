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
  - an expressive banner or hero (Team Overview's is its five splash-art player cards under a
    one-row team header, filling the first screen with the bench of substitutes under them);
  - a compact first screen of opaque panels in a clear order of importance;
  - a single `panel-featured` lead card;
  - quiet labels and strong figures.
- **Match History** is a finished, successful experience. Do not restyle it for novelty. Change it
  only for a bug, an accessibility fix or a product decision.

## 2. Principles

1. **Content leads, the frame recedes.** Navigation is the page's own ink, half a step lighter. In
   the frame, colour marks only where you are.
2. **One coloured mark per region.** In a group of controls, only the selected or current item is
   in the brand colour. Everything else is neutral until it is pointed at.
3. **Opaque surfaces for data.** Tables, scoreboards and lists sit on panels, never on
   translucency over art.
4. **Light at the edges.** The ambient glow, banners and card art may glow. Panels holding figures
   do not.
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
| 0.5 | `chrome` (+ `chrome-light` on the sidebar) | the app's frame: sidebar, top bar, drawer, tab bar |
| 1 | `surface` + `panel-depth` | panels and cards; `panel-featured` for the one card a page leads with |
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
- as a **glow or shadow colour**. Team Overview's selected card had `shadow-accent/15` and its
  lineup stood on a floor lit in the brand blue (a radial glow, a hairline and the team's name as a
  watermark); the card's shadow is now a neutral `shadow-black/40`, and the floor gave way to the
  bench of substitutes (November 2026). The sign-in and setup frame's card (`BrandFrame`) glowed in
  the brand blue too; it is lit in violet now, like the page's ambient light, and the role bar's
  selected tab draws its blue edge as a ring, not a shadow. `design-tokens.test.ts` refuses
  `shadow-accent` (any opacity or variant), an arbitrary shadow made of `var(--color-accent)` and
  the shorthand `shadow-(color:--color-accent)`; `shadow-accent-2`, violet, stays allowed.
- as the **colour of the logo's stand-in** (`BrandMark` without an upload). That is now a neutral
  tile lit faintly in violet, with the letter in `fg`.

Violet (`accent-2`) carries the light: the ambient glow, `panel-featured`, `chrome-light`, the
gradient's second stop and emphasis that is not a control.

## 5. Interaction states

There are two families, by what the control sits on.

| On | Rest | Hover | Pressed or open | Current or selected |
|---|---|---|---|---|
| the frame (`chrome`) | transparent | `bg-fg/4` | `bg-fg/7` | `bg-fg/8` + inset top hairline (`RAIL_CURRENT`) + brand mark |
| panels (`surface`) | transparent or `surface-2` | `surface-2` | `surface-3` | `surface-3` or `accent/10` with a ring, weight or bar |

Overlays of `fg` keep their contrast on any custom Branding colour, which is why the frame uses
them. Panels keep the surface steps.

**Text and icons.** Idle text is `fg-muted` and idle icons `fg-subtle`. On hover both step up
(`fg`, `fg-muted`). The current item is `fg` with its icon in `accent`.

**Focus.** Every focusable element shows the same 2px accent outline (`:focus-visible`,
globals.css). Rows inside the sidebar draw it inside their edge (`-outline-offset-2`), where the
frame cannot clip it.

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
- Nothing animates on a page's first paint except entrances of things the reader opened.

## 7. The app's frame: navigation

### Desktop sidebar (lg and up)

Two saved states, open (16rem) and collapsed to a 4.5rem rail. While collapsed, hover or keyboard
focus opens a temporary preview over the page. The choice is remembered in a cookie, so the server
renders the right width with no jump. Ctrl+\ toggles it. That behaviour is unchanged.

**Zones.** Three zones, top to bottom, each separated by a hairline (`RAIL_DIVIDER`):

1. **Brand:**
   - the team's logo on a `brand-plate`, with the short name and the tagline (or "Admin mode")
     beside it;
   - the collapse control under it. It is quieter than the pages: `fg-subtle`, normal weight, and
     its Ctrl \ hint appears over the row's end only while the row is pointed at or focused.
2. **Pages:** My Profile, Team and Resources in Player Mode; Admin Mode's six sections.
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

### Tablets and phones

Tablets keep the top bar, the drawer (sharing `NavLinks`, so the same rows) and the section tabs.
Phones keep the top bar, the five-tab bar and the account sheet (MOBILE.md). They pick up the new
`chrome` ink automatically. Their mode switch keeps its bordered button: in the sheet it sits among
large rows with nothing else to set it apart.

With #216 (the navigation session; the full wording is in RESPONSIVE.md → Shell):

- **Pinned section tabs (tablets and desktops).** Team's, a profile's and Platform Settings'
  section tabs stay pinned at the top of the page once it has scrolled past them. They sit under
  the tablet's top bar (`--bar-top`) and at the window's edge beside the sidebar, 2.8125rem tall.
  - While pinned (`data-stuck`, set by `TabBar`), the row is frame, not content: the frame's ink
    (`chrome` at 90%) blurred like the phone top bar. At rest it is plain, part of the page, so
    "no blur on content" (§3) holds.
  - Anything pinned under it (All Champions' column headings) offsets by `--tabs-top`.
  - Nothing is pinned in a window under 481px tall.
- **Tablet drawer.** It is a native `<dialog>`: it keeps focus inside, the page behind it cannot
  be used, and closing it returns focus to the menu button.
- **The installed app on a tablet.** It shows Back in the top bar, as phones do, because the
  installed app has no browser Back.

### The navigation contract

Every page follows the same rules, so moving around never needs thought (#266; each rule names its
test):

- **Three levels, each always in the same place.** Destinations: the sidebar (desktop), the drawer
  (tablet), the five-tab bar (phone). Sections: the section tabs, pinned once the page scrolls past
  them (tablet, desktop), the top bar's second row on a phone profile (Team's sections are the phone
  tab bar itself). A page's own views and scope (its view switch, filters, search): in its header.
- **Where a page starts.** A page opened by a link or by code starts at its top
  (`ScrollOnNavigate`); Back and Forward restore the exact place (the browser and Next, untouched);
  a link to a `#fragment` lands on its target. A link that changes the address but keeps the place
  is marked `data-keep-scroll` (a profile's sections, which land at their own top themselves:
  `settleSectionTop`). A change of the query alone (a filter, a view) keeps the place: it is the same
  page. The next page of a list starts with its first item under the bars (Match History's pager).
  (`e2e/navigation-landings.spec.ts`)
- **Back to the top.** On a phone, tapping the current tab on its own page goes back to the top
  (smooth; at once with reduced motion), and so does tapping the page's title once it has moved into
  the top bar. A page under a tab (a teammate's profile under Players) still goes to the tab's page.
- **Back.** Phones and the installed app show their own Back, named after where it leads: the
  previous page when it is ours, else the page above (`phoneParent`). A full-screen game is a history
  entry (Back closes it); a profile's sections replace the entry (Back leaves the profile). An
  account without a player profile never starts at, or goes Back to, an empty Profile: its home is
  its first other page.
- **Overlays.** One sheet for every choice and editor (`DetailModal` `size="sheet"`, `Dialog` built
  on it): Escape, the backdrop, Close and a pull down close the topmost one, focus returns to what
  opened it without scrolling, and the page behind never moves (MOBILE.md, "Every sheet and window").
- **The keyboard.** "Skip to content" is the first stop on every page and moves focus to the page
  (`main#content`); every control has the shared focus ring.

## 8. Brand assets (white label)

The installation's logo, colours and art come from Branding (Admin → Branding) and are never written
into a component (STANDARDS.md → Product).

- **Logo:** any square image. Where it sits in the frame or a hero, wrap it in `brand-plate`, or
  give it `ring-1 ring-border-strong` and a neutral shadow. Never give it a coloured glow: the
  logo brings its own colour.
- **No logo:** `BrandMark` draws the initial on a neutral tile lit faintly in violet, the same in
  the sidebar, the phone header, Team's hero and previews.
- **Custom colours:** derived tokens (`chrome`, `border-control`, the surface steps) follow
  `brandThemeVars`; contrast rules are in STANDARDS.md.

## 9. Known inconsistencies, not yet addressed

The audit of 6 Nov (desktop 1440, tablet 768, phone 390, with production's branding loaded into the
demo) found these outside the frame. They are recorded so the next session can take them on
deliberately. Each needs its own small PR. Check STATUS.md for the Actions-minutes budget first.

| Area | Finding | Direction |
|---|---|---|
| Hover on panels | About 50 controls use `hover:bg-surface-2`, a few `hover:bg-surface-2/70` or `bg-fg/5` | Converge on §5: surface steps on panels, fg overlays on the frame |
| Page headers | Players, Matches and Resources open with `PageHeader`. Leaderboards opens with its sub-tabs in the title's place; Settings centres a narrower column with its own heading | Intended by STANDARDS.md's three tiers. Leaderboards could take a `PageHeader` when its page is next redesigned |
| Eyebrows | `PageHeader`'s eyebrow is `accent`; `SectionLabel` is `fg-subtle` | Both are valid. Keep `accent` eyebrows to admin pages (`PageHeader`) and the sign-in frames (`BrandFrame`); Team Overview's one-row header leaves its eyebrow to screen readers, since the selected tab right above says it |
| Tablet and phone mode switch | A bordered accent button in the drawer and sheet, a quiet row in the sidebar | Deliberate (§7). Revisit only with the owner, since phones were verified |

## 10. Working on the design

- **Ownership:** this page, `globals.css`'s tokens and utilities, `src/lib/sidebar.ts` and the
  frame components (`app-shell.tsx`, `collapsible-sidebar.tsx`, `nav-links.tsx`, `mode-switch.tsx`,
  `account-menu.tsx`, `brand-mark.tsx`) belong to the design system. A session changing them
  updates this page in the same PR.
  - `main` (`app-shell.tsx`) is the same block on every page: Team Overview no longer turns it
    into a flex column, since its lineup starts under the section tabs instead of being centred in
    the window (November 2026). The lineup's own rules in `globals.css` (`lineup-art-height`,
    `lineup-bleed`, the art-wait rules) are described in RESPONSIVE.md → Team Overview's lineup.
    The account's action cards at the top of `main` (`AccountNudges`) say how many they show
    (`data-account-nudges`), which the lineup's art leaves out of the window: a change to their
    size changes `--lineup-nudges` beside `lineup-art-height`.
- **Validation:** `pnpm verify`, then `pnpm build && pnpm test:e2e`. The sidebar's geometry and
  motion are in `e2e/sidebar-motion.spec.ts` and `e2e/quality.spec.ts`; axe runs at three widths
  in `e2e/quality.spec.ts`.
- **Screenshots:** compare before and after at 1440, 768 and 390px. Use the demo with production's
  logo and background uploaded in Admin → Branding: the demo's defaults have no artwork, and most
  frame problems only show against art.
