import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  PUBLIC / GUEST VIEW, Release A: what a visitor without an account can receive.
  - The public pages are off until an admin turns them on; only an explicit `true` is on.
  - A member appears only by their own choice (public profile + a public name), and only while on
    the team, not archived, set up and active. Everyone else holding a role is a placeholder with
    no name, picture or id.
  - No rank, statistic, Riot ID, sign-in username or lineup-management list reaches the public data.
  - Only the member can change their choice; the admin switch never changes it.
  - Public pictures follow the same consent, and are refused while the pages are off (except to
    signed-in members previewing them).
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as Session | null }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => {
  const notAllowed = (message: string) => Object.assign(new Error(message), { name: "NotAuthorizedError" });
  return {
    ...(await orig<object>()),
    getSession: async () => state.session,
    getAuthState: async () => ({ mode: "accounts", session: state.session }),
    requireSession: async () => {
      if (!state.session) throw notAllowed("Please sign in.");
      return state.session;
    },
    requireOwner: async () => {
      if (state.session?.role !== "owner") throw notAllowed("Only an admin can do that.");
      return state.session;
    },
  };
});

import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, appSettings, patches, players, riotAccounts, userAvatars, users } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { getPublicAccess, publicRiotDataAllowed, setPublicAccess } from "@/server/public/access";
import { getPublicProfile, listPublicProfileMembers, loadPublicTeam, publicMemberUser } from "@/server/public/team";
import { publicImageOwner } from "@/server/public/image-response";
import { setMyPublicProfileAction, setPublicAccessAction } from "@/server/actions/public-access";
import { GET as publicAvatar } from "@/app/api/public/avatars/[playerId]/route";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const userIds: Record<string, string> = {};

const memberSession = (name: string): Session => ({ userId: userIds[name]!, label: name, username: `${name}_login`, hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId: ids[name]!, capabilities: [...STANDARD_PLAYER], teamMember: true });
const ownerSession = (): Session => ({ userId: userIds.owner!, label: "Owner", username: "owner_login", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "owner", playerId: null, capabilities: [], teamMember: true });

const ROLES = [
  ["top", "TOP", "Riven"],
  ["jungle", "JUNGLE", "Viego"],
  ["mid", "MID", "Ahri"],
  ["bot", "ADC", "Jinx"],
  ["support", "SUPPORT", "Thresh"],
] as const;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  teamId = (await getOrCreateTeam(db)).id;
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") });
  const [owner] = await db.insert(users).values({ username: "owner_login", displayName: "Owner", role: "owner", setupCompletedAt: new Date() }).returning();
  userIds.owner = owner!.id;
  for (const [name, role, championId] of ROLES) {
    const id = (await createPlayer(db, teamId, { displayName: `${name}_login`, primaryRole: role, primaryPool: [championId] })).id;
    ids[name] = id;
    const [user] = await db.insert(users).values({ username: `${name}_login`, displayName: `${name}_login`, role: "player", playerId: id, setupCompletedAt: new Date(), avatarVersion: 3 }).returning();
    userIds[name] = user!.id;
    await db.insert(userAvatars).values({ userId: user!.id, contentType: "image/webp", data: Buffer.from(`avatar-${name}`) });
    await setLineupSlot(db, teamId, role, id);
    const account = await addAccount(db, { ownerType: "player", playerId: id, riotId: `${name}Riot#OCE`, platform: "oc1" });
    await db.update(riotAccounts).set({ tier: "GOLD", division: "II", leaguePoints: 64, rankQueue: "solo" }).where(eq(riotAccounts.id, account.id));
    await db.insert(accountChampionHistory).values({ accountId: account.id, championId, role, queueGroup: "solo", patch: "16.20", games: 140, wins: 80, lastPlayedAt: new Date() });
    await db.insert(accountMatches).values(Array.from({ length: 4 }, (_, i) => ({ accountId: account.id, matchId: `OC1_${name}${i}`, gameCreation: Date.now() - i * 3_600_000, queueId: 420, championId, role, win: i % 2 === 0, patch: "16.20", kills: 7, deaths: 3, assists: 6, cs: 210, damage: 21000, visionScore: 23, gameDuration: 1800 })));
  }
  invalidateProficiencyCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

/** Everything the public Team Overview would send to the browser. */
const sent = async () => JSON.stringify(await loadPublicTeam(handle.db, teamId));

