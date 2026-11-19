# Desktop UX audit (directive §1), 19 Nov 2026

Stage 0, read-only. Nothing was edited, committed or pushed, and nothing was saved in the demos: windows and editors were opened and then closed with Escape or Cancel.

## 0. What was audited, and how

**Builds**
- **http://127.0.0.1:3871** is the Matchup Intel branch, served from `/home/user/uniiverse-mi` at 9cce9a33: main, plus large text, plus the first nav version (Matchup Intel as its own sidebar entry), plus Matchup Intel's single-screen dashboard. Every page and size below comes from this build unless noted.
- **http://127.0.0.1:3852** did not answer when the audit started. It came up mid-audit, served from `/home/user/uniiverse-leaderboards-dashboard` at 5ab0c9ca. That build is batch 3 combined: Leaderboards as one page, merged with `ux/nav-refinements`.
  - Leaderboards as one page was judged live on 3852 at all four sizes, with the sidebar open and folded, and against the screenshots in `(coordinator scratch)/lbfix/after/`.
  - Ranked progress ending at its chart was also checked on 3852.

**Sizes**
- 1280×800, 1440×900, 1920×1080 and 2560×1440, each with the sidebar open and folded.
- Root font: 16px at 1280 and 1440, 17.7px at 1920, 20.6px at 2560 (the fluid root).

**Pages**
- 27 page states at every size: Team Overview, Players, Leaderboards (old two views on 3871, one page on 3852), Team Matches, a profile, and Matchup Intel.
  - The profile covers Overview, All Champions, Match History, Encounters and Riot Accounts.
  - Matchup Intel covers the empty state, a curated pair and assembled pairs.
- Also Resources, Settings, the 11 Admin Mode pages, and the public pages: public team page, sign-in, privacy and recover.
- About 220 page captures, plus about 35 interaction probes at 1440 (windows also at 1280, 1920 and 2560) in Chromium, and a WebKit spot check at 1440.

**Measured on every capture**
- Page height in screens (scrollHeight ÷ viewport).
- Nested scroll areas and sideways overflow.
- Text under 12px, and targets under 24px.
- The content column's left edge and width.
- Console errors.
- axe-core 4.14 at 1440 on every page, and on batch 3's Leaderboards at all eight sizes.

**Where the evidence is**
- Screenshots: `docs/overhaul/shots-desktop/`. Inside it:
  - `s1440/`: every page at 1440 with the sidebar open, plus `metrics.json`;
  - `sizes/`: the other sizes, plus `metrics.json`;
  - `interact/`, `probe2/`, `legacy/`, `webkit/`: interaction probes, with their JSON logs;
  - `b3/`: batch 3 on 3852;
  - `sheet-*.png`: contact sheets.
- Scripts: `docs/overhaul/desktop-tools/`.
- The demo data is synthetic, and only the design was judged. One demo account was created by a test; it is not named here.

## 1. Verdict

The desktop app already looks premium: dark layered panels, art kept to the edges, a calm frame and a restrained palette. Its engineering foundations are better than most products of this size:
- no page has a nested scroller or sideways overflow at any of the 8 sizes;
- axe reports 0 violations;
- Back restores the scroll position;
- every window closes on Escape, on the backdrop and on Close, and returns focus to its opener;
- the pinned section row keeps the page's views and Filters within one click.

What keeps it from feeling effortless is **interaction consistency, not visual quality**. Four different containers are used for "look at one item from this list", with four different behaviours for Back, Escape and switching:
- a centred modal: the champion window, the Team player window, and the match window opened from records;
- an inline unfold: games;
- a drill-down: Encounters;
- a full page: Players rows.

Three layout jumps cost precision:
- the profile's section tabs move 96px when you switch sections;
- an open game's sub-tabs change its height by up to 713px;
- the page's left edge moves up to 536px between destinations on wide screens.

The admin area's Accounts page is the one screen that still looks like an older app.

**Counts:** 52 findings, 9 major and 43 minor. They come from about 220 page captures, about 35 interaction scenarios and a 4-page WebKit spot check.

## 2. What works (keep)

- **Frame.** Sidebar zones and current-page marking. Peek on hover when folded. Ctrl+\. The pinned section row, whose end slot holds the page's compact controls once the header scrolls away; checked at the end of Match History: Overview…Riot Accounts | Games · Encounters · Filters. Skip link first in the tab order.
- **Lists.** The Match History and Team Matches card language (the result rail, KDA as the hero, the League-like scoreboard). Recent form's board. Players rows. Resources' masonry.
- **Windows.** Native `<dialog>`, focus trapped, dimmed backdrop, Escape, backdrop and Close all work, and focus returns to the opener. The Team player window has ‹ › previous and next, and ArrowRight works.
- **Popovers.** Refine closes on Escape and on an outside click. The "Played with" listbox closes on Escape.
- **Robustness.** WebKit draws Team, the champion window, an open game and Matchup Intel the same as Chromium (`docs/overhaul/shots-desktop/sheet-webkit.png`).
- **Matchup Intel** fits one screen at 1440, 1920 and 2560 for both curated and assembled pairs.
- **Batch 3** works: Leaderboards as one page has a visible h1 and Recent form first, and Ranked progress ends at its chart (`docs/overhaul/shots-desktop/b3/profile-mid-1440-open-full.png`).

