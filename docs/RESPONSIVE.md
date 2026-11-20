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
- A toast's dismiss button is 44px at every width, around its 16px mark: its negative margins reach
  into the toast's own padding, so the toast is no larger for it.
- Controls on a card (a flip button, social icons) stop their event: using one never opens,
  turns or selects the card.
- Rows of small targets stand far enough apart that no target's 44px area covers a neighbour's box
  (19 Nov 2026): Matchup Intel's chips and keys 12px apart from row to row and 6px side to side on
  touch screens (`CHIP_ROWS`), its folds and source tips likewise; `e2e/matchup-intel.spec.ts` samples
  every control's box on the phone and the touch tablet and runs axe's WCAG 2.2 target-size rule.

## Long lists inside a page

A list opened inside a page (a table under a `<details>`, an event list) runs with the page on a
touch screen: a box that scrolls inside a scrolling page catches the finger, and the page stops
moving. With a mouse or trackpad (`pointer-fine:`) it may keep a height limit and scroll in its box
(Match History's timeline tables and Ranked progress's readings do: `pointer-fine:max-h-64 pointer-fine:overflow-y-auto`, and
their header sticks only there). Windows and dialogs keep their one scrolling body (above).

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
| under 36rem (phones upright) | one swipe track, a card at a time, under the lineup pager (members: each tab the player's picture with the role as its badge and the name under it; the public page: the role's icon and name); the card's picture beside the name |
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
name and Show publicly and one for the field, shared with the Player Card Studio and the first
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
loads every member page (Team; Players; Matches; Leaderboards and Records; Resources, Matchup Intel
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
  `e2e/large-text-lineup.spec.ts`). A phone's card is as wide as the phone allows: 9.8, 7.9 and
  6.5rem at 150%, 175% and 200% on a 320px phone, where no card at the usual size is under 10.4rem
  (five across a 56rem lineup since S3a), so every threshold under 9rem applies to larger text only.
  - Under 9rem the season's figures wrap: the win rate on a line, KDA and CS/min (vision) under it,
    side by side where they fit; the wins bar keeps 2rem ("CS/MIN" ran 42px past the card at 200%).
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
  role's icon and the rank's crest, where a no-break space has nothing to hold it to). The Card
  Studio's previews of a row, drawn outside the roster and about 9rem wide at the usual size beside
  the controls on a 320 × 480 screen, keep their one layout, as they do for the stacked rows. The
  spec checks words whole on the demo's rows, nothing cut or past its row, every "·" either beside
  its role or cut off where the rank starts its line, at 100% and fourteen large sizes, and the
  Studio's previews at 100% on that screen drawn as before.
- **A profile's Overview** (`recent-form.tsx`, `profile-editor.tsx`, `player-overview.tsx`;
  `e2e/home-layout.spec.ts`, `e2e/large-text-roster-figures.spec.ts`). Recent form's twenty bars
  share the card's width with no floor in rem (61px past the card at 200% on 320px). The champion
  pools' column names wrap under "Champion" as the figures wrap under the name; under 8.5rem of
  list, where a row cannot hold the columns' 7.5rem, the figures take the row's width and name
  themselves in words, and the column names step aside. The season's figures go two across under
  17.5rem of card (three across needs 17.34rem with the widest figures: "6 champions" ran 63px past
  the card at 200% on 320px) and one across under 11.75rem (two across needs 11.66rem).
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

**The specs' sideways measure.** On the phone project (`isMobile`) Chromium widens the window to what
spills past it, so `scrollWidth - innerWidth` stays 0 whatever overflows; the large-text specs
measure against `document.documentElement.clientWidth` (so do phone-wraps and the public specs).

