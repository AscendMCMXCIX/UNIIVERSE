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

## Shell

- `src/components/app-shell.tsx`: sidebar from `lg`; `MobileNav` below.
- `src/components/mobile-nav.tsx`: sticky top bar (brand, profile, menu), a drawer with all links,
  status rows and sign-out, and a bottom tab bar on phones (Profile, Team, Matches, Meta; Players
  and Leaderboards are Team tabs, Settings and Riot Accounts are in the account menu behind the
  avatar). Both bars pad for safe areas (`pt-safe`, `pb-safe`);
  the tab bar hides in short landscape viewports.
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
- `ChampionPicker`: full-screen sheet on phones, dialog from `sm`; body scroll is locked while open.

## Tables

Tables with more than four columns render as cards on phones and as the table from `md`:
Global data coverage, Data jobs and the player's champion proficiency table. Match history rows wrap
into cards. Trends rows wrap their statistics under the champion name.

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
