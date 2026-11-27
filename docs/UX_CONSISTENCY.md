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
- **Encounters is a view, not a window** (UD.E1, S6c, 20 Nov 2026): a player met opens their games in
  Match History itself at `?met=` (S4a's table: a view of the same list, with its address), one
  history entry; Back or "‹ All encounters" returns to the list at its exact scroll position (0px
  drift, measured at 390 × 844 and 1440 × 900) with the focus on the row that was opened. Why a view:
  the player's games are Match History's own list, so each game looks, opens and switches exactly as
  it does there (under its card, or the phone's window with Previous and Next), which a window over
  the list could only copy, and a game opened inside it would be a window in a window.
- **The frame recedes:** a near-neutral charcoal (`chrome`) for the sidebar, the top bar and the
  tab bar (the tablet's drawer, painted the same, went in November 2026). Colour in it marks only the current page: a neutral lift, the brand
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
| All Champions and the champion window (18 Nov 2026, the UX pass's PR 8b) | Phones: the title left to screen readers under the Champions tab, the scope line "6 champions · Season 2026 · All supported games", the search and Sort by on one row from 360px (the sort mark shown, the words read out), the sorted pair first: 1,131 → 1,031px at 393 × 852 (Demo Top), 1.72 → 1.56 screens in Safari's 393 × 659 with 1.4 → 2.4 rows on the first screen; 2.05 → 2.0 screens on a 320 × 568 phone, where the search keeps its own line (the plan's 2.24 → 2.1 is not met); 1.95 → 1.88 held sideways (852 × 393), where only the title goes (the plan's 2.82 → 2.6 is not met: the filters keep a row of their own under the scope line, SectionHeader's shared layout). At 200% text on a 320px phone the page was 459px wide (Sort by's control, the pairs and the profile header's rank line); now 320. Tablets and computers: a quiet bar under each champion's games (its share of the filters' games, said by a key in the toolbar's row), rows still 50.5px for every role, and from 76rem the figures in groups. The 44rem tier is unchanged from 8a, not the plan's: the champion column stays 11.75rem and the four figure minimums keep their sort arrow's room. Its purpose already holds: rows are 50.5px for Top and Support players at 752, 768, 810 and 891px and at 1024 and 1162px with the sidebar open (Chromium), and 51px for Support, ADC and Jungle players at 752, 810 and 891px in WebKit, "Support · In pool" on one line. 12.75rem would need those minimums at their headings' width alone, which with the 0.5rem gaps puts each right-aligned heading's sort arrow (0.875rem to its left) 0.375rem over the heading before it, against the rule that the arrow sits outside the headings. The champion window on a phone: header 227 → 190px, the lane comparison at 631 → 524px (393 × 852), not the plan's estimated 460px: since the plan, the scope row also holds Matchup Intel (#292), the scope wraps instead of cutting off the account (#300), and the tabs are 44px on a touch screen. Every figure stays whole (Mastery points too). From `sm` the window is unchanged, but for 44px tabs on a touch screen (+4px). |
| Team → Matches opens games under their cards | The same `MatchExpansion` as Match History (`match-history/inline-match.tsx`), `?match=` links, one game at a time, keyboard toggle, "Close this game" returning focus to the card. |
| Team → Matches' cards (18 Nov 2026, the rest of the UX pass's PR 7c, after #303's columns by the list's width) | Each member: a 36px portrait with the member's 16px picture on its corner, the name whole with the K/D/A right after it, then the role and champion (from sm the CS and damage where the row is 19rem, beside them or, when both do not fit whole, on a line under them); members two to a row from a 34rem column; the result, its game and the count of members one line on narrower cards (the count read out only on a phone); the Solo/Duo caveat a line of text in the result column (in the four columns' 8.5rem column "Not all queued together" under the queue's "Ranked Solo/Duo", the sentence read out and in its title); Bookmarked at the filter row's end; the list's own count line gone, its notes behind the summary line's (i); a skeleton in the list's shape. Page heights in screens, before → after (demo build): 393 × 852 1.79 → 1.66 (Safari's 659px: 2.32 → 2.14), 320 × 568 3.21 → 2.74, 412 × 915 1.65 → 1.52, 915 × 412 4.44 → 3.45, 810 × 1080 1.78 → 1.32, 1440 × 900 1.35 → 1.06 (with the sidebar open too), 2560 × 1440 1.08 → 1.0, 3440 × 1440 1.16 → 1.0. The four columns still start at #303's measured 58rem (the plan said 60rem): the result column is 8.5rem and the columns 0.75rem apart, so the members' column reaches 34rem beside the open sidebar at 1440. |

## 4. Not changed, and why

- **Page spacing** (sections 1rem to 1.5rem apart, depending on the page): the differences are
  small and match each page's density. Changing them would move every page for no visible gain.
- **Leaderboards' page:** it waits for the model's approval and the production audit
  (`data-audit` → `leaderboardSamples`, which arrives with #177).
- **Matchups and Encounters:** they keep the match window (see Decisions).

## 5. Release 17: one family of selection controls, and less to read (24 Nov 2026)

The owner's brief of 24 Nov 2026 (§9, §10) asked for the boxed segmented control to go site-wide
and for a focused audit of permanent explanatory text outside the opened game and the match card.

### Controls

- **Segmented choices** (`segmentedGroupClass`, `segmentClass`, `RoleSegmented`): words, the chosen
  one semibold in `fg` over a 2px accent underline drawn inside its own box; no outline or fill round
  the group, no fill or ring round the chosen one; 36px with a mouse, 44px on touch. A group that
  outgrows its line wraps instead of scrolling sideways. **Views** (`SubTabs`, the pinned row's
  compact tabs) take the same mark at 14px with icons; the phone's track is gone. **Section tabs**
  (`TabBar`) keep their gradient bar over the row's hairline: the strongest of the three.
- **Chips** stay controls (round outline, accent edge and wash while on); fields, selects and toolbar
  buttons keep their 3:1 edge (WCAG 1.4.11). docs/DESIGN_SYSTEM.md §5, "Text-led controls".
- **Hand-made boxes replaced:** the champion grid's role filter (the Lookup's and Card Studio's
  picker), the profile editor's role picker, the setup role chips (`ToggleChip`), the onboarding
  preview's steps and account type, Encounters' minimum and sort in the phone's sheet (single
  choices: segments, not chips), the Leaderboards and Settings section indexes (in-page navigation:
  underlined like views, chips before; Settings' list from md too, a filled entry until the review of
  25 Nov 2026), Resources' counts (plain figures). The first-role choice is
  an action, so outline buttons. Admin Previews' two groups sit 24px apart and Rotate and Reset are
  outline buttons, so words of one group never read as the next's.
- **Left to other Release 17 lanes:** Card Studio's own choices and the haste presets (both
  rebuilt or removed there; `segmented-use.test.ts` lists them as optional exceptions until then).
- **Guards:** `src/app/segmented-use.test.ts`, `e2e/shared-controls.spec.ts`.

### The noise audit

Walked in Player Mode and Admin Mode on the demo at 1440 × 900 and 390 × 844, listing every
permanent sentence of 45 characters or more outside tips (a script over the visible text of `main`).

| Where | Before | Now | Why |
|---|---|---|---|
| Resources | "Useful League of Legends sites: news and patch notes, statistics and builds, ARAM, Arena and esports. Each opens in a new tab." | no description | the index under the search names the sections; every link shows ↗ and reads out "(opens in a new tab)" |
| Settings (both modes) | "Your picture, display name, username and password." | no description | the account card and the index (Name, Password, This device) say it |
| Admin Dashboard | "What needs you, then the platform at a glance." | no description | described the layout the page shows |
| Admin Previews | "390 × 844 px. The page inside works as for a real visitor; anything typed or chosen stays here." | "390 × 844 px" | repeated the page's description and the frame's "Preview · nothing is saved" badge |
| Encounters | "Grey win rates come from fewer than 5 games with a result: a small sample." under the list | removed | the ⓘ by the scope line already says "Grey: fewer than 5 games" |
| Settings → Sign out of other devices | "Signed in somewhere you no longer use? Sign out everywhere else; this device stays signed in." | "This device stays signed in." | the button names the action; the consequence stays |
| Riot Accounts' ⓘ | "…; the others follow in the order set. Each adds its games and mastery, counting a shared game once." | "The Main account sets the profile's rank. Mastery adds up too, and a game two accounts share counts once." | the lead line beside it already says the order and that every account adds its games |
| Admin → Branding → Background visibility | three clauses, 41 words | 28 words | "for every member" and the panels' backgrounds were implied by the control |
| Admin → Branding → Images | the same 45-word upload paragraph under each of the three slots | once under "Images" (20 MB each, under 5 MB keeps the first visit quick, animated GIFs and the first frame); under each slot its formats and size in pixels | the review of 25 Nov 2026; the limits are kept, said once; what differs per slot stays with the slot |
| Champion Intel → the passive's opened row | "Riot's data gives passives no cooldown." under the row's "No cooldown in Riot's data" | removed | the same fact twice (the review of 25 Nov 2026) |

Kept, and why:

- **Data coverage and honesty:** scope lines ("All champions · all roles · linked account · Season
  2026 · All supported games", the pools' "Figures: games in that role · …", Leaderboards' "Latest 20
  games from the last 60 days · …", "Not enough recent games · 10 needed…"); Health's "Checked as the
  page loaded; Healthy only with evidence" and Data's "Answered from what has actually been collected";
  Team Matches' "Ranked Solo/Duo allows parties of two at most, so not all of them queued together"
  (an inference, said as one).
- **Limitations:** "Riot data is not available on the server yet…" (Riot Accounts), Health's missing
  key and temporary database lines.
- **Consequences and permissions:** the password panel's "changing it signs out your other devices",
  Access levels' descriptions, the field hints (what a name is shown as, a username not being
  case-sensitive), the picture's formats and Branding's upload limits.
- **Privacy:** Settings' "What this browser remembers… never sent to the server" and its device rows,
  the Audit Logs' "Passwords and keys are never recorded", the Personal data page's procedure.
- **Admin people's special rows** (a pre-profile account, an unclaimed profile, the Production
  check's account): each says what the row is and what acting on it does.

### Page heights (the demo, before → after)

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Settings (Player and Admin Mode) | 1167 → 1115 | 1882 → 1862 |
| Admin → Branding | 1653 → 1633 | 3454 → 3434 |
| Admin → Previews | 1158 → 1158 | 1161 → 1121 |
| Encounters | fits (900) | 970 → 934 |
| Resources | fits (900) | 1467 → 1465 |
| Admin Dashboard | fits (900) | 844 → 844 (its description was already left out on phones) |

The segmented groups keep their height (36px with a mouse, the boxed group's 36px; 44px on touch),
so no other page moved: every other page of the walk measured the same before and after at both sizes.

## 6. All Champions: positions, a pane beside the list, one table of opponents (25 Nov 2026)

The owner's request of 25 Nov 2026 reassessed All Champions and its preview rather than adding to
them (docs/MATCHUPS.md has the whole behaviour).

| Before | After | Why |
|---|---|---|
| One role per row: the most played recorded role, or the configured primary role when no game recorded one; a champion of a member without a primary role whose games recorded none had no row | One row per champion with the icon of every position Riot recorded, most games first, no minimum; games without a position counted in the totals and said in the preview | Positions are what was played, never what was configured; the table's figures are the filters' totals |
| The preview a panel docked at the window's right edge, over half the table | A pane beside the list, which narrows (no row or name moves); a sheet where both do not fit | Nothing covered without purpose; the preview gets real room on wide screens |
| Champion-wide figures above role-specific opponents; "Also as" links that no longer appeared | A position choice that switches every figure and the opponents at once; mastery marked as all positions' | Each figure says what it covers |
| Four boxed tiles; 3+ opponents (first five, then "more"), 1–2 folded; Most games, Best, Worst; each opponent an accordion with "Show all" | Labels over figures; one table of every opponent with a search and Most games, Highest and Lowest win rate (small samples quiet and ranked last); the detail beside the table, or one step in place of it | Fewer clicks, no nested expanders, no misleading best/worst from one game |
| A click outside closed the panel | It stays (part of the page); Close is labelled; Back, Escape and the row again still close it | A pane in the page is not a layer to dismiss by accident |

Back and Escape keep the one history rule: the preview is one entry (switching champion, position or
opponent replaces it), and closing returns the list with its place, search, sort and filters.

The review of the same day tightened it:

| Before | After | Why |
|---|---|---|
| The pane a scroll box as tall as the window, beside the page's own scroll | No scroll box: pinned while it fits, taller it scrolls with the page between the tabs and the window's foot, its header pinned | One scrolling surface, the page's (no wheel that moves the list over one part and the pane over another) |
| On a touch screen a tap on a position mark opened the most played position; the marks read only games | The row stays one 44px target but honours a tapped mark; the marks and the position choice say each position's games, win rate and record | The same facts and the same result for a finger as for a mouse |
| A search typed in one position filtered the next (with no field left to clear it where the table was short) | Each position's table starts whole; a table without a field is never filtered | Never hide an opponent |
| Five positions and "In pool" wrapped as the pane opened at 1366 with the sidebar open; a list sorted by a hidden figure put it under every row | A 22.5rem list; "Sorted by KDA" once in the heading row | No row moves as the pane opens or closes |

## 7. 25 Nov 2026: readability (the owner's request)

Too much grey text, too many capitals, tiny annotations and boxes inside boxes. The base commit of the
release lifted the two greys (`fg-muted` `#b4b8c9` → `#c9cddb`, `fg-subtle` `#8f95aa` → `#a2a8bc`) and
added a disabled tone (`fg-disabled` `#70758c`) and the sentence-case label (`label-text`); the
typography lane then gave every text its tier by its job (STANDARDS, "Type"), outside the Match
History, Champion Intel and Leaderboards files, which their lanes changed by the same rule. Walked in
Player Mode and Admin Mode on the demo at 1366 × 768 to 3440 × 1440, sidebar open and folded, on
phones and a tablet, and at 200% text.

| Where | Before | After | Why |
|---|---|---|---|
| All Champions' table (rewritten in §6 by the same rule) | the sorted column `fg` semibold, every other column `fg-muted`; headings 11px uppercase tracked in `fg-subtle` | every figure `fg`, the sorted column semibold beside its arrow; headings 12px sentence case in `fg-muted`, the sorted one `fg` semibold | grey figures read as less important, not as unsorted; capitals were harder to read than the words |
| The profile's season card | "13W 7L", "per game" and the other sub-lines in `fg-subtle`; the total kills `fg-muted` | sub-lines `fg-muted`; the total kills `fg` | a qualifying figure is secondary; a figure is primary |
| Recent form, Ranked progress | "Last 20", "All 120", "Last 30 days" in `fg-subtle` (11px on phones); "No change" grey | labels `fg-muted`, 12px; "No change" `fg` | labels of figures are secondary; a value is primary |
| All Champions' preview (rewritten in §6 by the same rule) | its stat labels in capitals; opponents' records `fg-subtle`; a small-sample win rate `fg-muted`, barely apart from a plain one after the lift | sentence-case labels; records `fg-muted`; a small sample `fg-subtle`, with its words | the grey says "small sample" only if it is clearly grey |
| Team player window | the pool's games, KDA and CS in `fg-muted`; figure and column labels in `fg-subtle` (capitals kept, approved; sentence case `label-text` since 27 Nov 2026, the owner's decision D4) | figures `fg`; labels `fg-muted` | Team Overview keeps its capitals and layout; only colours changed. The card face is unchanged (approved) |
| Pools on the profile, the off roles | column names uppercase from 24rem; "OFF ROLES" | sentence case at every width | no width changes the label's case any more |
| Riot data panel, Settings → Riot API, Admin → page speed | uppercase `fg-subtle` labels in bordered tiles inside the panel; table values `fg-muted` | sentence-case `fg-muted` labels over `fg` figures, no tile; table values `fg`, the phone list's figures `fg` beside their `fg-muted` words (the release's review); the metrics as many columns as fit 10rem each (one on a phone or at a large text size); the experience label's why in the shared breakdown | boxes within boxes; table values are read; two fixed columns let a label at 150–200% text run into the next |
| Panels' part headings (`SectionLabel`), the capabilities' groups, Recover's "Owner account found", Privacy's "On this page" | 12px uppercase tracked `fg-subtle` | sentence-case headings (`fg` for a heading, `fg-muted` for a label) | a heading read as a caption |
| Menus and lists | "SIGNED IN AS"; "OFTEN PLAYED MID"; champion filter groups in capitals; group labels `fg-subtle` | sentence case; group labels `fg-muted` | one look for a list's group heading (as `MenuLabel` and Select's groups were already) |
| Card Studio's parts | 11px uppercase `fg-subtle` titles | 14px `fg` headings; Undo and Reset `fg-muted` | headings of the studio's parts |
| Disabled controls | opacities from 30% to 70% across 25 places; a disabled segment `fg-subtle` at 60% | one look: `fg-disabled`, the not-allowed cursor, no hover; a filled button on the neutral fill | "disabled" read differently on every page |
| Zero counts (role segments, Resources' index) | `fg-subtle` at 60% (3:1, under AA) | plain `fg-subtle` | a zero is not disabled |
| InfoTip bubble | 12px in an 18rem bubble | 14px in a 20rem bubble (12px in 18rem only where that has no room beside its trigger) | the body size, about the same number of lines |
| Tips | Recent form 31 words with four thresholds; the rank's tip 38 words, three concepts; the Riot credential's legend of three states; Social links' 44-word help | 25, about 20, one state, 27 words (docs/HELP_TEXT.md, "25 Nov 2026") | one concept a tip, plain words |

Kept, and why: Team Overview's card face (approved: its capitals, sizes and colours as they were,
lifted only by the tokens), the Admin mode marker and the admin pages' accent eyebrow (the mode's
identity), pill badges ("You", "Primary role"), a member's own "wide" name style, footnotes and
coverage lines in `fg-subtle` (supplementary, and 6.2:1 or more now), timestamps and the ⓘ mark.

