/*
  Background jobs in plain words (Admin Mode → Data & Integrations, the overhaul's S9c): a name and
  one sentence each. The job's key and its technical description stay under the row's "How it
  works", and its interval under Advanced → Schedule. Every registered job has an entry
  (server/jobs/registry.test.ts).
*/

export const JOB_NAMES: Record<string, { name: string; summary: string }> = {
  "access-audit": { name: "Database access check", summary: "Checks who the app connects as and what each database role may read." },
  "auth-audit": { name: "Accounts check", summary: "Checks the accounts, administrators and passwords are in order." },
  "data-audit": { name: "Stored data check", summary: "Checks the games, ranks and mastery actually stored." },
  "db-usage": { name: "Database size", summary: "Reports table sizes and the heaviest queries." },
  egress: { name: "Data sent yesterday", summary: "Compares yesterday's database traffic with the daily budget." },
  "perf-probe": { name: "Speed check", summary: "Times the database and service calls behind the pages." },
  "proficiency-audit": { name: "Champion proficiency check", summary: "Compares champion proficiency under the previous and the current model." },
  "multikill-audit": { name: "Multikill fairness check", summary: "Compares the multikill score with alternative models on the stored games." },
  "rank-audit": { name: "Rank history check", summary: "Checks this ranked year's rank history against Riot's game counts." },
  "leaderboard-audit": { name: "Leaderboards check", summary: "Checks the boards show exactly the members active in the last 30 days." },
  "rank-schedule-status": { name: "LP schedule check", summary: "Says whether the five-minute rank schedule is on and running." },
  "riot-check": { name: "Riot key check", summary: "Checks Riot accepts the configured key." },
  "skin-audit": { name: "Champion skins check", summary: "Checks the stored skins against Riot's champion data." },
  "builds-audit": { name: "Champion Intel builds check", summary: "Re-checks the builds shown against their rules, from the counts themselves." },
  "account-sync": { name: "Linked accounts", summary: "Reads new games, ranks and mastery for the linked Riot accounts." },
  "timeline-backfill": { name: "Game timelines", summary: "Fetches the game timelines Matchups needs, a few each run." },
  "high-elo-sample": { name: "Master+ builds", summary: "Counts anonymous Master+ players' builds for Champion Intel; switched off until Riot's registration describes it." },
  "figures-backfill": { name: "Older games' extra figures", summary: "Fetches once more the older games stored before multikills were kept." },
  "rank-checks": { name: "Opponents' ranks", summary: "Checks the rank of the other players in the members' recent games." },
  "rank-watch": { name: "LP tracking", summary: "Reads the linked accounts' ranks, often for those playing ranked." },
  integrity: { name: "Housekeeping", summary: "Closes job runs an interrupted process left open, deletes old run records, ended sessions and failed sign-ins, and re-applies erasures." },
  "version-check": { name: "New game version", summary: "Looks for a new game version and updates the champions when one appears." },
  "static-sync": { name: "Champion data", summary: "Reloads every champion's data from Riot." },
  "history-rescan": { name: "Rescan every match history", summary: "Marks every account's season of games to be read again from Riot by the next syncs." },
  "lane-opponent-recompute": { name: "Repair the stored lane opponents", summary: "Sets each stored game's lane opponent again from its own record." },
  "erasure-reconcile-count": { name: "Erasures check", summary: "Counts what re-applying every erasure would change, changing nothing." },
  "erasure-reconcile": { name: "Re-apply every erasure", summary: "Applies every personal-data erasure again, as after restoring a backup." },
  "rank-schedule": { name: "Turn on the LP schedule", summary: "Installs the database's five-minute call of LP tracking." },
  "rank-schedule-off": { name: "Turn off the LP schedule", summary: "Removes the database's five-minute call of LP tracking." },
  "verify-account": { name: "The Production check's account", summary: "Keeps the account the Production check signs in with." },
};

/** A job's plain name, or its key for one without an entry. */
export function jobName(key: string): string {
  return JOB_NAMES[key]?.name ?? key;
}
