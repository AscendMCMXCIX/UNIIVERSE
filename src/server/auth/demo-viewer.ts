/**
 * The demo viewer: who the local in-memory demo shows its pages to, chosen with a cookie, so the
 * pages a member sees only with a player profile of their own (their own profile with data, "you"
 * and "your" in the help text, the first sign-in at /welcome) can be audited and tested. Without
 * the cookie the demo's viewer stays the automatic local owner, an administrator without a player
 * profile, as every spec expects.
 *
 *   member     a team member (Standard Player, not an administrator) whose player profile is the
 *              demo's ADC, set up, with games: the local owner's account row seen as that member,
 *              so nothing is added to the demo's account lists;
 *   newcomer   the demo's member who has chosen nothing yet (/welcome);
 *   halfway    the demo's member with a role and two champions (/welcome).
 *
 * It exists ONLY in the in-memory demo: `demoViewerAllowed` refuses every other configuration (any
 * deployment, any real database, any server that requires accounts, a file database), and the
 * session resolver checks it before it reads the cookie, so on a deployment the cookie is ignored
 * like any unknown cookie. The rule is environment-only and unit-tested (demo-viewer.test.ts).
 */
import type { ModeEnv } from "./mode";
import { requiresAccounts } from "./mode";

export const DEMO_VIEWER_COOKIE = "uniiverse_demo_viewer";
export const DEMO_VIEWERS = ["member", "newcomer", "halfway"] as const;
export type DemoViewer = (typeof DEMO_VIEWERS)[number];

/** The demo player the "member" viewer is (an unlinked lineup player with games in the demo). */
export const DEMO_MEMBER_PLAYER = "Demo ADC";
/** The demo accounts the first-sign-in viewers are (server/demo/seed.ts). */
export const DEMO_SETUP_USERNAMES: Record<Exclude<DemoViewer, "member">, string> = { newcomer: "demo-newcomer", halfway: "demo-halfway" };

export interface DemoViewerEnv extends ModeEnv {
  UNIIVERSE_DB_MODE?: string;
  UNIIVERSE_SEED_DEMO?: string;
}

/**
 * True only for the local in-memory demo: no Vercel, no database URL, accounts not required, the
 * memory database chosen and the demo seeded. Anything else (production, a preview deployment, a
 * self-hosted server, a local Postgres or file database) refuses the demo viewer.
 */
export function demoViewerAllowed(env: DemoViewerEnv = process.env): boolean {
  if (env.VERCEL || env.VERCEL_ENV) return false;
  if ((env.DATABASE_URL ?? "").trim()) return false;
  if (requiresAccounts(env)) return false;
  if (env.UNIIVERSE_DB_MODE !== "memory") return false;
  return env.UNIIVERSE_SEED_DEMO === "true";
}

/** The viewer a cookie asks for, or null (not allowed here, no cookie, or an unknown value). */
export function demoViewerFromCookie(value: string | undefined, env: DemoViewerEnv = process.env): DemoViewer | null {
  if (!value || !demoViewerAllowed(env)) return null;
  return (DEMO_VIEWERS as readonly string[]).includes(value) ? (value as DemoViewer) : null;
}