Guards added: `src/app/type-hierarchy.test.ts` (capitals outside a pill and the approved list; a
disabled control dimmed with opacity; the disabled tone on live text; an alpha on a text colour),
`tip-length.test.ts` counting the new composed texts, Branding's check of `fg-subtle` at 4.5:1 on a
team's own colours (page, panel and selected row), and the Production check's text facts
(docs/LIVE_VALIDATION.md, "The text hierarchy").


## 8. 27 Nov 2026: All Champions as a one-screen workspace (the owner's request)

The owner: the whole All Champions experience in one desktop window, without scrolling, by its
layout and not by trimming padding; height-aware pages instead of growing lists; a horizontal
summary; the lane opponents (the main cause, with dozens of them) in two columns and in pages, an
opponent's details in place; nothing dropped; the phone, the tablet and large text kept.
docs/RESPONSIVE.md, "All Champions' workspace", has the rules; docs/MATCHUPS.md the content.

**Page heights, before → after** (the demo with a champion of 40 lane opponents: Demo Top's
Ambessa, `UNIIVERSE_DEMO_WIDE_CHAMPION=1`; before, the same page measured on the default demo's
four-opponent champions: map3 §2.1):

| State | 1366 × 768 | 1440 × 900 | 1648 × 900 | 1920 × 1080 |
|---|---|---|---|---|
| the preview open (before: Viego, 4 opponents) | 927 → 768 | 900 → 900 | 918 → 900 | 1,080 → 1,080 |
| an opponent open (before: Viego vs Lee Sin, 13 games) | 1,303 → 768 | 1,263 → 900 | 1,302 → 900 | 1,420 → 1,080 |
| five positions with an opponent open (Sion vs Nasus) | 1,436 → 768 | 1,326 → 900 | 1,367 → 900 | 1,490 → 1,080 |

