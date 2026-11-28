# Responsive design

UNIIVERSE is used on phones straight after a game, on tablets at the desk and on laptops and
large monitors. One set of breakpoints (Tailwind's defaults) is used everywhere:

| Range | Name | Shell | Layout rules |
| --- | --- | --- | --- |
| < 640px | small phone | top bar (Back or the team's mark, the page's title, the avatar for the account screen; a destination's tabs or a profile's sections as its second row), bottom tab bar of the sidebar's four destinations | one column, 44px targets, 16px inputs, full-screen pickers, lists as rows ([MOBILE.md](MOBILE.md)) |
| 640–767px | large phone | same | one column; some header rows become two columns |
| 768–1023px | tablet | top bar holding the destinations, the avatar menu (no tab bar, no drawer) | two columns where useful |
| 1024–1279px | laptop | sidebar | desktop layout |
| ≥ 1280px | desktop | sidebar | desktop layout, wider content |

Below 1024px a window 480px tall or less (a phone held sideways, whatever its width: 568px to 956px)
has the phone's frame in one compact bar instead: the destinations in the top bar, no tab bar
([MOBILE.md](MOBILE.md), "Frames by posture").

Class prefixes: `max-md:` = phones, `md:` = tablet and up, `lg:` = sidebar, `xl:` = wide desktop.
Touch devices of any width also get 44px buttons (`pointer-coarse:`).

## Phones held either way

Width decides the layout; height decides how much may stay pinned. A **short window** is one 480px
tall or shorter: in practice a phone held sideways (320–430px tall). Tailwind has a `short:` variant for
it (`globals.css`), and every pinned element follows these rules:

| Element | Upright phone | Short window (phone sideways) |
| --- | --- | --- |
| Top bar | sticky; a destination's tabs (Team's sections) or a profile's sections as a 44px second row | one compact bar (below `lg`, at any width): 44px plus the inset, holding Back or the mark, the four destinations, the title where room is left, Filters and the avatar, a destination's tabs or a profile's sections as a 44px second row; slides away while the page scrolls down; back on any scroll up, at the top, and while it holds focus |
| Tab bar | fixed at the bottom; `main` keeps room for it (`pb-tabbar`) | none: the destinations are in the top bar; `pb-tabbar` keeps only the page's own padding, clear of the home indicator, and the scroll padding at the foot only that indicator |
| Detail windows (`DetailModal`) | whole screen below `sm`, centred window above; one whose header would fill over 40% of a phone's screen (the Team player window on a small phone) scrolls as one, as in a short window | whole screen, scrolling as one: a large header scrolls away, its close and step buttons float at the top, a footer stays pinned |
| The account screen (`DetailModal size="screen"`, behind the phone's avatar) | the whole screen, fixed to its four edges, under the status bar; its rows in a readable column (28rem); at the usual text size nothing scrolls on phones from 375pt wide (a few points for an administrator in Admin Mode in Safari's tab on a 375pt iPhone SE; a little on a 320pt screen in Safari's tab) | the whole screen too; only its body scrolls, as one region, under its bar with the close button; a row's name wraps between its words, and on a narrow phone a page's chevron and then the icons give way (`lib/sheet.ts`), so every name is whole to 200% on a 320px phone |
| Sheets (`DetailModal size="sheet"`: `Dialog`'s confirmations and editors, the filter sheet, the lineup sheet) | docked to the bottom edge, as tall as its content up to the screen less 2.5rem and the status bar (a share of the screen it is fixed to); a taller wider screen gets a centred window | docked to the bottom edge too, up to 44rem wide and the screen less 0.5rem; in both, the header and footer stay and only the body scrolls, unless they would leave it less room than its tallest control needs (large text or a zoomed page, mostly on a phone held sideways): then the whole sheet scrolls as one, like a page (`data-flow`) |
| Things pinned to the bottom (toasts, a save bar) | `bottom-tabbar`: above the tab bar; over an open window or sheet the toasts are drawn inside it, in the same place, once it has finished moving in (they leave it as it starts to close) | near the bottom edge, clear of the home indicator (`bottom-tabbar`'s short rule) |

Turning the phone keeps state: windows, filters and tabs live in the address or in component
state, never in the orientation, so a window open in one orientation is open in the other.

**Safe areas.** The viewport uses `viewport-fit=cover` and the installed app draws under a
translucent status bar, so:
- side gutters use `px-safe-4` / `px-safe-6` (the gutter, or the notch's inset where larger) for
  the top bar, `main`, the public page, toasts and whole-screen windows;
- whole-screen windows pad the status bar (`max-sm:pt-safe`); a window's body keeps its last line 1rem from the bottom edge (1.25rem from `sm`), a sheet's footer its actions 1rem where the sheet is docked (0.75rem where it is a centred window), and other windows' footers 0.75rem, or the home indicator's inset where it is larger (`pb-safe-4`, `sm:pb-safe-5`, `pb-safe-3`); a window that scrolls as one on a phone keeps a bar over the status bar, so text never scrolls under the clock;
- `pt-safe-N` and `pb-safe-N` (like `px-safe-N`) are N spacing steps or the inset, whichever is larger, and are an element's only padding for that edge: beside another one (`py-4 pb-safe`) Tailwind's own order decides which wins, and the bare inset did, 0px in a browser (#265). `src/app/design-tokens.test.ts` refuses that pairing, and an arbitrary `max(…, env(safe-area-inset-…))` padding a utility writes;
- preview pages (Admin → Previews) leave room for their fixed "Preview" badge (`PREVIEW_PAD_TOP`);
- the tab bar pads all three; the top bar pads the status bar's inset and, sideways, the notch's (`px-safe-2`; `sm:px-safe-4` from 640px).

## Touch targets

- 44px on touch screens (`pointer-coarse:`), 24px minimum everywhere (WCAG 2.5.8).
- Small marks keep their look and get a bigger target: the ⓘ (`InfoTip`) is a 24px button around
  its 16px mark (negative margins keep the line), with an invisible 44px area on touch screens;
  inline text links use `touch-target`.
- Close buttons of dialogs, windows and pickers are 44px on touch screens.
- A list row's link (the shared list's `RowLink`, a Peek row's, a roster card's: `ROW_LINK_COVER` in `ui/data-list.tsx`) covers the row's dividing line too on touch screens, so a 44px row's link is 44px, not 43 (Release 10); a mouse's rows keep their heights.
- A toast's dismiss button is 44px at every width, around its 16px mark: its negative margins reach
  into the toast's own padding, so the toast is no larger for it.
- Controls on a card (a flip button, social icons) stop their event: using one never opens,
  turns or selects the card.
- Rows of small targets stand far enough apart that no target's 44px area covers a neighbour's box
  (19 Nov 2026; Matchup Intel's, retired 23 Nov 2026): Matchup Intel's chips and keys 12px apart from row to row and 6px side to side on
  touch screens (`CHIP_ROWS`), its folds and source tips likewise; `e2e/matchup-intel.spec.ts` samples
  every control's box on the phone and the touch tablet and runs axe's WCAG 2.2 target-size rule.

## Long lists inside a page

A list opened inside a page (a table under a `<details>`, an event list) runs with the page on a
touch screen: a box that scrolls inside a scrolling page catches the finger, and the page stops
moving. With a mouse or trackpad (`pointer-fine:`) it may keep a height limit and scroll in its box
(Match History's timeline tables and Ranked progress's readings do: `pointer-fine:max-h-64 pointer-fine:overflow-y-auto`, and
their header sticks only there). Windows and dialogs keep their one scrolling body (above), except
in a desktop's one-screen workspace ("One-screen desktop pages", windows in the workspace).

A picker's list inside a window keeps that rule too. The member and champion pickers (in the
Filters sheet on phones) open their list in the flow of
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

Such a row scrolls sideways only, and draws no scrollbar (18 Nov 2026). `overflow-x: auto` makes
the other axis `auto` too, so a row that reaches a fraction of a pixel below its box becomes a
vertical scroll box as well, and where scrollbars are classic (Windows, a desktop set to always show
them) it draws one: the owner saw a tiny vertical scrollbar just left of the team's name at the end
of the Team tabs on Leaderboards. Measured with the browser's scrollbars shown, on the base it
appeared in 128 of 480 measurements (Team's four sections at 1280, 1440, 1920, 2560 and 3440, the
sidebar open and folded, at 80-150% text and 80-150% zoom), among them every section at 1920 and
3440 at 100% zoom and text, where the app's root size is 17.7px and 22px. Its three causes, each
fixed where it was:
- the selected tab's bar sat 0.125rem below the tab's padding, in a 2px transparent border: more
  than the border wherever the root size is above 16px, and borders are rounded to whole device
  pixels at some zoom levels, so it reached past the tab. It is drawn at the foot of the tab's own
  padding now, in the same room (`tabIndicatorClass`, every row of tabs);
- the rows scroll sideways only (`overflow-y: hidden` on `TabBar`'s list and `ScrollRow`);
- their `scrollbar-width: none` never applied: the stylesheet's thin scrollbars for every element
  were outside any layer and beat every Tailwind utility, which are in one, and Chrome then ignores
  `::-webkit-scrollbar` too. The rule is in the base layer now, so the rows that hide their
  scrollbar do and every other scrollbar is as it was.
`e2e/section-tabs-scrollbar.spec.ts` runs with scrollbars shown and checks every scroll box in the
Team tabs' row at those sizes, and that a row narrower than its tabs still scrolls to its end.

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
| under 36rem (phones upright) | a carousel that loops (23 Nov 2026; `useLoopTrack`): one card at a time across the page's width inside its gutter (the track reaches the screen's edges, the gutter its padding; the cards a gap apart that keeps the next card out of view at rest), native swipes with a snap point a card, past the last card the first and before the first the last; five position dots under it (44px tabs, sized in px), members' and public page alike; the card's picture beside the name. No lineup pager over it (it showed the players' pictures until then) |
| 36–56rem (iPads, upright and landscape; a 1024px laptop with the sidebar open) | 3 + 2, capped at 54rem, the second row centred: never a card alone on a row |
| a phone held sideways (480px tall or less, 36rem or wider) | five across, compact: art at least 88px, the name, rank and the season's three figures (the picture with "You", the role status, tagline, links, record lines and pool in the player's window); under 36rem (larger text) a track of about two cards |
| 56rem and up (a 1280px laptop with the sidebar open, and wider) | five across, capped at 84rem (S3a, 20 Nov 2026: 3 + 2 from 56 to 64rem before); Team's whole column, 100rem at most, from a 1920px window (S2c) |

- **The header**, from `sm`: the logo (64px, 80px from `lg`) beside the accent "Team Overview"
  eyebrow over the team's name (30px, 36px from `lg`) and "Main lineup · season", the lineup's
  state under them as a pill with its ⓘ inside (green "Lineup complete"; warn "Assign all five
  roles" for a lineup manager, "A lineup manager assigns the five roles" for everyone else), and
  Edit lineup at the row's end: 113px tall at 1440 × 900. On a member's phone, upright or held
  sideways, the bar already carries the team's mark and name: the logo goes and the name is read
  out only, leaving one 44px line, "Main lineup · season" over the state, Edit lineup at its end
  (102px tall upright and 71px sideways before, S2b). The public page keeps the logo (48px) and the
  name on the first line, the state and Edit lineup the next. Below `sm` and in a short window the
  eyebrow is for screen readers only. The name keeps to one line; a longer one ends in an ellipsis.
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
    313px at 1920 × 1080 and 412px at 2560 × 1440. 1280 × 800 is five across on one screen (1.00;
    3 + 2 at 1.28 screens before S3a), one row at every width from 1280 to 1440; an upright iPad
    (810 × 1080) is 3 + 2.
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

**The Library** (the Resources page, its sidebar entry's one page, `resources/resources-view.tsx`; 18 Nov 2026). A search, the
index (All, ★ Favourites and each section with its count, the counts following the search: one
choice that filters the list, `segmentClass` buttons in a radio group) and the live count at the
index's end, then the sites grouped by section, an `h2` each:

| Width | Layout |
| --- | --- |
| phone (< 640px) | a full-width search; the index under it, wrapping onto two lines of 44px chips at 375px and wider (since 20 Nov 2026, UM.R1: it scrolled sideways, 4 of 7 sections off the screen at 393; Favourites is its ★ there, the League of Legends section "League"); one panel, a heading per section, hairlines between the rows |
| a phone held sideways, from 640px wide (`sm` in a window 480px tall or less; a 320pt iPhone held sideways is 568px wide and keeps the upright layout) | the search and the index share a row; a panel per section, two columns |
| tablet (640–1023px) | the search on its own row, the index under it, scrolling sideways, with the live count at its end; a panel per section packed into two columns (`columns-2`, each panel kept whole) |
| from `lg` | the index whole wherever it is shown: beside the search only where the row has room for all of it and the count's longest form (1366 to 1480 with the sidebar folded), else on a row of its own, its segments wrapping onto a second line only where even that row is too narrow (1024, the sidebar open or folded); two columns, three from `xl` |

The plan said two columns from `md`; they start at `sm` so a phone held sideways (an iPhone 15 in
Safari is 734px wide) gets them too, which its 2.4-screen target needs (`e2e/resources.spec.ts`
pins it at 734 × 343, and one panel at 600px). A section panel's title is `text-base` from `md`, as
a panel's title is (STANDARDS.md, Type); a phone's headings, upright or sideways, stay `text-sm`. The live count ("11 resources") is read out only, at every width: each segment's count says it on
screen (one count, UD.R1, 20 Nov 2026). A
row is its site's icon (shipped with the app in `public/resource-icons` for the library's own sites,
else the host's initial: nothing is fetched from a site), the title (it wraps, never cut), the host
on a line of its own under it, whole (cut short only in a list under 16rem, a large text size), then
↗, and the description: whole on a touch screen, as in the base (whose clamp never applied), and with a
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
(`max-w-5xl`): At 175% and 200% text on a tablet or desktop (Release 10) the account column is at most 40% of the page (`min(15rem,40%)`, `min(16rem,40%)` from lg) and the password panel's Change password and Sign out of other devices wrap at any width (they ran 87–235px past a 1280 or 1440 window before): nothing scrolls sideways from 320 to 2560 at 100–200% (measured on the demo; phone-wraps.spec.ts checks a member's Settings at 320 with 200% and at 768, 1024, 1280 and 1440 with 175% and 200%). At the usual size the columns are as before from 700px; at 640px the 40% cap makes the account column 237px instead of 240.

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
Leaderboards' `SectionIndex`, drawn as the plan's chips on a phone and in a window 480px tall or less
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
name and Show publicly and one for the field, shared with Card Studio and the first
sign-in, pinned by `e2e/social-links.spec.ts`) add more. Those misses are for the owner to accept or
to take up in a later change.

## Phones at a larger text size (18 Nov 2026)

A browser's text-size setting scales every rem, so on a phone each part of a page is narrower, in
rem, as the text grows: a 320px phone's page is 18rem wide inside its padding at 100%, 12rem at
150% and 9rem at 200%. Parts sized for the usual text then had no room left: columns squeezed to a
letter a line, text cut by a clipping box, pages wider than the phone. Each fix below follows the
part's own width in rem (a container query) with a threshold under anything the usual text size
gives on a 320px phone, or lets a line wrap where it no longer fits, so at 100% nothing moves.

**The audit.** A large-text audit (a script outside the repository, like the responsive pass's)
loads every member page (Team; Players; Matches; Leaderboards and Records; Resources, Champion Intel
and one pair; Settings; a profile's Overview, Champions, Match History and Encounters) and every
Admin Mode page on 320 and 375px phones at 150%, 175% and 200% text, and reports for each page and
size: sideways overflow (the page wider than the phone), text cut by the nearest box that clips it
sideways (an ellipsis and the skip link excepted), and words of four letters or more broken across
lines without a hyphen (a column squeezed to a few letters). The public page is not on its list and
was audited on its own. Before (the release batch's base, `d706e7b1`), each mode found 48 entries (a
page at a size with a finding): 26 boxes cutting text, 54 with broken words, 3 pages wider than the
phone (a profile's Overview, by 14, 61 and 6px). After: 31, 12, 34 and 0, the same in both modes.
Gone: every entry on Team Overview ("CS/MIN" cut by 7 to 42px, "SUPPORT" by 43px), Players (names and
ranks broken), a profile's Overview (the season's "6 champions" cut by up to 63px), Leaderboards
(names a letter a line, "1 win behind" cut by 32px) and the Library (titles a letter a line, a
description cut by 47px). New, and deliberate: the roster's "·" cut off where its rank starts a line
(below), as Records' qualifier "·" already is. What remains is outside this work: words broken at
200% on a 320px phone on Team Matches, All Champions and Match History ("Support", "K'Sante"), and
Admin Mode's status words at 175% and 200% on a 320px phone (200% on 375px), which Admin Mode breaks
inside a word longer than its line by design (below). Matchup Intel's ("Mordekaiser", "Choose") went
with its redesign (19 Nov 2026): the same audit on 12 of its states (nothing chosen, one side, the
curated pairs and their reverse, assembled pairs, a long name, a mirror) at 320, 375, 393 and 852px
and 150% and 200% text finds nothing in either mode, 96 page states each (docs/MATCHUP_INTEL.md, "On
a phone"). The
public page, wider than the phone by 42, 103 and 163px at 150%, 175% and 200% on 320px (48 and 108px
on 375, 30 and 90px on 393, at 175% and 200%), has no finding left at 125% to 200% on 320, 375 and
393px, in either mode.

**Windows and sheets at 320px with large text** (Release 10, 20 Nov 2026; `e2e/overlay-kit.spec.ts`):
a window's own icon controls (‹ ›, ✕) are 44px on touch screens at every text size (in rem they
were 88px at 200% and pushed "Previous player" off a 320px screen); a plain title bar collapses
to one line once the body scrolls (sideways too), and the 56px bar stays 56px, so the frame once
scrolled is at most a quarter of a 320 × 568, 375 × 667 or 568 × 320 screen at 100–200%; and the Task dialog, the sheets, the sign-in form and the
player Peek keep every control on the screen, nothing scrolling sideways and no word cut short, at
200% (the Peek at 125–200%, upright and sideways). DESIGN_SYSTEM §7, "The phone window shell".

**Two ways to emulate a larger text size.**
- The root's font size in CSS (`document.documentElement.style.fontSize = "200%"`), as the specs
  do: every rem grows, but a media query's rem stays the browser's default 16px, so the breakpoints
  stay where they were.
- The browser's own default font size (Chromium's DevTools `Page.setFontSizes`; the audit's
  `LT_MODE=browser`), which is what a real text-size setting changes: the media queries' rem grows
  too, so the breakpoints move with the text (at 200% `sm` is 1280px).

The two agree wherever no media query in rem falls between the window's width counted in the one rem
and in the other. The container queries every fix below uses read the root's rem in both, so they
always agree, and on a 320px phone nothing differs up to 200%. Wider phones meet a few media queries
that differ. Upright, from 360px, Match History's and Encounters' Filters show their word with the
root's size and the icon alone with the browser's (`max-[22.5rem]`; 177 against 88px wide at 200%),
and from 375px a profile's header keeps the layout it has there at the usual size
(`min-[23.4375rem]`: a little less padding, and at 125% the picture over two rows with the roles
beside it) only with the root's. Held sideways, a 568px phone keeps Players' title beside its search
and Filters (`min-[35rem]`) only with the root's, and from 640px (734 × 343, 852 × 393) the root's
size keeps `sm` (at 852px `md` too): Settings has two columns there and is 165px wider than a 734px
window at 200% (55px at 852px), and one column as wide as the window with the browser's. At tablet
and desktop widths only the first gives a desktop layout with doubled text, a combination a real
setting never makes: at 200% a 768px window keeps the tablet layout with it, while with the
browser's own size it gets the phone layout (24rem wide, what a 384px window shows at 100%). So a
fault the first mode alone finds where the two differ is not one a reader meets, and a layout there
is checked with the browser's own size: Settings is 139px wider than a 768px window at 200% with the
root's size doubled, and as wide as the window with the browser's (MOBILE.md → The frame); the
Library's rows at 1024px and wider likewise.

**What each fix does** (the widths measured in Inter on the demo build; each pinned by its spec, on
the phone project):

- **Team Overview's lineup cards** (`team-roster.tsx`, `player-card.tsx`;
  `e2e/large-text-lineup.spec.ts`). A phone's card is the phone's width less the page's gutter (the
  carousel, 23 Nov 2026): 11.3, 9.4 and 8rem at 150%, 175% and 200% on a 320px phone (9.8, 7.9 and
  6.5rem with the glimpse of its neighbours before), where no card at the usual size is under 10.4rem
  (five across a 56rem lineup since S3a), so every threshold under 9.75rem applies to larger text only
  (a phone held sideways at the usual size gives its five compact cards about 8.75rem).
  - Under 9.75rem the season's figures wrap: the win rate on a line, KDA and CS/min (vision) under it,
    side by side where they fit ("CS/MIN" ran 42px past the card at 200%). Until the carousel the
    wrap began at 9rem, and from 9 to 9.7rem "CS/MIN" beside the win rate ran up to 18px past the box
    (the carousel's 9.43rem card at 175% on 320px; the track's 9.36rem at 175% on 360px). Under 9rem
    the wins bar keeps 2rem.
  - Under 9.75rem the pool's heading wraps instead of ending in "…", and the first choice goes under
    its portrait and wraps at its spaces ("Nauti", "12 gam" were cut); its "·" is held to its words by
    no-break spaces, so "14 games · 29%" never leaves the dot at a line's end.
  - The role chip has a lane from its corner to the card's controls (0.125rem short of them), or to
    the card's own edge where there are none (its clip, what a chip fitted before it had a lane).
    Where the lane is narrower than the role's threshold, the chip shows its icon alone as a round
    badge, the role's name kept for screen readers. A threshold is the chip plus a margin for the
    browsers' text, rounded up to the next 0.01rem: Mid 4.91, Top 5.02, Jungle 7.04, Bottom 7.38 and
    Support 7.81rem. The chips (Mid 4.872, Top 4.978, Jungle 7.001, Bottom 7.335, Support 7.773rem)
    measure the same in Chromium and in WebKit, within 0.1px at every size from 100% to 200%, and the
    margin over them is at least 0.036rem (0.6px at 100%, 0.9px at 150%, 1.2px at 200%). Text drawn
    with hinting differs by size: the Chromium headless shell the specs run in on GitHub rounds each
    letter's advance to whole pixels and draws a chip up to 0.12rem wider or narrower. Its Support
    chip, 7.818rem at 150%, ran past its 7.79rem lane on a 375px phone when the thresholds were the
    chips themselves (CI run 44442818521); at the sizes the specs check (150, 175 and 200%) its chips
    are within their thresholds, but for Support's at 150%, 0.2px over, inside the specs' half-pixel
    allowance. The margin can be no larger: the narrowest lane at 100%, beside a control on a 12.2rem
    card five across, is 125.19px, and WebKit tests a container's width in whole pixels (lanes of
    125.2 to 125.8px read as narrower than a 125.12px threshold, measured in Playwright's WebKit 27.2),
    so Support's threshold must be 125px or less for its name to show there at 100%, as it did before
    the chip had a lane. The spec also narrows each chip's lane to the chip's own width less half a
    pixel, at each size, and finds the icon alone there: in the browser it runs in, no lane narrower
    than a chip by more than half a pixel (the allowance of its other checks) shows the name, not
    only the lanes the demo's cards give.
  - Two controls (your own card's Customise and the turn control) stand one above the other under
    9.25rem; on a touch screen the art keeps its top clear of the controls where they reach over the
    picture (under 7.75rem with one control, 10.875rem with two side by side).
  - The header: under 11.25rem of frame (200% on a 375px phone or narrower) Edit lineup takes a line
    of its own, and a member's lineup state, with no Edit lineup beside it, the whole line under the
    logo ("Lineup complete ⓘ" ran 33px past a 320px phone at 200%).
  - The spec checks the five fronts and Top's back at 150%, 175% and 200% on 320, 375 and 393px:
    nothing past the card or out of the season's box, words whole, the pool's heading and first
    choice never cut short, no "·" ending or starting a line, the controls clear of the chip, the
    picture, the name and "You", every chip's name still given to screen readers (its aria snapshot:
    a name hidden to the eye only passes, one hidden from everyone fails), and exactly which chips
    show their icon alone (fourteen of the 45); then a member's own card with both controls at the
    same sizes (stacked under 9.25rem, the role's name only at 150% on 393px; the lineup put back by
    an `afterEach` should the test end before its own `finally` could), and the usual layout at 100%.
- **Players** (`roster-row.tsx`, `rank-emblem.tsx`; `e2e/large-text-roster-figures.spec.ts`). A row
  under 9.625rem (one across, so the roster under 11.125rem: 175% and 200% on 320 and 360px, 200% on
  375 to 414px), where the text beside the picture would have less than 6.5rem (what "· Grandmaster"
  with its crest and an eight-letter name with its emblem take), stacks: the picture alone on the
  first line, the text the row's whole width under it ("Emerald" had gone over three lines). A rank
  that does not fit beside its crest goes under it whole. The "·" before the rank (or "No Riot
  account") shows beside the role and never starts a line: in a row under 16rem (a roster under
  17.5rem, read as the stacked rows read it; a row on Players at the usual size is 16.375rem or
  more, where the rank always fits beside the role), where the rank wraps under the role, the dot is
  cut off with its room past the line's clipped left edge (Records' way; the dot sits between the
  role's icon and the rank's crest, where a no-break space has nothing to hold it to). Card
  Studio's preview of a row is the row in Players' own panel, in a frame as wide as a phone (Release
  17), so these rules apply there as on the page. The spec checks words whole on the demo's rows,
  nothing cut or past its row, every "·" either beside its role or cut off where the rank starts its
  line, at 100% and fourteen large sizes, and the Studio's preview of a row laid out as the row on
  Players at 390px, even beside the controls on a 320 × 480 screen.
- **A profile's Overview** (`recent-form.tsx`, `profile-editor.tsx`, `player-overview.tsx`;
  `e2e/home-layout.spec.ts`, `e2e/large-text-roster-figures.spec.ts`). Recent form's twenty bars
  share the card's width with no floor in rem (61px past the card at 200% on 320px). The champion
  pools' column names wrap under "Champion" as the figures wrap under the name; under 8.5rem of
  list, where a row cannot hold the columns' 7.5rem, the figures take the row's width and name
  themselves in words, and the column names step aside. The season's figures go two across under
  17.5rem of card (three across needs 17.34rem with the widest figures: "6 champions" ran 63px past
  the card at 200% on 320px) and one across under 11.75rem (two across needs 11.66rem). Season
  performance's title row wraps where the title and its buttons do not fit one line (Release 16, the
  review's M7: beside Filters the title was squeezed to 47–102px and ran under it at 200% on 320 and
  375px): the title keeps its line, the buttons take the next at its end, wrapping in turn.
