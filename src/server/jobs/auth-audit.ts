import { gt, sql } from "drizzle-orm";
import { sessions } from "@/server/db/schema";
import { defineJob } from "./registry";
import { listUsers, validateUsername } from "@/server/repositories/users";

/**
 * Read-only account audit: can every account sign in the way the product expects? Reports
 * each owner account by number, never by username (the repository and its Actions logs are
 * public), with the day it last signed in; members are counted, never named. Also how many other accounts hold
 * administrator access, accounts without a password
 * or a player profile, usernames that no longer satisfy the rules, whether the legacy email
 * column is really gone, which migrations are applied, any table without Row Level Security
 * (which Supabase's Data API could otherwise read with the public key), and how the social links
 * are stored (counted, never read out). Changes nothing.
 */
defineJob({
  key: "auth-audit",
  description: "Read-only account check: owners, administrators (counted), usernames, passwords, profiles, applied migrations, Row Level Security, social links (counted). Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const users = await listUsers(ctx.db);
    // A label and the day, never the username or the time: this summary is printed in public Actions logs.
    const owners = users
      .filter((u) => u.role === "owner")
      .map((u, i) => ({ owner: `owner ${i + 1}`, hasPassword: u.hasPassword, hasPlayer: !!u.playerId, isActive: u.isActive, lastLoginDay: u.lastLoginAt?.toISOString().slice(0, 10) ?? null }));
    const invalidUsernames = users.filter((u) => validateUsername(u.username) !== null).length;
    const now = new Date();
    const liveSessions = await ctx.db.select({ userId: sessions.userId }).from(sessions).where(gt(sessions.expiresAt, now));
    const withSession = new Set(liveSessions.map((r) => r.userId));
    const members = users.filter((u) => u.role !== "owner" && u.isActive);
    // How each active account can sign in: counts only, never names.
    const signIn = {
      permanentPassword: members.filter((u) => u.hasPassword && !u.mustChangePassword).length,
      temporaryPassword: members.filter((u) => u.mustChangePassword && (!u.temporaryPasswordExpiresAt || u.temporaryPasswordExpiresAt > now)).length,
      expiredTemporaryPassword: members.filter((u) => u.mustChangePassword && u.temporaryPasswordExpiresAt && u.temporaryPasswordExpiresAt <= now).length,
      noPasswordWithLiveSession: members.filter((u) => !u.hasPassword && withSession.has(u.id)).length,
      noPasswordNeedsReset: members.filter((u) => !u.hasPassword && !withSession.has(u.id)).length,
      setupPending: members.filter((u) => !u.setupCompletedAt && u.playerId).length,
    };
    const columns = await ctx.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'`);
    const names = ((columns as unknown as { rows?: Array<{ column_name: string }> }).rows ?? (columns as unknown as Array<{ column_name: string }>)).map((c) => c.column_name);
    const migrations = await ctx.db.execute(sql`SELECT tag FROM uniiverse_migrations ORDER BY tag`);
    const applied = ((migrations as unknown as { rows?: Array<{ tag: string }> }).rows ?? (migrations as unknown as Array<{ tag: string }>)).map((m) => m.tag);
    const open = await ctx.db.execute(sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity ORDER BY c.relname`);
    const withoutRls = ((open as unknown as { rows?: Array<{ relname: string }> }).rows ?? (open as unknown as Array<{ relname: string }>)).map((t) => t.relname);
    // Social links (migration 0061): how many, how many switched on (Show publicly), and how many
    // are still in the shape before it, which only an instance of the previous version could have
    // written during a deployment (read safely: shown only if it was public). Values never leave.
    const social = await ctx.db.execute(sql`
      SELECT count(DISTINCT p.id)::int AS profiles, count(*)::int AS links,
        count(*) FILTER (WHERE e.value -> 'public' = 'true'::jsonb OR e.value ->> 'show' = 'public')::int AS switched_on,
        count(*) FILTER (WHERE e.value -> 'show' IS NOT NULL)::int AS old_shape
      FROM players p CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.social_links) = 'object' THEN p.social_links ELSE '{}'::jsonb END) AS e(key, value)
      WHERE jsonb_typeof(e.value) = 'object'`);
    const [links] = (social as unknown as { rows?: Array<{ profiles: number; links: number; switched_on: number; old_shape: number }> }).rows ?? (social as unknown as Array<{ profiles: number; links: number; switched_on: number; old_shape: number }>);
    const problems: string[] = [];
    if (owners.length === 0) problems.push("no owner account");
    if (owners.some((o) => !o.hasPassword)) problems.push("an owner has no password");
    if (owners.some((o) => !o.isActive)) problems.push("an owner is deactivated");
    if (invalidUsernames > 0) problems.push(`${invalidUsernames} username(s) break the username rules`);
    if (names.includes("email")) problems.push("legacy email column still present");
    if (withoutRls.length > 0) problems.push(`${withoutRls.length} table(s) without Row Level Security`);
    return {
      ok: true,
      degraded: problems.length > 0,
      error: problems.length ? `Account audit: ${problems.join("; ")}.` : undefined,
      summary: {
        accounts: users.length,
        owners,
        // Administrator access beyond the Owner (migration 0053): counted, never named.
        administrators: { active: users.filter((u) => u.role !== "owner" && u.isAdmin && u.isActive).length, deactivated: users.filter((u) => u.role !== "owner" && u.isAdmin && !u.isActive).length },
        retiredCoachRole: users.filter((u) => u.role === "coach").length,
        playerSignIn: signIn,
        players: users.filter((u) => u.role === "player").length,
        withoutPassword: users.filter((u) => !u.hasPassword).length,
        withoutProfile: users.filter((u) => !u.playerId).length,
        inactive: users.filter((u) => !u.isActive).length,
        invalidUsernames,
        emailColumnPresent: names.includes("email"),
        usernameColumnPresent: names.includes("username"),
        migrationsApplied: applied,
        tablesWithoutRowLevelSecurity: withoutRls,
        socialLinks: { profiles: Number(links?.profiles ?? 0), links: Number(links?.links ?? 0), switchedOn: Number(links?.switched_on ?? 0), oldShape: Number(links?.old_shape ?? 0) },
      },
    };
  },
});
