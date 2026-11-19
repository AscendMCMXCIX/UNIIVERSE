# UNIIVERSE overhaul: the staged delivery plan (owner's directive of 19 Nov 2026)

Written 19 Nov 2026, from about 07:45 UTC, for the coordinating engineer who will build, validate and deploy it with parallel agents; revised at about 08:30 UTC after a completeness critic's 35 points (all checked against the repository; the two parts rejected are said where they fall: S7a's calculator and S8a's admin pages). Planning only: nothing was edited, pushed, run or deployed.

**Inputs, all read whole:**
- `DIRECTIVE.md`;
- the seven stage-0 audits: `recon.md`, `ux-desktop.md`, `ux-mobile.md`, `champions-matches.md`, `tooltips.md` with `tooltips.json` (196 items), `admin.md`, `mi-evidence.md`;
- `mi-review-confirmed.json` (19 confirmed findings on the Matchup Intel branch);
- `origin/main:CLAUDE.md`, `.github/workflows/ci.yml`, `production-check.yml`, `playwright.config.ts`, `docs/CI_USAGE.md`, `docs/HOSTING_USAGE.md`, `docs/DATABASE_PERMISSIONS.md`, handover §A3 and `data-jobs.yml`.

**Every lane reads `git show origin/main:CLAUDE.md`.** The main checkout `/home/user/uniiverse` is on `ux/navigation-contract` (8 Nov), so the CLAUDE.md an agent loads there is stale: it has no deploy budget, the old ignore list and the old verification-account key (RC§3.5).