- **Leaderboards' Recent form** (`recent-leaderboards.tsx`, `data-list.tsx`;
  `e2e/large-text-leaderboards.spec.ts`): the rows reflow at 17.5, 16.5 and 13.5rem of board, and
  "You" drops under a name it would break (TEAM_LEADERBOARDS.md → Recent form, Layout).
- **The Library** (`resources-view.tsx`; `e2e/large-text-resources.spec.ts`): under 16rem of list
  the icon and the star take a line of their own (the star at the row's top right, a 3 × 3.25rem
  target centred on the icon), and the title and description the row's width ("LoLalytics" is
  4.6rem and "announcements." 5.9rem; the row's line is 6.4rem at 200% on 320px, where the title had
  0px). 16rem is under every list at the usual size from 290px up.
- **The public page's header** (`public/layout.tsx`; `e2e/large-text-public.spec.ts`): its links
  (13.35rem with "Open the app") ran past a 320px phone from 150% (163px at 200%), and at 125% the
  mark sat under "Team". It wraps now: the team's name gives way first, down to the mark alone (the
  mark may reach into the gap, never past it), and where the links still do not fit beside the mark
  they take lines of their own under the mark and the name, on the right. For a member and a visitor
  the spec checks no sideways scroll, every link inside the header, whole and clear of the mark at
  125% to 200% on 320 to 414px, and one line at 100%.

- **A profile's Riot accounts** (`riot-accounts-panel.tsx`; `e2e/player-data.spec.ts`, 26 Nov 2026):
  an account's row was at least as wide as its Riot ID (a grid item's least width): 364px at 150% on
  a 320px phone and 484px at 200% on a 375px one, so the page grew sideways and Data diagnostics'
  summary under it took no tap. The row fits its column now: the Riot ID wraps (after its "#" first,
  inside a word only where one is still too long), the account's controls sit at the row's end, or
  under the Riot ID at the end of a line of their own where they would leave it less than about ten
  letters (5em), and Add Riot account wraps on a phone. The spec checks no sideways scroll, every row
  and Riot ID inside the phone, the summary at its centre and a tap opening it, at 150% and 200%.

