# UNIIVERSE: mobile and installed-app audit (stage 0, directive §2)

19 Nov 2026. Read-only: nothing in the repository, branches or servers was changed. Demo data is
synthetic; this judges the design, not the numbers.

## Verdict

The phone build is technically sound. Across 220 page states (22 pages at 10 setups) no page is wider
than the phone. The safe areas are respected. Back closes a game, the filter sheet is clean, and
WebKit draws the same frame and windows as Chromium. It does not yet meet the directive's bar, for
four reasons:

- **The structure is a different application.** The desktop sidebar's four entries are My Profile,
  Team (with four sections), Matchup Intel and Resources. A tablet shows the same four. A phone
  instead puts Team's four sections in its bottom bar and hides Matchup Intel and Resources behind
  the avatar, on the account screen. Admin Mode does the same with two admin pages.
- **The first screen is spent on frame and repetition.**
  - The frame alone is 29% of an installed iPhone 15 at rest on a profile, 38% at 150% text and 44%
    on a 320px phone at 150%.
  - Team Overview repeats the team's identity twice in its first 234px and shows one of five
    players.
  - A profile repeats its 86px band on every section.
  - At 320×568 Match History shows no game on its first screen.
- **Opening and closing things is inconsistent, and some of it is heavy.**
  - A game is a full-screen window when the phone is upright, but an inline 2.2-screen scoreboard
    when it is sideways.
  - A season record navigates to another player's page.
  - An encounter is an in-page drill-down.
  - Full-screen windows have no previous or next control and no pull-down to close. In the installed
    iPhone app the only way out is the X in the top-right corner.
- **Large text breaks the navigation's names.** At 125% text the bottom bar drops every label on
  320–393px phones. At 150% the lineup pager shows "Jun…, Bott…, Sup…" and a profile's sections
  scroll "Accounts" off the screen.

The recommended navigation is **N1, "Sidebar mirror"** (§2): a bottom bar of the sidebar's four
entries, Team's sections as a pinned section row, and account items only behind the avatar. It is
the only one of the three designs measured that meets the owner's parity rule. It fits more text
sizes than today's bar, and it costs at most one extra tap, only when reaching a Team section from
outside Team.

**Counts: 9 major and 20 minor findings, plus 9 things that work and should be kept (§6).**

---

## 0. How it was measured

**Builds**
- **http://127.0.0.1:3871** is `origin/ux/matchup-intel-dashboard` 9cce9a33: main, large text, the
  first nav version (Matchup Intel its own sidebar entry), and the Matchup Intel dashboard. Cookie
  `uniiverse_view=player` or `admin`.
- **http://127.0.0.1:3852 did not answer** (connection refused). Leaderboards as one page is
  therefore judged from the code of `origin/ux/leaderboards-dashboard` (a3cbcb22, e.g.
  `src/components/leaderboards/leaderboards-dashboard.tsx`) and from that branch's local live-check
  phone screenshot. That screenshot is at
  `(coordinator scratch)/lbfix/live/phone-leaderboards.png`
  (390 wide, 2,684px tall), with crops at
  `docs/overhaul/shots-mobile/lb1page-a.png`,
  `…/lb1page-b.png` and `…/lb1page-c.png` (same folder). Its desktop shots in `lbfix/after/` and
  `lbfix/shots2/` were also looked at.
- **The newest nav code** is `origin/ux/nav-refinements` 1070faed: "Intel" as the short phone label,
  and account rows that wrap. It is not in the 3871 build. Where a finding is already fixed there, it
  says so.

**Setups**, Chromium 1243 with `hasTouch` and `isMobile` and an iPhone user agent. The installed app
is emulated as `e2e/install-app.spec.ts` and `e2e/account-screen.spec.ts` do it:
`navigator.standalone`, `matchMedia('(display-mode: standalone)')` stood in for (Chromium cannot
emulate the CSS display mode), and safe areas set through CDP
`Emulation.setSafeAreaInsetsOverride`.

| Key | Size | Insets (top/bottom/left/right) | Stands for |
|---|---|---|---|
| se1 | 320×568 | 20/0/0/0 | iPhone SE 1st gen, installed |
| se3 | 375×667 | 20/0/0/0 | iPhone SE 3rd gen, installed |
| i12 | 390×844 | 47/34/0/0 | iPhone 12–14, installed |
| i15 | 393×852 | 59/34/0/0 | iPhone 15, installed |
| max | 430×932 | 59/34/0/0 | iPhone 15 Pro Max, installed |
| land | 852×393 | 0/21/59/59 | iPhone 15 sideways, installed |
| i15s | 393×659 | none | iPhone 15 in Safari's tab (first-screen comparisons) |

**Text size**
- 100% and 150% were set with Chromium's `Page.setFontSizes`, the browser's own text size, which is
  what a real setting changes. The breakpoints move with it, as on a real phone.
- 125% was spot-checked on se3, i15 and max.

**WebKit 2370** was used for a spot check at 393×852: Team, Match History, Leaderboards, the game
window and the account screen.

**What was recorded**
- 22 pages (15 Player Mode, 7 Admin Mode) × 10 setups.
- For each page state: the page's height in screens; sideways overflow; the frame's heights; nested
  scroll regions; and touch targets under 44px. The `touch-target` utility's 44px `::after` counts
  as part of a target.
- Opening, inspecting and closing items, measured by taps and scroll distances.
- Navigation fit, computed from label widths measured with the app's own Inter font. The widths were
  calibrated against the code's own measured 19.13–19.64rem for today's five tabs (`TAB_FIT` in
  `mobile-nav.tsx`).

**Raw data and scripts** are in
`docs/overhaul/mobile-scripts/`:
- `out-sweep.json`
- `out-interact.json`
- `out-more.json`
- `out-final.json`
- `out-navfit.json`
- `s1…s10*.cjs`

**Screenshots** are all in
`docs/overhaul/shots-mobile/`,
named `<page>-<setup>-<text>.png` (e.g. `team-i15-100.png`, `p-history-se1-100.png`). Interaction
shots are named `open-*`, `sheet-*`, `account-*`, `intel-*`, `tip-*`, `land-*` and `webkit-*`. The
findings below name files in that folder.

---

## 1. Team Overview on a phone against its desktop design (the benchmark)

Desktop reference (1440×900):
`docs/overhaul/shots-mobile/desk-desk-team.png`.
The phone is `team-i15-100.png`, `team-se1-100.png`, `team-i15s-100.png`, `team-land-100(-full).png`,
`team-i15-150.png`, `team-land-150.png` and `team-i15-125.png` (same folder).