**The state at about 08:20 UTC** (`git fetch` and the REST API):
- **Production:** `fd098f1` (release batch 2). `/api/health` is ok on patch 16.23. Production check 44425656913 passed 477, failed 0, warned 0. 19 Nov has used 1 of its 3 deploys.
- **Release batch 3 is stacked and ready:** #316 `da34ce1d` (green: CI 44455881598, WebKit 44460252433) → #317 `ux/nav-refinements` `0fdc9226` → #318 `ux/leaderboards-dashboard` `04a21a27`. #317 and #318 were opened ready at 08:13–08:14; their CI (44485793800, 44485795811) and WebKit (44485902772, 44485906293) runs started then, so they end at about 09:05–09:15.
- **Matchup Intel:** `ux/matchup-intel-dashboard` `69b47a62` holds the import, pushed at 07:30 (173 champions, 1,112 facts). It is **not** on batch 3 and must be re-stacked by a merge. The 19 review findings were made against `9cce9a33`. The four import commits since then (`6ee11a8c`…`86ab4999`) probably close some of them, so each one is re-tested first.
- **The rank schedule:** the five-minute schedule was reinstalled at 07:40 (Data jobs 44481399792). It had been off since 18 Nov 09:04 UTC (20:04 in Sydney).
- **Open PRs:** #316, #317, #318, and #212 (held: not touched).
- **Limits and measurements that shape the plan:**
  - CI's browser-test job has a **60-minute limit** (`ci.yml:164`). #316's ran **50 min 23 s** (04:07:19–04:57:42) with one worker and `retries: 1`, and CI_USAGE records the same suite taking 22.8 to 36.4 minutes on different runners. A slow runner can time out a 50-minute suite, so the ceiling is **52 minutes** (§1.4) and the reductions are asked of the owner today (OD15).
  - **First CI runs fail often:** since 12 Nov, 11 of 31 PR branches failed their first full CI run, and 10 of 19 `ux/*` branches did (#316's first run, 44442818521, among them; 8 of 17 without the two caught in the four failures together at 09:32 on 18 Nov); 1 of the 11 needed a third run. Production checks after a deploy failed 1 of 12 since 16 Nov. §7.3 sizes the buffer from these.
  - **The members play in Sydney's evening.** Every linked account is on OC1, and 18 Nov's presses were at 20:04 local. 08:00–13:00 UTC is 19:00–24:00 there, so member-facing deploys go at 13:00–21:00 UTC (§1.6).
  - New migrations number **0067** (S7b), **0068** (S9b) and **0069** (S10), after #212's held 0066.

**Legend for finding IDs:**

| Prefix | Source |
|---|---|
| `RC§n` | recon.md |
| `UD.` | ux-desktop.md |
| `UM.` | ux-mobile.md |
| `CM.` | champions-matches.md (`AC-`, `MH-`, `D-`) |
| `TT.` | tooltips.md and .json (items such as `G14`; defects `TD1`–`TD14`) |
| `AD.` | admin.md (`D1`–`D10`, design sections `AD§2.n`) |
| `MI.` | mi-evidence.md (`F1`–`F5`, `O1`–`O6`, `MI§n`) |
| `MR#` | mi-review-confirmed.json |
| `§n.k` | directive bullets, numbered in the coverage matrix (§6) |
| `OD n` | the owner's decisions (§5) |
| `STATUS n` | STATUS.md's own owner-item numbers |

**Phone setups used in acceptance criteria** (as ux-mobile measured them):

| Key | Size | Stands for |
|---|---|---|
| se1 | 320×568 | installed |
| se3 | 375×667 | installed |
| i12 | 390×844 | |
| i15 | 393×852 | installed, insets 59/34 |
| i15s | 393×659 | Safari tab |
| max | 430×932 | |
| land | 852×393 | sideways, installed |

Text is tested at 100, 125, 150 and 200%. Desktop is tested at 1280×800, 1440×900, 1920×1080 (1920×950 maximised) and 2560×1440, with the sidebar open and folded.

---

## 1. How every stage is run (the definition of done)

1. **Branches:** one branch per PR, stacked on the previous stage's head.
   - **Never rebase, amend or force-push a pushed branch** (the owner's no-history-rewrite rule). Re-stack by merging the new base's head into the branch, as `5ab0c9ca` did for Leaderboards.
   - When the previous stage merges, merge `origin/main` in, re-validate locally and push once. A lane absorbs **every** landing before it this way (3–6 merges for the later lanes, §7.2), not only one. Lanes keep their branches without a ready PR until the stage is complete (no CI, CLAUDE.md §3), so only the merges after a PR is ready cost a CI run.
2. **Build and review:**
   - Agents build in parallel lanes (§7.2).
   - Every PR gets four independent reviews before it is marked ready:
     - acceptance;
     - regressions;
     - claims and tests;
     - **design**: side-by-side screenshots of each changed page, desktop against phone and before against after, judged against the benchmark pages (DESIGN_SYSTEM §1) for identity, type, colour, hierarchy, components and interaction (directive §2.4a–g).
   - Each finding is confirmed before it is fixed, as was done for Matchup Intel.
3. **Local validation (CLAUDE.md §2):**
   - `pnpm verify`;
   - the DB tests (`TEST_DATABASE_URL=… pnpm vitest run tests/db`) whenever server code, queries or the schema change;
   - `pnpm build && pnpm test:e2e` on all three projects (phone 375×667, tablet 768×1024, desktop 1440×900) once before the PR is ready;
   - the local live check against the demo;
   - the WebKit spec;
   - from S2 on, the page-budget spec's CI subset, and the full matrix with `node scripts/ux-measure.mjs` (no CI time, no deploy), its figures in the PR body;
   - axe.
4. **CI time is measured, not assumed:**
   - **Every stage's acceptance includes "browser job ≤ 52 min on this head"**, read from CI's own job timing, and the PR body gives it beside the previous head's. 52 leaves 8 minutes for a slow runner and `retries: 1`; OD15 uses the same figure.
   - A stage that adds specs deletes the ones it replaces and scopes viewport-independent specs to one project (`testIgnore`). Large matrices (pairs × sizes, every page × setups) run in `scripts/ux-measure.mjs`, with a fixed subset in CI.
   - A head between 52 and 60 minutes may merge (CI is green), but the next stage first brings the job back under 52, with OD15's approved reductions if needed. The workflow is never changed without the owner (CLAUDE.md §6).
   - Never re-run CI except for a failure clearly unrelated to the code, and then at most once (CLAUDE.md §6).
5. **Safari and the installed apps:**
   - Run the WebKit workflow by hand on the top head of the batch (8–14 minutes; the limit is 45).
   - Run the iOS Simulator (OD11) for stages that touch the installed app: S2, S4a, S6c and S7a.
   - **Android's installed app:** the phone project emulates standalone (as `install-app.spec.ts` does) and drives the system Back with `page.goBack()`, so every window, sheet and Peek is closed by Back in that posture (S2a, S4a, S6c). A real Android phone joins OD10 if a member uses one.
6. **Merge (CLAUDE.md §4):**
   - Every CI job must be green on each head of the batch.
   - `git merge-tree` of main and each head must give the tree CI tested.
   - Merge the batch back to back, seconds apart, with `expectedHeadSha`: one batch is one production deploy.
   - **Deploy window:** member-facing deploys merge at **13:00–21:00 UTC** (00:00–08:00 in Sydney), never at 08:00–13:00 UTC, the members' evening on OC1. Server-only and Admin-only deploys (S1, S9a) may go at any time.
7. **After the deploy (CLAUDE.md §5):**
   - Read the Production check. It must show 0 failed and 0 warnings, with the stage's new facts.
   - Use one Data jobs run for what the stage needs: `auth-audit` after a migration, `data-audit` after a data-rule change, `rank-schedule-status` after S1.
   - Run `perf-probe` once after a loader, query or caching change (S0a, S5, S6, S7b, S8a).
   - After S7b's migration, run the private backup workflow by hand once, so a restore count covers 0067 (else S11 reports the backup's coverage of 0067 as unverified).
   - Never loop manual runs.
8. **Docs and STATUS:**
   - The docs change in the same PR as the code: LIVE_VALIDATION "What it checks", MOBILE, RESPONSIVE, DESIGN_SYSTEM, the area's own doc.
   - At the end of each deploy day, a docs-only STATUS PR (no CI, no deploy) records each row:
     - **Verified:** the check exercises the change;
     - **Deployed:** its pages load cleanly, and CI checks the behaviour on demo data.
   - The live-check facts that pin a layout always change in the same PR as that layout. After S0b lands they live in one module per area (S0c), so lanes stop colliding in one file.
9. **Rollback:**
   - In an emergency, the owner's Vercel Instant Rollback (dashboard): seconds, and the fast path.
   - The session's own path is a revert PR of the batch's merge commits. It runs the **full PR CI (about 50 minutes**: the tree reuse applies only to the push to `main` after a merge), and counts as a deploy. A forward fix through the reserve slot is often as fast.
   - Forward-only data fields need no rollback: older code ignores them.
10. **Budgets:**
    - At most about 3 production deploys a day, a batch counting as one. This plan books 2 and keeps the third for a fix or a slipped stage.
    - Each stage adds at most one signed-in page load to the Production check (37–105 ms of server CPU each). Requests without a page (S1a's refusals) cost a few ms each.
    - **Vercel Active CPU** (the 8 Nov outage): the owner reads Usage once after S4 and once after S6 (OD5). A reading above about 300 CPU-s a day stops new loader work until it is explained.
    - No new Riot API use before OD4.
    - The other limits: egress 120 MB a day; the database at 173 MB of 500; no paid service.
11. **Privacy:**
    - Logs, PR bodies and STATUS hold counts and anonymous labels only. No personal data in a commit. The public `/api/health` JSON and the Production check's output name no person and no audit entry.
    - Every new server action has its guard first (`guards.test.ts`), and every new page calls `requirePageAccess` (`page-guards.test.ts`).
    - **Every new read path of members' games reapplies the profile visibility checks** (#207's levels through `view-teammate-stats`; a personal-use profile is its player's and the administrators' only), each with a DB test that a viewer without the right gets nothing: S5's two actions, S6b's Team Matches view, S6c's `/leaderboards?match=`, S7b's team counts and S8a's player Peek.
12. **Wording follows the viewer.** One helper (`viewerWords(isOwn)`) gives "you/your" on one's own pages and "they/their", or the champion's name, on a teammate's. Every template with a person in it goes through it, with a test that renders it both ways: the tips C05, H12 and H22 (S4b), S5's opponent sentence and foot line, and S6a's notes.

---

## 2. The stages at a glance

| Stage | PRs | What it delivers | Main IDs closed | Depends on | Deploy slot (UTC) |
|---|---|---|---|---|---|
| **S0a** | 3 (#316, #317, #318) | Release batch 3: large text, Matchup Intel as its own destination, Team tabs' scrollbar, Ranked progress ends at its chart, Leaderboards on one page | RC§3.1–3.2, §5.1, §5.3, §5.4 | — | 19 Nov #2, from 13:00 UTC |
| **S0b** | 1 | The Matchup Intel dashboard with the reviewed Riot-text facts (switched off until OD1) and all 19 review fixes; one patch name everywhere | MR#1–#19, UD.I1–I2, TT.G14, I05, I12 | S0a; OD1 only for switching the Riot-text layer on | 19 Nov #3 (else 20 Nov) |
| **S0c** | 1 (scripts only) | The live-check facts split into one module per area, the same facts and counts | coordination (§7.2) | S0b | none: no deploy (scripts are skipped by `vercel-ignore-build.sh`) |
| **S1** | 2 | Safety and correctness: admin PR 7a (setup jobs owner-only in Admin with typed confirmation, the intervals editor owner-only, the verification account locked, the Owner guard, dead actions deleted, typed delete), a notice for a schedule turned off, the strict lane opponent (F1), forward capture of shards, positions, haste and Riot's lane and jungle figures | AD.D1–D3, D5a, D9, D10; RC§1.5; MI.F1, F3; CM.AC-10, D-1, D-4 | S0a | 20 Nov #1 (server and Admin only: any hour) |
| **S2** | 3 | Navigation parity (N1) on phones, tablets, the installed apps' shortcuts and in Admin Mode; the phone header budget starting with Team; desktop frame stability | UM.N0, S1, T2, T5, S2, RA1, ST1, AS1, AD2, TT1; UD.PO1, X3, X4, X5, S2, T2, A2, P3 | S0a, **S0b** (both edit `nav.ts`, `mobile-nav.tsx` and the live-check facts) | 20 Nov #2 |
| **S3** | 2 | Team Overview on phones (the whole lineup at a glance, the sideways row), desktop five across from 56rem; Players | UM.T1, T3, T4, P1; UD.T1, T4, P1, P2 | S2 | 21 Nov #1 |
| **S4a** | 1 | The shared interaction kit (Peek, Unfold, Task dialog, Popover/Select, Fold, one history rule, the phone window shell) with first consumers | UD.X1, X2, X7, X8, T5, D1, M1, H4; UM.X1–X4 | S2 | 21 Nov #2 |
| **S4b** | 1 | Tooltip behaviour, the 12 wrong items and the 16 long tips | UD.X6; UM.TT2; TT.TD1–TD5, TD8, TD10–TD13 | S2 (not S4a) | with S4a on 21 Nov #2, else the next reserve slot |
| **S5** | 2 | All Champions: the preview that unfolds over the list's columns (drawer, phone sheet), with win rates against each lane opponent | CM.AC-1–AC-9, AC-11; UD.C1–C3; UM.AC1; TT.C* | S1 (F1), **S4a** | 22 Nov #1 |
| **S6** | 3 | Match History, Team Matches and Encounters: one post-game view (no tabs; loadout like the client; Went well · Went wrong · Focus next), Previous/Next, a phone window, records on the board | CM.MH-1–MH-10, D-3; UD.H1–H3, M2, L3, E1; UM.X1–X3 (games), TM1, TM2, E1; TT.G10 | **S4a** | 22 Nov #2 and 23 Nov #1 |
| **S7** | 2 | Matchup Intel for all five roles (Tier 0): 1v1 and bot-lane 2v2 inputs, a cooldown table at chosen haste where the haste rule is known to apply, Riot's own tips, evidence from the team's own games with sample sizes, evidence tiers, a lane end measured per game, pipeline health for static data | MI Tier 0 1–6, F2, F4; CM.D-2; UD.I3–I5; UM.MI1; TT.I01, I04, I06, I07 | S0b, S4a; S1 (capture) | 23 Nov #2 and 24 Nov #1 (migration 0067) |
| **S8** | 2 | Profile Overview, Leaderboards, Resources, Settings (with "On this device"), public pages, large-text leftovers; **the pages stage 0 never audited**; the player Peek on Players and Leaderboards rows; four CPU follow-ups; the rest of the help text (all 196 verdicts) | UD.PO2, PO3, L1, L2, L4, L5, R1, S1, PB1, PB2; UM.PO1, L1, R1; TT.TD6, TD7, TD9, TD14, G02, G03, D*; HOSTING_USAGE follow-ups | S4a, S4b | 24 Nov #2 |
| **S9** | 3 | Administration, PRs 7b–7d: Users & Permissions as a list plus a person view; owner tools (display name, picture, links, sign out everywhere, atomic access, activity log); "Needs you" dashboard and plain health | AD§2.1–2.10, D4, D6, D7; UD.A1–A7; UM.AD1, AD2, TT3 | S2, S4a; OD8 for the reserved items | 25 Nov #1 and #2 |
| **S10** | 2–3 | Matchup Intel's high-elo evidence (Tier 1, then Tier 2) | MI.O1–O3, MI§4.4–§5 | **Blocked:** OD4, OD5, OD7 | Built ahead behind an off switch (lane L11); after the owner's yes a silent pilot deploy at X+2 at the earliest, ≥ 7 days, then 1 deploy |
| **S11** | docs only | Final verification and the status report (§9 of the directive) | §9.2–§9.5 | All | 26 Nov, no deploy |

**Which stages can share a deploy:**
- S1 can ride with S0b if both are green at 19 Nov's third slot.
- S2c (desktop frame) can move into S3's deploy if S2 runs late.
- S4b rides with S4a when both are green; otherwise S4a goes alone and S4b takes the next reserve slot or rides with S5. Nothing waits for S4b except S8.
- S6a, S6b and S6c can go as one batch if all three are green together.
- S7a and S7b can share a deploy, with `auth-audit` after it.
- S9a, S9b and S9c can share one deploy.
- **Never in the same deploy:**
  - S2 with S4a (both re-pin many frame facts);
  - S5 with S6 (each reworks about 14 specs).

---

## 3. The stages

### S0a · Release batch 3 (in flight) — 19 Nov, deploy 2

**PRs** (stacked; these are the `expectedHeadSha` values and the heads the merge-tree check uses):
1. #316 `ux/large-text-final` `da34ce1d` (green: CI 44455881598, WebKit 44460252433);
2. #317 `ux/nav-refinements` `0fdc9226`, ready since 08:13 (CI 44485793800, WebKit 44485902772);
3. #318 `ux/leaderboards-dashboard` `04a21a27`, ready since 08:14 (CI 44485795811, WebKit 44485906293). It holds `5ab0c9ca`, the merge of nav into it, plus one docs commit after `903b7e42`.

A new push to any of the three restarts its CI, so nothing more is pushed to them unless a check fails.

**Closes:**
- §0.3: Leaderboards consolidation, Ranked progress cleanup (presentation), interface refinements (large text on phones, the Team tabs' scrollbar), and Matchup Intel as a destination of its own;
- RC§3.1–3.2, §5.1, §5.3 (presentation), §5.4 (partly);
- TT: Ranked progress's three jargon `title`s disappear.

**Design decisions:**
- **The scope is frozen.** Nothing new goes in. Known overlaps are shipped and superseded later, not redone:
  - InfoTip's scroll-in-bubble (TT.TD2) is replaced by the sheet fallback in S4b.
  - The phone's account-screen rows for Matchup Intel and Resources are replaced by N1 in S2a (RC§7.1: do not polish them further).
  - Ranked progress's unused `weeks` query (RC§5.3) is removed in S8a. That is routine and reversible, and the directive delegates it.

**Acceptance:**
- CI green on each of the three heads (≥ 857 browser tests, 0 flaky). The WebKit workflow passed on `04a21a27` (or the final top head).
- **CI time:** the browser job ≤ 52 min on `0fdc9226` and `04a21a27` (#316's was 50 min 23 s). If either is over, it may still merge, but S0b first brings its own head back under 52 (§1.4) and OD15's answer is needed today.
- `git merge-tree` equals the tested tree before each merge. All three merge within seconds: one deploy.
- The Production check on the deployed commit passes every fact, including the batch's new ones:
  - the sidebar order My Profile · Team · Matchup Intel · Resources, with Matchup Intel at `/resources/matchups`;
  - on phones, Matchup Intel and Resources each offered once;
  - Team's tab row draws no scrollbar;
  - Ranked progress ends with its chart;
  - `/leaderboards` is one page, and `?view=records` lands on Season records.
- 0 failed, 0 warnings. Then `perf-probe` once (`recent-view.ts` builds both parts of the page from the cached load).

**Tests and facts:** as on the branches (nav adds 87 lines of facts; Leaderboards brings its own). None added.

**Data:** none.

**Risks:**
- flaky geometry specs (team-flip, filter-consistency): re-run once only if clearly unrelated;
- the daily check (05:37 UTC) runs against the new facts;
- STATUS is stale (RC§2), so the docs PR after deploy records #316 merged, batch 3 live, the LP gap from 18 Nov 09:04 to 19 Nov 07:40, and the new owner items.

**Deploy:** 19 Nov #2, at 13:00–14:00 UTC once green: not in the members' evening (08:00–13:00 UTC, §1.6), since the batch changes the phone's navigation and every Leaderboards page.

### S0b · Matchup Intel dashboard, reviewed Riot-text facts and the 19 review fixes — 19 Nov, deploy 3 (else 20 Nov, after S2)

**PR:** `ux/matchup-intel-dashboard` `69b47a62`, re-stacked on S0a's top head by **merging** `04a21a27` (#318) into it, as `5ab0c9ca` did for Leaderboards: no rebase and no force-push of the pushed branch (§1.1). Expect conflicts in:
- `scripts/live-check.mjs`;
- `e2e/mobile-nav.spec.ts`;
- `src/components/mobile-nav.tsx`;
- `docs/RESPONSIVE.md`, `docs/MOBILE.md` and `docs/LIVE_VALIDATION.md`.

**Closes:**
- RC§3.3, §5.2 (the built parts);
- **MR#1–#19**;
- UD.I1 (the fit at 1280×800 with the sidebar open, through MR#1's fold; criterion below);
- UD.I2 (one honest line instead of four empty panels). The import's "denser assembled side" does not close it on its own: the Riot-text layer most likely ships switched off until OD1, and then the four empty panels would stay the default for about 167 of 173 champions. So the one line is built and tested **with the layer off**;
- TT.G14 and TT.I05 (one public patch name, "Patch 26.23", in the sidebar and in Matchup Intel; the summary line reads "Riot game data, patch 26.23"). **The sources footer keeps "Riot Data Dragon 16.23.1"** one press away: Riot's version is the citation, and the live check pins it (below);
- TT.I12 ("Qualified by" becomes "Only as").

**Design decisions, one per finding** (re-test each against `69b47a62` first; #2, #7, #10, #11, #15 and #16 are probably closed by the import commits and then only need a regression test):

| Finding | Decision |
|---|---|
| #1 | Level notes beyond two fold behind their count. `FIT_PAIRS` covers all 30 checked pairs. The spec's and MATCHUP_INTEL.md's "tallest pair" claim is corrected. |
| #2, #11, #16 | `qualifier`, `conditional`, `textsDiffer` and `appliesTo` are carried through the review record, the importer and the view: "Stun · hits a wall", "Conditional: see Riot's text", "Riot's texts differ". The importer refuses a field it does not know. The kind word becomes "Cooldown refund or reduction". |
| #3 | A `<wbr>` after each "/", and each number kept whole (`nowrap`). |
| #4, #12 | When a briefing exists but is hidden, the assembled header says "The curated briefing for X vs Y is hidden, above: …". The sentence moves into `wording.ts`, so `wording.test.ts` covers it. The current pair leaves `CuratedLinks`. |
| #5, #13 | `KitLine` renders "Changed since the check". Each checked side has one check line ("Checked on patch N · not re-checked for … · may be out of date"). The Level changes and Interactions lines carry the same badges. |
| #6 | The live check asserts no scroll at 1920×1080 only, and at 1440×900 that the tiles and the Sources summary are in view. The hidden and expired states pass, saying what was found. LIVE_VALIDATION.md is updated. **Must-fix:** production is already on 16.23, so the curated notes show "not re-checked for 26.23" and push the bar to a third line. |
| #7 | On a coarse pointer, chip rows get about 20px of row gap, or `::after` is capped so the 44px areas never overlap. An axe `wcag22aa` (target-size) pass is added at phone size. |
| #8 | `SourceTip` gets a 44px touch area. |
| #9 | The bar warns "N parts hidden: Riot changed …". |
| #10, #15 | Names are trimmed and whitespace collapsed in the importer, as `compactChampionAbilities` does. A test uses a name with a trailing space (Bel'Veth's passive). |
| #14 | "Cooldowns: Riot's data, not reviewed" in Your champion's summary. Each assembled side says once where its cooldown numbers come from. |
| #17 | The unreadable-record state is carried into `Kit`, so it is said as unreadable, never as missing. |
| #18 | "Checked notes (checked by AI reviewers, not by a person)". The owner may reword it (OD20). |
| #19 | The layer label sits under each side's subtitle. A group whose facts are all hidden says "hidden", not "None recorded". The footer becomes "no number in that text is used for these facts". |

- **The Riot-text layer waits for OD1** (the registration text, the branch's step 10 "before or with step 9"):
  - If OD1 is not confirmed when CI is green, ship with the layer switched off by one constant (`RIOT_TEXT_LAYER`). Tests assert that the page then shows only the checked and Riot-data layers, says so, and gives an assembled pair whose champions have no checked notes **one line** ("No reviewed notes for this pair yet: abilities and cooldowns below"), with the ability tiles taking the main width and none of the four empty panels.
  - Turning it on later is a one-line change that rides the next deploy, after the on-state fit tests below are re-run on that head.
- **The live-check facts change in this PR:**
  - `live-check.mjs:916` pins `/Riot Data Dragon \d/` in the summary, which TT.I05 renames. It becomes "the summary names Riot game data and the patch, matching `/api/health`".
  - `:917` (the Data Dragon version one press away) is kept, since the footer keeps it.
  - With the layer off, `:919`'s "nor Riot's text in the sources' summary" holds trivially; a new fact asserts the off state's label.

**Acceptance:**
- Every finding has a named test (unit, DB or e2e) passing on the final head.
- **Fit** (the full matrix in `scripts/ux-measure.mjs`, its figures in the PR; CI keeps the 6 pairs MR#1 found over and 4 assembled pairs):
  - 30 of 30 checked pairs have 0 scroll at 1920×950 and 1920×1080;
  - **10 assembled pairs with the Riot-text layer on** (the 10 with the most facts from Riot's text), 0 scroll at both sizes; and the same 10 with it off;
  - the essentials (both headers, the enemy's five tiles with their cooldowns, the bar, the Sources summary) are in view at 1440×900 for all 40;
  - **1280×800 with the sidebar open:** Gwen–Ornn at 1.0 screen or less (1.17 today, UD.I1), and the essentials in view for all 40;
  - re-measure the five sizes the branch documents.
- **Text:** no cooldown number breaks at 200% on 320, 375 or 393px (in ux-measure over every numbered line of 10 named pairs; CI checks 2).
- **Touch and axe:**
  - `wcag22aa` reports 0 serious at 375×667 and at a 768px touch tablet, for Riven–Mordekaiser, Riven–Darius, Ornn–Gwen and Ambessa–Aatrox with every fold open (CI runs the first two; ux-measure all four);
  - an `elementFromPoint` sweep finds no target under 44px and no overlap on touch.
- **The local live check** passes against the fixture relabelled 16.23.1 (production's patch now) and 16.25.1 (the briefings expired), with the layer off and on.
- **CI time:** browser job ≤ 52 min on this head (the branch adds `matchup-intel-dashboard.spec.ts`, 365 lines, and 36 lines of WebKit; viewport-independent cases run on the desktop project only).
- CI green; the WebKit workflow passes (its Matchup Intel Safari flow).
- After deploy, the Production check passes, including the signed-in Matchup Intel page (owner decision 11 of 18 Nov).

**Data:** none (repository files; Data Dragon through the existing jobs).

**Risks:**
- the re-stack conflicts;
- the curated briefings hide at 26.25 unless re-checked (OD6);
- **the Riot-text layer is not self-maintaining.** Each fact is pinned to a hash of its ability's text; every patch hides the abilities whose text changed (16.23.1 changes only Mel's W), and records stored before the hash show the facts only on 16.22.1. Re-reviewing them is the agent workflow that made them; running it inside the app would need a paid language-model service, which the boundaries exclude. S11 sets up a per-patch re-review (OD6);
- the registration wording (OD1);
- one extra signed-in page load per check run.

**Deploy:** 19 Nov #3 if green by about 20:00 UTC (merge by 21:00 UTC). Otherwise 20 Nov at 17:00–21:00 UTC, after S2: S2 then stacks on S0a, and S0b merges S2's head in before its slot. S1 takes 19 Nov #3 if S1 is ready (S1 stacks on S0a; S1 is server and Admin only, so any hour).

### S0c · The live-check facts, one module per area (scripts only) — 20 Nov, no deploy

Nearly every stage edits `scripts/live-check.mjs` (1,449 lines on main, 1,608 on the Matchup Intel branch) and its docs, so every lane would collide in one file.
- **Right after S0b lands:** move the facts into `scripts/live-check/` modules (security, team, profile, matches, leaderboards, matchup-intel, resources, settings, admin), with one runner. The facts, their wording and their order stay the same.
- **Acceptance:**
  - the local live check gives the same pass, fail and warn counts and the same fact list (a diff of the names) before and after;
  - CI green (scripts-only, so Vercel skips the deploy);
  - one Production check by hand after the merge (Run workflow), which runs `main`'s script against production: the same count as the last run.
- Each lane then merges `main` once more. From S1 on, a stage edits only its area's module.

### S1 · Safety and data correctness (urgent, small) — 20 Nov, deploy 1

**PRs:** S1a, then S1b. Both are mostly server-side, with no redesign.

#### S1a · Admin safety (admin PR 7a) and the notice for a schedule turned off

**Closes:**
- AD.D1, D2, D3, D5a, D9, D10;
- AD.D4 in part (archive and restore audited; `jobs.run` carries its kind);
- erasure clearing id-matched audit details (AD§2.2), **for erasures from now on**;
- the misleading `isOwner` props renamed;
- RC§1.5 fix 4 and RC§7.7;
- §7.6, §7.11, §3.20(h) in part.

**Design decisions:**
- **Job kinds.** `JobDefinition.kind` is one of `check`, `refresh` or `setup` (setup or repair). A registry test fails when a job has none, and asserts that `setup` is exactly: `rank-schedule`, `rank-schedule-off`, `history-rescan`, `erasure-reconcile`, `verify-account`. S1b adds `lane-opponent-recompute` and S7b `prep-backfill` to that list in their own PRs, with the test.
- **Admin → Data & Integrations** shows three lists:
  - **Checks:** "Run check", for any administrator, with no confirmation. `perf-probe` and `data-audit` state their cost ("reads about 6 MB").
  - **Refresh:** "Run now". `static-sync` asks once.
  - **Setup, under a closed "Advanced":** owner-only (`requireOwner()` in `runJobAction` for this kind). Each job has a plain description of its effect and a typed confirmation phrase ("Type TURN OFF to stop LP tracking's five-minute schedule"). **`runJobAction` (Admin's button) refuses a setup job without the confirmation token.**
  - **The jobs route is unchanged.** `/api/jobs/<name>` with `CRON_SECRET` (Data jobs by hand, the session's `rank-schedule` reinstall, and `production-check.yml:107`'s `verify-account` call before every signed-in check) needs no token and no Owner session. The token is a guard on Admin's button, not on the secret's holders.
  - **The intervals editor** moves under Advanced and becomes **owner-only** (`saveScheduleAction` today lets any administrator set any job to 0, which turns it off, and audits only a count: AD.D1, `settings.ts:34-47`). An interval of 0 needs the typed phrase "TURN OFF ‹job›". The audit records each changed job with its old and new interval.
- **`guardVerificationAccount`.** These are refused server-side for the verification account: access changes (administrator, level, groups, team membership, profile), password reset, rename and erasure.
  - **Deactivate stays allowed:** it is LIVE_VALIDATION's documented off switch for the signed-in checks.
  - **Delete stays allowed:** the `verify-account` job recreates the account.
  - People shows the account in a locked "Kept automatically" group, and the stale "admin account" copy goes.
- **`guardOwnerAccount`** is added to `setTeamMemberAction` (D5a).
- **`updatePlayerAction` and `deletePlayerAction` are deleted** (D2), and their tests move to the audited actions.
- **Typed username confirmation** for "Delete account and profile" and for an accountless profile's "Delete profile" (D9). The dialog's two destructive buttons sit on one row.
- **Audit:** archive and restore are recorded; `jobs.run` records `{kind}`.
- **Erasure, forward only.** The planner clears the string details of activity rows matched by id when an erasure runs. Past erasures are not re-applied: that only happens through `erasure-reconcile`, which would irreversibly scrub details across the production activity log, so it waits for OD21 (with a read-only count first).
- **`/api/health` names a schedule turned off.** Its own rule stays: "this public endpoint never reads pg_cron or Vault" (`api/health/route.ts:52`). "Installed but silent" is already failing after 20 minutes from the recorded calls (`RANK_SCHEDULE_SILENT_MS`); the missing case is "off after on":
  - from the two `data_refresh_status` rows it already reads: when `rank-schedule-off`'s last success is later than `rank-schedule`'s, health adds a **notice** "LP five-minute schedule off since 18 Nov 2026" (a date only);
  - any job whose interval is 0 in the schedule overrides (one small `app_settings` row, `key = 'schedule'`: the only new read) is listed in a `disabled` notice by its key ("off by choice"), so `version-check` at 0, which would silently stop patch detection and S7b's pipeline, is visible;
  - the public JSON and the Production check's warning carry **no actor, no audit id and no link**: both are public (CLAUDE.md: never print a username). Who did it, and when, appears only in Admin's "Needs you" (S9c);
  - pg_cron reads stay in the authenticated `rank-schedule-status` job (`rank-schedule.ts:70-87`).
  - The Production check prints each notice as a warning. S1a's typed confirmation makes "off" deliberate, so it is a warning, not a failure.

**Acceptance:**
- **DB tests:**
  - a non-Owner administrator is refused every setup job and the intervals editor;
  - Admin's `runJobAction` refuses a setup job without its token;
  - **the route still runs setup jobs with `CRON_SECRET` and no token:** `/api/jobs/verify-account` and `/api/jobs/rank-schedule` (a route test);
  - an interval of 0 without the phrase is refused, and a saved change is audited with the job and both values;
  - every refused action on the verification account is refused, while deactivate still works and the `verify-account` job still creates and updates it;
  - D5a is refused for a non-Owner;
  - archive and restore are audited;
  - a new erasure clears id-matched details, and rows of earlier erasures are untouched.
- **Unit:** health with off-after-on gives the notice with its date and no actor; a job at 0 is listed in `disabled`; installed and silent for more than 20 minutes still gives failing (the existing rule); health makes no pg_cron or Vault query (a test over the queries it issues).
- **e2e:** at 1440 and 375 the setup jobs and the intervals editor appear only under Advanced and only for the Owner, and the typed confirmation blocks the button until it matches. axe 0.
- **Production check:** every Admin and preview route not probed today is refused (+23 facts, requests only, no page loaded):
  - signed out and with a forged cookie: `/admin/people/access`, `/admin/people/privacy`, `/admin/branding`, `/admin/previews`, `/admin/resources`, `/admin/settings`, `/preview/login` and `/preview/setup` (16);
  - signed in as a member: the same less `/admin/settings`, which is probed already (7).
  - `/admin/users` and `/admin/players` redirect to `/admin/people`, which is probed; `/admin/public-access` redirects to the public page.
- **CI time:** browser job ≤ 52 min on this head.

#### S1b · The lane opponent (F1) and forward capture

**Closes:**
- MI.F1 and CM.AC-10 (the strict lane opponent, before any win rate per opponent);
- MI.F3 and CM.D-1 (stat shards);
- `teamPosition` and `individualPosition` kept apart;
- per-frame `position`, `championStats.abilityHaste` and `level`;
- the events `LEVEL_UP`, `ITEM_SOLD`, `ITEM_DESTROYED` and `TURRET_PLATE_DESTROYED`;
- **Riot's `challenges` lane and jungle figures** (MI.F3), in the same match request: `jungleCsBefore10Minutes`, `initialCrabCount`, `scuttleCrabKills`, `enemyJungleMonsterKills`, `junglerKillsEarlyJungle`, `killsOnLanersEarlyJungleAsJungler`, `maxCsAdvantageOnLaneOpponent`, `maxLevelLeadLaneOpponent`, `laningPhaseGoldExpAdvantage` and `playedChampSelectPosition`. Every day without them loses them for good, since a stored record is never fetched again. They are stored as evidence; `laningPhaseGoldExpAdvantage` is Riot's own undocumented measure and is never shown as a "laning phase";
- CM.D-4 (time dead, plates, healing and shielding on teammates, damage mitigated);
- MI rec. 6 (HOSTING_USAGE records Vercel's Provisioned Memory, 360 GB-h in 30 days, beside Active CPU; the database is 173 MB, not 360–380).

**Design decisions:**
- **One shared rule** (`laneOpponentOf`, used by the fold and the lane figures alike):
  - `enemy_champion_id` is stored only when exactly one enemy holds the player's `teamPosition`, with both sides non-empty;
  - if `teamPosition` is empty, `individualPosition` is used with the same uniqueness rule;
  - otherwise it is null, "lane opponent unclear".
  - **A data limit:** records stored before S1b keep one merged position (`teamPosition || individualPosition`), so for them the rule can only require the merged position to be unique on both teams. MI §2.1's stricter rule (`teamPosition` only, `individualPosition` agreeing) applies to games stored from S1b on; S7b uses it there (S7b, "Against X").
- **`data-audit` adds three counts:** stored rows that disagree with the rule, rows that are unclear, and rows whose source positions are known (from S1b on).
  - Only if the first is above 0: a by-hand `lane-opponent-recompute` job recomputes that derived column from stored `match_details`. It is a **`setup` (repair) job**: owner-only from Admin, run by the session through Data jobs with `CRON_SECRET`; the registry test is updated in this PR. It makes no Riot request, prints counts only, can be re-run, and touches no source data: its output can always be derived again from `match_details`.
  - The session reports N before running it.
- **The Riot schemas (zod)** parse the new fields as optional. They are kept in the existing jsonb (`participantDetail.runes.shards`, both positions, `participantDetail.challenges` for the ten figures, the frame fields). No migration. Older records keep their shape, and a missing new field never fails a sync.

**Acceptance:**
- **Unit fixtures:** two enemies sharing an `individualPosition` give null; a unique `teamPosition` gives the opponent; a record with the ten `challenges` figures keeps them, and one without them parses.
- **DB:** a new fold stores shards, both positions, the ten figures and the frame fields.
- **Size:** compaction adds at most 4 KB per timeline and 0.8 KB per match record (measured on fixtures). The next `db-usage` shows growth no more than 1 MB a day above today's roughly 2 MB a day.
- **CI time:** browser job ≤ 52 min on this head.
- After deploy, one Data jobs run: `data-audit rank-schedule-status`.

**Data:** no migration. jsonb forward only. The derived recompute runs only if counted above 0.

**Risks:**
- the health notices: one new one-row read (the schedule overrides), and no pg_cron or Vault read (tested);
- the verification-account guard must not break its job, nor the Production check's `verify-account` call (tested);
- parsing unusual Riot payloads (every new field is optional);
- the typed-confirmation UX on phones.

**Deploy:** S1a and S1b stacked, 20 Nov #1 (or 19 Nov #3 if S0b slips). Server and Admin only, so any hour (§1.6).

### S2 · Navigation parity and the phone frame, starting with Team — 20 Nov, deploy 2

**PRs:** S2a navigation, S2b phone header budgets, S2c desktop frame. Stacked in that order, on S0b's head (S0b also edits `nav.ts`, `mobile-nav.tsx` and the live-check facts). If S0b has not landed by 20 Nov 10:00 UTC, S2 stacks on S0a and S0b merges S2's head in before its own slot.

#### S2a · Navigation N1 (Player and Admin Mode)

**Closes:**
- UM.N0 (the N1 proposal), UM.AS1, UM.ST1 (Back reading "‹ Team");
- UM §7.2 (the label ladder);
- RC§7.1;
- the "two Settings" of AD§4.2, and UM §2's Admin regroup;
- UD.A2 in part (the tab tier of Users & Permissions);
- §2.7–§2.12, §1.2(c).

**Design decisions** (N1 over N2 and N3, measured in UM §2.2; the session's call under the directive, listed in OD20 as a challenged design):
- **One bar everywhere.** `PHONE_TABS` = `NAV_ENTRIES` = My Profile · Team · Matchup Intel · Resources, in the sidebar's order, with its icons and names. The same four appear on the upright phone, the sideways compact bar and the tablet's top bar.
- **The label ladder** (rem container queries, as `TAB_FIT` does today):
  1. full names;
  2. short names ("Profile", "Intel"), with the full names read out;
  3. icons alone, only at 200%, or 150% on a 320px phone.
- **Team's four sections** (Overview · Players · Leaderboards · Matches, with the desktop's names and icons) are a 44px pinned second row (`ChromeTabs`) on every Team page.
  - The Team tab reopens the last Team section used this session; a second tap goes to Overview.
- **The account screen** holds account items only: Settings, Install App, the mode switch, Sign out, the patch line and Riot's notice, plus a small team mark.
- **`phoneParent`:** destinations have no parent (no "‹ Team"). Settings goes back to the page before, else home.
- **Admin Mode, on desktop and phone:** Dashboard · Users & Permissions ("Users") · Platform Settings ("Platform") · System.
  - System is a hub with Health · Data & Integrations · Audit Logs as its section row, at the same addresses.
  - The phone's only "Settings" is then the account's.
  - Users & Permissions' pages use the section TabBar.
- **Addresses:** every address is unchanged.
- **The installed apps' shortcuts follow the bar.** Today the manifest's icon menu (Android long-press, the desktop taskbar) offers Team Overview, My Profile, Matches and Leaderboards (`manifest.ts:11-16`), which no longer match the four destinations. It becomes My Profile · Team · Matchup Intel · Resources, in the sidebar's order and with its names, read from `NAV_ENTRIES` so they cannot drift (OD20).
- **Android's system Back** closes the account screen, the sections sheet and any window, as the browser's Back does (§1.5).
- **Prefetch:** the bar's My Profile and profile links never prefetch. Profile prefetches start Riot syncs (HOSTING_USAGE, "Not changed here"; the cause itself is fixed in S8a).

**Acceptance:**
- **Parity:** a unit test checks that the sidebar, the tablet bar, the phone bar, the sideways bar **and the manifest's shortcuts** hold the same entries, names, icons and order, in Player and Admin Mode. e2e covers four postures, plus the emulated installed app with Back by `page.goBack()`.
- **Labels on the bar** (e2e at the named setups):
  - full or short labels at 100–150% on 375, 390, 393 and 430;
  - full or short labels at 100–125% on 320;
  - icons alone only at 200%, or at 150% on 320.
- **Taps** (UM's J1–J10 table, now an e2e spec, `e2e/journeys.spec.ts`, at i15 on the phone project):
  - the ten journeys total at most 20 from the landing (22 today);
  - Matchup Intel takes 1 tap (2 today) and a Resources site 2 (3 today);
  - from My Profile, at most 21 with section memory.
  - **The table grows with each redesign**, each journey counted in taps and in scroll-backs, with its stage's target:
    - J8, a champion's matchups: 4 → 3 (S5: the preview has no Matchups tab);
    - J11, open a game, then the next one, then close: 0 scroll-backs, closing lands on the last game viewed (S6c);
    - J12, change the enemy in Matchup Intel after reading: at most 2 taps and 0 scroll-backs (S7a);
    - J13, a record's game and back to the board: 2 taps, ending on `/leaderboards` (S6c);
    - J14, a teammate from Players, then back to the list: list position unchanged (S8a);
    - J15, a person in Admin and back: 2 taps, the list's scroll kept (S9a).
- **Back:** no page shows "‹ Team" unless its parent is a Team page.
- **Sideways:** all four labelled at 100% on 568×320, and at 100–150% on 852×393.
- **Admin:** "Settings" appears once on a phone in Admin Mode.
- axe 0; the WebKit workflow; the iOS Simulator (OD11) for the bar and the account screen in the installed app.
- **CI time (S2a, S2b and S2c each):** browser job ≤ 52 min on the head.

#### S2b · Phone header budgets

**Closes:**
- UM.S1 (all three proposals), UM.T2, UM.S2, UM.T5, UM.TT1, UM.RA1;
- UM.ST1 (one-line field help);
- UM.AD2 on phones (ADMIN MODE said once, no eyebrows or descriptions);
- UM §7.4 (the header budget on every page);
- RC§4.4 PR 2b (the reach metric's script, never committed, becomes `scripts/ux-measure.mjs`; tooling only).

**Design decisions:**
- **Team on phones:**
  - no logo or h1 visually (the h1 stays for screen readers);
  - one 44px line: "Main lineup · Season 2026 · ● Lineup complete ⓘ", with Edit lineup (icon and label) at its end.
- **Team's sections on phones** (Players, Matches, Leaderboards) do not repeat the section's name as an h1 block: the section row names the page. The scope line stays.
- **Profile on phones:** on Champions, History and Accounts the band collapses into the top bar ("‹ Players · ‹name›", the rank as subtitle). The full band stays on Overview only.
- **The upright top bar's first row** slides away on scroll down and returns on scroll up, from 125% text and on screens under 700px tall. The sections row stays pinned. This challenges the 8 Nov synthesis C1; the measured frame share (38–44%) is the reason.
- **Sections that would scroll** at large text become a 44px "Section: History ▾" button opening a sheet of the four.
- **No lone Filters row:** Filters joins the scope line (Overview) or the search and sort row (All Champions).
- **Riot Accounts** leads with one line ("Main account first; every linked account adds its games"), the rest behind ⓘ.
- **Settings:** one line of help under each field; what does not fit goes behind ⓘ.
- **Text moved behind ⓘ is rewritten first, to 25 words or fewer with the label improved** (TT §6.11), because S4b fixes the bubble's behaviour (TD2–TD4) a day later. Batch 3's bubble then never has to scroll for it. Riot Accounts' six-line paragraph becomes at most two tips of 25 words or fewer.
- **Encounters' segments** and every chip and segment named in UM.TT1 get 44px touch areas. The LP pill stops being a button: its reason goes into the card's ⓘ, which stays keyboard-reachable (TT.TD12).
- **One `tracking-label` token at every width**, enforced by `design-tokens.test.ts`.
- **The page budgets: one set of ceilings, two runners.** For every Player and Admin page they measure height in screens, the frame's share, what is on the first screen, sideways overflow, and touch targets of 44px or more. The ceilings live in `e2e/page-budgets.json`.
  - **The full matrix** (every page × 7 setups × 4 text sizes: about 600 page loads, about 10 minutes at quality.spec's rate of 150 loads in 2.6 minutes) runs in **`scripts/ux-measure.mjs`**, locally, before each PR is ready. It costs no CI time and no deploy; its table goes in the PR body and S11 compares the last one with the audits' baselines.
  - **CI runs a fixed subset** in `e2e/page-budgets.spec.ts` on the phone project: every page at i15 100% and se1 150%, plus the pages the stage changes at its acceptance setups. About 60 loads, about 1 minute.
  - It is a **ratchet**: the ceilings start at today's measured values plus 2%, and every later stage lowers the ceilings of the pages it changes to its acceptance figures.

**Acceptance:**
- **Profile pages:** on Champions, History and Accounts the first item starts directly under the sections row, which gains at least 86px at i15 and at least 150px at i15 150%.
- **The sliding bar:** at 150% text and on 568–667px phones, after a 100px scroll the frame takes at most 25% of the screen (38–44% today).
- **Match History at se1:** the first game card starts above the tab bar (no game on the first screen today).
- **Sections at 150%:** "Accounts" is never cut off; the sheet is used instead.
- **Team at i15:** the header below the bar is at most 56px (102 today). The first card ends at least 40px higher than today at 393×852 and 393×659, net of the new 44px section row. The whole card arrives in S3.
- **Targets:** none under 44px on touch at the UM.TT1 places.
- **Moved text:** every tip S2b creates is 25 words or fewer and opens without scrolling at se1 with 200% text.
- axe 0; WebKit, including the sliding bar.

#### S2c · Desktop frame stability

**Closes:** UD.PO1, X3, S2, X4, P3, X5, T2.

**Design decisions:**
- **One profile header height on all four sections:** a compact 72px band with the banner art behind it. Overview's identity extras move into its first row. The tabs never move on a click.
- **One shared frame:** the content column is at most 100rem wide and centred. Narrower pages left-align inside it, so every page title starts at the same x.
- **Skeletons in the page's shape:** rows (Players, All Champions, Match History), a board (Leaderboards) and a lineup (Team).
- **A 12px floor** for running text and names. 11px stays only for uppercase labels, enforced by `design-tokens.test.ts`.
  - **Not yet on the Match History and Team Matches cards.** Raising their text now would widen the cards at 1280–1440 and worsen UD.H1 and H3 two days before S6b rebuilds them, and the work would be done twice. They sit in the test's own list with the reason "S6b rebuilds these cards"; S6b applies the floor and empties the entry.
- **On Team at 1920 and above,** the section tabs take the lineup's edge.

**Acceptance:**
- The section tabs' y is identical (±1px) across Overview, Champions, History and Accounts at 1280, 1440, 1920 and 2560, with the sidebar open and folded (96px apart today).
- Page titles' x is identical (±1px) across Team, a profile, Resources, Settings and Admin at 1920 and 2560 (up to 536px apart today).
- Client navigation into Players and All Champions shifts the layout by less than 0.02 (layout-shift API).
- Text nodes under 12px (other than uppercase labels) at 1280 and 1440: 0 on Team and All Champions (today 77 and 51), and outside the game cards on Matches and Match History (the cards' 283 and 479 nodes go in S6b).
- Team's tabs and first card share x (±1px) at 1920 and 2560 (38 and 165px apart today).
- **One look on every screen:** a new `e2e/design-parity.spec.ts` (desktop project, setting both sizes itself) renders the shared components (stat label, Panel, DataRow, Chip, Button, the section tabs, InfoTip's bubble, Select) at 375 and at 1440, and compares their computed font family, size in rem, weight, letter-spacing, colours, radius and border. They must be equal unless DESIGN_SYSTEM lists the difference. It would have caught UM.T5 (labels tracked 0.44px on desktop, 1.32px on phones). Each later stage adds the components it creates.

**Live-check facts S2 changes, all in the same PRs:**
- the phone bar holds the 4 destinations with labels (5 today);
- Matchup Intel and Resources are tabs, not account rows (batch 3's "offered once" fact becomes "a tab");
- the account screen holds account items only: the "5 full-width controls" fact gets the new count, and Sign out stays in view;
- the sideways compact bar holds 4 destinations, bars still at most 90px;
- the tablet still holds 4;
- at 390 the Team section row shows the four sections, and Team's header line is at most 56px;
- the profile tabs share a y on every section at 1440;
- the wide facts' fixed x values (414.5 and 620.5px) become "the title's x is equal across destinations";
- kept: Team's 95px centring at 1440, and the first Match History card above the tab bar at 390×844.

**Data:** none.

**Risks and regressions:**
- **Muscle memory:** a Team section from outside Team costs one tap more; section memory removes it for "go back where I was".
- **The Production check:** every pinned frame fact changes.
- **Large text:** the breakpoints move with it.
- **The installed iPhone:** it has no Back, so Settings' Back is tested in WebKit and the iOS Simulator.
- **The sliding bar** can jitter in WebKit.
- **Merge order:** three PRs touch the frame (nav, then budgets, then desktop).

**Deploy:** S2a, S2b and S2c stacked, 20 Nov #2, in the 13:00–21:00 UTC window. If late, S2c moves into S3's deploy.

### S3 · Team Overview and Players: the benchmark page on phones — 21 Nov, deploy 1

**PRs:** S3a Team Overview, S3b Players.

#### S3a · Team Overview

**Closes:**
- UM.T1, T3, T4;
- UD.T1, T4;
- TT.T03, T05, T08–T11, T13, T15, T16, plus T17 and T18 (dead code);
- §2.6 ("begin with Team Overview").

UD.T3 (the empty band above the header at 1920 and 2560) waits for OD13. It is the owner's restored design of 17 Nov, so an A/B preview goes with the stage summary.

Two changes in this stage challenge that restored design, so they are listed in OD20 (veto) with before-and-after screenshots: the phone's lineup pager and shorter card, and five across at 1280–1365 (from a 56rem lineup with the sidebar open). From 1366 up the desktop is unchanged.

**Record 3 (requested before, still open):** Team's phone LCP is ≤ 3.5 s at p75 against its 2.5 s target, while its first byte on phones is ≤ 1 s (STATUS record 3), so most of it comes after the server. With the shorter card the first card's art is requested at the phone's size with `fetchpriority="high"`, and the other four cards' art lazily. The field can only judge it over 7 days: the Monday probes of 23 and 30 Nov read it, and S11 reports it as "deployed, field result pending" until then. Desktop's first byte (≤ 3 s, most likely cold starts) waits for OD5.

**Design decisions:**
- **Phones: a lineup pager.** The role pager becomes five 44–48px segments, each the player's picture with the role icon as a badge and the first name under it; the role is named for screen readers. Under 18rem of pager, pictures and badges only.
- **A shorter card on phones** (60–80px less): the art band goes from 168 to about 120px, and the avatar sits beside the name.
- **Sideways (480px tall or less):** the desktop's five-across row in a compact variant (art 96px, figures on one line; five 140px cards in 734px). Never a centred orphan. At 150%, keep the row as a track.
- **Desktop:**
  - five across from a 56rem lineup (1280 with the sidebar open), using the stacked figure well; 3 + 2 only below 56rem;
  - in Edit mode, Change and Substitute become outline buttons, and Done is the only filled primary.
- **Team's help text:** the first two of T03's reasons show on the line; T09 and T15 are removed; T13's label reads "189K mastery (all-time)"; the unused `SeasonTiles` and `PoolChampionRow` are deleted. T01, T02 and T14 are in S4b.

#### S3b · Players

**Closes:**
- UD.P1 (off roles labelled "also Top");
- UD.P2 (the sync status as a badge in line 1, so every row is 64px);
- UM.P1 (at large text the search gets its own line; one filter interface, the sheet, at every phone posture: the filter part of UM.X3);
- TT.P02, P04 ("In the lineup · Top"), P05 and P09.

**Acceptance (S3):**
- **i15 (393×852):** all five players' pictures and first names are on the first screen (1 of 5 today).
- **The whole first card** at 393×659 and 375×667, the P7 target (cut by about 48px today).
- **se1:** the first card's identity and figures sit above the tab bar (under it today).
- **land (852×393):** five cards in one row, the page at most 1.3 screens (3.46 today), no orphan. At 150%, at least one card on the first screen (none today).
- **1280×800 with the sidebar open:** five across, the page at most 1.0 screen (1.28 today). One row at every width from 1280 to 1400.
- **Edit mode:** exactly one filled primary.
- **Players:** every row 64px with a syncing row present (80px today); two columns at 1440 kept; at 150% the search placeholder is whole.
- **The public team page**, which shares the card, unchanged at 100%.
- **The first card's art** is the phone-sized image with high priority (a unit test of the rendered `img` attributes), and no other card's art loads before it (e2e request order).
- axe 0; WebKit (pager swipe, sideways).
- **CI time:** browser job ≤ 52 min on each head.

**Live check:**
- **Added:**
  - at 390×844 the pager holds five player pictures and the first card ends above the tab bar;
  - at 844×390 five cards in one row, no orphan.
- **Kept:** Team's 95px centring at 1440; Players' phone rows at most 72px.

**Data:** none.

**Risks:**
- the owner's restored desktop design: unchanged from 1366 up; only 1280–1365 changes (T1);
- team-flip timing specs;
- art cropping at 120px;
- the public page.

**Deploy:** 21 Nov #1, in the 13:00–21:00 UTC window.

### S4 · Shared interaction components and tooltip behaviour — 21 Nov, deploy 2

**PRs:** S4a the overlay and preview kit, with its first consumers; S4b Explain (tooltips).
- **S4a is the critical path** (S5, S6, S7a's UI and S9's UI consume it), so it is a deploy unit of its own: S5 and S6 stack on S4a only, never on S4b.
- S4b is stacked on S2 beside S4a, not on it, and rides with S4a when both are green. Otherwise S4a deploys alone and S4b takes the next reserve slot or rides with S5. Only S8 needs S4b.
- What may leave S4a if it runs late, since nothing downstream needs it: the 15 `Select` replacements (to S8a) and Encounters' Refine (to S6c).

#### S4a · The overlay and preview kit

**Closes:**
- UD.X1, X2, X7, X8, T5, D1, M1, H4;
- UM.X3 (the preview contract), X4 (the position restored), X1 (decided by pointer and posture; applied to games in S6c), X2 (the phone window shell);
- CM.MH-8 (the history rule);
- §1.3–§1.6, §2.18.

**Design decisions.** One shared set of containers, chosen by what the content is, never by page. Each is one component in `src/components/ui`, and DESIGN_SYSTEM §7 gets one table of them:

1. **Peek: a quick look at one item from a list or a board.**
   - **Variants.** `PreviewHost` picks one by the room available:
     - (a) **in-card unfold:** the list declares its foldable columns and the panel takes their space, so nothing reflows (All Champions);
     - (b) **docked panel:** `clamp(26rem, 34vw, 36rem)` at the right of `main`, over the page with a shadow and no dimming, for parents that are not lists (the Team lineup, the Leaderboards board);
     - (c) **drawer:** 26rem with ‹ ›, when the room is under 26rem (1024–1279 with the sidebar open, tablets, large text);
     - (d) **phone sheet** (content-sized) or **full screen**.

     Every variant has the same content and the same address.
   - **The list stays live:**
     - another row switches the panel;
     - ↑/↓ (or J/K) move the selection;
     - the selected row takes `surface-3` and a 2px accent bar.
   - **Close:** ✕, Escape, Back, or the selected row again. An outside click does not close it on desktop.
   - **Address:** on the current page (`?champion=`, `?player=`, `?match=`, `?person=`).
     - The first open pushes an entry, switching replaces it, and closing pops it if this page pushed it.
     - A deep link renders it on the server.
   - **Focus:**
     - opened by a click, focus stays on the row and the panel is announced;
     - opened with Enter, focus moves to the panel's heading;
     - Escape returns focus to the row.
   - **Scroll:** the page never moves on open, switch or close. The panel scrolls inside only when it is taller than the window: the one allowed nested scroller, with a sticky header and `overscroll-behavior: contain`.
   - **Motion:**
     - open: a 16px slide and fade, 200ms, `--ease-emphasized`;
     - switch: a 120ms cross-fade;
     - close: 140ms;
     - reduced motion: instant.
2. **Unfold: an inline expansion for items compared in a vertical list** (games).
   - One open at a time.
   - **Anchored switching:** record the clicked card's top on screen, apply the change, then `scrollBy` the difference in `useLayoutEffect`, before paint.
   - **Close:** the card again, Escape, a compact sticky header, or Back.
   - **Height:** stable, with no sub-tabs that change it. Height animates 0fr→1fr over 200ms and the content fades in over 120ms.
3. **Task dialog: a centred modal for work that needs full attention** (editors, confirmations, pickers, Card Studio, file positioning, Install).
   - Today's rules stay: focus trap, Escape, backdrop, Close, focus return, only the body scrolls, actions in the footer.
   - **Sizes:** 30rem for forms and confirmations, 42rem for pickers, 76rem for Card Studio only.
   - No horizontal scroller inside on desktop, and no address change.
4. **Popover: anchored choices** (menus, Refine, Select, filter dropdowns, the pinned row's Filters).
   - Opens on click, Enter or Space.
   - Closes on an outside click, Escape, a choice, or the trigger leaving the screen.
   - No dimming and no address of its own; choices replace the query.
   - **Style:** `bg-elevated` with a border and shadow, and a 160ms fade with a 2px slide.
   - **One `Select`** for desktop toolbars. Phone sheets keep native selects.
5. **Explain:** see S4b.
6. **Fold** (native `details`): one chevron and one spacing everywhere.
7. **One history rule.** Opening pushes one entry, switching replaces it, closing goes Back if this page pushed. So Back always closes what is open and never walks through items.
8. **The phone window shell** (`PreviewWindow` on `DetailModal`):
   - a collapsing header (a 56px bar once the body scrolls);
   - ‹ › for the item's siblings;
   - pull-down on the header closes every full-screen window, not only sheets;
   - the scroll position recorded at open is restored on close, and focus returns with `preventScroll`.
9. **Pointer and posture decide, not width.** A touch phone (coarse pointer and a side under 768px, or a short window) always gets the window or sheet, never an inline expansion.

**Where each list item opens: one decision per item** (UD §5's deviations and UM.X3's contract; DESIGN_SYSTEM §7 records them):

| Item | Opens as | Stage | Why |
|---|---|---|---|
| A champion (All Champions, pools) | Peek, in-card unfold | S5 | the list is the context; nothing reflows |
| A team player (Team lineup) | Peek, docked | S4a | the lineup is not a list to fold |
| **A player row on Players, a member row on Leaderboards** | **Peek** with the same player content as Team's; the row's name stays a link to the full profile | S8a | a quick look without losing the list, and the profile still one tap away (J3 stays 2 taps); today they are full-page navigation |
| A game (Match History, Team Matches) | Unfold on desktop and tablet; the window on touch phones | S6 | games are compared down a list |
| A record's game | Peek over the board (window on phones), "Open in Match History" inside | S6c | it closes onto the board, not another page |
| **An encounter** | **Stays a view** (`?met=`), pushed as one entry; Back and "‹ All encounters" return to the list at its exact position | S6c | its content is a list of games that open themselves; a Peek would nest a window inside a window, which the one-container rule avoids |
| **A pair in Matchup Intel** | **Not a preview:** changing a champion replaces the address (like a filter), so Back leaves Matchup Intel instead of walking through pairs; "Recent" in the picker returns to earlier pairs | S7a | the pair is the page's own state; today every pair pushes an entry |
| **A person in Admin** | **A window** (`DetailModal`, full screen on phones) with the Peek's address and history rules (`?person=`, pushed on open, Back closes, the list's scroll kept) | S9a | it holds editors and a Danger zone: work, not a quick look |

**First consumers in S4a** (so nothing ships unused):
- **The Team player window becomes a docked Peek:** `?player=`, Back closes it, ↑/↓ and ‹ › switch, no inner scroll.
- **The pinned row's Filters becomes a Popover** of 34rem, with the five role segments in view (D1).
- **The 15 native toolbar selects become `Select`** (X7, M1).
- **Encounters keeps Refine visible,** disabled with its reason (H4).
- **Every window's close restores the list's position.**

**Acceptance:**
- **Team player window:**
  - Back closes it: one entry is pushed, and after three switches Back still closes;
  - no inner scroll at 1440 and 1920 (681px in 589 and 753 in 726 today);
  - ↑/↓ switch, and focus returns to the card.
- **Filters:** "Support" fully visible with no sideways scroll at 1440, 1920 and 2560.
- **Selects:** 0 native selects in desktop toolbars (15 today). `Select` looks the same in Chromium and WebKit (screenshot compare in the WebKit workflow).
- **List position:** closing a window opened from an item partly under the tab bar moves the list 0px (70–109px today).
- **Pull-down:** every full-screen phone window closes by pulling its header down (WebKit touch test).
- **Android's Back:** in the emulated installed app, `page.goBack()` closes the Team player Peek and the Filters popover and changes nothing else.
- **Parity:** `design-parity.spec.ts` gains Peek, `PreviewWindow`, Popover and `Select`.
- **CI time:** browser job ≤ 52 min on the head.

#### S4b · Explain: tooltip behaviour, the 12 wrong items and the 16 long tips

**Closes:**
- TT.TD1–TD5, TD8, TD10–TD13, TT §2 and TT recommendations 1–3;
- **the 12 wrong items:** G14 and I05 (done in S0b), G15, T14, C05, H12, H22, S15, A02, D01, D02, D06;
- **the 16 long tips rewritten to 25 words or fewer:** E01, H27, H18, D05, L04 (removed; the rows' qualifiers carry it), C13, O10, S09, H19, H01, M01, O06, H26, H33, L01, T01;
- also T02;
- UM.TT2; UD.X6 (the rule; the last explanatory `title`s go in S8b);
- §6.6–§6.10, and §6.1–§6.5 in part.

**Design decisions** (TT §2):
- **One component.** `InfoTip` for every explanation. A `title` only names an icon-only control or shows a truncated value whole.
- **Length:** at most about 25 words, with a hard limit of 40. A unit test counts the words in every InfoTip `text`, `title` and `hint`, with three rules so that it passes on S4b's own head:
  - **a tip with several states or entries is counted per state or entry** (H10's four LP states, G04's status lines, A06's account states), each held to the same limits;
  - **two permanent exemptions, each with its reason in the test:** G13, Riot's required notice, shown whole where it must be; and screen-reader-only descriptions such as I08, which are not tips;
  - **an allowlist of the tips still due in later stages**, each entry naming the stage that empties it: H09 (42 words), H32 (41), M02 (69) and H10's states in S6 (H10's proposed rewrite is still 50 words in all, so S6 rewrites it state by state); I01 (49) in S7a; G02's glossary texts (43) and D07's titles in S8b. S8b leaves only the exemptions.
- **Explanatory `title`s:** a "no explanation in a `title`" check is added, with an explicit allowlist of the titles still to be retired. S8b empties that list.
- **The trigger:**
  - an ⓘ (16px mark, 24px target, 44px on touch) or a term with a dotted underline;
  - a specific accessible name, with `label` required: never "More information".
- **Desktop:**
  - opens after 150ms of hover, at once on keyboard focus;
  - the bubble takes the pointer and the 6px gap is bridged (WCAG 1.4.13, hoverable);
  - closes 100ms after the pointer leaves both, on blur, or on Escape (the bubble only).
- **Touch:**
  - a tap opens it;
  - any tap closes it, and that closing tap does nothing else (`preventDefault`);
  - scrolling closes it.
- **Placement:**
  - above, else below, clamped 8px inside the screen;
  - never over its own trigger;
  - when neither side fits, a small bottom sheet with the same text. This replaces batch 3's scroll-in-bubble.
- **Look:** unchanged.
- **The LP tip is tabbable** (TD12).

**Acceptance:**
- **At se1 with 200% text,** all 14 measured tips (S01–S15) fit on one side of their ⓘ or open as a sheet:
  - 0 cover their own ⓘ (12 of 14 today);
  - 0 are cut off (8 today);
  - no `overflow-y: auto` inside a bubble.
- **Tap-through:** a tap on an open bubble activates nothing under it (the two reproduced cases: Ranked progress's queue, Team Matches' Filters).
- **Hover:** moving the pointer from the ⓘ into the bubble keeps it open. The hover delay measures 140–200ms.
- **Names:** 0 ⓘ named "More information" (16 today).
- **Length:** outside the allowlist, every tip (each state counted alone) is at most 40 words, at least 95% are at most 25, and at least 90% are at most 4 lines at 375px. The allowlist holds only ids with a later stage.
- **The 12 wrong items** each have a test, for example "their" on another player's page for C05, H12 and H22, through `viewerWords` (§1.12).
- **CI time:** browser job ≤ 52 min on the head.
- **Live check** (+2 facts, on pages already loaded):
  - a tip opens on a tap at 390×844 inside the screen and closes on a second tap without activating what is under it;
  - a Team card opens the player panel with `?player=`, and Back closes it.

  The Reach fact is updated: on desktop, Filters from the pinned row opens a popover.

**Data:** none.

**Risks:**
- InfoTip has 46 call sites, some inside open windows;
- `Select`'s keyboard and listbox behaviour in WebKit;
- the history rule changes Back on the Team player window;
- CI time.

**Deploy:** S4a, with S4b when both are green, 21 Nov #2 in the 13:00–21:00 UTC window. If S4b is not green, S4a goes alone (above). The owner reads Vercel's Active CPU the next morning (OD5).

### S5 · All Champions: the preview that unfolds over the list — 22 Nov, deploy 1

**PRs:** S5a, the list rows and the server actions; S5b, the preview (desktop in-card, drawer, phone sheet).

**Closes:**
- §4.1–§4.11;
- CM.AC-1–AC-9 and AC-11 (AC-10 went in S1b);
- UD.C1, C2, C3; UM.AC1; UM.S2 for All Champions (if not in S2b);
- TT.C01–C18: C01, C04 and C06 removed; C02, C03, C07, C09, C12, C14, C16 and C18 rewritten; C17 relabelled; C15's icon changed so it does not look tappable; C08, C10 and C11 kept;
- RC§4.4 PR 8b's deviation (superseded: the lane tables leave the panel).

**Design decisions** (CM §4):

- **Desktop, from a list of about 50rem:**
  - Champion, Games and Win rate keep their exact x.
  - The columns after Win rate fold (`visibility: hidden`, so the widths hold and nothing reflows).
  - The preview takes that space inside the same card: about 27rem at 1440, 28–33rem at 1920.
  - It is joined to its row: the row's `surface-3` and accent bar run to the panel's edge, with a 2px notch.
  - It is sticky under the pinned tabs.
- **Fallbacks:**
  - a 26rem drawer with ‹ › when the folded room is under 26rem, and always on tablets;
  - on phones, a sheet (`DetailModal size="sheet"`) with ‹ ›, pull-down and the opponents first.
- **Content, in this order and nothing else:**
  1. **Header:** a 56px portrait, the name, "Top · Primary pool" and ✕. With several roles, "Also as Mid: 3 games · 1W 2L", a link that switches.
  2. **Figures:** the win rate large (toned by `winRateTone` at 5 games or more), "14 games · 4W 10L", and one quiet "KDA · CS/min · mastery" line.
  3. **"Against each lane opponent",** with Most games · Best · Worst.
     - Rows of 46px; an opponent shows a percentage at 3+ games, toned at 5+, with its games beside it.
     - Opponents with 1–2 games fold into "N more opponents with 1–2 games" (W/L only).
     - With none at 3+: all of them with W/L and "No opponent met 3 times yet".
     - Best and Worst rank 5+ first, then 3–4.
  4. **An opponent unfolds in place:**
     - one sentence, only with at least 5 games with a timeline (`MIN_PATTERN_GAMES`, using `describeLane`'s "in these games, never a cause"), worded for the viewer (§1.12): "At 10:00 you had more gold than Nasus in 5 of 6 games with a timeline" on one's own profile, "At 10:00 Gwen had more gold than Nasus in 5 of 6 …" on a teammate's;
     - its games as compact rows;
     - "Prepare Gwen vs Nasus in Matchup Intel →", the only link to the pre-game tool, which keeps §4 distinct from Matchup Intel.
  5. **The foot line:** "Lane opponent: the enemy Riot placed in your position. Known in N of M games." ("in their position" on a teammate's profile).
- **Removed:**
  - the tabs and the six tiles;
  - the multikill strip;
  - the lane tables, the chart and the second checkpoint table;
  - the queue and account split;
  - "How these figures are made";
  - the window's own Refine and scope line.
- **History and address:**
  - the history rule applies;
  - one address key, `?champion=&crole=[&vs=]`;
  - old `?champ=` and `tab=matchups&vs=` links and `/players/[id]/matchups` keep working;
  - a pool on the profile Overview links to All Champions with the preview open (AC-9).
- **Data path:**
  - `getChampionPreviewAction`: the opponents' tally from the cached rows, with no match-record read;
  - `getPairingGamesAction`: the pair's games, through the non-exact path;
  - results are cached per page;
  - the address changes with `pushState` and `replaceState`, never a navigation;
  - pressing a row prefetches;
  - the actions carry the same `view-teammate-stats` checks and the personal-use rule as the profile pages (`guards.test.ts`, and a DB test that a viewer without the right gets nothing, §1.11).
- **Lists:**
  - phone rows are 64px: portrait, the name over the role and In pool, the win rate over the games;
  - the wide-tier Kills column is dropped (it sorts like Games; per-game kills are in KDA; reversible, OD20);
  - one spelling, "All Champions".

**Acceptance:**
- **Stability** at 1280 (sidebar folded), 1440 and 1920:
  - Champion, Games and Win rate keep their x (±1px) before and after opening;
  - `scrollY` is unchanged on open, switch and close;
  - rows stay 51px.
- **Size:** the folded preview is at most 650px tall for every demo champion, with no inner scroll.
- **Switching:** one click or ↑/↓ (today: close, re-aim, click). No page render: one server-action call of at most 5 KB (17–21 KB today), and content within 300ms locally (946–1,184ms today).
- **History:** opening pushes one entry; after three switches, Back closes.
- **Content:**
  - at most 30 figures in the preview (128 and 155 today);
  - at most one toned figure per row;
  - win rates against an opponent only at 3+ games, with the games beside each;
  - the foot line present.
- **Phones:**
  - at least 7 whole rows above the tab bar at i12 (4 today), and at least 2 at se1 (0 today);
  - the sheet at most 470px for the demo's Gwen, with the opponents on its first screen (1.15 screens down today).
- **The drawer** is tested at 1024–1279 with the sidebar open and at 150–200% text.
- **Closing:** ✕, Escape, Back and pull-down all close it, and focus returns to the row.
- **axe:** 0. The desktop `aside` is not modal; the drawer and sheet are.
- **WebKit:** the sheet and the drawer.
- **Wording:** the opponent sentence and the foot line render "you/your" on the viewer's own profile and "they/their" or the champion's name on a teammate's (unit, both ways).
- **Journeys:** J8 (a champion's matchups) takes 3 taps (4 today).
- **Specs:** the 14 champion-window specs are rewritten, with net test time no higher.
- **CI time:** browser job ≤ 52 min on each head.

**Live check:**
- "The champion window opens and Escape closes it" becomes: at 1440 the preview opens beside the list with Champion, Games and Win rate in place (±1px) and the page not scrolled, and Escape and Back close it; at 390×844 the sheet opens and Back closes it.
- Rows stay at most 56px on desktop, plus a new phone fact of at most 64px.

**Data:** none (the existing tally; F1 from S1). `perf-probe` after the deploy.

**Risks:**
- the folded columns' geometry across widths and text sizes;
- old links;
- caching that must keep the same access checks;
- the lane-by-minute views are dropped. They come back as a fold under an opponent if missed, never as a tab.

**Deploy:** S5a and S5b stacked on S4a, 22 Nov #1, in the 13:00–21:00 UTC window.

### S6 · Match History, Team Matches and Encounters: one post-game view — 22 Nov #2 and 23 Nov #1

**PRs:**
- **S6a:** the notes, pure domain plus data. Start it now, from main.
- **S6b:** the post-game view on desktop and tablet, and in Team Matches.
- **S6c:** the phone window, records on the board, and Encounters.

**Closes:**
- §5.1–§5.13;
- CM.MH-1–MH-10, CM.D-3, and D-1's display (once OD7 names the shards);
- UD.H1, H2, H3, M2, L3, E1 (the doc);
- UM.X1, X2 and X3 for games and records; TM1, TM2; UM.E1; CM.MH-9;
- TT.H02–H39 applied: H26–H31 and H36 removed with the Analysis, H10 rewritten state by state, H09 and H32 shortened (their word-test allowlist entries removed), H23 "Lane opponent"; M02–M04, M06; E02, E03; G10 (loadout names on tap);
- S2c's 12px floor on the game cards (UD.H1, H3 at 1280–1440);
- MI.F2 in Match History: the checkpoints are named as times, never "laning phase";
- RC§4.4 PR 7b's missed sideways target (superseded: a sideways phone opens the window).

**S6a design decisions:**
- **`src/domain/match-notes.ts`** holds the 22 rules (L1–L5, D1–D3, P1–P3, K1, T1–T3, V1, S1, M1, G1–G2, J1, and F* for Focus), with every threshold a named constant. **The hard rules:**
  1. every note is a fact with its numbers and its comparison base;
  2. no cause or verdict words: a `refused-words` test rejects "because", "due to", "caused", "led to", "thanks to", "cost", "should have", "mistake", "good", "bad", "great", "poor", "terrible", "feed", "fed", "int", "carry", "throw" and "threw";
  3. at most 20 words a sentence;
  4. champions are named, never other players;
  5. missing data skips the rule silently;
  6. "laning phase" is never named; the checkpoints are times;
  7. remakes are never analysed;
  8. **worded for the viewer** (§1.12): CM §6.4's templates are second person ("{n} of your {d} deaths…", "Your highest…", "Your gold lead…", "Your team won…"). On one's own game they stay so; on a teammate's game they name the champion and say "their" ("3 of Gwen's 5 deaths came before 10 minutes", "Their team won from 3,400 gold behind"), never the player.
- **Who sees which answers.** Went well and Went wrong are facts and show on every game the viewer may open. **Focus next shows only on the viewer's own games**: it is a suggestion addressed to the player, and on a teammate's game it would be one member coaching another unasked (OD20).
- **Selection:** at most 2 Went well and 2 Went wrong (distinct topics), then 1 Focus. The game's result does not bias the choice.
- **Fallbacks** are always one honest line, never an empty box.
- **`pairMoments()`** computes the bot-lane 2v2 (the pair's gold at 10:00).
- **D-3:** kill participation, gold per minute and damage share join `SeasonGame`, so K1 has a baseline.
- **The LP** passes into `MatchDetailView`.
- **`docs/MATCH_NOTES.md`** holds the rule table as the source of truth.

**S6b design decisions** (CM §6.2):
- **The card folds into a 50px header:** the result rail, "Victory", time, queue and date, the LP chip, and champion · role, with ‹ Previous · Next › · Close ▴.
- **Two columns:**
  - **"Your game":**
    - the loadout: a 72px portrait with its level; spells and runes in a 2×2 at 30px; a 2×3 inventory with the trinket beside the first row at 40px, in inset slots, with empty slots as quiet tiles;
    - the rune line, with the shards once named and stored;
    - six figure tiles, each figure once: K/D/A over KDA, CS over per minute, Gold over per minute, Damage over its share, Vision over wards, kill participation over "of N kills";
    - the lane by role (CM §6.5). With no unique opponent: "Lane opponent not clear in this game";
    - the notes.
  - **"Scoreboard":** a compact `TeamTable`:
    - the player's team first;
    - one line per team for its kills, gold, towers, dragons and barons;
    - 37px rows, with the player's row lit;
    - members marked by weight and an avatar ring, not by brand blue;
    - the "Lane opponent" chip and "Met N×";
    - possible groups and the ranks note on one line.
- **Folds:** "Gold over the game" and "Build order and skill order".
- **Closing and switching:**
  - a sticky footer with Previous, Next and Close;
  - Escape closes;
  - anchored switching;
  - the history rule (desktop Back now closes a game, which challenges the 8 Nov P2 decision: OD20).
- **A missing timeline** gives one quiet line, "Timeline not available for this game".
- **Narrow:** the columns stack below a 60rem breakdown.
- **Team → Matches** uses the same view, from the member's perspective.
- **Cards:**
  - at 1280 with the sidebar open, the card keeps the build and drops the rosters first (H1);
  - names stay whole (H3), and roster names are at least 12px (M2);
  - **S2c's 12px floor reaches the cards here**, designed with the card rather than added on top, and the test's "S6b" entry is removed.
- **Every loadout icon names itself** (TT.G10): items, the trinket, runes and spells show their name on hover and keyboard focus on desktop, and on a tap through S4b's Explain on touch, never only in a `title`. The same holds in Team Matches and in S7b's rune and item lines.
- **Team Matches cards (TM1, TM2, M06):**
  - on touch the whole card opens the game, and names link inside it;
  - the Solo/Duo caveat moves behind the result line's ⓘ;
  - CS and damage show under the K/D/A.
- **Team → Matches reads members' games** through the same visibility rules as today's `/matches` (`view-teammate-stats`; personal-use profiles excluded), with a DB test (§1.11).

**S6c design decisions** (CM §6.3):
- **The phone window:**
  - **Header:** 52px plus the top inset ("Victory · Gwen", the LP chip, ✕).
  - **Body, the one scroller:**
    - the meta line;
    - the loadout row: a 56px portrait, a 2×2 at 24px, and 2×3 plus the trinket at 32px;
    - the rune line and the figures in a 3×2;
    - the lane, then the notes;
    - the scoreboard in two-line 48px rows;
    - the folds.
  - **Bottom bar:** 60px plus the inset: ‹ Previous · "Game 3 of 10" · Next ›, each a 44px target.
- **Switching:**
  - replaces `?match=` and cross-fades;
  - scrolls the body to the top;
  - announces "Game 4 of 10: Defeat on Jax";
  - is disabled at the ends;
  - **no swipe in v1:** it would fight iOS's edge-swipe Back.
- **Closing (✕, Back or pull-down):** the list is scrolled, instantly and unseen, to the last game viewed, and that card gets the focus.
- **A sideways phone,** like every touch phone, opens the window, never the inline game (UM.X1).
- **A record's game** opens over the board at `/leaderboards?match=…` (a docked Peek on desktop, the window on phones), with "Open in Match History" inside (UD.L3). Its server action checks that the viewer may see that member's games (`view-teammate-stats`; personal-use profiles never), with a DB test (§1.11).
- **Encounters on phones:**
  - the highlights become one line;
  - the search sits behind the toolbar's icon;
  - the repeated first-row card goes (MH-9, UM.E1).
- **An encounter stays a view** (S4a's table): opening it pushes one entry, and Back or "‹ All encounters" returns to the list at its exact scroll position, with the focus on that row (today it returns to the top).
- **UX_CONSISTENCY.md** says Encounters is a view (UD.E1), and why.

**Acceptance (S6):**
- **Desktop at 1440×900:**
  - the card and the open game take at most 680px (target about 620), so Close is on the first screen (1,011px down today);
  - 0 tabs;
  - Previous and Next keep the header's y (±2px): in the mh2 scenario 300 → 300, not 300 → −123 → 64;
  - Escape closes and focus returns;
  - Back closes: one entry, and after three Nexts Back still closes.
- **Each figure once:** in the expansion CS/min goes from 4× to 1×, and kill participation, damage share, KDA and damage/min from 3× to 1× (a repetition test).
- **Notes (unit tests):**
  - at most 2 + 2 + 1;
  - each at most 20 words, with 0 refused words;
  - each carries its number and comparison base;
  - every template renders both ways: second person for the viewer's own game, the champion's name and "their" for a teammate's, never a player's name;
  - Focus next is absent on a teammate's game;
  - the fallbacks run on demo games without a timeline, without a baseline, and for a support.
- **Names on tap:** at i12, a tap on an item, a rune and a spell shows its name inside the screen; axe 0.
- **Tips:** S4b's word test no longer lists H09, H32, M02 or H10, and passes.
- **Encounters:** closing an encounter returns the list to its scroll position (0px drift).
- **Journeys:** J11 (open a game, Next, close: 0 scroll-backs, ending on the last game viewed) and J13 (a record's game and back: 2 taps, ending on `/leaderboards`).
- **Visibility:** DB tests for Team Matches and `/leaderboards?match=`: a viewer without `view-teammate-stats` gets nothing, and a personal-use profile's game is never served to another member.
- **CI time:** browser job ≤ 52 min on each head.
- **1280 with the sidebar open:** the card shows the six items and the trinket (none today).
- **Phones at i12:**
  - the pinned chrome is at most 112px including the inset (205 today);
  - result, loadout, runes, figures, lane and the three answers are on the first screen, and the scoreboard starts at or above 680px;
  - the whole game is at most 2.0 screens (about 7 across the tabs today);
  - Previous and Next need 0 scroll, and closing needs no reach to the top;
  - after closing, the list sits on the last game viewed with 0px drift (70–109px today).
- **se1:** no colliding labels; the first screen holds the result and the loadout.
- **land:** the window opens, so there is no scrolling back to close (2.26 screens today).
- **Records:** closing leaves you on `/leaderboards`.
- **Encounters at 390:** the list starts at or above 300px (about 540 today).
- axe 0; WebKit (the window, the bottom bar, pull-down); the 14 match specs reworked with net test time no higher.

**Live check, kept and extended:**
- a game opens under its card with `?match=` (now pushed), a copied link reopens it, Back closes it, and Close returns the focus to the card;
- no tabs, and card plus game fit in 1 screen at 1440×900;
- Next keeps the header's y (±2px);
- on phones, a whole screen with Previous and Next, where Next replaces the address and Back closes;
- the first card ends above the tab bar at 390×844;
- the CS, damage and K/D/A column facts re-pinned to the new layout;
- a record's game keeps `/leaderboards`.

**Data:** no migration.
- D-3 adds loader fields, so run `perf-probe` after the deploy.
- The timeline is read on open: 10–20 KB from storage. Riot is asked only for a game not stored, and a game older than the backfill window only when a fold is opened.
- Shards come from S1's capture, shown once OD7 names them.

**Risks:**
- DESIGN_SYSTEM §1 says Match History changes only for a product decision. Record the 19 Nov directive as that decision; the card's D8 density is unchanged.
- the notes' honesty;
- egress and Riot requests;
- about 14 specs;
- the Team Matches perspective;
- iOS's edge swipe.

**Deploy:** S6a and S6b stacked on S4a, 22 Nov #2, then S6c on 23 Nov #1, each in the 13:00–21:00 UTC window. All three go as one batch if all are green together. The owner reads Active CPU after S6 (OD5).

### S7 · Matchup Intel for all five roles (Tier 0: buildable now) — 23 Nov #2 and 24 Nov #1

**PRs:** S7a roles, lane structures and static data; S7b evidence from the team's own games, evidence tiers and pipeline health (with the one migration).

**Closes:**
- §3.2–§3.8, §3.9(g), §3.9(o), §3.10–§3.19, §3.23;
- §3.9(a)–(f), (l) and (m) in part, as evidence from the team's own games (the rest is S10);
- §3.9(h)–(k) and (n) as honest fallbacks;
- §3.20(a)–(h) for the static and own-games parts;
- MI Tier 0 items 1–6, MI.F2, F4, and F5 together with OD1;
- CM.D-2;
- UD.I3, I4, I5; UM.MI1;
- TT.I01, I04 ("May be out of date"), I06, I07;
- RC§7.2: decisions 2 and 3 revisited. "Group, never judge" and no pairing by rule stay for kit facts; sentences built from evidence are allowed only with their n and their label;
- MATCHUP_INTEL.md's "Not built" list, decided (below).

**S7 needs no owner action.** mi-evidence §4.4 puts all of Tier 0 at "now, no owner action, no new Riot use", and calls "In your games" honest under the current registration: no Riot request, Data Dragon only, and the members' own stored games inside the team. OD1's text mentions Riot's tips and the counts at the next paste (§4.4 item 3: "mention them at the next registration update"), but nothing in S7 waits for that paste, and nothing in S7 needs an off switch beyond S0b's.

**S7a design decisions:**
- **A role selector:** Top · Jungle · Mid · ADC · Support, remembered per browser under the account's key (the existing pattern).
- **The lane structures:**

  | Role | Inputs | Seen from |
  |---|---|---|
  | Top, Jungle, Mid | You vs the enemy (2 slots) | yours |
  | ADC | your ADC and support vs their ADC and support (4 slots) | the ADC's |
  | Support | the same four | the support's |

  - Lanes take no full team and no jungle input.
  - The address carries the role and the champions (`?role=adc&champion=&ally=&vs=&vs2=`), so a reload and sharing work.
  - **Changing a champion or the role replaces the address** (S4a's table: the pair is the page's state, like a filter), so Back leaves Matchup Intel instead of walking through pairs. "Recent" in the picker returns to an earlier pair.
  - Old `?champion=&vs=` links open as a 1v1 in the role last used, else Top.
  - **A 2v2 with empty slots:** each empty slot says what it wants ("Choose the enemy support"), and its space is kept, so filling it moves nothing. The page shows the kits of the champions chosen so far. Evidence lines count only games that match every chosen slot, and say which slots they ignore.
- **The picker:** Recent, Your pool, a role filter, and placeholder tiles with initials.
- **The slots:** content-sized and centred on the swap, labelled "Your champion" and "Enemy".
- **Sharing:** the address already carries the pair. The installed app has no address bar, so a "Copy link" icon button sits in the header (the Web Share sheet on phones). A link opens only for signed-in members.
- **MATCHUP_INTEL.md's "Not built" list:** sharing a briefing is delivered by the link above. Favourite matchups are not built: Recent and Your pool already return to a pair in one tap, and a third list would be a control for the same need (directive §7, "no unnecessary controls"). The member's notebook stays unbuilt: it needs the owner's go-ahead and a privacy-notice change (OD9).
- **On phones:**
  - a pinned pair bar (40px portraits and the swap) once the slots scroll away;
  - "Remember" becomes an icon toggle, and the meta line moves into the source footer;
  - the first screen at i12 (390×844) holds the pair bar, every enemy ability tile with its cooldown line and the first evidence row. In a 2v2 the two enemies' tiles are two rows of five 64px tiles.
- **The title** takes the same h1 size as the other destinations.
- **Static data, from the downloads `version-check` already makes:**
  - items' gold, tags, `from`/`into`/`depth`, and the ability haste parsed from `<stats>`, pinned by a test against the 70 Summoner's Rift shop items;
  - summoner spells' cooldowns;
  - the rune slot structure.
- **The cooldown table at a chosen haste (0, 20, 40, 60 or typed).** Each enemy ability shows Riot's base cooldown per rank, as today. A hasted value is shown only where the haste rule is known to apply, and every case says which it is:
  - **the checked notes mark the ability static** (`static: ability haste does not shorten it`, types.ts:166 and 210): the base at every haste, "Static: haste doesn't shorten it";
  - **the checked notes left it open** (Riven vs Mordekaiser lists "whether ability haste shortens Death's Grasp's cooldown" among what no saved page states): the base only, "Whether haste shortens it isn't known". Today that list is a comment, so the notes gain a structured `hasteUnknown: true` beside `static`, set for each ability a note leaves out this way, and `curated.test.ts` checks that every such comment has its flag;
  - **everything else with a Riot number** (most of the 624): the hasted value by Riot's published rule, base × 100 / (100 + haste), marked "Riot's general rule". Its tip says that Riot's data does not list the abilities the rule does not apply to, and that 6 champions are checked. MATCHUP_INTEL.md states how many of the 24 checked cooldowns the rule gets right;
  - **R** says "ability haste only": ultimate haste from some runes and items is not included;
  - **summoner spells** show their base cooldown only, "Summoner spell haste is a separate stat", never reduced by ability haste;
  - refunds, resets, passives and charges' recharge read "not in Riot's data", or use the checked notes where they exist;
  - **never a timer or "ready at"** (game integrity).
  - *Considered: the base alone wherever the checked notes do not say how haste applies.* Taken for every ability the notes mark static or leave open, and for summoner spells and R. Not taken for the rest: Riot's own 2020 rule says how ability haste shortens cooldowns, mi-evidence rated this table buildable honestly (A), and hiding it for 167 champions would drop the directive's "accounting for ranks and relevant modifiers" where Riot's own rule supports it. The visible "Riot's general rule" mark keeps it from reading as checked.
- **Riot's own tips:** each enemy's `enemytips` and your champion's `allytips`, verbatim, in quotation marks, attributed "Riot's tip (may predate later changes)". Otherwise "Riot publishes no tip for X".
- **"What it means" is a fact, never a verdict.** One line per briefing row, built only from numbers (for example "After E, Darius has no pull for 21 s at rank 3 with 20 haste").
- **The refused-words test, exactly** (mi-evidence §7: "revisit the refused-words list"):
  - **curated text, kit facts, the assembled reference's fixed sentences and S7a's "what it means" lines:** `REFUSED_WORDS` unchanged ("you/your", "try to", "avoid", "win", "best", "never" and the rest);
  - **Riot's tips are exempt** as attributed quotes: they are Riot's words ("Try to stay away from walls. Ornn is much less strong if he cannot stun you."), shown in quotation marks, and a byte-equal test against Data Dragon makes sure nothing of the app's own hides in the exemption;
  - **S7b's evidence templates use an agreed vocabulary:** "you/your" only as the possessive of the viewer's own games ("In your games", "4 of your 9 games") and "won/lost" only as counted results. Instructions (must, should, need to, try to, avoid, make sure, wait for), verdicts (best, optimal, counter, easy, win as a verdict) and absolutes (always, never) stay refused. This is a second list, `EVIDENCE_REFUSED_WORDS`, with its own test.
- **The bot lane:** both enemies' kits, cooldowns and tips side by side; your duo's kits folded; "No curated notes for this 2v2".
- **The layout on desktop:**
  - one header line: the role selector, the slots with the swap, the haste choice and "Copy link";
  - **1440 and wider, three columns:**
    1. the enemy's kit (in a 2v2 the two enemies' kits as two compact columns of five tiles);
    2. the briefing rows with their tiers, at most six, one line each, with details folded;
    3. Riot's tips: the first tip per enemy, the rest behind "Riot's tips (n)".
  - your champion's (or your duo's) kit folded under the columns, and the sources in the footer;
  - **1280–1439:** two columns (the kit or kits, and the briefing), with the tips folded.

**S7b design decisions:**
- **"In your games"** (the viewer's own) **and "In the team's games"** (members whose statistics the viewer may already see, through `view-teammate-stats`, with personal-use profiles excluded; counts only, no names), each with a DB test (§1.11):
  - **per champion, and against the chosen opponent at n ≥ 3:**
    - the rune page (keystone and five runes; shards once named and stored);
    - spells;
    - starting items;
    - the first shop visit;
    - the first 1–3 completed items (S7a's item metadata);
    - the skill order (first three levels, max order);
  - **Jungle (§3.9l):** before 15 minutes, the share of dragons, voidgrubs and heralds the team took in the viewer's games as Jungle against the chosen enemy jungler ("your team took 7 of 12 in 4 games"), from the stored `events.objectives` (CM's J1 rule), at n ≥ 3;
  - **bot lane, pairwise (§3.9m):** for ADC and Support, the record with the chosen ally champion, and against the chosen enemy ADC and the chosen enemy support, each pair counted on its own ("with Lulu: 5 games, 3 won"). The four-champion combination is shown only at n ≥ 3, else "this 2v2 has too few games";
  - **patches** (mi-evidence §2.4): the current patch first. The previous patch is added only where S7b's per-version diff shows no change to that champion and to the items or runes the line names, and the line says so. Never more than two patches;
  - **queues:** every line names the queues its games come from ("Solo/Duo 3 · Normal Draft 6"); 57% of the team's games are Normal Draft, so the split is always shown;
  - **"Against X" uses mi-evidence §2.1's confirmed-opponent rule**, not the fold's fallback: `teamPosition` on both players, exactly one per lane per team, and `individualPosition` agreeing (else "role unclear", not counted). That needs both positions, stored only from S1b on; for older games the line counts S1b's unique merged position, and its tip says "lane opponent by Riot's position";
  - **each line reads** "4 of 9 games · patch 26.23 · Solo/Duo 3, Normal Draft 6";
  - shown at n ≥ 3; never called a recommendation.
- **An evidence tier on every briefing row:**
  - "Riot's data";
  - "Riot's tip";
  - "Checked notes (AI reviewers)";
  - "Riot's text (reviewed automatically)";
  - "In your games (n = …)";
  - "In the team's games (n = …)";
  - "No high-elo evidence (not collected)";
  - "No curated notes";
  - "Matchup uncertain", with the champion-level view, when the pair has no evidence.

  An empty section is one honest line, never an empty panel.
- **A lane end measured per game,** from the positions stored since S1 (members' games):
  - the earlier of the lane's outer turret falling, or either player leaving the lane's region two frames in a row (trips to the fountain excluded);
  - for the jungle, the first contested epic objective;
  - shown as a distribution ("usually broke between 11:40 and 15:10, median 13:20, n = 14") only at n ≥ 10, else "Not measured yet";
  - **never a fixed minute or level.**
- **The pipeline, for the static and own-games parts:**
  - `version-check` detects the patch;
  - a **per-version diff** (base stats; each ability's cooldown, cost and text hash; items' stats, gold and text hash; runes' text hash) is stored with counts. It gives "Riot changed X on 26.24" labels, decides the two-patch rule above and feeds the curated freshness rule (`MAX_PATCHES_UNCHECKED`);
  - **validation before publishing:**
    - every id exists in that patch's Data Dragon;
    - the 70 haste figures parse;
    - the `prep` totals add up;
    - on failure the last good copy stays and the job reports degraded;
  - **retries:** through the existing client (`Retry-After`, 5xx back-off);
  - **fallback:** the offline Data Dragon copy;
  - **monitoring:**
    - `data_refresh_status` rows;
    - `/api/health` lists a failing or stale static refresh, and S1a's `disabled` notice shows `version-check` at 0;
    - Admin's data health shows the counts;
    - the Production check asserts Matchup Intel's data patch equals health's.
- **The team-wide counts:** counted in SQL (`GROUP BY` over the `prep` keys of the matching `account_matches` rows), so only counts leave the database, at most about 5 KB a view. Cached for an hour per (role, champion, opponent, patch window, the viewer's set of visible members), and invalidated by a sync that stored a game of that champion. The query plan is checked with `EXPLAIN` on the demo, and `perf-probe` reads it after the deploy.
- **Migration 0067** (S9b's indexes take 0068 and S10's tables 0069):
  - one nullable jsonb `prep` column on `account_matches`, holding the rune-page key, spells, starting set, first back, completed items, skill order, lane end and lane occupancy;
  - **handover §A3, step by step:** change `src/server/db/schema/*.ts`; `pnpm exec drizzle-kit generate --name match_prep`; no grants block, since a column on an existing table is not a new table, view, function or serial column (DATABASE_PERMISSIONS.md); `pnpm exec tsx scripts/embed-migrations.ts`; update the expected-migration lists in `tests/db/migrate.test.ts`, `branding.test.ts`, `auth-phase1.test.ts` and `main-accounts.test.ts`;
  - additive, and reversible by dropping the column.
- **`prep-backfill`** fills `prep` for stored games from their records and timelines. It is a **`setup` (repair) job**: owner-only from Admin, run by the session through Data jobs, added to the registry test in this PR. It makes no Riot request, prints counts only, can be re-run, and its output can always be derived again from `match_details` and `match_timelines`.
  - **Its egress:** about 4.9k timelines at 10–20 KB and 7.5k records is about 100 MB or more, against the 120 MB-a-day budget. So it is batched: at most 1,000 games a run (about 25 MB), one run a day by hand, over about 5 days, each counted first and read in `db-usage`.

  After the deploy, one Data jobs run: `auth-audit prep-backfill data-audit`; then the private backup by hand (§1.7).

**Acceptance (S7):**
- **Roles:** each of the five renders its structure (2 or 4 slots) and asks for nothing else.
- **A 2v2 with empty slots:** each empty slot names what it wants; filling one moves no other element (±1px); evidence lines say which slots they ignore.
- **Changing a champion:** at most 2 taps from the pair bar, with 0 scroll on phones (today: scroll back up). J12 in the journeys spec.
- **History:** after three pair changes, Back leaves Matchup Intel; the address always holds the current pair.
- **Selection:** survives a reload and is shareable by its address and by "Copy link".
- **The cooldown table** (unit tests):
  - for every ability without a checked static or open mark, the hasted value equals base × 100/(100 + haste) at four haste values, and carries "Riot's general rule";
  - a static checked ability shows its base at every haste (a test on one);
  - Death's Grasp shows its base only, with "isn't known";
  - summoner spells never change with ability haste, and R carries "ability haste only";
  - 70 of 70 haste items parse.
- **Riot's tips** are byte-equal to Data Dragon for the 147 enemy and 149 ally champions.
- **0 placeholder recommendations:** every high-elo item reads "No high-elo evidence (not collected)" (e2e).
- **"In your games"** lines (DB tests on the demo):
  - k of n, the patches and the queues, at n ≥ 3 only;
  - a previous patch only when the diff shows no change;
  - "against X" counts no game whose positions disagree;
  - the jungle objective line and the bot pairwise lines at n ≥ 3;
  - a viewer without `view-teammate-stats` gets no team counts, and a personal-use profile's games are never counted for another member.
- **The lane end** shows only at n ≥ 10 and never as a single minute (unit).
- **Words:** `REFUSED_WORDS` passes on every curated, kit and "what it means" sentence; `EVIDENCE_REFUSED_WORDS` passes on every evidence template; Riot's tips are checked byte-equal instead. S4b's word test no longer lists I01.
- **Fit** (full matrix in ux-measure; CI holds 2 pairs per role):
  - 0 scroll at **1920×950 and 1920×1080** for 10 named pairs per role (ADC and Support with four champions), with the tips beyond the first folded;
  - the essentials (the slots, the enemy's kit or kits with cooldowns, the first three briefing rows) in view at 1440×900 and at 1280×800 with the sidebar open;
  - **phones:** at i12, the pair bar, every enemy tile's cooldown line and the first evidence row on the first screen, for 1v1 and 2v2.
- **axe and Safari:** `wcag22aa` 0 serious at 375×667; WebKit covers the picker, the pair bar and "Copy link".
- **Production check:** the signed-in Matchup Intel page shows the role selector, the evidence label, and Riot data on the same patch as `/api/health` (no extra page load).
- **prep-backfill:** each run reads at most 1,000 games, and `db-usage` shows the day's egress under 120 MB.
- **CI time:** browser job ≤ 52 min on each head.

**Risks:**
- one-screen fit with four champions (the layout above, measured at both 1920 heights);
- team-wide counts must apply the profile pages' own visibility checks (tested, above);
- the backfill's database load and egress (batched, run by hand, counted first);
- small samples once patches and queues are honest: many lines will read "fewer than 3 games on patch 26.23", which is the truth;
- honesty: a label on every line, and no "best" anywhere.

**Deploy:** S7a on 23 Nov #2; S7b with the migration on 24 Nov #1, with `auth-audit` after it; both in the 13:00–21:00 UTC window.

### S8 · Profile, Leaderboards, Resources, Settings, public pages and the rest of the help text — 24 Nov, deploy 2

**PRs:** S8a the pages, S8b the help text.

#### S8a · The pages

**Closes:**
- UD.PO2, L1, L2, L4, L5, R1, S1, PB1, PB2;
- UM.PO1, L1, R1;
- Ranked progress's unused weekly query (RC§5.3);
- RC§4.4 PR 9b's deviations (the Library's two columns at `sm`; Settings' phone heights while the password form shows);
- RC§3.1's large-text leftovers (Records' "·" in 6 entries; words broken at 200% on 320px, re-measured after S5–S7);
- **the pages stage 0 never audited** (below), which §1.1, §2.6 and §2.19 need;
- §7.2c's "supported personal settings", as far as no notice change is needed ("On this device");
- four of HOSTING_USAGE's six CPU follow-ups ("Not changed here"), and the player Peek of S4a's table.

**The pages stage 0 did not audit: an audit-and-fix pass.** Every audit used a demo viewer without a player profile, and the desktop audit lists "the setup and welcome flows, and invites" as not covered. Lane L12 audits them from now (read-only, at the named setups and desktop sizes, as stage 0 did), and S8a fixes what it finds:
- the new member's first sign-in: `/welcome` and `/welcome/personalise` (also reached through `/preview/setup`);
- `/setup`; `/login` and `/recover` on phones (desktop is in UD.PB1–PB2); `/no-access`;
- the public team page (`/public`, `/public/leaderboards`) on phones;
- Card Studio and the profile editor (roles and pools, Edit lineup) as layouts, on phones and desktop;
- Install App, in Safari's tab and in the installed app;
- **a member's own profile with data**, through a demo viewer with a player profile (memory mode only, refused otherwise, with a unit test that a production configuration refuses it). The same viewer serves §1.12's "your" tests.

The admin pages were all audited (admin.md §4.1–4.2 measured Access levels, Personal data, Previews and Resources at 375×667 as well), so S9c covers them. Every page above joins the page budgets (`page-budgets.json`) with its measured ceilings.

**Design decisions:**
- **Profile Overview** leads with the six key figures and Recent form. The multikills become one line ("Double 19 · Triple 3 · Quadra 1 · Penta 0"). The Recent form card ends at its content.
- **Leaderboards:**
  - from 1.3 screens, the section index sits in the header and in the pinned row's compact slot;
  - on phones a 44px index chip row pins under the top bar once the title has gone;
  - each member shows their top milestone plus "+N";
  - the coverage note moves behind the board's ⓘ;
  - Milestones fill the space under Multikills, and record cells hold one value position;
  - clickable rows always show their chevron;
  - "A win ties 3rd" replaces "Next win: 3=".
- **Resources:**
  - one count;
  - the host on its own line;
  - favicons shipped as assets (no runtime cost, no console error);
  - on phones the index wraps onto two lines with 44px chips.
- **Settings:**
  - the avatar's colour is seeded from the user id everywhere;
  - **"On this device"**: one panel listing what this browser remembers for the account (Matchup Intel's champions and role, recent champions, Resources favourites, the card preview's choice), each with Clear, and "Clear all on this device". Nothing is sent to the server, so it needs no notice change. Server-side preferences wait for OD9.
- **The player Peek on Players and Leaderboards rows** (S4a's table): a row opens S4a's player Peek at `?player=` (a sheet on phones), its name stays a link to the full profile, Back closes it and the list does not move. The Peek's server action carries `view-teammate-stats` and the personal-use rule, with a DB test (§1.11).
- **CPU follow-ups** (HOSTING_USAGE, "Not changed here"; each with its own review lens):
  - **profile refreshes start from the mounted page**, through its first `/api/freshness` request (which already checks access), not from the layout, so a prefetch no longer starts a Riot sync (about 55 Riot requests and about 3 CPU-s a day);
  - **Leaderboards' games cache** is invalidated only by a sync that stored a game;
  - **members' links prefetch on intent** (pointer or touch start) instead of on sight: about 30% of a visit's work, at the cost of a link nobody pointed at opening a little slower;
  - **Admin pages left open** stop re-rendering on routine job runs (0–3 s a day): they refresh on the administrator's own action or when the tab is shown again (built in S9c, where those pages change);
  - *not in this overhaul, with reasons:* the rank watch's writes (about 18 s a day) touch LP readings, which have just had a 22-hour gap, so they get their own review after S11; account sync's second rank read (about 1 s a day) is not worth a change in the sync path now. S11 lists both.
- **Public pages:**
  - the app's h1 style;
  - 14px header links;
  - a sticky table of contents on desktop for Privacy;
  - the recovery instructions behind a fold.

#### S8b · The help text

**Closes:**
- every remaining verdict in `tooltips.json`: of 77 rewrites, 19 removals and 14 label improvements, those not already applied in S0b and S3–S7a;
- the word test's allowlist emptied (G02's glossary and D07's titles are its last entries), leaving only the permanent exemptions;
- TT.TD6, TD7 (about 20 facts shown only on hover move into visible text or an InfoTip), TD9, TD13, TD14 (chart readouts in the InfoTip look);
- G02 (the glossary rewritten, one sentence each, with no "Population:" or "Source:"), G03 (6 unused keys deleted);
- D03–D09;
- UD.PO3, X6 (the end of explanatory `title`s);
- TT recommendations 4–7.

**Acceptance (S8):**
- **Leaderboards:**
  - at 1280–1440 the index is reachable with no scroll back to the top;
  - on phones it is pinned at any scroll;
  - record values share a baseline at 1440 (±1px).
- **Profile Overview:** at most 2.0 screens at i15 (2.57 today) and at most 6.0 at se1 150% (8.77), with at most 3 ⓘ on its first screen (6–7 today).
- **Resources:**
  - 0 console errors;
  - all 7 sections visible at 393 with no sideways scroll (3 of 7 today);
  - chips of 44px.
- **Avatars:** the same colour in the sidebar and in Settings.
- **The public pages** pass axe and the page budgets.
- **The newly audited pages:** each finding of L12's pass is fixed or recorded with its reason; each page has its budget ceilings; axe 0 at 375 and 1440.
- **On this device:** Clear empties each stored item (a unit test per key); the panel lists only keys the app writes.
- **The player Peek:** opens from a Players row and a Leaderboards row with `?player=`; the name link still opens the profile in one tap; Back closes; the list moves 0px (J14).
- **CPU follow-ups:** a profile prefetch starts no sync (a test that rendering the layout calls no refresh); a sync that stores nothing leaves the Leaderboards cache alone (DB test); the Monday probe after S8 is read against the one before.
- **CI time:** browser job ≤ 52 min on each head.
- **Help text:**
  - all 196 inventory verdicts applied, checked off by id in the PR;
  - every tip at most 40 words, and at least 95% at most 25;
  - 0 explanatory `title`s outside the allowlist of icon-only names and truncations;
  - a jargon test refuses "PUUID", "Riot's API", "frame", "sync window", "Population:", "Source:" and "SELECT" in member-facing help.

**Live check:**
- the Leaderboards index facts;
- the Resources index fact (the section chips wrap; 11 rows each opening a new tab; Favourites kept);
- the Settings facts kept, plus "On this device" present;
- on Players, already loaded: a row opens the player Peek with `?player=`, and Back closes it.

**Data:** none. One query less (Ranked progress), the Peek reuses S4a's player action, and refreshes start later in a visit, so `perf-probe` runs after the deploy (§1.7) and Monday's reading is compared with the one before.

**Risks:**
- large-text regressions;
- the breadth of text changes (snapshot-style tests).

**Deploy:** 24 Nov #2, in the 13:00–21:00 UTC window.

### S9 · Administration: complete, secure, effortless (admin PRs 7b–7d) — 25 Nov #1 and #2

**PRs:** S9a (7b) Users & Permissions rebuilt; S9b (7c) owner tools; S9c (7d) the Dashboard and health.

**S9a decisions** (AD§2.1, §2.5, §2.7; UD.A1, A3; UM.AD1; AD.D7; AD.D4 for others' Riot accounts):
- **The list:** a `DataList` with 52px rows on desktop and 64px on phones:
  - picture, display name and `@username`;
  - one state chip, the most urgent;
  - Owner or Administrator as a neutral badge;
  - last sign-in from `md`.
- **Groups:**
  - Team members;
  - Personal use;
  - "Profiles without an account", collapsed;
  - the verification account, locked in "Kept automatically" (S1a).
- **Add account** is a header button that opens a sheet. Filters live in the address (replace).
- **No action buttons on rows.**
- **The person view:** an address-backed `DetailModal` (`?person=` or `?profile=`), following S4a's preview contract for its address and history (pushed on open, ‹ › between people replaces, Back closes with the list's scroll kept, a deep link opens it). It is a window on desktop and full screen on phones. Its sections:
  1. **Account:** display name, username, status, created, last sign-in. No session count: the privacy notice says of sign-in sessions "Who sees it: nobody in the app" (`privacy/page.tsx:25-28`), so a count waits for OD9.
  2. **Password:** the state in words, with Issue, Re-issue (when expired) and Withdraw a temporary password.
  3. **Access:** the existing editor.
  4. **Riot accounts:** per account, its sync state in words, last synced and last problem, with Retry sync, Make Main and Unlink (confirmed, and audited when it is not the member's own: `riot.link`, `riot.unlink`, `riot.replace`, `riot.main`).
  5. **Picture and links.**
  6. **Activity:** the last 10 entries.
  7. **A closed Danger zone:** erase; delete the account and keep the profile; delete both. Typed confirmation for anything permanent.
- **"Reactivate with a new temporary password"** for a deactivation made for security.

**S9b decisions** (AD§2.2–2.4, §2.6, §2.8, §2.9; D6):
- **The Owner edits a member's display name** (`setMemberDisplayNameAction`: the members' own rules, account and profile kept in step, `invalidatePublicTeam()`, audited).
- **Members' own changes refresh the public page too:** `changeDisplayNameAction` (`account.ts:44-56`) and the picture actions call `invalidatePublicTeam()`, so the public team page shows a new name at once instead of within its 60-second cache (admin.md §1.2).
- **Moderation:** replace or remove a picture; hide or remove a public social link (audited).
- **Sessions:**
  - "Sign out everywhere" on a member (`revokeAllSessions`; audited). The administrator sees "Signed out everywhere", not how many sessions ended: the count stays in the server's result for the tests and goes neither to the screen nor to the audit row (the notice, above);
  - members get "Sign out of other devices" in Settings (`revokeOtherSessions`; unaudited until OD9).
- **One atomic `saveAccessAction`** (D6), with a second confirmation before granting administrator access.
- **The activity log:**
  - filters by person, category and date;
  - details as sentences, never `key: value`;
  - the date and time in the row's own words;
  - Load older (keyset, 50 a page).
- **Optional migration 0068** of two `audit_events` indexes (`target_id`, `actor_user_id`) when the person filter ships: indexes only, no grants, handover §A3's steps (the four expected-migration lists), `auth-audit` after.
- **Waiting for OD8:** a username rename (`renameAccountAction`, owner-only, typed confirmation), and owner-only rules for actions on administrators. The audit coverage of members' own changes waits for OD9.

**S9c decisions** (AD§2.10, §4.2, §4.3, §5; UD.A4–A7; UM.AD2, TT3; TT.A01, A03, A05, A07, A09–A14; RC§3.1 Admin's status words at 175–200%):
- **The Dashboard** leads with one "Needs you" card:
  - expired temporary passwords;
  - setup pending;
  - Riot accounts needing attention;
  - failing jobs;
  - **the LP five-minute schedule turned off after being on**, with who ran it and when, linked to its `jobs.run` entry (the only place that names them: health and the Production check give the date alone, S1a);
  - **any job whose interval is 0**, with who set it and when.

  Then the counts as one `StatStrip`, and recent activity in sentences. The section links that repeat the sidebar, and the five tinted status cards, go.
- **System:**
  - neutral status rows of about 56px on phones;
  - Page speed in words, its table under Technical details and as label-and-figure rows on phones;
  - the demo panel hidden when players exist, and its audit-before-check bug fixed.
- **Data & Integrations:** plain job names in three lists; the key and interval under Advanced.
- **Admin pages left open** no longer re-render on every routine job run: they refresh on the administrator's own action, or when the tab is shown again (HOSTING_USAGE's follow-up, 0–3 CPU-s a day).
- **Audit Logs:** `FilterBar` plus `DataRow`s, retiring `TabLinks`' last use.
- **Access levels** use `Panel`, and Personal data's procedure goes into a `Disclosure`.
- **Branding:** a sticky save bar and a phone section index.
- **44px targets** on Previews and Branding.
- **`/admin/public-access`** stays inside Admin Mode, and Team insights is linked from Team Matches for administrators.
- **Surfaces:** `surface-2` for rows inside panels, never `bg-elevated`.
- **Admin pages join** the page-budget, axe and phone-wraps specs (AD§4.3), and use only shared components, so later design changes reach Admin too.

**Acceptance (S9):**
- **The People list:**
  - at 1440 the first row is at or above 220px (710 today) and rows are 52px;
  - at 375 the first row is at or above 300px (1,409 today) and rows are 64px;
  - 0 destructive buttons on the list (20 today);
  - Users & Permissions is at most 1.3 screens at 1440 and 2.0 at 375 with 13 accounts (2.66 and 7.16 today).
- **The person view:** a deep link opens it; Back closes it with the scroll kept; Escape closes it and focus returns. Typed confirmation blocks permanent actions until it matches.
- **DB tests:**
  - the Owner's display-name edit enforces the rules, keeps account and profile in step, and invalidates the public cache;
  - "Sign out everywhere" returns its count, the old token is refused, and the guards and audit row are in place;
  - "Sign out of other devices" keeps the current session;
  - the atomic save rolls back on failure;
  - the rename, after OD8, is owner-only, case-insensitively unique, keeps sessions, and signs in with the new name only.
- **Audit:** no row prints `key: value` or a camelCase key (formatter test).
- **"Needs you"** lists the demo's expired temporary password, a turned-off LP schedule with who and when, and a job at interval 0.
- **No session count** appears anywhere in Admin or in the audit (a test over the person view and the audit formatter).
- **The public page** shows a member's new display name on the next request after their own change (DB test of the invalidation).
- **CI time:** browser job ≤ 52 min on each head.
- **Data & Integrations:** 12px text is at most 30% of its text (87% today).
- **System Health:** at most 2.0 screens at 375 (4.21 today), with no sideways table.
- **Everywhere in Admin:** one tab style; 44px targets on touch; axe 0 on every Admin page at 1440 and 375; phone-wraps at 150 and 200%.

**Live check:** nothing signed in (the verification account is a plain member). The refusal facts cover every Admin and preview route (S1a's 23). The Owner's 10-minute review on real data stands in (OD12).

**Data:** none needed. The optional index migration is additive.

**Risks:**
- session revocation (tested with two browser contexts);
- Owner protection;
- erasure: no names in details;
- the notice's scope (only administrators' actions are audited until OD9);
- Admin stays "deployed", not "verified" (OD12).

**Deploy:** S9a on 25 Nov #1 (Admin only: any hour); S9b and S9c on 25 Nov #2, in the 13:00–21:00 UTC window (S9b touches members' Settings).

### S10 · Matchup Intel's high-elo evidence — blocked on OD4 (with OD5 and OD7)

**PRs:**
- **S10a:** the sampler, the build and the tables (Tier 1). Deployed silently for a one-week pilot.
- **S10b:** the evidence on the page, after the pilot.
- **S10c:** the Tier 2 runner, if approved.

**Built ahead, so a yes does not wait for a free lane.** S10a is about three days of work: new tables (migration 0069) with the grants block, the sampler, the build's invariants and the no-identifier schema test. Lane L11 builds it from 24 Nov (when S7b's lane frees), on a branch, behind an off constant (`MI_SAMPLE_ENABLED = false`), with the mocked-client unit tests and the DB tests. It is not merged before the yes, because `endpoints.test.ts` and `registration-description.test.ts` change only with the owner's paste. After the yes (day X): the endpoint list, the registration test and the switch, then the silent pilot deploy at **X+2 at the earliest** (X+4 if the yes comes before L11 has finished). It takes a deploy slot like any stage.

**Design** (MI §4.4–§5):

- **`mi-sample`:**
  - an hourly slice in the existing tick, at most 120 s and 80 requests;
  - **euw1/europe only**, never a host a linked account uses;
  - reads the Challenger and Grandmaster lists **in every slice** (2 requests, at most 48 a day), because no identifier is kept between runs (MI §3.5). mi-evidence §3.1's "3 ladder requests a day" cannot hold together with "nothing stored", so the registration text says "at most once an hour" (OD4), and the sampler reads `X-Method-Rate-Limit(-Count)` and backs off on it (the pilot records the method limits);
  - picks players by a keyed hash;
  - takes non-overlapping game-start windows lagged one hour, so the work is exactly once;
  - about 22 games a slice: 530 a day, about 7.4k a patch.
- **`mi-build`** (daily):
  - **thresholds:**
    - shown at n ≥ 100, "common" at n ≥ 200, alternatives shown at a 15% share or more;
    - a pair's deviation tested at n ≥ 50 and stated at n ≥ 100, with FDR at 5% and shrinkage;
    - lane outcomes "limited" at n ≥ 30 and "evidence" at n ≥ 100;
    - win rates only with a confidence interval that excludes 50%;
    - never one build's win rate against another's;
  - **invariants** before the pointer moves, with the last good build kept;
  - a change log;
  - the current patch first; the previous patch labelled, and only when the diff shows no change.
- **Monitoring:** health fails when no build for 36 hours while the patch has games; the Production check asserts a build under 3 days old and its label.
- **Privacy:** no identifiers stored; a schema test refuses `puuid`, `match_id` and `riot_id` columns in `mi_*`; logs hold counts only.
- **Tables** `mi_cells`, `mi_pairs`, `mi_choices` and `mi_builds` (migration 0069), with the grants block (RLS on, nothing for the Data API roles, `SELECT` for the backup role) and handover §A3's steps. Pruning keeps them at most about 30 MB for two patches. `auth-audit` after, and the private backup by hand.
- **Tier 2:** the same code as a daily GitHub job posting count deltas to `/api/jobs/mi-ingest` with the existing `CRON_SECRET`.

**Acceptance:**
- the pilot measures the pick distribution, role agreement, lane occupancy and the lane-end spread before any number is shown;
- Provisioned Memory stays at most about 2 GB-h a day (the owner reads Usage);
- 0 identifiers in storage;
- a re-run adds nothing twice.

**Deploy:** 1 silent deploy (X+2 at the earliest), then at least 7 days, then 1 deploy (and 1 more for Tier 2). Each also needs `browser job ≤ 52 min` and the deploy window.

### S11 · Final verification and the status report — 26 Nov (docs only, no deploy)

- **One Data jobs run:** `auth-audit data-audit rank-schedule-status db-usage`.
- **Readings:**
  - one `perf-probe`;
  - Monday 23 Nov's scheduled probe, for record 3 (Team's first byte and phone LCP) against 16 Nov's; 30 Nov's probe is the first full week after S3, so record 3 stays "deployed, field result pending" until then;
  - the weekly backup's restore count (23 Nov, 02:43 UTC), which predates 0067, **and** the by-hand backup run after S7b (§1.7), which covers it. Without the second, the report says the backup's coverage of 0067 is unverified;
  - the owner's two Active CPU readings (OD5).
- **Checks:**
  - the last Production check, with every new fact;
  - the WebKit workflow on main;
  - the iOS Simulator run (OD11);
  - the owner's real-device session (OD10) and Admin review (OD12);
  - `scripts/ux-measure.mjs`'s full page-budget matrix on the final main against the audits' baselines, and the journeys spec's J1–J15;
  - the browser job's time on the last head of each stage (the §1.4 ceiling), as a table.
- **Matchup Intel's upkeep, set up here:**
  - **a per-patch re-review of the Riot-text layer.** On each patch, `version-check` counts the abilities whose text hash changed (their facts are hidden until reviewed). The re-review is the same agent workflow that made the layer (two automated reviews and an adjudicator, then the import): a scheduled check-in in this account on each patch day, like the 1 Dec one, after the owner's yes (OD6). It cannot run inside the app without a paid language-model service, which the boundaries exclude;
  - **role coverage, said plainly:** the 6 champions with checked notes and the 3 curated pairs are all top lane. Jungle, Mid, ADC and Support have Riot's data, Riot's tips, the Riot-text layer and the members' own games, but nothing a person checked;
  - **a prioritised curation list for the owner** (OD6), from the team's 48 (role, champion) pool cells: per role, the cells ranked by the members' games on them (counts only, no names), Jungle, Mid, ADC and Support first.
- **STATUS.md**, per stage: Live and verified (the check exercises it) · Deployed (pages load; CI checks the behaviour) · Partial · Blocked (OD n) · Unimplemented · evidence and data limits:
  - no high-elo evidence before S10;
  - small own-game samples, once patches and queues are honest;
  - shards, both positions and Riot's lane figures only from games stored since 20 Nov;
  - "against X" by the strict rule only for those games;
  - timeline coverage;
  - the Riot-text layer hidden ability by ability as patches change Riot's text, until re-reviewed;
  - checked notes for top lane only;
  - Admin not verifiable signed in;
  - real devices;
  - **deferred, with reasons:** the rank watch's batched writes and account sync's second rank read (S8a); the members' notebook (OD9); favourite matchups (S7a).

---

## 4. Matchup Intel §3: what is built now, what waits for the owner, and what cannot be built honestly

**Built now, from permitted data, within budget, with no owner action** (S0b and S7; OD1 only switches S0b's Riot-text layer on):

1. **The structures:**
   - Top, Jungle and Mid are 1v1; ADC is your ADC and support against theirs; Support is the same 2v2 from the support's side;
   - no full team, no jungle input;
   - selection is quick, remembered per browser, shareable by address, and changed from a pinned pair bar.
2. **Enemy cooldowns:**
   - Data Dragon's base cooldown per rank (already there);
   - the cooldown at a chosen ability haste, only where the rule is known to apply: base × 100/(100 + AH) marked "Riot's general rule", the base alone where the checked notes say static or leave it open, "ability haste only" on R, and summoner spells never reduced by ability haste;
   - item haste parsed from `item.json` (70 items, test-pinned);
   - summoner spells' cooldowns;
   - exceptions said as "not in Riot's data";
   - never a timer.
3. **Riot's own words:** the Data Dragon `enemytips` (147 champions) and `allytips` (149), verbatim, quoted and attributed. The kinds of mechanic in Riot's text (L3: 173 champions, reviewed automatically and by no person; shown after OD1, hidden ability by ability when Riot's text changes, and re-reviewed per patch, S11). The checked notes (6 champions, all top lane).
4. **Evidence from the team's own games**, labelled with n, the patch (the previous one only where Riot's data shows no change; never more than two) and the queues:
   - rune pages (shards for games stored from 20 Nov, once named: OD7);
   - spells;
   - starting items;
   - the first shop visit;
   - the first 1–3 completed items;
   - skill order;
   - for Jungle, the early objectives taken against the chosen enemy jungler;
   - for the bot lane, the record with the chosen ally and against each enemy, pair by pair.

   "Against X" counts a game only when the lane opponent is confirmed (MI §2.1) for games stored from 20 Nov, and by Riot's unique position before that.

   The scale, at the 7 Nov data-audit: 5,246 counted games (39% Solo/Duo), 3,733 lane games with timelines, 48 (role, champion) cells in the pools. That is honest as "in your games", **never** as a high-elo recommendation.
5. **Honest fallbacks and tiers on every row:**
   - "No high-elo evidence (not collected)";
   - "No curated notes";
   - "Matchup uncertain", with the champion-level view;
   - one line instead of an empty panel.
6. **The lane end, measured per game** (turret or leaving the lane's region; the jungle's first contested objective) as a distribution with n. Never a fixed minute or level. Match History names its snapshots as times only.
7. **The pipeline** for static and own-games data: patch detection, a per-version diff, freshness labels, validation with the last good copy kept, retries, the offline fallback, and health and Production-check monitoring.

**Blocked on the owner** (S10), item by item, with the fallback shown until then:

| Briefing item | Needs | Until then |
|---|---|---|
| (a) high-elo rune pages with shards | OD4, OD7 | "In your games" |
| (b) spells | OD4 | cooldowns now; "In your games" |
| (c) starting items | OD4 | "In your games" |
| (d) early recall purchases | OD4 | "In your games" |
| (e) core builds | OD4 | "In your games" |
| (f) skill order | OD4 | "In your games" |
| (g) typical haste and ranks at minute X | OD4 | the calculator |
| (i) measured lane dynamics: lead changes, first-kill timing, solo kills | OD4 | "Not measured yet" |
| (j) power spikes, measured | OD4 | "Not measured yet" |
| (l) jungle objective share, invade frequency and early duels | OD4 | early objectives in the members' games against that jungler (S7b), at n ≥ 3 |
| (m) bot-lane pairwise tables | OD4 (Tier 2 for useful n) | the members' own pairwise records (S7b); "this 2v2 has too few games" |
| (n) "when behind, players most often…" | OD4 | nothing shown |

**The exact decision the owner must make (OD4):**

> "Do you authorise UNIIVERSE to collect anonymous aggregate statistics from high-elo ranked games of players who are not members? A short run at most once an hour reads the Challenger and Grandmaster Solo/Duo ladders of one region (EUW recommended: no member plays there), recent ranked match ids of some of those players, and those matches and timelines. It reduces them at once to counts per patch, role and champion (and lane opponent): runes and stat shards, summoner spells, starting items, first purchases, completed items in order, skill order, ability haste by minute and lane outcomes. No player identifier, name or match id is stored; nothing is shown about any player; counts older than the previous patch are deleted; it uses at most half of the key's limits on a host members never use."

The owner answers:
1. yes or no;
2. the region;
3. the tier:
   - **Tier 1** runs on Vercel: about 7.4k games a patch, champion-level evidence. Read Vercel Usage → Provisioned Memory and Active CPU first; no API shows them.
   - **Tier 2** is a daily GitHub Actions job: 20–40k games a patch, pair-level evidence for most common matchups. Approve the workflow and add `RIOT_API_KEY` as an Actions secret.
4. with a yes, paste the combined registration text once (OD1's text with MI §3.6's aggregate clause, §5) and approve one privacy-notice line.

This reverses three recorded positions: "makes no Riot API request" (pinned by tests), "no retired feature brought back" (Meta & Trends), and the data-minimisation stance (#212). Directive §8 therefore reserves it.

**Not honestly buildable without a person-checked note (C):**
- which ability beats which (interactions);
- how to trade;
- wave management (freezes, slow pushes);
- jungle pathing (Riot records positions only once a minute);
- advice for playing ahead or behind (confounded by game state);
- the "why" behind any measured pattern.

These show the kit facts and Riot's tips with "No person has checked how these kits interact", and come only from the owner's curation (OD6).

**Not recommended at all:**
- video analysis (rights, terms and cost; it blocks nothing);
- the win rate of one build against another (about 9,800 games per arm);
- timers or "ready at" (game integrity);
- champion co-occurrence as matchup evidence.

---

## 5. Needs the owner (one message; every decision only the owner can make)

| # | Decision | Recommendation | Blocked until then |
|---|---|---|---|
| **OD1** | Paste Matchup Intel's registration text in the Developer Portal (the branch's step 10, "before or with step 9"), and confirm the product is **Personal** (STATUS 7). **One paste covers OD1 and OD4:** if you answer OD4 at the same time, paste text B; otherwise text A. | **Text A** (OD4 no or later): the branch's proposed text, with one clause added: "…Riot's own champion tips from Data Dragon, a cooldown table at chosen ability haste, and counts of the member's own and the team's stored games (runes, spells, items, skill order) with their sample sizes; no automatic champion-select integration: champions are chosen by hand." **Text B** (OD4 yes): text A plus MI §3.6's aggregate clause, with "at most once an hour" as in §4. The session then updates `registration-description.test.ts` (and, with B, `endpoints.test.ts`) to the pasted words. | Only switching S0b's Riot-text layer on (it ships off until then). **S7 does not wait for it** (Tier 0 needs no owner action, MI §4.4) |
| **OD2** | Was 18 Nov's 09:04 UTC removal of the five-minute LP schedule intended? Admin → Audit Logs → Data & jobs shows who ran `rank-schedule-off`. | Keep it on (reinstalled 07:40 today). Press no "Run now" on setup jobs until S1 is live (20 Nov). | Nothing; STATUS will state the gap from 18 Nov 09:04 to 19 Nov 07:40 |
| **OD3** | Confirm that failed-workflow email reaches you for Data jobs (STATUS 4). | Confirm it. | A silent schedule (installed but no call for 20 minutes: failing health → failed Data jobs run → email) reaching you. A schedule turned off, or a job set to 0, is a notice in the Production check and in Admin's "Needs you", not an email |
| **OD4** | High-elo aggregate evidence for Matchup Intel: the decision quoted in §4 (yes or no, region, Tier 1 or 2), with OD1's text B (one paste) and a privacy-notice line. The text says what the design does: a run at most once an hour reading both ladders, so no identifier is ever kept between runs. | Yes to a one-week Tier 1 pilot on EUW, storing no identifier. Decide on Tier 2 after the pilot. | S10: every high-elo recommendation (§4's table). S10a is built ahead behind an off switch, so the pilot can start at X+2 |
| **OD5** | Confirm Fluid compute in Vercel (STATUS 16; MI O4), and **read Usage → Fluid Active CPU and Provisioned Memory twice**: the morning after S4 (22 Nov) and after S6 (24 Nov). The 8 Nov outage came from CPU, and S4–S6 add server actions. | Confirm it, and send the two readings (two numbers each). | Sizing Tier 1; the CPU and memory estimates; desktop Team's first byte (record 3, most likely cold starts); a CPU stop on new loader work (§1.10) |
| **OD6** | Curation and the wiki (MI O5; STATUS 19): you remain sole curator. Re-check the 3 curated briefings and the 6 champions' facts before patch 26.25, when `MAX_PATCHES_UNCHECKED` hides them. Settle the licence header, Weird Gloop's consent for scripted reads, the remedy for the 48 scripted requests of 16 Nov, and the Legal Jibber Jabber sentence. Also: allow a **per-patch re-review** of the Riot-text layer (a scheduled check-in in this account on each patch day, re-running the review on the abilities whose text changed, S11), and take S11's prioritised list for new checked notes: today all 6 checked champions and all 3 pairs are top lane, so Jungle, Mid, ADC and Support have nothing a person checked. | A one-hour re-check before 26.25; no scripted wiki reads; yes to the per-patch re-review; check the first two Jungle and Mid cells of S11's list when you can. | The C items (interactions, trading, wave, jungle paths, ahead/behind advice) stay honest fallbacks; the curated briefings hide at 26.25 |
| **OD7** | Stat-shard names (MI O6): check the 7 current shards' names in the League client (recorded with the patch), or allow CommunityDragon for that one map. | Check them in the client (about 5 minutes); this keeps "Data Dragon only". | Shards on the post-game rune line (S6) and in Matchup Intel's rune pages (S7). The ids are stored from S1 on |
| **OD8** | Admin authentication and permission items (admin §3): see the sub-list below. | Answers given per item below. | The rename and the owner-only narrowing in S9b. Everything else in S9 is routine |
| **OD9** | One privacy-notice update (`PRIVACY_UPDATED`): record members' own username, display-name and picture changes, and managers' edits, in the activity log; correct the log's description (D8: members' own password changes are already recorded); with OD4, aggregate non-member statistics. Optional parts: server-side personal preferences (directive §7 "supported personal settings"); **a count of signed-in devices**, for administrators in the person view and for members in Settings (the notice now says sessions are seen by "nobody in the app"); **Matchup Intel's notebook** (MATCHUP_INTEL.md, "Not built": fully specified, needs your go-ahead). | Approve the audit wording and the D8 correction. Not now: server-side preferences (S8a's "On this device" covers this browser's), the device count and the notebook. | Auditing members' own changes (S9); D8's fix; server-side preferences; the device count; the notebook |
| **OD10** | Real devices (STATUS 12): Safari on an iPhone, the installed app, and a screen reader (RESPONSIVE.md steps 1–9); **and an Android phone with the installed app**, if any member uses one (the plan's Android path is emulation only). | Two sessions of about 15 minutes: after S4 (navigation and windows) and after S6 (the post-game phone window). | "Verified on real devices" in the final report |
| **OD11** | Allow the iOS Simulator workflow (a draft on `ios-sim/**` branches, push-triggered, no schedule) for checks of the installed app. | Approve it, push-to-branch only. | Simulator evidence for the installed PWA. Otherwise WebKit plus emulation only |
| **OD12** | Admin Mode on production: the Production check cannot sign in as an administrator. | A 10-minute walk through a checklist after S9, rather than an admin-scoped verification account (not recommended). | "Production-verified" status for S1a's and S9's Admin screens |
| **OD13** | Team Overview's empty band above the header at 1920 and 2560 (UD.T3, your restored design): an A/B of capping it at about 3rem. | Accept the cap. | UD.T3 only |
| **OD14** | `VERIFY_ACCOUNT_SECRET` (STATUS 3): set it as a GitHub secret and in Vercel Production. It rides any deploy. | Do it. | Separating the verification account's key from `CRON_SECRET` |
| **OD15** | **CI time, asked today.** #316's browser job took 50 min 23 s of its 60, the same suite has varied from 22.8 to 36.4 minutes on different runners (CI_USAGE), and every stage adds specs. CI_USAGE lists the reductions the owner decides: (1) measure `quality.spec.ts`'s widths by resizing a loaded page or waiting for the page's ready signal (2–3 min a run; not quite the same test); (2) run viewport-independent specs (permissions, text, saved data) on one project instead of three (several minutes, after a spec-by-spec review). And (3), if a head still exceeds 52 minutes, 2-way sharding of the browser job (a matrix; free on this public repository, but a workflow change, CLAUDE.md §6). | Approve (1) and (2) now; approve (3) as the fallback, used only when a head exceeds 52 minutes after (1) and (2). | Any stage whose head would pass 52 minutes |
| **OD16** | #308 (STATUS 22): confirm or revert the WebKit workflow's 45-minute limit. | Confirm it. | Nothing |
| **OD17** | #212 (STATUS 5) stays held: it needs your approval plus confirmation of an offline backup. **Note:** once S7b's 0067 lands, #212's 0066 must be regenerated with the next free number before it can merge: Drizzle applies a migration only when it is newer than the last applied one, so an older 0066 would be skipped silently. | Unchanged. The overhaul does not need it; new migrations take 0067–0069. If you approve #212 later, the session regenerates it first. | Nothing in the overhaul |
| **OD18** | Security settings (STATUS 6): a ruleset on `main`, private vulnerability reporting, read-only Actions permissions with fork approvals, no production secrets in Vercel Preview, the setup key's length, the three accepted trade-offs. | As STATUS recommends. | Nothing |
| **OD19** | Housekeeping (STATUS 1, 9; optional 11, 13, 14): old log revisions; deleting merged and throw-away branches (including `lt/*`); pruning pg_cron's history; a check that production runs `main`; an outside uptime monitor. | Do 1 and 9; add the free uptime monitor (14). | Nothing |
| **OD20** | **Veto only:** designs the session will change under the directive's delegation, listed because they challenge earlier approved choices. | Let them stand unless you object. | Nothing; S2–S6 go ahead |
| **OD21** | **Past erasures and the activity log.** From S1a, an erasure also clears the string details of activity entries matched by id. Applying that to erasures already made means running `erasure-reconcile`, which irreversibly scrubs those details across the production activity log. | Let the session count the affected rows first (read-only, counts only), then decide; the recommendation is yes, since erasure is a duty to the person erased. | Nothing else; erasures from now on are covered either way |

**OD8's sub-items:**

| Item | Recommendation |
|---|---|
| (a) The Owner edits another member's username | Yes: owner-only, typed confirmation, audited |
| (b) Owner-only for existing actions on administrators (delete, reset, deactivate, remove administrator access) | Yes |
| (c) Granting administrator access by the Owner only | Yes |
| (d) Changing session or temporary-password lifetimes, the password rules or scrypt's cost | No change |
| (e) One-time reset links | No |
| (f) 2FA or step-up re-authentication for the Owner | Offer later as its own stage |
| (g) A member's own session list, or a count of sessions | Not now; a count only with OD9's notice change |
| (h) Administrators seeing others' devices, IPs or sign-in history | No |
| (i) A second Owner, an ownership transfer, or an admin-scoped verification account | No |

**OD20's challenged designs:**
- N1 replaces the 8 Nov bottom bar, and the installed apps' shortcuts become the same four destinations;
- **Team Overview, your restored design of 17 Nov (RC§7.6):** on phones, the lineup pager of five players and a shorter card (S3a); on desktop, five across at 1280–1365 with the sidebar open (unchanged from 1366 up). Screenshots go with S3's summary;
- the champion window becomes the preview (tiles, tabs, lane tables and chart dropped; the Kills column dropped);
- Players and Leaderboards rows open a player Peek (the name still opens the profile);
- the opened game loses its four tabs;
- "Focus next" shows only on one's own games;
- one history rule (desktop Back closes a game; Matchup Intel's pair changes replace the address, so Back leaves the page);
- Encounters stays a view, returning to the list's position;
- Admin's navigation is regrouped into Platform and System;
- one compact profile header;
- the top bar slides away at large text;
- Matchup Intel's "Checked notes" wording.

**Routine, for your information** (admin.md §3 marks these "tell the owner"; they narrow powers and need no answer):
- setup and repair jobs (turning LP tracking's schedule on or off, rescans, erasure re-application, the verification account, and the two new repair jobs) are run from Admin by you alone, with a typed phrase. The jobs route with `CRON_SECRET`, which the Production check and the session use, is unchanged;
- the schedule intervals editor is yours alone, and setting a job to 0 needs a typed phrase and shows in health and "Needs you";
- the verification account is locked in Admin: no access change, reset, rename or erasure; deactivating it remains the documented off switch for the signed-in checks;
- the browser-test suite is held to 52 minutes of its 60 (OD15), and its large measurement matrices run outside CI.

---

## 6. Requirement coverage (every bullet and sub-bullet of the directive)

Status words:
- **S n:** delivered by that stage;
- **Done (stage 0):** satisfied by this morning's audits;
- **Blocked: OD n:** waits for the owner;
- **Not feasible honestly:** with the fallback shown instead.

### Primary mission
| # | Requirement | Delivered by |
|---|---|---|
| PM1 | A cohesive, premium, modern League platform across desktop, mobile, installed PWA and administration | S0–S9 (S11 verifies) |
| PM2 | Premium, modern, intuitive UX across everything | S2–S9 |
| PM3 | An implementation directive, not recommendations | Every stage ships through a deploy and the Production check |
| PM4 | Investigate, challenge earlier decisions, implement, test thoroughly, deploy safely | Done (stage 0) + §1's definition of done; challenges listed in OD20 |
| PM5 | Proactive within scope; no repeated approval requests for routine work | Routine work proceeds; one batched owner message (§5) |

### §0 Audit existing work
| # | Requirement | Delivered by |
|---|---|---|
| 0.1 | Inspect the repository, PRs, branches, deployment history, CI and production | Done (stage 0: recon.md) |
| 0.2a | What is live | Done (recon §1: fd098f1, 477/0/0); S11 restates |
| 0.2b | Merged but not deployed | Done (recon §2: #315, docs only) |
| 0.2c | Partially implemented | Done (recon §3) → S0a, S0b |
| 0.2d | Requested before, still incomplete | Done (recon §4) → S0, S1 (the rank schedule), S8a (9b's deviations), S2b (the reach script); record 3 (Team's first byte and phone LCP) → S3a's first-card art and OD5, read in S11; HOSTING_USAGE's six CPU follow-ups → S2a and S8a (four), two deferred with reasons (S8a, S11); MATCHUP_INTEL's "Not built" → S7a (sharing; favourites decided against), OD9 (the notebook); D9 stays "not now" by the owner's own word |
| 0.2e | What existing functionality could be affected | Done (recon §6) → each stage's Risks |
| 0.3a | Leaderboards consolidation | S0a |
| 0.3b | Matchup Intel improvements | S0a (a destination), S0b (the dashboard), S7, S10 |
| 0.3c | Ranked progress cleanup | S0a (presentation), S8a (the unused query) |
| 0.3d | Outstanding interface refinements | S0a (#316, Team tabs); RC§4.4's leftovers in S2b, S5, S6c and S8a; large text outside #316 in S8a and S9c |
| 0.4 | Finish or reconcile outstanding work without duplicating it | S0a and S0b ship as reviewed; their overlaps are superseded, not redone (S2a, S4b, S8a) |
| 0.5 | Preserve production data, security, privacy controls and working functionality | §1 items 7, 9, 11 and 12; additive data only; guards tests; the security facts (+23 in S1a); erasure forward-only until OD21; nothing removed without a replacement |
| 0.6 | Do not run held destructive changes such as #212 | #212 untouched (OD17); new migrations from 0067 |

### §1 Site-wide UX
| # | Requirement | Delivered by |
|---|---|---|
| 1.1 | Retrospective audit of every feature (Team, Players, Leaderboards, Encounters, All Champions, Matchup Intel, Resources, profiles, settings, admin, others) | Stage 0 (UD, UM, CM, TT, AD and MI audits), then **S8a's audit-and-fix pass** over what stage 0 missed: the welcome and setup flows, sign-in and recovery on phones, the public team page on phones, `/no-access`, Card Studio and the profile editor as layouts, Install App, and a member's own profile with data |
| 1.2a | Visual hierarchy and readability | S2c (12px floor, one frame), S3, S6, S8a |
| 1.2b | Typography, colours, spacing and layout | S2b (one label token), S2c, S3a (one primary per region), S6b (members without brand blue), S9c (surfaces, no tints) |
| 1.2c | Navigation consistency | S2a |
| 1.2d | Information density | S5 (≤30 figures), S6 (each figure once), S8a (Overview), S9a (People rows) |
| 1.2e | Unnecessary scrolling and nested scroll areas | S4a (one allowed nested scroller), S4b (no scroll in bubbles), S0b (one-screen fit), S5, S6, S8a (Resources index), S9c (tables) |
| 1.2f | Modal, drawer, panel and dropdown behaviour | S4a (the shared containers) |
| 1.2g | Animations and transitions | S4a (motion per container), S2c (skeletons: no jumps), S6b (anchored switching) |
| 1.2h | Accessibility and responsiveness | Every stage: axe 0, WebKit, the page budgets; S2b (targets), S4b (tooltips) |
| 1.2i | Discoverability | S2a (Matchup Intel and Resources in one tap), S3b (labelled off roles), S7a (picker), S8a (chevrons), S9c (Team insights link) |
| 1.2j | Unnecessary clicks and workflows | S2a (taps 22 → 20), S5 (switching in one action), S6 (Previous and Next), S6c (records stay on the board), S9a (Add account sheet) |
| 1.3 | Shared interaction components | S4a |
| 1.4 | Similar actions behave similarly | S4a (the containers, the history rule, one decision per list item), applied in S5, S6, S7a (pair changes replace), S8a (the player Peek) and S9a (the person window) |
| 1.5 | Quick previews connected to the page, preserving position, closing predictably | S4a, S5, S6c, S8a (Players and Leaderboards rows) |
| 1.6 | No disruptive transitions, layout shifts or needless complexity | S2c (PO1, X3, X4), S5 (no reflow), S6 (no tab-height jumps) |
| 1.7 | Challenge earlier decisions when the experience says so | N1, the inline game's Back, the champion window, the profile header, C1's top bar, Admin's navigation (OD20) |
| 1.8 | Don't preserve earlier instructions merely because approved | As 1.7. The owner's own 17 Nov Team layout goes to an A/B (OD13), not silently kept or overridden |

### §2 Mobile
| # | Requirement | Delivered by |
|---|---|---|
| 2.1 | Desktop is the benchmark | S2b and S3 (phone measured against desktop Team), S6c (the loadout as on desktop) |
| 2.2 | Mobile equally premium and intuitive on touch | S2, S3, S5, S6c, S7a |
| 2.3 | The same application, not a stripped-down one | S2a (parity), S4a (the same components, variants chosen by room) |
| 2.4a | Preserve the visual identity | S2b and S3 (the same tokens, faithful cards); the design review lens with side-by-side screenshots on every PR (§1.2) |
| 2.4b | Preserve the typography and colour system | S2b (`tracking-label`), S2c (12px floor; `design-parity.spec.ts` compares computed type, colour, radius and border at 375 and 1440) |
| 2.4c | Preserve the layout hierarchy | S3 (the whole lineup at a glance), S6c |
| 2.4d | Preserve the component styling | S4a (one component per container in every posture); `design-parity.spec.ts`, extended by each stage's new components |
| 2.4e | Preserve the premium presentation | S3, S6c; OD10 judges it on a real device |
| 2.4f | Preserve the interaction patterns | S4a (the same rules on phones: ‹ ›, Back, Escape-equivalents); the journeys spec J1–J15 counts taps and scroll-backs per flow |
| 2.4g | Preserve the overall design language | S2–S9, through the shared components; the design review lens (§1.2) |
| 2.5 | Adapt layouts without losing quality | S3 (pager, sideways row), S5 (sheet), S6c (window), S7a (pair bar) |
| 2.6 | Begin with Team Overview, then every other page | S2b (Team's header first), S3 (Team), then S5–S9; S8a's pass covers the pages stage 0 did not audit; the page budgets cover every page |
| 2.7 | A coherent shared navigation structure | S2a |
| 2.8 | Familiar names, icons, groupings and logic | S2a (the same four entries; Admin regrouped on both) |
| 2.9 | No relearning between devices | S2a (parity test at four postures) |
| 2.10 | Resources and ordinary destinations not inside account settings | S2a |
| 2.11 | Reassess the bottom bar | S2a (N1, N2 and N3 measured; N1 chosen) |
| 2.12 | The most intuitive, efficient, polished solution | S2a (taps and label fit measured) |
| 2.13 | Every page leads with what users need | S2b's header budget; the page-budget ratchet on every page |
| 2.14a | Avoid endless scrolling | The ratchet: S2b, tightened in S3, S5, S6, S8a and S9 |
| 2.14b | Avoid oversized cards | S3a (card 60–80px shorter), S5 (64px rows), S9a (People rows) |
| 2.14c | Avoid redundant statistics | S5, S6b (each figure once) |
| 2.14d | Avoid unnecessary headings | S2b (no repeated identity or section h1; Admin eyebrows) |
| 2.14e | Avoid awkward nested scrollbars | S4a's rule; S8a (Resources index); S9c (Admin tables) |
| 2.14f | Avoid excessive padding | S2b budgets, S3a, S9 |
| 2.14g | Avoid complicated tab structures | S5 and S6 (no tabs), S2b (a sections sheet at large text), S4a (three tab tiers) |
| 2.14h | Avoid repeated scrolling to open and close | S6c (window, bottom bar, pull-down), S5 (sheet), S7a (pair bar), S8a (pinned index) |
| 2.15 | The most important information on the first screen | Team (S3), Match History (S2b and S6c), All Champions (S5), Matchup Intel (S7a): first-screen criteria |
| 2.16 | Never sacrifice readability for a one-screen limit | S2c (12px floor); 150% and 200% checks in every stage |
| 2.17 | Progressive disclosure where useful | S5 (1–2-game opponents folded), S6 (folds), S9a (Danger zone) |
| 2.18 | Opening, inspecting, closing and switching are effortless | S4a, S5, S6c |
| 2.19 | Across the whole site | The page budgets cover every Player and Admin page (S2b) and the pages S8a adds; the full matrix in `ux-measure.mjs`, a subset in CI |
| 2.20 | Test real phone sizes and the installed PWA | Every UI stage at 320–430 and 852×393 with emulated standalone; Android's installed app by emulation with Back (§1.5); WebKit; iOS Simulator (OD11); real devices, an Android phone among them if a member has one (OD10) |
| 2.21 | Verify navigation, safe areas, touch targets, overlays, scrolling, layouts, accessibility | S2 (navigation, safe areas), S2b (targets), S4a (overlays), every stage (axe, budgets) |
| 2.22 | "It fits" is not completion | Criteria count first-screen content, taps and scroll-backs, not just fit |
| 2.23 | Premium, and premium to use | S2–S7; OD10's real-device review; S11 |

### §3 Matchup Intel
| # | Requirement | Delivered by |
|---|---|---|
| 3.1 | An evidence-driven, maintained tool for all five roles | S7 (Tier 0: the five roles' structures and evidence); S10 for high-elo evidence (blocked: OD4). Person-checked notes exist for top lane only (6 champions, 3 pairs): S11 says so and gives the owner a prioritised list for Jungle, Mid, ADC and Support (OD6) |
| 3.2 | Top 1v1 | S7a |
| 3.3 | Jungle 1v1 | S7a |
| 3.4 | Mid 1v1 | S7a |
| 3.5 | ADC: your ADC and support against theirs | S7a |
| 3.6 | Support: the same 2v2 from the support's side | S7a |
| 3.7 | No full team, no extra jungle inputs | S7a |
| 3.8 | Selection quick, persistent, easy to change | S7a (picker, memory, address, pair bar) |
| 3.9a | Complete rune pages with shards | S7b (own games; shards after OD7); high-elo pages blocked: OD4 → S10 |
| 3.9b | Summoner spells | S7a (cooldowns), S7b (own games); high-elo blocked: OD4 |
| 3.9c | Starting items | S7b; high-elo blocked: OD4 |
| 3.9d | Early recall purchases | S7b (first shop visit); high-elo blocked: OD4 |
| 3.9e | A core build up to about three items | S7b (completed-item order, item metadata); high-elo blocked: OD4 |
| 3.9f | Starting ability and early skill order | S7b; high-elo blocked: OD4 |
| 3.9g | Enemy cooldowns with ranks and modifiers | S7a (base per rank; the hasted value only where the rule is known to apply, marked; R "ability haste only"; summoner spells never by ability haste); typical haste by minute blocked: OD4; refunds and passives only where checked (OD6); never timers |
| 3.9h | Ability interactions | **Not feasible honestly** from Riot's data (a person's judgement). Fallback: the kit facts side by side plus Riot's tips, saying "No person has checked how these kits interact" (S0b, S7a); curated notes need OD6 |
| 3.9i | Trading opportunities and threats | S7a (Riot's tips, kit facts, cooldown windows as facts); measured lane dynamics blocked: OD4; the "how" is not feasible honestly without OD6 |
| 3.9j | Power spikes | Blocked: OD4 (measured); explanations need OD6. Fallback "Not measured yet" |
| 3.9k | Wave management and recall objectives | **Not feasible honestly** (Riot has no wave state). Fallback "No wave guidance for this matchup"; measured back timing and CS in S7b (own games) and S10 |
| 3.9l | Jungle clear, duels, invades, objectives | S7b (early objectives taken against the chosen enemy jungler in the members' games, n ≥ 3); high-elo blocked: OD4. **Pathing not feasible** (positions once a minute) |
| 3.9m | Bot-lane coordination and 2v2 | S7a (the four-champion structure, empty slots), S7b (the members' pairwise records: with the ally, against each enemy); high-elo blocked: OD4; advice needs OD6 |
| 3.9n | Short adjustments for playing ahead or behind | Blocked: OD4 (descriptive only); advice **not feasible honestly** (confounded). Nothing shown before |
| 3.9o | Matchup-known and matchup-uncertain preparation | S7b (tiers, the champion-level "uncertain" view) |
| 3.10 | Actionable advice over walls of statistics | S0b (one-screen dashboard), S7a (one fact line per row) |
| 3.11 | Explain what it means for the next decision | S7a ("what it means" as a fact from numbers; Riot's tips; never an invented verdict) |
| 3.12 | A compact desktop briefing for champion select and play | S0b and S7a (0 scroll at 1920×950 and 1920×1080 for every role layout; essentials in view at 1440×900 and 1280×800) |
| 3.13 | Investigate permitted Riot data and licensed sources | Done (stage 0: mi-evidence.md); Data Dragon only; no scripted wiki reads (OD6) |
| 3.14 | Validate matchup identity, roles, patch relevance, sample quality | S1b (F1, both positions kept), S7b (MI §2.1's confirmed opponent for games from 20 Nov; the current patch plus the previous only where unchanged; the queues on every line; n on every line), S10 (role agreement, invariants) |
| 3.15 | Never co-occurrence as a lane matchup | S1b and S7b (exactly one enemy in the position; occupancy) |
| 3.16 | Invent no mechanics, statistics, notes or conclusions | S0b (MR fixes, labels), S6a and S7 (refused words; numbers only) |
| 3.17 | Separate reliable evidence from uncertain | S0b (layer labels), S7b (tiers), S10 (intervals and thresholds) |
| 3.18 | Honest, useful fallbacks | S0b (#4, #17, #19), S7b |
| 3.19 | Don't assume every matchup has evidence | S7b ("Matchup uncertain"); S10 keeps pair-level coverage partial by design |
| 3.20a | Detect relevant patches | The existing `version-check` + S7b's per-version diff; S10's game-version buckets |
| 3.20b | Refresh champion information | The existing `static-sync` + S7a's assets |
| 3.20c | Reassess as evidence changes | S7b (counts recomputed), S10 (daily build, change log); the Riot-text layer re-reviewed per patch (S11, OD6) |
| 3.20d | Flag outdated or unreliable advice | S0b (#5, #9, #13 flags; the Riot-text layer hides an ability whose text changed), S7b (diff labels), S10 (thresholds, patch rule) |
| 3.20e | Validate updates before publishing | S7b (static validation, last good copy), S10 (invariants) |
| 3.20f | Retry transient failures | The existing client (`Retry-After`, 5xx back-off); S10's exactly-once windows |
| 3.20g | Safe fallbacks | S7b (offline copy, honest lines), S10 (last good build) |
| 3.20h | Monitor pipeline health | S1a (a turned-off schedule and any job at 0 named in health), S7b (health, `data_refresh_status`), S9c ("Needs you" with who and when), S10 (stale build) |
| 3.21 | High-elo evidence where appropriate and available | **Blocked: OD4** (with OD5, OD7) → S10 |
| 3.22 | Video analysis optional; must not block the core | Not built (rights, terms, cost); it blocks nothing |
| 3.23 | No fixed-minute or fixed-level end of laning | S7b (measured per game, a distribution); S6a rule 6 (times only); MI.F2 |

### §4 All Champions
| # | Requirement | Delivered by |
|---|---|---|
| 4.1 | Browse without navigating away | S5 |
| 4.2 | Replace the pop-up with an integrated right-side preview | S5 (in-card unfold; drawer) |
| 4.3 | Connected to the list, like unfolding a page | S5 (joined to its row, the notch, columns fold) |
| 4.4 | No exaggerated animation or layout movement | S5 (no reflow; 200ms; ±1px and scroll tests) |
| 4.5a | Open quickly | S5 (≤300ms locally; prefetch on press) |
| 4.5b | Switch directly | S5 (another row, ↑/↓, ‹ ›) |
| 4.5c | Dismiss intuitively | S5 (✕, Escape, Back, the row again, pull-down) |
| 4.5d | Keep the browsing position | S5 (`scrollY` unchanged; search, sort and "Show all" untouched) |
| 4.5e | Understood immediately | S5 (≤30 figures; the foot line) |
| 4.6 | Simplify substantially | S5 (the removed list) |
| 4.7a | Champion identity | S5 (header) |
| 4.7b | Games played | S5 |
| 4.7c | Overall personal win rate | S5 |
| 4.7d | Personal win rate against each opposing champion | S5, after S1b's F1 |
| 4.7e | The games behind each matchup percentage | S5 |
| 4.8 | Meaningful samples, simple sorting | S5 (3+ and 5+; Most games, Best, Worst) |
| 4.9 | No needless panels, colour coding or tabs | S5 |
| 4.10 | Distinct from Matchup Intel | S5 (one link per opponent; no ability or build content) |
| 4.11 | Adapted for mobile | S5 (64px rows, sheet) |

### §5 Encounters and Match History
| # | Requirement | Delivered by |
|---|---|---|
| 5.1 | Reassess the whole expanded match | S6 |
| 5.2 | League's post-game as the reference, in UNIIVERSE's identity | S6b, S6c |
| 5.3a | Result | S6 (header) |
| 5.3b | KDA and key statistics | S6 (figure tiles) |
| 5.3c | CS, gold and damage | S6 |
| 5.3d | Lane or role performance where data supports it | S6 (lane by role; the 2v2 for the bot lane; "not clear" otherwise) |
| 5.3e | A recognisable six-slot inventory | S6 (2×3 plus the trinket) |
| 5.3f | Runes and summoner spells | S6 (a 2×2 and the rune line; shards after OD7) |
| 5.3g | A few meaningful observations | S6a (at most 2 + 2 + 1 notes) |
| 5.4 | Items arranged like the client | S6b, S6c |
| 5.5 | No unrelated icons beside complicated statistics | S6 |
| 5.6a | What went well | S6a |
| 5.6b | What went wrong | S6a |
| 5.6c | What to focus on | S6a |
| 5.7 | Short, natural explanations | S6a (≤20 words) |
| 5.8 | No invented causes | S6a (refused words; every fact with its comparison base) |
| 5.9 | No needless sub-tabs or repeated statistics | S6b (no tabs; each figure once) |
| 5.10 | Compact, readable phone matches | S6c |
| 5.11 | No scrolling several screens and back to close | S6c (window, bottom bar, pull-down; sideways too) |
| 5.12 | Closing, switching and returning are intuitive | S6c (Previous and Next; return to the last game viewed) |
| 5.13 | The same low friction everywhere | S4a's shared rules, applied in S5, S7a and S9 |

### §6 Tooltips
| # | Requirement | Delivered by |
|---|---|---|
| 6.1 | Audit every tooltip, ⓘ, hover text and help, including old, recent, admin and mobile | Done (stage 0: 196 items) |
| 6.2 | For ordinary players, not developers | S4b, S8b |
| 6.3a | Simple, natural language | S4b, S8b (rewrites) |
| 6.3b | Explain what it means | S4b, S8b |
| 6.3c | Why it matters only when useful | S8b (method notes dropped) |
| 6.3d | Immediately understandable | S4b, S8b; a jargon test |
| 6.3e | Relevant to the statistic | S4b (D01, D02 corrected), S8b |
| 6.3f | Concise, preferably one sentence | S4b (word test ≤25, hard 40, counted per state, with an allowlist that S6, S7a and S8b empty) |
| 6.3g | No jargon, technical terms or filler | S8b (the glossary; the jargon test) |
| 6.4 | Not vague replacements | Rewrites keep the facts and values (TT verdicts) |
| 6.5 | Use real values where appropriate | Rewrites keep `{values}` (for example H10's LP) |
| 6.6 | One style, placement, animation and dismissal | S4b (one InfoTip) |
| 6.7 | Desktop hover and keyboard | S4b (150ms, hoverable, focus, Escape; the LP tip tabbable) |
| 6.8 | Mobile tap, easily dismissed | S4b (tap opens; any tap closes and is consumed) |
| 6.9 | Never clipped, hidden or off screen | S4b (sheet fallback; never over its trigger) |
| 6.10 | No nested scrolling or oversized panels | S4b (no scrolling bubble; short texts) |
| 6.11 | Improve the label instead of adding an ⓘ | S3a (T13), S4b, S8b (14 label items) |
| 6.12 | Remove redundant explanations | S8b (19 removals) |
| 6.13 | No tooltip just because a statistic exists | S8b (O02, O03, C01 and others) |
| 6.14 | The acceptance test: understood at once, or rewritten or removed | S8b (per-item review, the word and jargon tests) |

### §7 Administration and profiles
| # | Requirement | Delivered by |
|---|---|---|
| 7.1 | Complete, secure, intuitive administration | S1a, S9 |
| 7.2a | Members manage display names | Exists; S9b makes members' own changes (and the Owner's edits) refresh the public team page at once |
| 7.2b | Members manage avatars | Exists |
| 7.2c | Supported personal settings | S8a's "On this device" (what this browser remembers, with Clear). Server-side preferences: **blocked: OD9** (a notice change; recommended not now) |
| 7.2d | Other safe customisation | Exists (Card Studio, links, roles, pools); S9b adds "Sign out of other devices" |
| 7.3a | Edit usernames | **Blocked: OD8a** → S9b once yes |
| 7.3b | Edit display names | S9b |
| 7.3c | Manage profile details | S9a and S9b (person view, team membership, link moderation) |
| 7.3d | Update avatars | S9b |
| 7.3e | Manage linked Riot accounts | S9a (audited, Riot-verified) |
| 7.3f | Secure password resets | Exists; S9a (expiry shown, re-issue, withdraw) |
| 7.3g | Activate, disable, reactivate | Exists; S9a (reactivate with a new temporary password) |
| 7.3h | Revoke active sessions | S9b (sign out everywhere) |
| 7.3i | Manage permissions | Exists; S9b (atomic save, grant confirmation); owner-only narrowing **blocked: OD8b, OD8c** |
| 7.3j | Review admin activity | S9b (filters, sentences, paging, per person) |
| 7.3k | Monitor account and sync health | S9a (last sign-in, sync per account), S9c ("Needs you") |
| 7.3l | Retry failed operations safely | S1a (job kinds), S9a and S9c (Retry sync, Try again; never for setup jobs) |
| 7.4 | Keep immutable ids and relationships through renames | Holds today; S9b's DB tests for renames and display names |
| 7.5 | No editing of Riot match statistics | Holds; no design adds a statistic field (S9 review) |
| 7.6 | Protect the Owner from deletion and privilege loss | S1a (D5a); S9b (OD8b, OD8c) |
| 7.7 | Never expose passwords or weaken authorisation | S1a and S9 (guards tests, `safeDetails`, no secrets in audit) |
| 7.8 | Audit admin for missing capabilities | Done (stage 0: admin.md §1, §5) |
| 7.9 | Low-risk improvements without per-item approval | S1a, S9 (admin §3's routine rows) |
| 7.10 | No needless controls | S9 keeps admin §5's "not worth adding" list out |
| 7.11 | Everyday tasks simple, advanced ones protected | S1a (owner-only setup jobs and intervals editor, typed phrases), S9a (closed Danger zone) |
| 7.12 | The same premium standards as the rest | S9c |
| 7.13 | Review older admin screens | S9c (screen by screen) |
| 7.14 | Shared design changes also reach admin | S9 (shared components only; Admin in the page-budget, axe and phone-wraps specs) |
| 7.15 | Admin never a separate, outdated app | S2a (the same navigation), S9c |

### §8 Autonomy and safeguards
| # | Requirement | Delivered by |
|---|---|---|
| 8.1 | Proactive within the product's direction | This plan |
| 8.2 | No repeated asking for routine work | One batched owner message; OD20 is veto-only |
| 8.3 | Find improvements in usability, function, consistency, reliability, maintainability | Done (stage 0), then S1–S9 (for example S1a's schedule notices, S7b's pipeline) |
| 8.4 | Deploy through the authorised workflow | §1 |
| 8.5a | Authorisation for destructive production data operations | None planned. S1b's recompute and S7b's backfill touch only derived data, are counted first and are re-runnable; re-applying erasure to past rows waits for OD21; #212 held |
| 8.5b | Authorisation for irreversible migrations | None: only additive (0067 `prep`, optional indexes, S10's tables) |
| 8.5c | Authorisation for major permission or privacy changes | OD4, OD8, OD9 |
| 8.5d | Authorisation for unexpected expenditure | None: Hobby limits kept; Tier 2's runner minutes are free on a public repository |
| 8.5e | Authorisation for work outside the scope | None |
| 8.6 | Keep privacy-first behaviour, RLS, authentication, backups, headers | §1; the grants block for S10's tables; the security facts; no actor in public health; the by-hand backup after S7b's migration |
| 8.7 | Expose no secrets, private databases, backups or sensitive data | Counts-only logs; no identifiers in S10; the live check's key scan |
| 8.8 | Tests, feature branches, deploy checks, rollback | §1 items 1–9 |
| 8.9 | Respect budgets; avoid expensive jobs | 2 planned deploys a day; `perf-probe` after loader changes; S7b's backfill batched under the egress budget; four CPU follow-ups (S8a); S10 sized to Provisioned Memory; the browser job held to 52 minutes, measured per head |
| 8.10 | Minimal routine owner intervention | S1a's health notices (a schedule turned off, a job at 0) and the existing silent-schedule failure, S9c's "Needs you", S7b's and S10's automation; the per-patch re-review (S11, OD6) is the one recurring task, and it runs as a scheduled check-in |

### §9 Delivery standards
| # | Requirement | Delivered by |
|---|---|---|
| 9.1 | Coordinated, independently verifiable stages | §2–§3 |
| 9.2.1 | Reconcile previous work | S0 |
| 9.2.2 | Implement and integrate | S1–S9 |
| 9.2.3 | Validate functionality and data integrity | §1; `data-audit` in S1b and S7b; DB tests |
| 9.2.4 | Test desktop and mobile journeys | e2e on three projects plus named setups; S2a's tap table |
| 9.2.5 | Verify the installed PWA | Emulated standalone specs (Android's Back included), WebKit, iOS Simulator (OD11), real devices (OD10) |
| 9.2.6 | Test permissions and privacy | The guards, page-guards and client-imports tests; the live security facts (+23 in S1a); a visibility DB test for every new read path (§1.11); DB tests per Admin action |
| 9.2.7 | Responsive layouts and accessibility | axe per stage; the page budgets; phone-wraps |
| 9.2.8 | Performance and infrastructure impact | `perf-probe` after S0a, S5, S6, S7b and S8a; `db-usage`; the owner's two Active CPU readings (OD5); Provisioned Memory (OD4); CI time per head |
| 9.2.9 | CI and deployment results | §1 items 4–7 |
| 9.2.10 | Verify on production | The Production check per deploy; Admin via OD12 |
| 9.3 | A merged PR is not live | STATUS rows: Verified versus Deployed |
| 9.4a | Final report: live and verified | S11 |
| 9.4b | Final report: partly done | S11 |
| 9.4c | Final report: blocked | S11 (OD numbers) |
| 9.4d | Final report: not implemented | S11 |
| 9.4e | Final report: evidence and data limits | S11 |
| 9.5 | No success claimed without verification | S11; "deployed" versus "verified" |

### The final product standard
| # | Standard | Delivered by |
|---|---|---|
| FS1 | One complete, premium, modern application | S2–S9 |
| FS2 | Desktop and mobile equally refined | S2–S6 |
| FS3 | Every interaction natural, responsive, predictable | S4a and its consumers |
| FS4 | Every statistic, explanation and tooltip useful | S4b, S6a, S8b |
| FS5 | Player value over complexity | S5, S6, S7 |
| FS6 | Admin comprehensive, secure, effortless | S1a, S9 |
| FS7 | Matchup Intel reliable, evidence-driven, no fabricated confidence | S0b, S7; S10 blocked: OD4 |
| FS8 | Earlier decisions challenged | OD20 |
| FS9 | Exceptional looks, effortless use, proactive improvement, minimal owner work | S1a, S7b, S9c (automation, health notices) |
| FS10 | Proceed autonomously; implement, validate, deploy | §1 and §7 |

### Counts (246 rows)
- **Delivered by a stage: 239.** 11 of them by stage 0's audits (PM4, 0.1, 0.2a–e, 3.13, 6.1, 7.8, 8.3), and 1.1 by stage 0 with S8a's pass. **16 of the 239 have a remainder blocked on the owner:** 3.1, 3.9a–g, 3.9i, 3.9l and 3.9m (high-elo evidence, OD4), 5.3f (shard names, OD7), 7.2c (server-side preferences, OD9), 7.3i and 7.6 (owner-only narrowing, OD8b/c), and FS7 (OD4).
- **Blocked on the owner: 4.** 3.9j, 3.9n and 3.21 (OD4) and 7.3a (OD8a), each with its fallback shown until then.
- **Not feasible honestly, or not built by decision: 3.** 3.9h and 3.9k need a person's judgement or data Riot does not give (honest fallbacks shown; curated notes through OD6); 3.22, video analysis, is not built by decision and blocks nothing.
- **Delivered, but "verified" only with the owner:** 2.4e, 2.20, 2.23, 9.2.5 and 9.2.10 are tested by emulation, WebKit and the Simulator, and reach "verified on real devices" or "Admin production-verified" only with OD10–OD12.

---

## 7. Timing

### 7.1 Deploy calendar (UTC)

The plan books 2 deploys a day and keeps the third slot for a fix or a slipped stage. A batch of stacked PRs counts as one deploy. **Member-facing deploys merge at 13:00–21:00 UTC** (00:00–08:00 in Sydney), never at 08:00–13:00 UTC, the members' evening; server-only and Admin-only deploys (S1, S9a) may go at any hour (§1.6). Every UI batch is planned for **two CI rounds** (below), so its ready push is made at least 3 hours before its slot.

| Day | Deploy 1 | Deploy 2 | Deploy 3 (reserve) |
|---|---|---|---|
| Thu 19 Nov | batch 2 (done 00:01) | **S0a** batch 3 (13:00–14:00) | **S0b** Matchup Intel (19:00–21:00, if green; else S1) |
| Fri 20 Nov | **S1** safety and correctness (any hour, e.g. 02:00–06:00); **S0c** live-check split merges too (scripts only, no deploy) | **S2** navigation and frame (13:00–17:00) | S0b if it slipped (17:00–21:00), or a fix |
| Sat 21 Nov | **S3** Team and Players (13:00–16:00) | **S4a** shared kit, with **S4b** tooltips if green (17:00–21:00) | S4b if it slipped, or a fix |
| Sun 22 Nov | **S5** All Champions (13:00–16:00) | **S6a+b** notes and post-game (17:00–21:00) | fix (the owner's first Active CPU reading is due, OD5) |
| Mon 23 Nov | **S6c** phone window, records, Encounters (13:00–16:00) | **S7a** Matchup Intel roles and static data (17:00–21:00) | fix (also the weekly `perf-probe` and the 02:43 backup) |
| Tue 24 Nov | **S7b** own-games evidence (migration 0067, `auth-audit`, the backup by hand; 13:00–16:00) | **S8** pages and help text (17:00–21:00) | fix (`prep-backfill` runs daily from here, ≤ 1,000 games each) |
| Wed 25 Nov | **S9a** Users & Permissions (Admin only: any hour) | **S9b+c** owner tools, Dashboard, health (13:00–21:00) | fix |
| Thu 26 Nov | **S11** (docs only, no deploy) | — | — |
| Fri 27 – Sat 28 Nov | slip buffer: two days | | |
| 30 Nov | the first Monday probe a full week after S3 (record 3) | | |
| 1 Dec | the 2027 ranked-year constants (scheduled check-in 10:17 UTC; must be live before 1 Jan) | | |
| After OD4's yes, day X | **S10a** silent pilot (X+2 at the earliest, X+4 if lane L11 has not finished) | **S10b** evidence on the page (≥ X+9) | |

**What it adds up to:**
- **14 production deploys for S0–S9** (S4b and S0c not counted: one rides with S4a, the other deploys nothing), across 7 deploy days (19–25 Nov).
- **Best case:** everything is live by 25 Nov and the final report goes out on 26 Nov.
- **Realistic case: 27 Nov, at worst 28 Nov.** The basis, measured since 12 Nov:
  - 10 of 19 `ux/*` branches failed their first full CI run (11 of 31 PR branches of every kind), and 1 of the 11 needed a third run. So a 2–3-PR UI batch almost always needs a second round (about 1.5–2 hours: the fix plus about 50 minutes of CI), which the 3-hour lead absorbs within the day. About 1 batch in 8 needs a third round, which costs its slot: about 1–2 of the 12 member-facing deploys;
  - 1 of 12 Production checks after a deploy failed since 16 Nov: about 1 more slot for a fix;
  - so about 2–3 slipped slots in all. The reserve slots recover a slip that happens early in a day; a slip on the critical path (S4a, §7.3) moves the chain a day. Two buffer days cover one critical-path slip plus one other; a third pushes the report past 28 Nov.
- **S10:** at least 9 days after the owner's yes (2 to switch on and deploy, 7 of pilot); no earlier than about 1–2 December if the answer comes this week.

### 7.2 What can be built in parallel ahead of its slot

| Lane | Starts | Builds | On top of |
|---|---|---|---|
| L1, the coordinator | now | S0a (CI, WebKit, merge at 13:00), S0b (re-stack by merge, verify the 19 findings, fix, validate), S0c, then the integration and merge of every stage at its slot | — |
| L2 | now | S1a and S1b, server-side; ready on 19 Nov evening | S0a's top head |
| L3 | now | S2a, S2b and S2c; ready by 20 Nov 10:00 | S0b's head (S0a's until S0b is pushed) |
| L4 | now | S4a's components with unit and e2e tests; consumers wired after S2 | S0a's top head, then S2 |
| L4b | 20 Nov | S4b's InfoTip, the word test with its allowlist, `viewerWords` | S2's branch |
| L5 | 20 Nov | S3 (Team, Players) | S2's branch |
| L6 | now | S6a: the notes, `pairMoments`, D-3. Pure domain, unit-tested | main |
| L6 (cont.) | 21 Nov | S6b and S6c UI | S4a's branch |
| L7 | now | S5's server actions and caching | main |
| L7 (cont.) | 21 Nov | S5's UI | S4a's branch |
| L8 | now | S7a's server parts: assets, the haste parser and its cases, Riot's tips, `EVIDENCE_REFUSED_WORDS` | S0b's branch |
| L8 (cont.) | 20–22 Nov | S7b: the migration, the backfill job, the SQL counts and their cache | S0b's branch |
| L8 (cont.) | after S4a | S7a's UI | S4a |
| L9 | now | S9's server actions and DB tests (display name, moderation, sessions, atomic access, audit formatter) | main |
| L9 (cont.) | 22–24 Nov | S9's UI | S4a's branch |
| L10 | now | S8b's help text, drafted from `tooltips.json` | — |
| L10 (cont.) | after S6 | applied | — |
| L11 | 24 Nov | S10a, built ahead behind its off constant; not merged before OD4's yes | main |
| L12 | now | the audit of the pages stage 0 missed (read-only), then S8a's fixes for them | main, then S4a |

**The rules for the lanes:**
- **Every lane absorbs every landing before it**, not one: when any stage lands, each lane whose stage comes later merges `main` (no rebase, §1.1), re-validates and pushes once. For L8–L10 that is 4–6 merges, about 30–60 minutes each, mostly in `live-check` modules, `nav.ts` and the MOBILE, RESPONSIVE and LIVE_VALIDATION docs. S0c (one live-check module per area) is done first to cut that cost.
- **The critical path is S4a's shared kit:** S5, S6, S7a's UI and S9 all consume it, so S4a must be green on 21 Nov. S4b is off the critical path.
- **The real bottlenecks:**
  - one coordinator's reviews and validation, about two stages a day;
  - CI's 50 minutes per integration push, and two rounds per UI batch;
  - e2e time, held to 52 of its 60 minutes per head (§1.4, OD15).

### 7.3 What could slip, and what then happens
- **S0b, on OD1 or its fixes:** S1 takes 19 Nov's third slot and S0b moves to 20 Nov's window. If OD1 is still open, the Riot-text layer ships off.
- **S2, the biggest re-pinning of facts:** S2c moves into S3's deploy.
- **S4a slips (the critical path):** a one-day slip moves S5, S6, S7a's UI, S8 and S9 by a day and S11 to 27 Nov: one of the two buffer days. To keep it small: S4a's consumers are only the Team player Peek and the Filters popover; the 15 `Select` replacements move to S8a and Encounters' Refine to S6c if they are not green; S4b never holds S4a back. A second day of S4a slip uses the whole buffer.
- **S6, the largest UI change:** S6c gets the reserve slot of 23 Nov, and the later stages shift half a day.
- **A browser job over 52 minutes:** OD15's reductions first; if not yet answered, the stage scopes its own viewport-independent specs to one project before its slot.
- **A Production check failure after any deploy:** the reserve slot carries the fix (outside 08:00–13:00 UTC if member-facing), and the next stage waits for it. The owner's Instant Rollback is the fast path in an emergency (§1.9).
- **Owner answers arriving late** affect only the blocked rows: OD4, OD7, OD8a/b/c, OD9 and OD21. Nothing else waits for them.

---

## Appendix A. Every audit finding → its stage

- **recon.md:**
  - §1.5 → reinstalled 07:40, then S1a and OD2;
  - §2's stale STATUS → the docs PR after S0a;
  - §3.4 → OD19 (branches) and OD11 (`ios-sim`); §3.5 (the main checkout's stale CLAUDE.md) → every lane reads `git show origin/main:CLAUDE.md` (the header); the re-stacks by merge → §1.1;
  - §4.2's owner items → OD1, OD3, OD5, OD6, OD10, OD14, OD16–OD19;
  - §4.3: record 3 (Team's first byte and phone LCP) → S3a (the first card's art) and OD5 (cold starts), read in S11 from the 23 and 30 Nov probes; record 4 is kept alive by commit activity; the 1 Dec ranked-year task → §7.1; HOSTING_USAGE's six CPU follow-ups → S2a (the bar never prefetches) and S8a (refresh from the mounted page, the Leaderboards cache, prefetch on intent, Admin pages left open), two deferred with reasons (S8a, S11); MATCHUP_INTEL's "Not built" → S7a (sharing by "Copy link"; favourites decided against) and OD9 (the notebook);
  - §4.4: 2b → S2b, 7b → S6c, 8b → S5, 9b → S8a, D9 → not now (the owner's word);
  - §7.1 → S2a; §7.2 → S7, S10, OD4; §7.3 → S5; §7.4 → S6; §7.5 → S9, OD8; §7.6 → S3a, OD13; §7.7 → S1a.
- **ux-desktop.md** (52):

  | Stage | Findings |
  |---|---|
  | S0b | I1 (with S7a), I2 |
  | S2a | A2 (tabs) |
  | S2c | T2, P3, PO1, S2, X3, X4, X5 |
  | S3 | T1, T4, P1, P2 |
  | S4a (S4b: X6's rule) | T5, M1, H4, D1, X1, X2, X6 (rule), X7, X8 |
  | S5 | C1, C2, C3 |
  | S6 | M2, H1, H2, H3, L3, E1 |
  | S7a | I3, I4, I5 |
  | S8 | L1, L2, L4, L5, PO2, PO3 (with S8b), R1, S1, PB1, PB2, X6 (end) |
  | S9 | A1, A3, A4, A5, A6, A7, A2 (audit chips) |
  | OD13 | T3 |

- **ux-mobile.md** (29):

  | Stage | Findings |
  |---|---|
  | S2a | N0, AS1, ST1 (Back) |
  | S2b | T2, T5, S1, S2, RA1, ST1 (help), AD2 (phones), TT1 |
  | S3 | T1, T3, T4, P1, X3 (filters) |
  | S4a (S4b: TT2) | X1 (rule), X2 (shell), X3 (contract, with one decision per list item), X4, TT2 |
  | S5 | AC1 |
  | S6 | X1, X2 and X3 (games, records), TM1, TM2, E1 |
  | S7a | MI1 |
  | S8a | L1, PO1, R1, and the pages the audit did not reach (S8a's pass) |
  | S9 | AD1, AD2 (status rows), TT3 |

- **champions-matches.md** (25):
  - AC-1 to AC-9 and AC-11 → S5; AC-10 → S1b;
  - MH-1 to MH-7, MH-9 and MH-10 → S6; MH-8 → S4a (the rule) and S6b;
  - D-1 → S1b (stored) and S6 or S7b (shown, after OD7); D-2 → S7a; D-3 → S6a; D-4 → S1b;
  - its decisions 1–5 → S5, S6, S4a and S6, S1b, then S7a, S6a, S1b and S5.
- **tooltips.md and .json** (196 items, TD1–TD14):
  - **S0b:** G14, I05, I12;
  - **S3:** T03, T05, T08–T11, T13, T15–T18; P02, P04, P05, P09;
  - **S4b:**
    - the 12 wrong items: G15, T14, C05, H12, H22, S15, A02, D01, D02, D06;
    - the 16 long tips: E01, H27, H18, D05, L04, C13, O10, S09, H19, H01, M01, O06, H26, H33, L01, T01;
    - G01, T02; TD1–TD5, TD8, TD10–TD13;
  - **S5:** the C items;
  - **S6:** the remaining H items, M02–M04, M06, E02, E03, and G10 (names on tap);
  - **S7a:** I01, I04, I06, I07;
  - **S8b:**
    - O01–O04, O07, O12, O15;
    - L03, L06–L08;
    - G02, G03, G05, G07;
    - S10, S12, S16;
    - D03–D09;
    - TD6, TD7, TD9, TD14;
  - **S9c:** A01, A03, A05, A07, A09–A14;
  - **kept as they are:** the 86 "keep" items.
- **admin.md:**
  - D1, D2, D3, D5a, D9, D10 → S1a;
  - D4 → S1a (archive, jobs) + S9a and S9b (actions on others) + OD9 (members' own changes);
  - D5b → OD8b; D5c → noted only; D6 → S9b; D7 → S9a; D8 → OD9;
  - PR 7a = S1a, 7b = S9a, 7c = S9b, 7d = S9c; the owner batch = OD8, OD9, OD12, OD21; §3's two "Routine (tell the owner)" rows → §5's "Routine, for your information";
  - §1.2's display-name refresh (`changeDisplayNameAction` without `invalidatePublicTeam()`) → S9b; §1.3 #12's intervals editor (any administrator, 0 disables a job) → S1a;
  - §4.1–4.2's Access levels, Personal data, Previews and Resources (measured at 375 and 1440) → S9c.
- **mi-evidence.md:**
  - F1 and F3 (with Riot's `challenges` lane and jungle figures) → S1b; F2 → S6a and S7b; F4 → S7a; F5 → S0b (with OD1) and S10;
  - §2.1 (the confirmed lane opponent) and §2.4 (at most two patches, the previous only where unchanged) → S7b; §3.1's ladder cadence → S10 and OD4's text ("at most once an hour"); §7's "revisit the refused-words list" → S7a's two lists;
  - O1–O3 → OD4; O4 → OD5; O5 → OD6; O6 → OD7;
  - Tier 0 → S1b and S7; Tier 1 → S10a and S10b; Tier 2 → S10c;
  - rec. 6 → S1b's docs.
- **mi-review-confirmed.json:** #1–#19 → S0b.
- **Deliberately not built** (admin §5, MI §5, the owner's earlier "not now"):
  - bulk actions, CSV exports, impersonation, invites or reset links, sign-in history or IP logs;
  - a second status page, raw interval editing in the main view, the demo seed button in production;
  - video analysis, build-against-build win rates, cooldown timers;
  - favourite matchups (Recent and Your pool cover it); the members' notebook until OD9;
  - D9's player rail and spotlight.
