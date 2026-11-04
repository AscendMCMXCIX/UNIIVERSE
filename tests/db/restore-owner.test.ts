import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/server/db/create";
import { activationCodes, auditEvents, sessions, teamBookmarks, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { hashPassword } from "@/server/auth/password";
import { createSession, findSession } from "@/server/auth/sessions";
import { sessionFromUser } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";
import { preferredMode } from "@/server/auth/view-mode";
import { authenticate, getUser } from "@/server/repositories/users";
import type { Db } from "@/server/db/types";

/*
  Migration 0055 on production-shaped data: the owner's own account "ascend" (a player since 0009,
  with its profile) becomes the Owner and the only administrator again; the admin-only "adminascend"
  can no longer sign in, and what it created is credited to "ascend". The audit log keeps its history.
*/

const TAG = "0055_restore_ascend_owner";

/** A database with every migration before 0055 applied, as production is before the deploy. */
async function before0055() {
  const fresh = await createDb({ mode: "pglite-memory", migrate: false });
  const db = fresh.db;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  // One transaction per migration, as the migrator runs them (some take table locks).
  for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < TAG)) {
    await db.transaction(async (tx) => {
      for (const statement of m.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    });
  }
  return fresh;
}

const first = <T>(r: unknown): T => ((r as { rows?: T[] }).rows ?? (r as T[]))[0]!;

