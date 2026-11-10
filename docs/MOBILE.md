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

Every phone page has the same three parts, so a member always knows where they are and how to get
anywhere else:

1. **The top bar** (sticky): the team's mark on a destination's own page, or **Back** on a page
   reached from one (a teammate's profile, Settings), labelled with where it leads ("‹ Players",
   "‹ Team Leaderboards"). Once the page's own heading has scrolled up under the bar, the bar shows
   its words (the player's name, "Team Leaderboards"), so the title is in view however far down you
   are (the iOS large-title pattern). At its right end, your avatar opens the account sheet.
2. **The bottom tab bar** (fixed, within reach of the thumb): **Team, Players, Leaderboards,
   Matches, Profile**, each one tap from anywhere (`PHONE_TABS` in `src/lib/nav.ts`, at most five,
   those the account may open). The current tab's icon sits in an accent pill and its label is
   bright, so it never relies on colour alone. The Profile tab shows your own picture when you have
   one. A teammate's profile belongs to Players; your own profile's sections to Profile.
   Tapping the current tab on its own page goes back to the top, and so does tapping the page's
   title once it has moved into the top bar (docs/DESIGN_SYSTEM.md, "The navigation contract").
3. **The account sheet** (from the avatar, a sheet from the bottom edge): who is signed in, then
   tiles, an icon over a name, three to a row (up to six on a phone held sideways): the pages the tab
   bar does not hold (Resources when it has no tab, as an account with the Team pages has five tabs
   already; in Admin Mode the admin pages without a tab), Settings and Install App; then the switch
   between the modes beside Sign out, and one quiet line with the patch and Riot's notice. It
   replaces both the menu drawer and the account dropdown on phones, and fits one short screen
   (about 270px, 350px in Admin Mode, on a 320 × 568 phone too): it once listed everything as
   full-width rows, which in Admin Mode ran below the sheet's own scroll on small phones and made a
   phone held sideways a scrolling window (#265).

Tablets keep the menu drawer (a modal dialog), the account dropdown and the page tabs
(`SectionTabs`, pinned at the top of the page once it scrolls, as a profile's sections are, so they
stay in reach as on a phone); the bottom bar and the account sheet are phones only. The installed
app on a tablet, which has no browser Back, gets the same Back in its top bar as a phone.

### Back

Back is predictable: it goes where the member came from, by the browser's own history, so their
place on that page (its scroll, its open filters) is kept. `MobileNav` remembers the pages visited
in this tab since the app opened and names Back after the previous page's heading ("‹ Demo Mid").
A page opened directly (a link from elsewhere, a reload, the installed app's start) has no page
before it, so Back leads to the page above it instead (`phoneParent`: a teammate's profile → Players,
Settings → home). A destination's own pages have no Back: they are where you start.

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
- **A page's views** (Match History's Games and Encounters, Leaderboards' Recent form and Records &
  achievements) share one quiet track (`SubTabs`). A label too long to share the line on a phone
  shows its start ("Records"); the rest is still read out, so its name does not change.

### Phones held sideways

Short windows (480px tall or shorter) keep both bars, compact, and slide them away while the page
scrolls down; any scroll up brings them back. Nothing is lost when a phone turns.

## 3. Data presentation

The rule: **the first screen answers the question the page exists for**, and more is one obvious
tap away. Nothing is removed from the product: what a phone leaves out of a list is in the detail it
opens.

| Page | Phone layout | Height at 390px (`main` at f4e5372 → this redesign) |
|---|---|---|
| Players | One list, a row per player: picture in its frame, the name in the player's own style with their emblem, primary role (its icon in the card's colour) and rank, their tagline on one line, the pool as many whole portraits as fit plus a count, and the status that matters (Lineup, Setup incomplete, Archived). A row carries the card's colours but no art, frame or effect. The row opens the profile (the card, links and every pool). Cards from `sm` up. | 2,966 → 1,227px |
| Leaderboards | Built for phones in #188 (docs/LEADERBOARDS_MODEL.md), rebuilt as rows in PR 5a: Recent form is one board with a two-line row per member: the place (a bracket joins shared places, "4="), the picture with the main role as a badge on it, the name and "You" with the win rate at the right end, then the record and dates, with the gap ("1 win behind", "Next win: 3=") at the line's right end under the win rate (on a line of its own, still at the right, when the dates or the gap are long: most rows at 360–375px), and the record's 20-game bar as a 2px line along the row's foot. Members with too few recent games are the board's last group, a row each with the games they need. The data status ⓘ ends the scope line. Records & achievements are the season's records, the multikills and the milestones. The frame adds the tab, the title in the bar and Back; the whole row is one link to the member's profile. | 1,093 → 1,037px (#188); 1,004 → 920px (PR 5a, rows 61–106 → 64px from 390px, 64–74.5px at 360–375px) |
| Matches | Each game: result, length, queue and date, then the members who played (champion, role, multikill, K/D/A). Both full teams are in the game's screen, where the scoreboard lists all ten. Bookmarked sits beside Filters. | 2,330 → 1,528px |
| Match History | Each game: the result line, the champion and role on one line, K/D/A with its ratio and largest multikill, kill participation, CS and damage, then the build. Both teams move to the game's screen. Ten games a page. | 2,268 → 2,000px |

Lists are **rows in one panel with hairline dividers** (people, a board's members): a single
surface, not a card per item. **Games stay cards**: each is an object with its own result colour
and opens a screen of its own.

Typography follows STANDARDS.md (Type): a row's primary value is `text-md` (15px) semibold, its
context `text-xs` (12px) in the secondary grey, figures right-aligned in `tabular-nums`. No running
text below 12px; 11px (`text-2xs`) only for badges and labels.

## 4. Interactions

| Need | Phone pattern | Why |
|---|---|---|
| Narrow a list | **Filters** opens a sheet from the bottom edge with every filter, each with its label, and Reset and Done at its foot (`FilterBar`). Beside the button, what is narrowed shows as chips that remove themselves with a tap. A search box shares the row with Filters. Choices apply at once, as on desktop. | The scope stays visible without opening anything; the sheet is within reach of the thumb and never pushes the page around. |
| Open a game | The game takes the whole screen (the match window), as a new entry in the browser's history, so Back (the button, the edge swipe, Android's key) closes it and returns to the list exactly as it was. Its scoreboard keeps the marks for players met in other games; following one closes the game, and Back returns to it. | A scoreboard inside a list is a detour on a narrow screen. Desktop keeps the game under its card. |
| A champion, a player from Team | The existing detail windows, which already take the whole screen on phones. | |
| Account, Settings, Sign out | The account sheet. | One menu, not two. |
| A short question or form | `Dialog`: the same sheet as every other (built on `DetailModal`). | One sheet: one look, one motion, one height rule. |

Every sheet and window shares `DetailModal`: native `<dialog>` (focus kept inside, the page behind
inert), Escape and the backdrop close it, focus returns to what opened it, a sheet slides up in
220ms with `--ease-emphasized` and out in 140ms (instant with reduced motion). A sheet:
- is docked to the bottom edge on phones and in short windows (a phone held sideways, where it
  spans up to 44rem), and is a compact centred window on taller wider screens;
- is as tall as its content, up to the screen less a strip of the page above it, measured in small
  viewport units (`svh`), so Safari's toolbars sliding in and out never resize it under the finger;
- keeps its header and footer in place, and only its body scrolls when it must (never the whole
  sheet, never a scroll inside a scroll);
- keeps its last line at least 1rem from the bottom edge, more where a home indicator is;
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
| Frame | Top bar 52px plus the status bar's inset (a profile adds its 44px sections row); tab bar 56px plus the home indicator's inset; the top bar sets the page's `scroll-padding-top` to its measured height and `scroll-padding-bottom` clears the tab bar, so whatever scrolls into view (anchors, the keyboard's focus) stays clear of both bars (WCAG 2.4.11). |
| Gutters and spacing | 16px gutters (`px-safe-4`), 12–16px between sections; rows 12–14px horizontal padding, at least 64px tall when they carry two lines and a picture. |
| Surfaces | One panel per list, hairline dividers inside; cards for objects that open (games); no frame around a single group that already has one. Colour and gradient are kept for meaning (a game's result, a selected tab). |
| Touch targets | 44px for everything a finger presses (tabs, rows, chips through `touch-target`, sheet rows 48px). |
| Titles | One `h1` per page; on phones the page tabs and the bar's title say where you are, so instructions under a title are left out (`PageHeader guide`), while a scope line ("Season 2026 · 6 games") always shows. |
| Interactive states | Pressed rows darken to `surface-2` (`active:`); the current tab, section or view is marked twice (colour and a pill, bar or weight); narrowed filters are accent chips; focus keeps the accent ring everywhere. |
| Loading, empty, errors | Unchanged components: `Skeleton`, `EmptyState`, `PageError`; the match window shows its skeleton until the game has loaded. Results of actions are toasts, which sit above the tab bar (`bottom-tabbar`) and follow it down when it slides away. |
| Motion | Bars slide 200ms ease-out in short windows; sheets as above; the title fades in 150ms. Everything respects reduced motion. |

## 6. Verifying

- `pnpm verify` (unit tests include the phone tab bar, `currentTab`, `profileBase` and `phoneParent`
  in `src/lib/nav.test.ts`).
- `pnpm build && pnpm test:e2e`: `e2e/mobile-nav.spec.ts` checks the frame on a phone (the five
  tabs, Back and its label, the title, the profile's sections, the account sheet, the filter sheet
  and chips, a game opening full screen and Back closing it, the Players and Recent form rows); `e2e/responsive.spec.ts`,
  `e2e/mobile-landscape.spec.ts` and `e2e/quality.spec.ts` keep overflow, targets, short windows
  and axe in check at every width.
- Real devices: see RESPONSIVE.md → Safari and iPhones. Emulated phones prove layout and behaviour
  in Chromium, not Safari's own toolbars or gestures.
