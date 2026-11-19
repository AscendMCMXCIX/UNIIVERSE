# Mobile: how UNIIVERSE works on a phone

This page is the phone design system: the navigation, how data is presented, how controls behave,
and the visual rules, with the reasons for each decision. Phones are every width below Tailwind's
`md` (768px), upright or sideways. Tablets and desktops keep the layout described in
[RESPONSIVE.md](RESPONSIVE.md) and [STANDARDS.md](STANDARDS.md); where this page differs from them,
it says so and applies to phones only.

The redesign (November 2026) started from an audit of the existing phone experience (section 1),
then rebuilt the frame every page shares (section 2) before the pages themselves (sections 3–5).

## 1. What the audit found

The demo build was measured at 320, 375, 390 and 430px wide (full-page screenshots, page heights,
text sizes, target sizes) and its interactions were walked through.

| Finding | Root cause |
|---|---|
| Players, Leaderboards and Matches, the pages members open most after a game, were two taps away: the bottom bar had three entries (Profile, Team, Resources) and Team's four sections were a tab strip at the top of the page, which scrolled away with it. | The desktop's information architecture (sidebar entry → page tabs) was squeezed onto a phone instead of designed for one. |
| Up to four levels of choice on one screen: bottom tab, page tabs, Games/Encounters, then Leaderboards' categories, a row of statistic cards and a 1/8 pager for the same statistic (those Leaderboards were replaced by Recent form and Records & achievements in #188, while this redesign was under way). | Each level was added for a desktop layout where it has room. |
| The top bar always showed the team's wordmark, never where you were; nothing led back from a teammate's profile (the installed iPhone app has no browser Back). Two menus sat in the bar: the menu drawer at one end, the account menu at the other. | The bar was a branding strip, not navigation. |
| Lists were desktop cards stacked one per row: Players 2,966px tall (9 players), Leaderboards' Highlights 2,830px (10 statistics), Matches 2,330px (6 games). | The cards were designed for a grid of several columns. |
| A game opened under its card: on a phone that is a long scoreboard inside a list, with "Close this game" at its far end. | One interaction designed for a wide screen. |
| Filters were a full-width "Filters · Season 2026 · All supported ga…" button that unfolded a panel into the page, its summary cut off and repeating the scope line above it. | The folded bar was a compressed desktop toolbar. |
| Long instructions under page titles ("Everyone with a profile. Search by name or Riot ID, …") pushed the content off the first screen. | Desktop copy. |

## 2. Navigation

### The frame

