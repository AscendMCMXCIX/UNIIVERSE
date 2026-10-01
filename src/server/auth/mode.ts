/**
 * Deployment mode, decided from the environment alone (no database, no Next.js imports) so the
 * route proxy and the server share one rule.
 *
 * Accounts are required whenever the app runs in production against anything real:
 *   - any Vercel deployment (production AND preview: previews share the environment variables
 *     you scope to them, so they must never run in the open local mode), or
 *   - any production server with a DATABASE_URL (a self-hosted box, Railway, Render…).
 * `UNIIVERSE_REQUIRE_AUTH=true` forces accounts anywhere; `false` is an explicit opt-out meant
 * only for a private LAN server that nobody outside the team can reach.
 */
export interface ModeEnv {
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  UNIIVERSE_REQUIRE_AUTH?: string;
  UNIIVERSE_AUTH_SECRET?: string;
  UNIIVERSE_ACCESS_PASSWORD?: string;
}

export function requiresAccounts(env: ModeEnv = process.env): boolean {
  const flag = (env.UNIIVERSE_REQUIRE_AUTH ?? "").trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  if (env.NODE_ENV !== "production") return false;
  return !!env.VERCEL || !!env.DATABASE_URL;
}

/** What a production deployment still lacks before it can run at all. */
export function missingProductionSetup(env: ModeEnv = process.env): string[] {
  if (!requiresAccounts(env)) return [];
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!(env.UNIIVERSE_AUTH_SECRET || env.UNIIVERSE_ACCESS_PASSWORD)) missing.push("UNIIVERSE_AUTH_SECRET");
  return missing;
}

export function sessionSecretValue(env: ModeEnv = process.env): string {
  return env.UNIIVERSE_AUTH_SECRET || env.UNIIVERSE_ACCESS_PASSWORD || "uniiverse-local-development-secret";
}
