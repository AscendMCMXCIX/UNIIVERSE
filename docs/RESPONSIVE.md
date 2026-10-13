# Responsive design

UNIIVERSE is used on phones straight after a game, on tablets at the desk and on laptops and
large monitors during a draft. One set of breakpoints (Tailwind's defaults) is used everywhere:

| Range | Name | Shell | Layout rules |
| --- | --- | --- | --- |
| < 640px | small phone | top bar + drawer, bottom tab bar | one column, 44px targets, 16px inputs, full-screen pickers |
| 640–767px | large phone | same | one column; some header rows become two columns |
| 768–1023px | tablet | top bar + drawer (no tab bar) | two columns where useful (draft room: board + grid / recommendations) |
| 1024–1279px | laptop | sidebar | desktop layout |
| ≥ 1280px | desktop | sidebar | draft room three columns (board / grid / recommendations) |

Class prefixes: `max-md:` = phones, `md:` = tablet and up, `lg:` = sidebar, `xl:` = full draft room.
Touch devices of any width also get 44px buttons (`pointer-coarse:`).

## Shell

- `src/components/app-shell.tsx`: sidebar from `lg`; `MobileNav` below.
- `src/components/mobile-nav.tsx`: sticky top bar (brand, profile, menu), a drawer with all links,
  status rows and sign-out, and a five-tab bottom bar on phones (Team, Draft, Players, Matches,
  Trends; Settings lives in the drawer). Both bars pad for safe areas (`pt-safe`, `pb-safe`);
  the tab bar hides in short landscape viewports.
- `main` pads for the tab bar (`pb-tabbar`) so content never hides behind it.

## Primitives

- `Button`: desktop heights unchanged; `max-md:min-h-11` and `pointer-coarse:min-h-11`.
- `Input`, `Select`, `Textarea`: 44px and 16px text on phones (iOS does not zoom a 16px field),
  36px / 14px from `md`.
- `ToggleChip` (`ui/toggle.tsx`): every selectable chip (roles, sides, modes, series length).
- `MobileSection` (`ui/mobile-section.tsx`): collapsible below a breakpoint, always open above it,
  with no hydration flash (the first render leaves the decision to CSS).
- `PanelHeader` wraps its actions; `Panel` is `min-w-0` so grids never force page overflow.
- `ChampionPortrait` images carry width/height, `loading="lazy"` and `decoding="async"`.
- `ChampionPicker`: full-screen sheet on phones, dialog from `sm`; body scroll is locked while open.

## Draft room

Phones (one column, in this order): sticky current-action bar (phase, step, side, No ban) →
recommended pick/ban with Lock, decision badge and reasons → alternatives (two, rest collapsible)
→ compact board (BLUE B1–B5 | RED R1–R5 with bans rows; tap our row to pick for that role) →
search and champion grid (collapsed unless it is the enemy's turn) → projected team, pinch
warnings, why-not, pinned, overrides and enemy players as collapsible sections.

Tablets: board + grid on the left, recommendations on the right. Desktop: unchanged three columns.

## Tables

Tables with more than four columns render as cards on phones and as the table from `md`:
Global data coverage, Data jobs and the player's champion proficiency table. Match history and
draft history rows wrap into cards. Trends rows wrap their statistics under the champion name.

## Tests

`pnpm build && pnpm test:e2e` runs `e2e/responsive.spec.ts` on phone (375), tablet (768) and
desktop (1440) against a production build on an in-memory database with the demo roster. It
checks: no horizontal overflow on every page, navigation (tab bar, drawer, sidebar), 44px targets
and 16px inputs on phones, the champion picker on the player profile, and a draft room action.
In this repository's sandbox set `PW_CHROMIUM_PATH` to the Chromium binary.

The wider audit script that produced the before/after numbers (eight viewports × twelve routes,
overflow in pixels, small targets, sub-16px inputs) lives outside the repo; its findings are in
the responsive pass report.