Every phone page held upright has the same three parts, so a member always knows where they are and
how to get anywhere else (held sideways, the same destinations ride in one compact bar: "Frames by
posture", below):

1. **The top bar** (sticky): the team's mark on a destination's own page, or **Back** on a page
   reached from one (a teammate's profile, Settings), labelled with where it leads ("‹ Players",
   "‹ Team Leaderboards"). Once the page's own heading has scrolled up under the bar, the bar shows
   its words (the player's name, "Team Leaderboards"), so the title is in view however far down you
   are (the iOS large-title pattern). Once the page's own Filters has scrolled up under the bar, the
   bar offers it beside your avatar (PR 2b): a 44px button with the count of narrowed filters,
   named "Filters:" and what is chosen, opening the same sheet, which hands the focus back to it as
   it closes (the button stays while the sheet is open and while it has the focus, even once a change
   has brought the page's own Filters back into view); Done after a change brings the list's first
   item (the first game, the first player) under the bar, or as near as the page's end allows. With
   Back, the title, Filters and the avatar in the bar at large text, Back gives way first (its label
   shortens, its name stays whole for screen readers), so the bar never runs past the screen. At its right end, your avatar opens
   the account screen.
2. **The bottom tab bar** (fixed, within reach of the thumb): **Team, Players, Leaderboards,
   Matches, Profile**, each one tap from anywhere (`PHONE_TABS` in `src/lib/nav.ts`, at most five,
   those the account may open). Where there is room (an account without one or more of Team's
   pages), Matchup Intel takes the next place, then Resources, the sidebar's order, so Matchup Intel
   is never harder to reach than Resources (18 Nov 2026). There it shows as "Intel", the end of its
   name (`short` in `PHONE_TABS`), and is read out in full: the whole label is as long as
   Leaderboards', and a five with it lost every label on a 320px phone at the usual text size (an
   account with the Restricted Player level, for one; 19 Nov 2026). The current tab's icon sits in an
   accent pill and its label is bright, so it never relies on colour alone. The Profile tab shows your own
   picture when you have one. A teammate's profile belongs to Players; your own profile's sections to Profile.
   With a larger text size, once the labels no longer fit (any five Player Mode can hold needs up
   to 19.6rem under their icons, Matchup Intel's "Intel" no wider than its pill; Admin Mode's four
   14.6rem; held sideways, "Frames by posture" below), each destination shows its icon alone and the
   label stays its name for screen readers:
   a container query in rem on the bar, so the page never becomes wider than the phone (it did at
   125% text on a 320px phone before #300).
   Tapping the current tab on its own page goes back to the top, and so does tapping the page's
   title once it has moved into the top bar (docs/DESIGN_SYSTEM.md, "The navigation contract").
3. **The account screen** (from the avatar: a screen of its own that rises over the page,
   `DetailModal size="screen"`): a bar with "Account" and the close button at its right; who is
   signed in (the picture, the name and the role, and the username on a line of its own where it
   differs from the name; a long name or username wraps, never cut short); one panel of full-width
   rows, 52px tall, each an icon and a name, with a chevron on each page's row: the pages the tab bar
   does not hold (Matchup Intel, then Resources, each when it has no tab, as an account with the
   Team pages has five tabs already; in Admin Mode the admin pages without a tab), Settings and
   Install App; the row of the page being shown is marked, and pressed it keeps the page as it is
   (Matchup Intel's pair included), closes the screen and goes back to the top, as the current tab
   does; a second panel
   with the switch between the modes above Sign out; at the foot one quiet line with the patch and
   Riot's notice, whose link closes the screen as it goes. It is fixed to the screen's four edges,
   under the status bar and the Dynamic Island, clear of the notch sideways, and its content keeps a
   readable column (28rem) in the middle of a wider screen. At the usual text size everything is in
   view without scrolling on every phone from 375pt wide held upright, installed or in Safari, and
   on a 320 by 568 phone installed (with Matchup Intel's row, 71px to spare there, as Admin Mode's
   screen has; 18 Nov 2026) (in
   Safari's tab on a 375pt iPhone SE, an administrator in Admin Mode whose username shows may scroll
   a few points), measured with Sign out and a username line counted in. A 320pt-wide screen (an
   iPhone SE with Display Zoom) scrolls a little in Safari's tab. With large text, or held sideways,
   only its body scrolls, as one region, and the bar with the close button stays put. With large
   text a row's name wraps between its words instead of ending in an ellipsis, and on a narrow
   phone the row gives its words the room (`lib/sheet.ts`, 19 Nov 2026): a page's chevron goes
   where the row is under 12rem (150% text on a 320px phone, 175% on 375px), the icons where it is
   under 10.25rem (175% on 320px, 200% on 375px), so every row's name is whole from 100% to 200% on
   320 and 375px phones in both modes (before, Matchup Intel's row read "Matchup…" at 150% on a
   320px phone, Data & Integrations and the switch between the modes were cut at 150% on 320 and
   375px, and at 200% on 320px every page row kept two or three letters). On a page pinched to zoom,
   a finger pans the zoomed view across it. The close button is a quiet 36px circle whose touch
   area reaches 44px. The screen takes the focus itself as it opens (nothing lights up; every
   window opened by a tap does the same, below), Tab reaches the close button and the rows in order, Escape or the close button closes it and the focus goes
   back to the avatar, and the page behind never moves. It replaces both the menu drawer and the
   account dropdown on phones. See "Why the account menu was a strip on iPhones" below.

   **The first tap counts.** The avatar is a button the page's code drives, and on a slow network
   the page is drawn, and the avatar pressable, seconds before that code has run: a tap then did
   nothing. An inline script in the root layout keeps such a tap (`src/components/early-taps.ts`):
   the avatar shows pressed at once (an accent ring on the hover surface), and the account screen opens
   as soon as the code runs, exactly once, however often it was tapped. Enter or Space on the focused
   avatar goes the same way. Links need none of this: they work before the code has run.

   **Why the account menu was a strip on iPhones (10 Nov).** The account sheet (#265) and then the
   account panel (#278) were windows as tall as their content: a native dialog's own fit-content
   height, holding a header and a body that grows into the window's room and scrolls once the window
   is full (`flex-1`, a body that grows from nothing). Safari 26 and earlier (iOS, iPadOS and macOS
   26) work out that height as if such a body were empty, so the window collapses to its header and
   paddings. On the owner's iPhone the sheet was a 124pt strip at the foot of the screen and the
   panel a 95pt strip at the top: exactly their borders, headers and body paddings, with no body.
   In WebKit 26.0 most other sheets (filters, editors, confirmations) collapse the same way, and so
   do the compact windows and, on iPads and Macs, the centred windows (a player's window, signing
   in); the scroll-as-one fallback (`SHEET_SPARE_REM`) sometimes redrew a collapsed sheet whole (the
   filter sheet in an installed app's frame, not in Safari's tab). WebKit 27 draws it correctly
   (WebKit bugs 242837 and 289876, fixed in Safari 27), and the browser tests ran Playwright's WebKit
   27 and Chromium, so every test passed while iPhones on iOS 26 showed strips. Playwright 1.58.2's
   WebKit 26.0 draws exactly what the owner saw: the panel 377×95 with one of its six controls in
   reach. So does real iOS: in the iOS Simulator (Mobile Safari on iOS 26.5 and 26.2, a Home Screen
   web app on 26.5, run once on GitHub's macOS runners on 10 Nov), main's panel was 95px tall with
   one of six controls in reach in Safari (one of five installed, where Install App is hidden), and
   the filter sheet 189px in Safari's tab (whole when installed). Two changes fix it, and the same
   Simulator run of them showed the account screen filling the screen (695px in Safari, 793 and
   812px installed) with every control in reach and the filter sheet whole (410px):
   - every window's body grows from its content (`flex-auto`, `BODY_SCROLLS` in detail-modal.tsx),
     which Safari 26 sizes correctly; `overlay-sizing.test.ts` forbids a body that grows from
     nothing, and `scripts/webkit26-check.mjs` opens every kind of window in WebKit 26.0 (the WebKit
     workflow runs it, RESPONSIVE.md → Safari 26);
   - the account menu is a screen of its own, fixed to the screen's four edges: its height is the
     screen's, with nothing to work out from its content.

   The diagnoses before this one were wrong. #278 blamed the sheet's motion, drawn as if stopped
   early; the first version of this change blamed an installed app reporting its viewport far too
   small (196pt), a figure worked back from the screenshot, never measured. What that work changed
   stays, for its own reasons: overlays are placed and sized by the box they are fixed to (insets
   and percentages), not by viewport units or by measuring the viewport from script, readings of
   the screen that iOS has got wrong in installed apps: svh and the visual viewport less the safe
   areas (WebKit bug 254868), vh and lvh on iOS 26.1 (301994), the visual viewport short after the
   keyboard or a resume (322900, 323322). Inside windows, the Card Studio's section list and the
   picture cropper still follow the viewport, as before.

### Frames by posture

The frame follows how the screen is held (owner's decision of 8 Nov 2026: "posture-aware navigation
keeping the destinations in reach with comfortable targets, safe areas and Back"; PR 2d, 18 Nov). CSS
decides the posture from the window's width and height, so the first paint is right and a turn of
the phone changes the frame at once; the parts a posture does not use are drawn but not displayed,
and exactly one `nav[aria-label=Primary]` is shown at a time (none beside the desktop sidebar, whose
pages are its "Main" navigation).

| Posture | Window | Frame |
|---|---|---|
| Phone held upright | below `md`, taller than 480px | The frame above: the top bar (52px plus the status bar's inset; a profile's sections a 44px second row), the bottom tab bar (56px plus the home indicator's inset) and the account screen. Unchanged by this work. |
| Phone held sideways | 480px tall or less, below `lg`, whatever its width | **One compact bar**, 44px plus the status bar's inset, and no bottom bar: Back or the team's mark (the mark alone, no name; in Admin Mode "Admin mode" beside it in the accent, left to screen readers where the bar is narrower than 32rem, and always part of the mark's name), the phone's destinations (the same five, or Admin Mode's four), the page's title where the destinations leave it at least 6rem, Filters (PR 2b), the avatar, which opens the account screen. Each destination is a 44px target; the current one is lit twice (its icon in an accent pill, its label shown and bright), and where the bar is narrower than 38rem only its label shows, the others' left to screen readers (`SIDEWAYS_FIT` in `mobile-nav.tsx`: all five labelled need 33.3rem, 36.3rem with Filters; a five with Matchup Intel among them, an account without one or two of Team's pages, up to 34.0rem and 37.0rem, Matchup Intel shown as "Intel" as in the upright bar); at a larger text size, below 27rem, the current one shows its icon alone too, and past that the row scrolls sideways inside the bar, the current destination kept in view whenever the row changes size (shown by a turn of the phone, or a text size). The current destination is marked as the upright tab bar marks it, so a turn keeps the signal. A profile's sections are a 44px second row (44px targets, as everywhere on a touch screen). The bar slides away while the page scrolls down and comes back on a scroll up, with the short-window rules it had (distances from where the scroll last changed direction, so slow drags count; back while the focus is inside it). Team's section tabs are not repeated in the page (the bar's destinations are them), nor a profile's. |
| Tablet | `md` to `lg`, taller than 480px | **The destinations in the top bar**, one tap each: in Player Mode the sidebar's four entries, My Profile, Team, Matchup Intel and Resources (Team marked on all of its sections, which stay the pinned tabs in the page; Matchup Intel on its page whatever pair it shows, Resources on the Library alone); in Admin Mode its four tabs, Dashboard, Users, Platform Settings and Health (Platform Settings by its full name here, since the avatar menu under the bar holds the account's own Settings; the phone's bar keeps the short word). The current one is marked with the sidebar's four signals: a neutral lift with a hairline of light, the brand's gradient as a short bar at its foot, its icon in the brand blue, its name bright. The drawer is gone. The avatar opens the account menu (`AccountMenu`), which holds what the desktop sidebar's footer holds: Settings, Install App, the switch between the modes above Sign out, and the patch and Riot's notice at its foot; in Admin Mode also Data & Integrations and Audit Logs, the admin pages without a tab. At a larger text size the team's name beside its mark gives way first, then the labels to the icons (`BAR_FIT`: Player Mode's four need 42.0rem with the name, 35.9rem without, so the name gives way below 42.5rem and the labels below 36.25rem; its three needed 32.8rem and 26.8rem; Admin Mode's 42.7rem and 36.2rem, giving way below 43rem and 36.5rem. The bar's gutters are 1rem a side and grow with the text, so a 768px tablet's bar is 46rem at 100% text, 36.4rem at 125%, 30rem at 150% and 22rem at 200%: in Player Mode it keeps the name and the labels at 100%, the labels alone at 125%, and shows the icons alone from 150%, where its three kept their labels (four need more than 30rem); in Admin Mode the name and the labels at 100% and the icons alone from 125%, as before), and as a last resort the list scrolls sideways inside the bar. Back, which the installed app adds on a page reached from another, takes about the room the name had (Back as "Team" with its gap 4.7rem, the name with its gap 6.1rem), so beside it the labels give way where the name does (below 42.5rem; Admin Mode 43rem), and where both show the name shortens first: left at the bare thresholds the list scrolled beside Back at 125% on a 768px tablet (69px) and an 820px one (23px); a longer Back label ("Team Leaderboards") can still leave it 4px short at 768px and 100%. These sizes are the root's (the specs' way to emulate large text); a real text-size setting moves the `md` breakpoint too, so at 125% a 768px window has the phone's frame and the tablet bar starts at 960px, 46rem wide (RESPONSIVE.md, "Two ways to emulate a larger text size"). |
| Desktop | `lg` and up | The sidebar, unchanged. |

**What moved where.** Nothing was removed: every destination, action and account item is reachable
in every posture.

| Item | Before | After |
|---|---|---|
| A phone held sideways: the five destinations | a compact bottom bar below 768px wide; the tablet's drawer (two taps) from 768px | the one compact top bar, one tap, at every width |
| A phone held sideways: the account items (Matchup Intel and Resources, Settings, Install App, the mode switch, Sign out, the notes) | the account screen below 768px; the drawer and the account dropdown from 768px | the account screen at every width |
| A phone held sideways: a profile's sections | the top bar's second row below 768px; the page's tabs from 768px | the compact bar's second row (44px) at every width |
| A tablet's destinations (My Profile, Team, Matchup Intel, Resources; Admin Mode's pages) | the drawer, two taps | the top bar, one tap (Admin Mode's Data & Integrations and Audit Logs: the avatar menu, two taps as before) |
| A tablet's Settings and Sign out | the drawer and the account dropdown (listed twice) | the avatar menu (once) |
| A tablet's Install App, mode switch and patch line | the drawer | the avatar menu, with Riot's notice |

**Measured** (18 Nov 2026, the demo build, Chromium; the frame at rest at the top of a teammate's
profile: the top bar, the profile's sections, in the bar or, from 768px wide before, a row of tabs in
the page, and any bottom bar): an iPhone 15 held sideways in Safari's tab (734 × 343, its home
indicator's 21px told) 163 → 89px, 47.5% → 25.9% of the height (Team 119 → 45px); its whole screen
(852 × 393) 101 → 89px, now with the sections pinned and the destinations in the bar (Team 57 → 45px);
an iPhone SE (1st gen, 568 × 320) 142 → 89px (Team 98 → 45px); 844 × 390 and a Pixel 7 (915 × 412)
101 → 89px: the 44px bar, the sections' 44px row and the hairline. (The plan's "about 84px" assumed a
40px sections row; the rows are 44px targets, as every finger target is.) The profile's band there
(the Overview's header) 106–138 → 74px (Demo Top), 78px with an off role, the lineup status and two
links (Demo Mid); with three links its line condenses where it is narrow (the role's icon alone
below 23.5rem, "Lineup" below 29rem, the off roles as icons, each still read out in full; the
links 32px chips, 44px targets) and stays one line, the band at most 80px, on a member's own
Overview beside Customise too. A tablet's
destinations: 2 taps → 1. The frame is never wider than the window: at 568 × 320, and at 150% and
200% text at 568 × 320, 734 × 343, 852 × 393 and 768 × 1024 (at 200% on a 568px phone the
destinations' row scrolls inside the bar, never the page). A page's own content is its own to fit:
Settings, since its two-column layout (ux/resources-settings), is 139px wider than a 768px window at
200% text, in both modes (its buttons beside a 15rem column), as on the stack's Match History head,
but only with the root's font size doubled in CSS (the specs' method), where a 768px window keeps
the tablet layout. With the browser's own text size, which is what a real setting changes, the
breakpoints' rem scale too: a 768px window at 200% gets the phone layout, where Settings is as wide
as the window (RESPONSIVE.md → Phones at a larger text size). Phones held sideways from 640px do the
same: with the root's size they keep `sm`, and Settings' two columns are 165px wider than a
734 × 343 window and 55px wider than an 852 × 393 one at 200%; with the browser's, one column as
wide as the window. Upright phones unchanged (393 × 852: 53 + 57px on Team).

The tablet's avatar keeps an early tap as the phone's does (so does the account tile in the desktop
sidebar), and the account menu's Sign out tells the browser's other tabs, as the account screen's
does (`AccountGuard` checks each of them then; a tab left on a member's page goes to sign-in at its
next page, since the server answers every request from its own session cookie). The account menu is
a menu, not a window: it takes the focus to its first item, the arrow keys go round its items (Home
and End to the first and last), Tab or a click outside closes it, Escape gives the focus back to the
avatar, and Install App closes it and opens its window, which gives the focus back to the avatar
too. The patch line and Riot's notice at its foot are a group named by their own words; the notice's
Details link is an item of the menu, named "Details: Riot Games notice" (the visible word first),
with the accent focus ring and a 44px touch area. It closes when the page changes (Back or Forward
while it is open), and coming back to a page never opens it unasked; so does the account screen, the
path it was opened on being its state. The installed app on a tablet, which has no browser Back,
gets the same Back in its top bar as a phone, beside the destinations, from the first paint in each
display mode an install opens in (the `standalone` variant).

### Back

Back is predictable: it goes where the member came from, by the browser's own history, so their
place on that page (its scroll, its open filters) is kept. `MobileNav` remembers the pages visited
in this tab since the app opened and names Back after the previous page's heading ("‹ Demo Mid").
A page opened directly (a link from elsewhere, a reload, the installed app's start) has no page
before it, so Back leads to the page above it instead (`phoneParent`: a teammate's profile → Players,
Settings, Matchup Intel and Resources → home: Matchup Intel is a destination of its own, not a page
of Resources, whatever its address). A destination's own pages have no Back: they are where you
start. A page that adds history entries of its own address (Matchup Intel's pairs) is still one
page for Back: named after the page before, it goes there, past those entries, where the browser's
Navigation API shows them (`backSteps`); the browser's own Back steps through them. Where the
browser has no Navigation API (Safari before 26.2, Firefox before 147), the page makes no such entries: each pair
replaces the entry, so Back leaves the page in one step (`historyShowsEntries`).

### Sections of a page

- **A profile's sections** (Overview, Champions, History, Accounts: short names, so four share a
  320px screen) ride in the top bar under its first row, so they stay in reach however long the
  page (`ProfileTabs variant="chrome"`). Moving between them replaces the history entry, as tabs
  inside one screen do on a phone, so Back leaves the profile rather than stepping through its
  sections; a section opened once the card has gone under the bar starts at its top, just under
  the bar. That top is measured on the new section once it has committed (the Overview's card is
  taller than the band the other sections show), and held until the content is on the page and the
  page is at that top (`settleSectionTop`): the loading state is shorter than the content and would
  otherwise leave the page clamped or, through scroll anchoring, mid-list, and the route can also
  commit for a moment with neither, no taller than the screen, which clamps the page to its top
  (#262: before it, the landing failed now and then). A reader who touches or scrolls the page
  meanwhile keeps their place, and the hold ends after ten seconds on a slow connection.
- **Team's sections** are the bottom bar itself, so the page tabs are not repeated on phones.
- **Matchup Intel and Resources** (the Library) are destinations of their own, one page each, with
  no tabs (18 Nov 2026; before, the two were Resources' tabs at the top of both pages): a member's
  phone reaches each from the account screen, Matchup Intel's row first.
- **A page's views** (Match History's Games and Encounters, Leaderboards' Recent form and Records &
  achievements) share one quiet track (`SubTabs`). A label too long to share the line on a phone
  shows its start ("Records"); the rest is still read out, so its name does not change.

### Phones held sideways

Short windows (480px tall or shorter, below `lg`) have one compact bar holding the destinations, a
profile's sections under it, and no bottom bar ("Frames by posture", above); it slides away while the
page scrolls down, and a scroll up brings it back. Nothing is lost when a phone turns.

## 3. Data presentation

The rule: **the first screen answers the question the page exists for**, and more is one obvious
tap away. Nothing is removed from the product: what a phone leaves out of a list is in the detail it
opens.

| Page | Phone layout | Height at 390px (`main` at f4e5372 → this redesign) |
|---|---|---|
| Team (Team Overview) | The logo beside the team's name, the lineup's state and Edit lineup under them, then the role bar over a swipe track of the five cards, one at a time (RESPONSIVE.md → Team Overview's lineup). At a larger text size each card holds its text: its season's figures and its first choice wrap, the role's chip shows its icon alone where its name does not fit beside the card's controls, your own card's two controls stand one above the other, and a member's lineup state takes the line under the logo (RESPONSIVE.md → Phones at a larger text size). | — |
| Players | One panel, a row per player, 64px tall: picture in its frame and the name in the player's own style with their emblem, the status that matters at the line's end (Lineup; "Setup" for an unfinished setup, its whole meaning read out and in its title; Archived), a long name wrapping beside it rather than pushing it down; then the main role (its icon in the card's colour, its name read out), the rank ("No Riot account" without one) and the pool as many whole portraits as fit plus a count, a line that wraps rather than cuts with larger text; the tagline on a third line only for those who have one. At 175% and 200% text on the narrowest phones a row stacks: the picture on a line of its own, the name, role, rank and pool the row's width under it, and the "·" before the rank never starts a line. A row carries the card's colours but no art, card frame or effect, and nothing is downloaded for a look. The whole row opens the profile (the card, links and every pool). The count is the title's scope line ("9 players", with what narrows it). The same rows on every width since the roster board (Nov 2026): two up on a phone held sideways. Below 768px wide the title, search and Filters then share one row (from 35rem; a split screen or a zoomed small phone stacks them, so the search keeps its width); a large iPhone in Safari, laid out at the screen's whole width (852px on an iPhone 15), keeps the tablet's toolbar on a row of its own. | 2,966 → 1,227 → 850px |
| A profile's Overview | The profile's band, then the season's figures (three across, the kills three by two), Recent form's twenty games and the champion pools. At a larger text size the figures go two across, then one, Recent form's bars share the card's width, and under the narrowest lists the pools' figures take the row's width and name themselves in words (RESPONSIVE.md → Phones at a larger text size). | — |
| All Champions (a profile's Champions) | The section's title is left to screen readers: the Champions tab in the top bar names it. The scope line, "6 champions · Season 2026 · All supported games", ends in the data status's ⓘ; from a 360px phone the search and Sort by share one row (the words "Sort by" read out only, the sort mark shown before the column's name, as the table's headings write it), and on a 320px phone the search keeps its own line. A row per champion: the portrait, the name with its role and In pool, the win rate and games at the right, then the other figures as labelled pairs, the one the list is sorted by first, in semibold (sorted by double, triple or quadra kills, that kind's own count). At 150% and 200% text each row stacks (the name, then the win rate and games, then the pairs), so no name is squeezed out and nothing is wider than the phone. A champion opens its window over the whole screen: a 48px portrait, the scope beside Matchup Intel, Refine at the end of the tabs' row (its panel opening right after that row), the figures three by two with short labels (CS/min, Damage/min, Mastery; screen readers hear the whole labels) and every figure and label whole (the column with KDA and Mastery points takes the room they need, the middle one keeps "Damage/min" whole; at 150% text a 320px phone's figures go one across), its tabs and both multikills ⓘ 44px targets. The lane comparison starts at 524px instead of 631 on a 393px phone, not the plan's estimated 460: the scope row also holds Matchup Intel (#292), the scope wraps rather than cutting off the account (#300), and the tabs are 44px. | 1,131 → 1,031px at 393px (Demo Top's six champions; 1.72 → 1.56 screens in Safari's 659px, the rows on the first screen 1.4 → 2.4) |
| Leaderboards | Built for phones in #188 (docs/LEADERBOARDS_MODEL.md), rebuilt as rows in PR 5a: Recent form is one board with a two-line row per member: the place (a bracket joins shared places, "4="), the picture with the main role as a badge on it, the name and "You" with the win rate at the right end, then the record and dates, with the gap ("1 win behind", "Next win: 3=") at the line's right end under the win rate (on a line of its own, still at the right, when the dates or the gap are long: most rows at 360–375px), and the record's 20-game bar as a 2px line along the row's foot. Members with too few recent games are the board's last group, a row each with the games they need. The data status ⓘ ends the scope line. Records & achievements (PR 5b): the note in one sentence, the page's three sections as in-page links ("Season records · Multikills · Milestones", each jump landing under the top bar), the record book's rows of three lines (the record and its qualifier; the holder, the value at that line's end; the champion, role, K/D/A and date), each opening its game (a member's row adds "Your best" as a fourth line, about 102px, by design; the 85px rows are a viewer's without a profile); then the multikills, one line per member from a 21rem list (375px phones and up), and the milestones, the member's name over one line of chips, each the champion's portrait and the figure ("486K") without the champion's name, which screen readers still hear (D6). The frame adds the tab, the title in the bar and Back; the whole row is one link to the member's profile. At a larger text size Recent form's rows reflow (the record and the dates a line each, the win rate under the name, then the name under the place and picture, "You" under a name it would break), so names wrap only between their words (TEAM_LEADERBOARDS.md). | 1,093 → 1,037px (#188); 1,004 → 920px (PR 5a, rows 61–106 → 64px from 390px, 64–74.5px at 360–375px); Records 3,905 → 2,195px at 393 × 659 (PR 5b: 5.93 → 3.33 screens; record cards of 169–209px → rows of 85px, 101px with a qualifier on a line of its own; three whole records above the tab bar instead of one) |
| Matches | Each game: one line of words (result, length, queue and date; how many members played is read out only, the rows under it being the members), a Ranked Solo/Duo game of three or more saying under it that Solo/Duo takes parties of two at most; then a row of about 40px per member: the champion's portrait with the member's picture as a 16px badge on its corner, the name whole (a long one wraps, never cut, at 320px too) with the K/D/A and the largest multikill right after it, then the role and champion. Both full teams are in the game's screen, where the scoreboard lists all ten. Bookmarked sits beside Filters; the summary line's (i) holds the rule and any games left out. | 2,330 → 1,528px; 1,528 → 1,411px at 393px (the UX pass's PR 7c: 2.32 → 2.14 screens in Safari's 659px; 1,824 → 1,555px on a 320px phone) |
| Match History | Denser since 18 Nov 2026 (the owner's decision D8: docs/DESIGN_SYSTEM.md §1). The header is one row from a 320px phone up: Games and Encounters (their track without icons, hugging its 44px tabs), Filters and Refresh (Refresh shows its icon alone, and under 360px Filters too, their names kept for screen readers); a narrowed filter's chips take the next row when they do not fit beside the views. The scope line follows, its data status after its last word; the header is read and tabbed in that order. Then the summary, every figure at once in three lines from 393px: the last twenty as squares (sharing what their line leaves, never under 3px) with the streak ("4W streak") and a named trend ("Better +9 pts"), the ⓘ beside "Last 20"; the record, KDA, CS or vision and kill participation; the champions played most and the ladder change ("+45 Solo/Duo since 3 Nov"). At 375px a streak beside a named trend takes a second row on the first line, and the longest ladder label or a two-digit record on a champion can take the ladder change to a fourth line; a 360px phone's ladder change does too, and a 320px phone wraps more. Each game, about 118px: the result line across the card ("Victory · Solo/Duo · 40h ago"), a ranked game's LP at its end; the portrait, the champion and role with the build under them (from a 21.375rem list: phones of 374px and wider; on narrower ones kill participation sits there and the build ends the card) and the K/D/A with its ratio and largest multikill; then kill participation, CS and damage. A card is read in the order it is drawn. The result line wraps rather than cut the time off. Both teams move to the game's screen. Ten games a page; the pager's buttons are 44px, and on a narrow phone the pages either side of the current one give way to the arrows, so both arrows stay on its line. **What moved:** Filters and Refresh from a row of their own to the views' row; the LP from under the K/D/A to the end of the result line; the build from the card's last line to beside the champion; on phones under 374px kill participation to beside the champion; the summary's ⓘ from its end to beside "Last 20"; the streak's words ("4 wins in a row") and the ladder change's "points", at every width, and on a phone the trend's "lately", into the figure's title and its screen-reader text. **Encounters:** the same one-row header; its Minimum games and Sort by moved from the list's toolbar into the Filters sheet, as chips that count with the filters, shown beside Filters when they differ from their default and put back by the sheet's Reset; tablets and computers keep them in the list's toolbar, as the list's own: the filters' Reset neither counts them nor changes them there. At 200% text on a 320px phone neither view is wider than the phone and nothing in a card is cut. | 2,268 → 2,000px; 2,016 → 1,639px with D8 (Demo ADC, `main` at 390 × 844) |
| Matchup Intel | Your champion and the enemy side by side, the swap between them, as compact slots (a small portrait above the name on a 320 or 375px phone, beside it from 384px), so the ten-second briefing's threat starts on the first screen (whole at 390 by 664). Then the enemy's five abilities, each row its icon beside its key, name and base cooldown per rank, and under them the checked facts as badges and Riot's description, with the longer notes behind Details. Interactions (the enemy's own folded under one line), level notes and your own abilities (collapsed) follow. Each slot opens a picker on a screen of its own with a 16px search at the top (docs/MATCHUP_INTEL.md). At a large text size the slots stand one above the other, and an ability's icon and a note's level stand above their words; nothing is cut at 200% on a 320px or a 390px phone, the picker (its Recent and curated rows too), each curated pair swapped and the states with one side chosen included. | New (16 Nov 2026) |
| Resources (the Library) | A full-width search, then the index: All, ★ Favourites and each section with its count (the counts follow the search), one choice that filters, in a row that scrolls sideways. The ★ segment is in the server's page with an empty slot of its count's width, which fills once favourites are read from this browser, so nothing moves; chosen, it shows only the starred sites (and, with none, what the star does). Then one panel: a heading per section (an `h2`) with its count, hairlines between the rows. A row: the site's icon, its title (it wraps, never cut), the host beside it (cut first) and ↗, and its description, whole on a touch screen; the whole row opens the site in a new tab, the star at its end keeps a favourite in this browser. At a larger text size (under 16rem of list) the icon and the star take a line of their own over the title and description, which get the row's width. The live count is left to screen readers (each segment says it); an empty library says "No resources yet." on screen too. Held sideways, from 640px wide (an iPhone 15; a 320pt iPhone held sideways is 568px and keeps the upright layout), the search and the index share a row and the sections are panels in two columns. | 1,726 → 1,284px at 393 × 659 (#292's tabs included; 2.62 → 1.95 screens) |
| Settings | A compact account card leads (`surface-lead`), read in the order it is drawn: the picture beside the name, @username and a neutral role badge; a row of quiet links (My Profile, Riot Accounts, the mode switch, Sign out; wrapped lines 12px apart, so a link's 44px touch area stops short of the link drawn above or below it); Change and Remove; what the picture is for; the index as chips (Name, Links, Password: Records' `SectionIndex` drawn as the plan's chips, 44px, the section being read marked; each jump through the router's history, so Back still leaves the page in one step). At a larger text size (200%, or 150% on a 320px phone) who you are goes under the picture, so the longest role, Administrator, stays whole. Then every section stacked, the password form included, each field with its own Save on one 44px row ("Save" on screen, "Save display name" read out). In a window 480px tall or less the card is the same, and from 640px wide (an iPhone 15 held sideways) it is a column of its own beside the sections. Sign out is on the first screen at every size. | 1,512 → 1,358px at 393 × 659 (the owner; 2.29 → 2.06 screens); a member with Social links 2,060 → 1,955px (3.13 → 2.97) |

**Match History's page heights (D8; measured 18 Nov 2026 on the demo build of this branch, Chromium,
Player Mode, Demo ADC; screens are the page's height over the window's, before → after, the plan's
target in brackets; `e2e/match-history-layout.spec.ts` holds each target):** Games: iPhone 15 in
Safari (393 × 659) 3.20 → 2.63 (2.7), the first game whole on the first screen; the installed app
(393 × 852) 2.48 → 2.04 (2.2); iPhone SE, 1st generation (320 × 568) 4.23 → 3.67 (3.8); SE, 3rd
generation (375 × 667) 3.24 → 2.63 (2.7); Pixel 7 in Chrome (412 × 839) 2.52 → 2.07 (2.1); an
iPhone held sideways in Safari (734 × 343) 5.52 → 4.42 (4.8); iPad (820 × 1180) 1.75 → 1.44 (1.6)
and (810 × 1080) 1.92 → 1.57 (1.6); 1440 × 900 1.64 → 1.60 (1.6, exactly: 1,440px, no room to spare); 2560 × 1440
1.28 → 1.26 (1.3); 3440 × 1440 1.37 → 1.345 (1.35). Encounters: 393 × 659 1.95 → 1.78 (1.8);
320 × 568 2.29 → 2.095 (2.1); 734 × 343 3.37 → 3.06 (3.3); 810 × 1080 1.05 → 1.00 (1.0).
**Missed: a Pixel 7 held sideways in Chrome (863 × 360), 4.43 → 4.25 (3.9).** Its list is 50.9rem,
so it keeps the wide one-row card (102px, the shortest of the three tiers, unchanged by D8); the
phone's frame (the top bar and the profile band) takes 149px of its 360, and the summary a flowing
two lines; D8 took 66px (the header's row and the summary) and the target needs 126px more. A
sideways frame is PR 2d's (frames by posture). The plan's own baselines (iPad 1.98, 1440 × 900
1.73, the installed app 2.58, sideways 5.64, Encounters sideways 3.58) were measured on the build
before #271 had made the wide cards and the build state honest, so this branch's before figures,
taken on its base (`8ef5a612`), are lower.

Lists are **rows in one panel with hairline dividers** (people, a board's members): a single
surface, not a card per item. **Games stay cards**: each is an object with its own result colour
and opens a screen of its own.

Typography follows STANDARDS.md (Type): a row's primary value is `text-md` (15px) semibold, its
context `text-xs` (12px) in the secondary grey, figures right-aligned in `tabular-nums`. No running
text below 12px; 11px (`text-2xs`) only for badges and labels.

## 4. Interactions

| Need | Phone pattern | Why |
|---|---|---|
| Narrow a list | **Filters** opens a sheet from the bottom edge with every filter, each with its label, and Reset and Done at its foot (`FilterBar`). Beside the button, what is narrowed shows as chips that remove themselves with a tap. A search box shares the row with Filters. Choices apply at once, as on desktop. Far down the list, the top bar offers the same Filters (PR 2b), so narrowing never needs scrolling back up; Done after a change lands the list's first item under the bar. A picker in the sheet (Played with, Champions) opens its list in the sheet's body, as tall as its options, and the body scrolls it into view; a tap below the open list closes it and reaches what was tapped. | The scope stays visible without opening anything; the sheet is within reach of the thumb and never pushes the page around. One scroller: a list scrolling inside the sheet's scrolling body was cut off at its edge. Closed as a tap started, the list moved the fields below it up before the tap landed. |
| Open a game | The game takes the whole screen (the match window), as a new entry in the browser's history, so Back (the button, the edge swipe, Android's key) closes it and returns to the list exactly as it was. Its scoreboard keeps the marks for players met in other games; following one closes the game, and Back returns to it. | A scoreboard inside a list is a detour on a narrow screen. Desktop keeps the game under its card. |
| A champion, a player from Team | The existing detail windows, which already take the whole screen on phones. | |
| Account, Settings, Sign out | The account screen, from the avatar. | One menu, not two, every entry a full-width row in reach of the thumb. |
| A short question or form | `Dialog`: the same sheet as every other (built on `DetailModal`). | One sheet: one look, one motion, one height rule. |

Every sheet and window shares `DetailModal`: native `<dialog>` (focus kept inside, the page behind
inert), Escape and the backdrop close it, focus returns to what opened it, a sheet slides up in
220ms with `--ease-emphasized` and out in 140ms (instant with reduced motion). Every window's body
grows from its content (`flex-auto`, never `flex-1`: Safari 26 collapses the other, above). The
account screen is a screen of its own instead (`size="screen"`, above). A window opened by a tap
takes the focus itself, so nothing in it is ringed as it opens (Safari drew its focus ring around the
close button, the loudest thing in the window), and holds it only until it is tapped or the focus
moves on, so a tap on its text never takes the focus from a field; opened from the keyboard, its
close button has the focus, ringed; sign-in goes straight to its username. A window is in the
browser's top layer, above the page, so what must show over it is drawn inside it: an ⓘ's bubble
beside its ⓘ (Escape closes the bubble, not the window), and the toasts in their usual place above
the tab bar, where their buttons answer a tap. The toasts go into a window once it has risen into
place and leave it as it starts to close, so they never slide with a sheet; a toast raised as its
window closes (Save, then the window goes) is announced on the page. In a window, a picker's list
(the champion window's opponent picker too) opens in the window's body, never as a list scrolling
inside it, and a tap below the open list reaches what was tapped (the list closes on the tap's
click, so nothing moves under the finger first). A sheet:
- is docked to the bottom edge on phones and in short windows (a phone held sideways, where it
  spans up to 44rem), and is a compact centred window on taller wider screens;
- is as tall as its content, up to the screen less a strip of the page above it, a share of the
  screen it is fixed to (not viewport units), which does not move while the sheet is open;
- keeps its header and footer in place, and only its body scrolls when it must (never a scroll
  inside a scroll); its choices go in the body and its actions in the footer;
- scrolls as one instead, like a page, its header and footer included, only where they would leave
  its body less room than the tallest control in it needs (large text, or a page zoomed in, on a
  phone held sideways: the account sheet's header and footer once took 63% of it at 150% and 84% at
  200%, and no tile could ever be shown whole between them). `DetailModal` measures this on every
  change of size (`SHEET_SPARE_REM`), and the sheet carries `data-flow` while it does;
- keeps its last line at least 1rem from the bottom edge, its footer's actions included, more where
  a home indicator is (`pb-safe-4`: the padding, or the inset where it is larger); a sheet that is a
  centred window keeps its footer 0.75rem from its own edge;
- can be pulled down by its handle or header to close (a long pull or a flick; a short pull settles
  back), and a touch that would move nothing inside it never moves the page behind (no rubber band,
  no toolbar sliding).

## 5. The phone design system

**Type on a phone** (rem sizes from the tokens in globals.css, so the reader's text size is followed):

| Role | Size and weight | Example |
|---|---|---|
| Page title (`h1`) | `text-2xl` semibold | "Players", the player's name in the profile card |
| The bar's title | `text-base` semibold, fades in | "Demo Top" once the card has scrolled away |
| Section title (`h2`) | `text-xl` semibold | "Season performance" |
| Card title | `text-base` semibold | "Recent form" |
| A row's name | `text-md` (15px) semibold | a player, a champion |
| Headline figure | `text-2xl` semibold, `tabular-nums` | a win rate, a season record |
| Row figure | `text-base` to `text-xl` semibold, `tabular-nums` | K/D/A, a member's win rate on Recent form |
| Scope line, body | `text-sm` in `fg-muted` | "36 games · Season 2026 · All supported games" |
| Context, times | `text-xs` in `fg-subtle` | "42h ago", "46 games" |
| Badges, chips, the tab bar's labels | `text-2xs` (11px) medium | "Lineup", "Ranked Solo/Duo ✕" |

| Topic | Rule |
|---|---|
| Breakpoints | Phone below `md` (768px). Layout differences live in CSS (`max-md:`, `max-sm:`, container queries) so the first paint is right; behaviour that differs (how a game opens) reads `usePhone()` after hydration. |
| Frame | Upright: top bar 52px plus the status bar's inset (a profile adds its 44px sections row); tab bar 56px plus the home indicator's inset. Sideways: one bar, 44px plus the inset (a profile's sections a 44px row), no tab bar. The top bar sets the page's `scroll-padding-top` to its measured height (sideways at a tablet's width too) and `scroll-padding-bottom` clears the tab bar (sideways only the home indicator), so whatever scrolls into view (anchors, the keyboard's focus) stays clear of both bars (WCAG 2.4.11). |
| Gutters and spacing | 16px gutters (`px-safe-4`), 12–16px between sections; rows 12–14px horizontal padding, at least 64px tall when they carry two lines and a picture. |
| Surfaces | One panel per list, hairline dividers inside; cards for objects that open (games); no frame around a single group that already has one. Colour and gradient are kept for meaning (a game's result, a selected tab). |
| Touch targets | 44px for everything a finger presses (tabs, rows, chips through `touch-target`, sheet rows 48px, a toast's dismiss button). |
| Titles | One `h1` per page; on phones the page tabs and the bar's title say where you are, so instructions under a title are left out (`PageHeader guide`), while a scope line ("Season 2026 · 6 games") always shows. |
| Interactive states | Pressed rows darken to `surface-2` (`active:`); the current tab, section or view is marked twice (colour and a pill, bar or weight); narrowed filters are accent chips; focus keeps the accent ring everywhere. The avatar tapped before the page's code has run shows pressed (`[data-early][aria-busy]`: `surface-2` in a ring of accent) until it opens the account screen. |
| Loading, empty, errors | Unchanged components: `Skeleton`, `EmptyState`, `PageError`; the match window shows its skeleton until the game has loaded. Results of actions are toasts, which sit above the tab bar (`bottom-tabbar`; near the bottom edge held sideways, where there is no tab bar); over an open window or sheet they are drawn inside it, in the same place. |
| Motion | The compact bar slides 200ms ease-out in short windows; sheets as above; the account screen rises 1rem into place in 200ms and fades out in 140ms; the title fades in 150ms. Everything respects reduced motion. |

## 6. Verifying

- `pnpm verify` (unit tests include the phone tab bar, `currentTab`, `profileBase` and `phoneParent`
  in `src/lib/nav.test.ts`).
- `pnpm build && pnpm test:e2e`: `e2e/mobile-nav.spec.ts` checks the frame on a phone (the five
  tabs, an account without Leaderboards whose fifth tab, Matchup Intel shown as "Intel", keeps every
  label on a 320px phone and held sideways, Back and its label, the title, the profile's sections,
  the account screen, including a tap made while the page's code is held back, the screen filling
  the smallest iPhone in both modes and at 150% text, touches that never move the page, the filter sheet and chips, a game opening full
  screen and Back closing it, the Players and Recent form rows, one primary navigation shown at a
  time in each posture, the account screen closed by Back and not reopened by Forward, upright and
  held sideways) and, on a tablet, the destinations in the top bar in both modes, one tap each, the
  current one's gradient bar, the bar at 100% to 200% text in both modes (`BAR_FIT`: its row's width
  and what a 768px tablet shows at each size written out, and beside the installed app's Back the
  icons alone at 125%), the avatar
  menu's items (Admin Mode's Data & Integrations and Audit Logs among them), Install App from it
  giving the focus back to the avatar, an early tap on the avatar, and that the avatar menu's Sign
  out reaches the browser's other tabs; `e2e/mobile-landscape.spec.ts` the phone held sideways: one
  compact bar with the destinations (only the current one labelled at 568px) and no bottom bar,
  hiding and coming back, a profile's bars at rest at most 90px and its band at most 80px on one
  line at five sideways sizes (with links, and with the longest line it is made for), a member's own
  Overview, the avatar opening the account screen at every width, Admin Mode saying the mode, the
  title and the current destination leading back to the top, and large text (the labels giving way
  at 38rem and 27rem of bar, the current destination kept in view);
  `e2e/account-screen.spec.ts` the account screen on seven phones with their safe areas (Chrome told
  an iPhone's insets), on five pages scrolled to the top, the middle and the end: it fills the
  screen exactly, nothing in it scrolls, every control is a full-width row at least 48px tall reached
  by a tap where it is drawn, the close button sits below the status bar at the top right, the
  screen has the focus and the page never moves, and nothing in it ends under the home indicator;
  a username far longer than the name wraps on the narrowest phones; its close button's touch area
  of 44px; held sideways at 100%, 125%, 150% and 200% text, upright at 150%, and at 200% on a
  320px phone in Player Mode, and in a page zoomed to 150% sideways, one scroll region in which
  every control can be shown whole; on a page pinched
  to zoom, a finger's drag pans the zoomed view; no frame of its motion more than 1rem from where it
  rests, at rest with every animation held at its first frame, at once with reduced motion; a page
  scrolled from script while it is open is put back; held sideways at 852px wide, the account
  screen too; the account dropdown's rows 44px tall on a tablet's touch screen; its notes' link
  closing the screen; `e2e/navigation-reach.spec.ts` the tablet's avatar menu (its focus, its
  closing on Back without reopening on Forward); `e2e/sidebar-motion.spec.ts` the same early
  click on the desktop sidebar's collapse control and account tile; `e2e/popups.spec.ts` the
  popups over windows (an ⓘ's bubble and a toast drawn inside the window, a toast never riding a
  window's motion and heard once, the focus a window takes as it opens and lets go when pressed)
  and, on a phone, the Filters sheet's pickers and the opponent picker opening their list in the
  window's body, a tap under an open list reaching what was tapped, the opponent search at 16px
  and the add-champion list above the tab bar (the WebKit workflow checks the tap-opened window's
  focus, the bubble and the toast in Safari's engine); `e2e/responsive.spec.ts`,
  `e2e/mobile-landscape.spec.ts` and `e2e/quality.spec.ts` keep overflow, targets, short windows and
  axe in check at every width.
  Team Overview's phone layout (the logo beside the team's name, the lineup's state and Edit
  lineup on the line under them, the role bar of icons and names over the track, no bench under
  it, and no later card's member's picture asked for while the first card's art loads) is in
  `e2e/team-layout.spec.ts`, and held sideways (2 + 2 + 1, no sideways track, no role bar, the 44px
  logo) in `e2e/mobile-landscape.spec.ts`.
- Safari 26's engine: `scripts/webkit26-check.mjs` (RESPONSIVE.md → Safari 26) opens every kind of
  window in WebKit 26.0, the engine that collapsed them, on four phones, an iPad and a Mac.
- Real devices: see RESPONSIVE.md → Safari and iPhones. Emulated phones prove layout and behaviour
  in an engine, not Safari's own toolbars or gestures on an iPhone. The account screen on a real
  iPhone, installed and in Safari, is the owner's check.

