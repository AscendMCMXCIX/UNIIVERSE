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

**One set of destinations everywhere (navigation N1, 19 Nov 2026).** The phone's bar holds the
desktop sidebar's four destinations, in its order, with its names and icons: **My Profile, Team,
Champion Lookup and Resources** in Player Mode, **Dashboard, Users & Permissions, Platform Settings
and System** in Admin Mode. A tablet's top bar and a phone held sideways show the same four, and so
does the installed app's icon menu (its shortcuts, each with its destination's own icon: a 96×96 PNG
in `public/icons/shortcuts` named after the bars' lucide icon, drawn by `scripts/shortcut-icons.mjs`
with sharp, in the accent on the app's background). `destinations()` in `src/lib/nav.ts` is the one
list every bar draws, and `src/components/nav-parity.test.ts` renders the sidebar, the tablet's bar,
the phone's bar and its sideways bar and holds them, and the manifest's shortcuts, to the same
entries, names, icons and order in both modes. Before, the phone's bar was Team's four sections and
Profile, with Matchup Intel and Resources hidden behind the avatar and two "Settings" in Admin Mode:
a member had to relearn where things were when switching devices (directive §2; ux-mobile.md N0).
The cost is one tap more to a Team section from outside Team, which the Team tab's memory removes in
the common case (below); the ten most common journeys take 20 taps from the landing instead of 22
(`e2e/journeys.spec.ts`).

