import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request to the job endpoint carries the scheduler's secret, as
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this itself) and only that way: a secret
 * in the address would be written to every request log. Compared in constant time; both sides are
 * hashed first, so neither the content nor the length of the secret shows in the timing.
 */
export function jobRequestAuthorised(authorization: string | null, secret: string): boolean {
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return secret.length > 0 && timingSafeEqual(digest(provided), digest(secret));
}
