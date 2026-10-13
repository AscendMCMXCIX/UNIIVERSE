import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { listUsers, validateUsername } from "@/server/repositories/users";

/**
 * Read-only account audit: can every account sign in the way the product expects? Reports
 * owner usernames (owners only; members are counted, never named), accounts without a password
 * or a player profile, usernames that no longer satisfy the rules, whether the legacy email
 * column is really gone, and which migrations are applied. Changes nothing.
 */
defineJob({
  key: "auth-audit",
  description: "Read-only account check: owners, usernames, passwords, profiles, applied migrations. Changes nothing.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const users = await listUsers(ctx.db);
    const owners = users.filter((u) => u.role === "owner").map((u) => ({ username: u.username, hasPassword: u.hasPassword, hasPlayer: !!u.playerId, isActive: u.isActive, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }));
    const invalidUsernames = users.filter((u) => validateUsername(u.username) !== null).length;
    const columns = await ctx.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    const names = ((columns as unknown as { rows?: Array<{ column_name: string }> }).rows ?? (columns as unknown as Array<{ column_name: string }>)).map((c) => c.column_name);
    const migrations = await ctx.db.execute(sql`SELECT tag FROM uniiverse_migrations ORDER BY tag`);
    const applied = ((migrations as unknown as { rows?: Array<{ tag: string }> }).rows ?? (migrations as unknown as Array<{ tag: string }>)).map((m) => m.tag);
    const problems: string[] = [];
    if (owners.length === 0) problems.push("no owner account");
    if (owners.some((o) => !o.hasPassword)) problems.push("an owner has no password");
    if (owners.some((o) => !o.isActive)) problems.push("an owner is deactivated");
    if (invalidUsernames > 0) problems.push(`${invalidUsernames} username(s) break the username rules`);
    if (names.includes("email")) problems.push("legacy email column still present");
    return {
      ok: true,
      degraded: problems.length > 0,
      error: problems.length ? `Account audit: ${problems.join("; ")}.` : undefined,
      summary: {
        accounts: users.length,
        owners,
        coaches: users.filter((u) => u.role === "coach").length,
        players: users.filter((u) => u.role === "player").length,
        withoutPassword: users.filter((u) => !u.hasPassword).length,
        withoutProfile: users.filter((u) => !u.playerId).length,
        inactive: users.filter((u) => !u.isActive).length,
        invalidUsernames,
        emailColumnPresent: names.includes("email"),
        usernameColumnPresent: names.includes("username"),
        migrationsApplied: applied,
      },
    };
  },
});