Production's Ambessa (about 40 opponents) would have been a page of about 2,200px at 1440 × 900.

**Rows per page** (sidebar open and folded alike): the champions 7 / 9 / 9 / 11; Ambessa's lane
opponents 10 / 18 / 16 / 22 (two columns); Darius's games 10 / 18 / 16 / 20. Thirty champions take
5 / 4 / 4 / 3 pages, Ambessa's 40 opponents 4 / 3 / 3 / 2 (one more in the win-rate orders, for the
divider's slots).

| Where | Before | After | Why |
|---|---|---|---|
| The page | grew with the list, the preview and an opponent's games | the window: two cards to its foot, their footers on one baseline | the owner's one screen |
| The champions | the first 20, then Show all | pages of the rows that fit, a pager ("1–7 of 30"); every row one height | no list grows the page; the pages never shift |
| The summary | 288px: a 48px portrait and three lines; a position selector of one; the win rate text-3xl; the coverage sentence always | about 166px: one identity bar (the one position said there), the positions only for two or more, five figure cells (the win rate text-2xl), the kills line | horizontal, every figure kept |
| The lane opponents | one table of every opponent, the controls over it in two or three lines | two columns of merged cells ("9 · 5W 4L") under one toolbar line, in pages; the divider a cell of its own, never a page's last, again at the top of every page in the small samples | the opponents were the main cause of height |
| An opponent | beside the table, every game listed (13 games: 441px) | in place of the grid, "‹ All opponents", ‹ 3 of 40 ›, its games in two columns and pages | details without growing the page |
| Sentences | "Choose an opponent…" drawn; "Averages over all 20 Jungle games…" drawn; "Lane opponent: the enemy Riot placed…" drawn | the hint and the complete coverage read out; the definition in the opponents' ⓘ, "Known in N of M games." kept in the footer | they repeated what is on screen (decision O3) |
| A filter change | closed the preview | keeps the champion (and its position) open (decision O2) | "select any champion … change filters" |
| 1280–1359px with the sidebar open | a pane with one column of opponents | the sheet over the paged list (decision O1) | one game a page for five positions otherwise |
| K/D/A in an opponent's games | cut at 1366 with the sidebar open ("10/…") | whole in both layouts (4.25rem at least) | no clipped data |

Kept: the flow everywhere else (phones, tablets, short windows, large text) byte for byte but the
K/D/A fix; the address and history contract; every figure.
