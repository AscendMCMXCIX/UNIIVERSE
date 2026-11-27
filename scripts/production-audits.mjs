import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { redact } from "./redact.mjs";
import { buildsChampionsEnv, unsealBuildsProbe } from "./builds-probe.mjs";

/*
  The Production check's server-side audits (Release 19, the owner's request of 26 Nov 2026, item 7;
  docs/LIVE_VALIDATION.md, "What it checks"), called by .github/workflows/production-check.yml in its
  Live check step, before the live check and while the step still holds CRON_SECRET:

  - `leaderboard-audit`: Team Leaderboards' 30-day rule re-derived from the database by the job's
    own query, against the page's own view, with the rule checked at its boundary (views at shifted
    times). Its count of active players goes to the live check (LIVE_ACTIVE_PLAYERS, with
    LIVE_LEADERBOARD_BOUNDARY), which compares the page's own count with it.
  - `builds-audit` (the builds lane's job): every builds threshold re-checked from raw counts for
    the champions with populated builds, which it names only sealed (builds-probe.mjs). Unsealed
    here, each champion's name is masked in the log at once and passed on with its queue as
    LIVE_BUILDS_CHAMPIONS ("Name:queue,…", read by scripts/builds-facts.mjs).

  Each answer is read for fixed counts only and written as fixed sentences (stdout and the summary
  file); a job's own violation labels (p1, c1/MID…) are anonymous by design and pass through the
  same redaction as the live check's report. A job the deployment does not have yet (404) is a
  warning, not a failure: the check of a deployment from before Release 19 still passes. Any other
  answer that is not a clean pass fails the step. The environment file holds counts and the masked
  ids only; the workflow sources and deletes it.

    node scripts/production-audits.mjs <app url> <summary.md> <audits.env>   (CRON_SECRET in the environment)
*/

/** One job's answer as the endpoint gave it: its HTTP status and its JSON (or null). */
async function ask(base, job, secret, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${base}/api/jobs/${job}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(120_000) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, error: String(e?.name ?? "error") };
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const labels = (list) => (Array.isArray(list) ? list.slice(0, 3).map((v) => redact(String(v)).slice(0, 120)) : []);

/** The leaderboard audit's answer, as fixed lines, the counts for the live check, and whether it failed. */
export function leaderboardAuditLines(answer) {
  if (answer.status === 404) return { lines: ["- warning: leaderboard-audit is not deployed yet (404): the page's count of active players is not compared this run."], env: {}, failed: false, warning: "leaderboard-audit is not deployed yet" };
  const s = answer.body?.summary;
  const active = num(s?.activeCount);
  if (!s || active === null) return { lines: [`- FAIL: leaderboard-audit could not be read (HTTP ${answer.status || "no answer"}).`], env: {}, failed: true };
  const env = { LIVE_ACTIVE_PLAYERS: String(active), LIVE_LEADERBOARD_BOUNDARY: String(num(s.boundaryWithinHour) ?? 0) };
  const rule = s.rule ?? {};
  const shifted = (num(rule.absentAfter30Days?.checked) ?? 0) + (num(rule.presentWithinWindow?.checked) ?? 0);
  const returned = s.returnedRecently?.observed ? `${num(s.returnedRecently.players) ?? 0} member(s) returned after more than 30 days, all shown: ${num(s.returnedRecently.shown) ?? 0}` : "no return observed in the last 30 days";
  const counts = `${num(s.members) ?? "?"} members, ${active} active, ${num(s.shown?.scopeCount) ?? "?"} shown; the rule checked at ${shifted} shifted times (not an observed reappearance); ${returned}`;
  const violations = Array.isArray(s.violations) ? s.violations.length : 0;
  if (answer.status === 200 && answer.body?.ok === true && violations === 0) return { lines: [`- ok: leaderboard-audit: ${counts}.`], env, failed: false };
  return { lines: [`- FAIL: leaderboard-audit: ${violations} difference(s) between the 30-day rule and the boards (${counts}).`, ...labels(s.violations).map((l) => `  - ${l}`)], env, failed: true };
}

