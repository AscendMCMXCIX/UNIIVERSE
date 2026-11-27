# What only the owner can do

One list of the settings, decisions and readings that need the owner (Release 19, reconciled on 27 Nov 2026 from the live GitHub state, the Actions logs and the repository). Everything else is engineering work. Each item says where to do it and what "done" looks like. Devices and Admin Mode have their own list: docs/OWNER_CHECKLIST.md.

## Settings (a few minutes each)

1. **Require `CI gate` before merging.** GitHub → Settings → Rules → Rulesets → **Protect main** → Require status checks to pass → Add checks → **CI gate** (source: GitHub Actions). Leave "Require branches to be up to date" off. Optional: Allowed merge methods → Merge commit only (CLAUDE.md §4 already asks for it). *Why:* the ruleset is active, but its list of required checks is empty (REST API, 27 Nov 2026), so GitHub would merge a pull request with red CI. *Then:* CLAUDE.md's line calling `CI gate` "the check the "Protect main" ruleset requires" becomes true; until then it is not, and only you change CLAUDE.md (docs/CI_USAGE.md, "Protecting `main`", states the current truth).
2. **Turn on private vulnerability reporting.** Settings → Advanced Security → Private vulnerability reporting → Enable. *Why:* SECURITY.md sends reporters there, and it is off (`enabled: false`, 27 Nov 2026).
3. **Confirm the Actions permissions.** Settings → Actions → General: "Workflow permissions" is **Read repository contents** (read-only), and "Require approval for all outside collaborators" (fork pull requests) is on. *Why:* these settings cannot be read from an engineering session (the API answers 403 through its proxy); every workflow already declares its own `permissions:`.
4. **Vercel.** Project → Settings → Environment Variables: no production secret (`DATABASE_URL`, `CRON_SECRET`, `RIOT_API_KEY`, `UNIIVERSE_AUTH_SECRET`, `VERIFY_ACCOUNT_SECRET`) is enabled for **Preview**; Settings → Functions: **Fluid compute** is on.
5. **GitHub notifications.** Did the emails for the seven failed scheduled Data jobs runs of 24–26 Nov 2026 arrive? If not: GitHub → your Settings → Notifications → Actions: email, for failed workflows only.

## Readings (send two numbers)

6. **Vercel usage (OD5).** Vercel → Usage → **Fluid Active CPU** (per day) and **Provisioned Memory**, today and the day after Release 19's deploy. *Why:* no reading since 9 Nov 2026; the deploy budget (CLAUDE.md §4), the 30 Nov performance verdict and the high-elo decision (item 12) rest on them.

## Decisions (with a deadline first)

7. **The 23 Nov backup, before about 21 Dec 2026.** It is the last backup holding the six tables migration `0068` dropped on 24 Nov (with your approval), and it expires with the 28-day retention about 21 Dec. Download it from `AscendMCMXCIX/uniiverse-backups` → Actions → run 45163645224 → artifact, and keep it offline, if that data should stay recoverable; otherwise its expiry ends that recovery path (docs/BACKUPS.md, "Status"). Optional: drill "Restoring production" once with a free second Supabase project (about 30 minutes; docs/BACKUPS.md).
8. **The one-row lane-opponent repair.** Admin → Data & Integrations → `lane-opponent-recompute` → type RECOMPUTE (data-audit of 19 Nov: 1 game disagrees, 5 unclear). Or approve an engineering session's Data jobs run of it.
9. **OD21: erasures and the activity log.** Run Data jobs `erasure-reconcile-count` (Release 19: read only, counts only), then decide whether the daily reconcile should cover more than the last two days' games.
10. **Smaller answers, each optional:** was 18 Nov's `rank-schedule-off` intended (OD2; Admin → Audit Logs → Data & jobs names who ran it); accept Team Overview's 3rem band cap at 1920 and 2560 (OD13); name the seven stat shards in the client (OD7, 5 minutes); approve or decline the iOS Simulator workflow (OD11); keep #308's 45-minute WebKit limit; the setup key's length (`UNIIVERSE_ACCESS_PASSWORD`); delete the earlier revisions of issue #251's text and PR #254's description; delete the merged remote branches (about 396 on 27 Nov); add a free outside uptime monitor (docs/MONITORING.md, "Still not covered").

## Riot and the high-elo statistics

11. **Riot Developer Portal.** Paste the registration description prepared for Champion Intel, its builds and runes, ability ranges, Matchup Intel's early-lane band and the high-elo aggregates (docs/RIOT_COMPLIANCE.md, the builds lane's proposed text), and confirm production's key is a **Personal** product registered for UNIIVERSE.
12. **High-elo aggregates (D2: approved in principle, collection stays off).** The enabling steps, in order, are in docs/HIGH_ELO_EVIDENCE.md, "For the owner": the portal registration covering anonymous high-elo aggregates (item 11), the privacy notice's row, item 6's readings, and for its second tier the workflow approval and a `RIOT_API_KEY` Actions secret. Nothing collects until both switches the code holds are on.
13. **Matchup Intel's reviewed notes.** Write the first notes, then re-review them each patch, in Admin → Platform Settings → Matchup notes (its queue lists the opponents and pairings members meet most, and the notes due for re-review). Until then the band says there are no reviewed notes yet. Who reviews, and when: docs/MATCHUP_INTEL.md (the curation and review procedure; patch day in docs/PATCH_MAINTENANCE.md, step 6).
14. **The privacy notice's new rows** (dated 27 November 2026): Matchup Intel's lane totals at 10 minutes and its reviewed notes (docs/PRIVACY.md, "Matchup Intel's lane totals and reviewed notes"). Read the public page's two rows and say if they need changing; the high-elo row stays "prepared, not active" until item 12.

## After Release 19's deploy

15. **The multikill score's fairness (the owner's request, item 1).** The read-only `multikill-audit` runs on production data after the deploy; its outcome and what it means are recorded in docs/TEAM_LEADERBOARDS.md, "Fairness evaluation". The formula changes only if the audit finds a better model and a calibrated simulation then confirms it, and only with your approval, because it moves places on the board. If the outcome is "keep", nothing is asked of you.
16. **Ability ranges (D3), optional.** Open a few champions in Champion Intel: each opened ability row says how its range was decided. Report any range that looks wrong, or confirm rows as the team's own (the table's reviewer `owner`); 269 ranges and 11 "Global" are shown, every one reviewed by two independent automated reviewers, and nothing where a reviewer had any doubt (docs/CHAMPION_INTEL.md, "Ranges").
17. **Your device checks.** Run docs/OWNER_CHECKLIST.md once (iPhone Safari, the installed app, Admin Mode): only what an engineering session cannot check.

## Not yours (recorded so nobody waits on you)

- The follow-ups the archived session had scheduled: recreated on 27 Nov 2026 as two scheduled tasks of the coordinating session, one on 30 Nov 2026 (the Monday performance probe and the weekly backup) and one on 5 Jan 2027 (the ranked-year transition on production).
- Setting 2027's ranked start date when Riot publishes it: a one-line engineering change (docs/RANKED_PROGRESS.md, "The 2027 ranked year").
