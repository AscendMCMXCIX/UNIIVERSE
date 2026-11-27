/*
  Opens the builds audit's sealed probe for the Production check (docs/LIVE_VALIDATION.md, "The
  builds audit"; the app seals it in src/server/champion-builds/probe.ts, and
  src/server/jobs/builds-audit.test.ts holds the two equal).

  In the workflow, after the builds-audit job's answer is read and before CRON_SECRET is unset:
    BUILDS_PROBE="<summary.probeSealed>" node scripts/builds-probe.mjs
  It prints "::add-mask::<name>" for each champion (so any later mention in the log is ***), then
  one line of counts ("builds probe: 2 champions"), and, where GITHUB_ENV is set, appends
  LIVE_BUILDS_CHAMPIONS=<Name:queue,...> to it for the live check. It never prints a name otherwise.
  A missing or unreadable probe prints why in words and exits 0: the populated builds facts then warn
  "not applicable"; they never fail for want of a probe.
*/
import { createDecipheriv, createHmac } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PROBE_LABEL = "uniiverse:builds-probe:v1";

/** The probe's plain text, or null when it cannot be opened with this secret. */
export function unsealProbe(sealed, secret) {
  if (!sealed || !secret) return null;
  const parts = String(sealed).split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  // Hex, the ciphertext in pieces joined by "~" (so the jobs endpoint's redaction never takes it for a token).
  const hex = (s) => (/^[0-9a-f]*$/.test(s) && s.length % 2 === 0 ? Buffer.from(s, "hex") : null);
  const iv = hex(parts[1]);
  const body = hex(parts[2].replaceAll("~", ""));
  const tag = hex(parts[3]);
  if (!iv || !body || !tag || iv.length !== 12 || tag.length !== 16) return null;
  try {
    const key = createHmac("sha256", secret).update(PROBE_LABEL).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "Thresh:solo,Leona:flex" → each champion with its queue; anything else is left out. */
export function parseProbe(text) {
  return String(text ?? "")
    .split(",")
    .map((p) => /^([A-Za-z0-9]{1,40}):(solo|flex|draft|clash)$/.exec(p.trim()))
    .filter(Boolean)
    .map((m) => ({ champion: m[1], queue: m[2] }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = unsealProbe(process.env.BUILDS_PROBE, process.env.CRON_SECRET);
  const probe = parseProbe(text);
  if (!process.env.BUILDS_PROBE) console.log("builds probe: none (no champion has enough games on this patch window yet)");
  else if (!probe.length) console.log("builds probe: unreadable (another secret, or not a probe)");
  else {
    for (const p of probe) console.log(`::add-mask::${p.champion}`);
    console.log(`builds probe: ${probe.length} champion${probe.length === 1 ? "" : "s"}`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `LIVE_BUILDS_CHAMPIONS=${probe.map((p) => `${p.champion}:${p.queue}`).join(",")}\n`);
  }
}
