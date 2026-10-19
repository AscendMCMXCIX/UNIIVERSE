# UNIIVERSE — Project Overview

> **Written for:** another AI assistant (ChatGPT) that has never seen the repository.
> **Companion document:** `docs/UNIIVERSE_TECHNICAL_HANDOVER.md`. It covers architecture, data, engine, UI and history in depth, and opens with a 1–2 page **READ THIS FIRST** section.
>
> | | |
> |---|---|
> | Date written | 14 October 2026 |
> | Repository | `AscendMCMXCIX/UNIIVERSE`, branch `main` |
> | Code described | commit `562fe24` (the documentation commit that adds this file sits directly on top of it) |
> | Production | https://team-uniiverse.vercel.app (Vercel, region `syd1`; Supabase Postgres) |
> | Production version when checked | 14 Oct 2026: the live data jobs reported commit `562fe24` from 11:16 UTC; migrations 0000–0020 were applied. Later commits deploy automatically from `main`; see the handover, section A3. |
>
> **Update, October 2026:** the Draft feature (draft setup, Draft Room, recommendation engine, scouting, series, Match Playbook and the drafted-match archive) was removed at the user's request. This overview has been updated to match; the rest describes the state of 14 October.
>
> **Status labels used in both documents**
> - **IMPLEMENTED** — exists in the code.
> - **TESTED** — covered by automated tests (unit, database or browser) that pass.
> - **PRODUCTION VERIFIED** — confirmed against the live deployment. This uses read-only diagnostic jobs and public checks only; nobody signed in to the live site to click through it.
> - **PARTIAL** — exists, with a known limitation stated next to it.
> - **PLANNED** — requested but not built.
> - **UNKNOWN** — could not be verified.

---

## 1. What is UNIIVERSE?

UNIIVERSE is a **private, team-focused League of Legends platform** for one amateur team (about ten registered players plus an admin account). It is not a public statistics website and has no public sign-up.

**Why it exists.** It keeps one team's players, lineup and champion pools in one place and shows what their own Riot games say:
- **this team's actual players**: their roles, the champion pools they chose themselves, and their own Riot match history;
- **the team together**: the lineup, Leaderboards, and the games members played together;
- **global evidence**: high-Elo ranked games (Emerald and above, all public regions) and professional games, in Meta & Trends.

**Who uses it.**
- **Players:** keep their roles and champion pools, see their statistics, and keep a private Solo Queue improvement journal.
- **The Owner/admin:** manages accounts, access, data jobs and branding.

**Main goals.**
- Statistics that are labelled, honest about sample sizes and never fabricated.
- Data that refreshes itself without manual runs.
- A fast, clean interface on phone and desktop.

**How it differs from a generic statistics site.** Generic sites rank champions for everyone. UNIIVERSE starts from *your* players and the champions they actually play, with role-specific experience from their linked Riot accounts.

