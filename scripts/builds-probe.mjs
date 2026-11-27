import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/*
  The builds probe (Release 19; SCRATCH map2-prodcov §3a-1): the protected `builds-audit` job names
  the champions whose builds the Production check should open, without naming them in its answer.
  A manual Data jobs run prints a job's answer in the repository's public Actions log, and the
  answer's redaction (server/jobs/answer-redact.ts) does not remove champion names, which tied to
  the team's game counts say something about the team. So the job seals them:

    probeSealed = "v1.<iv>.<ciphertext>.<tag>"   (each part base64url)
    AES-256-GCM, key = HMAC-SHA256(CRON_SECRET, "uniiverse:builds-probe:v1") (32 bytes), 12-byte iv,
    plaintext = the champion ids, comma-separated ("Thresh,Leona"), UTF-8.

  The Production check's workflow unseals it with the same secret (production-audits.mjs), masks
  each id in the log at once, and passes them to the live check, which never reports them. Each
  base64url part stays under 40 characters for two champion ids (the answer's redaction replaces
  any longer run of token characters): a probe the redaction cut reads as unreadable, a warning.
*/

const LABEL = "uniiverse:builds-probe:v1";
const keyFor = (secret) => createHmac("sha256", String(secret)).update(LABEL, "utf8").digest();
const b64 = (buf) => Buffer.from(buf).toString("base64url");

/** Seals champion ids for the workflow (the app's builds-audit does the same; a test holds them equal). */
export function sealBuildsProbe(ids, secret, iv = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(ids.join(","), "utf8"), cipher.final()]);
  return `v1.${b64(iv)}.${b64(body)}.${b64(cipher.getAuthTag())}`;
}

/** The champion ids a probe holds, or null when it is missing, cut, sealed with another secret or not a list of champion ids. */
export function unsealBuildsProbe(sealed, secret) {
  const m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(sealed ?? ""));
  if (!m || !secret) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(m[1], "base64url"));
    decipher.setAuthTag(Buffer.from(m[3], "base64url"));
    const text = Buffer.concat([decipher.update(Buffer.from(m[2], "base64url")), decipher.final()]).toString("utf8");
    const ids = text.split(",").filter(Boolean);
    // Data Dragon's champion ids: letters only ("MonkeyKing", "KSante").
    return ids.length > 0 && ids.length <= 2 && ids.every((id) => /^[A-Za-z]{2,24}$/.test(id)) ? ids : null;
  } catch {
    return null;
  }
}