describe("the team-wide switch", () => {
  it("is off by default, and only an explicit true turns it on", async () => {
    expect(await getPublicAccess(handle.db)).toEqual({ enabled: false });
    await handle.db.insert(appSettings).values({ key: "public_access", value: { enabled: "true" } as never, updatedAt: new Date() });
    expect(await getPublicAccess(handle.db)).toEqual({ enabled: false });
    await setPublicAccess(handle.db, true);
    expect(await getPublicAccess(handle.db)).toEqual({ enabled: true });
    await setPublicAccess(handle.db, false);
    expect(await getPublicAccess(handle.db)).toEqual({ enabled: false });
  });

  it("only the Owner can change it", async () => {
    state.session = memberSession("top");
    expect(await setPublicAccessAction(true)).toMatchObject({ ok: false });
    state.session = null;
    expect(await setPublicAccessAction(true)).toMatchObject({ ok: false });
    expect((await getPublicAccess(handle.db)).enabled).toBe(false);
    state.session = ownerSession();
    expect(await setPublicAccessAction(true)).toMatchObject({ ok: true });
    expect((await getPublicAccess(handle.db)).enabled).toBe(true);
  });

  it("turning it on makes nobody public: every role is a placeholder until members choose", async () => {
    const view = await loadPublicTeam(handle.db, teamId);
    expect(view.slots).toHaveLength(5);
    for (const slot of view.slots) {
      expect(slot).toMatchObject({ player: null, champions: [], candidates: [], waiting: [], suggestions: [], privateMember: true });
    }
    const json = await sent();
    for (const [name] of ROLES) {
      expect(json).not.toContain(name + "_login");
      expect(json).not.toContain(ids[name]);
    }
    expect(json).not.toMatch(/GOLD|Riot#OCE|"games":[1-9]/);
  });

  it("Riot-derived figures stay off the public pages unless the deployment allows them", () => {
    expect(publicRiotDataAllowed({})).toBe(false);
    expect(publicRiotDataAllowed({ UNIIVERSE_PUBLIC_RIOT_DATA: "yes" })).toBe(false);
    expect(publicRiotDataAllowed({ UNIIVERSE_PUBLIC_RIOT_DATA: "true" })).toBe(true);
  });
});

describe("a member's own consent", () => {
  it("needs a valid public name to turn on, and changes only the member's own profile", async () => {
    state.session = memberSession("top");
    expect(await setMyPublicProfileAction({ on: true, name: " " })).toMatchObject({ ok: false });
    expect(await setMyPublicProfileAction({ on: true, name: "<b>x</b>" })).toMatchObject({ ok: false });
    expect((await getPublicProfile(handle.db, ids.top!)).on).toBe(false);
    // The action takes no player id: extra fields cannot point it at someone else.
    expect(await setMyPublicProfileAction({ on: true, name: "Top Public", playerId: ids.mid } as never)).toMatchObject({ ok: true });
    expect(await getPublicProfile(handle.db, ids.top!)).toEqual({ on: true, name: "Top Public" });
    expect((await getPublicProfile(handle.db, ids.mid!)).on).toBe(false);
  });

  it("the Owner's account has no profile to make public, and cannot change a member's", async () => {
    state.session = ownerSession();
    expect(await setMyPublicProfileAction({ on: true, name: "Owner Public" })).toMatchObject({ ok: false });
    state.session = null;
    expect(await setMyPublicProfileAction({ on: false, name: "" })).toMatchObject({ ok: false });
    expect((await getPublicProfile(handle.db, ids.top!)).on).toBe(true);
  });

  it("a consenting member appears with an allowlisted card: public name, picture, roles and pool, no figures", async () => {
    const view = await loadPublicTeam(handle.db, teamId);
    const top = view.slots.find((s) => s.role === "TOP")!;
    expect(top.privateMember).toBeUndefined();
    expect(top.player).toMatchObject({ id: ids.top, name: "Top Public", avatarUrl: `/api/public/avatars/${ids.top}?v=3`, rank: null, season: null, rankChange: null, statsVisible: false, poolIds: [] });
    // The allowlist itself: a field added to the members' roster never reaches the public data unnoticed.
    expect(Object.keys(top.player!).sort()).toEqual(["art", "avatarUrl", "cardAccent", "id", "look", "name", "partial", "poolIds", "poolSlot", "primaryRole", "profile", "profileRole", "rank", "rankChange", "season", "seasonLabel", "statsVisible", "substitute", "version"]);
    expect(Object.keys(top.player!.profile).sort()).toEqual(["additionalRoles", "primaryPool", "primaryRole", "secondaryPool", "secondaryRole"]);
    expect(top.champions.map((c) => c.championId)).toEqual(["Riven"]);
    expect(top.champions[0]).toMatchObject({ games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, csPerMinute: null, masteryPoints: null, tierLabel: "" });
    // Still nothing of anyone's sign-in name, Riot account, rank or record anywhere.
    const json = await sent();
    expect(json).not.toMatch(/_login|Riot#OCE|GOLD|"games":[1-9]|"wins":[1-9]|\/api\/avatars\//);
    // The other four are still placeholders.
    expect(view.slots.filter((s) => s.privateMember)).toHaveLength(4);
  });

  it("disappears again when archived, off the team, deactivated, not set up, or without a public name", async () => {
    const db = handle.db;
    const visible = async () => (await loadPublicTeam(db, teamId)).slots.some((s) => s.player?.id === ids.top);
    expect(await visible()).toBe(true);
    for (const [hide, restore] of [
      [() => db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, ids.top!)), () => db.update(players).set({ archivedAt: null }).where(eq(players.id, ids.top!))],
      [() => db.update(players).set({ teamMember: false }).where(eq(players.id, ids.top!)), () => db.update(players).set({ teamMember: true }).where(eq(players.id, ids.top!))],
      [() => db.update(users).set({ isActive: false }).where(eq(users.id, userIds.top!)), () => db.update(users).set({ isActive: true }).where(eq(users.id, userIds.top!))],
      [() => db.update(users).set({ setupCompletedAt: null }).where(eq(users.id, userIds.top!)), () => db.update(users).set({ setupCompletedAt: new Date() }).where(eq(users.id, userIds.top!))],
      [() => db.update(players).set({ publicName: null }).where(eq(players.id, ids.top!)), () => db.update(players).set({ publicName: "Top Public" }).where(eq(players.id, ids.top!))],
    ] as const) {
      await hide();
      expect(await visible()).toBe(false);
      expect(await publicMemberUser(db, ids.top!)).toBeNull();
      await restore();
      expect(await visible()).toBe(true);
    }
  });

  it("Admin → Public Access lists who chose to appear, by public name only", async () => {
    expect(await listPublicProfileMembers(handle.db, teamId)).toEqual({ total: 5, members: [{ id: ids.top, name: "Top Public" }] });
  });

  it("turning it off hides the member again", async () => {
    state.session = memberSession("top");
    expect(await setMyPublicProfileAction({ on: false, name: "Top Public" })).toMatchObject({ ok: true });
    expect((await loadPublicTeam(handle.db, teamId)).slots.every((s) => s.player === null)).toBe(true);
    // The name is kept for next time, but nothing is public.
    expect(await getPublicProfile(handle.db, ids.top!)).toEqual({ on: false, name: "Top Public" });
  });
});

