import type { HealthAnswer, HealthLabel } from "./data-health";

/*
  Admin → System Health for someone who is not a developer: five things, each with one plain
  label and one sentence, every label backed by something measured on this request or stored
  by the jobs (never "Healthy" by default).
*/

export interface SystemStatusItem {
  key: "website" | "database" | "riot" | "accounts" | "jobs";
  title: string;
  label: HealthLabel;
  detail: string;
}

export interface SystemFacts {
  now: Date;
  website: { commit: string | null; region: string | null; authMode: "accounts" | "open" | "locked" | string };
  /** The database answered a test query on this request (in `pingMs`), and what kind it is. */
  database: { mode: string; pingMs: number | null };
  /** Answers from Riot Data, reused so both pages agree. */
  answers: HealthAnswer[];
  jobs: { lastRunAt: Date | null; failing: string[]; everRan: boolean };
}

/** Scheduled runs come every three hours; two missed runs count as delayed. */
const JOBS_DELAYED_HOURS = 8;

export function systemStatus(f: SystemFacts): SystemStatusItem[] {
  const out: SystemStatusItem[] = [];

  // Website: this page was rendered by the server, which is the evidence it is up.
  const build = f.website.commit ? `build ${f.website.commit.slice(0, 7)}` : "a local build";
  if (f.website.authMode === "accounts") out.push({ key: "website", title: "Website", label: "Healthy", detail: `Online: this page was served by ${build}${f.website.region ? ` (${f.website.region})` : ""}. Sign-in is required.` });
  else if (f.website.authMode === "open") out.push({ key: "website", title: "Website", label: "Needs attention", detail: `Online (${build}), but sign-in is switched off: anyone with the link can use it.` });
  else out.push({ key: "website", title: "Website", label: "Needs attention", detail: `Online (${build}), but sign-in is not set up yet: finish the owner setup.` });

  // Database: a real query on this request, and whether the data survives a restart.
  if (f.database.pingMs === null) out.push({ key: "database", title: "Database", label: "Needs attention", detail: "The database did not answer a test query." });
  else if (f.database.mode !== "postgres") out.push({ key: "database", title: "Database", label: "Needs attention", detail: "Connected, but this is a temporary database: everything is lost when the server restarts." });
  else if (f.database.pingMs > 1000) out.push({ key: "database", title: "Database", label: "Delayed", detail: `Connected but slow: a test query took ${Math.round(f.database.pingMs)} ms.` });
  else out.push({ key: "database", title: "Database", label: "Healthy", detail: `Connected: a test query took ${Math.round(f.database.pingMs)} ms.` });

  // Riot API and player syncing come from the Riot Data answers.
  const answer = (key: HealthAnswer["key"]) => f.answers.find((a) => a.key === key);
  const riot = answer("riot");
  out.push({ key: "riot", title: "Riot API", label: riot?.label ?? "Unavailable", detail: riot?.detail ?? "No information about the Riot connection yet." });
  const accounts = answer("accounts");
  out.push({ key: "accounts", title: "Player syncing", label: accounts?.label ?? "Unavailable", detail: accounts?.detail ?? "No information about linked accounts yet." });

  // Background jobs: the most recent run and anything failing repeatedly.
  const age = f.jobs.lastRunAt ? (f.now.getTime() - f.jobs.lastRunAt.getTime()) / 3_600_000 : Infinity;
  const when = Number.isFinite(age) ? (age < 1 ? `${Math.max(1, Math.round(age * 60))} min ago` : age < 48 ? `${Math.round(age)} h ago` : `${Math.round(age / 24)} days ago`) : "never";
  if (!f.jobs.everRan) out.push({ key: "jobs", title: "Background jobs", label: "Unavailable", detail: "No scheduled run has been recorded yet. The scheduler (GitHub Actions or Vercel Cron) starts them." });
  else if (f.jobs.failing.length) out.push({ key: "jobs", title: "Background jobs", label: "Needs attention", detail: `${f.jobs.failing.length} job${f.jobs.failing.length === 1 ? " keeps" : "s keep"} failing (${f.jobs.failing.join(", ")}). Last run ${when}.` });
  else if (age > JOBS_DELAYED_HOURS) out.push({ key: "jobs", title: "Background jobs", label: "Delayed", detail: `The last scheduled run was ${when}; runs are expected every few hours.` });
  else out.push({ key: "jobs", title: "Background jobs", label: "Healthy", detail: `Running on schedule: last run ${when}, nothing failing repeatedly.` });

  return out;
}
