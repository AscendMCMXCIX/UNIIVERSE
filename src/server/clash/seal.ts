import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sessionSecretValue } from "@/server/auth/mode";

/*
  Sealed values for the Testing Lab: a blind test's answers travel with the test through the
  tester's browser, encrypted and authenticated (AES-256-GCM under a key derived from the server's
  secret), so neither the browser nor the matching code can read them; only the grader opens them,
  after the test has run, and a token changed in transit is refused. Nothing is stored.
*/

const PREFIX = "s1.";

function key(purpose: string): Buffer {
  return createHash("sha256").update(`uniiverse-seal\n${purpose}\n${sessionSecretValue()}`).digest();
}

export function seal(purpose: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The value, or null when the token is not one this server sealed for this purpose (or was changed). */
export function unseal<T>(purpose: string, token: string): T | null {
  if (typeof token !== "string" || !token.startsWith(PREFIX) || token.length > 64_000) return null;
  try {
    const raw = Buffer.from(token.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
