import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { authenticate, createUser, getUser, updateUser, UserError } from "@/server/repositories/users";
import { explainLoginFailure, listOwnerAccounts, recoverOwnerAccount, setupKeyConfigured, verifySetupKey } from "@/server/auth/recovery";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("owner recovery", () => {
  it("verifies the setup key in constant time and only when configured", () => {
    expect(setupKeyConfigured({})).toBe(false);
    expect(verifySetupKey("anything", {})).toBe(false);
    const env = { UNIIVERSE_ACCESS_PASSWORD: "  correct-horse-battery  " };
    expect(setupKeyConfigured(env)).toBe(true);
    expect(verifySetupKey("correct-horse-battery", env)).toBe(true);
    expect(verifySetupKey(" correct-horse-battery ", env)).toBe(true);
    expect(verifySetupKey("correct-horse-batter", env)).toBe(false);
    expect(verifySetupKey("", env)).toBe(false);
  });

  it("lists only owner accounts, renames the owner without touching the password, and reactivates", async () => {
    const db = handle.db;
    const owner = await createUser(db, { username: "Ascend", password: "Owner-secret-1", role: "owner", displayName: "Ascend" });
    await createUser(db, { username: "CoachKim", password: "Coach-secret-1", role: "coach" });
    const owners = await listOwnerAccounts(db);
    expect(owners.map((o) => o.username)).toEqual(["Ascend"]);
    expect(owners[0]).toMatchObject({ hasPassword: true, hasPlayer: false, isActive: true });
    const [before] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, owner.id));

    // Rename only: the password hash is byte-for-byte the same and still signs in.
    const renamed = await recoverOwnerAccount(db, { ownerId: owner.id, username: "AscendMCMXCIX" });
    expect(renamed.username).toBe("AscendMCMXCIX");
    expect(renamed.role).toBe("owner");
    const [after] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, owner.id));
    expect(after!.hash).toBe(before!.hash);
    expect((await authenticate(db, "ascendmcmxcix", "Owner-secret-1"))?.id).toBe(owner.id);
    expect(await authenticate(db, "Ascend", "Owner-secret-1")).toBeNull();

    // Nothing given: nothing changes (the owner just signs in with what they have).
    const same = await recoverOwnerAccount(db, { ownerId: owner.id, username: "", password: "" });
    expect(same.username).toBe("AscendMCMXCIX");

    // A new password replaces the old one.
    await recoverOwnerAccount(db, { ownerId: owner.id, password: "New-owner-secret-2" });
    expect(await authenticate(db, "AscendMCMXCIX", "Owner-secret-1")).toBeNull();
    expect((await authenticate(db, "AscendMCMXCIX", "New-owner-secret-2"))?.id).toBe(owner.id);

    // A deactivated owner is reactivated; a taken or invalid username is refused; non-owners are refused.
    await updateUser(db, owner.id, { isActive: false });
    expect(await authenticate(db, "AscendMCMXCIX", "New-owner-secret-2")).toBeNull();
    await recoverOwnerAccount(db, { ownerId: owner.id });
    expect((await getUser(db, owner.id))?.isActive).toBe(true);
    await expect(recoverOwnerAccount(db, { ownerId: owner.id, username: "coachkim" })).rejects.toBeInstanceOf(UserError);
    await expect(recoverOwnerAccount(db, { ownerId: owner.id, username: "x" })).rejects.toBeInstanceOf(UserError);
    await expect(recoverOwnerAccount(db, { ownerId: owner.id, password: "short" })).rejects.toBeInstanceOf(UserError);
    const coach = (await listOwnerAccountsAll(db)).find((u) => u.username === "CoachKim")!;
    await expect(recoverOwnerAccount(db, { ownerId: coach.id, username: "Hacker" })).rejects.toBeInstanceOf(UserError);
    // Still exactly one owner: recovery never creates accounts.
    expect((await listOwnerAccounts(db)).length).toBe(1);
  });

  it("requires a password for an owner account that has none", async () => {
    const db = handle.db;
    const owner2 = await createUser(db, { username: "SecondOwner", role: "owner" });
    await expect(recoverOwnerAccount(db, { ownerId: owner2.id })).rejects.toThrow(/no password yet/);
    await recoverOwnerAccount(db, { ownerId: owner2.id, password: "Second-owner-1" });
    expect((await authenticate(db, "secondowner", "Second-owner-1"))?.id).toBe(owner2.id);
  });

  it("tells an email-typing user what the username is likely to be", () => {
    expect(explainLoginFailure("owner@example.com")).toMatch(/not an email/i);
    expect(explainLoginFailure("owner@example.com")).toMatch(/former display name/);
    expect(explainLoginFailure("Ascend")).toMatch(/not recognised/);
  });
});

async function listOwnerAccountsAll(db: DbHandle["db"]) {
  const { listUsers } = await import("@/server/repositories/users");
  return listUsers(db);
}