**Future direction (from the user's briefs, not commitments).** More reliable data coverage, continued UI refinement, and keeping the product simple: a player-centred team tool rather than an analytics platform.

---

## 2. Current features

| Area | What exists today | Status |
|---|---|---|
| **Accounts** | Created only by an admin (username + Riot ID, which Riot must confirm). A random temporary password is shown once and is valid 7 days. No email, no self sign-up, no invitation links. | IMPLEMENTED · TESTED · PRODUCTION VERIFIED (11 accounts exist; auth-audit job) |
| **Authentication** | Username + password (scrypt hashes). Sessions last 24 h and are not extended by activity; there is no "remember this device". Failed sign-ins are throttled. Owner recovery uses a setup key. | IMPLEMENTED · TESTED · PRODUCTION VERIFIED (Owner `adminascend` active, signed in 14 Oct 10:51 UTC) |
| **Onboarding** | At first sign-in, the player must choose a permanent password and then complete a Welcome setup (primary role and champions; optional secondary role). | IMPLEMENTED · TESTED. In production 4 accounts still have setup pending (auth-audit, 14 Oct). |
| **Permissions** | Owner, plus one base access level per account (Administrator / Standard Player / Restricted Player / Custom / Owner-made levels). Optional additional access groups on top, e.g. Team Lineup Manager. Every rule is enforced on the server. | IMPLEMENTED · TESTED. Groups added on 14 Oct (migration 0020, applied in production). |
| **Team** | Five lineup cards: featured champion art, 2–3 strength tags for the assigned lineup role, season games / win rate / KDA in that role, and the entire role pool (no "+N more"). Lineup swap (permission-gated). Your own card has a Customise button. Suggestions for empty roles. | IMPLEMENTED · TESTED (local). The Support slot is empty in production (no Support player assigned). |
| **Players** | Directory of everyone with the same card design, search and role filters. | IMPLEMENTED · TESTED |
| **Player profiles** | One profile layout for yourself and teammates, with tabs Overview / Champions & Roles / Riot Accounts. Read-only for others unless you have permission. | IMPLEMENTED · TESTED (local only; signed-in production pages not clicked through) |
| **My Profile** (formerly "My Overview") | Your own profile. Statistics default to all champions, all accounts, all supported game modes, current season. Filters: season, mode, role, configured pool, champion, account. A label states exactly what is counted. | IMPLEMENTED · TESTED |
| **Champion pools** | Primary role, secondary role and up to three additional roles, each with its own pool. No size cap. Drag to reorder, with autosave. The same champion may be in several role pools. | IMPLEMENTED · TESTED |
| **Riot account linking** | Several accounts per player, exactly one **Main** and the rest **Alts**. Each account is resolved to a PUUID and synced automatically by priority: rank, mastery and the whole current season of supported queues. | IMPLEMENTED · TESTED · PRODUCTION VERIFIED (13 linked accounts, all resolved and synced within the last hour on 14 Oct) |
| **Trends** | Top 10 per list (presence, picks, bans, strong performers, by role, rising/falling, pro priority), alerts for your pools, pro draft patterns. | IMPLEMENTED · TESTED. Rising/falling only appears once the previous patch has enough games. |
| **Team Matches** | Played together: Riot games two or more members played on the same side, with filters, bookmarks and match details. Encounters: players met repeatedly. | IMPLEMENTED · TESTED |
| **Solo Queue Blocks** | Private Solo/Duo journal: blocks with a flexible target (1–100 games or none, extendable, finish any time), one main mistake per game, one-tap import of recent Riot games. Only the owner can see it. | IMPLEMENTED · TESTED |
| **Admin** | People & Access, Riot Data (jobs, coverage, champion rework handling), Branding, System Health. | IMPLEMENTED · TESTED (local) |
| **Branding** | Team name, tagline, logo, separate sign-in and app backgrounds (GIF up to 20 MB, uploaded in 3.5 MB pieces), five colours with contrast checks. | IMPLEMENTED · TESTED |
| **System Health** | Plain-language status for website, database, Riot API, player syncing and jobs, plus technical diagnostics. `/api/health` is public and cheap. | IMPLEMENTED · PRODUCTION VERIFIED (`/api/health` answered ok with no failing jobs on 14 Oct). Note: "ok" does not mean data is flowing (see section 5). |

---

## 3. Typical user experience

### New player
1. An admin opens **Admin → People & Access → Add player account**, enters a username and the player's Riot ID, and clicks **Verify**. Riot must confirm the ID. The admin gets a temporary password to pass on privately.
2. The player opens the site and signs in with that username and temporary password.
3. They must choose a permanent password: 6+ characters with a capital letter, a number and a symbol.
4. The mandatory **Welcome** setup asks for a primary role and champions, and optionally a secondary role. Progress is saved as they go.
5. They land on **Team**. They can then refine pools (more roles, drag to reorder) in **My Profile → Champions & Roles**, and add Alt accounts in **Riot Accounts**.

### Existing player
Sign in → **Team** (lineup cards) → **My Profile** (statistics with filters, champion pools, Riot accounts) → **Team → Matches** for the games played together. Sessions last 24 hours, then they sign in again.

### Administrator (Owner)
1. Switch to **Admin Mode** with "Switch to Admin" in the sidebar (the menu button on phones).
2. **People & Access:** add accounts, reset passwords, deactivate, delete, move a player between Main and Other, and set each person's access (base level plus additional groups).
3. **Riot Data:** job status, regional coverage, champion rework handling.
4. **Branding** and **System Health.** (The public team page, `/public`, is always on and has no Admin page.)
5. The lineup itself is managed on **Team**, not in Admin.

---

## 4. Current development status

All phases were developed between 1 and 14 October 2026. Phase 1 started on 13 October, after an initial build and several refinement rounds. Each phase ended with a report; the claims below were re-checked against the code and production on 14 October.

| Phase | Focus | Outcome |
|---|---|---|
| **Phase 1** (+ follow-up) | Accounts, password sign-in, mandatory onboarding, simplified permissions, draft ownership | Done. Activation-code sign-in was replaced by admin-issued temporary passwords; the Team Leader role was removed. |
| **Phase 2** | Riot data (all queues, mastery, multi-account), season statistics, draft intelligence (modes, scouting, emergency picks), match edit/delete, one-screen playbook | Done |
| **Phase 3** | UI modernisation, configurable permissions, champion editing with autosave, admin organisation, branding uploads | Done |
| **Phase 4** | Data sufficiency audit, autonomous updates, previous-season data, access levels, password policy, Trends, 20 MB GIFs, QA | **Mostly done. Autonomous data updates are not fully reliable** — see section 5 and the handover, sections D3 and K. |
| **Phase 5** | Unified profiles, extra roles, uncapped pools, per-game statistics, strength tags, splash art, Solo Queue Blocks refresh, unfinished-draft management, Fearless | Done |
| **Phase 6** (14 Oct) | Navigation groups and account menu, shared player identity with skins, role-accurate statistics with filters, Main/Alt Riot accounts, Trends top 10, separate backgrounds, People & Access with access groups | Done and deployed; 3,198 champion skins collected in production. Signed-in production pages were not clicked through. |

**Still being worked on / not finished**
- **Global ranked data collection stalled.** It stalled between about 07:15 and 11:15 UTC on 14 Oct. A fix was deployed (commit `562fe24`) and confirmed working in production: 619 new games were stored at 11:25 UTC. It should be watched for a day of ordinary, visit-started updates.
- **Hourly GitHub schedule unreliable.** It often does not run. Supabase `pg_cron` (documented in `docs/DEPLOYMENT.md` §4c) would make collection regular. Whether it has been set up is **UNKNOWN**.
- **Team setup incomplete.** No Support player is assigned in production, and 4 accounts have not finished setup.
- **Live site not clicked through.** Nobody has walked through the signed-in production pages; `docs/LIVE_VALIDATION.md` §15 is the checklist.

---

## 5. Known limitations (confirmed evidence, 14 Oct 2026)

1. **Thin global evidence.**
   - 2,940 high-Elo ranked games are stored (2,321 before the 11:25 UTC batch, of which 2,229 were on patch 16.20). Before that batch the statistics held 1,604 "effective" games after rank and patch weighting.
   - Champion strength is **Limited**: median about 102 effective games per champion-role; the target is 250.
   - Lane matchups and pairings are **Insufficient**: median 2 games.
2. **Regional skew.** OCE was 66% of current-patch games before the latest batch. Emerald is the least-sampled band (133 of the current patch's games). PH and TH return errors on every run (Riot merged them into SG), which wastes time. TW and VN delivered games for the first time on 14 Oct.
3. **Collection depends on triggers.**
   - **GitHub schedule:** best-effort, and often missed.
   - **Vercel cron:** once a day.
   - **Site visits:** also start updates.
   - **The stall on 14 Oct:** the discovery step ran out of time on visit-started runs. Fixed in `562fe24` and confirmed in production (619 new games).
4. **Player history is uneven.** Some accounts have hundreds of season games, others under 50. Older games are still being backfilled with per-game K/D/A details (167 of 563 for one player).
5. **Composition logic is heuristic.** Team-fit traits (engage, frontline, poke…) behind the Team Overview suggestions come from curated champion characteristics.
6. **Not production-tested by a signed-in user.** All browser testing ran locally against demo data. Production checks are read-only jobs and public pages.
7. **Images can't be checked from the development container.** Data Dragon is unreachable from it, so champion art and skins were checked with stand-in images.

---

## 6. Product philosophy

**Established (stated repeatedly by the user in the phase briefs):**
- **Simplicity over complexity.** "Do not add complexity merely because it is technically possible." One clear option beats many.
- **Real players over generic meta.** Champion pools are player-defined; proficiency describes experience and never overrides a pool.
- **Honest figures.** Sample sizes are shown and sparse data is never shown as certainty.
- **Draft is gone for good.** It was removed in October 2026; do not reintroduce it, hide it behind a flag or replace it with a placeholder.
- **Data accuracy.** Never fabricate or guess data; label partial seasons and missing details.
- **Minimal admin overhead and autonomous updates.** No routine manual data runs.
- **Mobile and desktop** usability, readable text (no tiny fonts), no layout shifts.
- **Security.**
  - No escalation of privileges.
  - Accounts, passwords and permissions stay with Owners.
  - The last Owner can never be locked out.
  - No secrets are ever pasted into chat.
- **Privacy.** Solo Queue Blocks are private to their owner and never feed team statistics.
- **Retired ideas:**
  - activation-code sign-in;
  - the Team Leader / Draft Lead role;
  - invitation links;
  - an opponent database;
  - "NEW" champion badges;
  - Draft History as a separate list.

**Proposed / open ideas** (not decisions): more reliable scheduled collection (`pg_cron`), more Emerald and non-OCE sampling. Anything else should be confirmed with the user first.