## 3. Findings by page

Format: **ID (severity) — where.** What the user sees, with evidence or a measurement. Why it matters. Proposal.

### Team Overview

**T1 (major) — /team, 1280×800 with the sidebar open, and any CSS width below about 1350–1366px with the sidebar open (a 1440 screen at 110% zoom is 1309px).**
- **What you see:** the lineup breaks into 3 + 2 and the Bottom and Support cards fall below the fold. The page is 1023px tall in an 800px window (1.28 screens). With the sidebar folded it is five across and fits.
- **Evidence:**
  - screenshot `docs/overhaul/shots-desktop/sizes/team-1280-open-first.png`;
  - width sweep at 1280, 1300, 1320 and 1340: 2 rows each time; at 1366 and 1400: 1 row.
- **Why it matters:** this is the home page. A split lineup with two players cut off contradicts "five across from a 58rem lineup" (synthesis P6).
- **Proposal:** five across from a 56rem lineup, using the stacked figure well that 1366 already uses. Keep 3 + 2 only below 56rem.

**T2 (minor) — /team, 1920 and 2560.**
- **What you see:** the section tabs and the lineup do not share a left edge:
  - 1920, sidebar open: tabs start at x=319, the first card at x=357 (38px apart);
  - 2560, sidebar open: 414 against 579 (165px);
  - 2560, folded: 296 against 461 (165px).
- **Evidence:** `docs/overhaul/shots-desktop/sizes/team-2560-open-first.png`, and `probe3.json` in the `probe2/` folder.
- **Why it matters:** DESIGN_SYSTEM promises "one centre line" and P6 says tabs line up with content to ±1px. On the benchmark page it reads as a misalignment.
- **Proposal:** the lineup frame takes the tab row's width (100rem), or the Team Overview tab row takes the lineup's width.

**T3 (minor; owner-approved design) — /team.**
- **What you see:** the vertical centring leaves an empty band between the tabs and the header that grows with the screen: 111px at 1440, 153px at 1920, 247px at 2560. There is a similar gap under the cards, filled by the "TEAM HUB" watermark.
- **Why it matters:** about 17% of a 2560 window is empty. The owner restored this layout on 17 Nov, so it is flagged, not overridden.
- **Proposal:** keep the centring, but cap the space above the header at about 3rem and centre only the remainder. Show the owner an A/B preview at 1920 and 2560.

**T4 (minor) — /team in Edit lineup mode.**
- **What you see:** five filled brand-blue "Change" buttons plus a filled "Done": six saturated primaries on one screen (`docs/overhaul/shots-desktop/interact/team-edit-open-1440.png`).
- **Why it matters:** this breaks the colour budget (one coloured mark per region).
- **Proposal:** make "Change" and "Substitute" outline buttons, and keep "Done" as the only primary.

**T5 (minor) — the Team player window.**
- **What you see:**
  - Opening it leaves the address as `/team`, so a window cannot be linked, and Back leaves Team instead of closing the window (probe: after Back the tab went to the previous page).
  - Its body scrolls inside for slivers: 681px of content in a 589px body at 1440, 753 in 726 at 1920.
- **Proposal:** move it to the shared Peek panel (§6), which gives it an address, makes Back close it, and removes the inner scroll. Keep its ‹ › switching as ↑/↓.

### Players

**P1 (minor) — /players, all desktop sizes.**
- **What you see:** off roles appear as bare role icons between the main role and the rank (for example "Mid [icon] · Platinum IV"), with no label.
- **Why it matters:** the meaning has to be guessed. The profile header writes "Top (off role)".
- **Proposal:** use the same words as the profile ("also Top"), or a labelled small chip.

**P2 (minor) — /players.**
- **What you see:** a row with "Riot data: updating" grows to 80px against 64px for the others. In the two-column grid the whole grid row grows with it.
- **Proposal:** show the sync status as a badge in line 1, so every row keeps one height.

**P3 (minor) — client navigation into Players.**
- **What you see:** the loading state is a stack of generic cards, not two columns of rows, so the layout jumps when the content arrives (`docs/overhaul/shots-desktop/probe2/nav-team-players-150ms.png`).
- **Proposal:** a skeleton in the page's shape (see X4).

### Leaderboards (batch 3, one page; live on 3852)

**L1 (minor) — /leaderboards, laptops.**
- **What you see:** one page is long on laptop screens:

  | Window | Screens |
  |---|---|
  | 1280, sidebar open | 2.31 |
  | 1440 | 1.85 |
  | 1920 | 1.25 |
  | 2560 | 1.09 |

  The SectionIndex (Recent form · Season records · Milestones) is shown only on phones and tablets.
- **Evidence:** `docs/overhaul/shots-desktop/b3/leaderboards-1280-open-full.png`.
- **Proposal:** show the index chips in the header whenever the page is over 1.3 screens, and offer them in the pinned row's compact slot once the header has scrolled away.

**L2 (minor) — /leaderboards from 59 to 86rem (1280 and 1440).**
- **What you see:**
  - Multikills ends about 155px above Season records, leaving a hole beside the records.
  - At 1440 the two-column record cells put their values on different baselines, depending on how long the qualifier is: "12 kills" sits level with the holder, while "1,039 damage/min" drops to the third line (`(coordinator scratch)/lbfix/after/after-desktop-1440x900-expanded-leaderboards-full.png`).