| Element | Desktop 1440×900 | Phone 393×852 installed | Verdict |
|---|---|---|---|
| Identity | Sidebar brand, then in the page: eyebrow "TEAM OVERVIEW" (12px, accent, tracking 1.44px), 80px logo tile, h1 "Team Hub" 36px/700 | Top bar: 36px mark + "TEAM HUB" wordmark. Then the page: 48px logo + h1 22px/700. Eyebrow visually hidden | **Repeated**: two team marks and two team names within the first 234px (bar 112 + header 102 + gap) |
| Scope and status | "Main lineup · Season 2026" 14px; "Lineup complete" chip 14px with ⓘ; "Edit lineup" 103×28 outline button at the right | 12px; chip 12px; Edit lineup 107×44 (touch) on the line under the name | Good adaptation; at 150% the chip wraps to two lines |
| Lineup | Five 214×469 art cards in one row; the whole team at a glance; page = 1.00 screen | A 58px role pager (Top · Jungle · Mid · Bottom · Support, icons + role names, no players) over a swipe track: one 337×385 card and a 12px peek | **One of five players on the first screen.** The desktop's core value, the whole lineup at a glance, is lost; seeing the team takes 4 swipes or taps |
| Card styling | 16px radius, hairline border, splash art, role chip 14px/600/1.68px, 60px avatar ring, name 18px/600, rank + "Main Role" chip | Same tokens; name 20px; same role chip | Faithful |
| Statistics panel | WIN RATE 24px/700 (green ≥50%), KDA, CS/MIN; label 11px, tracking **0.44px**; record; bar; games | Same 24px figures, plus the K/D/A line; label 11px, tracking **1.32px** | Typography drift (the same label tracked differently); the extra K/D/A line is fine |
| Pool | "TOP POOL 6 >"; first champion + 1 portrait | First champion + 5 portraits | Fine |
| Atmosphere | Ambient light, the "TEAM HUB" watermark at the foot | Ambient light, no watermark | Fine |
| Fit | 1.00 screen | 393×852: 1.00 (52px empty above the tab bar). 393×659 Safari: the pool row is cut by about 48px. 320×568: **the statistics panel is under the tab bar** (card bottom 668 vs tab top 511). 852×393: **2+2+1 grid, 3.46 screens, Support alone centred on the last row**. 852×393 at 150%: **no card on the first screen** (header + pager only) | See T1–T4 |

**T1 (major): the phone's Team Overview does not show the team.**
- **Where:** Team, every upright phone.
- **What the user sees:** the first screen names one player (`team-i15-100.png`). The pager shows role
  names, not people. Seeing the lineup takes four swipes, and a 320px phone cannot show even the first
  card's figures (`team-se1-100.png`).
- **Why it matters:** the desktop's whole lineup at a glance is the page's purpose and premium
  identity. The phone keeps the card styling but loses the overview.
- **Proposal:**
  - Turn the role pager into a **lineup pager**: five 44–48px segments, each the player's picture
    with the role's icon as a badge, the first name under it, and the role named for screen readers.
    The whole team is then visible in 58px, and a tap still selects the card.
  - Shorten the card on phones by 60–80px: art band 168 → about 120px, the avatar beside the name
    instead of above it. The whole first card then fits 393×659 and the identity and figures fit
    375×667.
  - Measure against the existing P7 target ("the whole first Team card at 375×667 and 393×659").
    It is currently missed at 393×659 by about 48px.

**T2 (major): duplicate team identity on phones.**
- **Where:** Team, upright and sideways.
- **What the user sees:** the bar's mark and "TEAM HUB", then a 48px logo and "Team Hub" directly
  under it (102px).
- **Why it matters:** synthesis rule P12 already says "the team mark lives in the frame; a page header
  directly under it does not repeat it on phones". It costs 100px of the first screen.
- **Proposal:**
  - On phones, drop the header's logo and h1 visually (keep the h1 for screen readers). The bar carries
    the identity.
  - Keep one 44px line: "Main lineup · Season 2026 · ● Lineup complete ⓘ" with Edit lineup as a 44px
    icon+label button at its end.
  - Expected gain: about 90px, i.e. the whole first card at 393×659 even before T1's card change.

