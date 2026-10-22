# Responsive design

UNIIVERSE is used on phones straight after a game, on tablets at the desk and on laptops and
large monitors. One set of breakpoints (Tailwind's defaults) is used everywhere:

| Range | Name | Shell | Layout rules |
| --- | --- | --- | --- |
| < 640px | small phone | top bar + drawer, bottom tab bar | one column, 44px targets, 16px inputs, full-screen pickers |
| 640–767px | large phone | same | one column; some header rows become two columns |
| 768–1023px | tablet | top bar + drawer (no tab bar) | two columns where useful |
| 1024–1279px | laptop | sidebar | desktop layout |
| ≥ 1280px | desktop | sidebar | desktop layout, wider content |

Class prefixes: `max-md:` = phones, `md:` = tablet and up, `lg:` = sidebar, `xl:` = wide desktop.
Touch devices of any width also get 44px buttons (`pointer-coarse:`).

## Phones held either way

Width decides the layout; height decides how much may stay pinned. A **short window** is one under
480px tall: in practice a phone held sideways (320–430px tall). Tailwind has a `short:` variant for
it (`globals.css`), and every pinned element follows these rules:

| Element | Upright phone | Short window (phone sideways) |
| --- | --- | --- |
| Top bar | sticky | slides away while the page scrolls down; back on any scroll up, at the top, and while it holds focus |
| Tab bar | fixed at the bottom | hidden; `main` keeps only the home indicator's inset (`pb-tabbar`) |
| Detail windows (`DetailModal`) | whole screen below `sm`, centred window above; one whose header would fill over 40% of a phone's screen (the Team player window on a small phone) scrolls as one, as in a short window | whole screen, scrolling as one: a large header scrolls away, its close and step buttons float at the top, a footer stays pinned |
| Dialogs (`Dialog`) | bottom sheet, at most the screen minus a strip | centred card, at most the screen minus 1rem; title and actions stay, only the body scrolls |
| Pickers (`ChampionPicker`) | whole screen | whole screen |
| Things pinned to the bottom (toasts, a save bar) | `bottom-tabbar`: above the tab bar | near the bottom edge |

Turning the phone keeps state: windows, filters and tabs live in the address or in component
state, never in the orientation, so a window open in one orientation is open in the other.

**Safe areas.** The viewport uses `viewport-fit=cover` and the installed app draws under a
translucent status bar, so:
- side gutters use `px-safe-4` / `px-safe-6` (the gutter, or the notch's inset where larger) for
  the top bar, `main`, the public page, toasts and whole-screen windows;
- whole-screen windows pad the status bar (`max-sm:pt-safe`) and the home indicator (`pb-safe`); a window that scrolls as one on a phone keeps a bar over the status bar, so text never scrolls under the clock;
- preview pages (Admin → Previews) leave room for their fixed "Preview" badge (`PREVIEW_PAD_TOP`);
- the drawer, which opens from the left, pads the left-hand inset; the tab bar pads all three.

## Touch targets

- 44px on touch screens (`pointer-coarse:`), 24px minimum everywhere (WCAG 2.5.8).
- Small marks keep their look and get a bigger target: the ⓘ (`InfoTip`) is a 24px button around
  its 16px mark (negative margins keep the line), with an invisible 40px area on touch screens;
  inline text links use `touch-target`.
- Close buttons of dialogs, windows and pickers are 44px on touch screens.
- Controls on a card (a flip button, social icons) stop their event: using one never opens,
  turns or selects the card.

## Rows that scroll sideways

Tabs and chip rows that do not fit scroll sideways inside themselves (never the page) with
`ScrollRow` or `useScrollEdges` (`ui/scroll-row.tsx`): an edge fades (`scroll-fade-x`) only where
more is hidden, and the current item is kept in view. The Team tabs share the width when they
fit (iPhone 15 and wider) and scroll on narrower phones.

## Shell

- `src/components/app-shell.tsx`: sidebar from `lg`; `MobileNav` below.
- `src/components/mobile-nav.tsx`:
  - a sticky top bar: the menu at its left end, then the brand and the profile;
  - a drawer from the left (the sidebar's side) with all links, status rows and sign-out;
  - a bottom tab bar on phones: Profile, Team, Scout and Resources, the sidebar's four entries.
    - Players, Leaderboards and Matches are Team's own tabs, so Team stays marked on them.
    - Settings and Riot Accounts are in the account menu behind the avatar.
    - The current tab's icon sits in an accent pill and its label is bright, so it does not rely on colour alone. Both bars pad for safe areas (`pt-safe`, `pb-safe`, `px-safe`); in short windows the
  tab bar is hidden and the top bar slides away while reading (see above).
- `main` pads for the tab bar (`pb-tabbar`) so content never hides behind it.

## Primitives

- `Button`: desktop heights unchanged; `max-md:min-h-11` and `pointer-coarse:min-h-11`.
- `Input`, `Select`, `Textarea`: 44px and 16px text on phones (iOS does not zoom a 16px field),
  36px / 14px from `md`.
- `ToggleChip` (`ui/toggle.tsx`): every selectable chip (roles, modes, filters).
- `MobileSection` (`ui/mobile-section.tsx`): collapsible below a breakpoint, always open above it,
  with no hydration flash (the first render leaves the decision to CSS).
- `PanelHeader` wraps its actions; `Panel` is `min-w-0` so grids never force page overflow.
- `ChampionPortrait` images carry width/height, `loading="lazy"` and `decoding="async"`.
- `ChampionPicker`: full-screen sheet on phones and in short windows, dialog from `sm`; body scroll is locked while open.

## Tables

Tables with more than four columns render as cards on phones and as the table from `md`:
Data jobs and the player's champion proficiency table. Match history rows wrap into cards.

## Tests

`pnpm build && pnpm test:e2e` runs `e2e/responsive.spec.ts` on phone (375), tablet (768) and
desktop (1440) against a production build on an in-memory database with the demo roster. It
checks: no horizontal overflow on every page, navigation (tab bar, drawer, sidebar), 44px targets
and 16px inputs on phones, and the champion picker on the player profile.
In this repository's sandbox set `PW_CHROMIUM_PATH` to the Chromium binary.

The wider audit script that produced the before/after numbers (eight viewports × twelve routes,
overflow in pixels, small targets, sub-16px inputs) lives outside the repo; its findings are in
the responsive pass report.

## Phase 3 checks

`e2e/quality.spec.ts` loads every player page at 320×640, 375×667, 390×844, 430×932, 768×1024,
1024×768, 1366×768, 1440×900, 1920×1080, 844×390 (phone landscape) and 1366×600 (short laptop)
and fails on any horizontal overflow or a missing heading; admin pages at five widths. The
same file runs axe (WCAG 2.1 A/AA) on every page and fails on critical or serious violations.
Panel layouts that live in variable-width columns use container queries (`@container`, `@xl:`) rather than viewport breakpoints.

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
  (`e2e/install-app.spec.ts`: Share → Add to Home Screen, in-app browsers). Layout and behaviour,
  in Chromium.
- **Safari's engine** (by hand): `e2e/webkit.spec.ts`, in the `webkit` project that exists only
  with `E2E_WEBKIT=1`. Run it with the WebKit workflow (Actions → WebKit → Run workflow, about 8
  billed minutes), or locally after `pnpm exec playwright install webkit` with
  `pnpm build && E2E_WEBKIT=1 pnpm exec playwright test --project=webkit`. On an iPhone-sized,
  touch WebKit it checks:
  - the priority pages load with no page error (hydration included) and no sideways scrolling;
  - Team's card track and role tabs, by tap;
  - a teammate's profile sections and a champion's window;
  - Clash Scout reading both screenshots into five cards;
  - the Card Studio's section list, a palette and Cancel;
  - the Admin Mode switch;
  - fields at 16px or more (Safari zooms into smaller ones) and sign-in's password autofill attributes;
  - the pages held sideways;
  - the Home Screen metadata: `apple-mobile-web-app-*`, the touch icon, the manifest and `viewport-fit=cover`.

  This is WebKit as Playwright builds it for Linux: Safari's engine, not Safari on an iPhone.
  **Status, 21 Oct 2026:** the spec passes in Chromium with the same iPhone settings; its first
  WebKit run is still to be done (WebKit is not installed in the development container).
- **A real iPhone** (by a person; nothing above covers it):
  1. Add to Home Screen from Safari's Share menu: the icon and name come from Branding, and the app
     opens full screen with its content clear of the notch and the home indicator.
  2. Sign in inside the installed app (iOS keeps its cookies apart from Safari's), close it and
     open it again: still signed in.
  3. Turn the phone on Team, a profile and Clash Scout: the layout follows, the tab bar steps aside
     sideways, and nothing sits under the notch.
  4. Type in a field (display name, a Riot ID in Clash Scout): no zoom, and the keyboard covers
     neither the field nor its Save button.
  5. Swipe Team's cards and Clash Scout's opponents: one card at a time, and an upward swipe still
     scrolls the page.
  6. Paste a screenshot into Clash Scout from Photos (copy, then paste), and choose one with the
     file button.
  7. Open and close a detail window and the Card Studio: the page behind does not move.
  8. Open the app with no connection: the offline notice shows.

**Browser features against Safari 16.4** (reviewed 21 Oct 2026). Tailwind v4 and Next.js 16 need
Safari 16.4 or later, so that is the floor. Nothing the app uses needs more:
- Script: no `requestIdleCallback`, `Object.groupBy`, `Promise.withResolvers`, Set methods, the
  Popover API, View Transitions or anchor positioning.
- CSS: container queries, `:has()`, `dvh`, `lh`, `color-mix()`, `inert` and `<dialog>` all work from
  16.4.
- Fallbacks: hidden scrollbars carry the WebKit rule (`[&::-webkit-scrollbar]:hidden`), and the
  build adds the `-webkit-` prefixes for `backdrop-filter` and `mask-image`.