- **Proposal:**
  - fill the space under Multikills, for example by putting Milestones there, or end both columns at one height;
  - give every record cell one value position, top right as in the 1920 column layout.

**L3 (minor; high irritation) — a record row.**
- **What you see:** a record opens the game in the holder's Match History, so the page changes from Leaderboards to that profile and opens the match window over it. Escape then leaves you on that Match History, not on the board.
- **Evidence:** `docs/overhaul/shots-desktop/interact/records-game-open-1440.png`. State after Escape: `/players/…/matches`. Same `?match=` link on 3852 (`records.tsx:142`).
- **Proposal:** open the game in the shared Peek panel on `/leaderboards?match=…`. Closing returns to the board, and "Open in Match History" is offered inside the panel.

**L4 (minor) — record rows at 1280 and 1440.**
- **What you see:** nothing tells you a record opens a game. Its chevron is hidden below a 36rem list, and the hover state is the only cue.
- **Proposal:** always show the chevron on clickable rows (DataRow trail).

**L5 (minor; hand to the tooltip stage) — the "to the place above" column.**
- **What you see:** "Next win: 3=" is a token a player has to decode, while "1 win behind" reads at once.
- **Proposal:** "A win ties 3rd" (decision D5 already lists it as the fallback).

### Team Matches

**M1 (minor) — /matches filter row.**
- **What you see:** native `<select>`s ("All supported games", "2+ members") sit beside a custom dropdown ("Played with: Anyone", a listbox popover). They look different, and different again in WebKit.
- **Evidence:** `docs/overhaul/shots-desktop/s1440/matches-1440-open-full.png`.
- **Proposal:** one Select popover component for every toolbar (see X7).

**M2 (minor) — /matches and Match History cards at 1280 and 1440.**
- **What you see:**
  - The ten-name rosters are set in 11px text: 283 text nodes under 12px on Matches and 479 on Match History at 1440.
  - Team members' names in the rosters are brand blue, which is outside the colour budget (blue is for current, selected, primary and focus).
- **Proposal:**
  - a 12px floor for names (X5);
  - mark members with weight and an avatar ring instead of blue.

### Profile Overview

**PO1 (major) — switching profile sections, all sizes.**
- **What you see:** the section tabs move 96px. Overview has a 168px banner and the other three sections a 72px band, so the tabs sit at y=202 on Overview and y=106 elsewhere.
- **What it costs:** each click from Overview to another section moves the tab bar out from under the pointer, and back again. Comparing sections means re-aiming every time.
- **Evidence:** the frame 120ms after the click (`docs/overhaul/shots-desktop/interact/profile-switch-120ms-1440.png`), and the `profile-tabs` entry in `interact-1440-expanded.json`.
- **Why it matters:** this is the "unexpected layout shift" the directive names, on the benchmark page.
- **Proposal:** one header height for all sections. Either the compact band everywhere, with the banner art behind it, or keep the tall banner on every section and let it collapse to the band on scroll (sticky shrink). The tabs then never move on a click.

**PO2 (minor) — the Recent form card at 1280 to 1920.**
- **What you see:** it stretches to the season card's height, leaving about 90px empty between the 20 squares and the figures (`docs/overhaul/shots-desktop/s1440/profile-1440-open-full.png`).
- **Proposal:** top-align the content and let the panel end at its content, or move the Last 20 / All comparisons beside the strip.

**PO3 (minor) — the first screen of Overview.**
- **What you see:** 6 to 7 ⓘ icons (scope, KDA, CS/min, Damage/min, Vision, Recent form verdict, Ranked progress).
- **Why it matters:** visual noise. Several labels already explain themselves ("Damage/min to champions").
- **Proposal:** the tooltip stage keeps the ⓘ only where a label cannot be made clear.

### All Champions and the champion window

**C1 (major; directive §4) — /players/[id]/champions, and pool rows on Overview.**
- **What you see:** a row opens a centred wide modal that dims and covers the list:
  - its size is 1216×810 at 1440, 1347×972 at 1920 and 1566×1195 at 2560;
  - there is no previous/next inside it (unlike the Team player window), so another champion means close, re-aim, click;
  - the body scrolls inside it: 975px in a 624px body at 1440, 975 in 534 at 1280 (45% hidden), 1078 in 766 at 1920.
- **What it holds:** its own Refine, a Matchup Intel link, two tabs, six stat tiles, a multikill line, a lane table at 5/10/15/20 minutes, the opponents faced, two sentences and the latest games.
- **Evidence:** `docs/overhaul/shots-desktop/interact/champion-window-open-1440.png` and `docs/overhaul/shots-desktop/interact/champion-window-matchups-1440.png`.
- **Proposal:** the right-side Peek panel (§6), with the list kept visible and interactive, and ↑/↓ to move between champions.
  - **Content per §4:** identity; games; personal win rate; and a sortable "against each champion" list in which every row shows its games. The minimum sample defaults to 3 games, with a "show all" switch.
  - **Moved behind a fold:** the lane checkpoint table, as an optional "Lane details".
  - **Removed from the panel:** Refine. The page's filters apply.

**C2 (minor) — the All Champions heading.**
- **What you see:** "All champions" in the heading against "All Champions" on the tab.
- **Proposal:** one spelling.