Every phone page held upright has the same three parts, so a member always knows where they are and
how to get anywhere else (held sideways, the same destinations ride in one compact bar: "Frames by
posture", below):

1. **The top bar** (sticky): the team's mark on a destination's own page, or **Back** on a page
   reached from one (a teammate's profile, Settings), labelled with where it leads ("‹ Players",
   "‹ Leaderboards"). Once the page's own heading has scrolled up under the bar, the bar shows
   its words (the player's name, "Leaderboards"), so the title is in view however far down you
   are (the iOS large-title pattern). Once the page's own Filters has scrolled up under the bar, the
   bar offers it beside your avatar (PR 2b): a 44px button with the count of narrowed filters,
   named "Filters:" and what is chosen, opening the same sheet, which hands the focus back to it as
   it closes (the button stays while the sheet is open and while it has the focus, even once a change
   has brought the page's own Filters back into view); Done after a change brings the list's first
   item (the first game, the first player) under the bar, or as near as the page's end allows. With
   Back, the title, Filters and the avatar in the bar at large text, Back gives way first (its label
   shortens, its name stays whole for screen readers), so the bar never runs past the screen. At its right end, your avatar opens
   the account screen.
2. **The bottom tab bar** (fixed, within reach of the thumb): the four destinations, each one tap
   from anywhere (`destinations()` in `src/lib/nav.ts`, those the account may open: an account
   outside the team has no Team). The current one's icon sits in an accent pill and its name is
   bright, so it never relies on colour alone; My Profile shows your own picture when you have one.
   A teammate's profile belongs to Team (its Players), your own profile's sections to My Profile.
   - **The label ladder** (`TAB_FIT` in `mobile-nav.tsx`, a container query in rem on the bar, so
     the reader's text size counts and the bar is never wider than the phone): the whole names where
     they fit (Player Mode's four need 17.77rem since Champion Lookup took Matchup Intel's place, 23
     Nov 2026; 16.28rem before); then the short ones, "Profile" and "Lookup", the rest of each name
     read out only (15.50rem); then the icons alone, each name read out. A 320px phone has 20rem at
     100% text, 16rem at 125%, 13.3rem at 150%: so Player Mode shows the whole names at 100% on every
     phone and at 125% from 375px, the short names at 125% on 320px and at 150% from 390px, and the
     icons alone at 200%, and at 150% on 320 and 375px phones (before navigation N1, the five lost
     every label at 125% on 320–393px phones). Admin Mode's phone bars keep the short
     names, "Users" and "Platform" (14.63rem), at every width: shown whole, "Platform Settings" would
     put a second "Settings" on the phone beside the account's own. Each name is written once (the
     part that gives way is `data-name="rest"`), so what shows is always part of what is read out.
   - **Team's sections** (Overview, Players, Leaderboards, Matches, the desktop's names) are the top
     bar's second row on every Team page (below, "Sections of a page"). **The Team tab reopens the
     Team section last used** in this tab of the browser (sessionStorage; the iOS per-tab pattern), so
     "back to where I was" stays one tap; on a Team page the tab leads to Overview, and on Overview it
     goes back to the top. Admin Mode's Users & Permissions, Platform Settings and System do the same
     with their own tabs (`withSectionMemory`). A browser that keeps nothing simply opens each
     destination's first page.
   - **Nothing in the bar fetches a profile ahead of a tap** (`prefetchOf`): a profile's layout starts
     its player's Riot refresh, so My Profile prefetched on every page synced your own accounts every
     15 minutes of browsing (docs/HOSTING_USAGE.md, "Prefetches start Riot syncs"). A profile's
     sections in the top bar are not fetched ahead either.
   Tapping the current tab on its own page goes back to the top, and so does tapping the page's
   title once it has moved into the top bar (docs/DESIGN_SYSTEM.md, "The navigation contract").
3. **The account screen** (from the avatar: a screen of its own that rises over the page,
   `DetailModal size="screen"`): a bar with "Account" and the close button at its right; who is
   signed in (the picture, the name and the role, and the username on a line of its own where it
   differs from the name; a long name or username wraps, never cut short); then **the account's own
   items only**, as the desktop sidebar's footer and account menu hold them: one panel of full-width
   rows, 52px tall, each an icon and a name, Settings (with a chevron) and Install App; a second panel
   with the switch between the modes above Sign out; and at the screen's foot the team's small mark
   and name, the patch and Riot's notice, whose link closes the screen as it goes. Every page is a
   destination of the bar, so no row repeats one (navigation N1: before, Matchup Intel, Resources
   and in Admin Mode Data & Integrations and Audit Logs were rows here, and Admin Mode had two
   "Settings"). The row of the page being shown is marked, and pressed it keeps the page as it is,
   closes the screen and goes back to the top, as the current tab does. **Back closes it** and the
   page stays as it was (`useBackCloses`: the screen has a history entry of its own, the same address
   with the window's mark, so the browser's Back, a phone's system Back and the installed Android
   app's leave that entry; Android's back gesture asks an open dialog to close first, which ends the
   same). Closed by its button, Escape or a choice, it takes its entry away again; a row that leaves
   the page replaces the entry, so Back from Settings returns to the page the screen was opened on.
   Forward never reopens it (coming back to a page never opens a window unasked); Install App, opened
   from it, takes over its entry. It is fixed to the screen's four edges, under the status bar and
   the Dynamic Island, clear of the notch sideways, and its content keeps a readable column (28rem) in
   the middle of a wider screen. Everything is in view without scrolling on every phone from 320 by
   568 at the usual text size, in both modes. With large text, or held sideways, only its body
   scrolls, as one region, and the bar with the close button stays put. With large text a row's name
   wraps between its words instead of ending in an ellipsis, and on a narrow phone the row gives its
   words the room (`lib/sheet.ts`, 19 Nov 2026): a page's chevron goes where the row is under 12rem
   (150% text on a 320px phone, 175% on 375px), the icons where it is under 10.25rem (175% on 320px,
   200% on 375px), so every row's name is whole from 100% to 200% on 320 and 375px phones in both
   modes. On a page pinched to zoom, a finger pans the zoomed view across it. The close button is a
   quiet 36px circle whose touch area reaches 44px. The screen takes the focus itself as it opens
   (nothing lights up; every window opened by a tap does the same, below), Tab reaches the close
   button and the rows in order, Escape or the close button closes it and the focus goes back to the
   avatar, and the page behind never moves. It replaces both the menu drawer and the account dropdown
   on phones. See "Why the account menu was a strip on iPhones" below.

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
| Phone held sideways | 480px tall or less, below `lg`, whatever its width | **One compact bar**, 44px plus the status bar's inset, and no bottom bar: Back or the team's mark (the mark alone, no name; in Admin Mode "Admin mode" beside it in the accent, left to screen readers where the bar is narrower than 32rem, and always part of the mark's name), the four destinations, the page's title where the destinations leave it at least 6rem, Filters (PR 2b), the avatar, which opens the account screen. Each destination is a 44px target; the current one is lit twice (its icon in an accent pill, its name shown and bright). By the label ladder (`SIDEWAYS_FIT` in `mobile-nav.tsx`, measured with Filters in the bar too): Player Mode's whole names from 34.75rem (31.4rem needed, 34.4rem with Filters), the short ones from 30rem (26.6rem, 29.6rem), then the current one's alone from 23rem, then the icons alone (Champion Lookup's names, 23 Nov 2026); Admin Mode's short names from 37rem, the current one's alone from 24rem. So a 568 × 320 phone names all four by their short names at 100% text (in full while Matchup Intel's shorter name was there; the five before could name only the current one), and an installed iPhone 15 held sideways (852 × 393, 734px between the notches) names all four in full to 125% and the current one alone at 150%. Past the last step the row scrolls sideways inside the bar, the current destination kept in view whenever the row changes size (shown by a turn of the phone, or a text size). The current destination is marked as the upright tab bar marks it, so a turn keeps the signal. A profile's sections, or a destination's tabs (Team's sections), are a 44px second row (44px targets, as everywhere on a touch screen): the bars at rest are at most 89px. The bar slides away while the page scrolls down and comes back on a scroll up, with the short-window rules it had (distances from where the scroll last changed direction, so slow drags count; back while the focus is inside it). The page's own tabs are not repeated in the page. |
| Tablet | `md` to `lg`, taller than 480px | **The destinations in the top bar**, one tap each: the sidebar's four in both modes, My Profile, Team, Champion Lookup and Resources (Team marked on all of its sections, which stay the pinned tabs in the page; Champion Lookup on its page whatever champion it shows, Resources on the Library alone), and Dashboard, Users & Permissions, Platform Settings and System (each with tabs pinned in the page; the team's name, which says "Admin mode", stays beside the short names, "Users" and "Platform", until 39.75rem, the whole names from 49.75rem). The current one is marked with the sidebar's four signals: a neutral lift with a hairline of light, the brand's gradient as a short bar at its foot, its icon in the brand blue, its name bright. The drawer is gone. The avatar opens the account menu (`AccountMenu`), which holds what the desktop sidebar's footer holds: Settings, Install App, the switch between the modes above Sign out, and the patch and Riot's notice at its foot (the account's items only, in both modes). At a larger text size the team's name beside its mark gives way first, then the whole names to the short ones, then to the icons (`BAR_FIT`: Player Mode's four need 43.9rem with the name, 37.8rem without, 31.7rem short since Champion Lookup took Matchup Intel's place (23 Nov 2026), so the name gives way below 44.4rem, the whole names below 38.25rem and the short ones below 32.1rem; Admin Mode's need 49.3rem with the name and the whole names, 39.4rem with the name and the short ones, 32.8rem short alone: its name, which says the mode, stays with the short names and gives way below 39.75rem; its whole names show from 49.75rem and its short ones down to 33.25rem). The bar's gutters are 1rem a side and grow with the text, so a 768px tablet's bar is 46rem at 100% text, 36.4rem at 125%, 30rem at 150% and 22rem at 200%: in Player Mode it keeps the name and the whole names at 100%, the short names at 125%, and shows the icons alone from 150%; in Admin Mode the name and the short names at 100%, the short names alone at 125% (before, the icons alone from 125%) and the icons alone from 150%, and as a last resort the list scrolls sideways inside the bar. Back, which the installed app adds on a page reached from another, takes about the room the name had (Back as "Team" with its gap 4.7rem, the name with its gap 6.1rem), so beside it each step comes sooner (Player Mode's whole names below 42.9rem and short ones below 36.8rem, so at 110% on a 768px tablet the four show their short names beside Back and at 125% their icons, rather than scrolling; Admin Mode 56.75rem and 40rem), and where both show the name shortens first; a longer Back label, such as a teammate's long name ("Demo Sub (Support)"), can still leave it 7px short at 768px and 100% (Leaderboards' heading, "Leaderboards" since it became one page, fits at 100% text; "Team Leaderboards" left it 4px short). These sizes are the root's (the specs' way to emulate large text); a real text-size setting moves the `md` breakpoint too, so at 125% a 768px window has the phone's frame and the tablet bar starts at 960px, 46rem wide (RESPONSIVE.md, "Two ways to emulate a larger text size"). |
| Desktop | `lg` and up | The sidebar, unchanged. |

**What moved where (navigation N1, 19 Nov 2026).** Nothing was removed and every address is the
same; each item is where the desktop has it.

| Item | Before | After |
|---|---|---|
| Team's sections on a phone | four of the bottom bar's five tabs ("Team" meant Team Overview) | the top bar's second row on every Team page; the Team tab reopens the last one used |
| My Profile on a phone | the fifth tab, "Profile" | the first tab, "My Profile" (its short name "Profile" at large text) |
| Champion Lookup (Matchup Intel's place) and Resources on a phone | rows of the account screen behind the avatar (two taps; "‹ Team" when opened directly) | tabs of the bar, one tap, with no Back on their pages |
| Matchup Intel's champions once scrolled away (S7a, 20 Nov 2026) | scroll back up to the slots | a pinned pair bar under the top bar (40px portraits and the swap): a champion changed in two taps; the lane a full-width row of five 44px buttons, "Copy link" at the title's row end; the data source in the sources' line at the foot, so the bar's meta keeps to one line (docs/MATCHUP_INTEL.md, "Roles") (retired with Matchup Intel on 23 Nov 2026) |
| Matchup Intel's first screen (20 Nov 2026) | the curated briefing first; the enemy's kit at about 1,450px and the evidence at about 2,640px on a 390 × 844 phone, below the remembered line (44px) | the glance under the pair: every enemy tile with its cooldown line (five tiles of about 68 by 56px; two rows in the bot lane) and the evidence's first row, on the first screen for 1v1 and 2v2 (401 and 650px of 787 at 390 × 844); "Remember" an icon toggle beside "Copy link" (docs/MATCHUP_INTEL.md, "On a phone") (retired with Matchup Intel on 23 Nov 2026) |
| All Champions' Filters (20 Nov 2026) | a row of its own under the scope line | at the end of the title's line (the title itself read out only on phones), the scope's one line under it, as Season performance's (SectionHeader's `toolbarBesideScope` as Release 8 has it): the list starts 14px higher at 393 × 852 |
| All Champions' Filters (Release 10, 20 Nov 2026) | at the end of the title's line, a 44px row of its own above the scope line (the title is read out only) | in the list's search and sort row: the search, Filters (its icon, the count on its corner, its word and what is chosen read out) and Sort by on one line from 375px; on a 320px phone the search and Filters keep their line with Sort by under it; where a large text size leaves the search too little room beside Filters, Filters ends the "Sort by" line. Refresh, where it is offered, sits beside Filters (its icon). The chips of narrowed filters keep their line above the scope; the sheet, Done, Escape, the focus's return and the address are as before. From sm (640px) nothing moved. The list starts 44px higher at 393 × 852 (322 → 278px), 44 at 375 × 667 (303 → 259) and 44 at 320 × 568 (355 → 311). Release 10's review: the search's short placeholder "Find…" read "Fin…" at 375px (42px of room for 47): while empty, its padding there is 4px less beside the icon and 6px at the end (52px); and sorted by a figure (`?sort=multikills`, kept now as the filters change) a row's sorted figure wraps under a 17rem list instead of pushing the page 59px sideways at 320px and 200% |
| Admin Mode's pages | Dashboard, Users, Settings and Health in the bar; Data & Integrations and Audit Logs on the account screen (a tablet's avatar menu) | Dashboard, Users & Permissions, Platform Settings and System everywhere, System holding Health, Data & Integrations and Audit Logs as its tabs; Users & Permissions' pages on the section tabs, not pills |
| The account screen | the pages the bar did not hold, Settings, Install App, the mode switch, Sign out, the notes | the account's own items only, with the team's mark at its foot; Back closes it |
| The installed app's icon menu | Team Overview, My Profile, Matches, Leaderboards | My Profile, Team, Champion Lookup, Resources, read from the navigation |

**What moved where (frames by posture, 18 Nov 2026).** Nothing was removed: every destination,
action and account item is reachable in every posture.

| Item | Before | After |
|---|---|---|
| A phone held sideways: the five destinations | a compact bottom bar below 768px wide; the tablet's drawer (two taps) from 768px | the one compact top bar, one tap, at every width |
| A phone held sideways: the account items (Champion Lookup and Resources, Settings, Install App, the mode switch, Sign out, the notes) | the account screen below 768px; the drawer and the account dropdown from 768px | the account screen at every width |
| A phone held sideways: a profile's sections | the top bar's second row below 768px; the page's tabs from 768px | the compact bar's second row (44px) at every width |
| A tablet's destinations (My Profile, Team, Champion Lookup, Resources; Admin Mode's pages) | the drawer, two taps | the top bar, one tap (Admin Mode's Data & Integrations and Audit Logs: the avatar menu, two taps as before) |
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
before it, so Back leads to the page above it instead (`phoneParent`: a teammate's profile → Players;
Settings → home). Every destination's own pages have no Back: they are where you start. That is
Team's four sections, your profile's, Champion Lookup and Resources, and every admin page under its
entry, so no page claims "‹ Team" unless it is under Team (before navigation N1, Matchup Intel,
Resources and Settings opened directly all said "‹ Team"; Settings still leads home, Team Overview
for a member, by its name). Back also closes what is open over the page and leaves the page as it
was: a game, a champion's window, the account screen, the install window and the Team player Peek
(each with a history entry of its own: `?match=`, `?champion=`, `?player=`, or `useBackCloses`).
The Filters have none: a choice in them replaces the query, and an entry under it would make Back,
or a close while the choice loads, restore the old address (tried and taken out in S4a, 20 Nov
2026). Android's Back closes the Filters sheet as it closes any open dialog (its close request), so a phone's system Back, the
installed Android app's included, works as the browser's does (`e2e/journeys.spec.ts`). A page that adds history entries of its own address (a window's own entry) is still one
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
- **A destination's tabs** (Team's Overview, Players, Leaderboards and Matches; Admin Mode's
  Users & Permissions, Platform Settings and System) ride in the top bar under its first row on
  every page of the set, the same 44px row as a profile's sections (`ChromeTabs`), with the
  desktop's names, so they stay in reach however far the page scrolls; the page's own row of tabs
  (tablets and desktops) is not repeated on phones. Each section is a page of its own (Back goes
  through them, as on the desktop). Team's four names fit a 320px phone at the usual text size;
  with larger text, where the names would no longer fit the row whole, the row gives way to one
  44px "Section: Players ▾" button that opens a sheet of them all (`ChromeTabs fold`: Team's below
  19rem of row, a profile's below 17.5rem: 125% text on a 320px phone, 150% on a 393px one), so no
  name is ever cut off or scrolled out of sight. Only the icons are left out on phones, as the page's
  tabs leave them out below 640px.
- **Champion Lookup and Resources** (the Library) are destinations of their own, one page each, with
  no tabs (Matchup Intel's place since 23 Nov 2026; from 18 Nov 2026 Matchup Intel's, before that
  the two were Resources' tabs at the top of both pages): tabs of every phone's bar since navigation
  N1 (19 Nov 2026), Champion Lookup before Resources.
- **A page's views** (Match History's Games and Encounters) share one quiet track (`SubTabs`).
  Leaderboards has none since 19 Nov 2026: Recent form and the season's records and achievements are one
  page, its sections below Recent form reached from the index under its header.

### Pinned section index (Leaderboards, 20 Nov 2026)

A long one-column page whose sections a reader jumps between keeps its index in reach: once the
header has gone up under the top bar, a row of 44px chips pins at the bar's foot (fixed, so nothing
moves), the section being read marked, and the page's scroll padding takes the row's height while
the page is open. It follows the bar's first row as it slides away, and is not drawn where its chips
would need more than two lines (large text: the index under the header stays the way). Leaderboards
is the first page (`leaderboards-index.tsx`; docs/TEAM_LEADERBOARDS.md). The Library's section
index wraps onto two lines of 44px chips on a phone instead of scrolling sideways (UM.R1).

### Phones held sideways

Short windows (480px tall or shorter, below `lg`) have one compact bar holding the four
destinations, a profile's sections or a destination's tabs under it, and no bottom bar ("Frames by
posture", above); it slides away while the page scrolls down, and a scroll up brings it back.
Nothing is lost when a phone turns.

## 3. Data presentation

The rule: **the first screen answers the question the page exists for**, and more is one obvious
tap away. Nothing is removed from the product: what a phone leaves out of a list is in the detail it
opens.

| Page | Phone layout | Height at 390px (`main` at f4e5372 → this redesign) |
|---|---|---|
| Team (Team Overview) | One 44px line under the bar (the scope over the lineup's state, Edit lineup at its end; the bar carries the team's mark and name), then the lineup as a carousel (the owner's request of 23 Nov 2026; the lineup pager of the players' pictures over a track with a glimpse of each neighbour before): one card at a time across the page's width inside its gutter, no other card in view at rest, swiped left for the next player and right for the previous, looping (past Support comes Top, before Top Support) with nothing jumping at the wrap; five position dots under the card (44px targets, the card in view a longer blue pill; tabs named by the role and player, ← → and Home/End on them, ← → from a card too; the position said to screen readers once the carousel comes to rest). Each card's picture beside the name (art band 120px), so the whole first card fits 393 × 659 and 375 × 667. The public team page has the same carousel. Held sideways the desktop's five across, compact (RESPONSIVE.md → Team Overview's lineup). At a larger text size each card holds its text: its season's figures and its first choice wrap, the role's chip shows its icon alone where its name does not fit beside the card's controls, your own card's two controls stand one above the other, and a member's lineup state takes the line under the logo (RESPONSIVE.md → Phones at a larger text size). | — |
| Players | One panel, a row per player, 64px tall: picture in its frame and the name in the player's own style with their emblem, the status that matters at the line's end (Lineup; "Setup" for an unfinished setup, its whole meaning read out and in its title; Archived), a long name wrapping beside it rather than pushing it down; then the main role (its icon in the card's colour, its name read out), the rank ("No Riot account" without one) and the pool as many whole portraits as fit plus a count, a line that wraps rather than cuts with larger text; the tagline on a third line only for those who have one. At 175% and 200% text on the narrowest phones a row stacks: the picture on a line of its own, the name, role, rank and pool the row's width under it, and the "·" before the rank never starts a line. A row carries the card's colours but no art, card frame or effect, and nothing is downloaded for a look. The whole row opens the profile (the card, links and every pool). The count is the title's scope line ("9 players", with what narrows it). The same rows on every width since the roster board (Nov 2026): two up on a phone held sideways. Below 768px wide the title, search and Filters then share one row (from 35rem; a split screen or a zoomed small phone stacks them, so the search keeps its width); a large iPhone in Safari, laid out at the screen's whole width (852px on an iPhone 15), keeps the tablet's toolbar on a row of its own. | 2,966 → 1,227 → 850px |
| A profile's Overview | The profile's band, then the season's figures (three across, the multikills one line from 375px, total kills under the KDA), Recent form's twenty games and the champion pools. At a larger text size the figures go two across, then one, Recent form's bars share the card's width, and under the narrowest lists the pools' figures take the row's width and name themselves in words (RESPONSIVE.md → Phones at a larger text size). | — |
| All Champions (a profile's Champions) | The section's title is left to screen readers: the Champions tab in the top bar names it. The scope line, "6 champions · Season 2026 · All supported games", ends in the data status's ⓘ; the search, Filters and Sort by share one row from a 375px phone (the words "Sort by" read out only; Filters its icon with the count on its corner; Refresh beside it where offered), and on a 320px phone the search and Filters keep their line with Sort by under it; Filters never takes a line of its own, at any text size (Release 10). A row per champion, at most 64px (57px on the demo at 390px; S5, 19 Nov 2026): the 40px portrait, the name over its role and In pool, the win rate over the games at the right. Sorted by a figure other than games or win rate, that figure follows the role in place of In pool ("Top · KDA 2.74"); the labelled pairs under each row are gone. At 150% and 200% text each row stacks (the name, then the win rate and games), so no name is squeezed out and nothing is wider than the phone. A champion opens its **preview as a sheet** (the shared `Peek`, `DetailModal size="sheet"`): ‹ › to the next champion, ✕, pull down or Back close it, and the list keeps its place; its content is the portrait and role, the win rate and record, then the record against each lane opponent first (docs/MATCHUPS.md). On Demo Sub's Sion the sheet is 394px at 390×844, with every opponent on its first screen. The first screen (S5's acceptance, a test in `profile.spec.ts` since Release 11): 8 whole rows above the tab bar at i12 (390 × 844 with its safe areas; at least 7 required), 3 at se1 (at least 2), in Chromium 153 and Chrome 156. | 101 → 57px rows at 390px |
| Leaderboards | Built for phones in #188 (docs/LEADERBOARDS_MODEL.md), rebuilt as rows in PR 5a: Recent form is one board with a two-line row per member: the place (a bracket joins shared places, "4="), the picture with the main role as a badge on it, the name and "You" with the win rate at the right end, then the record and dates, with the gap ("1 win behind", "Next win: 3=") at the line's right end under the win rate (on a line of its own, still at the right, when the dates or the gap are long: most rows at 360–375px), and the record's 20-game bar as a 2px line along the row's foot. Members with too few recent games are the board's last group, a row each with the games they need. Since 19 Nov 2026 one page, stacked for a phone (no views to switch): the title, the member count and the data status ⓘ on one line; the sections below Recent form as in-page links ("Season records · Multikills · Milestones", each jump landing under the top bar, focused, an entry the phone's Back steps past); Recent form; then the season records, each a cell of three lines (the record and its qualifier; the holder, the value at that line's end; the champion, role, K/D/A and date), each opening its game (a member's cell adds "Your best" as a fourth line, by design; the 77px cells are a viewer's without a profile); then the multikills, one line per member from a 21rem list (375px phones and up), and the milestones, the member's name over one line of chips, each the champion's portrait and the figure ("486K") without the champion's name, which screen readers still hear (D6). What each board counts is under its title, its explanations behind its ⓘ, never a paragraph. The frame adds the tab, the title in the bar and Back; the whole row is one link to the member's profile. At a larger text size Recent form's rows reflow (the record and the dates a line each, the win rate under the name, then the name under the place and picture, "You" under a name it would break), so names wrap only between their words (TEAM_LEADERBOARDS.md). | 1,093 → 1,037px (#188); 1,004 → 920px (PR 5a, rows 61–106 → 64px from 390px, 64–74.5px at 360–375px); Records 3,905 → 2,195px at 393 × 659 (PR 5b: 5.93 → 3.33 screens; record cards of 169–209px → rows of 85px, 101px with a qualifier on a line of its own; three whole records above the tab bar instead of one); one page (19 Nov 2026) 2,772px at 375 × 667 (Recent form 1,072px and Records 2,204px before, two pages, 3,276px together; record cells of 77px, 93px with a qualifier on a line of its own) |
| Matches | Each game: one line of words (result, length, queue and date; how many members played is read out only, the rows under it being the members), a Ranked Solo/Duo game of three or more saying under it that Solo/Duo takes parties of two at most; then a row of about 40px per member: the champion's portrait with the member's picture as a 16px badge on its corner, the name whole (a long one wraps, never cut, at 320px too) with the K/D/A and the largest multikill right after it, then the role and champion. Both full teams are in the game's screen, where the scoreboard lists all ten. Bookmarked sits beside Filters; the summary line's (i) holds the rule and any games left out. | 2,330 → 1,528px; 1,528 → 1,411px at 393px (the UX pass's PR 7c: 2.32 → 2.14 screens in Safari's 659px; 1,824 → 1,555px on a 320px phone) |
| Match History | Denser since 18 Nov 2026 (the owner's decision D8: docs/DESIGN_SYSTEM.md §1). The header is one row from a 320px phone up: Games and Encounters (their track without icons, hugging its 44px tabs), Filters and Refresh (Refresh shows its icon alone, and under 360px Filters too, their names kept for screen readers); a narrowed filter's chips take the next row when they do not fit beside the views. The scope line follows, its data status after its last word; the header is read and tabbed in that order. Then the summary, every figure at once in three lines from 393px: the last twenty as squares (sharing what their line leaves, never under 3px) with the streak ("4W streak") and a named trend ("Better +9 pts"), the ⓘ beside "Last 20"; the record, KDA, CS or vision and kill participation; the champions played most and the ladder change ("+45 Solo/Duo since 3 Nov"). At 375px a streak beside a named trend takes a second row on the first line, and the longest ladder label or a two-digit record on a champion can take the ladder change to a fourth line; a 360px phone's ladder change does too, and a 320px phone wraps more. Each game, about 118px: the result line across the card ("Victory · Solo/Duo · 40h ago"), a ranked game's LP at its end; the portrait, the champion and role with the build under them (from a 21.375rem list: phones of 374px and wider; on narrower ones kill participation sits there and the build ends the card) and the K/D/A with its ratio and largest multikill; then kill participation, CS and damage. A card is read in the order it is drawn. The result line wraps rather than cut the time off. Both teams move to the game's screen. Ten games a page; the pager's buttons are 44px, and on a narrow phone the pages either side of the current one give way to the arrows, so both arrows stay on its line. **What moved:** Filters and Refresh from a row of their own to the views' row; the LP from under the K/D/A to the end of the result line; the build from the card's last line to beside the champion; on phones under 374px kill participation to beside the champion; the summary's ⓘ from its end to beside "Last 20"; the streak's words ("4 wins in a row") and the ladder change's "points", at every width, and on a phone the trend's "lately", into the figure's title and its screen-reader text. **Encounters:** the same one-row header; its Minimum games and Sort by moved from the list's toolbar into the Filters sheet, as chips that count with the filters, shown beside Filters when they differ from their default and put back by the sheet's Reset; tablets and computers keep them in the list's toolbar, as the list's own: the filters' Reset neither counts them nor changes them there. At 200% text on a 320px phone neither view is wider than the phone and nothing in a card is cut. | 2,268 → 2,000px; 2,016 → 1,639px with D8 (Demo ADC, `main` at 390 × 844) |
| Champion Lookup | One column (Release 16, 23 Nov 2026, in Matchup Intel's place; docs/CHAMPION_LOOKUP.md): the title and the source line; the search, full width, 16px, its matches dropping under it; All champions and Descriptions on the next row; the panel: the champion's 48px portrait, name and title, then Ability haste, its nine quick values as a group of five and four 44px buttons with Other beside them; then the five abilities, each its icon, key and name, the cooldown under the name as one line per kind ("7 / 7 / 7 / 7 / 7 s", "At 20 haste 5.83 / … s"), wrapping between ranks only, or why there is no number. The page scrolls on a phone (about 1.3 screens at 390 × 844) and never inside itself; nothing wider than the phone from 320px at 200% text (`e2e/champion-lookup.spec.ts`). |
| Resources (the Library) | A full-width search, then the index: All, ★ Favourites and each section with its count (the counts follow the search), one choice that filters, in a row that scrolls sideways. The ★ segment is in the server's page with an empty slot of its count's width, which fills once favourites are read from this browser, so nothing moves; chosen, it shows only the starred sites (and, with none, what the star does). Then one panel: a heading per section (an `h2`) with its count, hairlines between the rows. A row: the site's icon, its title (it wraps, never cut), the host beside it (cut first) and ↗, and its description, whole on a touch screen; the whole row opens the site in a new tab, the star at its end keeps a favourite in this browser. At a larger text size (under 16rem of list) the icon and the star take a line of their own over the title and description, which get the row's width. The live count is left to screen readers (each segment says it); an empty library says "No resources yet." on screen too. Held sideways, from 640px wide (an iPhone 15; a 320pt iPhone held sideways is 568px and keeps the upright layout), the search and the index share a row and the sections are panels in two columns. | 1,726 → 1,284px at 393 × 659 (#292's tabs included; 2.62 → 1.95 screens) |
| Settings | A compact account card leads (`surface-lead`), read in the order it is drawn: the picture beside the name, @username and a neutral role badge; a row of quiet links (My Profile, Riot Accounts, the mode switch, Sign out; wrapped lines 12px apart, so a link's 44px touch area stops short of the link drawn above or below it); Change and Remove; what the picture is for; the index as chips (Name, Links, Password: Leaderboards' `SectionIndex` drawn as the plan's chips, 44px, the section being read marked; each jump through the router's history, so Back still leaves the page in one step). At a larger text size (200%, or 150% on a 320px phone) who you are goes under the picture, so the longest role, Administrator, stays whole. Then every section stacked, the password form included, each field with its own Save on one 44px row ("Save" on screen, "Save display name" read out). In a window 480px tall or less the card is the same, and from 640px wide (an iPhone 15 held sideways) it is a column of its own beside the sections. Sign out is on the first screen at every size. | 1,512 → 1,358px at 393 × 659 (the owner; 2.29 → 2.06 screens); a member with Social links 2,060 → 1,955px (3.13 → 2.97) |

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
| Open a game | The game takes the whole screen (the match window), as a new entry in the browser's history, so Back (the button, the edge swipe, Android's key) closes it. A 52px header (the result and champion, a ranked game's LP, ✕), one scrolling body (the meta line, the loadout, the rune line, six figures in 3×2, the lane, the notes, then the scoreboard in two-line rows of about 48px and two folds) and a 60px bar: ‹ Previous · "Game 3 of 10" · Next ›, 44px targets. Previous and Next replace the address (no new entry), show the next game from its top and announce it ("Game 4 of 10: Defeat on Jax"); there is no swipe (it would fight iOS's edge swipe). Closing leaves the list on the last game viewed, with the focus on its card. At 390×844 the whole game is under two screens and the scoreboard starts at about 650px. Its scoreboard keeps the marks for players met in other games; following one closes the game, and Back returns to it. | A scoreboard inside a list is a detour on a narrow screen; reading the next game should not mean closing this one. Desktop keeps the game under its card. |
| A record's game, a player met | A record's game opens over Leaderboards in the same window (`/leaderboards?match=`, "Open in Match History" inside; Back closes it on the board). Team Matches' window has the same ‹ Previous · "Game 3 of 10" · Next › bar. Encounters (S6c, 20 Nov 2026): the highlights share one line, a highlight about the list's first player is left out (it repeated the row under it), the search waits behind the toolbar's icon (open while it holds a search) and the counting ⓘ sits on the scope line, so at 390 × 844 the list starts at 291px (411 before, about 540 when audited). A player met opens their games as a view (`?met=`, one entry); Back or "‹ All encounters" returns to the list at its exact place, the focus on that row. From lg, where Games shows Refine beside the same filters, Encounters keeps it in view, off, with its reason (UD.H4); a tablet's toolbar keeps its place beside the views. | The list is the page: chrome above it costs players on the first screen, and a way back that loses the place costs a scroll each time. |
| A champion, a player from Team | The existing detail windows, which already take the whole screen on phones. A Team player is a Peek (`ui/peek.tsx`): on phones and short windows the whole-screen window, with the player in the address (`?player=`) and one history entry pushed, so Back (Android's key too) closes it however many players were seen; from 640px wide (a fine pointer) it is the docked panel beside the lineup. | One container per kind of content (DESIGN_SYSTEM §7). |
| Account, Settings, Sign out | The account screen, from the avatar. | One menu, not two, every entry a full-width row in reach of the thumb. |
| A short question or form | `Dialog`: the same sheet as every other (built on `DetailModal`). | One sheet: one look, one motion, one height rule. |
| Confirm something that cannot be taken back (Admin's setup jobs, a job turned off, a delete with a profile) | The same `Dialog`, docked: the phrase to type above a 16px field (no zoom in Safari), the keyboard capitalising as it likes (any case matches), and the danger button beside Cancel, enabled once the words match. The two deletes of an account stay together on their row and wrap as a pair (S1a, 19 Nov 2026; `e2e/admin-safety.spec.ts` at 375px, `e2e/webkit.spec.ts`). | A deliberate pause that fits a thumb, without a second screen. |

**The phone window shell** (S4a, 20 Nov 2026; DESIGN_SYSTEM §7): a window that takes the whole
screen collapses its header to a 56px bar once its body scrolls (the item's name and the controls
stay in reach), opens it again at the top, and closes when its header is pulled down, as a sheet
does (not the account screen, a screen of its own with nothing to pull). Closing any window moves the page 0px: the browser's own close no
longer puts the focus back itself (it scrolled a row partly under the tab bar into view, 70–109px
when audited); the focus returns with `preventScroll` (`e2e/overlay-kit.spec.ts`). A plain title
bar collapses too, its title on one line (Release 10), and the window's own controls stay 44px on
touch screens at every text size, and the 56px bar is 56px at every text size, so once the body has
scrolled every whole-screen window's frame is at most a quarter of a 320 × 568, 375 × 667 or
568 × 320 screen at 100, 150 and 200% text.

**At 320px with large text** (Release 10's sweep, `e2e/overlay-kit.spec.ts`): the player Peek on
Players and Leaderboards keeps every control on the screen at 125–200%, upright and sideways; in its
pool (the Team player window's too) a list under 15.5rem (a 320px phone from 125% text) gives each
row three lines (portrait and name, the experience label, the figures), and the label wraps where
it must. A confirmation's actions wrap rather than run off the
screen; Manage access keeps one column no wider than the sheet; a switch's long word breaks,
hyphenated; a lineup sheet's names wrap instead of being cut to nothing; the sign-in form's brand
name wraps. Popover and the desktop `Select` do not open on a phone (the browser's own select is
used there).

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
beside its ⓘ (Escape closes the bubble, not the window; a tap anywhere closes it, and that tap does
nothing else; where neither side of the ⓘ has room, large text on a small phone, the text opens as a
small sheet at the screen's far edge instead, never over its ⓘ and never scrolling), and the toasts in their usual place above
the tab bar, where their buttons answer a tap. The toasts go into a window once it has risen into
place and leave it as it starts to close, so they never slide with a sheet; a toast raised as its
window closes (Save, then the window goes) is announced on the page. In a window, a picker's list
opens in the window's body, never as a list scrolling
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

### The phone header budget (S2b, 20 Nov 2026)

Every phone page spends its first screen on content, not on saying where you are twice:

- **One title row, or none where the bar names the page.** Team's sections (Players, Leaderboards,
  Matches) and Admin Mode's set pages read their h1 out only on phones (`PageHeader sectionNamed`):
  the sections row names them, and the scope line leads. Admin Mode's eyebrow and description go on
  phones (`PageHeader admin`): the bar says the mode once. With nothing left to show (no actions),
  the whole header is read out only, so its stack margin goes too and the page's content starts
  under the bars (G4-1: y 117 at 390 × 844, from 133–137).
- **Team Overview** on members' phones: no logo or h1 on screen (the bar carries the team's mark and
  name; the h1 is read out), one 44px line of "Main lineup · Season 2026" over the lineup's state,
  with Edit lineup at its end (44px, 102px before). The public team page keeps its own header.
- **A profile's sections other than its Overview**: the band is in the top bar from the first paint,
  the name over the rank beside Back ("‹ Players  Demo Mid / Platinum IV · 57 LP";
  `ProfileHeader`'s bar title, placed by globals.css `[data-bar-title]` after Back, a fixed 5.25rem
  there, or after the team's mark on your own profile, and clear of Filters and the avatar). The
  section starts right under the sections row (it gains the band's 86px and its gap, about 170px at
  150% text). The Overview keeps its full card.
- **Profile Overview within two screens** (20 Nov 2026, PLAN S8a; the owner may veto, OD20): on a
  touch phone (`posture.ts`) the primary pool shows its top three champions with "All N", the off
  roles are one Show under their heading, and Ranked progress shows its heading and the current
  rank, LP and the year's wins and losses, with a 44px chevron for the account line, the queue and
  account switches, the last 30 days, the highest rank and the chart (`phone-fold.tsx`). Nothing is
  dropped: each is one tap away, and editing the pools shows every champion. Tablets and desktop are
  unchanged. Measured: 1.92 screens at i15 (2.40 before) and 5.84 at se1 with 150% text (7.49);
  a member's own Overview 1.90 and 5.92.
- **No lone Filters row**: Profile Overview's Filters and Refresh sit at the end of the title's
  line, the scope line under them across the width (`SectionHeader toolbarBesideScope`; until 20 Nov
  2026 at the scope line's end, which squeezed the scope into nine lines at 320px with 150% text).
- **No paragraphs**: Riot Accounts leads with "Main account first; every linked account adds its
  games", Settings' fields with one line each; the rest is behind an ⓘ, each tip 25 words or fewer.
- **44px targets** on touch for every segment (`segmentClass`, filling its 44px group), ⓘ, tab link,
  Team Matches' member names and the profile nudge.

### The frame slides away (S2b)

On an upright phone the frame (top bar, sections row, tab bar) took 29% of the screen at rest, 38%
at 150% text and 44% on a 320 × 568 phone at 150%. Where it crowds the first screen, from 125% text or
on a phone under 700px tall (`UPRIGHT_SLIDES`, in rem, so a larger browser text size counts), the
top bar's first row and the tab bar slide away while the page scrolls down and come back on any
scroll up, at the top of the page, and while they hold the focus; the sections row stays pinned under
the status bar. After a 100px scroll the frame then takes 15% at 150% text and 11% on a 320 × 568
phone at 100%. This revisits the 8 Nov synthesis's C1 (a fixed frame upright) on the measured
share. Taller phones at the usual text size keep both bars in place. Held sideways nothing changes:
the one compact bar slides away whole, as before.

What the page brings into view itself (a game's card after its window, the next page's first game,
a list landed after a filter, a jump to a section) stops 8px under the bar as it will be once the
page has moved (`scrollToStart`, `src/lib/screen.ts`): under the sections row on a move down, as the
row goes, and under the whole bar on a move up, near the top, or where the focus goes back into the
bar, which keeps its row while it has the focus (Filters' sheet, opened with the focus on the bar's
Filters, hands it back there; Safari focuses no button it taps, so there the row goes). The scroll
padding counts the row from the moment the focus comes into the bar (R6 review BX2).

### Page budgets

One set of ceilings with two runners (`scripts/page-budgets.mjs`): for every Player and Admin page,
its height in screens, the frame's share at rest and after a 100px scroll, sideways overflow (none
allowed), and touch targets under 44px on the first screen.

- **`node scripts/ux-measure.mjs http://127.0.0.1:3900`**: the full matrix (35 pages: S8a's 12 newly audited pages and S9c's Access levels, Personal data, Previews and Resources joined the 19; × 7 setups ×
  100, 125, 150 and 200% text, about 980 loads, about 22 minutes), locally against the demo, before a
  pull request is ready; its table goes in the PR body. `--pages`, `--setups` and `--text` narrow it;
  `--ceilings` prints each figure plus 2%.
- **`e2e/page-budgets.spec.ts`** in CI (phone project): every page at i15 (393 × 852, installed) at
  100% and at se1 (320 × 568) at 150% against `e2e/page-budgets.json`, then S2b's and S3's facts
  (Team's 44px header line, no pager and five position dots, the whole first card at 393 × 659 and
  375 × 667, five cards in one row held sideways within 1.3 screens, the profile band in the bar and
  the section under the sections row at 100% and 150%, the sections sheet at 150%, the sliding frame
  at most 25% at 150% on 568 and 667px phones, Match History's first game above the tab bar at 320,
  a first paint never wider than a 320px phone, and S9c's Admin figures at 375 × 667: System Health
  within 2.0 screens with nothing sideways, Data & Integrations' 12px text at most 30% with every
  section open). About 1 minute.
- **A ratchet**: the ceilings started at the figures of 20 Nov 2026 plus 2%; a stage lowers the
  ceilings of the pages it changes to its acceptance figures, never raises one. The one exception is
  a control a later stage added on purpose, measured in its release plus 2%, with its reason on the
  entry (`why`): in Release 6, Matchup Intel's lane selector (S7a) and Settings' "Sign out of other
  devices" (S9b), built beside S2b, so measured only once the lanes met.

The setups are the mobile audit's (Chromium with touch and an iPhone's safe areas through CDP; the
text size is the browser's own, `Page.setFontSizes`, so the breakpoints move as with a real setting).

Since S8a (20 Nov 2026) the pages carry their visitor: a signed-out one (the local guest cookie) for
sign-in, recovery, Privacy and the public team page, and the in-memory demo's viewers
(`server/auth/demo-viewer.ts`) for the first sign-in (`/welcome` with a temporary password and with
the profile half chosen, `/welcome/personalise`) and a member's own My Profile (Overview and Match
History). Card Studio is measured open (`then: "studio"`): an open window is measured by its own height plus what its scrolling area holds, not the page under it. Public Leaderboards needs
`UNIIVERSE_PUBLIC_RIOT_DATA=true`, which the CI demo does not set, so it is measured only in the
full matrix on a server started with it (`requires`).

#### The full matrix, Release 11 (20 Nov 2026)

`node scripts/ux-measure.mjs` on `main` at Release 9 (8f03ac91; this release changes tests and docs
only), on a fresh in-memory demo, in Chrome Headless Shell 156 (CI's and the Production check's
browser, `PW_CHROMIUM_PATH` at its headless shell) and in the container's Chromium 153: 34 pages × 7
setups × 4 text sizes, 952 figures in each. Public Leaderboards is not measured (it needs
`UNIIVERSE_PUBLIC_RIOT_DATA=true`, as above). Below, each page at the two setups CI holds, beside
stage 0's baseline (the mobile audit UM §3, installed setups; the desktop audit UD has no phone
heights), and its worst figures across the matrix. Figures in screens; the ceiling in brackets.

- **Nothing is wider than its screen**: sideways overflow is 0 on every page, setup and text size, in both browsers.
- **Over a ceiling, in both browsers: Team Matches** (`matches`), 1.86 at i15 100% (ceiling 1.82;
  1.77 when audited) and 6.05 in 156 and 5.99 in 153 at se1 150% (ceiling 5.94; 5.78 when audited).
  CI does not catch it: the page is marked `data` (its height grows with the games the demo's members
  played together, which other specs add to), so CI holds its frame, overflow and targets only. Its
  list of games is 1,138px of the page's 1,491 at 393 × 852 in the browser's tab. The ceiling is not
  raised then. **Cause found in Release 11** (21 Nov 2026): S9c's Team insights link (the
  administrators' preview, `TEAM_INSIGHTS_AUDIENCE`), a 44px row in the page's header shown only
  to those who can open it, which the demo's viewer (the Owner) is. Side by side with the audit's
  build (a6a091b2) at 393 × 852 the list of games is the same 1,138px and starts at 328px instead
  of 276px. That is a control a later stage added on purpose, so both ceilings take the file's
  exception (1.90 at i15 100% and 6.17 at se1 150%, Release 11's figures plus 2%, the reason in
  `why`); a member without the link stays within the old ceilings. **Release 16** (23 Nov 2026)
  removed Team Insights and its link, so the row is gone for everyone and both ceilings came back
  down to the measured figures plus 2%, their exception dropped (e2e/page-budgets.json).
- Re-run on the merge of `release/r10` (4a3b7727, Release 10): the same two overs and nothing else
  over, no overflow; 38 of the 952 figures moved by 0.03 screens or more, All Champions down at both
  CI setups (i15 100% 1.05 → 1.00, se1 150% 3.37 → 3.25; R10a's Filters row). The table below is `main`'s.
- 156 against 153: the same figures on 20 of 34 pages at both setups; elsewhere within 0.10 screens
  (156 lays text out wider, so a line wraps sooner), none crossing a ceiling but Team Matches'.

| Page | i15 100%: audit → 156 / 153 (ceiling) | se1 150%: audit → 156 / 153 (ceiling) | most screens in 156 (setup) | frame at rest, most | targets under 44px on the first screen, most |
|---|---|---|---|---|---|
| team | 1 → 1 / 1 (1.02) | 2.16 → 2.18 / 2.18 (2.78) | 3.86 (se1-200) | 0.57 | 5 |
| players | 1.2 → 1.12 / 1.12 (1.14) | 3.84 → 3.65 / 3.65 (3.72) | 6.38 (se1-200) | 0.57 | 4 |
| leaderboards | ≈3.15 → 3.14 / 3.14 (3.21) | 9.76 (Records view) → 11.85 / 11.85 (12.09) | 18.88 (se1-200) | 0.57 | 1 |
| matches | 1.77 → 1.86 / 1.86 (1.82) **over** | 5.78 → 6.05 / 5.99 (5.94) **over** | 10.19 (se1-200) | 0.57 | 1 |
| p-overview | 2.57 → 1.92 / 1.92 (1.96) | 8.77 → 5.88 / 5.84 (5.96) | 10.08 (se1-200) | 0.57 | 0 |
| p-champions | 1.32 → 1.05 / 1.05 (1.49) | 5.06 → 3.37 / 3.37 (5.59) | 5.7 (se1-200) | 0.57 | 8 |
| p-history | 2.15 → 2.13 / 2.13 (2.17) | 8.57 → 8.13 / 8.13 (8.29) | 14.6 (se1-200) | 0.57 | 5 |
| p-accounts | 1 → 1 / 1 (1.02) | 2.38 → 1.62 / 1.62 (1.67) | 3.18 (land-200) | 0.45 | 0 |
| me | not audited → 1 / 1 (1.02) | not audited → 1 / 1 (1.02) | 1.59 (se1-200) | 0.42 | 1 |
| intel | 1.04 → 1.09 / 1.12 (1.14) | 3.26 → 3.67 / 3.62 (3.67) | 6.24 (se1-200) | 0.42 | 3 |
| resources | 1.55 → 1.79 / 1.81 (1.85) | 5.32 → 5.94 / 5.94 (6.06) | 9.4 (se1-200) | 0.42 | 1 |
| settings | 1.7 → 2.28 / 2.3 (2.32) | 4.8 → 7.19 / 7.1 (7.68) | 11.96 (se1-200) | 0.42 | 0 |
| login | not audited → 1 / 1 (1.02) | not audited → 2.33 / 2.28 (2.33) | 3.89 (se1-200) | 0.00 | 0 |
| recover | not audited → 1 / 1 (1.02) | not audited → 2.17 / 2.17 (2.21) | 4.15 (se1-200) | 0.00 | 0 |
| privacy | not audited → 9.06 / 9.14 (9.37) | not audited → 46.85 / 46.79 (48) | 94.23 (se1-200) | 0.00 | 0 |
| no-access | not audited → 1 / 1 (1.02) | not audited → 2.01 / 2.01 (2.05) | 3.04 (se1-200) | 0.42 | 1 |
| public | not audited → 1 / 1 (1.02) | not audited → 2.11 / 2.11 (2.7) | 3.82 (se1-200) | 0.00 | 5 |
| welcome-password | not audited → 1 / 1 (1.02) | not audited → 1.94 / 1.94 (1.98) | 3.3 (se1-200) | 0.00 | 0 |
| welcome-setup | not audited → 1.31 / 1.34 (1.37) | not audited → 3.84 / 3.79 (3.87) | 6.89 (se1-200) | 0.00 | 0 |
| personalise | not audited → 1.91 / 1.91 (1.95) | not audited → 5.63 / 5.63 (5.8) | 9.39 (se1-200) | 0.00 | 0 |
| own-overview | not audited → 1.9 / 1.9 (1.94) | not audited → 5.96 / 5.92 (6.04) | 10.29 (se1-200) | 0.57 | 1 |
| own-history | not audited → 2.05 / 2.05 (2.09) | not audited → 8.22 / 8.22 (8.38) | 14.41 (se1-200) | 0.57 | 5 |
| studio | not audited → 1.27 / 1.27 (1.3) | not audited → 3.35 / 3.35 (3.42) | 4.83 (land-200) | 0.57 | 0 |
| a-dash | 2.38 → 1 / 1 (2.27) | 7.7 → 1.93 / 1.93 (7.18) | 3.28 (se1-200) | 0.42 | 0 |
| a-people | 5.59 → 1.16 / 1.16 (5.48) | 19.51 → 3.19 / 3.19 (19.2) | 6.33 (se1-200) | 0.57 | 0 |
| a-branding | 3.87 → 4.17 / 4.19 (4.27) | 12.12 → 13.08 / 13.08 (13.34) | 21.87 (se1-200) | 0.57 | 0 |
| a-system | 3.37 → 1.54 / 1.54 (1.71) | 11.19 → 5.77 / 5.67 (6.25) | 12.4 (se1-200) | 0.57 | 0 |
| a-data | not audited → 1 / 1 (1.07) | not audited → 2.67 / 2.67 (2.75) | 7.58 (se1-200) | 0.57 | 0 |
| a-audit | not audited → 1 / 1 (1.02) | not audited → 1 / 1 (1.02) | 1.36 (land-200) | 0.57 | 0 |
| a-settings | not audited → 2.28 / 2.3 (2.32) | not audited → 7.19 / 7.1 (7.68) | 11.96 (se1-200) | 0.42 | 0 |
| a-access | not audited → 1.79 / 1.81 (1.85) | not audited → 7.5 / 7.5 (7.65) | 18.79 (se1-200) | 0.57 | 0 |
| a-privacy | not audited → 1.71 / 1.73 (1.8) | not audited → 5.8 / 5.8 (5.98) | 10.75 (se1-200) | 0.57 | 0 |
| a-previews | not audited → 1.5 / 1.5 (1.53) | not audited → 2.68 / 2.68 (2.73) | 4.16 (land-200) | 0.57 | 0 |
| a-resources | not audited → 2.8 / 2.8 (2.86) | not audited → 8.91 / 8.91 (9.09) | 15.67 (se1-200) | 0.57 | 1 |

The game window on a phone (S6c's acceptance, Release 11): at i12 (390 × 844, its 47px and 34px
insets told), the opened game's header is 101px with the inset (54 without; at most 112), and the
result, loadout, runes, figures, lane and answers end 116–245px above the window's steps (Previous,
Next) with the folds closed, in 156 and 153. The whole game is 1.50–1.82 screens (Release 9), so the
scoreboard and the folds are below the first screen, as designed. `e2e/match-breakdown.spec.ts`
("an iPhone 12 …") holds it on the phone project.

All Champions keeps the browsing place (requirement 4.5d, Release 11): in a 480px-tall window on each
project, the last row of the demo's longest list (8 champions, sorted by win rate) is below the first
screen; opened and closed (Escape on a desktop, Back on a tablet and a phone) it is back within 3px,
in the same order, and a search keeps its words and its rows (`e2e/champion-preview.spec.ts`, "from a
scrolled list"). "Show all" appears from 21 champions, which no demo profile has, so no test opens a
preview from the longer list yet.

### The demo viewer (S8a, 20 Nov 2026)

Every audit before S8a used the demo's automatic viewer, the Owner without a player profile. The
cookie `uniiverse_demo_viewer` chooses another, **in the in-memory demo only**
(`demoViewerAllowed`: no Vercel, no database URL, accounts not required, `UNIIVERSE_DB_MODE=memory`
and the demo seeded; anything else ignores the cookie, unit-tested in `demo-viewer.test.ts`):

- `member`: a Standard Player (not an administrator) whose player profile is the demo's ADC, set
  up, with games. It is the local owner's account row seen as that member, so the demo's account
  lists do not change. It serves the "your" tests (PLAN §1.12; `e2e/demo-viewer.spec.ts`).
- `newcomer` and `halfway`: the demo's two members still in their first sign-in (`/welcome`).

Its limits, by design (it changes nothing outside the demo): the `member` viewer's account row is the
local owner's, so Settings' account panel shows the local owner and its username, display name and
picture changes land on that row (its profile, pools, card and links are Demo ADC's); a viewer whose
demo row is missing is signed out, never the local owner; and Sign out does not clear the cookie
(delete it to return to the local owner).

### S8a: the pages stage 0 did not audit (20 Nov 2026)

Read-only first, at the mobile audit's setups and the desktop sizes, as stage 0 did: height in
screens, the frame's share, touch targets under 44px on the first screen, sideways scroll, words
split inside (not at a hyphen) at 150% and 200%, axe (WCAG 2.1 A and AA, at 375 × 667 and 1440 ×
900) and console errors. Through Admin → Previews (`/preview/setup`) and for real through the demo
viewers. Figures after the fixes; "small" is i15 / se3 / se1 / i15s at 100%, before → after.

| Page | i15 | se1 150% | 1280 / 1440 / 1920 | small | axe |
|---|---|---|---|---|---|
| `/preview/setup` sign-in, password, done steps | 1.14–1.23 | 3.85–4.54 | 1.00–1.14 | 8/6/0/6 → 0 | 0 |
| `/preview/setup` name, profile, personalise | 1.72–2.43 | 5.66–7.95 | 1.06–1.82 | 0 | 2 → 0 |
| `/welcome`, temporary password | 1.00 | 1.94 | 1.00 | 1 → 0 | 0 |
| `/welcome`, the profile | 1.34 | 3.79 | 1.00–1.03 | 0 | 2 → 0 |
| `/welcome/personalise` | 1.91 | 5.55 | 1.20–1.46 | 0 | 0 |
| `/login` on phones | 1.00 | 2.28 | 1.00 | 0 | 0 |
| `/recover` on phones | 1.00 | 2.17 | 1.00 | 0 | 0 |
| `/privacy` | 9.19 | 47.06 | 5.35 / 4.76 / 4.39 (6.07 / 5.40 / 4.99 before) | 8 → 0 | 0 |
| `/no-access` | 1.00 | 2.01 | 1.00 | 7 → 0 | 0 |
| `/public` on phones | 1.00 | 2.65 | 1.00 | 2 → 0 | 0 |
| `/public/leaderboards` on phones | 3.04 | 11.91 | 2.06 / 1.46 / 1.26 | 1 → 0 | 0 |
| Card Studio (a profile, opened; its window measured since 20 Nov 2026: 2.43 and 7.76 were the profile under it) | 1.27 | 3.35 | 1.63 / 1.19 / 1.09 | 5/5/6/5 → 0 | 0 |
| Roles and pools in edit | 2.79 | 9.19 | 1.87 / 1.40 / 1.29 | 0 | 0 |
| Team in Edit lineup | 1.00 | 2.18 | 1.00 | 0 | 0 |
| Install App's window (public header) | 1.00 | 2.65 | 1.00 | 0 | 0 |
| A member's own Overview | 2.41 | 7.92 | 1.63 / 1.19 / 1.09 | 0 | 0 |
| Own Champions, Matchups tab | 1.00 | 3.09 | 1.00 | 4 → 0 | 0 |
| Own Match History | 2.05 | 8.22 | 1.80 / 1.60 / 1.46 | 5 → 4 | 0 |
| Own Riot accounts | 1.00 | 1.28 | 1.00 | 2 → 0 | 0 |
| Settings as a member | 2.30 | 7.17 | 1.48 / 1.30 / 1.20 | 0 | 0 |

No page scrolls sideways at any setup or text size, and none logs a console error (public
Leaderboards answers 404, with the browser's one error for it, where public Riot data is off: by
design). Findings, most visible first, and what was done:

1. **Privacy on the desktop** (UD.PB1): 5.40 screens at 1440 with its index chips only at the top.
   From lg the card widens beside a sticky table of contents (still in view at the notice's end,
   `privacy.spec`); its chips are 44px on touch screens (40 before). On phones it stays a long page
   (9.19 screens at i15): its words are the approved notice, which this pass does not change.
2. **The public header** (UD.PB1): Install App and Sign in at 12px beside Team at 14px. One link
   style at 14px (`components/public/nav-link.ts`); the mark alone and Privacy were 36px wide on
   phones, now 44px.
3. **Titles in another voice** (UD.PB1): "Sign in", "Privacy", "Recover the owner account", the
   welcome steps, Personalise and the invitation page had the wordmark's 0.2em spacing at 20px. One
   h1 style, the app's (`PAGE_TITLE`, 24px, tight); `/setup`'s two notices had no h1 and get it.
4. **Recovery's instructions** (UD.PB2): the deployment's environment variable shown to anyone, the
   variable's name split at every phone size. Behind a fold, "How to set the setup key".
5. **Touch targets under 44px:** No access's page links (36px), the onboarding preview's steps and
   account type (32 and 28px), Card Studio's preview switch, Full card, Hide (40px) and Reset look
   at 320px (36px wide), the Matchups sort (24px), a Riot account's options (28px wide), the phone
   bar's mark alone on My Profile (38px wide) and the welcome page's Sign out (16px): all 44px on
   touch screens now.
6. **axe `definition-list`** on the setup form's account facts (a paragraph inside the list): the
   note now follows the list.

Recorded, not changed here, with the reason:

- Own Match History's LP marks (4 on the first screen at i15): the tip's trigger was 24px by design
  (S6: the card is the one stop). Since Release 11 (row 2.21) a game card's LP mark is no button on a
  touch screen: a tap on it opens the game, like the rest of the card, and the opened game's LP tip
  (a tab stop, TT.TD12) is 44px each way on touch. History's and own History's small targets at i15
  are 0, and so are their ceilings (with Admin People's and Riot Accounts', measured 0).
- Words split at 200% on a 320px phone only: the player card's name in the setup preview (a fixed
  card design, `overflow-wrap: anywhere` on purpose), a champion's name in own Champions' narrow
  column, and "Leaderboards" in its h1 (`hyphens: auto`, hyphenated on purpose).
- Team's lineup dots at 200% on 320 (5 under 44px): Team's own layout (S3a), outside this pass. Fixed
  on 20 Nov 2026 (§6 row 1.2h): the pager's gap and padding are 4px at every text size instead of
  rem, so each target is 46px wide at 200% on 320 (41px before) and 48px or more at 125–175%; at
  100% nothing moves (288px pager, 52px targets). `ux-measure` gives team@se1-200 small 0 (5 before);
  `e2e/large-text-lineup.spec.ts` checks the members' and the public pager at 100–200% on 320 × 568.
  The pager went with the carousel (23 Nov 2026); its position dots are 44px targets in px, 220px
  for the five at every text size, which the same spec checks on both pages at 100–200% on 320 × 568.
- The public header for a signed-in member at 375px and 150% text: three rows where it was two,
  since "Open the app" is 14px as the decision asks (a visitor's header keeps its rows at every
  size; the mark's 44px target is the touch-target utility's invisible box, so it adds no width or height).

### The design review's phone fixes (G3, 20 Nov 2026)

Release 9's design review (desktop against phone, `PLAN` §1.2) found these on the signed-out and
onboarding pages, the Library, Settings and the Card Studio; each is checked in the spec named.

- **The setup stepper** (`setup-steps.tsx`): a step's name wraps (balanced, the tick on its first
  line) rather than being cut: "Roles & champions" needs 108px and its third of the bar is 104px at
  390 (88px beside the tick), so it takes two lines there (`onboarding-preview.spec.ts`).
- **The account facts** under the display name: both values end at the box's right edge, also when
  one wraps under its long label (`onboarding-preview.spec.ts`).
- **The Library's index** wraps as one inset group: each row starts at the left, and the segments
  keep the group's 2px inset on touch, so the chosen one's ring is off the border (`resources.spec.ts`).
- **No access:** its title is balanced ("You don't have access / to that page"), and on the desktop
  the state is centred in the content column (`quality.spec.ts`).
- **Personalise:** Customise is the kit's outline Button (36px with a mouse, 44px on touch, 14px
  text), as Add a picture is; Social links is headed as the other two sections; its help stays 12px, since at 14px it runs to six lines at 393px and the page would pass its budget (`display-name.spec.ts`).
- **The Card Studio's preview chooser** marks the chosen view with the segment's ring and weight
  (`card-studio.spec.ts`).

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
| Motion | The compact bar slides 200ms ease-out in short windows, and upright the top bar's first row and the tab bar where the frame crowds the screen ("The frame slides away"); sheets as above; the account screen rises 1rem into place in 200ms and fades out in 140ms; the title fades in 150ms. Everything respects reduced motion. |

## 6. Verifying

- `pnpm verify` (unit tests include the destinations every bar draws, `currentDestination`, the Team
  tab's memory, `profileBase`, `phoneParent`, `pageName` and `prefetchOf` in `src/lib/nav.test.ts`,
  and `src/components/nav-parity.test.ts`, which renders the sidebar, a tablet's bar, a phone's bar
  and its sideways bar and holds them and the manifest's shortcuts to the same entries, names, icons
  and order in Player and Admin Mode; each shortcut's PNG is the icon the bars draw, 96×96, and
  exists).
- axe (WCAG 2.1 A and AA, serious and critical: 0) on the open account screen upright and sideways
  (`e2e/account-screen.spec.ts`, `e2e/mobile-landscape.spec.ts`), on the sideways compact bar at
  568 × 320, 734 × 343 and 852 × 393, and on Team's pinned row upright and sideways (`e2e/axe.ts`).
- `pnpm build && pnpm test:e2e`: `e2e/journeys.spec.ts` counts the ten most common journeys at an
  iPhone 15's size (20 taps from the landing, 19 from My Profile with the Team tab's memory, Matchup
  Intel in 1 and a Resources site in 2, no scroll-backs), checks the four destinations by name and
  icon in five postures and both modes, the installed Android app's Back closing the account screen
  and a game, and that the bar fetches no profile ahead of a tap. `e2e/mobile-nav.spec.ts` checks the
  frame on a phone (the four destinations and Team's row, the Team tab reopening the section last
  used, the label ladder at 320, 375, 390, 393 and 430px from 100% to 200% text, a Restricted Player's
  bar on a 320px phone, Back and its label, the title, the profile's sections, the account screen's
  items, Back closing it and the close button taking its entry away, a tap made while the page's code
  is held back, the screen filling the smallest iPhone in both modes and at 150% text with "Settings"
  once in Admin Mode, touches that never move the page, the filter sheet and chips, a game opening
  full screen and Back closing it, the Players and Recent form rows, one primary navigation shown at
  a time in each posture, the account screen closed by Back upright and held sideways and not reopened
  by Forward) and, on a tablet, the destinations in the top bar in both modes, one tap each, the
  current one's gradient bar, System's tabs in the page, the bar at 100% to 200% text in both modes
  (`BAR_FIT`: its row's width and what a 768px tablet shows at each size written out, and beside the
  installed app's Back the short names at 125%), the avatar menu's items (the account's own only),
  Install App from it giving the focus back to the avatar, an early tap on the avatar, and that the
  avatar menu's Sign out reaches the browser's other tabs; `e2e/mobile-landscape.spec.ts` the phone
  held sideways: one compact bar with the four destinations (all named at 568px) and no bottom bar,
  hiding and coming back, a profile's bars at rest at most 90px and its band at most 80px on one
  line at five sideways sizes (with links, and with the longest line it is made for), a member's own
  Overview, the avatar opening the account screen at every width, Admin Mode saying the mode, the
  title and the current destination leading back to the top, and large text (the names giving way by
  `SIDEWAYS_FIT`'s steps, the current destination kept in view);
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
  Team Overview's phone layout (one 44px header line with Edit lineup, the carousel of one card
  across the width with its five position dots and no pager over it, the card's picture beside the
  name, no bench under it, and no later card's member's picture asked for while the first card's
  art loads) is in `e2e/team-layout.spec.ts` and `e2e/page-budgets.spec.ts`; the carousel itself
  (320 to 430px and an iPhone, a Pixel and an iPhone SE; swipes, the loop both ways with the card's
  x sampled every frame across the wrap, a vertical drag, the dots, the keyboard, the player
  window's ‹ ›, reduced motion, 200% text on 320px, the public page) in `e2e/team-carousel.spec.ts`;
  held sideways (five compact cards in one row, no dots, no logo) in `e2e/mobile-landscape.spec.ts`.
  `e2e/page-budgets.spec.ts` holds the page budgets ("Page budgets", above).
- Safari 26's engine: `scripts/webkit26-check.mjs` (RESPONSIVE.md → Safari 26) opens every kind of
  window in WebKit 26.0, the engine that collapsed them, on four phones, an iPad and a Mac.
- Real devices: see RESPONSIVE.md → Safari and iPhones. Emulated phones prove layout and behaviour
  in an engine, not Safari's own toolbars or gestures on an iPhone. The account screen on a real
  iPhone, installed and in Safari, is the owner's check.


## Users & Permissions on phones (overhaul S9a, 19 Nov 2026)

- **The list:** 64px rows (52px from `sm`), a picture, the name and `@username`, at most one state chip; last sign-in from `md`. No buttons on the rows. The status filter is a select in the search row on phones (the chips from `sm`), and Add account is an icon button at its end that opens a sheet, so the first row starts within the first screen (at or above 300px at 375, 220px at 1440: `e2e/admin-people.spec.ts`).
- **The person view:** the whole screen on phones (`DetailModal` standard), a window from `sm`. Its address is `?person=` under the shared history rule (`useAddressItem`, docs/DESIGN_SYSTEM.md): the system Back closes it with the list's scroll kept, ‹ › replace the entry. Its Danger zone is a closed `Fold`.
