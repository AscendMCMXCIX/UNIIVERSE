/*
  The five questions an owner asks of Admin → Data & Riot, answered with one plain label each:
  Healthy · Updating · Delayed · Unavailable · Needs attention. A job that "succeeded" is never
  enough on its own: each answer looks at what was actually collected (accounts synced, games
  stored, regions with current-patch games, statistics rebuilt recently).
*/
export type HealthLabel = "Healthy" | "Updating" | "Delayed" | "Unavailable" | "Needs attention";

export interface HealthAnswer {
  key: "riot" | "accounts" | "statistics" | "global" | "attention";
  question: string;
  label: HealthLabel;
  detail: string;
}

export interface HealthFacts {
  now: Date;
  riot: { configured: boolean; state: string; lastOkAt: Date | null; lastError: string | null };
  /** Linked player accounts by display state (see domain/account-status). */
  accounts: { total: number; synced: number; syncing: number; pending: number; delayed: number; failed: number };
  statistics: { totalGames: number; isDemo: boolean; lastAggregateAt: Date | null; waitingToAggregate: number };
  global: { configuredRegions: number; regionsWithCurrentData: number; regionsWithErrors: number; lastIngestAt: Date | null; currentPatchGames: number };
  /** Jobs that failed three or more times in a row. */
  failingJobs: string[];
}

const hours = (from: Date | null, now: Date) => (from ? (now.getTime() - from.getTime()) / 3_600_000 : Infinity);

export function answerHealthQuestions(f: HealthFacts): HealthAnswer[] {
  const out: HealthAnswer[] = [];

  // 1. Is Riot connected?
  if (!f.riot.configured) out.push({ key: "riot", question: "Is Riot connected?", label: "Unavailable", detail: "No Riot API key is configured, so no Riot data can be collected." });
  else if (f.riot.state === "rejected") out.push({ key: "riot", question: "Is Riot connected?", label: "Needs attention", detail: "Riot rejects the configured key. Replace RIOT_API_KEY in Vercel and redeploy." });
  else if (f.riot.state === "accepted") out.push({ key: "riot", question: "Is Riot connected?", label: "Healthy", detail: `Riot accepts the key${f.riot.lastOkAt ? `; last successful request ${ago(f.riot.lastOkAt, f.now)}` : ""}.` });
  else if (f.riot.state === "unavailable") out.push({ key: "riot", question: "Is Riot connected?", label: "Delayed", detail: `Riot is not answering reliably right now (${f.riot.lastError ?? "rate limit or outage"}); requests are retried automatically.` });
  else out.push({ key: "riot", question: "Is Riot connected?", label: "Updating", detail: "The key has not been used yet; the next scheduled run will check it." });

  // 2. Are player accounts syncing?
  const a = f.accounts;
  if (a.total === 0) out.push({ key: "accounts", question: "Are player accounts syncing?", label: "Unavailable", detail: "No Riot accounts are linked to players yet." });
  else if (a.failed > 0) out.push({ key: "accounts", question: "Are player accounts syncing?", label: "Needs attention", detail: `${a.failed} of ${a.total} linked account${a.total === 1 ? "" : "s"} could not be synced (wrong Riot ID or a duplicate). See Players & Accounts.` });
  else if (a.pending > 0 || a.syncing > 0) out.push({ key: "accounts", question: "Are player accounts syncing?", label: "Updating", detail: `${a.synced} synced, ${a.syncing} still collecting this season's games, ${a.pending} waiting for their first sync. This fills in over the next few scheduled runs.` });
  else if (a.delayed > 0) out.push({ key: "accounts", question: "Are player accounts syncing?", label: "Delayed", detail: `${a.delayed} of ${a.total} account${a.total === 1 ? "" : "s"} not refreshed for over a day; the next run catches up.` });
  else out.push({ key: "accounts", question: "Are player accounts syncing?", label: "Healthy", detail: `All ${a.total} linked account${a.total === 1 ? " is" : "s are"} synced with the whole season collected.` });

  // 3. Are champion statistics updating?
  const s = f.statistics;
  const aggAge = hours(s.lastAggregateAt, f.now);
  if (s.totalGames === 0 || s.isDemo) out.push({ key: "statistics", question: "Are champion statistics updating?", label: "Unavailable", detail: s.isDemo ? "Only demo statistics exist; real ones appear once ranked games are collected." : "No champion statistics yet; they are built from collected ranked games." });
  else if (aggAge > 12) out.push({ key: "statistics", question: "Are champion statistics updating?", label: "Delayed", detail: `Statistics were last rebuilt ${Number.isFinite(aggAge) ? `${Math.round(aggAge)} h ago` : "never"}${s.waitingToAggregate ? `; ${s.waitingToAggregate.toLocaleString()} collected games are waiting to be counted` : ""}.` });
  else if (s.waitingToAggregate > 500) out.push({ key: "statistics", question: "Are champion statistics updating?", label: "Updating", detail: `${s.waitingToAggregate.toLocaleString()} collected games are waiting for the next rebuild (it runs every scheduled tick).` });
  else out.push({ key: "statistics", question: "Are champion statistics updating?", label: "Healthy", detail: `Rebuilt ${Math.max(1, Math.round(aggAge * 60))} min ago from ${Math.round(s.totalGames).toLocaleString()} weighted games.` });

  // 4. Is global data being collected?
  const g = f.global;
  const ingestAge = hours(g.lastIngestAt, f.now);
  if (!f.riot.configured) out.push({ key: "global", question: "Is global data being collected?", label: "Unavailable", detail: "Needs a Riot API key." });
  else if (ingestAge > 12) out.push({ key: "global", question: "Is global data being collected?", label: "Delayed", detail: `No ranked games collected for ${Number.isFinite(ingestAge) ? `${Math.round(ingestAge)} h` : "a while"}.` });
  else if (g.regionsWithCurrentData < g.configuredRegions) out.push({ key: "global", question: "Is global data being collected?", label: "Updating", detail: `${g.regionsWithCurrentData} of ${g.configuredRegions} configured regions have current-patch games (${g.currentPatchGames.toLocaleString()} games); the rest are being sampled a few regions per run.${g.regionsWithErrors ? ` ${g.regionsWithErrors} region${g.regionsWithErrors === 1 ? "" : "s"} reported errors.` : ""}` });
  else out.push({ key: "global", question: "Is global data being collected?", label: "Healthy", detail: `All ${g.configuredRegions} configured regions have current-patch games (${g.currentPatchGames.toLocaleString()} in total).` });

  // 5. Does anything require attention?
  const asks: string[] = [];
  if (f.riot.configured && f.riot.state === "rejected") asks.push("replace the Riot API key");
  if (a.failed > 0) asks.push(`fix ${a.failed} linked account${a.failed === 1 ? "" : "s"}`);
  if (f.failingJobs.length) asks.push(`check failing jobs: ${f.failingJobs.join(", ")}`);
  out.push(asks.length ? { key: "attention", question: "Does anything need you?", label: "Needs attention", detail: `Yes: ${asks.join("; ")}.` } : { key: "attention", question: "Does anything need you?", label: "Healthy", detail: "No. Delays and partial data catch up on their own." });
  return out;
}

function ago(d: Date, now: Date): string {
  const h = hours(d, now);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