**C3 (minor) — the champion window's address.**
- **What you see:** the same window has two addresses: `?champ=` when opened from a pool row on Overview, and `?champion=` on All Champions.
- **Proposal:** one key, once the Peek panel owns its own state.

### Match History, an open game, and Encounters

**H1 (major) — Match History cards at 1280×800 with the sidebar open.**
- **What you see:** the card drops the build (items) entirely, but keeps both teams' ten-name rosters. With the sidebar folded the build is back.
- **Evidence:** `docs/overhaul/shots-desktop/sheet-history-1280.png`.
- **Why it matters:** on the most common laptop setup the player loses their own six items, which the directive ranks first, while ten other names stay.
- **Proposal:** below a 61rem list, drop the rosters first (they are in the open game's scoreboard), or shrink them to two rows of five portraits. Always keep the 3 + 3 + trinket build.

**H2 (major) — an open game (Match History and Team Matches, every size).**
- **The problems:**
  - **Height:** the unfolded game is a full screen tall (897px of 900 at 1440, on Scoreboard).
  - **Sub-tabs:** Scoreboard, Analysis, Timeline and Build are 897, 691, 184 and 288px tall, so switching tabs moves everything below by up to 713px.
  - **Escape:** it does not close the game.
  - **Back:** it does not close the game either. The address is replaced, so Back leaves Match History for the previous page.
  - **Close:** the only close control besides the card is "Close this game" at the very end.
- **Evidence:**
  - `docs/overhaul/shots-desktop/interact/history-open-full-1440.png`;
  - `docs/overhaul/shots-desktop/sheet-history-tabs.png`;
  - `probe3.json`: after Back the address is `/players/…`, not `/matches`.
- **Proposal:**
  - **One layout with no sub-tabs:** the scoreboard on the left (about 2/3); "what went well, what went wrong, focus" plus runes, spells and the build order on the right (about 1/3); the timeline as an optional fold.
  - **If tabs stay:** give them a minimum height equal to the tallest.
  - **Escape** closes the open game and returns focus to its card.
  - **A compact header for the open game** (result, champion, Close) pins under the section row while any part of it is on screen.
  - **History:** the first game opened pushes an entry; opening another replaces it; Back closes.

**H3 (minor) — Match History cards at 1280 to 1440.**
- **What you see:** the "With …" teammate line is cut ("With Demo Sub (T…"), and roster names are cut too ("Demo Sub (Supp…").
- **Proposal:** keep the full names in a tooltip-free 2-line layout, or show teammates as portraits.

**H4 (minor) — Games against Encounters.**
- **What you see:** Games has Refine; Encounters shows only the mode select (`docs/overhaul/shots-desktop/s1440/encounters-1440-open-first.png`), so the filter set changes under the same header.
- **Proposal:** keep Refine visible, disabled with a reason, or say on the scope line what does not apply.

**E1 (minor) — an Encounters row.**
- **What you see:** the row drills down in place to that player's games, under "‹ All encounters", while the view switch still says Encounters. That is fine, but UX_CONSISTENCY.md still says Encounters keep the match window.
- **Proposal:** correct the doc. In the shared model this is a "view", not a preview. A Peek of the opponent with their record and games would be the consistent alternative.

### Matchup Intel (overlaps the Matchup Intel stage; desktop only here)

**I1 (minor) — the curated pair (Gwen vs Ornn) at 1280×800 with the sidebar open.**
- **What you see:** 1.17 screens. Level changes and "Your champion" are cut (`docs/overhaul/shots-desktop/probe2/intel-curated-1280-open.png`). It fits at 1440, 1920 and 2560.
- **Proposal:** below 1440, stack Level changes under Interactions as a fold, or narrow the right column so the cooldowns stay on the title line.

**I2 (major on today's data) — assembled pairs without reviewed facts (Ahri vs Zed, Jinx vs Caitlyn).**
- **What you see:** four panels repeat empty statements: Danger "No reviewed facts…", Opportunity "No reviewed facts…", "No interactions recorded…", "No level changes recorded…". Most of the dashboard says nothing.
- **Evidence:** `docs/overhaul/shots-desktop/interact/intel-assembled-1440.png`.
- **Why it matters:** it reads as broken, and it is the default for most of the 173×172 pairs until the import lands.
- **Proposal:** collapse empty sections into one honest line ("No reviewed notes for this pair yet: abilities and cooldowns below"), and give the ability tiles the main width.

**I3 (minor) — the You / Enemy slots.**
- **What you see:** each slot is a 15rem box. "YOU Gwen" sits right-aligned beside the portrait, leaving about 150px empty inside the box. In the empty state, "Choose your champion" wraps to two lines while "Choose the enemy" fits on one (`docs/overhaul/shots-desktop/s1440/intel-1440-open-first.png`).
- **Proposal:** content-sized slots centred on the swap, and shorter labels ("Your champion" / "Enemy").

**I4 (minor) — the champion picker window.**
- **What you see:** 173 portrait slots, many blank while they load. Nothing comes first: no remembered or recent champions, no role filter (`docs/overhaul/shots-desktop/interact/intel-picker-open-1440.png`).
- **Proposal:** placeholder tiles with initials; "Recent" and "Your pool" rows first; a role filter. The role filter also serves the five-role brief in §3.

**I5 (minor) — the title.**
- **What you see:** "Matchup Intel" is a 20px title in a bar, where other destinations have a 24px h1, and there is no role choice yet.
- **Proposal:** align the title size when the role selector arrives (§3).

### Resources (the Library)

**R1 (minor) — /resources.**
- **What you see:**
  - the count appears twice ("All 11" and "11 resources");
  - hosts are cut in narrow columns ("leagueofl…");
  - favicons fall back to letter tiles;
  - every visit logs `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` in the console (Admin → Resources too).
- **Proposal:** drop the duplicate count, put the host on its own line, and serve favicons from a cached same-origin proxy or ship them as assets.

### Settings

**S1 (minor) — the account's avatar.**
- **What you see:** the same account's avatar is olive in the sidebar (rgb 70,81,31) and dark red on Settings (rgb 81,31,33). Measured in the DOM; screenshot `docs/overhaul/shots-desktop/s1440/settings-1440-open-first.png`.
- **Why it matters:** members should look the same everywhere (synthesis P12).
- **Proposal:** seed the colour from the same field (the user id) everywhere.

**S2 (minor) — Settings layout.**
- **What you see:** the content starts at x=336 at 1440 (other pages: 288) and at 535 at 1920 (others: 319 or 393). The title sits in the right column.
- **Proposal:** use the shared frame (X3), with the account card in the frame's first column.

### Admin Mode

**A1 (major) — Users & Permissions → Accounts.**
- **What you see:**
  - **Length:** 2.66 screens at 1440 and 3.07 at 1280.
  - **Form first:** a permanently open "Add account" form (about 300px) sits above the list.
  - **Cards:** each account is a card of about 100px.
  - **Destructive actions:** "Delete profile" and "Erase personal data" are permanently visible in red on every card.
  - **Badges:** up to four coloured badges per row (amber, blue, green).
  - **Filters:** filter chips include those with a zero count.
- **Evidence:** `docs/overhaul/shots-desktop/s1440/a-people-1440-open-full.png`.
- **Why it matters:** this is the admin's main page, and it is the one that most feels like an older app (directive §7).
- **Proposal:**
  - **List first:** a dense table with name, role, status, Riot sync and last sign-in.
  - **Row click:** opens the shared Peek panel with the account's actions grouped: Access, Password, Riot accounts, and a Danger zone behind a disclosure.
  - **"Add account":** a header button that opens the sheet.
  - **Status:** one neutral status column with a single coloured dot.
  - **Zero-count chips:** hidden.

**A2 (minor) — admin section navigation.**
- **What you see:** three different styles:
  - Platform Settings uses the underlined section tabs with icons (the same as Team);
  - Users & Permissions uses pill sub-tabs inside the page;
  - Audit Logs uses plain text tabs.
- **Evidence:** `docs/overhaul/shots-desktop/sheet-admin-1.png`.
- **Proposal:** Users & Permissions sections take the section TabBar; Audit categories become filter chips.

**A3 (minor) — admin "create" flows.**
- **What you see:** three patterns for creating something:
  - Add account is a permanent inline form;
  - Add resource unfolds inline;
  - New access level is a sheet.
- **Proposal:** one pattern: a header button that opens a sheet.

**A4 (minor) — the admin Dashboard and Audit Logs.**
- **What you see:**
  - "Recent admin activity" stretches about 360px beside the quick links;
  - raw data shows in the activity line and in Audit Logs: "(teamMember: true)".
- **Proposal:** let the panel end at its content, and write "added to the team".

**A5 (minor) — developer language in Admin Mode.**
- **What you see:**
  - Personal data mentions "UNIIVERSE_AUTH_SECRET" and "docs/BACKUPS.md", inside a wall of procedure text;
  - System Health shows "LCP/CLS/INP/FCP/TTFB/REDIRECT/SERVER" and "docs/RIOT_COMPLIANCE.md".
- **Proposal:** plain summaries first, with the technical detail behind "Technical details" folds (System Health already does this for part of it).

**A6 (minor) — Branding.**
- **What you see:** Save and Cancel sit at the end of a form 1.64 screens long and are not sticky, so a colour edited at the top shows no save state.
- **Proposal:** a sticky footer bar that appears while there are unsaved changes.

**A7 (minor) — admin routes and hidden pages.**
- **What you see:**
  - `/admin/public-access` redirects into the public site, leaving Admin Mode and its frame;
  - Team insights (`/matches/insights`, "Preview for administrators") has no entry point anywhere (`docs/overhaul/shots-desktop/legacy/insights.png`).
- **Proposal:** map the old address into Admin Mode; link Team insights from Team Matches for administrators, or retire it.

### Public pages

**PB1 (minor) — sign-in, privacy, recover, and the public team header.**
- **What you see:**
  - headings in a different voice: wide letter-spacing on "Sign in", "Privacy" and "Recover the owner account";
  - a tiny header nav: Team · Install App · Sign in at about 12px;
  - the Privacy page is 5.36 screens at 1440, with anchor chips only at its top.
- **Proposal:** the app's h1 style; header links at 14px in the app's nav style; a sticky table of contents on desktop for Privacy.

**PB2 (minor) — the recover page.**
- **What you see:** deployment instructions with an environment variable, shown to anyone.
- **Why it is acceptable:** it is the owner's recovery page.
- **Proposal:** put the instructions behind a fold.

### Defect found on the way

**D1 (minor) — the Filters sheet opened from the pinned row, every desktop size.**
- **What you see:** the "Role played" segmented control is a horizontal scroller inside the sheet, and "Support" is cut off:
  - 428 of 460px visible at 1440;
  - 475 of 509 at 1920;
  - 552 of 591 at 2560.
- **Evidence:** `docs/overhaul/shots-desktop/crop-filters-sheet.png`.
- **Why it matters:** it is a nested scroller in a desktop window with room to spare. The same control fits in the page's Refine popover, which is 544px wide.
- **Proposal:** a 34rem sheet on desktop, or wrap the segments, or icons only for the inactive ones.

## 4. Cross-page findings

**X1 (major) — previews use four containers.** "Look at one item from this list" uses a different container on each page:

| Item | Where it opens | Container |
|---|---|---|
| Champion | All Champions, pools | wide centred modal |
| Player | Team Overview | standard centred modal |
| Player | Players, Leaderboards | full page navigation |
| Game | Match History, Team Matches | inline unfold |
| Game | Leaderboards record | navigates to another page, then a wide modal |
| Encounter | Encounters | in-page drill-down |
| Account | Admin | inline card |

- **What it costs:** the user cannot predict whether their list survives, whether Back closes the preview, or whether they can move to the next item.
- **Proposal:** the shared behaviours in §6.

**X2 (major) — Back does something different for each preview:**
- champion window: pushed, so Back closes it;
- Team player window: no address, so Back leaves the page;
- an open game: the address is replaced, so Back leaves the page;
- record → match window: Back returns from another page;
- Matchup Intel pairs: each pair pushes an entry.

The shared rule in §6 replaces these.

**X3 (minor) — the content's left edge moves between destinations on wide screens.**

| Window | Team hub | Profile, Resources, Admin | Settings | My Profile (empty) |
|---|---|---|---|---|
| 1920, sidebar open | 319 | 393 | 535 | — |
| 1920, folded | 115 | 291 | 433 | — |
| 2560, sidebar open | 414 | 621 | 785 | 950 |

- **What it costs:** titles and tabs jump sideways as you move through the sidebar.
- **Proposal:** one shared frame (100rem, centred). Narrower pages left-align inside it and end earlier, so every page title starts at the same x.

**X4 (minor) — loading skeletons do not match their pages.**
- **What you see:** on client navigation Players and All Champions show the same generic card stack and "Loading…", so the layout jumps when the content arrives (`docs/overhaul/shots-desktop/sheet-transitions.png`).
- **Proposal:** one skeleton per layout: rows, table, board, lineup (synthesis P11).

**X5 (minor) — 11px text is common at 1280 and 1440, where the root is 16px.**
- **What you see:** text nodes under 12px: Matches 283, Match History 479, Team 77, All Champions 51. At 1920 and above the fluid root lifts them to 12.2px or more.
- **Proposal:** a 12px floor for running text and names. Keep 11px only for uppercase labels.

**X6 (minor) — two tooltip systems.**
- **What you see:** InfoTip (styled, keyboard and tap; 33 uses) beside native `title` attributes (67 elements in the profile's main; badges, times, the sidebar rail, Riot's notice). The native ones have the OS delay and look, and do nothing on touch. In the folded rail they duplicate the peek's labels.
- **Proposal:** InfoTip only. Keep `title` as a fallback for cut-off text only.

**X7 (minor) — selects.**
- **What you see:** 15 native `<select>`s in toolbars (game mode, minimum games, base access…) beside custom popovers. They draw differently in WebKit (`docs/overhaul/shots-desktop/sheet-webkit.png`).
- **Proposal:** one Select popover in the app's style. Keep native selects in phone sheets, if the mobile audit prefers them.

**X8 (minor) — too many tab styles.**
- **What you see:** six: section TabBar (underline with icons), view SubTabs (pill), filter segments, window tabs (underline without icons), the open game's tabs (underline), and Audit's text tabs.
- **Proposal:** three tiers, documented as such:
  - places: the underlined section tabs;
  - views of the same data: pill;
  - narrowing: segments or chips.

  The tabs inside a window or an open game disappear under §6 and H2. Admin's deviations are A2.

**Motion (no new finding).**
- In use: window rise (about 200ms) and 140ms exit; the open game's rise-in; the Team card's 460ms turn (polished, `docs/overhaul/shots-desktop/sheet-flip.png`); the sidebar's 220ms glide; no page transitions.
- The disruptive "transitions" are layout jumps (PO1, H2, X3, X4), not animations. Reduced motion is respected.

**Accessibility (no new major finding).**
- axe: 0 violations. The focus ring shows. Skip link first.
- Targets under 24px are inline roster links 14px tall (Matches: 19, Match History: 21), packed 17px apart, so the WCAG 2.5.8 spacing exception does not apply. With a mouse this is acceptable; a 12px floor plus 4px row padding fixes it.
- A window opened by a click takes focus without a ring, as designed.

**Discoverability.**
- Clickable record rows (L4), off-role icons (P1), Team insights (A7), and Matchup Intel's chips (whose tips exist but have no visual cue) are the hidden affordances. Everything else is labelled.

**Unnecessary clicks.**
- **Comparing champions:** close, re-aim and open for each one (C1).
- **Comparing games:** open, scroll about 900px, close at the end or scroll back up, open the next (H2).
- **A record:** leaves the page, and Back is needed to return (L3).
- **Admin:** the Add account form is always in the way (A1).

## 5. Interaction-pattern inventory

| Pattern | Where (desktop) | How it opens | How it closes | Scroll position | Escape | Back | Outside click | Address | Motion |
|---|---|---|---|---|---|---|---|---|---|
| Wide centred modal | champion window (All Champions, pools); match window (records, scoreboard links, lane games); Player Card Studio | row or button click | ✕, Escape, backdrop | page kept; body scrolls inside (champion 975 in 624px) | closes | champion: closes; match from a record: returns from another page | closes | champion: `?champion=` / `?champ=` (push); match: `?match=` on another page | rise ~200ms, exit 140ms, backdrop fade |
| Standard centred modal | Team player window (‹ › switching); Matchup Intel picker and ability Details | card or slot click | ✕, Escape, backdrop | kept; body scrolls inside (player 681 in 589) | closes | player: leaves the page; picker: none | closes | player: none; Matchup Intel pairs push | rise |
| Sheet as a centred window | admin editors and confirmations (Dialog); avatar positioning; Riot accounts; Filters from the pinned row; Edit lineup choices | button | Cancel/✕, Escape, backdrop | kept; body scrolls inside (Manage access 800 in 650) | closes | none | closes | none | rise (slides up on phones) |
| Anchored popover panel | Refine (profile, Match History) | button | Escape, outside click, button again | kept | closes | none | closes | choices in the query (replace) | fade |
| Listbox and menu popovers | "Played with", account menu, ⋯ menus | click, Enter | Escape, outside click, choice | kept | closes | none | closes | none | fade |
| Native select | game mode, minimum, base access, sort | click | OS | kept | OS | none | OS | query (replace) | OS |
| Inline unfold | games (Match History, Team Matches) | card click, Enter/Space | the card again; "Close this game" at the end | revealOpened; close brings the card back | **does not close** | **leaves the page** (replace) | no | `?match=` (replace) | rise-in; **height changes per sub-tab** |
| In-page drill-down | Encounters row → their games | row link | "‹ All encounters" | starts at top | none | returns (link) | no | `?met=` | none |
| Full-page navigation | Players rows, Leaderboards rows, "Full profile" | link | Back | Back restores (tested) | none | returns | no | path | skeleton swap |
| Fold (details/Disclosure) | off roles, Data diagnostics, System technical details, Matchup Intel folds, sources | click | click | in place | none | none | no | none | none |
| Tooltip | InfoTip (33); native title (many) | hover, focus, tap; title: hover with OS delay | leave, Escape | none | closes bubble only | none | yes | none | fade (InfoTip) |
| Toast | saves | system | auto, ✕ | none | none | none | no | none | slide or fade |
| Sidebar peek | folded rail | hover, focus | leave | none | none | none | leave | cookie | 220ms glide |

**Deviations from the proposal in §6**

| Page or component | Today | Under §6 |
|---|---|---|
| All Champions and pools (champion window) | wide modal | Peek |
| Team player window | standard modal, no address | Peek with an address |
| Leaderboards records | navigate, then modal | Peek on the board |
| Leaderboards rows and Players rows | full page | Peek, with "Full profile" inside |
| Encounters row | drill-down | keep as a view, or Peek the opponent |
| Inline games | Escape and Back do not close; height jumps | the unfold rules |
| Admin accounts | inline cards | table plus Peek |
| Admin create flows | three patterns | one sheet |
| Filters from the pinned row | centred modal sheet | anchored popover |
| Selects | 15 native | Select popover |
| Tooltips | native titles | InfoTip |

## 6. One shared set of behaviours

Five containers, chosen by what the content is, never by page.

**1. Peek: a side panel for a quick look at one item from a list or board.**
- **Used for:** champion, player, match from a board, opponent, admin account.
- **Place:**
  - from lg, docked to the right inside `main`, width `clamp(26rem, 34vw, 36rem)`, full height under the frame, sticky;
  - when `main` is at least 70rem wide the list reflows to the remaining width;
  - when it is narrower the panel overlays the list's right side, with a shadow and no dimming.
- **The list stays live:**
  - clicking another row switches the panel's content;
  - ↑/↓ or J/K move the selection;
  - the selected row shows `surface-3` and a 2px accent bar at its left edge.
- **Close:** ✕, Escape (focus in the panel or the list), Back, or the selected row again. An outside click does **not** close it, so scrolling, selecting text or using filters never loses it.
- **Address:** `?champion=`, `?player=`, `?match=` on the current page. Never another page.
  - The first open pushes an entry; switching replaces it; closing pops it if this page pushed it.
  - A deep link opens it.
  - "Open full page" sits inside.
- **Focus:**
  - opened by a click, focus stays on the row and the panel is announced;
  - opened with Enter, focus moves to the panel's heading;
  - Escape returns focus to the row.
- **Scroll:** the page never moves on open, switch or close. The panel scrolls inside only when its content is taller than the window: the one allowed nested scroller, with a sticky header.
- **Motion:**
  - open: a 16px slide and fade, 200ms `--ease-emphasized`;
  - switch: content cross-fades over 120ms and the panel itself stays still;
  - close: 140ms ease-in;
  - reduced motion: instant.
- **Below lg:** the same component, with the same content and address, renders as the mobile audit's sheet or screen.

**2. Unfold: an inline expansion for items compared in a vertical list.**
- **Used for:** games.
- **One at a time.** Opening another keeps the clicked card where it is on screen, compensating for the height of the closing card above it.
- **Close:** the card again, Escape, a compact sticky header (result plus Close) pinned under the section row while the open item is on screen, or Back. The history rule is the same as Peek's.
- **Height:** stable. No sub-tabs that change height (H2). Height animates 0fr→1fr over 200ms and the content fades in over 120ms.

**3. Task dialog: a centred modal for work that needs full attention.**
- **Used for:** editors, confirmations, pickers, Card Studio, file positioning, Install.
- **Kept from today:** the rules are already right (focus trap, Escape, backdrop, Close, focus return, only the body scrolls, actions in the footer).
- **Added:** no horizontal scroller inside on desktop (D1), and no address change.
- **Sizes:** 30rem for forms and confirmations, 42rem for pickers, 76rem only for Card Studio.

**4. Popover: anchored choices.**
- **Used for:** menus, Refine, Select, filter dropdowns, and the pinned row's Filters.
- **Opens** on click, Enter or Space.
- **Closes** on an outside click, Escape, a choice, or the trigger scrolling out of view.
- **No dimming, no address of its own.** Choices replace the query.
- **Style:** `bg-elevated` with a border and shadow; 160ms fade with a 2px slide. One Select component.

**5. Explain: tooltips.**
- InfoTip only: hover with a 200ms delay, focus or tap.
- Escape closes the bubble alone.
- `title` is kept only as a fallback for cut-off text.

**Plus Fold** (native `details`) for secondary content, with the same chevron and spacing everywhere.

Write these into DESIGN_SYSTEM §7 as one table, and give each container one component in `src/components/ui`. Peek is new; Unfold is extracted from `inline-match.tsx`. Every page then uses those components rather than its own state.

## 7. Improvements ranked by player value

| # | Improvement | Fixes | Severity | Effort |
|---|---|---|---|---|
| 1 | The Peek panel, first on All Champions and pools with the simplified §4 content and ↑/↓ switching; then the Team player window, Leaderboards rows and records, and Players rows. One Back, Escape and switching rule. | C1, X1, X2, T5, L3, C3 | major | L |
| 2 | Open game: one stable layout (no sub-tab jumps), Escape and Back close it, sticky compact header with Close; the analysis as went well / went wrong / focus | H2 | major | M |
| 3 | Keep the build on Match History cards at 1280 with the sidebar open; drop the rosters first | H1, H3 | major | S |
| 4 | Profile sections keep one header height, so the tabs never move on a click | PO1 | major | S/M |
| 5 | Team Overview five across from 56rem; tabs and lineup on one edge at ≥1920 | T1, T2 (T3 as an owner A/B) | major / minor | S |
| 6 | Leaderboards: desktop jump links over 1.3 screens; even columns and record values; visible row affordance | L1, L2, L4 (L5 to the tooltip stage) | minor | S |
| 7 | One shared frame width (the left edge never jumps); page-shaped skeletons | X3, X4, S2 | minor | M |
| 8 | Typography floor of 12px; members marked without brand blue; roster target spacing | X5, M2 | minor | S |
| 9 | One Select and one tooltip component; Filters from the pinned row as a popover; fix the clipped role control | X6, X7, M1, D1, H4 | minor | M |
| 10 | Matchup Intel: one honest line instead of four empty panels; fit at 1280; content-sized slots; a picker with Recent, Your pool and roles | I2, I1, I3, I4, I5 | major / minor | S/M |
| 11 | Admin: Accounts as a table plus Peek with a Danger zone; one tab tier; one create pattern; plain language; sticky save; no stray routes | A1–A7 | major / minor | L |
| 12 | Identity and public polish: one avatar seed; public headings and nav in the app's voice; Privacy table of contents; Resources clean-up | S1, PB1, PB2, R1, P1–P3, PO2, PO3, C2, E1, T4, X8 | minor | S |

## 8. Counts and limits

**Counts**

| Severity | Count | IDs |
|---|---|---|
| Major | 9 | X1, X2, T1, PO1, C1, H1, H2, I2, A1 |
| Minor | 43 | T2–T5, P1–P3, L1–L5, M1–M2, PO2–PO3, C2–C3, H3–H4, E1, I1, I3–I5, R1, S1–S2, A2–A7, PB1–PB2, D1, X3–X8 |
| **Total** | **52** | |

- Interaction scenarios probed: about 35.
- axe violations: 0.
- Pages with a nested scroller: 0, at all 8 sizes.
- Pages with sideways overflow: 0.

**Not covered**
- Production, real sign-in, the setup and welcome flows, and invites: the demo signs in automatically.
- Real data volumes.
- Safari beyond a 4-page WebKit spot check.
- Tablet and phone, which are the other audits.
- Sign out is hidden in the local demo's account menu because the demo signs in automatically. It is shown in production, so it is not a finding.
