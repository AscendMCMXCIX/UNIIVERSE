import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { riotAccounts, users as usersTable } from "@/server/db/schema";
import { completePlayerSetup, createPlayerAccount, registerAccount } from "@/server/auth/signup";
import { sessionFromUser } from "@/server/auth/session";
import { authenticate, consumeInvite, getUser, getValidInvite, listInvites, listInvitesForUser, reissueAccountInvite, UserError } from "@/server/repositories/users";
import { getPlayer } from "@/server/repositories/team";
import { hasPermission } from "@/server/auth/permissions";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("admin-created accounts", () => {
  it("creates the user, the player profile and the primary Riot account from a username and a Riot ID, with an invite bound to the account and no email anywhere", async () => {
    const db = handle.db;
    const created = await createPlayerAccount(db, { username: "Rufy", riotId: "Rufy Mid#OCE", createdByUserId: null });
    expect(created.user.username).toBe("Rufy");
    expect(created.user.role).toBe("player");
    expect(created.user.hasPassword).toBe(false);
    expect(created.user.setupCompletedAt).toBeNull();
    expect(created.user.playerId).toBe(created.playerId);
    const player = await getPlayer(db, created.playerId);
    expect(player?.displayName).toBe("Rufy");
    expect(player?.riotId).toBe("Rufy Mid#OCE");
    expect(player?.group).toBe("main");
    const accounts = await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, created.playerId));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ gameName: "Rufy Mid", tagLine: "OCE", label: "main", syncStatus: "never" });
    expect(created.invite.userId).toBe(created.user.id);
    expect(created.invite.playerId).toBe(created.playerId);
    expect(created.invite.username).toBe("Rufy");
    // The invite resolves by token and belongs to exactly this account.
    const byToken = await getValidInvite(db, created.invite.token);
    expect(byToken?.userId).toBe(created.user.id);
    expect((await listInvitesForUser(db, created.user.id)).map((i) => i.id)).toEqual([created.invite.id]);
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, created.user.id));
    expect(Object.keys(row!)).not.toContain("email");
    // Before setup the session says so, and the account has no competitive or admin rights.
    const session = sessionFromUser(created.user);
    expect(session.setupComplete).toBe(false);
    expect(hasPermission(session, "manage-lineup")).toBe(false);
    expect(hasPermission(session, "manage-users")).toBe(false);
  });

  it("rejects a taken username or a Riot ID that belongs to another player, leaving nothing behind", async () => {
    const db = handle.db;
    await expect(createPlayerAccount(db, { username: "rufy", riotId: "Someone Else#OCE", createdByUserId: null })).rejects.toThrow(/already taken/);
    await expect(createPlayerAccount(db, { username: "Another", riotId: "Rufy Mid#OCE", createdByUserId: null })).rejects.toThrow(/already linked/);
    await expect(createPlayerAccount(db, { username: "Another", riotId: "no-tag", createdByUserId: null })).rejects.toThrow(/Riot ID/);
    expect(await db.select().from(usersTable).where(eq(usersTable.username, "Another"))).toHaveLength(0);
  });

  it("first login completes roles, pools and password without re-entering anything, consumes the invite and keeps everything linked", async () => {
    const db = handle.db;
    const created = await createPlayerAccount(db, { username: "Ascend", riotId: "AscendMCMXCIX#OCE", createdByUserId: null });
    const invite = (await getValidInvite(db, created.invite.token))!;
    await expect(completePlayerSetup(db, invite.userId!, { primaryRole: "TOP", secondaryRole: "TOP", primaryPool: ["Riven"], password: "topside-2026" })).rejects.toThrow(/differ/);
    await expect(completePlayerSetup(db, invite.userId!, { primaryRole: "TOP", primaryPool: ["Riven"], password: "short" })).rejects.toThrow(/10 characters/);
    await expect(completePlayerSetup(db, invite.userId!, { primaryRole: "TOP", primaryPool: ["Riven", "Gwen", "Ambessa", "Aatrox", "Camille", "Jax", "Sion"], password: "topside-2026" })).rejects.toThrow();
    const user = await completePlayerSetup(db, invite.userId!, { primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven", "Gwen", "Ambessa"], secondaryPool: ["Syndra"], password: "topside-2026" });
    expect(user.setupCompletedAt).toBeInstanceOf(Date);
    expect(user.hasPassword).toBe(true);
    expect(user.playerId).toBe(created.playerId);
    const player = await getPlayer(db, created.playerId);
    expect(player).toMatchObject({ primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven", "Gwen", "Ambessa"], secondaryPool: ["Syndra"], riotId: "AscendMCMXCIX#OCE", displayName: "Ascend" });
    expect(await consumeInvite(db, invite.id, user.id)).toBe(true);
    expect(await getValidInvite(db, created.invite.token)).toBeNull();
    expect(await authenticate(db, "Ascend", "topside-2026")).toMatchObject({ id: user.id });
    expect(await authenticate(db, "Ascend", "wrong-password-1")).toBeNull();
    expect(sessionFromUser(user).setupComplete).toBe(true);
    // The Riot account survived untouched and is still linked to the same profile.
    const accounts = await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, created.playerId));
    expect(accounts.map((a) => `${a.gameName}#${a.tagLine}`)).toEqual(["AscendMCMXCIX#OCE"]);
  });

  it("reissues an invite only for accounts that have not finished setup, and older links stop working", async () => {
    const db = handle.db;
    const created = await createPlayerAccount(db, { username: "Lost Link", riotId: "Lost Link#OCE", createdByUserId: null });
    const fresh = await reissueAccountInvite(db, created.user.id, null);
    expect(fresh.userId).toBe(created.user.id);
    expect(await getValidInvite(db, created.invite.token)).toBeNull();
    expect((await getValidInvite(db, fresh.token))?.userId).toBe(created.user.id);
    await completePlayerSetup(db, created.user.id, { primaryRole: "JUNGLE", primaryPool: ["Viego"], password: "jungle-gap-2026" });
    await expect(reissueAccountInvite(db, created.user.id, null)).rejects.toBeInstanceOf(UserError);
    expect((await listInvites(db)).some((i) => i.userId === created.user.id)).toBe(true);
  });

  it("does not let anyone register without a valid invite", async () => {
    const db = handle.db;
    await expect(registerAccount(db, { username: "Stranger", role: "player", primaryRiot: { riotId: "Stranger#OCE", platform: "oc1" }, primaryRole: "ADC", inviteToken: "not-a-real-token" })).rejects.toThrow(/invalid, used or expired/);
    expect(await getUser(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await db.select().from(usersTable).where(eq(usersTable.username, "Stranger"))).toHaveLength(0);
  });
});
