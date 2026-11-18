# Responsive design

UNIIVERSE is used on phones straight after a game, on tablets at the desk and on laptops and
large monitors. One set of breakpoints (Tailwind's defaults) is used everywhere:

| Range | Name | Shell | Layout rules |
| --- | --- | --- | --- |
| < 640px | small phone | top bar (Back or the team's mark, the page's title, the avatar for the account screen), bottom tab bar | one column, 44px targets, 16px inputs, full-screen pickers, lists as rows ([MOBILE.md](MOBILE.md)) |
| 640–767px | large phone | same | one column; some header rows become two columns |
| 768–1023px | tablet | top bar + drawer (no tab bar) | two columns where useful |
| 1024–1279px | laptop | sidebar | desktop layout |
| ≥ 1280px | desktop | sidebar | desktop layout, wider content |

Class prefixes: `max-md:` = phones, `md:` = tablet and up, `lg:` = sidebar, `xl:` = wide desktop.
Touch devices of any width also get 44px buttons (`pointer-coarse:`).

## Phones held either way

Width decides the layout; height decides how much may stay pinned. A **short window** is one 480px
tall or shorter: in practice a phone held sideways (320–430px tall). Tailwind has a `short:` variant for
it (`globals.css`), and every pinned element follows these rules:

| Element | Upright phone | Short window (phone sideways) |
| --- | --- | --- |
| Top bar | sticky | slides away while the page scrolls down; back on any scroll up, at the top, and while it holds focus |
| Tab bar | fixed at the bottom | a compact row that slides away with the top bar and comes back with it; `main` keeps room for it (`pb-tabbar`) |
| Detail windows (`DetailModal`) | whole screen below `sm`, centred window above; one whose header would fill over 40% of a phone's screen (the Team player window on a small phone) scrolls as one, as in a short window | whole screen, scrolling as one: a large header scrolls away, its close and step buttons float at the top, a footer stays pinned |
| The account screen (`DetailModal size="screen"`, behind the phone's avatar) | the whole screen, fixed to its four edges, under the status bar; its rows in a readable column (28rem); at the usual text size nothing scrolls on phones from 375pt wide (a few points for an administrator in Admin Mode in Safari's tab on a 375pt iPhone SE; a little on a 320pt screen in Safari's tab) | the whole screen too; only its body scrolls, as one region, under its bar with the close button |
| Sheets (`DetailModal size="sheet"`: `Dialog`'s confirmations and editors, the filter sheet, the lineup sheet) | docked to the bottom edge, as tall as its content up to the screen less 2.5rem and the status bar (a share of the screen it is fixed to); a taller wider screen gets a centred window | docked to the bottom edge too, up to 44rem wide and the screen less 0.5rem; in both, the header and footer stay and only the body scrolls, unless they would leave it less room than its tallest control needs (large text or a zoomed page, mostly on a phone held sideways): then the whole sheet scrolls as one, like a page (`data-flow`) |
| Things pinned to the bottom (toasts, a save bar) | `bottom-tabbar`: above the tab bar; over an open window or sheet the toasts are drawn inside it, in the same place, once it has finished moving in (they leave it as it starts to close) | near the bottom edge |

Turning the phone keeps state: windows, filters and tabs live in the address or in component
state, never in the orientation, so a window open in one orientation is open in the other.

**Safe areas.** The viewport uses `viewport-fit=cover` and the installed app draws under a
translucent status bar, so:
- side gutters use `px-safe-4` / `px-safe-6` (the gutter, or the notch's inset where larger) for
  the top bar, `main`, the public page, toasts and whole-screen windows;
- whole-screen windows pad the status bar (`max-sm:pt-safe`); a window's body keeps its last line 1rem from the bottom edge (1.25rem from `sm`), a sheet's footer its actions 1rem where the sheet is docked (0.75rem where it is a centred window), and other windows' footers 0.75rem, or the home indicator's inset where it is larger (`pb-safe-4`, `sm:pb-safe-5`, `pb-safe-3`); a window that scrolls as one on a phone keeps a bar over the status bar, so text never scrolls under the clock;
- `pt-safe-N` and `pb-safe-N` (like `px-safe-N`) are N spacing steps or the inset, whichever is larger, and are an element's only padding for that edge: beside another one (`py-4 pb-safe`) Tailwind's own order decides which wins, and the bare inset did, 0px in a browser (#265). `src/app/design-tokens.test.ts` refuses that pairing, and an arbitrary `max(…, env(safe-area-inset-…))` padding a utility writes;
- preview pages (Admin → Previews) leave room for their fixed "Preview" badge (`PREVIEW_PAD_TOP`);
- the drawer, which opens from the left, pads the left-hand inset; the tab bar pads all three.

## Touch targets

- 44px on touch screens (`pointer-coarse:`), 24px minimum everywhere (WCAG 2.5.8).
- Small marks keep their look and get a bigger target: the ⓘ (`InfoTip`) is a 24px button around
  its 16px mark (negative margins keep the line), with an invisible 40px area on touch screens;
  inline text links use `touch-target`.
- Close buttons of dialogs, windows and pickers are 44px on touch screens.
- A toast's dismiss button is 44px at every width, around its 16px mark: its negative margins reach
  into the toast's own padding, so the toast is no larger for it.
- Controls on a card (a flip button, social icons) stop their event: using one never opens,
  turns or selects the card.

## Long lists inside a page

A list opened inside a page (a table under a `<details>`, an event list) runs with the page on a
touch screen: a box that scrolls inside a scrolling page catches the finger, and the page stops
moving. With a mouse or trackpad (`pointer-fine:`) it may keep a height limit and scroll in its box
(Match History's timeline tables and Ranked progress's readings do: `pointer-fine:max-h-64 pointer-fine:overflow-y-auto`, and
their header sticks only there). Windows and dialogs keep their one scrolling body (above).

A picker's list inside a window keeps that rule too. The member and champion pickers (in the
Filters sheet on phones) and the champion window's opponent picker open their list in the flow of
the window's body, as tall as its options, at every width inside a window and anywhere on a phone
(`src/components/ui/picker-flow.ts`): the body is the one thing that scrolls, and it brings the list
into view as it opens (`scrollIntoView`, block `nearest`; the page behind is put back if a browser
moves it too). Floating under its button with a height of its own, the list was a scroll inside the
body's scroll, and the body cut it off at its edge. A list in the flow fades in where it rests (a
rise would move it while it is brought into view, and leave it a rise's height under the window's
header), and a press outside closes it on the press's click, not as the press starts: closing it
moves everything below it up by its height, so closed at the press's start, the click reached
whatever had moved under the finger. On a page from `sm` up the list still floats, 18 to 20rem
wide, and closes as a press starts. The add-champion search opens on the page: its list goes above
its field where the room below, down to the tab bar's top, is too small and the room above is
larger, and is never taller than the room on its side (the page's scroll padding marks the bars,
`clearArea` in `src/lib/screen.ts`). On a touch screen its field takes the focus as it opens, so the
on-screen keyboard rises over the bottom of the screen, the tab bar with it: while it is up the
room ends at the keyboard's top instead (`aboveKeyboard`, beside `useKeyboardFit` in
`src/components/ui/keyboard-fit.ts`), measured again as the keyboard rises and as Safari moves the
page to bring the field above it.

## Rows that scroll sideways

Tabs and chip rows that do not fit scroll sideways inside themselves (never the page) with
`ScrollRow` or `useScrollEdges` (`ui/scroll-row.tsx`): an edge fades (`scroll-fade-x`) only where
more is hidden, and the current item is kept in view. The Team tabs share the width when they
fit (iPhone 15 and wider) and scroll on narrower phones.

## Team Overview's lineup

The lineup (`team-roster.tsx`) is laid out by its own width (the `lineup` container), so the same
rules hold beside an open or a collapsed sidebar, and by the window's height. These are the
approved design's rules (October 2026), restored at the owner's request on 17 Nov 2026, on phones
too. November's redesign (#275) had moved 3 + 2 to 42rem and five across to 58rem, capped the
lineup at 100rem from a 90rem lineup, stretched the cards' art to fill the window, put a bench of
substitutes under the cards, made the header one row (no logo on a phone held upright), given the
role bar the players' pictures and kept a short window to one sideways track; all of that went with
the restore. Nothing about the substitutes is drawn under the cards: a substitute is on the back of
their starter's card, turned to by its control and managed in Edit lineup (ARCHITECTURE.md →
Substitute side of the Team cards).

| Lineup | Layout |
| --- | --- |
| under 36rem (phones upright) | one swipe track, a card at a time, under the role bar (each tab the role's icon and name) |
| 36–56rem (iPads, upright and landscape; a 1024px laptop with the sidebar open; most phones held sideways) | 2 + 2 + 1, capped at 54rem |
| 56–64rem (a 1280px laptop with the sidebar open) | 3 + 2, capped at 80rem |
| 64rem and up (1366 and 1440 laptops with the sidebar open, and wider) | five across, capped at 84rem |

- **The header**, from `sm`: the logo (64px, 80px from `lg`) beside the accent "Team Overview"
  eyebrow over the team's name (30px, 36px from `lg`) and "Main lineup · season", the lineup's
  state under them as a pill with its ⓘ inside (green "Lineup complete"; warn "Assign all five
  roles" for a lineup manager, "A lineup manager assigns the five roles" for everyone else), and
  Edit lineup at the row's end: 113px tall at 1440 × 900. On a phone held upright the logo (48px)
  and the name share the first line, and the state and Edit lineup the next (102px tall). Held
  sideways (a short window) it is the wider header, compact: the logo at 44px and the name at 20px
  (71px tall at 844 × 390). Below `sm` and in a short window the eyebrow is for screen readers
  only. The name keeps to one line; a longer one ends in an ellipsis.
- **Centred in the window** (from `lg`): on this page `main` and the page are flex columns, so the
  frame (`lineup-frame`) takes the height left under the section tabs and centres the header and
  the cards, with as much room above the header as under the cards. A window too short for that
  starts at the top and scrolls. Five across, the cards' art is `clamp(13rem, 29vh, 20rem)`:
  portrait cards that grow a little with the window, never stretched to fill it.
  - **Measured (demo lineup, sidebar open; 17 Nov 2026):** 1366 × 768, 1440 × 900, 1536 × 864 and
    1920 × 1080 show the whole lineup centred on one screen, with 41px, 95px, 82px and 135px above
    the header and under the cards (2560 × 1440, sidebar folded: 226px). At 1366 × 768 the
    approved design had 48px: its cards are 14px shorter there, their season figures overflowing
    their columns (Narrow cards, below). The art is 223px tall at 1366 × 768, 261px at 1440 × 900,
    313px at 1920 × 1080 and 412px at 2560 × 1440. 1280 × 800 is 3 + 2 and scrolls 1.28 screens,
    an upright iPad (810 × 1080) is 2 + 2 + 1 at 1.36 screens, a landscape one (1080 × 810) 1.75.
  - **In a real browser** the window is shorter than the screen by its toolbars (and the taskbar):
    1440 × 789 and 1920 × 950 still centre the whole lineup (56px and 89px above the header and
    under the cards); a 1366 × 768 laptop's 1366 × 657 starts at the top and scrolls; a 1280 × 800
    laptop's 1280 × 690, 3 + 2, 1.48 screens.
  - **The public page** centres the same way between its header and the footer with Riot's notice,
    which stays on the first screen at 1280 × 800, 1366 × 768, 1440 × 900 and 1920 × 1080 (80px,
    69px, 116px and 168px above the header and under the cards).
- **The stage**, five across: the cards stand on a floor lit from just under them
  (`lineup-stage-floor`: a radial glow in the brand blue, a hairline at their foot, and the team's
  logo in grayscale at 7% or its short name at 3.5% as a watermark). It is decoration: hidden from
  screen readers, behind the cards (`-z-10` in the stage's own stacking context), absolutely placed
  and clipped by the frame (`overflow-y-clip`), so it never sizes a card or adds a scroll
  (DESIGN_SYSTEM.md §4: the one place the brand blue is a light).
- **Narrow cards** (five across a laptop): a card under 12.5rem (five across a 1366px laptop with
  the sidebar open: 12.47rem) shows its season as two columns (the win rate; KDA over CS/min). The
  approved design kept the figures in one row there, overflowing their columns on all five cards;
  stacked, they make the cards 14px taller at 1366 × 768, and the lineup, still centred, sits 7px
  higher. That is the one place the lineup's geometry differs from the approved design's. Kills /
  deaths / assists per game show, as approved, on cards from 14.5rem (five across at 1920 × 1080
  and wider, and at 1366 × 768 and 1440 × 900 with the sidebar folded); from 14.5rem to 16.5rem the
  three figures stand 4px apart instead of 10px, so the line fits whole where the approved design
  ended it in "…". Under 14.5rem it stays in the hover text, for screen readers and in the player's
  window. The pool keeps one row, as approved. A phone's single card (about 16.4rem on a 320px
  phone) is the phone card as it was, its kills / deaths / assists shown. In Edit lineup, Change and
  Substitute stand side by side as approved; on a card under 14.25rem their icons step aside, so
  both labels stay whole (five across a 1366 or 1440 laptop with the sidebar open, where the
  approved design cut them: "Chan…" and "Subst…" at 1366, "Substit…" at 1440).
- **Identity rows** stay level side by side (`CardIdentity align`): each card's name and tagline
  take as much room as the tallest among everyone the lineup can show, and a shorter name sits at
  the top of that room, as approved.

## The Library and Settings

**The Library** (Resources' first tab, `resources/resources-view.tsx`; 18 Nov 2026). A search, the
index (All, ★ Favourites and each section with its count, the counts following the search: one
choice that filters the list, `segmentClass` buttons in a radio group) and the live count at the
index's end, then the sites grouped by section, an `h2` each:

| Width | Layout |
| --- | --- |
| phone (< 640px) | a full-width search; the index under it, scrolling sideways (`ScrollRow`); the live count left to screen readers (each segment says it); one panel, a heading per section, hairlines between the rows |
| a phone held sideways, from 640px wide (`sm` in a window 480px tall or less; a 320pt iPhone held sideways is 568px wide and keeps the upright layout) | the search and the index share a row; a panel per section, two columns |
| tablet (640–1023px) | the search on its own row, the index under it, scrolling sideways, with the live count at its end; a panel per section packed into two columns (`columns-2`, each panel kept whole) |
| from `lg` | the index whole wherever it is shown: beside the search only where the row has room for all of it and the count's longest form (1366 to 1480 with the sidebar folded), else on a row of its own, its segments wrapping onto a second line only where even that row is too narrow (1024, the sidebar open or folded); the count keeps the room of "11 of 11 resources" (an invisible copy in its cell), so a section chosen or a search typed never moves the index or the list; two columns, three from `xl` |

The plan said two columns from `md`; they start at `sm` so a phone held sideways (an iPhone 15 in
Safari is 734px wide) gets them too, which its 2.4-screen target needs (`e2e/resources.spec.ts`
pins it at 734 × 343, and one panel at 600px). A section panel's title is `text-base` from `md`, as
a panel's title is (STANDARDS.md, Type); a phone's headings, upright or sideways, stay `text-sm`. A
row is its site's icon, the title (it wraps, never cut), the host beside it (cut first, then ↗) and
the description: whole on a touch screen, as in the base (whose clamp never applied), and with a
mouse two lines at most, its title showing the rest on hover; a screen reader reads it whole either
way. The star at the row's end keeps a favourite in this browser. The ★ segment is in the server's
page with an empty slot of its count's width (two digits; at most 50 favourites), which fills once
the page has read this browser, so nothing moves. With nothing in the library a phone says "No
resources yet." on screen too.

The index's laptop widths, measured beside the open sidebar and with it folded (18 Nov 2026): whole
at 1024, 1280, 1300, 1366, 1440 and 1480 either way; beside the search at 1366, 1440 and 1480 folded,
on a row of its own elsewhere, on two lines at 1024; Esports chosen, or "aram" searched, moves
neither the index nor the list at any of them. Before this, beside the open sidebar, 444, 188 and
102px of it hid under the fade at 1024, 1280 and 1366 (about 28px at 1440); and before the count kept
its longest form's room, its words ("11 resources", "2 of 11 resources") decided the line: choosing a
section could drop the index to a row of its own (about 1284–1314px folded, 1468–1498px open) or wrap
it at 1024 folded.

**Settings** (`settings/account-settings.tsx`, the same page in both modes; 18 Nov 2026), 64rem wide
(`max-w-5xl`):

| Width | Layout |
| --- | --- |
| phone (< 640px), and any window 480px tall or less | the title, then the compact account card: the 56px picture beside the name, @username and a neutral role badge; a row of quiet links (My Profile, Riot Accounts, the mode switch, Sign out; wrapped lines 12px apart, so a link's 44px touch area stops short of the link drawn above or below it); Change and Remove; what the picture is for; the index as chips (Name, Links, Password: 44px on a touch screen, the section being read marked as a chosen chip is). Every section stacked; each field with its Save on one row, 44px |
| from `sm` (a phone held sideways from 640px wide) | two columns: the card (15rem, 16rem from `lg`) beside the sections, the title over the sections |
| from `md` in a window taller than 480px | the card's full look: the 80px picture, who you are under it across the card, Change and Remove, the help, the index down the card (the section being read marked, `aria-current="location"`), then My Profile, Riot Accounts, the mode switch and Sign out as rows; sticky under the tablet's bar (`--bar-top` plus 1rem) |
| from `xl` | Name & username side by side, each with its Save |

The password form is shown at every size, stacked like the other sections (the approved plan: no
hidden forms). The card's parts are cells in the order they are drawn at every size, so reading
and the keyboard follow what is seen; its actions are drawn once per layout (the quiet row or the
rows, the other copy `display: none`, out of the keyboard's and a screen reader's way). Its index is
Records' `SectionIndex`, drawn as the plan's chips on a phone and in a window 480px tall or less
(`chipClass` through `linkClassName`, no dots) and as a list from md in a taller window: a click
jumps through the router's history (`jumpToAnchor`), the section under the top bar and focused. At
a larger text size who you are goes under the picture wherever the card is under 11rem inside (the
card is a container: 200% text on any phone, 150% on a 320px one; never at the usual size, where
the narrowest card is 12.9rem inside), so the longest role, "Administrator", keeps its line whole
(beside the picture at 200% on a 320px phone it ran 54px past the screen). Sign out is on the first
screen at every size measured (below).

**Measured** on 18 Nov 2026 (the demo build, in-memory; page height in screens, base `8ef5a612` →
this change, the plan's target in brackets; the owner in Player Mode, Admin Mode's Settings the
same; a member with a player profile, so Social links too; Playwright's device sizes, the screen's
own in the label):

| Size | Library (target) | Settings, owner (target) | Settings, member (target) | Sign out on the first screen |
| --- | --- | --- | --- | --- |
| iPhone 15 (Safari, 393 × 659) | 2.62 → 1.95 (2.0) | 2.29 → 2.06 (1.6, missed) | 3.13 → 2.97 (2.3, missed) | no → yes |
| iPhone SE 1st gen (320 × 568) | 3.52 → 2.61 (2.5, missed) | 2.89 → 2.54 (2.0, missed) | 3.93 → 3.74 | no → yes |
| iPhone 15 installed (393 × 852, safe areas 59 / 34) | 2.13 → 1.62 (1.7) | 1.88 → 1.70 | 2.53 → 2.40 | no → yes |
| iPhone 15 sideways (734 × 343) | 4.24 → 2.40 (2.4) | 3.37 → 2.83 (2.5, missed) | 4.81 → 4.46 | no → yes |
| Pixel 7 sideways (863 × 360) | 4.05 → 2.20 (2.3) | 3.13 → 2.53 (2.4, missed) | 4.49 → 4.08 | no → yes |
| iPad (810 × 1080) | 1.35 → 1.00 (1.0) | 1.04 → 1.00 (1.0) | 1.50 → 1.39 | yes → yes |
| 1440 × 900 | 1.10 → 1.00 (1.0) | 1.16 → 1.00 (1.0) | 1.63 → 1.32 | no → yes |

Sign out is on the first screen for the owner and the member at every size; the index's chips (44px
on a touch screen) add 20px to an upright phone's page, and from md who you are under the picture
puts Sign out about 60px lower in the card (495px down at 1440 × 900 and at 1024 × 768 for the owner,
571px for a member). The Library's
"before" includes #292's Library and Matchup Intel tabs (about 60px on a phone), which the plan's
figures predate; on the iPhone SE it misses 2.5 because its descriptions are whole on a touch screen
(2.46 with them cut at two lines). Settings' phone targets were set with a smaller page in mind: with
the password form shown, as the plan asks, it adds about 290px on an upright phone (the owner was
1.59 on an iPhone 15 with it folded), and a member's Social links (three fields, each a line for its
name and Show publicly and one for the field, shared with the Player Card Studio and the first
sign-in, pinned by `e2e/social-links.spec.ts`) add more. Those misses are for the owner to accept or
to take up in a later change.

## Admin Mode at a larger text size

Every Admin Mode page is as wide as the phone at 150% and 200% text on 320, 375 and 393px phones (18
Nov 2026; before, the dashboard was 404–440px wide at 200%, Branding 430, Users & Permissions 457,
Previews 367, Platform Settings → Resources 525 at 200% and 394 already at 150% on 375 and 393px,
Data & Integrations 357 and System Health 387). Nothing new, only the means #300 used elsewhere:

- buttons whose label wraps on a phone (`Button`'s `wrap`): Branding's Reset colours, Save and
  Cancel; a member's Manage access, Reset password, Deactivate, Delete and Erase personal data;
  Show archived; the erasure records' Export, Import and Re-apply; Check key now and Retry pending
  Riot accounts; Save intervals; Seed demo roster;
- rows that wrap: Branding's save bar, Previews' page and screen-size switches, the Library
  manager's five buttons;
- grid columns that may shrink below their longest word (`grid-cols-1` where a phone had the
  implicit column, `min-w-0`), and a word longer than its line broken inside it
  (`[overflow-wrap:anywhere]`): the access levels' cards, the Riot API's facts, the datasets, the
  Data jobs' cards, the environment's names, a Riot ID, the privacy page's notes;
- where one of those would also move something at the usual text size, a container query in rem
  waits until its container is that narrow, which on a phone only a larger text size makes it (the
  usual size gives 18rem and more): the dashboard's account tiles stack, a long word broken, under
  16rem; the health cards (`StatusCards`, on the dashboard, Data & Integrations and System Health)
  break a long word under 17rem; Branding's colour rows give the name a line of its own and the hex
  field the rest of the next under 14rem; a member's name and role go under the picture under
  14rem; Users & Permissions' tab labels wrap under 13.5rem (`people-tabs.tsx`, so the shared
  `SubTabs` is untouched); Settings' account card puts who you are under the picture under 11rem
  inside, so an administrator's "Administrator" badge keeps its line whole.

At the usual text size nothing moves: compared with the base build at 320, 375, 393, 768 and
1440px (the box of every heading, button, link, field, list item, paragraph, label and live region
on the ten Admin Mode pages), 49 of the 50 are identical; the fiftieth, System Health at 320px, is
its job list, which differs between any two servers with the demo's background runs (two servers of
the base differed by 450px). `e2e/phone-wraps.spec.ts` checks every Admin Mode page at 200% and 150%
on 320, 375 and 393px phones, and Settings there for an administrator who is not the owner (the
demo owner's badge says "Owner"), the badge inside the card; `e2e/account-screen.spec.ts` now opens
the account screen over the dashboard at 200% on a 320px phone as well.

## Shell

- `src/components/app-shell.tsx`: sidebar from `lg`; `MobileNav` below.
- `src/components/mobile-nav.tsx` (the phone frame is described in full in [MOBILE.md](MOBILE.md)):
  - phones: a sticky top bar with Back (named after where it leads) or the team's mark, the page's
    title once its heading has scrolled up under the bar, and your avatar, which opens the account
    screen (a screen of its own: who is signed in, then full-width rows for the pages without a tab,
    Settings and Install App, the mode switch and Sign out, then the patch and Riot's notice); on a
    profile, its sections ride under the bar;
  - phones: a bottom tab bar with Team, Players, Leaderboards, Matches and Profile (`PHONE_TABS`,
    at most five, those the account may open). A teammate's profile is under Players. The current
    tab's icon sits in an accent pill and its label is bright, so it does not rely on colour alone;
  - tablets: the top bar with the menu at its left end (in a window 480px tall or less, where the
    section tabs do not pin, it carries the page's title once the heading has scrolled up, a tap on
    it going back to the top, as on a phone), the drawer from the left (the sidebar's
    side) with all links, status rows and sign-out, and the account menu behind the avatar. The
    drawer is a native `<dialog>`, like every sheet and window: focus stays inside, the page behind
    is inert and locked as behind a window (`lockPage`: no scrolling, no rubber band, no shift as the
    scrollbar goes), the focus starts on the menu itself after a tap and on its close button from the
    keyboard, Escape or a tap beside the panel closes it, and focus returns to the menu button.
    Its Sign out tells the browser's other tabs, as the account screen's and the account menu's do.
    In the installed app, which has no browser Back, the bar also shows Back on a page reached
    from another (a teammate's profile), named as on phones.
  - Before the page's code has run: the avatar, the tablet's menu button, the account menu's
    triggers (the tablet's avatar, the sidebar's tile) and the sidebar's collapse control are
    buttons that code drives, and a tap on one is kept by an inline script in the root layout
    (`src/components/early-taps.ts`, `data-early` on the button). The button shows pressed at once
    (`[data-early][aria-busy]`, globals.css) and does what was asked once the code runs, exactly
    once; Enter and Space go the same way. Once the page runs, the script does nothing.
  - Both bars pad for safe areas (`pt-safe`, `pb-safe`, `px-safe`); in short windows they slide
    away while reading (see above). On phones the top bar sets the page's `scroll-padding-top` to
    its measured height (and the stylesheet clears the tab bar); on tablets the stylesheet's value
    stands, so whatever scrolls into view stays clear of both bars.
- **Section tabs stay in reach** on tablets and desktops: Team's sections, Resources' (the Library
  and Matchup Intel), a profile's sections and Platform Settings' (`TabBar` with `sticky`, the `sticky-tabs` utility in globals.css) stay
  pinned at the top of the page once it has scrolled past them, under the tablet's top bar
  (`--bar-top`) and at the window's edge beside the sidebar, so a long section (Matches, a Match
  History, Players with a full roster) never needs scrolling back up
  to leave it: the desktop's answer to the phone's bottom bar and in-bar sections. While pinned
  (`data-stuck`, set by an observer in `TabBar`) the row is frame, not content: the frame's ink
  (`chrome`) blurred like the top bar; at rest it is plain, part of the page. Anything pinned under
  it (All Champions' column headings) offsets by `--tabs-top`, and `scroll-padding-top` clears
  both. A short window (480px tall or shorter) keeps its height for the page: nothing is pinned
  there. The pinned bars' own controls take that padding back (a negative scroll margin), so focus
  moving onto a pinned tab, the sidebar's logo or the top bar's buttons never scrolls the page.
  A sticky bar must be a child of what the page scrolls through, never of a wrapper that ends with
  it.
- **One composition at every width** (PR 10, 18 Nov 2026): in a window from 1600px (100rem) wide
  the pages of a tab set share one width (`SECTION_HUBS`' `width` in `src/lib/nav.ts`: Team's four
  sections `--content-wide`, Players and Matches joining Team Overview and Leaderboards there;
  Resources' and Platform Settings' `--content-max`), and a bar of `main`'s own (`SectionTabs`) gives
  its row of tabs that width (`TabBar`'s `inner`, `ROW_WIDTH`). Where the pages then stop growing and
  centre in the room beside the sidebar (80rem pages from about 1650px with the sidebar open and
  from 1600px with it folded; Team's 100rem from about 2370px and 1926px), the first tab still starts
  at the page's column and Team's name at the row's end stops at its right edge, and the row stays in
  the same place on every section of the set; the line under it and its pinned ink span the room. In
  a window under 1600px every page and the row are exactly as before, the sidebar open or folded
  (Players and Matches 80rem, the row the bar's width; measured against main's build). A profile's
  tabs and a section's views (`SubTabs`) are inside their page's column, so they always lined up. On
  Team Overview the column is Team's 100rem, and its header and lineup keep their 84rem, centred in
  it (the logo 38px inside at 1920, 165px at 2560 and 176px at 3440 with the sidebar open). With
  Players at 100rem the roster takes three columns (its own 84rem rule) from about 1780px with the
  sidebar open and from 1600px with it folded; Team Matches' list stays at `--content-max`,
  left-aligned. The route's loading state takes the width `pageWidthOf` gives its address (a Team
  section's own, else 80rem): Players and a teammate's profile share `players/loading.tsx`, which reads
  the address it stands in for, and Team Matches' own `matches/loading.tsx` stands as its page does
  (Team's width from 1600px, its filter row and cards at `--content-max`, left-aligned).
- `main` pads for the tab bar (`pb-tabbar`) so content never hides behind it.

## Primitives

- `Button`: desktop heights unchanged; `max-md:min-h-11` and `pointer-coarse:min-h-11`. `wrap`: on a
  phone a label that a larger text size makes too long wraps and the button grows with it (a form's
  Save beside little room); without it a label stays on one line.
- `Input`, `Select`, `Textarea`, `SearchInput` and the champion grid's search: 44px and 16px text
  on phones and on every touch screen, 36px / 14px from `md` with a mouse (`md:pointer-fine:`) (in
  `SearchInput`, a placeholder longer than its field ends in an ellipsis): iOS
  zooms the page into a focused field under 16px, and iPads and most iPhones held sideways (812px
  and up) are `md` or wider. Before #300 their text turned 14px from `md` on a touch screen too.
  `design-tokens.test.ts` refuses a field's 16px dropping below it from any breakpoint without
  `pointer-fine:`. The pickers' search boxes (member, champion, opponent) and the add-champion
  field also keep 16px on every touch screen and turn 14px only with a mouse (`pointer-fine:`):
  iOS zoomed the page into the opponent search at 14px.
- `ToggleChip` (`ui/toggle.tsx`): every selectable chip (roles, modes, filters).
- A section that folds on phones: `Disclosure` (`ui/disclosure.tsx`, a native `<details>`) or a CSS
  breakpoint. The former `MobileSection` was removed.
- `PanelHeader` wraps its actions; `Panel` is `min-w-0` so grids never force page overflow.
- `ChampionPortrait` images carry width/height, `loading="lazy"` and `decoding="async"`.

## Tables

Tables with more than four columns render as cards on phones and as the table from `md`:
Data jobs and the player's champion proficiency table. Match history rows wrap into cards by the
list's own width (owner decision D8): a phone's card under 36rem (about 118px; both teams left to
the game's own screen), a two-row card from 36 to 50rem (about 120px: the game's figures and build,
then both teams) and one row from 50rem; on phones a game opens as the match window over the whole
screen (Back closes it). Encounters' column names pin under the section tabs where those pin (from
md, in a window taller than 480px), as All Champions' do.
A game's breakdown (under its Match History card, or in the match window) sizes its scoreboard by
its own width (container `bd`, not the screen): name, KDA and items on phones, damage from 36rem,
gold, CS and vision columns from 60rem; its four section tabs share a phone's width.

All Champions follows its list's own width too (a container query, so the sidebar counts):

| List | Layout |
| --- | --- |
| under 17rem (a phone at 150% or 200% text) | each row stacks: the name, then the win rate and games, then the figures as labelled pairs, so no name is squeezed out |
| under 20.5rem (a 320px phone) | a row per champion, the win rate and games at its right and the figures as pairs under it (the pair it is sorted by first, in semibold); the search on its own line over Sort by |
| from 20.5rem (a 360px phone) | the search and Sort by share one row: the words "Sort by" are the control's accessible name, read out only, and the control shows the sort mark before the column's name (the columns' short names, as the table's headings write them) |
| from 44rem (a 752px tablet, a 1024px computer with the sidebar open) | the table: the champion column keeps 11.75rem, so every row is 51px for every role; a quiet bar under each champion's games is its share of every game in the filters, said by a key in the toolbar's row ("share of the 36 games in these filters", beside a sample of the bar) and, for each champion, in words read out (never "0%" for a champion that was played: "under 1%") |
| from 76rem | the four multikills in columns of their own, and the figures in groups (the record, the play, the multikills, mastery) |

On a phone, upright or held sideways, the section's title is left to screen readers: the current
tab, in the top bar or right above the section, names it. A champion's window on a phone (below
`sm`) has a 48px portrait, the scope beside Matchup Intel across the window's width, Refine at the
end of the tabs' row (its panel opening right after that row, so it follows its button in reading
and focus order and the button stays where it was tapped) and the figures three by two with short
labels (CS/min, Damage/min, Mastery; the whole labels read out). Every figure and label is written
whole, Mastery points too: the last column, which holds KDA and Mastery, takes the room its figures
need (seven digits on a 320px phone), the middle one keeps "Damage/min" whole, and the first, with
the shortest labels, takes the rest. At a larger text size the figures go two across from a 12.9rem
box, where the first column still holds "Damage/min" and "Perfect" beside seven digits, and one
across below it (a 320px phone at 150%). On a touch screen its tabs and both
multikills ⓘ are 44px targets. The lane comparison starts at 524px instead of 631 on a 393 × 852
phone. The plan estimated about 460px; since it was written, the scope row also holds Matchup Intel
(#292) and the scope wraps rather than cutting off the account (#300), and the tabs are 44px on a
touch screen. From `sm` the window is as it was (three figures across, six from `lg`), its tabs
44px on a touch screen. `e2e/profile.spec.ts` checks the phone's title (upright and sideways), its
scope line, toolbar and sorted pair at 393, 375, 360 and 320px, 200% text on a 320px phone, the bar
and its legend against the filters' games, and the groups with the 76rem grid's headings, arrows and
figures at 1536 and 1680px; `e2e/matchups.spec.ts` checks the window on a 393px phone (the portrait,
Refine and its panel's order, the tiles and their labels, the 44px tab and ⓘ, the lane's top) and on
a 320px one (whole figures, seven-digit mastery too), and from `sm` on the tablet and the desktop.

## Tests

`pnpm build && pnpm test:e2e` runs `e2e/responsive.spec.ts` on phone (375), tablet (768) and
desktop (1440) against a production build on an in-memory database with the demo roster, which
reads Riot's Data Dragon at the version the curated Matchup Intel notes were checked on
(`DDRAGON_VERSION`, set by `playwright.config.ts` from `e2e/ddragon-version.ts`;
MATCHUP_INTEL.md, "What the browser tests pin"). A demo server started by hand for the specs
(`E2E_PORT`) needs the same environment, `DDRAGON_VERSION=16.22.1` included: outside CI
Playwright uses a server already on the port as it is. It checks: no horizontal overflow on every page, navigation (tab bar, drawer, sidebar), 44px targets
and 16px inputs on phones, and the champion picker on the player profile.
`e2e/responsive.spec.ts` also checks Settings: at the three widths, and at 734 × 343, 863 × 360 and
320 × 568, the account card's Tab order against the order it is drawn in, Sign out on the first
screen, the card above the sections on a phone and a sticky column beside them wider (not pinned in
a window 480px tall or less), the name, the neutral role badge and the picture's control named in
full, each field and its Save on one row (44px on touch screens), the password form shown, the
index as chips in each window 480px tall or less; on a phone who you are beside the picture, the
index's chips (44px, bordered, no dots, the section being read marked on screen), an index link's
jump landing under the top bar, focused, and Back from the next page coming back to it; on tablets
and desktops who you are under the picture across the card and the index a list; on a desktop Name
& username side by side, and the index marking the section being read
as a member's three sections scroll by; on a 320px touch screen a tap on or just under a wrapped
quiet link (My Profile, Sign out under it) still its own. `e2e/resources.spec.ts` checks the Library's index (a
section by tapping, the counts following the search), its layout at each width (two columns pinned
from 640px, the panel titles' size, the host cut first and ↗ drawn, descriptions whole on a touch
screen), the index whole at 1024, 1280, 1300, 1366, 1440 and 1480 with the sidebar open and folded,
where neither a section chosen nor a search moves it or the list, and the ★
segment (its server width, scripts held back, equal to the hydrated one; its count filling without
moving the list). `e2e/navigation-reach.spec.ts` keeps where you are in reach: on a phone a profile section chosen
far down the page starts at its top once its content has arrived (tapped in place, without
Playwright's own scroll into view); on tablets and desktops the Team and profile tabs stay pinned
as a long page scrolls, All Champions' column headings pin under them, and nothing is pinned in a
short window; at 2560 × 1440 and 3440 × 1440 every tab row's first tab starts at its pages' column
within 1px on each section of its set (Team's, Resources', Platform Settings', a profile's,
Leaderboards' and Match History's views, Users & Permissions'), and at 1920 × 1080 with the sidebar
folded the bars of `main`'s own (Team's, Resources', Platform Settings'), measured once the page
itself has replaced its loading state: the row in the same place on all of a set's sections, Team's
name ending at the column's right edge, the bar's line spanning the room, and on Team Overview the
header centred in Team's column; under a 1600px window (1536 × 864, the sidebar folded) Players and
Matches stay 80rem and the row spans the bar, as before; the tablet's menu keeps focus inside and gives it back to the menu button; the
installed app's Back on a tablet (the display mode stood in for, as Chromium cannot emulate it);
the filter sheet's Done leaves with its motion; Admin Mode's Settings has its title.
`e2e/popups.spec.ts` keeps what shows over a window inside it: an ⓘ's bubble in a window drawn
inside the window and above it where its trigger puts it (also while the window is moved and
scaled, and once a motion of the window's own is over), Escape closing the bubble alone; an ⓘ
arriving under a pointer at rest as its window opens kept closed until the pointer moves onto it,
so Escape closes the window, whatever has its focus (the window itself, its close button, nothing
after a press inside); an ⓘ a mouse moved onto while the page hydrated, and rests on, opening as
the ⓘ hydrates, that ⓘ alone, its visit then as any other, also when React already listened and
only the chunks with the ⓘ's code were held back (the coming in React replays once the ⓘ has hydrated starts no new
visit: after Escape, a move keeps the bubble closed); a bubble on the page landing 6px from
its ⓘ whatever its height (a fractional one too); a toast raised over a window drawn in it, heard once, its 44px dismiss
button (measured once the toast's entrance has run) pressed where it is drawn; a toast never drawn in a window while the window moves
in, and leaving it as its closing motion starts; a toast raised in the moment its window closes
heard once, on the page (a toast counts as heard each time a frame draws it with its live role:
one added and taken away before the next frame never reaches a screen reader); a window opened by
a tap holding the focus itself until it is pressed (after a click on a desktop or a tap on a tablet,
and at every press, Page Down then scrolls its body) and one opened from the keyboard its close
button (the tablet's menu the same, and its page lock); and on a phone, the Filters sheet's pickers
and the opponent picker opening their list in the window's body, a tap under an open list reaching
what was tapped, the opponent search at 16px, and the add-champion list ending above the tab bar.
Team Overview's lineup: `e2e/home-layout.spec.ts` (1440 × 900 and 1920 × 1080: five across,
centred under the section tabs with no bench under the cards, nothing to scroll, the art within its
20rem cap, the floor drawn from just under the cards; 1366 × 768: five equal cards in one centred
row, whole on the first screen; 2560 × 1440: the 84rem cap; a 1440 × 560 window starting at the
top), `e2e/team-layout.spec.ts` (from a tablet up the header's eyebrow over the name, the name's
size and the state under it; 2 + 2 + 1 on a tablet and five across on a desktop, the track and the
stage ending with the cards, no bench; 3 + 2 on a 1280 × 800 laptop; at 1366, 1440 and 1920 the
kills / deaths / assists line shown and whole on cards from 14.5rem, and Edit lineup's two labels
whole side by side; on a phone the logo beside the name with the state and Edit lineup on the line
under them, the track and its role bar of icons and names, no bench, and no later card's member's
picture asked for while the first card's art loads), `e2e/mobile-landscape.spec.ts` (held sideways
on an iPhone 15 and an iPhone SE (3rd gen): 2 + 2 + 1, no sideways track, no role bar, the 44px
logo), `e2e/team-flip.spec.ts` (turning, choosing, replacing and removing a substitute, Make
starter and the keyboard focus after it, with reduced motion too), `e2e/team-logo.spec.ts` (the
logo's sizes, and the logo starting its row wherever it sits, the Team tabs' row at 1440 and at 2560,
where the row is narrower than the bar, included) and `e2e/card-layout.spec.ts` (identity rows level). `home-layout`'s Team tests and
`team-layout`'s grids read the lineup once it is laid out and at rest (`lineupAtRest`,
`e2e/lineup.ts`): it streams in through `(app)/loading.tsx`'s Suspense boundary, and React can
reveal it up to 300ms after the first paint, after the load event `page.goto` waits for, when its
five cells can already be counted with no size.
In this repository's sandbox set `PW_CHROMIUM_PATH` to the Chromium binary.

The wider audit script that produced the before/after numbers (eight viewports × twelve routes,
overflow in pixels, small targets, sub-16px inputs) lives outside the repo; its findings are in
the responsive pass report.

## Phase 3 checks

`e2e/quality.spec.ts` loads every player page at 320×640, 375×667, 390×844, 430×932, 768×1024,
1024×768, 1280×800, 1366×768, 1440×900, 1920×1080, 2560×1440, 3440×1440, 3840×2160, 844×390
(phone landscape) and 1366×600 (short laptop) and fails on any horizontal overflow or a missing
heading; admin pages at five widths. The same file runs axe (WCAG 2.1 A/AA) on every page and fails
on critical or serious violations, and again at 1920 on Team's four sections and Resources, where
the section tabs' row takes the pages' width.
Panel layouts that live in variable-width columns use container queries (`@container`, `@xl:`) rather than viewport breakpoints.
For example, Team Matches' cards take their four columns from their list's width (`@container/tm`, from 58rem), because the sidebar beside the list takes 4.5 or 16rem of the same window (`e2e/played-together.spec.ts`); inside a card the members go two to a row from a 34rem column of their own (`@container/members`: a tablet's stacked card, or the four columns beside the open sidebar at 1440), and from sm a member's CS and damage show where the member's row is 19rem (`@container/member`): beside the role and champion where both fit whole, on a line of their own under them otherwise, so a long role and champion ("Role unknown · Nunu & Willump", the longest the game can show) is never cut for them. On narrower cards the result, its game and the count of members are one line of words that wraps, the bookmark in the corner; on a phone's card the count is read out only.
Leaderboards' Records places its three boards by its own width (`@container/records`): one column under 62rem (with an index of its sections under 36rem, on phones), the record book beside the multikills from 62rem (1440 with the sidebar open; 1280 with it open is 60rem, one column), three columns from 98rem (2560 and wider; the milestones' column then keeps the 32rem from which a chip names its champion). Each board's rows follow the board's own width (`@container/list`): the book's are three lines under 36rem and two beside the picture from it (the record and its qualifier over the holder, champion, role, K/D/A and date; 64px where each fits its line), a member's multikills one line from a 21rem list, a member's milestones one line from 40rem. Under a 16rem book, a phone at 150% or 200% text, a record's row is one column (the picture over the record, the holder, the game and the value with its unit, which wrap), so the page is no wider than a 320px phone at either size (`e2e/phone-wraps.spec.ts`; the screen counts are in `docs/TEAM_LEADERBOARDS.md`).

## Device matrix

`e2e/mobile-landscape.spec.ts` (run once, from the phone project) opens its own Chromium
contexts with Playwright's device descriptors (iPhone SE, iPhone 15, both ways round) and checks
the short-window rules above: no tab bar and a top bar that gets out of the way, whole-screen
windows that scroll as one with reachable 44px controls, dialogs that keep their title and actions
on screen, state kept across a turn of the phone, tab rows that fade and keep the current tab in
view, ⓘ targets, and the Branding save bar. Upright, it checks that the player window scrolls as
one on an iPhone SE while the match window keeps its own scrolling body, and that the preview
badge never covers the team name. These are emulated devices: they check layout, size
and behaviour in Chromium, not Safari's own toolbars, keyboard or rotation animation, which need a
real device.

## Safari and iPhones

Three levels, each saying what it proves:

- **Chromium with iPhone sizes and user agents** (every pull request): the phone and landscape
  rules above, 16px fields, safe areas, and Install App's iPhone and iPad instructions
  (`e2e/install-app.spec.ts`: Share → Add to Home Screen, in-app browsers). Chrome can be told an
  iPhone's safe areas (`Emulation.setSafeAreaInsetsOverride`), and `e2e/account-screen.spec.ts`
  checks the account screen with them on seven phones (MOBILE.md, "The account screen"). Layout and
  behaviour, in Chromium.
- **Safari's engine** (by hand): `e2e/webkit.spec.ts`, in the `webkit` project that exists only
  with `E2E_WEBKIT=1`. Run it with the WebKit workflow (Actions → WebKit → Run workflow, 8 to 14
  minutes with the Safari 26 check below, most of it installing system libraries), or locally after `pnpm exec playwright install webkit` with
  `pnpm build && E2E_WEBKIT=1 pnpm exec playwright test --project=webkit`. On an iPhone-sized,
  touch WebKit it checks:
  - the priority pages load with no page error (hydration included) and no sideways scrolling;
  - Team's card track and role tabs, by tap;
  - a teammate's profile sections and a champion's window;
  - the Card Studio's section list, a palette and Cancel;
  - the account screen: one tap opens it, at rest it fills the screen exactly with nothing in it
    scrolling, every control a row at least 48px tall reached by a tap where it is drawn, the screen
    holding the focus, the page left where it was (at the top and scrolled);
  - the Admin Mode switch;
  - fields at 16px or more (Safari zooms into smaller ones) and sign-in's password autofill attributes;
  - popups over windows, where Safari differs: a window opened by a tap holds the focus itself with
    nothing in it ringed, a tapped ⓘ in a game's window is drawn inside it and the first Escape
    closes the bubble alone, and an error toast over the picture editor is drawn in it, its dismiss
    button answering a tap where it is drawn;
  - the pages held sideways;
  - the Home Screen metadata: `apple-mobile-web-app-*`, the touch icon, the manifest and `viewport-fit=cover`.

  None of these tests signs a member in. One that does must keep the session itself: WebKit keeps
  no `Secure` cookie on `http://localhost`, and the e2e server is a production build whose session
  cookies are `Secure`. Ranked Development's iPhone test stored the sign-in's cookies again without
  `Secure` and blocked the service worker so every request was routed (commits `e87dd15` to
  `985c65a`; removed with that feature).

  This is WebKit as Playwright builds it for Linux, the current one (WebKit 27): Safari's engine, not
  Safari on an iPhone, and not Safari 26 (next).
  **Status, 10 Nov 2026:** the WebKit workflow passes on #280's branch at 747edc01, its last change
  to the app and the spec: the 18 tests of this spec (the Match History Timeline tap passed on its
  retry) and the 26 checks of the next step (run 42819925844). On 7 Nov it passed 17 of 17 on `main`
  (run 42373258830) and on #262's branch (run 42401195789).
- **Safari 26's engine** (by hand, the same WebKit workflow, after the step above):
  `scripts/webkit26-check.mjs` in Playwright 1.58.2's WebKit 26.0, the last build before WebKit 27.
  Safari 26 and earlier (iOS, iPadOS and macOS 26) collapse a window that is as tall as its content
  to its header when its body grows from nothing (`flex-1`); WebKit 27 and Chromium draw it whole,
  so the tests above passed while the account menu was a 95pt strip on the owner's iPhone on 10 Nov;
  in WebKit 26.0 most sheets, the compact windows and the centred windows collapse the same way
  (MOBILE.md, "Why the account menu was a strip on iPhones"; DetailModal's `BODY_SCROLLS`). The check opens the account screen, the
  install window, the filter sheet, the lineup editor, a player's window, a game, the Card Studio,
  the sign-in window, the tablet's menu and the account dropdown on four phones (an installed app's
  whole screen, Safari's tab, the smallest iPhone, held sideways), an iPad and a Mac, and fails if a
  window's body shows less than its content (or 160px of it where it scrolls), if the account screen
  does not fill the screen with every control in reach and the page behind unmoved, or if a sheet
  on a phone leaves the bottom edge. Run on main's code from before the fix, 14 of its 26 checks fail,
  the account panel exactly as the owner saw it (377×95, one of six controls in reach); with the
  fix, all 26 pass. Playwright 1.58.2 builds WebKit for Ubuntu up to 24.04 (not 26.04), so the
  workflow runs on `ubuntu-24.04`; locally, the same commands work on Ubuntu 24.04:

  ```bash
  npm install --prefix /tmp/pw26 playwright-core@1.58.2
  ```

  ```bash
  PLAYWRIGHT_BROWSERS_PATH=/tmp/pw26/browsers node /tmp/pw26/node_modules/playwright-core/cli.js install --with-deps webkit
  ```

  ```bash
  pnpm build && PW26_CORE=/tmp/pw26/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/tmp/pw26/browsers node scripts/webkit26-check.mjs
  ```

  A window built on `DetailModal` gets this for free; anything else as tall as its content (a
  `<dialog>`, a popover) needs its scrolling part to grow from its content too (`flex-auto`), and
  `src/components/ui/overlay-sizing.test.ts` checks the overlays it lists.
- **The iOS Simulator** (10 Nov 2026; a workflow kept on two throw-away branches, never on `main`,
  to be deleted unless the owner wants it kept): Mobile Safari on iOS 26.5 and 26.2 and a Home Screen
  web app on iOS 26.5, in the Simulator on GitHub's macOS runners, against a demo build, with real
  touches (branches `ios-sim/account-menu-baseline` and `ios-sim/account-menu-fix`, runs 42802301642
  and 42802307377). On main's code the account panel was 95px tall with one of six controls in reach
  in Safari (one of five installed, where Install App is hidden), and the filter sheet 189px in
  Safari's tab (whole when installed); on #280's code the account screen filled the screen (695px in
  Safari, 793 and 812px installed) with every control in reach, and the filter sheet was whole
  (410px). It is iOS's own WebKit, but a simulator: the Home Screen app was set up by the run, not by
  Share → Add to Home Screen.
- **A real iPhone** (by a person; nothing above covers it):
  1. Add to Home Screen from Safari's Share menu: the icon and name come from Branding, and the app
     opens full screen with its content clear of the notch and the home indicator.
  2. Sign in inside the installed app (iOS keeps its cookies apart from Safari's), close it and
     open it again: still signed in.
  3. Turn the phone on Team, a profile and Resources: the layout follows, the tab bar steps aside
     sideways, and nothing sits under the notch.
  4. Type in a field (display name, a Riot ID when linking an account): no zoom, and the keyboard covers
     neither the field nor its Save button.
  5. Swipe Team's cards: one card at a time, and an upward swipe still scrolls the page.
  6. Open and close a detail window and the Card Studio: the page behind does not move.
  7. Open the app with no connection: the offline notice shows.
  8. On an iPad, add to Home Screen and open it: Players shows the whole roster on one screen, two
     up, and a row opens its profile with one tap; Matches scrolls under the pinned Team
     tabs, a tab from there switches the section; a teammate's profile shows "‹ Players" in the top
     bar (the installed app has no browser Back) and it leads back; the menu drawer opens, the page
     behind it cannot be tapped, and closing it returns to the menu button.
  9. In the installed app and in Safari, tap your avatar on Team, on Resources scrolled to its end,
     and after typing in a field and closing the keyboard: the account screen fills the screen under
     the status bar, your picture, name and role at its top, every row, the mode switch and Sign out
     in view and each answering a tap; × closes it, and the page behind has not moved. Then open
     Filters on a Match History, and on Team Edit lineup, a role's Change (then Cancel, so nothing is
     saved): each sheet shows its choices, not just its title. (On 10 Nov the account panel was a 95pt strip at the top and the
     sheet before it a strip at the foot of the screen; MOBILE.md, "Why the account menu was a strip
     on iPhones".) Settings → General → About gives the iOS version: 26 or earlier is the engine that
     collapsed them.
  10. Popups over windows: open a game and tap an ⓘ in it (the ranks under the scoreboard): its
      bubble shows over the window, beside the ⓘ. Tap a player on Team: the window opens with no
      ring around its ×. On Team → Matches, Filters, tap Played with: the list opens inside the
      sheet's body, which scrolls (the sheet's header and footer stay), and nothing in it is cut
      off; with the list open, tap Team members in the game below it: that field answers. In a
      champion's window, Matchups, tap the opponent: the list opens in the window and the search
      does not zoom the page, upright or sideways. On your profile, Edit pools, tap Add champion in
      a cell halfway down the screen: the list stays above the keyboard. (A toast raised over a
      window, drawn in it, is checked by `e2e/popups.spec.ts` and the WebKit workflow.)

**Browser features against Safari 16.4** (reviewed 21 Oct 2026). Tailwind v4 and Next.js 16 need
Safari 16.4 or later, so that is the floor. Nothing the app uses needs more:
- Script: no `requestIdleCallback`, `Object.groupBy`, `Promise.withResolvers`, Set methods, the
  Popover API, View Transitions or anchor positioning.
- CSS: container queries, `:has()`, `dvh`, `lh`, `color-mix()`, `inert` and `<dialog>` all work from
  16.4.
- Fallbacks: hidden scrollbars carry the WebKit rule (`[&::-webkit-scrollbar]:hidden`), and the
  build adds the `-webkit-` prefixes for `backdrop-filter` and `mask-image`.