/** The builds audit's answer, as fixed lines, the unsealed champions with their queues (masked by the caller), and whether it failed. */
export function buildsAuditLines(answer, secret) {
  if (answer.status === 404) return { lines: ["- warning: builds-audit is not deployed yet (404): the populated builds are not opened this run."], ids: [], failed: false, warning: "builds-audit is not deployed yet" };
  const s = answer.body?.summary;
  if (!s || typeof s !== "object") return { lines: [`- FAIL: builds-audit could not be read (HTTP ${answer.status || "no answer"}).`], ids: [], failed: true };
  const violations = num(s.violationCount) ?? (Array.isArray(s.violations) ? s.violations.length : 0);
  const parts = s.parts && typeof s.parts === "object" ? Object.entries(s.parts).filter(([, n]) => num(n) !== null).map(([k, n]) => `${n} ${k}`).join(", ") : "";
  const counts = `${num(s.candidates) ?? 0} candidate(s), ${num(s.audited) ?? 0} audited${parts ? `; parts: ${parts}` : ""}; ${violations} violation(s)`;
  if (!(answer.status === 200 && answer.body?.ok === true && violations === 0)) return { lines: [`- FAIL: builds-audit: ${counts}.`, ...labels(s.violations).map((l) => `  - ${l}`)], ids: [], failed: true };
  const ids = s.probeSealed ? unsealBuildsProbe(s.probeSealed, secret) : null;
  if (!s.probeSealed) return { lines: [`- ok: builds-audit: ${counts}; no champion has enough games on this patch window yet, so no populated builds are opened.`], ids: [], failed: false };
  if (!ids) return { lines: [`- ok: builds-audit: ${counts}.`, "- warning: builds-audit's probe could not be read (cut, or sealed with another secret): no populated builds are opened this run."], ids: [], failed: false, warning: "the builds probe could not be read" };
  return { lines: [`- ok: builds-audit: ${counts}; ${ids.length} champion(s) with populated builds to open (named in the log only as ***).`], ids, failed: false };
}

/** Runs both audits; writes the summary lines and the environment file; returns the exit status. */
export async function runAudits({ base, secret, summaryFile, envFile, fetchImpl = fetch, log = console.log }) {
  writeFileSync(envFile, "");
  if (!secret) {
    writeFileSync(summaryFile, "- warning: the CRON_SECRET secret is not set, so the production audits did not run.\n");
    log("::warning::The CRON_SECRET secret is not set, so the production audits did not run.");
    return 0;
  }
  const lb = leaderboardAuditLines(await ask(base, "leaderboard-audit", secret, fetchImpl));
  const bu = buildsAuditLines(await ask(base, "builds-audit", secret, fetchImpl), secret);
  // Masked before anything else is written, so no later line can show an id.
  for (const entry of bu.ids) log(`::add-mask::${entry.champion}`);
  const env = { ...lb.env, ...(bu.ids.length ? { LIVE_BUILDS_CHAMPIONS: buildsChampionsEnv(bu.ids) } : {}) };
  appendFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}\n`).join(""));
  const lines = ["## Production audits", ...lb.lines, ...bu.lines];
  writeFileSync(summaryFile, `${lines.join("\n")}\n`);
  for (const l of [...lb.lines, ...bu.lines]) log(l);
  for (const w of [lb.warning, bu.warning].filter(Boolean)) log(`::warning::${w}.`);
  return lb.failed || bu.failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [base, summaryFile = "audits.md", envFile = "audits.env"] = process.argv.slice(2);
  if (!base) {
    console.error("usage: node scripts/production-audits.mjs <app url> [summary.md] [audits.env]");
    process.exit(2);
  }
  process.exit(await runAudits({ base: base.replace(/\/$/, ""), secret: process.env.CRON_SECRET ?? "", summaryFile, envFile }));
}