**The specs' sideways measure.** On the phone project (`isMobile`) Chromium widens the window to what
spills past it, so `scrollWidth - innerWidth` stays 0 whatever overflows; the large-text specs
measure against `document.documentElement.clientWidth` (so do phone-wraps and the public specs, and
the page budgets' measure since 26 Nov 2026: docs/MOBILE.md, "Page budgets").

**At 100% nothing moves.** The six touched pages were compared with the base pixel by pixel at 320,
375, 768 and 1440 (Chromium with deterministic raster flags, images from other sites refused on both):
Team Overview, a profile's Overview, the Library and the public page are identical, the whole page;
Players and Leaderboards in every row of the demo's members (the base's server held four members
other tests had added, and the demo dates its games from each server's start: "17 Oct" there, "18
Oct" here). The lineup cards' two new wrappers (the chip's lane and its label) draw nothing there.

## The first-run page (`/setup`)

The demo always has an owner, so the real form (Create the owner account, with the setup key a
production deployment asks for) never shows there, and no browser spec reaches it: CI's server is
the demo. Its audit is `scripts/setup-audit.mjs`, against a server started as a fresh production
deployment is (required accounts, no owner, a setup key; nothing changed in the app):

```
createdb uniiverse_setup        # empty: the app applies its migrations on start
UNIIVERSE_REQUIRE_AUTH=true UNIIVERSE_SEED_DEMO=false UNIIVERSE_AUTH_SECRET=<any> \
  UNIIVERSE_ACCESS_PASSWORD=<any> DATABASE_URL=postgres://…/uniiverse_setup pnpm start -p 3951
node scripts/setup-audit.mjs http://127.0.0.1:3951
```

At i15, se3 and se1 (touch) and 1280 × 800, 1440 × 900 and 1920 × 1080, at 100, 150 and 200% text, it
checks axe (WCAG 2.1 A/AA and 2.2 AA) at 0, every target 44px on a touch screen, no sideways scroll,
no word broken across lines, and one h1 in `PAGE_TITLE`'s style like the other signed-out pages.
Release 10's run (20 Nov 2026) found one thing: "Add an off role" was 36px tall on phones at 100%
(now 44px on a touch screen, `pointer-coarse:min-h-11`, also on the invite form and Welcome, which
share it). The setup key's label now reads as the other fields' ("SETUP KEY *", with the variable
it names on the line under the field, breakable only at its underscores). After: all 18 clean;
heights 1.35 / 1.71 / 2.22 screens at i15 / se3 / se1 at 100% (7.3 at se1 200%), 1.30 / 1.16 /
1.07 on the desktops.

## Admin Mode at a larger text size

**S9c (20 Nov 2026).** System Health is 1.72 screens at 375 × 667 (4.21 in the audit, 3.09 on
Release 7's base): its five statuses are neutral rows of about 56–76px on phones (the area and its
state chip on one line, one sentence under it), Page speed is three plain sentences with a verdict
chip, its tables under Technical details, where below 640px every table row becomes label-and-figure
lines (`max-sm:` and the cells' `data-label`), so nothing scrolls sideways at any width; Riot
compliance is a Disclosure. Data & Integrations' 12px text is 20% of its text with every section
open (85–87% before): jobs read by plain name and one sentence at the body size (`domain/job-names.ts`),
the key and technical description under each row's How it works, the interval under Advanced →
Schedule. Branding has a phone section index (the shared `SectionIndex`, 44px on touch) and
Previews' switches are the shared `Segmented` control (44px on touch). `e2e/page-budgets.spec.ts`
asserts both figures, and every Admin page (Access levels, Personal data, Previews and Resources
since S9c) has its ceilings in `e2e/page-budgets.json`.

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
  16rem; the health rows (`StatusCards`, on Data & Integrations and System Health; neutral rows
  since S9c, the chip beside the name) break a long word anywhere; Branding's colour rows give the name a line of its own and the hex
  field the rest of the next under 14rem; a member's name and role go under the picture under
  14rem; Users & Permissions' pages are the section tabs (since 19 Nov 2026), which scroll
  sideways with the current one in view rather than wrap; Settings' account card puts who you are under the picture under 11rem
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
- `src/components/mobile-nav.tsx` (the phone frame is described in full in [MOBILE.md](MOBILE.md)),
  by posture ("Frames by posture" there; exactly one `nav[aria-label=Primary]` shown at a time):
  - phones held upright: a sticky top bar with Back (named after where it leads) or the team's
    mark, the page's title once its heading has scrolled up under the bar, the page's Filters once
    its own have scrolled up under the bar (44px, the count of narrowed filters on it, named
    "Filters:" and what is chosen; the same sheet; PR 2b), and your avatar, which opens the account
    screen (a screen of its own: who is signed in, then the account's own items only, Settings and
    Install App, the mode switch and Sign out, then the team's mark, the patch and Riot's notice;
    Back closes it); on a profile its sections ride under the bar, on a Team page Team's sections
    (Overview, Players, Leaderboards, Matches), on an admin page its entry's tabs;
  - phones held upright: a bottom tab bar with the sidebar's four destinations (navigation N1, 19 Nov
    2026: My Profile, Team, Champion Intel and Resources; in Admin Mode Dashboard, Users & Permissions,
    Platform Settings and System; `destinations()` in `src/lib/nav.ts`, those the account may open).
    A teammate's profile is under Team. The current tab's icon sits in an accent pill and its name is
    bright, so it does not rely on colour alone. By the label ladder (`TAB_FIT`): the whole names,
    then the short ones ("Profile", "Intel"; Admin Mode's phone bars always "Users" and "Platform"),
    then the icons alone, only at 200% text or at 150% on a 320px phone. The Team tab reopens the
    Team section last used;
  - phones held sideways (a window 480px tall or less, below `lg`, whatever its width): one compact
    bar, 44px plus the inset, with Back or the team's mark, the same four destinations (each a 44px
    target, the current one in its accent pill with its name; by `SIDEWAYS_FIT` the whole names,
    then the short ones, then the current one's alone, then the icons alone; past that the row
    scrolls sideways inside the bar), the page's title where the destinations leave it at least 6rem
    (a tap on it going back to the top, as does the current destination on its own page), Filters and
    the avatar (the account screen); a destination's tabs or a profile's sections as a 44px second
    row; no bottom bar. In Admin Mode "Admin mode" stands beside the team's mark (left to screen
    readers below 32rem of bar, and always in the mark's name). A page's own tabs are not repeated
    in the page;
  - tablets (`md` to `lg`, taller than 480px): the top bar with the same four destinations, one tap
    each (`destinations()` in `src/lib/nav.ts`), the current one with the sidebar's four signals, and
    the account menu behind the avatar, which holds Settings, Install App, the mode switch, Sign out,
    the patch and Riot's notice (the account's items only, in both modes). There is no drawer. At a
    larger text size the team's name gives way first, then the whole names to the short ones, then
    to the icons (`BAR_FIT`, measured in the bar's own width in rem on 19 Nov 2026: Player Mode 42.0rem
    with the name, 35.9rem without, 30.4rem short, so they give way below 42.5rem, 36.25rem and
    30.75rem: on a 768px tablet the whole names stay at 125% text, the name gone; Admin Mode keeps its
    name, which says the mode, with the short names down to 39.75rem; beside the installed app's Back
    each step comes sooner). The menu's Sign out
    tells the browser's other tabs, as the account screen's does. In the installed app, which has no
    browser Back, the bar also shows Back on a page reached from another (a teammate's profile),
    named as on phones.
  - Before the page's code has run: the avatar, the account menu's triggers (the tablet's avatar,
    the sidebar's tile) and the sidebar's collapse control are buttons that code drives, and a tap
    on one is kept by an inline script in the root layout (`src/components/early-taps.ts`,
    `data-early` on the button). The button shows pressed at once (`[data-early][aria-busy]`,
    globals.css) and does what was asked once the code runs, exactly once; Enter and Space go the
    same way. Once the page runs, the script does nothing.
  - Both bars pad for safe areas (`pt-safe`, `pb-safe`, `px-safe`); in short windows the compact bar
    slides away while reading (see above). On phones, either way round, the top bar sets the page's
    `scroll-padding-top` to its measured height (and the stylesheet clears the tab bar upright, the
    home indicator sideways); on tablets the stylesheet's value stands, so whatever scrolls into view
    stays clear of the bars.
- **Section tabs stay in reach** on tablets and desktops: Team's sections, a profile's sections and
  Admin Mode's Users & Permissions', Platform Settings' and System's (`TabBar` with `sticky`, the
  `sticky-tabs` utility in globals.css) stay
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
- **Every page centred beside the sidebar** (the owner's review, 23 Nov 2026): every page's column is
  centred in the room the window leaves beside the sidebar, open or folded, whatever its width (80rem
  profiles, Settings' 64rem, Team's 100rem), so its margins are equal: no page sits against the sidebar
  with the spare room on its right. Team's four sections share `--content-wide` at every window size
  and a set's row of tabs is its pages' width, centred as they are (`ROW_WIDTH`), so the first tab
  starts at the page's column below 1600px too. This supersedes the 1600px threshold and the
  frame's left edge in the paragraph below (`e2e/desktop-frame.spec.ts`,
  `e2e/navigation-reach.spec.ts`).
- **One composition at every width** (PR 10, 18 Nov 2026): in a window from 1600px (100rem) wide
  the pages of a tab set share one width (`SECTION_HUBS`' `width` in `src/lib/nav.ts`: Team's four
  sections `--content-wide`, Players and Matches joining Team Overview and Leaderboards there;
  Platform Settings' `--content-max`), and a bar of `main`'s own (`SectionTabs`) gives
  its row of tabs that width (`TabBar`'s `inner`, `ROW_WIDTH`). Where the pages then stop growing and
  centre in the room beside the sidebar (80rem pages from about 1650px with the sidebar open and
  from 1600px with it folded; Team's 100rem from about 2370px and 1926px), the first tab still starts
  at the page's column and Team's name at the row's end stops at its right edge, and the row stays in
  the same place on every section of the set; the line under it and its pinned ink span the room. In
  a window under 1600px every page and the row are exactly as before, the sidebar open or folded
  (Players and Matches 80rem, the row the bar's width; measured against main's build), but for PR
  2b's 44px dense tabs on touch screens from 1024px (below). A profile's
  tabs and a section's views (`SubTabs`) are inside their page's column, so they always lined up. On
  Team Overview the column is Team's 100rem, and its header and lineup keep their 84rem, centred in
  it, under a 1920px window; from 1920px they take the whole column, so the tabs, the logo and the
  first card share one edge (S2c; before, 38px apart at 1920 and 165px at 2560). Every page starts at
  the left edge of the shared frame (DESIGN_SYSTEM §7, "One frame, one place for everything"). With
  Players at 100rem the roster takes three columns (its own 84rem rule) from about 1780px with the
  sidebar open and from 1600px with it folded; Team Matches' filters and list take the whole
  column, centred with it (25 Nov 2026). The route's loading state takes the width `pageWidthOf` gives its address (a Team
  section's own, else 80rem): Players and a teammate's profile share `players/loading.tsx`, which reads
  the address it stands in for, and Team Matches' own `matches/loading.tsx` stands as its page does
  (Team's width from 1600px, its filter row and cards across it).
- **Champion Intel on one screen** (Champion Lookup, 23 Nov 2026, renamed and extended on 24 Nov
  2026, one aligned board since 25 Nov 2026; docs/CHAMPION_INTEL.md, "The page", "Abilities",
  "Compare" and "Fit and measurements"): one champion takes `--content-max`, two `--content-wide`.
  The board measures itself (`@container/board`): two champions are two columns of one grid, each a
  subgrid of its 21 rows (the header, the facts, the abilities' heading, P to R, the builds' twelve
  rows, the statistics), side by side from a 22rem board (a 390px phone) and stacked below it. One
  champion's column measures itself too (`@container/panel`: from 64rem the base statistics take a
  19rem column beside the abilities, 24rem from 76rem, the builds a band under both), and each
  ability row (`@container/cell`) takes one of three forms, the same in every row of a column: wide
  (the rank grid at the row's top right), stacked (the grid under the name) and line (one line per
  kind, wrapping between ranks). The header, the haste field and the five folded rows are on the
  first screen with one champion at 1280 × 720, 1440 × 900, 1440 × 780, 1920 × 1080, 1920 × 950,
  2560 × 1440 and 3440 × 1440, and with two from 1366/1440 × 780 up (at 1280 × 720 with the sidebar
  open the aligned board runs a little past the screen), the sidebar open and folded; opening rows
  grows the page, never a scroll inside it; on a phone it scrolls as a page, nothing wider than the
  screen and no name broken inside a word from 320px at 200% text. `e2e/champion-lookup.spec.ts` and
  `e2e/champion-builds.spec.ts` assert each.
  Matchup Intel's two-column dashboard (18–23 Nov 2026, `--content-wide`) was retired with it.
- **A page's controls in reach** (PR 2b, 18 Nov 2026): a long page's own controls (its view switch,
  Filters, search) scroll away with its header. From md, once the section tabs are pinned and the
  page's own toolbar has gone up under them, the page's compact copy shows at the pinned row's end
  (`PageToolbar`; which page offers what: DESIGN_SYSTEM.md §7), at the row's own height (32px with a
  mouse, 38px on touch screens with a 44px target; the search field 44px on touch screens, kept in
  the row by its negative margins), centred in the whole bar, the labels where the row is 56rem or
  wider and the icons alone below that; Team's name at the row's end gives way to it. So that the
  row holds those 44px targets, from 1024px on touch screens the dense section tabs (Team's and
  Platform Settings') are 44px, as a profile's are, not 40px: the bar is then the
  2.75rem `--tabs-top` and the scroll padding assume (with a mouse they stay 40px, level with the
  sidebar's brand row). It is watched against the pinned stack's
  foot (the tablet's top bar and the tabs, measured from the pinned row), drawn only while it shows,
  kept while in use (pressed or focused, while the sheet it opened is open, and until that sheet has
  handed the focus back), and never in a short window. On phones the top bar offers the page's
  Filters instead (above), kept the same way, and so does a tablet-wide short window (a phone held
  sideways), where nothing pins; in the fullest bar at large text, Back gives way to it (its label
  shortens). Either way the page's Filters sheet opens: at any width in its sheet form (Refine's
  fields in one column behind More filters, Players' "Archived and deactivated" whole), the inline
  toolbar keeping its size in the page (an empty box of its size while its fields are in the sheet,
  one copy of each field and id), and closed after a choice made in it, once the change has arrived
  (within 8 s, and before the reader scrolls, presses, types or steps Back), it brings the list's
  first item under what is pinned (and under anything pinned over its start, as All Champions'
  column headings); closed unchanged, or once the reader moves on, nothing later moves the page. The
  pinned row's buttons and fields take the scroll padding back as its links do, so focus moving onto
  them never scrolls the page. The copy's Filters counts and names what the page's own bar narrows
  at its width: from md Encounters' Minimum games and Sort by are its list toolbar's (FilterBar's
  `inlineReset`), so the pinned row's count and name, a sideways phone's top bar (the compact bar at a
  tablet's width), and the sheet from md (its subtitle, its Reset the inline one) leave them out; on
  an upright phone the top bar and the sheet count, name and reset them, as the phone's sheet holds
  them. The sheet follows the width while it is open, so a phone turned across 768px changes what it
  holds and resets, as its fields do.
- `main` pads for the tab bar (`pb-tabbar`) so content never hides behind it; held sideways, where
  there is none, only for the home indicator.

## One-screen desktop pages (28 Nov 2026)

The owner's requirement (27 Nov 2026 for All Champions, extended to the whole platform on 28 Nov 2026:
"the one-screen design requirement is intended to apply across the entire platform"): on a desktop
window, at normal zoom, every page a member or an admin works in is one screen.

- **No document scroll.** The page is the window (`scrollHeight ≤ innerHeight`).
- **Nothing clipped or hidden.** No `overflow: hidden` to conceal anything, no truncation that cuts a
  name a reader needs, no text below the 12px floor.
- **No independent scroll.** No list or panel scrolls on its own.
- **Height-aware pages of complete rows.** A shorter window shows fewer rows, never smaller text.
- **Details open in place.** A detail opens in a pane, in place of what it details, or in a window
  that never grows the page.
- **Phones, tablets, touch and large text keep the flow.** Their scrolling presentation is unchanged.

It is verified at the owner's eight configurations (1366 × 768, 1440 × 900, 1648 × 900 and 1920 × 1080,
the sidebar open and folded) and at the gate's floor, 1366 × 657 (41rem tall: a 1366 × 768 laptop's
browser window).

**Scope.** Every desktop page a member or an admin works in. Exempt, keeping the page's own scroll:
long-form reading pages (`/privacy`, a Resources library article if any, the public landing's text).
Outside the gate every page is exactly as it was.

### The gate

The gate is the platform's, first written for All Champions (below), reused as it is: nothing is
renamed and no media string changes (`posture.test.ts` compares them).

- **Where it applies:** a fine pointer, from 80rem wide, at least 41 of the page's own rem tall.
- **The CSS:** `@custom-variant ws` and `ws-host` in `globals.css`, banded per 64px of width at 41 ×
  the band's widest root.
- **The script:** `WS_QUERY` and `useWorkspace()` in `ui/posture.ts`. Once hydrated it also checks
  the page's own rem (a larger text size), on a resize, a query's change and a change of the root's
  size (`onRootSize`).
- **How a page opts in:** its section carries `data-workspace` while `ws !== false`, so the CSS
  decides the server's HTML and the hydration render. Its lists measure their pages once
  `ws === true`. `useWorkspaceMarks()` reads both.
- **The short form is opt-in.** `ws-short:` and `ws-short-host:` apply to a page only where it writes
  them and marks its section with `useWorkspaceMarks({ short: true })`. Their narrow blocks read the
  container named `section`, All Champions' own. A shared section is `@container/ws`, so it never
  inherits them; reserve the name `section` for All Champions.

### The data contract

What `e2e/workspace.ts` (and, where it already loads a page, the Production check) reads:

| Attribute | On | Meaning |
|---|---|---|
| `data-workspace` | the section | the gate may hold (removed once the page knows it does not) |
| `data-ws-card` | a card | it reaches the frame's foot; its bottom is held above `#content`'s padding |
| `data-ws-foot` | a card's footer | the range and the pager; the list's rows end at least 12px above it |
| `data-ws-row` | a row, a cell, a divider | a measured row (`useRowBudget`'s default selector) |
| `data-row-key` | a row or a cell | its key, for the keys across pages and the focus |
| `data-ws-region` with `data-per`, `data-page`, `data-pages`, `data-total` | a paged list's region | its pages, while paged |
| `data-divider` | a paged grid's region | the row its divider slot stands before, where its pages draw one (the tests work out its pages from it) |
| `data-starts` | a cumulative list's region | where each page starts, 0-based row indexes ("0,7,13"): its pages are cut by the rows' own heights, not `data-per` each (the tests read its pages from it) |
| `data-ws-group` | a group of a cumulative list (its heading and its rows) | the group the cumulative measure counts a page's heading for, where a page starts inside it |
| `data-ws-section` | a sectioned workspace's section | its id (`?section=`) |

### The frame

In the workspace the shell's `main`, its frame and every wrapper down to the section are flex
columns (`ws-host:`). The section is the flex remainder of the window-tall column, and its cards
stretch to the frame's foot.

- **Every wrapper between the frame and a section carries `WS_COLUMN`** (`ui/workspace.tsx`: `ws-host:flex
  ws-host:w-full ws-host:flex-1 ws-host:flex-col`, the profile column's own classes).
- **The two traps.** A wrapper left a block (the admin layout) keeps the section from filling the
  frame. An `@container` wrapper with `mx-auto` becomes a flex item, shrinks to 0px wide (a container
  has no content width) and grows the page: measured on `/settings`, 1115 → 3714px.
- **The section spaces its parts with a gap, not margins** (`ws:gap-3`). A margin would also go to a
  closed or top-layer dialog's place and shorten the frame.
- **The floor is one row.** A list never shows fewer than one row a column. Where even that does not
  fit, the frame grows by exactly the deficit: the safety net, never the design.

The room a section has, sidebar open, at 1366 × 768 / 1440 × 900 / 1648 × 900 / 1920 × 1080
(`innerHeight` less the section's top and `#content`'s bottom padding):

| Page family | Room |
|---|---|
| Team and admin pages, under a tab row | 664 / 796 / 793 / 965px |
| Settings (no tab row) | 712 / 844 / 842 / 1018px |
| A profile's tabs (under the profile's tabs) | 576 / 708 / 702 / 845px |

At the floor (1366 × 657) that is about 552px on a team or admin page and about 464px under a
profile's tabs.

### The four patterns

Each is built from the shared modules below.

- **(a) Paged list plus detail.** The rows by `useRowBudget`, the inline Pager in the card's footer,
  the detail in a pane beside the list, in place of the list, or in a window. Opening a detail never
  grows the page. Examples: All Champions; the admin lists; Match History.
- **(b) Sectioned workspace.** A rail of the page's sections, one section at a time filling the frame.
  The section is in the address (`?section=`), so Back works. Outside the gate every section stays
  stacked, as before. Examples: Settings, System Health, Personal data.
- **(c) Fitted dashboard.** Cards fill the frame, and the lists inside them are paged (or fitted).
  Examples: Profile Overview, Leaderboards, Team Overview.
- **(d) Fitted canvas.** A preview drawn to the frame's size: the admin Previews.

### The shared modules (`src/components/ui`)

**`workspace.tsx`**

- `WS_COLUMN`: the classes of every wrapper between the frame and a section.
- `useWorkspaceMarks({ short?, shortNarrow?, enabled? })` returns `{ ws, workspace, paged, short,
  shortNarrow, attrs }`. `attrs` is the section's `data-workspace` (and `data-ws-short` and
  `data-ws-short-narrow` where asked for and they apply). `enabled: false` keeps the page in the flow.
- `<WorkspaceSection as labelledBy | label testId marks? short? shortNarrow? enabled? className ref>`:
  `@container/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0` plus the marks. It
  gives its marks to what it holds (`useWorkspaceSection()`, `WorkspaceMarksProvider`). `as` is a
  section, a div or an article, never a `main`: every section is inside the shell's `<main>`.
- `<WorkspaceCard as bare? testId className ref …attributes>`: the card's surface (unless `bare`) and
  `ws:flex ws:flex-1 ws:flex-col`, `data-ws-card`. A paged list's `regionProps` go on it.
- `<WorkspaceFoot testId className ref>`: the footer, drawn in the workspace only (`data-ws-foot`).
- `wsTierClass(i, { gate, mid, tall })`: the first paint's rows by the window's height tiers
  (`board-*`), before the page can measure. Each page proves its tiers from its own chrome.

**`paged-list.tsx`**

`usePagedRows({ rows, keyOf, words: { one, many }, testId, probeRem, … })` takes, optionally:
`active` (the section's `paged` by default), `listRef`, `footRef` and `cardRef` (or its own),
`rowSelector` (`[data-ws-row]`), `lastLess`, `mode` (`"uniform"` | `"cumulative"`), `observe`,
`measureKey`, `cap`, `selected`, `search`, `order`, `data`, `reset`, `region`, `rangeId`, `label`,
`arrows` and `flowRows`.

It returns:
- the pages: `perPage`, `paged`, `page`, `pages`, `range`, `offset`, `shown`, and `starts`,
  `pageOf(index)` and `measuring` (the cumulative mode's, below);
- the reader's moves: `turn(p)`, `live`, `goToIndex(i)`, `focusKey(key)`, `onListKeyDown`
  (PageUp/PageDown a page, Home/End, ↑/↓ with `arrows`; keys pressed inside a dialog a row holds,
  a record's Release confirmation, are the dialog's: `inDialogWithin`, in the grid's handler too);
- what to spread: `regionProps`, `listProps`, `rowProps(row)`, `positionProps(row)`, `pagerProps`;
- the refs: `listRef`, `footRef`, `cardRef`, and `footTestId`.

`rowProps(row)` puts the row's place on the whole list (`aria-posinset`, `aria-setsize`) on the row
element while paged: an `li`, a `tr` or a `[role=option]`. A row element that is a link or a button
takes `rowProps(row, { position: false })`, and its listitem takes `positionProps(row)`: axe refuses
those attributes on a link or a button.

`<PagedFooter footRef pager leading? testId className>` draws `WorkspaceFoot`, then `leading` (a
legend, a coverage line), then the inline Pager.

**Rows of several heights: `mode: "cumulative"`** (28 Nov 2026; Accounts first). The uniform mode
(the default, unchanged) pages by one row height: every page holds `perPage` rows. A list whose rows
are not one height (a card with an optional line, a name on two lines, groups with headings) pages
with `mode: "cumulative"`, and its pages are cut once over the whole list by the rows' own heights
(`useRowBreaks`, `fit-rows.tsx`; `pageStarts`, `row-budget.ts`):

- **The cut.** The hook measures every row as drawn, then fills each page greedily: as many rows as
  end within the room between the list's top and its card's footer, less the guard band, counting a
  row's own height, the headings the page draws, an empty group's line and the divider a page's last
  row loses. Page *n* starts right after page *n − 1*'s last row. A page always holds a row, even one
  taller than the room (the frame then grows by the deficit; nothing is hidden). `cap` limits the
  rows a page.
- **The promises.** The pages depend on the list and the room only, never on the page drawn: every
  row is on exactly one page, Next never repeats or skips a row, Previous comes back to the same
  page, and the page count and the range ("8–14 of 30") are the cut's. A resize (another room, width
  or root size) cuts them again once, and the list shows the page holding the first row shown before
  it, or the selected row's (`usePagedList`'s rules, unchanged, with the cut as its budget: another
  cut is another budget). A search still goes to page 1, an order or a filter to the selected row's
  page or page 1. Until 28 Nov 2026 the mode took one count of rows a page, measured on the page
  drawn: a page drawing more headings measured fewer, and the list moved to the page holding its
  first row at that count, drawing rows twice (CI run 46125624658, Accounts).
- **What a consumer passes:** `mode: "cumulative"`, the rows, `probeRem` (a row's height for a row not
  drawn), `lastLess` for a divided list, and `measureKey` for anything else its rows' heights depend
  on (columns). Draw the rows from `shown` only, keyed by their own key, with `rowProps(row)`.
  - **Groups:** put `data-ws-group` (unique per group) on the element that holds a group's heading and
    its rows, and on every page that holds a group's rows draw its heading again (Accounts'
    `inGroups`). The measure counts that heading for a page that starts inside the group.
  - **While it measures** (`measuring` true) `shown` is every row, in its groups as a page draws them,
    for one render that is never painted: the measure runs in a layout effect and the page it decides
    is drawn in the same task. That render comes when the rows change (`rows`, `search`, `order`,
    `measureKey`), the list's width or the root's size change (a resize, the sidebar, a zoom) and once
    the fonts have loaded. A change of height alone reads the room again and re-cuts the same rows,
    drawing nothing more. Don't slice `rows` yourself, and keep effects off `shown`.
- **What it gets:** `starts` (where each page starts, 0-based; null while not paged), `pageOf(index)`
  (the page holding a row), `range`, `offset`, `shown`, `pages`, and `perPage` as the most rows a page
  holds: pages differ, so never multiply `perPage` by a page number; use `starts`, `range` and
  `pageOf`. The keys (`onListKeyDown`: PageDown the next page's first row, PageUp the previous page's
  last), `goToIndex` and `turn` follow the cut. The region publishes `data-starts`, which the tests
  read (`regionSizes`).
- **Not for:** a server-paged list, whose server cuts its pages by `per` (Match History): it keeps
  `useRowBudget`'s count, keyed to measure once per list, not per page. A grid (`usePagedGrid`) keeps
  `useRowBudget`'s per-column count. A client list cut by `useRowBudget`'s cumulative count directly
  (a slice of `per` rows a page) has the defect above: it moves to `usePagedRows`' cumulative mode.

The page follows `usePagedList`'s rules: a search goes to page 1; new `data` (a filter) to the
selected row's page or page 1; another order likewise; another selection to its page; another budget
(a resize) to the selected row's page or the page holding the first row shown. A page change the
reader makes is read out once, never after a resize. A page change the list makes itself (an order,
a search, a budget) clears what was read, so the reader's next turn is read even where its words are
the same as before (`keepSaid`).

**`paged-grid.tsx`**

`usePagedGrid({ rows, keyOf, words, testId, twoColumnsRem, probeRem, divider?, open?, … })` has the
same options as `usePagedRows`, plus `regionRef`, `divider` and `open`. It fills one column, or two
from a content width of the region (`twoColumnsRem`), column-major, a column's cells by
`useRowBudget`. An optional divider slot is never a page's last slot and comes again at the top of
the pages after it, so a grid with a divider has more pages than `ceil(total / per)`; its region
says where the divider is (`data-divider`), and the tests count its pages with it (`pageSizes`). The
open item is followed (`useFollowed`). Its `cellProps(slot)` take `{ position: false }` and
`positionProps(slot)` as `rowProps` do.

It returns:
- the layout: `columns`, `perColumn`, `perPage`, `paged`, `page`, `pages`, `slots`, `slotsToDraw`
  (every row with the divider, before it measures), `range`, `rowsHere`, `secondColumn`,
  `gridClassName`, `gridStyle`;
- the reader's moves: `onGridKeyDown` (↑/↓ the reading order across pages, ←/→ the other column's
  same row, PageUp/PageDown, Home/End), `turn`, `live`, `goToIndex`, `focusKey`;
- what to spread: `regionProps`, `listProps`, `cellProps(slot)`, `dividerProps`, `pagerProps`;
- the refs.

**`sectioned-workspace.tsx`**

`<SectionedWorkspace sections={[{ id, title, content, marker?: { unsaved?, error?, count? },
beforeLeave?, className? }]} label initial? param? index? actions? marks? className?
sectionsClassName? railClassName? testId?>`.

- **In the workspace:** a rail of the sections' links (their markers read out), the page's
  `actions` under them, and the current section filling the frame.
- **Outside it:** every section stacked, with the page's own `index`.
- **The address:** `?section=<id>`; the first section has none, and an unknown or missing value is
  the first. Each switch is pushed as a section tab's is, so Back and Forward step through them. The
  section shown follows the address whatever changes it (read through `useSearchParams`): the rail,
  Back and Forward, and a soft navigation to the page with another query, which Next makes without
  mounting the page again (the account menu's Settings link on `/settings?section=password` shows
  the first section).
- **Drafts survive a switch:** every section stays mounted.
- **Leaving:** `beforeLeave` may keep a section when the reader switches or steps Back or Forward
  within the page, and Back's address is then put back. A Back that leaves the page is the page's
  own: no section is asked, and nothing is pushed onto the other page's address.
- **An old deep link's hash** naming an element inside a section (`/settings#password`) opens that
  section, where the query names none; a rail switch drops the hash (the section is in the query).
  Once shown in the workspace that section is written into the query in place
  (`/settings?section=password#password`, replaceState through Next's router), so from then on the
  query holds it. An in-page fragment link that names no section's element (the skip link's
  `#content`) keeps the section shown: the query is unchanged and the hash names a place, not a
  section. An empty hash is no such link (Back to `/settings` shows the first section).
- **Markers:** a section's own (`marker`), and what its fields report from inside it:
  `useSectionMarker({ unsaved, error })`, a no-op outside a sectioned workspace (the same editor on
  another page). Read out with the link (", unsaved changes", ", has an error").
- **The rail's look** is a section's views' (docs/DESIGN_SYSTEM.md §5, the secondary level, as the
  in-page indexes it stands in for): words, the current one semibold over the 2px accent line, no fill.
- **The page's own layout** (`children`): a page whose rail is part of a card of its own (Settings'
  account card) places `<SectionRail />` and `<SectionPanels />` itself, server markup between them;
  `<SectionPanels only={[…]} />` draws some sections where the flow puts others between them (System
  Health's fold round four of its sections). `short` opts in to the short form's marks.
- **Pure helpers:** `sectionFromSearch`, `sectionHref`, `initialSection`, `addressTarget`, `mergedMarker`.

**`workspace-window.tsx`**

What a fold opens in the flow, in the workspace, each the flow's own markup outside it:

- `<WorkspaceWindow flow label description? title windowDescription? views? testId>`: in the workspace
  a row (`${testId}-open`) that opens a window (`${testId}-window`: DetailModal's sheet, 60rem for a
  table) holding the details, one view at a time where there are several (`views`, a text-led switch;
  `children` under every view). A data window fits the screen with no inner scroll. The flow's copy
  (`flow`) is drawn on the server and until the posture is known, hidden by the CSS gate in the
  workspace, then leaves the page, so the details are never in it twice. System Health's page speed
  by device and by page, its recent errors and job runs.
- `WorkspaceOpenFold`: a fold that is a section's whole content, open in the workspace once known
  (no CSS can open a fold), its title row kept. System Health's Riot compliance.
- `WorkspaceFlowFold`: a fold round several sections in the flow; in the workspace its sections
  stand on their own. System Health's Technical details.
- `<WorkspacePlaced at="flow" | "workspace">`: a part the workspace draws in another place than the
  flow, in the markup where it is drawn, so Tab and a screen reader follow the screen (a CSS order
  would draw it in one place and leave it in the other: WCAG 1.3.2 and 2.4.3). The page draws it at
  both places; the flow's copy is on the page on the server, while hydrating and in the flow (with the
  `ws:` order class that draws it at the workspace's place for the first paint), the workspace's once
  the page knows it is there. System Health's Audit Logs line.

**Parts drawn in another order in the workspace** are in the markup in that order once the page
knows it is there (`useWorkspaceSection()?.paged`, or `WorkspacePlaced`); a `ws:order-*` class only
draws the first paint, before hydration. Personal data's Erasure records (the backups' fold and the
buttons above the records there) and System Health's Audit Logs line.

**Using the paged list in a component.** Pass the component's own refs (`listRef`, `footRef`,
`cardRef`) and destructure the result (`const { shown, regionProps, … } = usePagedRows(…)`): the
React compiler's lint refuses refs read from the hook's result object during render.

**A stack margin under a section** (a parent's `space-y-*` and a closed dialog after the section,
drawn nowhere) leaves the section that much short of the frame's foot, and the list's margin to its
footer with it: such a parent takes `ws-host:space-y-0` (Accounts' page).

**Elsewhere**

- **`workspace-classes.ts`:** the class constants (`WS_COLUMN`, `WS_SECTION`, `WS_CARD_SURFACE`,
  `WS_CARD_FILL`, `WS_FOOT`), with no `"use client"`, so a server component (the admin layout, a
  page's root) imports them as strings; `workspace.tsx` re-exports them. From a `"use client"`
  module a server component would get a client reference in place of the string.
- **`address-section.ts`, `useAddressSection(ids, { initial, param })`:** one choice of a few kept
  in the address, by the sectioned workspace's rules (the first has no parameter, an unknown value
  is the first, each choice the reader makes is an entry, Back and Forward followed, a choice no
  longer offered falls back to the first and its address is replaced). Like the sectioned
  workspace it follows the address whatever changes it (`useSearchParams`, `addressTarget`): a soft
  navigation to the page with another query (Platform Settings' Branding tab on
  `?section=colours`) shows the choice it names, and a Back that leaves the page is the page's own,
  nothing written onto the other page's address. `choose(id, { replace })` replaces instead of
  pushing (an old `#hash` naming a section). The address's first (the one with no parameter) is the
  first of `ids` when the page arrived, for as long as it is open and offered (`addressOrder`): a page
  whose own first moves (Matchup notes' default view, worked out again on every refresh) keeps what
  its parameter-less entries name, so Back lands on the view it left. Used for a list's filter (Admin
  Resources' `?section=`), a queue's view (Admin Matchup notes' `?view=`) and a page that lays out its
  own rail (Admin Branding, with `SectionRail`'s markup and look).
- **`detail-modal.tsx`:** a workspace window's width, `workspaceWidth` (`pane`, All Champions'
  56.25rem, the default; `game`, 76rem: the game window and Matchup notes' editor), with
  `data-width` on the dialog; a sheet's `sheetWidth="table"` (60rem: `WorkspaceWindow`'s tables).
- **`reader-idle.ts`, `lib/list-per.ts`, `section-header.tsx`:** a server-paged list's own address
  write waits for the reader (`useReaderBusy`, `whenReaderIdle`); its cookie keeps the last budget
  (`readListPer`, `rememberListPer`, `forgetListPer`); `SectionHeader`'s `toolbarLead` and `scopeEnd`
  slots hold a pager that costs no line. Match History's notes below.
- **`fit-rows.tsx`, `useRowBudget`:** unchanged by default. `mode: "cumulative"` counts rows of
  several heights by their own heights in order, then more at the tallest drawn row's pitch
  (`row-budget.ts`, `cumulativeRows`; for rows of one height it is `rowBudget`'s count exactly).
  That count is measured on the page drawn, so it serves only a list cut elsewhere and measured once
  per list (a server-paged list's `per`, `usePagedGrid`'s cells); a client list of rows of several
  heights pages with `usePagedRows`' cumulative mode (`useRowBreaks`, above). `rowSelector` defaults
  to `[data-ws-row]`.
- **`fit-rows.tsx`, `useRowBreaks(listRef, { footRef, cardRef, probeRem, active, key, total,
  rowSelector?, groupSelector?, lastLess?, observe?, cap? })`:** returns `{ starts, measuring }`, the
  cumulative mode's cut (above); `readLines` reads the rows' and groups' boxes. Pure parts in
  `row-budget.ts`: `pageStarts`, `pageHeight`, `startsPageOf`, `startsRange`, `startsSizes`.
- **`server/demo/test-hooks.ts`:** `ROWS_PER_PAGE_TEST_COOKIE` (`uniiverse-test-rows-per-page`, 1–19),
  read only on the in-memory demo. The page's server component calls `rowsPerPageCap(await cookies())`
  and passes the result to its lists as `cap`, so CI pages short demo lists.
- **`src/app/design-tokens.test.ts`:** refuses any `ws:`, `ws-short:`, `ws-host:` or `ws-short-host:`
  class that conceals or shrinks: an overflow that hides, clips or scrolls, `max-h-*`, `h-screen` and
  its kin, `line-clamp-*`, `truncate`, or text under `text-xs`. Exceptions go in `WS_CONCEAL_LATER`
  with their reasons; it is empty.

### How a page adopts them

1. Put `WS_COLUMN` on every wrapper from the frame down to the section. Keep the flow's `space-y-*`.
2. Make the page's content a `WorkspaceSection` (or a `SectionedWorkspace`), and its fixed bands (a
   header, a toolbar) the section's first children.
3. Put each list in a `WorkspaceCard` with `usePagedRows` (or `usePagedGrid`), its rows carrying
   `rowProps(row)`, and close it with `PagedFooter`. Before the page measures, draw the flow's rows,
   hidden past `wsTierClass`'s tiers in the workspace.
4. Open details in place: a pane, the list's region itself, or a window that fits (below).
5. Pass the test cookie's cap (`rowsPerPageCap`) and add the page's rows to `e2e/one-screen.spec.ts`
   (its states, where it fits). Its own spec covers paging exposing every record, Back, the keys and
   the focus. Run the page's phone and tablet specs too: the flow must be unchanged.
6. Write the page's notes under "The pages" below.

### Windows in the workspace

This replaces, for the workspace only, the rule that "windows and dialogs keep their one scrolling
body".

- **A window that presents data fits** at the owner's eight configurations with no inner scroll: a
  game, a Peek, a preview.
- **A form window (an editor) should fit too.** Lay its fields out in columns where needed.
- **Only at the 41rem floor** may a form window keep one scrolling body, and only where its fields
  cannot fit even in columns. The page's notes say so.
- **A docked panel (the Peek) never scrolls inside** in the workspace.

### Server-paged lists

A list the server pages (Match History, Encounters and Team Matches: their notes under "The pages")
takes `per` from the row budget, with no floor of ten (the server's minimum becomes 1). A cookie per
list keeps the last budget, so the server's first paint draws about the right count: UI state, not
personal data. No query's cost changes: the server already slices a list it holds or counts.

### Tests

- **`e2e/workspace.ts`:**
  - the owner's configurations (`OWNER_SIZES`, `SIDES`, `OWNER_CONFIGS`), `FLOOR` and `EDGE_SIZES`,
    and `MARGIN` (12px);
  - opening and waiting: `openAt` (the sidebar's cookie, Admin Mode's view), `resizeTo`, `settled`,
    `regions`;
  - the checks: `measureWorkspace`, `fits`, `fitsWindow`;
  - paging: `walkPages`, `walkBack` (Previous back to the first page: a walk forward's pages,
    reversed), `expectEveryRecord`, `regionSizes`, `pageFull`;
  - the rest: `noScrollbarTracks`, `flowUnchanged`, `withWideText` (CI's wider text, doubled) and
    `demoPlayerId`.
- **What `fits` holds:**
  - the page is the window, and nothing is wider than it;
  - every card ends above `#content`'s padding, and everything it draws lies inside it (an
    element's box, or a block's own text that does not wrap: All Champions' own rule);
  - a list ends at least 12px above its footer;
  - nothing in `#content` scrolls;
  - nothing a reader needs (text, a control, a picture) is clipped or drawn off the screen, a
    text's own lines cut by a fixed height or a line clamp included; `checkVisibility()` decides
    what is drawn, so a closed `<details>`'s content does not count;
  - no truncation in `#content` cuts its text (`truncates`, every `.truncate` by default);
  - no text under 12px (a small tile's letters, an uppercase label and a chart aside);
  - every region's pages are whole: as many as its rows and its divider make (`pageSizes`), or, for
    a cumulative list, as its `data-starts` says, in order from its first row, the page drawn holding
    its own rows (`regionSizes`); `expectEveryRecord` holds each page to its slots, and a cumulative
    list's walk to the same starts on every page (nothing cut again as it is walked).
  - `e2e/workspace-helper.spec.ts` holds the checks themselves to what they must catch, on small
    pages drawn in the test.
- **`e2e/one-screen.spec.ts`** (desktop project only, the suite's server, CI's wider text) is a table
  of rows. Each row opens once per sidebar state and resizes in place:

  ```ts
  { name: "Admin Data & Integrations", path: "/admin/data", admin: true, at: EIGHT_AND_FLOOR }
  ```

  The fields are `name`, `path` (`{player}` for a demo profile), `admin`, `cookies`, `at` (`EIGHT`,
  `EIGHT_AND_FLOOR` or `at([...sizes])`), `then` (a state, which must not grow the page), and fits'
  options (`workspace`, `pager`, `cards`, `rows`, `truncates`).

  It began with the pages that already fit, measured on 28 Nov 2026 (the default demo, the wider
  text):

  | Where | Pages |
  |---|---|
  | The eight and the floor | Champion Intel (empty, and with a champion), My Profile without a profile of one's own, a profile's Accounts, All Champions' list, Admin Data & Integrations, Admin Audit Logs (its log empty, below) |
  | The eight, not the floor | Team Overview (33px over with the sidebar open, 6 folded), Leaderboards (87px), Admin Accounts (36px), Admin Access levels (10px with the sidebar open; it fits folded), Players (below) |
  | From 1440 × 900 only | a profile's Overview and a member's own My Profile (376–390px over at 1366 × 768) |

  Each lane widens its pages' rows as it brings them to one screen.

  **The server is shared.** On CI the specs before this one in its shard have made accounts (4 in
  shard 4 of run 46125624658), and how many depends on where the shard starts, so a row must hold
  with more than the demo's own data. Measured with 12 accounts made first (28 Nov 2026), every row
  fits as it is but two pages that grow with them:
  - **Players** (a row of its two columns for every two members): 20px over at the floor with CI's 4, 165px over at 1366 × 768 with
    12. Its row holds the eight until lane D pages its roster (batch 3); it fits there with up to
    about 6 accounts made before it.
  - **Audit Logs** (50 entries at a time, with Load older; the demo's log is empty and each account
    made adds an entry): 117px over at 1366 × 768 with 12. Its row holds the page's chrome and its
    empty state, filtered to a day with nothing recorded, until a lane pages it (tracked).
- **The Production check** loads no new page (production's CPU is rationed). Where it already loads a
  page at a desktop width, it may add the generic fact "a page carrying `data-workspace` does not
  scroll, and nothing in main scrolls". Admin pages and the folded sidebar are CI's only.

### The pages

Each lane documents its pages here as it brings them to one screen: their pattern, their tiers,
their windows, and any exception with its reason. All Champions, the first, follows.

### Settings (28 Nov 2026)

`/settings` and `/admin/settings` (the same page, `components/settings/account-settings.tsx`): a
sectioned workspace whose rail is the account card.

- **The rail:** the card keeps the picture, who you are, Add or Change, and its actions (My Profile,
  Riot Accounts, the mode switch, Sign out); its index gives way to the sections' links (Name, Links
  for a member with a player profile, Password, This device). In the short form (under 46rem tall) the
  picture is 56px beside who you are, so a member's card (two more sections' worth of rows) keeps the
  window at the floor.
- **One section at a time** beside it, in the address. Each field keeps its own Save, every section
  stays mounted, so a draft survives a switch; the rail marks a section with a draft not saved
  (display name, username, social links, a password typed) and one whose field shows its error line.
- **Riot's notice and the privacy link** are under the section shown, whichever it is, so the shell's
  `#compliance` link always lands on it; the shell's nudge to `#password` opens the Password section.
  A soft navigation to `/settings` (the account menu's link) shows the first section.
- **Fit**, measured with CI's wider text: every section, the owner's and a member's own, at the eight
  configurations and 1366 × 657 (the platform spec's rows; a member's in `e2e/settings-workspace.spec.ts`).
- **Tests:** `e2e/settings-workspace.spec.ts` (each section, Back and Forward, the keys, a draft
  across a switch and the markers, `#compliance`, `#password` and the skip link after it, the soft
  navigation, Back leaving the page, Admin Mode's copy, the flow outside the gate, a member's fit).
  Specs that use a section other than Name on a desktop window open it by its address
  (`/settings?section=links`); the flow ignores it.

### System Health (28 Nov 2026)

`/admin/system`: a sectioned workspace with a rail of Statuses, Page speed, Build & database (with
Warnings), Diagnostics, Environment and Riot compliance (Demo data too on an empty team).

- **Nothing opens by growing the page.** Page speed's Technical details (by device and by page)
  open in a window, one table at a time (a 60rem sheet: the by-device table's seven columns whole);
  Diagnostics' recent errors (up to 8, each whole there, never cut) and recent job runs (up to 15) open
  in windows from a row each. The flow's Technical details fold is not drawn in the workspace: its
  panels are sections of their own. Riot compliance is open, and `#compliance` opens it.
- **The Audit Logs line** is under every section, after Riot compliance in the markup too where that
  section is shown (`WorkspacePlaced`; `ws:order-last` draws the first paint only).
- **The flow** (phones, tablets, short or narrow windows, a larger text size) is the stack it always
  was: Statuses, Page speed with its fold, the Technical details fold round its panels, the Audit Logs
  line, the Riot compliance fold. Until the page knows its posture the folds are drawn (a fold's
  state is the browser's), their title rows hidden by the CSS gate in the workspace, so a deep link
  to a Technical details section shows it once the page has hydrated.
- **Fit**, with CI's wider text: every section, and page speed's and the job runs' windows open, at
  the eight configurations and 1366 × 657. The demo has one job run and no errors: a production-sized
  Diagnostics (5 slowest runs, 8 errors, 15 runs) keeps the section small by its windows, which fit
  15 rows at 1366 × 768 (not measured on production data).
- **Tests:** `e2e/system-health-workspace.spec.ts` (each section, Back, `#compliance` open and kept
  through the skip link, the Audit Logs line's place in the markup, the windows fitting with no inner
  scroll and growing nothing, the flow outside the gate); the platform
  spec's rows (each section, and both windows open).

### Personal data, Accounts and Access levels (28 Nov 2026)

Users & Permissions' three pages. In the short form (under 46rem tall) the hub's "Admin Mode"
eyebrow gives its line back (the sidebar and the section tabs above name it).

- **Personal data** (`/admin/people/privacy`): a sectioned workspace beside a quiet rail (Privacy
  requests, Erase a former member, Erasure records with its count), in the address. Its two folds
  stay: each still fits open. The records are paged to the room under the actions (the backups' fold
  and the buttons first there, the records' card to the frame's foot), in the markup in that order
  once the page knows it is in the workspace (`ErasureRecords` places the fold, its `notes`); none in
  the demo. A record's Release confirmation keeps its own keys (the list's PageDown would turn the
  page under it).
- **Accounts** (`/admin/people`): its groups are one list paged to the room under the search row
  (`usePagedRows`, cumulative: the pages cut once over the whole list by the lines' own heights and
  the headings each page draws; a page draws its rows in their groups, each group, marked
  `data-ws-group`, with its heading again on every page it is on), the inline Pager in its foot;
  Profiles without an account are a group like the others there (no fold). An empty group's "Nobody
  yet." is a line of the list; the range counts people. A person opened from another page keeps the
  list on that page; a search goes to page 1. A person view stepped with ‹ › to someone on another
  page brings the list to their page, and its close gives the focus to their row (DetailModal's
  opener counts only while it is on the page; else `returnFocus`). It was 36px over at 1366 × 657 on
  the default demo, and over everywhere with a real team's accounts; it fits at the eight and the
  floor whatever their number. Its pages are uneven (a page with more headings holds fewer lines):
  with CI's 16 lines at 1366 × 657 they hold 7, 5 and 4.
- **Access levels** (`/admin/people/access`): fits by its own layout (10px over at the floor with the
  sidebar open before the eyebrow gave its line back). More than three base levels (the Owner's own)
  add a row of cards; see the tracked list.
- **Tests:** `e2e/people-workspace.spec.ts` (sections, Back, the folds open, the records' controls
  in the markup in the order drawn, the Release confirmation's keys, every account on exactly one
  page, on the default demo and with accounts made first up to CI's 16 lines, at 1366 × 657 open and
  1366 × 768 folded: every page fitting, Previous back to the same pages, a resize keeping the first
  line shown; a person's page kept, the focus back on a person stepped to on another page, the flow
  outside the gate); the platform spec's rows.

### Platform Settings' pages (28 Nov 2026)

Admin Mode's Platform Settings: Branding (with the old `/admin/public-access`), Previews, Resources
and Matchup notes. The admin layout's column and each page's root carry `WS_COLUMN`; each page's
`PageHeader` stays above its section, unchanged. Outside the gate every page is as it was (their
phone and tablet specs are unchanged and pass). Fit measured on the demo with CI's wider text: every
state below fits at the owner's eight configurations and at 1366 × 657, sidebar open and folded
(`e2e/one-screen.spec.ts`, 16 rows).

- **Previews: a fitted canvas (pattern d).** The studio is a card that fills the frame: its controls
  (Page, Screen size, Rotate, Reset, Open full size) and the size line in a 15rem column at its
  left, the device in the room beside them. The device is scaled by the room's width and height
  (`previewScale`; in the flow by the width alone, as before) and placed in its box (absolute,
  centred), so the box takes its height from the window, never from the device: at 1366 × 657 a
  phone is drawn at about 50%, at 1920 × 1080 a desktop at 57%. The size line says the scale ("shown
  at N% to fit"); Open full size shows it at 100%. Text inside the scaled picture is smaller than
  the floor: it is a picture of a page, labelled as such, as Laptop and Desktop always were. The
  frame never scrolls; the device's own page scrolls inside it, as on the device.
- **Resources: a paged list, its editor in a window (pattern a).** One card that fills the frame:
  the toolbar holds a filter (All, each section with its count, and Removed while a default is
  removed; in the address as `?section=`), the count and Add resource. Rows are two lines at least
  (`min-h-17`: the title with its marks, host and, under All, its section; then the whole
  description), the five row buttons at the right, paged by `usePagedRows` in its cumulative mode (a
  long title or description takes a row a third line: the pages are cut once over the whole list by
  the rows' own heights, measured again for another filter or another row's text) with the inline
  Pager in the card's foot (PageUp, PageDown, Home, End across pages). At 1366 × 657 a page holds 4–5 rows, at
  1920 × 1080 nine. Up and Down move within a section; a row moved past its page's edge brings its
  page into view and keeps the focus on its move buttons. Add and Edit open the form in a window
  (Dialog, `picker`) that fits at every size with nothing scrolling; Removed defaults are the
  filter's last choice, with Restore all. In the flow the form opens in place and Removed defaults
  are listed at the end, as before.
- **Matchup notes: one view at a time, paged (pattern a).** The queue's groups are one view switch
  in the address (`?view=`): Needs re-review, Not written yet, Drafts, Published, All notes, each
  with its count; the default is the first with something to do (Needs re-review, else Not written
  yet). The role filter stays beside it, New note at the line's end; the counts and the current
  patch move to the card's foot beside the pager. One list a view, in the queue's order (opponents,
  then pairings), one line a row (`min-h-12`: the counts leave out "this season", which the list's
  note above it says once; a long pairing or state takes two), paged to what fits by `usePagedRows`'
  cumulative mode (the pages cut once over the view's rows by their own heights, measured again for
  another view, role or refresh): 7–8 rows at 1366 × 768, 12 at 1920 × 1080 (203 lanes
  are 17–34 pages). No fold grows the page. A changed role starts at page 1; a saved change keeps
  the page (its row may leave the view).
  - **The note editor** is a workspace window at the game's width (DetailModal `size="workspace"`,
    `workspaceWidth="game"`: the window less 1rem above and below, 76rem wide), its parts in tabs
    (Scope and points, Sources, Preview): the scope on one line, the points two by two, the sources
    two by two, a point's text as tall as its words (`field-sizing-content`). Four points of 35 words,
    or six sources, fit at the owner's eight configurations with nothing scrolling inside. **At the
    floor (1366 × 657)** a full editor keeps one scrolling body (decision 5: its fields cannot fit
    even in columns there); the default editor (one point, one source) fits. A tab holding a problem
    is marked, and a refused save opens the first such tab; the problem lines of a refused full
    editor can make its body scroll until they are fixed.
  - **The re-review window** fits as it is.
- **Branding: a sectioned workspace (pattern b).** A 12rem rail of the sections (Name, Images,
  Background, Colours, Public page) with the Save bar at its foot, and one section beside it, in the
  address (`?section=`; the old `#brand-…` anchors name their section; `/admin/public-access`
  redirects to `?section=public#brand-public`). The form is one: every section stays mounted, so a
  draft survives a switch; the rail marks a section with unsaved changes (Name, Background, Colours)
  and Colours while a contrast check fails (Save waits for it); images save on upload and are never
  marked. Colours fits at the floor by its workspace layout: the title and its line on one line,
  the fields beside the preview, the eight checks under both in four columns, and a failing field
  marked by its red edge, its message read out with it (the checks show the message). The rail is
  the page's own rather than `SectionedWorkspace`'s: the flow is one form whose Save bar sticks
  across every section, which per-section wrappers would cut short; the Public team page is the
  panel's last section, 20px under the Save bar in the flow as it was under the panel.

### Match History, Encounters and Team Matches (28 Nov 2026)

Pattern (a), a paged list plus detail, with every game in a window: a pane would narrow the cards to
their two-row layout and drop the post-game view to its taller grid, and a game in the list's place
is about 100px short at 1366 × 768. Outside the gate all three are the flow, exactly as before: ten
cards a page with the stacked pager, Encounters' first 25 and Show more, Team Matches' first 20 and
Show more, a game under its card.

- **Server-paged by the row budget.** Each list's cards a page are `useRowBudget`'s count in its
  cumulative mode (the cards' own heights and the gaps between them: a session's header, a second
  line, a card that grows with its members), written to the address once the window has been at rest
  for 250ms (one server render for the size it comes to rest at; until it arrives, the cards past the
  budget are left out, so a shrink never overflows). The new page (Match History's and Team Matches')
  is the one holding the game open in the game window (`lib/list-per.ts`, `budgetPageOf`), else the
  one holding the page's first card, so the window's Previous and Next go on from it; the open game
  stays in the address. A game open that is not on the page shown leaves the page out of the write,
  and the server takes the page holding it. The write waits while the reader acts
  (`ui/reader-idle.ts`: a press, a click or a key in the last 1.5s; a navigation they started, a link
  followed or a filter chosen, until the list's data next arrives, up to 10s, however slow the
  server; and a Back or a Forward on its way, while the window's address is no longer the one the
  page drew), so it never overtakes the reader's navigation and is never written onto another page's
  address or another view's. Match History's `per` (the server's minimum is
  now 1, its maximum 25), Encounters' `eper` and `epage` (beside a player's games' own `page` and
  `per`: the list's page survives the way back), Team Matches' `per` and `page`. Every server slices a
  list it already holds or counts (Match History's in memory, Encounters' one statement with an
  OFFSET, Team Matches' in memory, its teams and scores read for that page only): no query costs more.
- **Turning pages never skips a record; one may show twice where the count changed.** The server
  cuts its pages by `per`, so these lists keep `useRowBudget`'s count rather than the cumulative cut
  of a client list (`usePagedRows`, above): it is measured on the page drawn and keyed to the list,
  not the page, so it is measured again only where a page overflows (a page drawing more headers or
  taller cards grows its frame) or the window changes; along a walk it only shrinks. Where it changes,
  the new page is the one holding the first card of the page drawn, at the new count
  (`budgetPageOf`: Match History, Team Matches and Encounters alike), so that page's first cards,
  fewer than it holds, may be the ones the page before showed last: the sessions on the demo at
  1648 × 900 or 1536 × 864 hold 4 cards on page 1, and page 2, drawn at 4 with two headers, holds 3
  and starts at the 4th game. Nothing is skipped whatever the count does (`lib/list-per.test.ts`
  walks 600 lists, the measured kind and an adversary's; `e2e/matches-workspace.spec.ts` walks the
  sessions and Team Matches and asserts where a repeat may be: only where the count changed, at the
  page holding the drawn page's first card).
- **The cookie per list** (`lib/list-per.ts`: `uniiverse_per_games`, `_sessions`, `_met`,
  `_encounters`, `_together`; a number from 1 to 25, UI state like the sidebar's) keeps the last
  budget, so the server's first paint of the next visit draws about the right count. A first visit
  draws the default and hides the cards past the window's height tier until it has measured
  (`wsTierClass`: Match History { gate: 2, mid: 3, tall: 4 }, Encounters { 3, 7, 9 }, Team Matches
  { 1, 2, 3 }). The flow forgets a kept size (a window that left the workspace) and draws its own.
- **Measured, at the owner's sizes** (1366 × 768 / 1440 × 900 / 1648 × 900 / 1920 × 1080 / 1366 × 657,
  the sidebar open and folded alike): Match History 4 / 5 / 4 / 5 / 3 cards, grouped by session 2 / 4 /
  4 / 5 / 2 (the first page's), a player's games 3 / 4 / 4 / 4 / 2; Encounters 6 / 9 / 8 / 10 / 4 rows;
  Team Matches 2 / 3 / 3 / 3 / 2 cards on the demo (its cards are 110–250px with their members).
  At 1366 × 657 the page's foot is the short form's 12px (`ws-short-host:pb-3`, every workspace page).
- **The pager costs no line.** Match History's inline Pager is the toolbar's first item, on the views'
  row (`SectionHeader`'s `toolbarLead`: on the scope line it cost 12px, a card at 1366 × 768); where
  Refine's chips share that row (a refinement, the sessions), it moves to the scope line's end
  (`scopeEnd`), so the toolbar keeps its row beside the views; Team
  Matches' on the filters' row before Bookmarked; Encounters' in the table's footer, in Show more's
  place (the footer's range replaces the "N of M shown" line). The test ids stay the flow's where the
  flow had a pager (`match-pages`, `match-prev`, `match-next`; only one of the two is ever drawn).
- **Keys.** On Match History's list PageDown and PageUp turn the page and focus its first or last
  card once it has come, Home and End the list's first and last game.
- **The game window.** `MatchDetailModal` with `workspace`: `DetailModal` `size="workspace"` with
  `workspaceWidth="game"` (the match window's 76rem, so the post-game view keeps its two columns; the
  pane's 56.25rem drops it to its taller grid) at the workspace's height, headless. One header line:
  the result, the champion and the length; the queue, the date and the patch; a ranked game's LP;
  then Previous, "Game 5 of 208" (its place on the whole list) and Next (`GameSteps` `where="window"`:
  `match-detail-prev`, `-next`, `-close`). Previous and Next go on across the list's pages: the
  server sends each page's neighbours (the previous page's last game, the next page's first), the
  list turns behind the window, the address is replaced, and the focus stays on the button pressed.
  The one history rule holds: opening adds one entry (a step across pages keeps it the window's), so
  Back and Escape close it, the focus back on the card of the game last seen. The scoreboard's marks
  for players met lead to their games (Encounters), closing the window.
- **PostGame's pages by measure** (`fitPages`): the view drawn whole while it fits the window's room,
  two pages where it does not (the window is wide: "Player and build", the player with the build
  panels beside it and the lane under it; "Scoreboard", the scoreboard over its notes), until the room
  grows or changes width (a phone's three pages are unchanged). Measured with the timeline drawn:
  a demo game is 607px against the floor's 542px room (1366 × 657), so the floor pages it; from
  1366 × 768 (a 653px room) every game measured is whole.
- **A link to a game** (`?match=`) opens with the list on the game's page, the window's Previous, Next
  and place with it, wherever the game is on the list (`lib/list-per.ts`, `pageHolding`). Match
  History's server takes that page where the address names none and the page size is the workspace's
  (the address's or the list's cookie: `getMatchHistory`'s `openMatch`); with neither it keeps its
  first page, the flow's rule (a link to a game on another page opens the match window), and the
  workspace's write then leaves the page out. Team Matches' server takes it where the address names
  no page or one that does not hold the game (`per` is the workspace's only there). A link opened in
  the flow drops its page size and keeps the game: Team Matches lists up to the end of the page that
  held it (`limit`, `flowLimitFor`). A game opened by a link and closed in the workspace leaves the
  list's page in the address, so a reload shows the same page.
- **Before hydration** a game a link names is drawn under its card in the server's HTML and hidden by
  the workspace's CSS (`MatchExpansion`'s `ws:hidden`), so the first paint is the list alone.
- **Tests.** The platform spec's rows (the games, a game open, sessions, a player's games, Encounters,
  My Profile's Match History, Team Matches and a game open, each at the eight and the floor) and
  `e2e/matches-workspace.spec.ts` (the budget in the address and the cookie, contiguous pages to the
  last game, the keys, the window across pages with Escape and Back, every game of a page at the
  floor, a new page size keeping the open game's page, a link to a game past the first page with a
  kept budget, a first visit's and one copied at another size, Encounters' pages and the way back,
  Team Matches' pages and window, the flow unchanged).
  The Production check reads both pages at 1440 × 900 as workspace pages and opens their games in the
  window (docs/LIVE_VALIDATION.md); the tablet keeps the under-the-card facts.

### All Champions' workspace (27 Nov 2026)

The first one-screen page, approved as it is: the platform's gate, data contract, shared modules and
tests above were lifted from it. It keeps its own section (the container named `section`), its own
list and grid wiring and its own spec (`e2e/all-champions-workspace.spec.ts`); moving it onto the
shared modules is a tracked follow-up.

The owner's request of 27 Nov 2026: on a desktop, All Champions fits one window and never scrolls,
not by trimming padding but by its layout. It has two postures (docs/MATCHUPS.md has what each shows):

- **The workspace** (`ws`): a window with a fine pointer, from 80rem wide, at least 41 of the page's
  own rem tall (656px at 16px: the browser window of a 1366 × 768 laptop, about 657px inside it, and of
  a 1920 × 1080 screen at 125%, about 1536 × 730, keep the workspace with fewer rows; the design's first gate,
  46rem or 736px, never deployed, sent them to the long page, which the owner's request rules out:
  "at shorter desktop sizes, reduce visible row counts"). The root grows from 1536px wide (html's
  clamp), so the CSS gate is written per band of widths at 41 × the band's widest root, rounded up to
  the pixel: 656px up to 1536px wide, then every 64px to 1920 (668, 680, 691, 703, 715, 727), 786 to
  2240, 845 to 2560, 902 beyond; each band includes its upper edge, so a fractional width (a zoom)
  never falls between two, and inside a band the CSS asks at most 13px more than the root check
  (`@custom-variant ws` and `ws-host` in globals.css; `WS_QUERY` in `ui/posture.ts` is the same
  string, and `posture.test.ts` compares them). A media query cannot read the page's own root (a
  larger browser text size, an emulated one), so once hydrated `useWorkspace()` also asks
  `innerHeight ≥ 41 × the root`, again on a resize, a query's change and a change of the root's size
  alone (the browser's text size changed while the page is open: Chrome fires no media query's change
  event for it, so until 28 Nov 2026 a text size set back from 18 to 16px at 1356 × 800 left the page
  in the flow until the next resize; a 1rem probe's ResizeObserver tells it now, `onRootSize` in
  `ui/posture.ts`); the section carries `data-workspace` while both may hold
  (the server's HTML and the hydration render, where the CSS decides) and loses it where they do not,
  and every `ws:` class needs that attribute. `ws-host:` makes the shell's main, its frame and the
  profile's column flex columns (the column `w-full`: a flex item with `mx-auto` shrinks to its
  content).
- **The flow**: everywhere else (phones, tablets held either way, `pointer: coarse` laptops, windows
  under 1280px wide or under the band's height, such as 1366 × 640, a larger text size): today's page,
  unchanged, the page the one thing that scrolls.

**The frame.** In the workspace the section is the flex remainder of the shell's `min-h-dvh` column:
the window less the profile's band, its tabs, the one-line section header and `#content`'s padding
(522 / 654 / ~646 / 786px at 1366 × 768, 1440 × 900, 1648 × 900 and 1920 × 1080). The list's card and
the preview's card sit side by side, both stretched to the frame's foot, their footers on one
baseline; with no champion open the list's wide table fills the frame. The section spaces its parts
with a gap in the workspace (`ws:gap-3`, not `space-y-3`: a margin would also go to the layout before
the workspace window's or a game's dialog, or the flow's hidden legend, and shorten the frame by 12px). The flex
items keep `min-height: auto`, so the frame never hides content: what would not fit would grow the
frame and the page by exactly that much (**the floor**: a list never shows fewer than one row a
column). It is the safety net only: from 41rem every state fits (28 Nov 2026), a champion of five
positions with an opponent's games open and every optional line drawn included (the partial
multikills' words and ⓘ, the averages' coverage, "29 games in all, 1 with no recorded position"),
because under 46rem (48 in a narrow section) the workspace takes its short form.

**The short form** (28 Nov 2026; until then, between 41 and 46rem, a champion of several positions
with an opponent open let the page grow by what its one game a column lacked: 4px for Aatrox at
1366 × 657, 44px for Sion's five positions): a workspace window under 46 of the page's own rem
(`WS_SHORT_REM`; 736px at 16px). `@custom-variant ws-short` (the section and its descendants, the
workspace window included) and `ws-short-host` (the shell's main) in globals.css ask bands of widths
inside the `ws` gate's, each with its least height and an upper height of 46 × the band's widest root
rounded up to the pixel: 735.98px to 1536px wide, then a band every 64px (749.98, 762.98, 775.98,
788.98, 802.98 and 815.98 to 1920; 828.98, 841.98, 855.98, 868.98 and 881.98 to 2240; 894.98 to
947.98 to 2560; 961.98 to 1000.98 to 2816; 1011.98 beyond), so a bound is at most 14px past the
page's own 46rem anywhere in its band (`WS_SHORT_QUERY` in `ui/posture.ts` is the same string, and
`posture.test.ts` compares them). Until 28 Nov 2026 the bands from 1920 were the gate's 320px, and
their bound reached up to 66px past it: 1920 × 816–881 (a 1920 × 1080 screen's window with the Dock
and a bookmarks bar is about 1920 × 860), 2240 × 882–947 and 2560 × 949–1011, 46 to 49.7 of their
own rem, lost the approved tall form, which fits there. A band includes its upper edge, where the
next band's bound holds too (1600 × 750 is short by the band to 1664; 1920 × 828 by the band to
1984, 13.5px past 1920's own 46rem). A second block takes `[data-ws-short]` under the `ws` gate: once
hydrated, `useWorkspaceShort()` marks the section where the page's own rem is short and the CSS
cannot tell (a larger browser text size: 1366 × 768 at an 18px root is 42.7 of its rem). At the
default text size the page's check is inside the CSS bands, so hydration moves nothing. The variant
uses `:is()`, not `:where()`, so its classes beat the `ws:` and container-query ones by specificity,
whatever the stylesheet's order.

**A narrow section** (28 Nov 2026) takes the short form to 48 of the page's own rem
(`WS_SHORT_NARROW_REM`; 768px at 16px, so a 1366 × 768 screen's full window keeps the tall form): a
section of 64.75 to 71.5 of its rem (`WS_PANE_SECTION_REM` to `WS_NARROW_SECTION_REM`), the pane beside
the list in 1356–1463px with the sidebar open (folded, the section is 71.5rem or more at every width). There the approved tall form's lines wrap: in a pane
under about 40rem (1356–1376px open) the totals take a line of their own under the positions (68px
instead of 47.5) and the kills line two (40px instead of 20), and in a section under about 71rem a
two-season header takes a second line (36 → 50px). At 1356–1363 × 736 Sion vs Nasus with every
optional line kept no games row (the page 739/736, its games 0px above their footer), with CI's wider
text so did 1366 × 736, its margin stayed under 12px to 751, and with a two-season header to 765px
(753/736). The short form's third and fourth blocks are a container query on the section
(`@container section (min-width: 64.75rem) and (width < 71.5rem)`) inside the first band's media query
under 767.98px (`WS_SHORT_NARROW_QUERY`; a narrow section at the default text size exists only from
1356 to 1463px wide) or under the `ws` gate with `[data-ws-short-narrow]` (`useWorkspaceShortNarrow()`:
under 48 of the page's own rem, for a larger text size; the container query decides the width). A
container query reaches the section's descendants, never the shell's main: a narrow section keeps the
page's 28px foot from 46rem, which it does not need (Sion vs Nasus with every line keeps 18px or more
of margin there, 16 with a two-season header). From 48rem, and in a wider section (folded, or from
1464px open) from 46rem, the tall form fits every state with every optional line, CI's wider text and a
two-season header (15px or more).

What the short form changes, and only there (the same cells, words and font sizes):
- P1 carries the champion's totals ("29 games in all, 1 with no recorded position") as its second
  line, under the name, beside the 36px portrait: P1 stays 53px, level with the list's toolbar (a
  second copy, `champion-preview-total-identity`; the one after the positions, or at P4's end for one
  position, is `display: none` there, so it is read out once);
- P3 is one row of five cells, each label before its figure on one baseline and its sub under it
  ("Win rate 50% · KDA 3.22 · CS/min 7.5 · …"): 43px instead of 62 at a 16px root. The stats' list is
  a subgrid of the row (`grid-cols-subgrid`, no `display: contents`, so it keeps its role); the cells
  keep their least width (`min-w-auto`: with `min-w-0` long values drew one cell over the next) and
  `justify-between` spreads the spare room with a 12px least gap; where a row lacks room, the win
  rate's record line breaks between its two unbreakable groups ("22 games ·", "11W 11L"), then its
  label, so long values add a line instead of overlapping or overflowing;
- P4, the kills line and the averages' coverage, is one run of text (a block whose strut is
  `text-xs`'s: the kills line inline, the coverage an inline block that moves whole, a 12px space
  between them that goes at a line's end): where the kills line wraps (larger values, a narrower
  pane, wider text: its legend "* only some games counted so far" and ⓘ move whole), the coverage
  shares its last line instead of taking a third (P4 36px, 40 wrapped; 38 and 58 as two flex lines);
- an 8px rhythm between the bands (the positions row, P3, the opponents' rule), the segments `py-1`,
  P3 → P4 6px; in an opponent's detail its back button and ‹ › take the mouse's 32px (touch keeps
  44: the variant asks a fine pointer), its parts 4px apart and its games' heads `pb-1`;
- `#content`'s bottom padding 12px instead of 28 (`ws-short-host:pb-3`, on the shell's main and
  `MAIN_CLASS`), the section's gap: both cards end 12px above the window (under 46rem only, not in a
  narrow section's 46–48rem). It keeps a two-season header (the season choice wraps the section's
  header in a section under about 71rem, 36 → 50px) at 15px or more.
Measured at the floor (1366 × 656, the sidebar open): Sion vs Nasus with every line keeps 2 games a
page and 29px of margin, Aatrox vs Darius 4 games, Ambessa vs Darius 6, Sion Jungle vs Lee Sin 4,
Ambessa 8 opponents; the list 5 rows. At 46rem
and up (48 in a narrow section) nothing changes but the detail's header, below.

**The detail's header**, at every workspace height: ‹ n of N › never takes a line of its own. The
header does not wrap; the back button, the opponent's portrait and name and the steps keep their
width, and the record wraps between its own unbreakable groups ("13 games ·", "6W 7L · 46%", "(small
sample)"), so the win rate stays with its record. It is 36px, or 40 where the record takes two lines
(a small sample in the 670px pane at 1366 with the sidebar open, where the steps' own line made it
76px before 28 Nov 2026 and its games had 2 a page instead of 6).

The preview is a pane only where the section holds the opponents' two columns beside the list
(64.75rem: `WS_PANE_SECTION_REM`, 1356px wide with the sidebar open; the flow's bound is 47.5rem,
`PANE_ROOM_REM`). One decision draws it (`paneFits`, `useRoomForPane`), from **the section's room**:
its width with the page's own scrollbar given back (the scrollbar's width while the page scrolls, or
the padding `lockPage` gives the body in its place while a window holds the page), so the room, and
the answer, are the same whether or not the page scrolls, and however the window was reached:
- **The flow** scrolls, and what it holds decides whether it does, so the pane needs its 47.5rem with
  the page's scrollbar in the section: room − the scrollbar's width where scrollbars are classic
  (Chrome and Firefox on Windows and Linux, a Mac set to always show them: 10px for the thin
  scrollbars in Chrome on Linux; read from an invisible box that always has one). With the sidebar
  open that is the pane from 1090px where the scrollbar is 10px (1080 where scrollbars overlay the
  page: phones, tablets, a Mac's default, Playwright's hidden scrollbars), the sheet below it.
- **The workspace** never scrolls, so it allows for none: the window to 1355px, the pane from 1356,
  with any scrollbar. A moment's scrollbar there (a list's first render before it measures) no longer
  takes the pane away.

The server's HTML and the hydration render draw the pane's column from the CSS's container queries
(`PANE_COLUMN_SHOWN`, the same two bounds); once hydrated the column the page opens carries
`PANE_COLUMN_OPEN` and the split grid its two columns whatever the queries say, so the CSS never hides
a pane the page opened. Until 28 Nov 2026 the page compared the section's rounded
`clientWidth` with each bound less half a pixel: a section in that half pixel (an 18px root at 1525px
with the sidebar open, 1165px of 1165.5; a zoom's fractional widths, 1035.56px of 1036, or 759.56px of
the flow's 760) opened a pane the container query hid, and nothing of the champion opened showed. The
room is read from the layout's own fractional widths.

Why the scrollbar is given back (28 Nov 2026). Where scrollbars are classic, the page's scrollbar takes
its width from the section, and what the page holds decides whether it is there. While the column's
container query decided, in the flow with the sidebar open a pane that made the page scroll (the
narrowed list's taller rows) narrowed the section under 47.5rem, the column went, the sheet left the
page short again, the scrollbar went and the pane came back, about every 140ms, the champion not drawn
in 80–98% of samples (Demo ADC at 1085 × 768, 1085 × 900 and 1088 × 800, Demo Sub at 1082 × 1024, Demo
Top's Ambessa linked at 1080 × 1790, a portrait screen; 760–768px sections against 750–758 with the
scrollbar). In the workspace an opponent's games' first render at an 18px root (1526 × 900, Sion vs
Nasus, 1166px of 1165.5) overflowed for a moment, its scrollbar hid the column and the window took the
pane's place. Two earlier answers were dropped: keeping the scrollbar's gutter on the page
(`scrollbar-gutter: stable`) shifted the page 10px between the profile's tabs and took the gutter out
of `100vw`, which moved html's clamped root between the flow and the workspace (the page took turns
between them 50 times in 3s at an 18 or 20px text size near the 41rem gate); holding the sheet once the
column went kept it where a fresh load shows the pane (a taller window, the sidebar unfolded, a gutter's
width of steps). The cost of the rule: with classic scrollbars, a flow window in the scrollbar's width
under the bound (1080–1089px with the sidebar open) opens the sheet even where the page would not have
scrolled beside the pane.

A narrower workspace section
(1280–1355px with the sidebar open, or a larger root) opens it in **the workspace window** over the paged list (28 Nov 2026; until then
the sheet, whose unpaged preview, about 2,014px with Ambessa, scrolled inside it: 535px of room at
1280 × 689). It is `PreviewWindow size="workspace"` with `headless`: a modal window as tall as the
screen less 1rem above and below (`h-[calc(100%-2rem)]`, a share of the box it is fixed to, never a
viewport unit), up to 56.25rem wide, the pane's surface, its overflow visible, opening with a fade only
(the row budgets measure it as it mounts; `modal-in`'s scale would hand them a box 3% short). It
holds the pane's own content, P1 as its title bar (‹ › and the labelled Close; no window header),
the opponents and an opponent's games paged in place, so nothing scrolls inside it: `useRowBudget`
ends a list inside an open dialog at the dialog's own foot (`rowBudgetEdge`). It keeps the sheet's
behaviour: the native modal's focus trap, Escape innermost first (an opponent's games back to the
grid, the focus on its cell, also where the focus is on nothing in the window; then the window
closes), a click on the dimmed page beside it closing it at once, opponent and all (`canClose` hears
what asked, `CloseRequest`: until 28 Nov 2026 the first click only went back to the grid), Back
closing it, ‹ › stepping champions (the list's page follows under it), and stepping aside for a game's
window. However it closes, the focus goes to the row of the champion it shows, as the pane's close
gives it (DetailModal's `refocus`; until 28 Nov 2026 the row it was opened from, whichever champion
‹ › had stepped to), or the first row of the page shown where that row is not on it. Where the pane
takes its place (a wider window, the sidebar folded) the focus stays in the preview, on the same
control in the pane (P1's ‹ › or Close, an opponent's cell, a pager), looked for frame by frame while
the pane's opponents come in (a second at most, then the nearest: the opponent's heading, the first
opponent, the pane's heading), as a zoom across the workspace's gate keeps it.
At 1280 × 689 it pages 20 of Ambessa's opponents, all 9 of Darius's games (room for 20) and 16 of
Sion's vs Nasus; at 1280 × 656, 14 of those.
Touch phones and tablets keep the sheet, unchanged but for its focus as it closes: the row of the
champion it shows (it had the same defect, the row it was opened from), and a tablet turned sideways
hands the focus to the same control in the pane. The pane drops the flow's `sticky` and
`overflow-clip` (a flex item that clips gets no least height and would cut silently), and the flow's
pane placement and pinned headings are idle.

**The rows.** Each list (the champions, the lane opponents, one opponent's games) shows the complete
rows that fit between its first row and its card's footer, less the 1rem guard: `useRowBudget`
(`ui/fit-rows.tsx`) reads the window (never the frame's box, which grows with its content), the
footer's height and the first row's top and height (`rowBudget` in `ui/row-budget.ts`), in a layout
effect, on resize (a zoom fires one), once the fonts load, and when #content, the footer or a band
above the rows changes size; it never observes the rows, keys its measure on primitives only, and a
measure that would flip back settles on the smaller count, so it always comes to rest. Every row is
one height (the champions' role line holds the "In pool" chip's height with or without it). The
server cannot measure, so its HTML draws the first rows by the window's height in the Leaderboards'
tiers, one fewer than fit (`WS_TIER_ROWS`: 3, 7 at `board-at-mid`, 9 at `board-at-tall`; the
unit test recomputes them per band), and hydration only adds rows below them. A linked preview's
first paint draws the first opponents, and an opponent's first games, in the first column only (1
under `board-at-mid`, 4 opponents and 3 games from it: what fits at the tier's smallest window for any
champion), so the measured page only adds cells below them and the second column: no cell moves at
hydration. Where the workspace's section is under 64.75rem (the workspace window's sizes), a linked preview's
first paint gives the list the frame with the wide table's rows and heading (`SHEET_FIRST_PAINT_GRID`
in all-champions.tsx), as the workspace window will leave it. Pages are client state
(`usePagedList`): a new selection shows its page, a new budget keeps the selection's page or the
first row shown, typing goes to page 1, another order to the selection's page, another filter to the
selection's page where it is still listed; leaving an opponent's games (All opponents, Escape) shows
the page holding that opponent (`useFollowed`: the list follows the opponent just left until it has
drawn its pages, also after a linked opponent whose grid was never measured), and the measure keeps
its last count while a list gives way to the detail. The pager (`ui/pager.tsx`, Match History's,
shared) folds by the widest line its page count draws and reserves that line's width for its buttons
(the arrows at its two ends, the pages centred between them) and its range's widest text, so it never
changes width and no arrow moves from under the pointer as its pages turn.

**Margins.** Each list ends at least 12px above its footer (16px or more measured at the owner's
sizes, with CI's wider text too; in the short form 17px or more in the states measured at the
floor and the band edges, and at least 12px in every state the tests hold, the wider text included),
in the pane and in the workspace window alike: the fixed workspace's form of "A layout held to a measure
keeps a margin" (docs/STANDARDS.md).

`e2e/all-champions-workspace.spec.ts` (its own demo server with `UNIIVERSE_DEMO_WIDE_CHAMPION=1`:
Demo Top's Ambessa with 40 lane opponents and 30 champions) holds it at 1366 × 768, 1440 × 900,
1648 × 900 and 1920 × 1080, the sidebar open and folded, plus 1366 × 736 and 1280 × 800: the page the
window, the cards above the padding, the margins, no scroller and nothing clipped (classic scrollbars
too), every name and K/D/A whole, every control reachable and Tab with a visible focus and no scroll,
opening a champion or an opponent without a change of height or a moved row, every record through the
pages (30 champions, 40 opponents in three orders with the divider's rules, 9 games), the keys, Back
and Forward, filters that keep the champion, a resize, the sidebar and 125% zoom, axe, wider text,
the shorter laptop windows (1366 × 657 and 1280 × 689 open and folded, 1536 × 730, 1600 × 772,
1648 × 789: eleven states each, every one fitting, the optional lines drawn for Sion vs Nasus), the
gate's band edges (each band's least height, five states) and both sides of the short form's bound
(1366 × 735 / 736 folded, 1599 × 749 / 750, 1900 × 815 / 816, 1920 × 828 / 829, and tall at 1920 ×
850 and 881, 2000 × 845, 2240 × 900 and 2560 × 970; a narrow section's 1366 × 767 / 768 and
1463 / 1464 × 767, and 1280 × 740 folded), a narrow section (1356 × 736 and 752, 1360 × 744, 1366 × 751, 1440 × 760 and
1463 × 767 open, five states, every optional line; the tall form at 1356, 1366 and 1440 × 768; 46rem
again folded and from 1464px), the short form only below the bound (P3, the totals' place, the 12px
foot, P1 level with the toolbar), nothing cut and no figure cell over the next, the detail's header on
one line at 657 and 768, a two-season header (1366 × 656 / 657, 1356 × 736 / 760 / 768, 1366 × 744 /
768, 1440 × 744), a resize across both bounds and a fold of the sidebar across a narrow section's edge,
an 18px root (1366 × 768 folded, short by the page's own rem; open, the workspace window; 1560 × 840 / 870
open, a narrow section short and tall by its own rem), the workspace window at 1280 × 689, 1280 × 800 and 1340 × 720 (every state paged
inside it, every record through its pages, Escape, Back, ‹ › and Tab kept inside), its band's edge
(1355px open the window, 1356 the pane), its live region kept across ‹ › (the champion stepped to is
read) and its surface the pane's (`panel-depth`'s shadow, not `shadow-2xl`'s), the pane's two bounds
in the half pixel under them (an 18px root at 1524–1526px, 1035.56 and 759.56px sections: the window
or the sheet, never nothing), both bounds with classic scrollbars (two seconds of samples, one
presentation drawn in each, the section one width, an open window's backdrop over the whole screen:
the sheet for Demo ADC at 1085 × 768, Demo Sub at 1082 × 1024, Demo Top at 1085 × 768 and its Ambessa
linked at 1080 × 1790, the pane from 1090; the presentation a fresh load gives after a taller window
(1200 × 470 → 900), a step back across the bound (1095 → 1089 → 1090) and the sidebar unfolded (1089
→ 1090); the window at 1355 and the pane at 1356 with Darius open, both ways, no padding behind the
window, Sion vs Nasus at 1356 × 736, an 18px root at 1526 × 900 and 800; the posture held with an 18
and a 20px text size near the 41rem gate; no gutter in the flow), a click beside the window with an opponent open (closed at once, the
focus on the row) and Escape with the focus on nothing (the grid first), the focus after ‹ › twice
(Escape, Close and Back on the champion shown's row) and across the window's handover to the pane
(P1's ›, an opponent's cell, the opponents' pager),
a linked preview's first
paint (nothing moves at hydration), the pagers' constant width, the focus after leaving an opponent
(from a later page, after ‹ ›, from a link), after closing a champion paged away, across a zoom over
the gate and on the pane's ‹ ›, each item's place on its list, and the flow at 1366 × 640,
1440 × 600, 1280 × 640 and with a 150% root.

## Primitives

- `Button`: desktop heights unchanged; `max-md:min-h-11` and `pointer-coarse:min-h-11`. `wrap`: on a
  phone a label that a larger text size makes too long wraps and the button grows with it (a form's
  Save beside little room); without it a label stays on one line.
- `Select` (`ui/select.tsx`, since 20 Nov 2026): the browser's own select in the phone posture (its
  wheel or sheet), the app's popover elsewhere, one look closed (docs/DESIGN_SYSTEM.md §7, Select);
  its options are 44px on a touch screen and 36px under a mouse.
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
- A section that folds on phones: `Fold` (`ui/fold.tsx`, a native `<details>`; it replaced
  `Disclosure` and every page's own fold in S4a) or a CSS breakpoint. The former `MobileSection`
  was removed. A Fold inside another (Data & Integrations' Advanced, inside Details) turns its
  chevron only for its own `<details>`. Every fold's summary is 44px tall on touch screens and the body of
  a row or an inline fold starts 16px under it (a panel's past its border and padding), so the touch areas of the links in it reach nothing of the summary.
- A typed confirmation (Admin's setup jobs, a job turned off, Delete with profile, a profile
  without an account; 19 Nov 2026): the same `Dialog`, its phrase above an `Input` (16px on touch,
  so Safari does not zoom), any letter case accepted since a phone's keyboard capitalises; the danger
  button enabled once the words match. An account's two deletes share a row from `sm` and wrap as a
  pair below it. `e2e/admin-safety.spec.ts` checks it at 1440 and 375 with axe; `e2e/webkit.spec.ts`
  types the phrase in WebKit on an iPhone-sized screen.
- `PanelHeader` wraps its actions; `Panel` is `min-w-0` so grids never force page overflow.
- `ChampionPortrait` images carry width/height, `loading="lazy"` and `decoding="async"`.

## Tables

Tables with more than four columns render as cards on phones and as the table from `md`:
Data jobs and the player's champion proficiency table. Match history rows wrap into cards by the
list's own width (owner decision D8): a phone's card under 36rem (about 118px; both teams left to
the game's own screen), a two-row card from 36 to 50rem (about 120px: the game's figures and build,
then both teams) and one row from 50rem; under 768px (phones, and a narrow window with a mouse, which
has the phone's frame) and in short windows a game opens as the match window (the whole screen under
640px; Back closes it). Encounters' column names pin under the section tabs where those pin (from
md, in a window taller than 480px), as All Champions' do.
A game's post-game view (under its Match History card, or in the match window; 19 Nov 2026) lays
itself out by its own width (container `pg`): "Your game" and the scoreboard side by side from
60rem (1440 and 1920; 1280 with the sidebar collapsed), stacked below (tablets, 1280 with the
sidebar open, phones). The scoreboard (container `sb`) has one 37px row per player from 30rem
(portrait, name over champion and rank, K/D/A, the build, CS over damage) and two lines of about
48px below it (the name and K/D/A, then the build, the rank and CS with damage). Measured on the
demo: at 1440 × 900 the card and the open game take 660–685px with Close on the first screen; at
390 × 844 the window's pinned chrome is 110px, the scoreboard starts at about 650px and the whole
game is 1.50–1.82 screens with its folds closed (the demo's first three games, Release 9, 20 Nov 2026;
about 2.9 with the gold and build folds open; `e2e/overlay-kit.spec.ts` holds it at 2.0 or less); no
tabs anywhere.

A Match History card from 50 to 65rem of list (61rem until 25 Nov 2026, when the performance score
took a column of its own after the K/D/A; 1280 with the sidebar open: a 60rem list) shows the
build (the six items and the trinket, 22px) at its own width before the chevron, and the rosters
go first (UD.H1; S6c, 20 Nov 2026: the card showed no build there); the open game's scoreboard has
the rosters. The room they leave goes to the champion's column (since 26 Nov 2026: its team
members' names whole, not about 150px of blank after the build). The card stays 90px (D8's density
is unchanged), and from 65rem it shows both again. A card whose items are being collected, or that
Riot no longer serves, says so at the build's own width (5.875rem, wrapping), so its score keeps the
column of every other card. Team Matches'
open game has Previous and Next (the footer's, by Match History's rules: they replace `?match=`, the
new card's header keeps its y within 1px, they are disabled at the ends and say "Game 5 of 6:
Defeat on Ornn"); Back or Close lands on the last game viewed, with the focus on its card. A
record's game opens over Leaderboards as a docked Peek from md and the window on phones and short
windows (`/leaderboards?match=`, TEAM_LEADERBOARDS.md). One Peek at a time: opening the record's
game with a player's Peek open (or the other way round) takes over the entry the first one pushed,
so after closing it Back leaves the board in one step (Release 9 review: it took two). In the game
window's footer, at a large text size (a row narrower than 17.5rem), "Game n of m" takes a line
under Previous and Next, so neither runs off the screen. Encounters' Against, Alongside and All
keep their whole width on a 320–360px phone, the search's icon taking the next line.

All Champions follows its list's own width too (a container query, so the sidebar counts). On a
desktop window the page is the one-screen workspace (Shell, "All Champions' workspace" above); the
paragraphs below are the flow, unchanged wherever the workspace does not apply:

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
figures at 1536 and 1680px. All Champions' preview (S5, 19 Nov 2026; docs/MATCHUPS.md) replaces the
champion window. Since 25 Nov 2026 (the owner's request: the docked panel of Release 16 lay over
half the table) it is a pane **beside** the list wherever the section has 47.5rem, from 768px wide in a
window taller than 480px (a 1024px window with the sidebar folded, 1280px with it open; an 1180px
tablet held sideways): the list narrows to `minmax(22.5rem, min(32%, 24rem))`, its rows in the narrow layout
(the name over the position icons and "In pool", the win rate over the games) under a heading row
of the table's height (Champion, Games, Win rate; "Sorted by KDA" there when the list is sorted by a
figure it no longer shows, the rows unchanged), so every row keeps its place and height and every
name its x (22.5rem holds five 24px position buttons and "In pool" on one line beside the rank, the
portrait and the figures: at 20rem, 1366px with the sidebar open, "In pool" took a second line as
the pane opened, the 25 Nov 2026 review). The pane takes the rest, and the page is the one thing that
scrolls (no scroll box beside it, the same review): pinned under the section tabs while it fits the
window; taller, it scrolls with the page, held between the tabs and the window's foot, its header
(portrait, name, ‹ › and Close) pinned under the tabs while it passes; opened or switched to another
champion, its top is placed under the tabs. Its position choice wraps (each position's games, win
rate and record on two lines); its figures go five across from a 34rem pane,
the win rate over four from 28rem, two by two below; the opponents' detail sits beside their table
from a 38rem pane and is one step in place of it below (with "All opponents"). Narrower sections (an
upright tablet, a large text size), windows under 768px (touch or mouse) and short windows get the
phone window shell's sheet with the same content. Each row shows the position icon of every position
the champion was played in: 24px controls with a tooltip with a mouse, 14px marks 2px apart on a
touch screen (the row the one 44px target; a tap on a mark opens that position, elsewhere the most
played; the preview's position choice, 44px segments, shows and switches them). Five touch marks and
"In pool" fit the table's narrowest champion column (9rem beside the portrait, 752–891px tablets:
rows of at most 56px); only four or five mouse buttons there (a window of about 770–1100px) let "In
pool" take the next line. (Until
22 Nov 2026 a wide list showed it over the columns after Win rate; from 23 Nov 2026 until Release 16
it unfolded under its row and pushed the list down; from Release 16 until 25 Nov 2026 a panel docked
at the window's right edge, over the table.) The wide (76rem) tier drops the Kills column (it sorts like Games; per-game kills are in KDA;
CM AC-11, reversible: OD20). `e2e/champion-preview.spec.ts` checks the pane at 1280, 1366, 1920 and
2560 (the sidebar open and collapsed: beside the list, within the screen, nothing wider than it, no
scroll box and nothing scrolling in main, its header on screen, no row or name moved, a champion of
five positions included at 1280 and 1366 with the sidebar open, sorted by games and by KDA), a pane
taller than a 1366 × 600 window read to its end by the page's own scroll, ↑/↓, ‹ ›, Back, Escape
and Close, the positions of a champion played in one, two, three and five positions (a tap on a
mark on the phone and the tablet), the opponents' table, its search kept to its position, its detail
and the phone's step brought into view, and old addresses on all three projects, the sheet on the
phone and the upright tablet and the pane on the tablet held sideways; `e2e/profile.spec.ts` the
five-position row at 768 and 752px on the touch tablet. Since 27 Nov 2026 the desktop project's
1440 × 900 is the workspace: the pane tests there assert it (one screen, the opponents in two columns,
an opponent's games in place), the short-window tests (1440 × 600, 1366 × 540, 480px tall) assert the
flow, 1280 × 800 with the sidebar open asserts the workspace window over the paged list (its heading
P1's, nothing scrolling inside it), and two tests force pages
on the default demo with the test cookies `uniiverse-test-champions-per-page` and
`uniiverse-test-opponents-per-column`.

The player Peek's pool list (Team, Players, Leaderboards; `PoolChampionTile`) takes its columns
(Win rate, Games, KDA, CS/min or Vision) from its own width, 28rem or more (`@container/pool`), and
below that each champion's figures in a short block. Until 20 Nov 2026 the columns came from a 640px
screen, and the docked panel at 1280 (a 25rem list) cut the names to "A.." with the headings running
together; the 1440 panel (28.6rem) keeps the columns. `e2e/players-directory.spec.ts` checks 1280.

## Tests

`pnpm build && pnpm test:e2e` runs `e2e/responsive.spec.ts` on phone (375), tablet (768) and
desktop (1440) against a production build on an in-memory database with the demo roster, which
reads Riot's Data Dragon at one pinned version (once the version the curated Matchup Intel notes were checked on)
(`DDRAGON_VERSION`, set by `playwright.config.ts` from `e2e/ddragon-version.ts`;
MATCHUP_INTEL.md, "What the browser tests pin"). A demo server started by hand for the specs
(`E2E_PORT`) needs the same environment, `DDRAGON_VERSION=16.22.1` included: outside CI
Playwright uses a server already on the port as it is. It checks: no horizontal overflow on every page, navigation (tab bar, a tablet's top bar and avatar menu, sidebar), 44px targets
and 16px inputs on phones, and the champion picker on the player profile.
`e2e/responsive.spec.ts` also checks Settings: at the three widths, and at 734 × 343, 863 × 360 and
320 × 568, the account card's Tab order against the order it is drawn in, Sign out on the first
screen, the card above the sections on a phone and a sticky column beside them wider (not pinned in
a window 480px tall or less), the name, the neutral role badge and the picture's control named in
full, each field and its Save on one row (44px on touch screens), the password form shown, the
index as a row of words in each window 480px tall or less; on a phone who you are beside the picture, the
index's entries (44px, no dots, the section being read underlined on screen; bordered chips until Release 17), an index link's
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
within 1px on each section of its set (Team's, Platform Settings', a profile's,
Match History's views, Users & Permissions'), and at 1920 × 1080 with the sidebar
folded the bars of `main`'s own (Team's, Platform Settings'), measured once the page
itself has replaced its loading state: the row in the same place on all of a set's sections, Team's
name ending at the column's right edge, the bar's line spanning the room, and on Team Overview the
header centred in Team's column; under a 1600px window (1536 × 864, the sidebar folded) Players and
Matches fill the room with Team's other sections, under a row that spans the bar (since 23 Nov 2026); at a tablet's width held sideways
(768 × 420) the frame is the compact bar, the sections in it and not in the page, sliding away as the
page scrolls down; a tablet's destinations in its top bar, one tap each, and its avatar menu taking
the focus to its first item, the arrow keys going round its items (Down and Up wrapping, Home and
End), its notes' Details link named "Details: Riot Games notice" with the focus ring and a 44px touch
area, Tab closing it, giving the focus back to the avatar on Escape, leaving the page where it was on
a click outside, and closed by Back without Forward reopening it; the installed app's Back on a tablet
beside the destinations (the display mode stood in for, as Chromium cannot emulate it);
the filter sheet's Done leaves with its motion; Admin Mode's Settings has its title; and a page's
controls in reach (PR 2b): from md the pinned row offers Match History's views and Filters exactly
once the page's filter bar has gone 10px above the pinned stack's foot, and not 10px below it (the
row pinned at both), at the row's resting height and inside it, gone again at the top, none in a
short window; a copy keeps the focus while it has it and goes once the focus moves on; from the end
of Match History (768 and 1440) Filters opens the sheet in its sheet form (Refine in one column), the
toolbar in the page keeping its size; Escape and Done hand the focus back to it, still drawn, even
after a change that emptied the list; a sheet closed after only a look (More filters opened) moves
nothing once the reader has moved on (a later change in the page's own filters keeps the place), nor
does Bookmarked after a look at Team Matches' Played with; closed after a change, the first game
lands under the pinned tabs, and on the desktop Encounters' first player under its pinned column
names, Team Matches' first game, the Overview's dashboard, All Champions' first champion under its
pinned headings and Players' first player do too; the compact search narrows Players and All
Champions in the row's own height, and its Clear lets the copy go once the page's own search is back
in view, with no focus left in the row; Bookmarked from the row replaces the entry, is marked and
keeps the place; Leaderboards (one page since 19 Nov 2026) puts nothing in the pinned row, and its old Records address lands on its season records; on a touch screen at 1180 and 1366,
Team's tabs and the bar 44px, the 2.75rem `--tabs-top` assumes, at rest and pinned, Filters and
Bookmarked centred inside it, a change from it landing the first game 8px under it, and at 175% text
the compact search filling the bar exactly; with a mouse at 1440 the tabs 40px, the controls centred
in the bar; Encounters in its own order and a game mode: from md the pinned row counts and names the
mode alone and its sheet's Reset keeps the order, on a phone both are counted, named and reset; a
phone held sideways (852 × 393) counts and names the bar's own; and an open sheet follows the phone
turning across 768px (upright to sideways: the order and its Reset leave it; back upright: the
order is in it again, and its Reset puts both back).
`e2e/mobile-nav.spec.ts` has the phone's: the top bar's Filters (44px, "Filters:" and what is chosen)
only once the page's own has gone, opening the sheet, Done after a change landing the first game
under the bars, its badge counting; Escape and Done hand the focus back, even after a change that
emptied the list; the fullest bar (Back, the title, Filters with its count, the avatar) within a
320px phone at 100%, 175% and 200% text, Back giving way; one primary navigation shown at a time in
each posture; the account screen closed by Back (the page staying) and not reopened by Forward,
upright and held sideways; the phone's label ladder at 320 to 430px from 100% to 200% text; a
tablet's destinations (the current one's gradient bar) and avatar menu in both modes, and its top bar
at 100% to 200% text in both modes, the team's name, then the whole names and then the short ones
giving way where the bar's row is narrower than `BAR_FIT` says (and what a 768px tablet shows at each size written
out, so a threshold above what fits fails too), the destinations never scrolling and the bar never
wider than the window, beside the installed app's Back too. `e2e/navigation-landings.spec.ts` has the current destination on its own page going back
to the top without a fetch, in the sidebar and in a tablet's top bar. `e2e/filter-consistency.spec.ts`: the sheet
opened from the pinned row at 768 and 1440 labels every field (More filters opened), holds the only
copy of each id, and gives Team Matches' Played with the sheet's width, as its selects.
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
button; and on a phone, the Filters sheet's pickers
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
under them, the carousel and its position dots (the track and its role bar until 23 Nov 2026), no bench, and no later card's member's
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
`e2e/phone-wraps.spec.ts` keeps a row's subject whole on a 320px phone, and a profile's header at a
larger text size: on 320 and 375px phones at 150%, 175% and 200% text, the Overview's header and the
other sections' band of each of the lineup's five cut nothing (the rank, an off role, the lineup
status) and break no word of four letters or more across lines, the name's included; and so with the
browser's own text at twice its size (Chromium's default font size, which scales the media
queries' rem as well). The header follows its own width in rem for this (`LARGE_TEXT` in
`profile-header.tsx`); at 100% text it is laid out exactly as before.
In this repository's sandbox set `PW_CHROMIUM_PATH` to the Chromium binary.

The wider audit script that produced the before/after numbers (eight viewports × twelve routes,
overflow in pixels, small targets, sub-16px inputs) lives outside the repo; its findings are in
the responsive pass report.

## Phase 3 checks

`e2e/quality.spec.ts` loads every player page at 320×640, 375×667, 390×844, 430×932, 768×1024,
1024×768, 1280×800, 1366×768, 1440×900, 1920×1080, 2560×1440, 3440×1440, 3840×2160, 844×390
(phone landscape), 568×320 (a 320pt iPhone held sideways, the compact bar's narrowest) and 1366×600
(short laptop) and fails on any horizontal overflow or a missing heading; admin pages at six sizes
(568×320 among them). The same file runs axe (WCAG 2.1 A/AA) on every page and fails
on critical or serious violations, and again at 1920 on Team's four sections, Champion Intel and
Resources, where the section tabs' row takes the pages' width, and at 1440 × 600 with a page's compact controls
showing in the pinned row (Team Matches, a profile's Overview, Match History, Encounters).
Panel layouts that live in variable-width columns use container queries (`@container`, `@xl:`) rather than viewport breakpoints.
For example, Team Matches' cards take their four columns from their list's width (`@container/tm`, from 58rem), because the sidebar beside the list takes 4.5 or 16rem of the same window (`e2e/played-together.spec.ts`); inside a card the members go two to a row from a 34rem column of their own (`@container/members`: a tablet's stacked card, or the four columns beside the open sidebar at 1440), and from sm a member's CS and damage show where the member's row is 19rem (`@container/member`): beside the role and champion where both fit whole, on a line of their own under them otherwise, so a long role and champion ("Role unknown · Nunu & Willump", the longest the game can show) is never cut for them. On narrower cards the result, its game and the count of members are one line of words that wraps, the bookmark in the corner; on a phone's card the count is read out only.
Leaderboards (one page since 19 Nov 2026, one dashboard since 25 Nov 2026: no views, nothing folded) places its four boards by the page's own width (`@container/dash`): one column under 59rem (phones upright and sideways, tablets, a desktop at 150% text or more; with the index of the sections below Recent form, `SectionIndex`), in the order Recent form, Multikills, Season records, Milestones, a short natural scroll; from 59rem one screen, a 2 × 2 grid (`minmax(36.25rem, 1.25fr) minmax(21.75rem, 1fr)`) whose rows the two boards in them share: Recent form beside the multikills, the season records beside the milestones, each pair one height, every board within the window at 1366 × 768, 1440 × 900 and 1920 × 1080 with the demo's seven active players. Each board's rows follow the board's own width (`@container/list`): Recent form's tiers (36rem, 58rem; large-text reflows under 17.5, 16.5 and 13.5rem); the multikills a table of eight columns from 26rem (the kinds' words from 40rem), a phone's two-line rows under it (the name the row's whole width under 15rem); each season record a cell of its own, two columns of cells from a 34rem panel (two lines from a 36rem cell and on a 59rem page, the `record-two` variant; three lines under it; one column under 16rem); the milestones' cells two columns from 26rem. The page is no wider than a 320px phone at 100%, 150% and 200% text (`e2e/phone-wraps.spec.ts`, `e2e/large-text-leaderboards.spec.ts`; the screen counts are in `docs/TEAM_LEADERBOARDS.md`). The `board-at-*` and `board-below-*` variants (globals.css) now serve the profile Overview's Recent form only.

## Device matrix

All Champions (27 Nov 2026): 1366 × 768, 1440 × 900, 1648 × 900 and 1920 × 1080, the sidebar open or
folded, are the one-screen workspace with the pane; 1280 × 800 folded and 1360 × 768 open too; 1280
× 800 open (1280–1355px wide with the sidebar open) is the workspace with the preview in the
workspace window (the sheet until 28 Nov 2026); a laptop's browser window (1366 × 657 in a 1366 × 768
screen, 1280 × 689 in a 1280 × 800 one, 1536 × 730 at 125%) is the workspace in its short form, every
state fitting, and so is 1366 × 736–767 with the sidebar open (a narrow section); 1024–1279px, windows under the band's height (1366 × 640, 1280 × 640), a 110% zoom on
a 1366 × 768 laptop, touch tablets held sideways (`pointer: coarse`), phones and a text size too
large for the gate are the flow.

`e2e/mobile-landscape.spec.ts` (run once, from the phone project) opens its own Chromium
contexts with Playwright's device descriptors (iPhone SE, iPhone 15, both ways round) and checks
the short-window rules above: one compact bar holding the four destinations (all named at 568px)
and no tab bar, a bar that gets out of the way and comes back (slow drags, focus
inside), a profile's bars at rest at most 90px (the sections a 44px row) with its band at most 80px
on one line at five sideways sizes (568 to 915px wide; Demo Top's and Demo Mid's, with the page's
scroll padding clearing the bar), the band's longest line (two off roles, the longest rank, the
lineup status and three links: 32px chips, 44px targets) and a member's own Overview with three
links beside Customise, the account screen from the avatar at every width, Admin Mode's compact bar
saying the mode, the title and the current destination leading back to the top at a tablet's width,
large text (the labels giving way at 38rem and 27rem of bar, by the bar's real width, and the
current destination kept in view, loaded sideways or turned to), whole-screen windows that
scroll as one with reachable 44px controls, dialogs that keep their title and actions on screen,
state kept across a turn of the phone, tab rows that fade and keep the current tab in view, ⓘ
targets, and the Branding save bar. Upright, it checks that the player window scrolls as
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
  - the phone window shell (S4a, 20 Nov 2026): a pull on a game's header closes it, closing a game
    opened from a row partly under the tab bar moves the list 0px, and the Team player window's
    header collapses to its 56px bar, which closes the window when pulled down (touch events
    dispatched in the page, `e2e/pull.ts`; Chromium's phone project runs the same in
    `e2e/overlay-kit.spec.ts`);
  - the top bar's Filters on Match History (PR 2b): gone at the top, offered once the page's own has
    scrolled away, 44px, a tap opens the filter sheet, and a choice and Done bring the first game
    under the bars, its count shown;
  - the one Select (20 Nov 2026): the iPhone keeps the browser's own select; in a desktop-sized
    WebKit window the app's popover draws the same figures as Chromium (`SELECT_LOOK`, with the
    touch sizes where Playwright's WebKit reports no fine pointer), opens and chooses from the
    keyboard, and Escape gives the focus back;
  - Card Studio's section tabs, a palette and Cancel;
  - the account screen: one tap opens it, at rest it fills the screen exactly with nothing in it
    scrolling, every control a row at least 48px tall reached by a tap where it is drawn, the screen
    holding the focus, the page left where it was (at the top and scrolled);
  - the Admin Mode switch;
  - fields at 16px or more (Safari zooms into smaller ones) and sign-in's password autofill attributes;
  - popups over windows, where Safari differs: a window opened by a tap holds the focus itself with
    nothing in it ringed, a tapped ⓘ in a game's window is drawn inside it and the first Escape
    closes the bubble alone, and an error toast over the picture editor is drawn in it, its dismiss
    button answering a tap where it is drawn;
  - the pages held sideways (Safari's tab, 734 × 343, and the whole screen, 852 × 393): one compact
    bar holding the destinations and no tab bar, a profile's sections under it and its band at most
    80px, the bar sliding away while reading;
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
  the sign-in window and the account dropdown on four phones (an installed app's
  whole screen, Safari's tab, the smallest iPhone, held sideways), an iPad and a Mac, and fails if a
  window's body shows less than its content (or 160px of it where it scrolls), if the account screen
  does not fill the screen with every control in reach and the page behind unmoved, or if a sheet
  on a phone leaves the bottom edge. Run on main's code from before the fix, 14 of its 26 checks fail,
  the account panel exactly as the owner saw it (377×95, one of six controls in reach); with the
  fix, all 26 pass. The tablet menu's check went with the drawer (frames by posture, 18 Nov 2026):
  25 checks since, the account dropdown's on the iPad covering the menu that holds its items.
  Playwright 1.58.2 builds WebKit for Ubuntu up to 24.04 (not 26.04), so the
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
- **A real iPhone** (by a person; nothing above covers it). Since Release 19 the owner's one list for a real iPhone, the installed app and Admin Mode is **docs/OWNER_CHECKLIST.md**, which merges these items; the list below is kept as the detail behind them:
  1. Add to Home Screen from Safari's Share menu: the icon and name come from Branding, and the app
     opens full screen with its content clear of the notch and the home indicator.
  2. Sign in inside the installed app (iOS keeps its cookies apart from Safari's), close it and
     open it again: still signed in.
  3. Turn the phone on Team, a profile and Resources: the layout follows; sideways one bar holds the
     destinations (no tab bar), a profile's sections under it, it slides away while reading and
     comes back on a scroll up, and nothing sits under the notch or the home indicator.
  4. Type in a field (display name, a Riot ID when linking an account): no zoom, and the keyboard covers
     neither the field nor its Save button.
  5. Swipe Team's cards: one card at a time with no other card beside it, past Support comes Top and
     before Top Support with nothing jumping (Safari's momentum included), the dots under the card follow,
     and an upward swipe still scrolls the page.
  6. Open and close a detail window and the Card Studio: the page behind does not move.
  7. Open the app with no connection: the offline notice shows.
  8. On an iPad, add to Home Screen and open it: Players shows the whole roster on one screen, two
     up, and a row opens its profile with one tap; Matches scrolls under the pinned Team
     tabs, a tab from there switches the section; a teammate's profile shows "‹ Players" in the top
     bar (the installed app has no browser Back) and it leads back; My Profile, Team, Champion Intel
     and Resources are each one tap in the top bar; the avatar's menu holds Settings, the mode switch, Sign out,
     the patch and Riot's notice (Install App too, outside the installed app).
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
- Fallbacks: hidden scrollbars carry the WebKit rule (`[&::-webkit-scrollbar]:hidden`) for a Safari
  without `scrollbar-width` (before 18.2), and the build adds the `-webkit-` prefixes for
  `backdrop-filter` and `mask-image`.

Since S8a (20 Nov 2026) the WebKit spec also opens the public pages and Install App in Safari's
tab on an iPhone 15 (no sideways scroll on `/public`, `/login`, `/recover` and `/privacy`; the
header's links 44px and 14px; the install window's iOS guide inside the screen, closed by Escape)
and as opened from the Home Screen (`navigator.standalone`: no Install App in the header).

