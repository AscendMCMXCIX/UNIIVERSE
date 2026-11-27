import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import type { BuildQueueKey } from "@/domain/champion-builds";

/*
  The builds audit's probe (server/jobs/builds-audit; docs/LIVE_VALIDATION.md, "The builds audit"):
  the champions the Production check opens for the populated builds facts, sealed so that a public
  Data jobs log prints only ciphertext. Champion names beside the team's game counts are treated as
  the team's own data (as All Champions' preview is: "the champion's name is compared in the page and
  not reported"), so the job's answer never names one.

  Sealed with AES-256-GCM under a key derived from CRON_SECRET (HMAC-SHA256 of PROBE_LABEL), as
  "v1.<iv>.<ciphertext>.<tag>" in hex, the ciphertext in pieces of at most 32 characters joined by
  "~": the jobs endpoint takes any run of 40 or more letters, digits, "_" and "-" out of an answer
  (server/jobs/answer-redact.ts), and hex in short pieces is never one, nor anything else it takes
  out. The plain text is "Thresh:solo,Leona:solo": at most two champions, on one queue (the page
  holds one queue for both columns of Compare). The
  workflow opens it in scripts/production-audits.mjs with scripts/builds-probe.mjs (the same derivation, held equal by
  src/server/jobs/builds-audit.test.ts), masks each name and hands the list to the live check.
*/

export const PROBE_LABEL = "uniiverse:builds-probe:v1";

/** Whether a champion's id can stand in the probe (what scripts/builds-probe.mjs reads back): letters and digits, as Data Dragon's ids are. */
export function probeable(champion: string): boolean {
  return /^[A-Za-z0-9]{1,40}$/.test(champion);
}

/** The probe's plain text: each champion with the queue its builds are in. */
export function probeText(probe: ReadonlyArray<{ champion: string; queue: BuildQueueKey }>): string {
  return probe.filter((p) => probeable(p.champion)).map((p) => `${p.champion}:${p.queue}`).join(",");
}

/** Seals the probe's text under the secret; null without a secret (nothing is sent then). */
export function sealProbe(text: string, secret: string | undefined): string | null {
  if (!secret || !text) return null;
  const key = createHmac("sha256", secret).update(PROBE_LABEL).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const hex = body.toString("hex");
  const pieces = hex.match(/.{1,32}/g) ?? [];
  return ["v1", iv.toString("hex"), pieces.join("~"), cipher.getAuthTag().toString("hex")].join(".");
}
