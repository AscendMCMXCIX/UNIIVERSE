# UX consistency, layout and Leaderboards: the plan (November 2026)

The brief asked for consistent layout across the platform, a calmer sidebar, a denser All
Champions, one way to open a game, and simpler Leaderboards. This page records what the audit
found, the decisions taken, what changed, and what still waits for a decision. The lasting rules are
in [STANDARDS.md](STANDARDS.md) (Page layout, the `chrome` token, the component table).

## 1. What the audit found

The demo app was rendered at 1440, 768 and 375px wide, and its pages were measured: widths, heading
sizes, row heights and where the columns fall.

| Area | Finding | Root cause |
|---|---|---|
| Opening a game | Match History opened a game under its card; Team → Matches opened it in a window with its own scrolling body. The breakdown inside was shared, but the two pages had separate states and interactions. | Two containers for one breakdown. |
| Sidebar | The frame used `bg-elevated` (the blue-tinted step meant for menus and popovers). The current page was marked three times in the accent: a tinted background, an accent bar and an accent icon. | No token for the app's frame, so the accent became the frame's colour scheme. |
| All Champions | Rows were 57px on a laptop and 74px on a tablet, where the In pool tag wrapped onto a third line. Figure columns spread across the width, about 100–130px apart on a laptop. The default order was already by games played. | Figure columns sized as fractions of the width, a 2.5rem portrait and a larger name than a table row needs. |
| Leaderboards | Season averages behind a flat minimum of 10 games: small samples outranked large ones, and role-dependent figures were compared across roles. Eight categories × seasons × scopes × roles gave hundreds of views. | The ranking model, not the layout. See [LEADERBOARDS_MODEL.md](LEADERBOARDS_MODEL.md). |
| Headings | Titles measured 36, 30, 24, 20 and 18px. | Mostly deliberate tiers that were never written down: a team page's title, a profile's name and its section titles, and two landing heroes. They are kept and written down. |

## 2. Decisions

- **One way to open a game in a list:** under its card, one game at a time, with the address
  carrying it (`?match=`). The page scrolls as one, with no inner scrolling, and the list, its
  filters and its place stay as they were. The match window stays only where a list cannot open a
  game in place: inside another window (Matchups, Encounters) or from a link to a game that is not
  on the page shown. Consolidating further, so that Matchups and Encounters open games under their
  rows too, would mean a window inside a window or leaving the window; neither is better, so they
  keep the window.
- **The frame recedes:** a near-neutral charcoal (`chrome`) for the sidebar, the top bar, the
  drawer and the tab bar. Colour in it marks only the current page: a neutral lift, the brand
  gradient (blue to violet) as a thin bar, and the icon in the brand blue. A team with its own page
  or panel colour gets a frame mixed from those colours. Collapse, hover expansion, focus and the
  layouts at every width are unchanged.
- **Analytical tables are dense and grouped:** 2rem portraits and rows of about 48px. Figure columns
  are as wide as their heading needs and a little more, and the name takes the rest. Phones keep
  their compact two-line rows with every figure.
- **Headings and toolbars follow three tiers:** STANDARDS.md → Page layout. No page needed changing
  to meet them.
- **Leaderboards change their model before their layout:** the model is documented and tested
  first (#177), then measured on the team's own games, before the page switches. The brief asked
  for that order.

## 3. What changed (branch `ux/layout-consistency`)

| Change | Measured |
|---|---|
| The `chrome` token, and the sidebar's current-page treatment | Same layout and motion; the sidebar tests pass unchanged. |
| All Champions rows | 57 → 51px on a laptop, 74 → 51px on a tablet; the list for 8 champions is 618 → 566px tall on a laptop and 814 → 628px on a tablet. |
| All Champions columns | On a laptop the figures span x = 755–1391 instead of 540–1391; on a 1920px screen, 808–1788 instead of 778–1788. |
| All Champions rows for every role (8 Nov 2026) | The tablet's 51px above held for Top and Mid players only. Bottom, Support and Jungle players' rows were still 68–69px on tablets 752–891px wide and on computers 1024–1162px wide with the sidebar open: the champion column kept its 9rem minimum while the figure columns grew, so "Support" and "In pool" took two lines. The 44rem layout now gives the champion column 11.75rem first (figure minimums are their headings plus the sort arrow's room, 0.5rem gaps, 0.75rem padding): 51px for every role from 752px, unchanged from 76rem. |
| Team → Matches opens games under their cards | The same `MatchExpansion` as Match History (`match-history/inline-match.tsx`), `?match=` links, one game at a time, keyboard toggle, "Close this game" returning focus to the card. |

## 4. Not changed, and why

- **Page spacing** (sections 1rem to 1.5rem apart, depending on the page): the differences are
  small and match each page's density. Changing them would move every page for no visible gain.
- **Leaderboards' page:** it waits for the model's approval and the production audit
  (`data-audit` → `leaderboardSamples`, which arrives with #177).
- **Matchups and Encounters:** they keep the match window (see Decisions).
