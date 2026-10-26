# Standards

How UNIIVERSE is built, so every change looks, reads and behaves like the rest of the platform.
CLAUDE.md says how a change is developed, tested and merged; this page says what it should be.
Where a rule has an automated check, the check is named. Detailed rules live in the pages linked
from each section; this page does not repeat them.

## Product

- Improve the product that exists. No revived features (Draft, Meta & Trends, Patterns & Notes),
  no features added to make the platform look bigger, no promotional clutter.
- Player Mode and Admin Mode stay separate. Administrative pages live under `/admin` in the
  `(admin)` route group; the server enforces every permission (see Security below), the interface
  only follows.
- The public team page and sign-in stay minimal. There is no public sign-up; administrators
  create accounts. `/login` stays as the plain fallback.
- White label: UNIIVERSE is this installation's name, not the software's. Text a visitor reads
  comes from Branding (`getBranding`) or speaks of "the team"; never write the installation's
  name, logo or colours into a component.
- Seasons: filters offer the supported seasons only (`FIRST_SEASON` and `offeredSeasons` in
  `src/domain/season.ts`); older history stays stored but is not offered.
- Riot: keep the required notices and the rules in [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md). Riot
  data is for signed-in team members: the public pages show no Riot ID or match, and no rank,
  statistic or Leaderboards unless `UNIIVERSE_PUBLIC_RIOT_DATA=true`, which is meant only for a
  Production key registered for it.

## Honest data

- Never show an invented value. Missing is "—", nothing recorded is said in words ("No games
  this season"), and a figure states what it covers (a season, a queue, the games that have the
  figure). A sample too small to mean much says so.