**T3 (major): sideways Team is a long 2+2+1 grid with an orphan.**
- **Where:** 852×393 (`team-land-100-full.png`, `team-land-150.png`).
- **What the user sees:** two cards a row, each 361×385 (98% of the window's height). Support is alone
  and centred. 3.46 screens. At 150% text the breakpoints move and the first screen is header and
  pager only.
- **Why it matters:** the phone is at its widest, yet shows the least of the team. The orphan breaks P5
  ("never a tile grid that leaves an orphan"). The synthesis's decision C14 was a sideways track.
- **Proposal:**
  - Sideways, show the five desktop cards in one sideways track (2.3 visible at 852px).
  - Or, better, the desktop's five-across row in a compact variant (art 96px, figures in one line). It
    fits five 140px cards in 734px of usable width.
  - Never a centred orphan.
  - At 150% text keep the track, not the upright pager layout.

**T4 (minor): large text truncates the lineup pager.**
- **Where:** Team at 125–150%.
- **What the user sees:** 150% shows "Jun…", "Bott…", "Sup…" (`team-i15-150.png`); 125% on a 375px
  phone cuts "Support". The chip "Lineup complete" also wraps to two lines.
- **Why it matters:** ellipsized navigation looks cheap and hides names.
- **Proposal:** with T1's lineup pager, the segment's label is a first name that may be cut, since the
  picture carries the identity. Under 18rem of pager, show the pictures with role badges alone, and
  keep the names for screen readers.

**T5 (minor): stat-label tracking differs between desktop and phone.**
- **What the user sees:** WIN RATE, KDA and CS/MIN are 11px on both, but tracked 0.44px on desktop and
  1.32px on phones.
- **Proposal:** one token (`tracking-label`) at every width, as `design-tokens.test.ts` already
  requires for uppercase labels.

---

## 2. Navigation parity

### 2.1 The map today (3871 build; the nav-refinements tip has the same structure)

| | Desktop sidebar | Tablet top bar (768–1023) | Phone upright | Phone sideways (≤480px tall) |
|---|---|---|---|---|
| L1 destinations | **My Profile** (CircleUserRound) · **Team** (Users) · **Matchup Intel** (Swords) · **Resources** (BookMarked) | **The same four** | Bottom bar: **Team** (Users) = Team Overview only · Players · Leaderboards · Matches · **Profile** | Compact bar: the phone's five |
| Team's sections | Tabs at the top of every Team page: Overview (LayoutGrid) · Players · Leaderboards · Matches | Pinned tabs in the page | Four of the five bottom tabs ("Overview" is called "Team") | The bar's destinations |
| Profile sections | Bar under the card: Overview · All Champions · Match History · Riot Accounts | The same | Second top-bar row: Overview · Champions · History · Accounts | Second row |
| Matchup Intel, Resources | Sidebar entries | Top-bar destinations | **Account screen** (avatar → rows), with Settings | Account screen |
| Account | Sidebar footer: Switch to Admin Mode, Install App, account tile (→ Settings, Sign out), patch and Riot notice | Avatar menu | Avatar → account screen | Avatar → account screen |
| Back for a page opened directly | Browser | Browser (installed: Back) | Resources, Matchup Intel and Settings say **"‹ Team"** (`resources-i15-100.png`, `intel-i15-100.png`, `settings-i15-100.png`) | Same |
| Admin Mode | Dashboard · Users & Permissions · Platform Settings · Data & Integrations · System Health · Audit Logs | Dashboard · Users · Platform Settings · Health + avatar menu (Data, Audit) | Bottom: Dashboard · **Users** · **Settings** · **Health**; account screen: **Data & Integrations, Audit Logs**, Settings (the account's own), Return to Player Mode (`account-i15-admin.png`) | Same four |

**N0 (major): the phone's structure is the only one that differs.**
- **Where:** every phone page.
- **What the user sees:**
  - **Names differ.** "Team" means the whole hub on desktop but Team Overview on a phone. "My Profile"
    is "Profile". In Admin Mode, "Users & Permissions" is "Users", "Platform Settings" is "Settings"
    (which then clashes with the account's own "Settings" two taps away) and "System Health" is
    "Health".
  - **Grouping differs.** Team's sections are promoted to top level; My Profile moves from first to
    last.
  - **Logic differs.** Ordinary destinations (Matchup Intel and Resources in Player Mode; Data &
    Integrations and Audit Logs in Admin Mode) sit inside the account screen. Opened directly, they
    claim Team as their parent ("‹ Team").
  - **Sideways differs from a tablet.** An 852px-wide sideways phone shows a different destination
    set from a 768px tablet.
  - **The account screen is half empty.** At 100% its rows end at y≈430 of 852 (`account-i15-player.png`).
- **Why it matters:** this is the directive's explicit rule ("Resources and other ordinary
  destinations must not be hidden inside account/profile settings"; "users should not need to
  relearn where features are located"). Matchup Intel is now a top-level product, by the owner's
  decision of 18 Nov, and on a phone it is two taps deep behind an account picture.
- **Proposal:** N1 below.

### 2.2 Three phone designs, measured

**Fit rules, taken from the app's components**
- A bottom tab takes at least its label + 8px, or its 48px icon pill (`min-w-max flex-1`).
- A section row tab takes its label (text-sm, 14px medium) + 12px, in the screen width less 16px of
  gutters.
- A sideways destination is 24px icon + 6px + label + 16px, with brand, avatar and gaps taking 128px.

**Width needed in rem** (independent of the text size; label widths measured with the app's Inter at
11px semibold and calibrated ×1.09 to the code's own measurement):

| Set | Needs |
|---|---|
| Today's five (Team, Players, Leaderboards, Matches, Profile) | 19.13–19.64rem; threshold set at 20rem |
| N1: My Profile, Team, Matchup Intel, Resources | ≈17.4rem |
| N1 short labels: Profile, Team, Intel, Resources (full names read out) | ≈14.2rem |
| N2: the four + Account | ≈21.0rem (short labels ≈17.8rem) |
| N3: today's five, with "My Profile" | ≈20.1rem |
| Admin, four: Dashboard, Users, Platform, System | ≈14.7rem |

**Bar width available in rem**

| Phone | 100% | 125% | 150% | 200% |
|---|---|---|---|---|
| 320 | 20 | 16 | 13.3 | 10 |
| 375 | 23.4 | 18.8 | 15.6 | 11.7 |
| 390 / 393 | 24.4–24.6 | 19.5–19.7 | 16.3–16.4 | 12.2–12.3 |
| 430 | 26.9 | 21.5 | 17.9 | 13.4 |

**Bottom bar keeps its labels at…**

| Design | 320 | 375 | 390/393 | 430 |
|---|---|---|---|---|
| Today's five | 100% only | 100% only | 100% only (**measured: icons alone at 125% on 375 and 393**) | 100%, 125% |
| **N1 (full names)** | 100% | 100%, 125% | 100%, 125% | 100–150% |
| **N1 with the short step** (Profile, Intel; full names read out) | 100%, 125% | 100–150% | 100–150% | 100–150% |
| N2 (full / short) | short only at 100% | 100% (short to 125%) | 100% (short to 125%) | 100–125% (short to 150%) |
| N3 (five + "My Profile") | short labels needed | 100% | 100% | 100%, 125% |

**Section row (Team: Overview · Players · Leaderboards · Matches)**
- It needs 312px at 100%.
- It fits 375–430.
- On a 320px phone it fits with 4px less padding a tab: 296px.
- From 125% it scrolls sideways with the current tab kept in view, as the profile row does today.
  See S1 for the hidden-item fix.

**Sideways compact bar** (568×320, and 852×393 with 734px usable between the notches):

| Text | Today's five | N1 (four) | N3 (five + 2 icons) |
|---|---|---|---|
| 100% | 581px: on a 568px phone only the current one is labelled | **524px: all four labelled on 568** | 689px |
| 125% | 637px | 577px (all labelled on 852) | 749px: no |
| 150% | 693px | 630px (all labelled on 852) | 810px: no |
| 200% | 804px: current only | 736px: current only | no |

**Taps for the ten most common journeys**, counted from the app's landing page (Team Overview):

| # | Journey | Today | N1 | N2 | N3 |
|---|---|---|---|---|---|
| J1 | See the lineup | 0 | 0 | 0 | 0 |
| J2 | Open my latest game (My Profile → History → game) | 3 | 3 (2 with section memory) | 3 | 3 |
| J3 | A teammate's profile (Players → row) | 2 | 2 (3 from outside Team; 2 with section memory) | 2 | 2 |
| J4 | Recent form (Leaderboards) | 1 | 1 (2 from outside Team) | 1 | 1 |
| J5 | Open a game we played together (Matches → game) | 2 | 2 (3 from outside Team) | 2 | 2 |
| J6 | Matchup Intel | **2** (avatar → row) | **1** | **1** | 1 (top-bar icon) |
| J7 | Open a Resources site | **3** | **2** | **2** | 2 |
| J8 | A champion's matchups (My Profile → Champions → champion → Matchups) | 4 | 4 | 4 | 4 |
| J9 | Settings | 2 | 2 | 2 (Account tab) | 2 |
| J10 | Admin Mode → Users | 3 | 3 | 3 | 3 |
| | **Total from the landing** | **22** | **20** | **20** | **20** |
| | Total from My Profile (worst case for N1, no section memory) | 22 | 23 | 23 | 21 |

#### N1 "Sidebar mirror": recommended

- **Bottom bar.** My Profile · Team · Matchup Intel · Resources, in the sidebar's order, with its icons
  and its names. On 320px at 125% and on ≤393px at 150%, the bar shows "Profile" and "Intel" with the
  full names read out (the nav-refinements branch already has `short: "Intel"`). Icons alone only
  where even the short names do not fit: 200%, or 150% on 320.
- **Team's sections** are a 44px pinned second row in the top bar on every Team page, the same
  component as the profile's sections row (`ChromeTabs`). They carry the desktop's names and icons
  (Overview · Players · Leaderboards · Matches). The Team tab reopens the last Team section used in
  this session. A second tap goes to Overview (the iOS per-tab state pattern).
- **Account items only behind the avatar:** Settings, Install App, the mode switch, Sign out, the
  patch line and the notice. That is exactly the desktop sidebar's footer and account menu.
- **Back for a page opened directly** goes to its real parent: Matchup Intel and Resources have none
  (they are destinations); Settings goes to the page before, or home.
- **Sideways:** the compact bar carries the same four (all labelled on a 568px phone at 100%, which
  today's five cannot do), with Team's row as the second row.
- **Admin Mode, on both desktop and phone:** Dashboard · Users & Permissions ("Users") · Platform
  Settings ("Platform") · System. "System" is a hub with Health · Data & Integrations · Audit Logs as
  its sections, which needs 279px at 100% and fits 320. The desktop sidebar regroups the same way, so
  both say "System". The two "Settings" clash ends.
  - If the owner prefers not to regroup the desktop, Admin Mode can use five tabs (Dashboard, Users,
    Platform, Data, Health), with Audit Logs as a section of System Health. Fit ≈18rem: labels at 100%
    on every phone.
- **Height.** +44px on Team pages for the section row, offset by not repeating the selected section
  as an h1 block on phones (Players, Matches and Leaderboards each spend about 70–90px on title and
  scope). Net about 0 to −45px. Team Overview loses its duplicate header (T2, −90px).
- **Why recommended:**
  - It is the only design that satisfies the parity rule: desktop sidebar, tablet bar and phone bar
    show the same four entries with the same names, icons and grouping.
  - Its labels survive larger text sizes than today's bar.
  - Matchup Intel and Resources become one tap.
  - The only cost is +1 tap to a Team section when coming from outside Team, and section memory
    removes it for the common "go back to where I was" case.

#### N2 "Sidebar mirror + Account tab"

- **Structure:** N1's four plus a fifth tab, "Account" (your picture). The top bar then holds only
  Back, the title and page actions.
- **For:** account items in thumb reach. It matches the desktop, whose account tile is at the
  sidebar's foot. It gives the top bar more room at large text.
- **Against:**
  - Five labels need ≈21rem: full names fit only from 375px at 100%, and short labels are needed at
    320 and from 125%.
  - Two personal tabs ("My Profile" and "Account") side by side invite confusion.
  - Taps are equal to N1.
- **Verdict:** a reasonable alternative if the owner wants the avatar out of the top bar.

#### N3 "Keep today's five, surface Intel and Resources in the top bar"

- **Structure:** today's bar unchanged (Team, Players, Leaderboards, Matches, My Profile), with Matchup
  Intel and Resources as two 44px icon buttons in the top bar beside the avatar.
- **For:** the fewest taps from anywhere (Team sections stay one tap: 20 from the landing, 21 from My
  Profile) and no relearning for current users.
- **Against:**
  - It fails the parity rule: "Team" still means Overview; the hub, its grouping and the order all
    still differ.
  - The two new destinations are unlabelled icons at the top of the screen, far from the thumb and
    weak for discovery.
  - The top bar on a teammate's page needs Back "‹ Players" + title + 2 icons + Filters + avatar: about
    292px at 100%, 320px at 150% (the title must disappear), 348px at 200% (overflows 320).
  - The bar keeps today's text-size weakness (labels lost at 125% on ≤393px).
- **Verdict:** not recommended.

---

## 3. Every other page

**Page height in screens** (the page's scroll height over the window's height; installed setups
unless noted):

| Page | se1 320×568 | se3 375×667 | i15 393×852 | max 430×932 | land 852×393 | i15s 393×659 (Safari) | i15 150% | se1 150% |
|---|---|---|---|---|---|---|---|---|
| Team | 1.30 | 1.11 | 1.00 | 1.00 | **3.46** | 1.10 | 1.37 | 2.16 |
| Players | 1.67 | 1.43 | 1.20 | 1.10 | 1.42 | 1.41 | 2.12 | 3.84 |
| Leaderboards: Recent form (two-view build) | 2.13 | 1.73 | 1.33 | 1.20 | 2.15 | 1.57 | 2.98 | 5.28 |
| Leaderboards: Records (two-view build) | 4.53 | 3.33 | 2.69 | 2.43 | 4.20 | 3.33 | 5.89 | **9.76** |
| Leaderboards as one page (branch; from its screenshot and docs) | — | 4.16 | ≈3.15 (2,684px at 390 wide) | — | — | — | — | — |
| Team Matches | 2.77 | 2.15 | 1.77 | 1.60 | 3.43 | 2.14 | 3.33 | 5.78 |
| Profile Overview | 4.03 | 3.17 | 2.57 | 2.33 | 4.22 | 3.18 | 4.93 | **8.77** |
| All Champions | 2.19 | 1.61 | 1.32 | 1.21 | 1.83 | 1.56 | 2.94 | 5.06 |
| Match History | 3.70 | 2.66 | 2.15 | 1.96 | 4.27 | 2.63 | 5.07 | **8.57** |
| Encounters | 2.13 | 1.79 | 1.48 | 1.36 | 2.69 | 1.78 | 2.65 | 4.28 |
| Riot Accounts | 1.39 | 1.13 | 1.00 | 1.00 | 1.55 | 1.11 | 1.62 | 2.38 |
| Resources | 2.54 | 1.95 | 1.55 | 1.38 | 1.91 | 1.86 | 3.31 | 5.32 |
| Matchup Intel (nothing chosen) | 1.58 | 1.28 | 1.04 | 1.00 | 1.56 | 1.20 | 2.11 | 3.26 |
| Matchup Intel (assembled pair) | 2.85 | 2.22 | 1.76 | 1.53 | 2.52 | 2.13 | 3.61 | 6.14 |
| Matchup Intel (curated Gwen vs Ornn) | 4.75 | — | 2.72 | — | — | — | — | — |
| Settings | 2.58 | 2.09 | 1.70 | 1.54 | 2.41 | 2.06 | 2.88 | 4.80 |
| Admin: Dashboard | 3.76 | 2.93 | 2.38 | 2.15 | 3.64 | 2.93 | 4.57 | 7.70 |
| Admin: Users & Permissions | **9.81** | 7.19 | **5.59** | 5.17 | 7.27 | 7.09 | 11.66 | **19.51** |
| Admin: Platform Settings (Branding) | 6.37 | 5.01 | 3.87 | 3.44 | 5.95 | 4.86 | 7.37 | 12.12 |
| Admin: System Health | 5.93 | 4.24 | 3.37 | 3.02 | 4.87 | 4.21 | 6.57 | 11.19 |

**Frame at rest** (top bar + profile sections + bottom bar):

| Setup | Profile pages | Team |
|---|---|---|
| i15 | 247px = **29%** | 203px = 24% |
| se1 | 174px = 31% | — |
| i15 at 150% | 323px = **38%** | — |
| se1 at 150% | 250px = **44%** | — |
| Sideways at 100% (bars slide away on scroll) | 89px = 23% | 45px = 11% |

### Frame and profile

**S1 (major): the frame and repeated headers eat the first screen of every profile page.**
- **Where:** the profile's Overview, Champions, History and Accounts, upright, worst at 320 and at
  150% text.
- **What the user sees:**
  - The frame takes 29–44% of the screen and never hides upright.
  - The profile band (86px at 393, about 150px at 150% where "· 70 LP" drops to its own line) is
    repeated on every section.
  - At 320×568 Match History's first game starts behind the tab bar: no game on the first screen
    (`p-history-se1-100.png`).
  - At 320 the Overview's figures start at the tab bar (`p-overview-se1-100.png`).
  - At 150% the sections row scrolls "Accounts" off the screen with only "Ac" showing
    (`p-history-i15-150.png`).
- **Why it matters:** "aim to present the most important information within the initial screen". A
  player opens History to see games.
- **Proposal:**
  1. On Champions, History and Accounts, collapse the band into the top bar: the name is already the
     bar's title once scrolled. Show it from the first paint there as "‹ Players · Demo ADC" with the
     rank in the subtitle, and keep the full band on Overview only. Saves 86–170px.
  2. Upright, let the top bar's first row slide away on scroll down and come back on scroll up, keeping
     the sections row pinned. This is already the sideways behaviour, and it challenges synthesis C1.
     Apply it at least from 125% text and on phones under 700px tall.
  3. At large text, replace a sections row that would scroll with a 44px "Section: History ▾" button
     opening a sheet of the four. No hidden items, one extra tap only for those who need it.

**S2 (minor): Filters alone on a row.**
- **Where:** Profile Overview (`p-overview-i15-100.png`) and All Champions (`p-champions-i15-100.png`).
- **What the user sees:** a 44px Filters button on its own line under a two-line scope (about 70px).
- **Why it matters:** this breaks P5 ("never give a row to a single control").
- **Proposal:** put Filters at the end of the scope line, as Match History does. On Champions, put it in
  the search/sort row (search + "Games ▾" + Filters icon).

### Players
- Good: 64px rows, about 7 on the first screen at 393, pictures, role, rank and pool on one line
  (`players-i15-100.png`).
- **P1 (minor):** at 150% the search placeholder reads "Searc…" and rows take 2.5 per screen. Sideways
  (852 wide), the toolbar switches to the tablet's role segmented control and the "Main lineup" and
  "Archived" chips (38px tall, under the 44px rule) instead of Filters (`players-land-100.png`). See
  X3 for the filters inconsistency.
  - **Proposal:** at large text, put the search on its own full-width line with "Filters" beside the
    title. Use one filter UI on every phone posture (X3).

### Leaderboards (one page, judged from code and screenshots: 3852 was down)
- Good: Recent form's 64px rows with the 20-game line along the foot. The records are 77–93px cells.
- **L1 (minor): the one page is 3.2 screens at 390×844 and 4.2 at 375×667.**
  - **What the user sees:** the section index ("Season records · Multikills · Milestones") sits only
    under the title. In `leaderboards-dashboard.tsx` it is an in-flow `SectionIndex`, not pinned. From
    Milestones, reaching Records means going back to the top first.
  - Milestone chips show a portrait and "428K" without the champion's name. Several portraits are
    empty squares in the live screenshot: blocked by the environment, but the empty slot is what the
    design shows when an image fails (`lb1page-c.png`).
  - The multikills note runs to three lines ("From the 255 of 277 games this season that carry Riot's
    multikill figures…").
  - **Proposal:** on phones, pin the section index as a 44px chip row under the top bar once the title
    has scrolled away (the Settings `SectionIndex` pattern, with the current section marked). Show
    each member's top milestone plus "+N". Move the coverage note behind the board's ⓘ.
- Two-view build: Records 2.69 screens (9.76 at 320 and 150%) and Recent form 1.33. Superseded by the
  one page.

### Team Matches
- Good: one header line per game, 40px member rows; 1.77 screens (`matches-i15-100.png`).
- **TM1 (minor): the member names inside a game card are links.**
  - **What the user sees:** the card is a full-size button (359×232), and each member's name is a
    40px link over it. A tap on a name opens that player's profile instead of the game. At 320 a tap
    at the card's centre landed on "Demo Jungle" and opened his profile
    (`open-teammatch0-se1-top.png`). The links cover about 19% of the card, where thumbs land.
  - **Why it matters:** two targets in one gesture area. A mis-tap means a page change and a Back.
  - **Proposal:** on touch screens the whole card opens the game; names link inside the game window,
    where the scoreboard already lists all ten.
- **TM2 (minor):** the Solo/Duo caveat ("Ranked Solo/Duo allows parties of two at most…") adds two
  lines to each such card. Move it behind the result line's ⓘ.

### Profile Overview, All Champions, Encounters, Riot Accounts
- **PO1 (minor): the Overview stacks four full boards** (season figures: six tiles and five kill
  counts; Recent form; Ranked progress; Roles & pools) = 2.57 screens at 393 and 8.77 at
  320/150% (`p-overview-i15-100-full.png`).
  - **Proposal:** lead with the six key figures and Recent form. Fold the multikills into one "Double
    19 · Triple 3 · Quadra 1 · Penta 0" line. Keep Ranked progress and pools below.
- **AC1 (minor): All Champions rows are 100px with five statistics and mastery**
  (`p-champions-i15-100.png`).
  - **Why it matters:** the directive's All Champions brief is identity, games and personal win rate,
    with matchups in the panel.
  - **Proposal:** a 56–64px row of portrait, name and role, games, win rate. The other figures go in
    the champion panel.
- **E1 (minor): Encounters repeats its first row.** The "Most games against Demo Duo 2#DEMO 10 · 5W 5L
  50%" card repeats the list's first row (`p-encounters-i15-100.png`).
  - **Proposal:** drop the card on phones, or make it the list's pinned first row.
- **RA1 (minor): Riot Accounts opens with a six-line explanation paragraph** (`p-accounts-i15-100.png`).
  - **Proposal:** one line ("Main account first; every linked account adds its games") with the rest
    behind ⓘ.

### Matchup Intel (layout only; content is the Matchup Intel audit's)
- Good: the slots are compact; the picker is a full-screen grid with a 16px search
  (`intel-picker-i15.png`).
- **MI1 (minor): the pair page spends its first screen on controls and status.**
  - **What the user sees:** "Remember Darius" alone on a row. A meta line of "Patch 26.22 · Riot Data
    Dragon 16.22.1 · Assembled reference" over two lines. The slots are not pinned, so changing a
    champion after reading means scrolling back up. The curated briefing is 2.72 screens at 393 and
    4.75 at 320 (`intel-pair-i15-100.png`, `intel-curated-i15.png`).
  - **Proposal:**
    - Pin a compact pair bar (two 40px portraits and the swap) under the top bar once the slots scroll
      away.
    - Turn "Remember" into an icon toggle on the "You" slot.
    - Fold the meta line into the source footer.
  - Back for Matchup Intel opened directly says "‹ Team" (N0).

### Resources
- Good: rows with icon, title, host and star; the whole row opens.
- **R1 (minor): the section index hides most of the sections.** It is a sideways-scrolling chip row:
  4 of 7 sections are off the screen at 393 (Summoner's Rift, ARAM, Arena, Esports) and 5 of 7 at 320.
  Its chips are 38px tall.
  - **Proposal:** wrap the chips onto two lines on phones (seven chips ≈ two lines at 393), or replace
    the row with a "Section ▾" select. Make the chips 44px.
- Opened directly, it says "‹ Team" (N0).

### Settings and the account screen
- **ST1 (minor): Settings leads with paragraphs.** The lead card carries a four-line paragraph about
  the picture, and each field has two to three lines of help (`settings-i15-100.png`). Back says
  "‹ Team" when opened fresh.
  - **Proposal:** one-line help under fields (the rest behind ⓘ). Use "‹ Back to the page before"
    logic.
- **AS1 (minor): the account screen.**
  - Its rows end at y≈430 of 852; the lower half is empty (`account-i15-player.png`).
  - At 150% "Switch to Admin M…" is cut (`account-i15-150.png`). This is fixed on
    `origin/ux/nav-refinements` 0c0cb5b4, where rows wrap, but not in this build.
  - With N1 the screen holds account items only and stays short. Give it the brand presence the
    desktop footer has: the patch line and a small team mark.

### Admin Mode on phones
- **AD1 (major): Users & Permissions is an endless, risky list on a phone.**
  - **What the user sees:** 5.59 screens at 393, 9.81 at 320, 19.5 at 320 with 150% text.
    - The "Add account" form is always open at the top (about 620px).
    - Nine status chips wrap into four rows (about 160px).
    - Each member card is about 240px and carries "Delete profile", "Erase personal data" (in red)
      and "Archive profile" as one-tap text buttons (`crop-a-people-cards.png`,
      `a-people-i15-100-full.png`).
  - **Why it matters:** the directive's rules are "everyday tasks simple and advanced operations
    appropriately protected" and "Admin must never feel like a separate, outdated application".
  - **Proposal:**
    - Show members as the Players-style 64px rows (picture, name, role, status chips). A row opens the
      member's admin screen (full-screen window) with actions grouped and destructive ones behind a
      confirmation.
    - "Add account" becomes a primary button that opens a sheet.
    - The status chips move into the Filters sheet, with the narrowed ones shown as chips.
- **AD2 (minor): Admin pages repeat themselves and keep desktop copy.**
  - "ADMIN MODE" appears twice: in the bar and as every page's eyebrow.
  - Descriptions are kept under titles ("The state of the platform at a glance."), though Player Mode
    hides them on phones.
  - The Branding page shows the eyebrow "PLATFORM SETTINGS", the tab "Branding" and the h1 "Branding".
  - System Health's status cards are 135px each: 3.37 screens (`a-system-i15-100.png`,
    `a-branding-i15-100.png`).
  - **Proposal:**
    - Show the mode once (the bar). Drop the eyebrow and description on phones.
    - Status cards become 56px rows (name, state chip, one line), opening the evidence.

---

## 4. Opening, inspecting, closing and switching (measured)

| Item | Setup | Scroll to reach it | Reading inside | Closing | List position after closing |
|---|---|---|---|---|---|
| Game, from Match History | i15 | 0 (1st game); 0.26 screen (5th) | Full-screen window. The fixed header (result, chips, spells, runes, items) is 235px + the 59px inset = 34% of the screen. Scoreboard 2.39 screens of a 558px body; Analysis 2.46; Timeline 1.0; Build 1.0. **Tabs scroll away.** | X fixed at the top right (44px, y 68) or browser Back; 0 scrolls | 1st kept; 5th **moved 70px** |
| Game | se1 | 0.05 / 1.08 screens | The window scrolls as one: 2.89 screens. The close button stays; tabs scroll away. **"Scoreboard" (82px of text) overruns its 70px tab and touches "Analysis"**; tile labels cut ("31% of the …", "6 wards pla…") (`open-history0-se1-tab0.png`) | X | moved 89 / 94px |
| Game | land 852×393 | — | **Opens inline under its card: +854px = 2.17 screens** (`open-history0-land.png`, `land-inline-game-end.png`) | **Scroll back 2.26 screens** to the card | — |
| Game, from Team Matches | i15 | 0 / 0.23 | Window, 2.30 / 2.27 screens | X | 4th moved 93px |
| Game, from a season record | i15 | 0 | Window, 2.42 screens | X leaves you **on the record holder's Match History** (the record is a link to `/players/<holder>/matches?match=…`); a further Back to return | — |
| Champion, from All Champions | i15 | 0 / 0.14 | Window. Fixed header 193px + inset; Overview 2.7 screens (6 tiles, 4 multikill tiles, the lane timeline table); Matchups tab (`open-champion0-i15-top.png`) | X | kept |
| Champion | se1 | 0.02 / 0.85 | **The header takes 241px (42%); the body shows 327px: 5.68 screens of nested scrolling** (`open-champion0-se1-top.png`) | X | kept |
| Champion | land | — | Scrolls as one: 3.7 screens; the header fills the first screen (`open-champion-land.png`) | X | — |
| Player, from Team | i15 | 0 | Window, 1.2 screens; **previous and next buttons** | X | kept (se1: moved 93px) |
| Encounter | i15 | 0 | **In-page drill-down** ("‹ All encounters") (`open-encounter0-i15-top.png`) | "‹ All encounters" | kept |
| Player, from Players | i15 | 0 | Navigates to the profile | Back | kept |

**X1 (major): a sideways phone opens a game inline, which is the directive's named anti-pattern.**
- **Where:** Match History at 852×393 (and any window from 768px wide).
- **What the user sees:** the game unfolds under its card, 2.17 screens long. To close it, scroll back
  2.26 screens to the card. The inline scoreboard also cuts names ("Ji…", "Diamo…").
- **Why it matters:** "Users should not have to scroll through several screens to inspect one match
  and then scroll all the way back to close it." The same phone behaves differently by orientation,
  because `usePhone()` is width-based (below md).
- **Proposal:** decide the interaction by pointer and posture, not width alone. On every touch phone
  (coarse pointer and either dimension < 768px, or a short window), open the game window. On a
  sideways phone it could be a right-side panel over the list, the directive's All Champions idea,
  shared by games and champions.

**X2 (major): windows on phones are heavy and lack switching and thumb-reach closing.**
- **Where:** the game and champion windows on every phone, worst in the installed iPhone app.
- **What the user sees:**
  - The fixed headers take 30–42% of the screen, and the window's tabs scroll away. Switching from
    Scoreboard to Analysis after reading means scrolling back about 1.4 screens.
  - There is no previous or next game or champion. Team's player window has both, which is
    inconsistent.
  - Full-screen windows cannot be pulled down: in `detail-modal.tsx`, `docked = size === "sheet"`, so
    only sheets pull.
  - The installed iPhone app has no browser Back (MOBILE.md), so every close is a reach to the
    top-right X.
  - The game window's six tiles (KDA, KP, Damage, Gold, CS, Vision) repeat the player's own
    scoreboard row two inches below.
- **Proposal: one shared phone window.**
  - **Collapsing header:** result, champion and K/D/A in a 56px bar once the body scrolls.
  - **Sticky tabs** under it.
  - **Swipe left and right, or ‹ › in the header,** for the previous and next item in the list it was
    opened from. Use the Team player window's `detail-prev` and `detail-next` model.
  - **Pull down on the header to close,** as sheets do. Keep the X.
  - **Remove the tiles** in favour of the highlighted own row. Items, runes and spells go beside the
    portrait in the header, as the League client does.
  - **Targets:** reading the whole Scoreboard in at most 1.6 screens at 393; switching tabs with no
    scroll; closing without reaching the top.

**X3 (major): opening behaviour differs by item and by posture.**
- **What the user sees:** a game is a window upright, inline sideways, and a navigation from records.
  An encounter is an in-page drill-down. A player from Team is a window with ‹ ›; a player from
  Players is a page. Filters are a sheet upright but a select plus Refine or a segmented control
  sideways (`p-history-land-100.png`, `players-land-100.png`).
- **Why it matters:** "Similar actions should behave similarly"; "quick previews should feel naturally
  connected to their parent page, preserve browsing position and close predictably". Closing a
  record's game leaves you on another player's page.
- **Proposal: one preview contract.**
  - Every list item that is a thing (game, champion, encounter, record, team player) opens in the
    shared window over its own list.
  - Back, X and pull-down return to the exact list position.
  - ‹ › switches between siblings.
  - The URL may carry `?match=` for sharing, but the window opens over the current page, not the
    holder's.
  - One filter UI per phone, the sheet, at every posture.

**X4 (minor): closing moves the list.**
- **What the user sees:** closing a window opened from an item partly under the tab bar moves the list
  70–109px (i15 5th game +70; se1 +89/+94; Team Matches 4th +93; se1 Team card +93). Focus returns to
  the opener and the browser scrolls it fully into view.
- **Why it matters:** "preserve browsing position".
- **Proposal:** restore the scroll position recorded at opening, then return focus with
  `preventScroll` (as `navigation-reach` already does for pinned controls).

---

## 5. Touch targets, overlays, safe areas, installed app and text size

**Safe areas: good.**
- The top bar pads the status bar (59px on an iPhone 15; 112 = 59 + 53).
- The tab bar pads the home indicator (91 = 57 + 34).
- Sideways, content and the bar clear the 59px notches (cards from x 59, the brand at x 65, the
  account close at x 749–785 of 793 usable).
- Windows' close buttons sit below the status bar (y 68).
- The filter sheet's Done ends at y 818 = 852 − 34 (`sheet-filters-i15.png`).
- No text found inside an inset band.

**Installed app.**
- Every full-screen window closes only by its top-right X or a Back the installed iPhone app does not
  have (X2).
- The account screen and the game window fill 852px in WebKit too (`webkit-account-i15.png`,
  `webkit-match-window-i15.png`).
- Real-iPhone checks remain the owner's (RESPONSIVE.md → Safari and iPhones).

**Touch targets under 44px (minor, TT1).** These are the sweep's targets with the `touch-target`
extension counted:
- Resources section chips: 38px.
- Encounters' All / Against / Alongside segments: 38px.
- Match History LP pills ("+25 LP"): interactive, 24px tall.
- Team Matches member links: 40px (TM1).
- ⓘ buttons: about 24×40.
- Admin audit chips: 40px.
- Players' sideways role segments and chips: 38px.
- "Complete your profile" link: 37px.
- **Proposal:** apply `touch-target` to every chip and segment. Make the LP pill non-interactive (its
  explanation goes in the card's ⓘ) or 44px.

**Overlays.**
- The ⓘ bubble at 320 is 288×146 over the profile band (26% of the screen) with a seven-line text
  ("Over the newest 20 games this list holds with its filters (all 30 for the trend)…")
  (`tip-history-se1.png`).
- **TT2 (minor):** cap phone bubbles at about 3 lines. The copy itself is the tooltip audit's.

**Text size.**
- At 125%, the bottom bar loses all labels on 320–393px phones (measured on se3 and i15: icons
  alone), and the pager cuts "Support" on 375 (`team-i15-125.png`).
- At 150%, the lineup pager is ellipsized, a profile's sections hide "Accounts", "Lineup complete"
  wraps and "Switch to Admin M…" is cut.
- 125% is a common setting; this is part of N0 and T4, and N1 fixes the bar.

**Nested scrolling** (all are sideways rows, none vertical inside the page):
- The lineup track: by design.
- The Resources index (R1).
- Encounters' segments at 320.
- The admin audit category row.
- Admin System Health's "Page speed" tables (453px of table in a 335px panel, and two tables at 150%).
- **TT3 (minor):** make those admin tables rows of label and figure on phones.

---

## 6. What works and should be kept

1. No horizontal overflow in any of the 220 page states, nor at 150% on a 320px phone.
2. The safe-area handling in every posture, and windows below the status bar.
3. The sideways compact bar: 44px, auto-hiding, with the current destination marked twice.
4. Back closes the game window and returns to the list. The filter sheet: labelled fields, segmented
   choices, Done in thumb reach.
5. Players' 64px rows, Team Matches' compact member rows, Match History's 115–120px cards and summary.
6. The Team card's styling is faithful to the desktop: art, avatar ring, role chip, 24px figures.
7. The Matchup Intel picker: full screen, a grid, a 16px search. Compact slots.
8. Team's player window with previous and next: the model for every window (X2).
9. WebKit draws the same frame, windows and account screen as Chromium.

---

## 7. Cross-cutting proposals (shared components and rules)

1. **N1 navigation:** `PHONE_TABS` = the sidebar's `NAV_ENTRIES`. Team's sections use `ChromeTabs` in
   the top bar. Per-tab section memory. The account screen holds account items only. `phoneParent`
   no longer sends destinations to Team. Admin regrouping on both desktop and phone.
2. **A label ladder for every bar:** full names, then short names (full names read out), then icons.
   The thresholds go in rem container queries, as `TAB_FIT` already does. The ladder keeps names to
   125% everywhere and to 150% on ≥375px.
3. **One phone window (`PreviewWindow` on `DetailModal`):** collapsing header, sticky tabs, ‹ › and
   swipe between siblings, pull-down to close, the position restored. Used by games, champions,
   encounters, records and team players. Width-independent on touch phones (X1, X3).
4. **The phone header budget (P5) enforced on every page:**
   - one title row (or none where the bar or section row names the page);
   - one scope line with its ⓘ;
   - chips only when narrowed;
   - no lone Filters or "Remember" buttons;
   - no repeated identity (Team, Admin);
   - no paragraphs (Settings, Riot Accounts, Admin).
5. **Scroll-away top bar upright** (first row only; the sections row stays) from 125% text and under
   700px of height. Profile bands collapse into the bar outside Overview.
6. **Compact sideways layouts that show more, not less:** Team's five across or a track; pair bars;
   no orphans.
7. **Touch-target sweep** for chips and segments, and pills that are not buttons.
8. **Lists of things on phones are rows with a detail screen,** never forms or destructive actions
   inline (Admin Users, System Health).

---

## 8. Findings index

**Major (9)**

| ID | Finding |
|---|---|
| N0 | Navigation parity: different names, grouping and logic; ordinary destinations hidden in the account screen; "‹ Team" as parent; two "Settings" in Admin Mode |
| T1 | Team Overview shows one of five players; the first card is not whole at 393×659 or 320×568 |
| T2 | Duplicate team identity in the first 234px |
| T3 | Sideways Team: 2+2+1 with an orphan, 3.46 screens; no card on the first screen at 150% |
| S1 | The frame (29–44%) and the repeated profile band; no game on the first screen at 320; hidden sections at 150% |
| X1 | A sideways phone opens a game inline (+2.17 screens; 2.26 screens back to close) |
| X2 | Phone windows: heavy fixed headers, tabs scroll away, no ‹ ›, no pull-to-close, X-only in the installed app, duplicated tiles |
| X3 | Inconsistent opening patterns: window, inline, navigation or drill-down; a record's game closes onto another player's page; filter UIs differ by posture |
| AD1 | Admin Users & Permissions: 5.6 screens at 393 (19.5 at 320 with 150% text), an always-open form, and destructive actions on every card |

**Minor (20):** T4, T5, S2, P1, L1, TM1, TM2, PO1, AC1, E1, RA1, MI1, R1, ST1, AS1, AD2, X4, TT1, TT2
and TT3. The truncated names in the sideways inline scoreboard are part of X1's evidence.

**Keep (9):** §6.

---

## Appendix: key files

**Screenshots** (all in
`docs/overhaul/shots-mobile/`):
- **Desktop benchmark:** `desk-desk-team.png`, `desk-desk1920-team.png`, `desk-admin.png`.
- **Team:** `team-{i15,se1,se3,i12,max,land,i15s}-{100,150}.png`, `*-full.png`, `team-{i15,se3,max}-125.png`.
- **Every page in every setup:** `<page>-<setup>-<text>.png`, with pages team, players, lb-form,
  lb-records, matches, me, p-overview, p-champions, p-history, p-encounters, p-accounts, resources,
  intel, intel-pair, settings, a-dash, a-people, a-branding, a-system, a-data, a-audit and a-settings.
  Full pages at i15 are `*-i15-100-full.png`.
- **Interactions:**
  - `open-history0-i15-tab{0..3}.png`, `open-history0-i15-tab0-end.png`, `open-history0-se1-*.png`
  - `open-history0-land.png`, `land-inline-game-end.png`
  - `open-teammatch{0,3}-*`, `open-champion{0,4}-*`, `open-champion-land.png`
  - `open-teamcard0-*`, `open-encounter0-*`, `open-record0-*`, `open-player0-*`
  - `sheet-filters-{i15,se1}.png`, `intel-picker-*`, `intel-curated-*`
  - `account-{i15-player,i15-admin,se1-100,land-100,i15-150,se1-150}.png`
  - `tip-history-se1.png`, `webkit-*.png`
  - `crop-a-people-*.png`, `lb1page-{a,b,c}.png`
- **Data:** `out-sweep.json`, `out-interact.json`, `out-more.json`, `out-final.json` and
  `out-navfit.json` in
  `docs/overhaul/mobile-scripts/`.
