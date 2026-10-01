import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { acceptInvite, acceptInviteAsExistingUser, authenticate, createInvite, createUser, getValidInvite, listUsers, UserError } from "@/server/repositories/users";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { canEditPlayer, hasPermission, type Session } from "@/server/auth/permissions";
import { hashPassword, verifyPassword } from "@/server/auth/password";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("accounts and invites", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse 1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("creates the owner, authenticates, and rejects duplicate emails", async () => {
    const owner = await createUser(handle.db, { email: "Owner@Example.com", displayName: "Owner", password: "password123", role: "owner" });
    expect(owner.email).toBe("owner@example.com");
    expect(await authenticate(handle.db, "owner@example.com", "password123")).not.toBeNull();
    expect(await authenticate(handle.db, "owner@example.com", "nope")).toBeNull();
    await expect(createUser(handle.db, { email: "owner@example.com", displayName: "Dup", password: "password123", role: "player" })).rejects.toBeInstanceOf(UserError);
  });

  it("lets a teammate claim an existing player profile through an invite without creating a duplicate", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Mid Main", primaryRole: "MID", primaryPool: [] }, team.poolLimits);
    const invite = await createInvite(db, { role: "player", playerId: player.id, createdByUserId: null });
    expect(await getValidInvite(db, invite.token)).not.toBeNull();
    const user = await acceptInvite(db, invite.token, { email: "mid@example.com", displayName: "Mid", password: "password123" });
    expect(user.playerId).toBe(player.id);
    expect(user.role).toBe("player");
    // The invite is single-use and the profile cannot be claimed twice.
    expect(await getValidInvite(db, invite.token)).toBeNull();
    await expect(createInvite(db, { role: "player", playerId: player.id, createdByUserId: null })).rejects.toBeInstanceOf(UserError);
    expect((await listUsers(db)).filter((u) => u.playerId === player.id)).toHaveLength(1);
  });

  it("links an invite to an existing signed-in account", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Top Main", primaryRole: "TOP", primaryPool: [] }, team.poolLimits);
    const existing = await createUser(db, { email: "top@example.com", displayName: "Top", password: "password123", role: "player" });
    const invite = await createInvite(db, { role: "player", playerId: player.id, createdByUserId: null });
    await acceptInviteAsExistingUser(db, invite.token, existing.id);
    const users = await listUsers(db);
    expect(users.find((u) => u.id === existing.id)?.playerId).toBe(player.id);
  });
});

describe("permissions", () => {
  const owner: Session = { userId: "u1", role: "owner", label: "O", playerId: null, email: "o@x" };
  const coach: Session = { userId: "u2", role: "coach", label: "C", playerId: null, email: "c@x" };
  const player: Session = { userId: "u3", role: "player", label: "P", playerId: "p-mine", email: "p@x" };

  it("lets players edit only their own profile", () => {
    expect(canEditPlayer(player, "p-mine")).toBe(true);
    expect(canEditPlayer(player, "p-other")).toBe(false);
    expect(canEditPlayer(coach, "p-other")).toBe(true);
    expect(canEditPlayer(owner, "p-other")).toBe(true);
    expect(canEditPlayer(null, "p-mine")).toBe(false);
  });

  it("keeps management rights with the owner and draft control with coaches", () => {
    expect(hasPermission(owner, "manage-users")).toBe(true);
    expect(hasPermission(coach, "manage-users")).toBe(false);
    expect(hasPermission(coach, "control-draft")).toBe(true);
    expect(hasPermission(player, "control-draft")).toBe(false);
    expect(hasPermission(player, "view-analysis")).toBe(true);
  });
});