- Never present an uncertain identity or relationship as certain: what is only possible is
  labelled as possible (a match's possible groups, for example, never "premade").
- Explanations sit next to the figure (`InfoTip`, `Metric` labels from `src/domain/metrics.ts`),
  in plain language.
- How current a page's Riot data is goes in one place per page, in the fixed words of
  `src/domain/data-status.ts`: under the page's or section's heading, a quiet Refresh with the
  status one ⓘ away (`DataRefresh`, placed by `SectionHeader`), never a banner. Figures and cards
  carry no status marks of their own. A Refresh does something real (it reads Riot and re-reads
  the page) and says what happened, never "updated" for a click alone; where nothing can be
  refreshed (no right to, no Riot account Riot can be asked about, no Riot on the server) the ⓘ
  stands alone, with no button that does nothing.

## Design tokens

All values live in `@theme` in [src/app/globals.css](../src/app/globals.css); components use the
Tailwind classes they generate. `src/app/design-tokens.test.ts` refuses font sizes in px,
arbitrary values that equal a token (`text-[0.6875rem]` is `text-2xs`), Tailwind's names for the
panel and card radii, colours written as hex in a class, easing curves that are not tokens, and
uppercase labels spaced other than `tracking-label`. SVG charts drawn 1:1 in px keep their text in
px, so it fits the chart's fixed gutters; the test lists them.

**Colour** (semantic, never raw values):

| Token | Use |
| --- | --- |
| `bg`, `bg-elevated` | page background; menus and popovers above it |
| `surface`, `surface-2`, `surface-3` | panels and cards; inputs and raised rows; selected or hovered |
| `border`, `border-strong` | dividers and panel edges; inputs and emphasis |
| `fg`, `fg-muted`, `fg-subtle` | text: main, secondary, captions (`fg-subtle` is 4.5:1 on panels) |
| `accent`, `accent-strong`, `accent-2`, `highlight` | the brand (Branding can change `accent-2` and `highlight`) |
| `good`, `warn`, `bad`, `info` | states and outcomes; never the only signal (pair with text or an icon) |
| `blue`, `red` | the two sides of a match |
| `gold`, `violet`, `bronze`, `bronze-fg` | rarities and places (third place in bronze); never to set one statistic apart from its neighbours: multikill counts are plain `fg` like every other figure |
| `tier-iron` … `tier-challenger` | a ranked tier written as small text (an opponent's "E2" in a match card); each 5:1 or more on the panels |

Rank crests keep their own artwork and fallback colours (`rank-emblem.tsx`, `tierTextClass` for the text tokens), as do social brands (`brand-icons.tsx`).

**Type.** Tailwind's scale from `text-xs` (12px) up, plus `text-2xs` (11px: captions, column
headings, labels), `text-3xs` (10px: dense chips), `text-4xs` (9px: letters inside small tiles),
`text-md` (15px: a list row's primary value) and `text-figure` (28px: headline figures from `sm`
up). Sizes are rem, so they follow the reader's browser text size; the root size grows gently above
1536px wide (globals.css). Uppercase labels, eyebrows and section headings use `tracking-label`; a
small pill badge (`rounded-full`, such as "You") may stay at `tracking-wide`. The team's name as a
wordmark uses `tracking-wordmark`, and the Team page's backdrop name `tracking-tagline`. Numbers
that line up use `tabular-nums`.

**Space and shape.** Tailwind's 4px spacing scale. Radii: `rounded-sm` 4px (small controls),
`rounded-md` 6px (buttons, inputs), `rounded-lg` 10px (menus, chips), `rounded-panel` (panels),
`rounded-card` (cards, page sections, dialogs); not Tailwind's `rounded-xl` and `rounded-2xl`,
which are the same sizes under other names. Page widths: `--content-max` (text and card pages),
`--content-wide` (Team, statistics and data pages).

**Layers.** Inside a component: `z-0` to `z-10`. Sticky bars (top bar, sidebar): `z-40`. Drawers,
pickers and popovers: `z-50`. Menus and toasts: `z-[60]`. Tooltips: `z-[100]`. Detail windows and
dialogs are native `<dialog>` elements in the browser's top layer, above everything.

**Elevation.** Panels and cards lie flat on the page: a border, no shadow. What floats above it (a
menu, picker or popover, a card being dragged) is `bg-bg-elevated` with a border and `shadow-2xl`.

**Motion.** Short and purposeful: entrances 160 to 220ms with `--ease-emphasized`, exits about
140ms with ease-in, the sidebar with `--ease-glide`, the Team card's turn (460ms) with
`--ease-turn`. Script-driven animations use the same curves. Everything becomes instant for
`prefers-reduced-motion` (globals.css); decorative effects stop entirely.

## Components

Use the shared component before writing a new one (`src/components/ui`):

| Need | Use |
| --- | --- |
| Page title, eyebrow, actions | `PageHeader` |
| A titled section | `Panel`, `PanelHeader`, `PanelBody`, `SectionLabel` |
| A figure with its label and explanation | `Metric`, `MetricLabel`, `InfoTip` |
| Details over the page (a match, a player, a champion) | `DetailModal`; a custom `header` keeps clear of the close button's corner with `CLEAR_OF_CONTROLS` (content beside it) or `BELOW_CONTROLS` (content that starts under it), never a fixed padding |
| A question or a short form | `Dialog`, `ConfirmDialog` |
| Choices in a list | `Menu`, `MenuItem`, `MenuLink` |
| Filters | `FilterBar`, `RefineButton`, `FilterField`, `SearchInput`, `ToggleChip` |
| One choice out of a few (a role, a view, a sort) | `segmentedGroupClass` with `segmentClass`, `RoleSegmented` |
| Sections of a page | `TabBar`, `TabLinks`, `SubNav` |
| Buttons and links that look like buttons | `Button`, `buttonClass` (links never wrap buttons) |
| Fields | `Input`, `Textarea`, `Select`, `Label`, `Switch` |
| A section that opens and closes | `Disclosure` |
| A status or a tag | `Badge` |
| Nothing to show | `EmptyState` |
| Loading | `Skeleton`, `PageSkeleton` (route `loading.tsx`) |
| Saving | `SaveStatusIndicator`, `toast` |
| Images from Riot or another host | `RemoteImage`, `useImageFailure`, `ChampionPortrait`, `Avatar` |
| A time ago that stays current | `RelativeTime`, `useNow` |
| How current a page's Riot data is, and Refresh | `DataRefresh` (one per page; `usePlayerRefresh` in `refresh-store.ts` behind every Refresh of a player) |
| A section of Riot data's heading: title, scope line, Refresh, filters | `SectionHeader` |
| A player's identity on a card (picture and links, name, rank and labels, tagline) | `CardIdentity` (`players/player-card.tsx`) inside a `@container/card`; on Players, `layout="rows"` on the directory card's grid (`DirectoryCardLayout`) |

## Dates and numbers

Write them only through [src/lib/format.ts](../src/lib/format.ts): one form ("21 Oct 2026, 9:30
am") in the installation's time zone (`NEXT_PUBLIC_UNIIVERSE_TIME_ZONE`, Sydney by default), the
same on the server and in every browser. Counts use `formatCount`, decimals `formatNumber`, and a
count in a tight space `formatCompactCount` ("45K"). A relative time in a client component uses
`RelativeTime`, which updates after hydration. An ESLint rule refuses `toLocaleString`,
`toLocaleDateString`, `toLocaleTimeString` and the `Intl` formatters in pages and components;
`src/lib/format.test.ts` proves it fires.

## Images

Every image from another host has a designed stand-in (initials, a tier dot, a plain tile) and
never shows a broken-image glyph: use `RemoteImage` or `useImageFailure`, which also catch images
that fail before the page is interactive. Give images their width and height, load below-the-fold
ones lazily, and keep uploaded brand images small ([HOSTING_USAGE.md](HOSTING_USAGE.md)).

## Responsive and accessible

- Layouts follow [RESPONSIVE.md](RESPONSIVE.md): Tailwind's breakpoints, the `short:` variant for
  phones held sideways, safe areas, nothing wider than the screen from 320px up.
- Targets are at least 24px everywhere and 44px on touch screens (`pointer-coarse:`,
  `touch-target`, `Button` does it).
- Focus: every element the keyboard reaches shows the same accent ring (`:focus-visible` in
  globals.css); a control never removes it unless it marks focus another way (a text field's accent
  border). `e2e/quality.spec.ts` tabs through pages and checks.
- WCAG 2.2 AA: visible focus, text contrast of 4.5:1 (3:1 for large text and controls), labels on
  every control (an icon button has `aria-label`), headings in order, no meaning by colour alone,
  motion that respects reduced motion. Links inside running text are underlined.
- Valid nesting: no block inside a paragraph, no link inside a link or button. The browser
  rearranges such markup and the page fails to hydrate.

## Performance

- Targets on a phone: LCP 2.5s or less, INP 200ms or less, CLS 0.1 or less. How to measure:
  [PERFORMANCE.md](PERFORMANCE.md).
- Server components by default; a client component only for interaction. Heavy parts load when
  opened (`next/dynamic`, `AfterOpen`).
- Browser code never reaches server code, and large libraries load only when needed.
  `src/app/client-imports.test.ts` follows every `"use client"` module through its imports and its
  `import()` calls. It fails when one reaches Node's built-ins, the database, image or session
  libraries, or `src/server` (other than server actions and the shared modules it lists). It also
  fails when one imports `zod` directly instead of through `import()`, unless the
  module is listed with its reason.
- Nothing moves after it appears: reserve space for images and late content, and read browser-only
  state (local storage, the window size) without changing the height of what is already shown.
- Database reads select only the columns they use, above all on paths every page runs (the shell,
  the scheduler): the hosting plan's egress is limited ([HOSTING_USAGE.md](HOSTING_USAGE.md)).

## Security and privacy

- Every server action establishes who is asking before it does anything else (`requirePermission`,
  `requireSession`, ..., or `getSession` followed at once by a refusal when there is none).
  `src/server/actions/guards.test.ts` reads every `"use server"` module and fails for an action
  whose first asynchronous step is anything else; the few public ones (signing in, setup,
  recovery) are listed there with what protects them. Pages use `requirePageAccess`; hiding a
  control is never the protection.
- No secrets in URLs, logs, error messages or reports. Job endpoints take the secret in the
  `Authorization` header only.
- Database changes follow [DATABASE_PERMISSIONS.md](DATABASE_PERMISSIONS.md): grants in the
  migration that creates the table, Row Level Security on, no grants to the Data API roles
  (`src/server/db/migration-grants.test.ts`). Nothing destructive without a tested recovery path
  and the owner's approval.
- Personal data stays with the team: what is stored and for how long is on the privacy page; a
  public social icon appears only when its owner chose to show it.
- Browser storage (`localStorage`, `sessionStorage`, IndexedDB) holds per-viewer conveniences only
  (layout choices, recent picks, favourites), never personal data read or typed in the app.
- Code that stores Riot identities (match records, sync, linking an account) honours
  the erasure records (`erasureFilter`, `src/server/privacy/ledger.ts`), and log lines name
  accounts by id, never by Riot ID (`docs/PRIVACY.md`).

## Tests

- Pure logic: unit tests next to the code (`*.test.ts`, run by `pnpm verify`).
- Database and server logic: `tests/db`, against PGlite and real Postgres (CLAUDE.md).
- Pages: Playwright in `e2e/`, on a phone, a tablet and a desktop. Every browser test fails on an
  uncaught page error, hydration mismatches included (`e2e/test.ts`).
  `e2e/cross-device.spec.ts` covers another time zone and language, unreachable image hosts,
  invalid nesting, cut-off figures and target sizes; `e2e/quality.spec.ts` runs axe.
- A fix comes with the test that would have caught it.
