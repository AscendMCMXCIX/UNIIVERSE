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
| Detail windows (`DetailModal`) | whole screen below `sm`, centred window above | whole screen, scrolling as one: a large header scrolls away, its close and step buttons float at the top, a footer stays pinned |
| Dialogs (`Dialog`) | bottom sheet, at most the screen minus a strip | centred card, at most the screen minus 1rem; title and actions stay, only the body scrolls |
| Pickers (`ChampionPicker`) | whole screen | whole screen |
| Things pinned to the bottom (toasts, a save bar) | `bottom-tabbar`: above the tab bar | near the bottom edge |

Turning the phone keeps state: windows, filters and tabs live in the address or in component
state, never in the orientation, so a window open in one orientation is open in the other.

**Safe areas.** The viewport uses `viewport-fit=cover` and the installed app draws under a
translucent status bar, so:
- side gutters use `px-safe-4` / `px-safe-6` (the gutter, or the notch's inset where larger) for
  the top bar, `main`, the public page, toasts and whole-screen windows;
- whole-screen windows pad the status bar (`max-sm:pt-safe`) and the home indicator (`pb-safe`);
- the drawer pads the right-hand inset; the tab bar pads all three.

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
- `src/components/mobile-nav.tsx`: sticky top bar (brand, profile, menu), a drawer with all links,
  status rows and sign-out, and a bottom tab bar on phones (Profile, Team, Matches; Players
  and Leaderboards are Team tabs, Settings and Riot Accounts are in the account menu behind the
  avatar). Both bars pad for safe areas (`pt-safe`, `pb-safe`, `px-safe`); in short windows the
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
view, ⓘ targets, and the Branding save bar. These are emulated devices: they check layout, size
and behaviour in Chromium, not Safari's own toolbars, keyboard or rotation animation, which need a
real device.
