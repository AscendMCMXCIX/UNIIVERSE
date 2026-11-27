/*
  The builds audit's sealed probe, opened for the Production check (docs/LIVE_VALIDATION.md, "The
  builds audit"; the app seals it in src/server/champion-builds/probe.ts, and
  src/server/jobs/builds-audit.test.ts holds the two equal).

  The protected `builds-audit` job names the champions whose builds the Production check should
  open without naming them in its answer: a manual Data jobs run prints a job's answer in the
  repository's public Actions log, and champion names tied to the team's game counts say something
  about the team. So the job seals them:

    probeSealed = "v1.<iv>.<ciphertext>.<tag>", in hex, the ciphertext in pieces of at most 32
    characters joined by "~" (the jobs endpoint's redaction takes out any run of 40 or more letters,
    digits, "_" and "-": server/jobs/answer-redact.ts; hex in short pieces is never one).
    AES-256-GCM, key = HMAC-SHA256(CRON_SECRET, "uniiverse:builds-probe:v1"), 12-byte iv.
    Plain text: each champion with its queue, "Thresh:solo,Leona:solo" (at most two, on one queue:
    the page holds one queue for both columns; scripts/builds-facts.mjs probeFrom opens a second
    entry only on the first's queue).

  The Production check's workflow opens it in scripts/production-audits.mjs (unsealBuildsProbe),
  masks each name in the log at once and passes the list to the live check as LIVE_BUILDS_CHAMPIONS
  (scripts/builds-facts.mjs), which never reports a name. Run alone (a session's check by hand):
    BUILDS_PROBE="<summary.probeSealed>" node scripts/builds-probe.mjs
  prints "::add-mask::<name>" for each champion, one line of counts, and, where GITHUB_ENV is set,
  appends LIVE_BUILDS_CHAMPIONS. A missing or unreadable probe prints why in words and exits 0: the
  populated builds facts then warn "not applicable"; they never fail for want of a probe.
*/
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PROBE_LABEL = "uniiverse:builds-probe:v1";
const keyFor = (secret) => createHmac("sha256", String(secret)).update(PROBE_LABEL).digest();
const ENTRY = /^([A-Za-z0-9]{1,40}):(solo|flex|draft|clash)$/;

/** Seals a probe's plain text as the app does (for tests and a session's check by hand). */
export function sealProbeText(text, secret, iv = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const pieces = body.toString("hex").match(/.{1,32}/g) ?? [];
  return ["v1", Buffer.from(iv).toString("hex"), pieces.join("~"), cipher.getAuthTag().toString("hex")].join(".");
}

/** Seals champions with their queues ({champion, queue} or "Name:queue"), as the builds audit does. */
export function sealBuildsProbe(entries, secret, iv) {
  const text = entries.map((e) => (typeof e === "string" ? e : `${e.champion}:${e.queue}`)).join(",");
  return sealProbeText(text, secret, iv);
}

/** The probe's plain text, or null when it cannot be opened with this secret. */
export function unsealProbe(sealed, secret) {
  if (!sealed || !secret) return null;
  const parts = String(sealed).split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const hex = (s) => (/^[0-9a-f]*$/.test(s) && s.length % 2 === 0 ? Buffer.from(s, "hex") : null);
  const iv = hex(parts[1]);
  const body = hex(parts[2].replaceAll("~", ""));
  const tag = hex(parts[3]);
  if (!iv || !body || !tag || iv.length !== 12 || tag.length !== 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
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
    .map((p) => ENTRY.exec(p.trim()))
    .filter(Boolean)
    .map((m) => ({ champion: m[1], queue: m[2] }));
}

/** The probe's champions with their queues, or null when it is missing, cut, sealed with another secret, or holds anything but one or two "Name:queue" entries. */
export function unsealBuildsProbe(sealed, secret) {
  const text = unsealProbe(sealed, secret);
  if (text === null) return null;
  const raw = text.split(",").filter(Boolean);
  const entries = parseProbe(text);
  return entries.length > 0 && entries.length <= 2 && entries.length === raw.length ? entries : null;
}

/** The live check's LIVE_BUILDS_CHAMPIONS value for these entries. */
export function buildsChampionsEnv(entries) {
  return entries.map((e) => `${e.champion}:${e.queue}`).join(",");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const probe = unsealBuildsProbe(process.env.BUILDS_PROBE, process.env.CRON_SECRET) ?? [];
  if (!process.env.BUILDS_PROBE) console.log("builds probe: none (no champion has enough games on this patch window yet)");
  else if (!probe.length) console.log("builds probe: unreadable (another secret, or not a probe)");
  else {
    for (const p of probe) console.log(`::add-mask::${p.champion}`);
    console.log(`builds probe: ${probe.length} champion${probe.length === 1 ? "" : "s"}`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `LIVE_BUILDS_CHAMPIONS=${buildsChampionsEnv(probe)}\n`);
  }
}