async function seedTeam(db: Db) {
  const team = first<{ id: string }>(await db.execute(sql`INSERT INTO teams (name) VALUES ('UNIIVERSE') RETURNING id`));
  const player = async (name: string) => first<{ id: string }>(await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group") VALUES (${team.id}, ${name}, 'MID', 'main') RETURNING id`)).id;
  return { teamId: team.id, player };
}

describe("migration 0055: ascend is the Owner again", () => {
  it("makes ascend the Owner and only administrator, credits it with the admin account's work, and locks the admin account out", async () => {
    const fresh = await before0055();
    const db = fresh.db;
    try {
      const { teamId, player } = await seedTeam(db);
      const ascendHash = await hashPassword("Ascend-pass-123");
      // As 0009 left production: ascend a player with its profile, adminascend the admin-only Owner.
      const [ascend] = await db.insert(users).values({ username: "ascend", displayName: "Ascend", passwordHash: ascendHash, role: "player", playerId: await player("Ascend"), setupCompletedAt: new Date(), isAdmin: true }).returning();
      const [admin] = await db.insert(users).values({ username: "adminascend", displayName: "adminascend", passwordHash: await hashPassword("Admin-pass-123"), role: "owner", setupCompletedAt: new Date() }).returning();
      // Another administrator, and a plain member.
      const [helper] = await db.insert(users).values({ username: "helper", displayName: "Helper", passwordHash: await hashPassword("Helper-pass-123"), role: "player", playerId: await player("Helper"), setupCompletedAt: new Date(), isAdmin: true }).returning();
      const [member] = await db.insert(users).values({ username: "member", displayName: "Member", passwordHash: await hashPassword("Member-pass-123"), role: "player", playerId: await player("Member"), setupCompletedAt: new Date() }).returning();
      const ascendSession = await createSession(db, ascend!.id);
      const adminSession = await createSession(db, admin!.id);
      await db.insert(activationCodes).values({ userId: admin!.id, codeHash: "code-for-admin", expiresAt: new Date(Date.now() + 86_400_000), createdByUserId: admin!.id });
      await db.insert(activationCodes).values({ userId: member!.id, codeHash: "code-for-member", expiresAt: new Date(Date.now() + 86_400_000), createdByUserId: admin!.id });
      // Clash scouts (the table migration 0064 drops; written here as 0055 found them).
      const scout = first<{ id: string }>(await db.execute(sql`INSERT INTO clash_scouts (team_id, opponent_name, platform, content, created_by, updated_by) VALUES (${teamId}, 'Rivals', 'oc1', '{}'::jsonb, ${admin!.id}, ${admin!.id}) RETURNING id`));
      const memberScout = first<{ id: string }>(await db.execute(sql`INSERT INTO clash_scouts (team_id, opponent_name, platform, content, created_by, updated_by) VALUES (${teamId}, 'Others', 'oc1', '{}'::jsonb, ${member!.id}, ${member!.id}) RETURNING id`));
      const [bookmark] = await db.insert(teamBookmarks).values({ teamId, riotMatchId: "OC1_1", createdByUserId: admin!.id }).returning();
      const snapshot = JSON.stringify([]);
      const assignment = JSON.stringify({});
      const draft = first<{ id: string }>(await db.execute(sql`INSERT INTO drafts (team_id, side, patch, created_by_user_id, controller_user_id, lineup_snapshot, initial_assignments, current_assignments) VALUES (${teamId}, 'blue', '0.0', ${admin!.id}, ${admin!.id}, ${snapshot}::jsonb, ${assignment}::jsonb, ${assignment}::jsonb) RETURNING id`));
      await db.insert(auditEvents).values({ actorUserId: admin!.id, actorName: "adminascend", action: "account.create", targetType: "user", targetId: member!.id, targetName: "member" });
      // The held drops of the retired tables (0062–0064) come later and have their own tests; marking
      // them applied keeps the draft and the Clash scouts here to inspect 0055's work.
      const drop = EMBEDDED_MIGRATIONS.find((m) => m.tag.endsWith("_retire_meta_trends_tables"))!;
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag >= drop.tag)) await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied).toEqual([TAG, "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public"]);

      // ascend: the Owner, with everything it had (profile, password, sessions).
      const owner = (await getUser(db, ascend!.id))!;
      expect(owner).toMatchObject({ role: "owner", isAdmin: false, isActive: true, playerId: ascend!.playerId, username: "ascend" });
      expect((await authenticate(db, "ascend", "Ascend-pass-123"))?.id).toBe(ascend!.id);
      expect(await findSession(db, ascendSession.token)).not.toBeNull();
      const session = sessionFromUser(owner);
      expect(session.admin).toBe(true);
      expect(canUseAdminArea(session)).toBe(true);
      // A player first: "/" opens Player Mode until the Owner switches.
      expect(preferredMode(undefined, session)).toBe("player");
      expect((await db.select().from(users).where(eq(users.role, "owner"))).map((u) => u.username)).toEqual(["ascend"]);

      // The only administrator: the helper's access is removed (and recorded); the member is unchanged.
      expect((await getUser(db, helper!.id))!).toMatchObject({ isAdmin: false, role: "player", isActive: true });
      expect(await authenticate(db, "helper", "Helper-pass-123")).not.toBeNull();
      expect((await getUser(db, member!.id))!).toMatchObject({ isAdmin: false, role: "player", isActive: true });
      const admins = (await db.select().from(users)).filter((u) => u.role === "owner" || u.isAdmin);
      expect(admins.map((u) => u.username)).toEqual(["ascend"]);

      // adminascend: no Owner role, no password, no sessions, no codes; it cannot sign in.
      const retired = (await getUser(db, admin!.id))!;
      expect(retired).toMatchObject({ role: "player", isAdmin: false, isActive: false, hasPassword: false });
      expect(await authenticate(db, "adminascend", "Admin-pass-123")).toBeNull();
      expect(await findSession(db, adminSession.token)).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, admin!.id))).toHaveLength(0);
      expect(await db.select().from(activationCodes).where(eq(activationCodes.userId, admin!.id))).toHaveLength(0);

      // What it created belongs to ascend; what others created is untouched.
      const scoutBy = async (scoutId: string) => first<{ created_by: string; updated_by: string }>(await db.execute(sql`SELECT created_by, updated_by FROM clash_scouts WHERE id = ${scoutId}::uuid`));
      expect(await scoutBy(scout.id)).toEqual({ created_by: ascend!.id, updated_by: ascend!.id });
      expect(await scoutBy(memberScout.id)).toEqual({ created_by: member!.id, updated_by: member!.id });
      expect(first(await db.execute(sql`SELECT created_by_user_id::text AS created, controller_user_id::text AS controller FROM drafts WHERE id = ${draft.id}::uuid`))).toEqual({ created: ascend!.id, controller: ascend!.id });
      expect((await db.select().from(teamBookmarks).where(eq(teamBookmarks.id, bookmark!.id)))[0]!.createdByUserId).toBe(ascend!.id);
      expect((await db.select().from(activationCodes).where(eq(activationCodes.userId, member!.id)))[0]!.createdByUserId).toBe(ascend!.id);

      // The audit log keeps its history and records the transfer.
      const log = await db.select().from(auditEvents).orderBy(auditEvents.id);
      expect(log[0]).toMatchObject({ actorUserId: admin!.id, actorName: "adminascend", action: "account.create" });
      const added = log.slice(1).map((e) => [e.actorName, e.action, e.targetName]);
      expect(added).toEqual([
        ["migration 0055", "account.admin-revoke", "helper"],
        ["migration 0055", "account.role", "ascend"],
        ["migration 0055", "account.role", "adminascend"],
        ["migration 0055", "account.deactivate", "adminascend"],
      ]);
      expect(log.slice(1).every((e) => e.actorUserId === null)).toBe(true);

      // Once applied, it never runs again.
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([]);
    } finally {
      await fresh.close();
    }
  });

  it("changes nothing on a deployment without that pair of accounts", async () => {
    const fresh = await before0055();
    const db = fresh.db;
    try {
      const { player } = await seedTeam(db);
      // An Owner of another deployment, an "ascend" without a profile, and an administrator.
      const [owner] = await db.insert(users).values({ username: "boss", displayName: "Boss", passwordHash: await hashPassword("Boss-pass-1234"), role: "owner", setupCompletedAt: new Date() }).returning();
      const [ascend] = await db.insert(users).values({ username: "ascend", displayName: "Ascend", passwordHash: await hashPassword("Ascend-pass-123"), role: "player", setupCompletedAt: new Date() }).returning();
      const [helper] = await db.insert(users).values({ username: "helper", displayName: "Helper", passwordHash: await hashPassword("Helper-pass-123"), role: "player", playerId: await player("Helper"), setupCompletedAt: new Date(), isAdmin: true }).returning();
      const beforeRows = await db.select().from(users).orderBy(users.username);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([TAG, "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public", "0062_retire_meta_trends_tables", "0063_retire_draft_tables", "0064_retire_clash_scouts", "0065_rank_confirmations"]);
      expect(await db.select().from(users).orderBy(users.username)).toEqual(beforeRows);
      expect((await getUser(db, owner!.id))!.role).toBe("owner");
      expect((await getUser(db, ascend!.id))!.role).toBe("player");
      expect((await getUser(db, helper!.id))!.isAdmin).toBe(true);
      expect(await db.select().from(auditEvents)).toHaveLength(0);
    } finally {
      await fresh.close();
    }
  });

  it("changes nothing when ascend has no player profile or no password, so the Owner never moves to an account that cannot use it", async () => {
    for (const ascendValues of [{ playerId: null, passwordHash: "set" }, { playerId: "set", passwordHash: null }, { playerId: "set", passwordHash: "set", isActive: false }] as const) {
      const fresh = await before0055();
      const db = fresh.db;
      try {
        const { player } = await seedTeam(db);
        await db.insert(users).values({
          username: "ascend",
          displayName: "Ascend",
          role: "player",
          setupCompletedAt: new Date(),
          playerId: ascendValues.playerId ? await player("Ascend") : null,
          passwordHash: ascendValues.passwordHash ? await hashPassword("Ascend-pass-123") : null,
          isActive: "isActive" in ascendValues ? ascendValues.isActive : true,
        });
        const [admin] = await db.insert(users).values({ username: "adminascend", displayName: "adminascend", passwordHash: await hashPassword("Admin-pass-123"), role: "owner", setupCompletedAt: new Date() }).returning();
        const adminSession = await createSession(db, admin!.id);
        expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([TAG, "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public", "0062_retire_meta_trends_tables", "0063_retire_draft_tables", "0064_retire_clash_scouts", "0065_rank_confirmations"]);
        expect((await getUser(db, admin!.id))!).toMatchObject({ role: "owner", isActive: true, hasPassword: true });
        expect(await findSession(db, adminSession.token)).not.toBeNull();
        expect((await db.select().from(users).where(eq(users.role, "owner"))).map((u) => u.username)).toEqual(["adminascend"]);
      } finally {
        await fresh.close();
      }
    }
  });
});