**At 100% nothing moves.** The six touched pages were compared with the base pixel by pixel at 320,
375, 768 and 1440 (Chromium with deterministic raster flags, images from other sites refused on both):
Team Overview, a profile's Overview, the Library and the public page are identical, the whole page;
Players and Leaderboards in every row of the demo's members (the base's server held four members
other tests had added, and the demo dates its games from each server's start: "17 Oct" there, "18
Oct" here). The lineup cards' two new wrappers (the chip's lane and its label) draw nothing there.

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
    2026: My Profile, Team, Matchup Intel and Resources; in Admin Mode Dashboard, Users & Permissions,
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
  sidebar open and from 1600px with it folded; Team Matches' list stays at `--content-max`,
  left-aligned. The route's loading state takes the width `pageWidthOf` gives its address (a Team
  section's own, else 80rem): Players and a teammate's profile share `players/loading.tsx`, which reads
  the address it stands in for, and Team Matches' own `matches/loading.tsx` stands as its page does
  (Team's width from 1600px, its filter row and cards at `--content-max`, left-aligned).
- **Matchup Intel on one screen** (the owner's request of 18 Nov 2026; docs/MATCHUP_INTEL.md, "The
  dashboard"): the page takes `--content-wide`, its two columns from a body 60rem wide, each as tall
  as its content. Its whole overview fits one viewport with no page scroll at 1920 × 1080, 2560 ×
  1440 and 1920 × 950 for every one of the 880 pages of the sweep of 19 Nov 2026 (every champion as
  the enemy against Riven, Gwen, Ambessa, K'Sante and Briar, and the 30 pairs of the six champions with
  checked notes; the least room left 56px at 1920 × 950), and at 1440 × 900, a size it is not promised
  to fit, for 874 of them (the tallest six scroll by 5 to 58px; docs/MATCHUP_INTEL.md, "The
  dashboard"); on production's patch 26.23 (Riot's Data Dragon 16.23.1, the notes "Not re-checked"),
  for all 546 pages of a second sweep at the first three sizes, and 526 at 1440 × 900; in a smaller
  window, or at a larger text size, it reflows and scrolls as a page, with
  nothing clipped and nothing scrolling inside it. `e2e/matchup-intel-dashboard.spec.ts` asserts the
  fit at five sizes (3440 × 1440 too) for 40 pairs, the tallest of the sweep among them.
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
- A section that folds on phones: `Disclosure` (`ui/disclosure.tsx`, a native `<details>`) or a CSS
  breakpoint. The former `MobileSection` was removed. A Disclosure inside another (Data &
  Integrations' Advanced, inside Details) turns its chevron only for its own `<details>`.
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
game is 1.9–2.0 screens; no tabs anywhere.

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
figures at 1536 and 1680px. All Champions' preview (S5, 19 Nov 2026; docs/MATCHUPS.md) replaces the
champion window: at 1280, 1440 and 1920 it unfolds inside the list's card over the columns after Win
rate (Champion, Games and Win rate keep their x to the pixel, the page does not scroll, rows keep
their height: 0px moved at all three widths on the demo); with under 26rem beside Win rate, and on
screens from 768 to 1023px wide, the shared Peek's docked panel; under 768px (the phone's frame, with
a mouse as with touch) and on short windows its sheet. The wide (76rem) tier drops the Kills column (it sorts like Games; per-game kills are in KDA;
CM AC-11, reversible: OD20). `e2e/champion-preview.spec.ts` checks the geometry, ↑/↓, Back and
Escape at 1440, the content and old addresses on all three projects, and the sheet (phone) and docked
panel (tablet).

The player Peek's pool list (Team, Players, Leaderboards; `PoolChampionTile`) takes its columns
(Win rate, Games, KDA, CS/min or Vision) from its own width, 28rem or more (`@container/pool`), and
below that each champion's figures in a short block. Until 20 Nov 2026 the columns came from a 640px
screen, and the docked panel at 1280 (a 25rem list) cut the names to "A.." with the headings running
together; the 1440 panel (28.6rem) keeps the columns. `e2e/players-directory.spec.ts` checks 1280.

## Tests

`pnpm build && pnpm test:e2e` runs `e2e/responsive.spec.ts` on phone (375), tablet (768) and
desktop (1440) against a production build on an in-memory database with the demo roster, which
reads Riot's Data Dragon at the version the curated Matchup Intel notes were checked on
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
within 1px on each section of its set (Team's, Platform Settings', a profile's,
Match History's views, Users & Permissions'), and at 1920 × 1080 with the sidebar
folded the bars of `main`'s own (Team's, Platform Settings'), measured once the page
itself has replaced its loading state: the row in the same place on all of a set's sections, Team's
name ending at the column's right edge, the bar's line spanning the room, and on Team Overview the
header centred in Team's column; under a 1600px window (1536 × 864, the sidebar folded) Players and
Matches stay 80rem and the row spans the bar, as before; at a tablet's width held sideways
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
on critical or serious violations, and again at 1920 on Team's four sections, Matchup Intel and
Resources, where the section tabs' row takes the pages' width, and at 1440 × 600 with a page's compact controls
showing in the pinned row (Team Matches, a profile's Overview, Match History, Encounters).
Panel layouts that live in variable-width columns use container queries (`@container`, `@xl:`) rather than viewport breakpoints.
For example, Team Matches' cards take their four columns from their list's width (`@container/tm`, from 58rem), because the sidebar beside the list takes 4.5 or 16rem of the same window (`e2e/played-together.spec.ts`); inside a card the members go two to a row from a 34rem column of their own (`@container/members`: a tablet's stacked card, or the four columns beside the open sidebar at 1440), and from sm a member's CS and damage show where the member's row is 19rem (`@container/member`): beside the role and champion where both fit whole, on a line of their own under them otherwise, so a long role and champion ("Role unknown · Nunu & Willump", the longest the game can show) is never cut for them. On narrower cards the result, its game and the count of members are one line of words that wraps, the bookmark in the corner; on a phone's card the count is read out only.
Leaderboards (one page since 19 Nov 2026: Recent form, then the season's records and achievements, no views) places its four boards by the page's own width (`@container/dash`): one column under 59rem (phones upright and sideways, tablets; with the index of the sections below Recent form, `SectionIndex`), Recent form across the page (at most the measure) with the season records beside the multikills from 59rem (1280 and 1440 wide, the sidebar open or folded), from 86rem (1920, 2560 and 3440 wide, 1512 with the sidebar folded) two columns, each board under the one before it in its own whatever the other column holds: Recent form (at least 58.25rem, so its board keeps its one-line rows inside its border) with the milestones under it, the season records beside it with the multikills under them (the second grid row is flexible, so a taller records panel, a member's own bests, lengthens its own column and never leaves a gap under Recent form). Each board's rows follow the board's own width (`@container/list`): Recent form's tiers as above; each season record is a cell of its own (`@container/list` on the cell, its column template inside it, so a record reads the same wherever it stands): two lines beside the picture from a 36rem cell, three lines under it, one column under 16rem (a phone at 150% or 200% text); the records' panel gives its cells two columns from 40rem while the page is under 86rem (a tablet either way round, a phone held sideways, 1440 wide; one column in the column beside Recent form), the seventh across both; a member's multikills one line from a 21rem list, a member's milestones one line from 40rem. The page is no wider than a 320px phone at 100%, 150% and 200% text (`e2e/phone-wraps.spec.ts`; the screen counts are in `docs/TEAM_LEADERBOARDS.md`).

## Device matrix

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
  - the top bar's Filters on Match History (PR 2b): gone at the top, offered once the page's own has
    scrolled away, 44px, a tap opens the filter sheet, and a choice and Done bring the first game
    under the bars, its count shown;
  - the one Select (20 Nov 2026): the iPhone keeps the browser's own select; in a desktop-sized
    WebKit window the app's popover draws the same figures as Chromium (`SELECT_LOOK`, with the
    touch sizes where Playwright's WebKit reports no fine pointer), opens and chooses from the
    keyboard, and Escape gives the focus back;
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
- **A real iPhone** (by a person; nothing above covers it):
  1. Add to Home Screen from Safari's Share menu: the icon and name come from Branding, and the app
     opens full screen with its content clear of the notch and the home indicator.
  2. Sign in inside the installed app (iOS keeps its cookies apart from Safari's), close it and
     open it again: still signed in.
  3. Turn the phone on Team, a profile and Resources: the layout follows; sideways one bar holds the
     destinations (no tab bar), a profile's sections under it, it slides away while reading and
     comes back on a scroll up, and nothing sits under the notch or the home indicator.
  4. Type in a field (display name, a Riot ID when linking an account): no zoom, and the keyboard covers
     neither the field nor its Save button.
  5. Swipe Team's cards: one card at a time, and an upward swipe still scrolls the page.
  6. Open and close a detail window and the Card Studio: the page behind does not move.
  7. Open the app with no connection: the offline notice shows.
  8. On an iPad, add to Home Screen and open it: Players shows the whole roster on one screen, two
     up, and a row opens its profile with one tap; Matches scrolls under the pinned Team
     tabs, a tab from there switches the section; a teammate's profile shows "‹ Players" in the top
     bar (the installed app has no browser Back) and it leads back; My Profile, Team, Matchup Intel
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