describe("public pictures", () => {
  const fetchAvatar = (playerId: string) => publicAvatar(new Request(`http://local/api/public/avatars/${playerId}?v=3`), { params: Promise.resolve({ playerId }) });

  it("are served only for consenting members, never cached by shared caches", async () => {
    state.session = memberSession("mid");
    expect(await setMyPublicProfileAction({ on: true, name: "Mid Public" })).toMatchObject({ ok: true });
    await setPublicAccess(handle.db, true);
    state.session = null;
    const ok = await fetchAvatar(ids.mid!);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe("avatar-mid");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=300");
    // A member who did not choose to appear: the same answer as an id that does not exist.
    expect((await fetchAvatar(ids.jungle!)).status).toBe(404);
    expect((await fetchAvatar("not-a-uuid")).status).toBe(404);
    expect((await fetchAvatar(userIds.mid!)).status).toBe(404);
  });

  it("are refused to visitors while the public pages are off, and still shown to signed-in members previewing them", async () => {
    await setPublicAccess(handle.db, false);
    state.session = null;
    expect((await fetchAvatar(ids.mid!)).status).toBe(404);
    expect(await publicImageOwner(handle.db, ids.mid!)).toBeNull();
    state.session = memberSession("jungle");
    expect((await fetchAvatar(ids.mid!)).status).toBe(200);
    // Signed in or not, a member who did not consent is never served here.
    expect((await fetchAvatar(ids.jungle!)).status).toBe(404);
  });
});
