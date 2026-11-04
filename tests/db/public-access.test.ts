import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  PUBLIC TEAM PAGE: what a visitor without an account can receive.
  - Always available: no site switch, no per-member opt-in.
  - The lineup's players and each role's designated substitute appear, under their display name,
    while on the team, not archived and (with a sign-in account) active. Nobody else on the team
    is named or sent.
  - No rank, statistic, Riot ID, sign-in username or lineup-management list reaches the public data.
  - Public pictures follow the same rule, for anyone, signed in or not.
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
import { accountChampionHistory, accountMatches, patches, players, riotAccounts, userAvatars, users } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot, setLineupSubstitute } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { publicRiotDataAllowed } from "@/server/public/access";
import { invalidatePublicTeam, loadPublicTeam, publicMemberUser, toPublicSlot } from "@/server/public/team";
import { getTeamRoster } from "@/server/team/roster";
import { loadPublicLeaderboardData } from "@/server/public/leaderboards";
import { buildRecentLeaderboardView } from "@/server/leaderboards/recent-view";
import { publicImageOwner } from "@/server/public/image-response";
import { GET as publicAvatar } from "@/app/api/public/avatars/[playerId]/route";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import type { SocialLinks } from "@/domain/social-links";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const userIds: Record<string, string> = {};

const memberSession = (name: string): Session => ({ userId: userIds[name]!, label: name, username: `${name}_login`, hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId: ids[name]!, capabilities: [...STANDARD_PLAYER], teamMember: true });

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
    const id = (await createPlayer(db, teamId, { displayName: `${name[0]!.toUpperCase()}${name.slice(1)} Shown`, primaryRole: role, primaryPool: [championId] })).id;
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
  // Two bench members who play Top: one becomes the designated substitute, the other is never public.
  for (const name of ["benchsub", "benchother"]) {
    const id = (await createPlayer(db, teamId, { displayName: `${name} Shown`, primaryRole: "TOP", primaryPool: ["Riven"] })).id;
    ids[name] = id;
    const [user] = await db.insert(users).values({ username: `${name}_login`, displayName: `${name} Shown`, role: "player", playerId: id, setupCompletedAt: new Date(), avatarVersion: 2 }).returning();
    userIds[name] = user!.id;
    await db.insert(userAvatars).values({ userId: user!.id, contentType: "image/webp", data: Buffer.from(`avatar-${name}`) });
  }
  await setLineupSubstitute(db, teamId, "TOP", ids.benchsub!);
  invalidateProficiencyCache();
  invalidatePublicTeam();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

/** Everything the public Team Overview would send to the browser (read fresh, past this instance's one-minute copy). */
const sent = async () => {
  invalidatePublicTeam();
  return JSON.stringify(await loadPublicTeam(handle.db, teamId));
};
const fresh = () => {
  invalidatePublicTeam();
  return loadPublicTeam(handle.db, teamId);
};

describe("the public team page", () => {
  it("shows every lineup player by display name, with an allowlisted card: picture, roles and pool, no figures", async () => {
    const view = await fresh();
    expect(view.slots).toHaveLength(5);
    for (const [name, role] of ROLES) {
      const slot = view.slots.find((s) => s.role === role)!;
      expect(slot.privateMember).toBeUndefined();
      expect(slot.player).toMatchObject({ id: ids[name], name: `${name[0]!.toUpperCase()}${name.slice(1)} Shown`, avatarUrl: `/api/public/avatars/${ids[name]}?v=3`, rank: null, season: null, rankChange: null, statsVisible: false, poolIds: [] });
      expect(slot).toMatchObject({ candidates: [], waiting: [], suggestions: [], substituteCandidates: [] });
    }
    const top = view.slots.find((s) => s.role === "TOP")!;
    // The allowlist itself: a field added to the members' roster never reaches the public data unnoticed.
    expect(Object.keys(top.player!).sort()).toEqual(["art", "avatarUrl", "cardAccent", "id", "look", "name", "partial", "poolIds", "poolSlot", "primaryRole", "profile", "profileRole", "rank", "rankChange", "season", "seasonLabel", "social", "statsVisible", "substitute", "version"]);
    expect(Object.keys(top.player!.profile).sort()).toEqual(["additionalRoles", "primaryPool", "primaryRole", "secondaryPool", "secondaryRole"]);
    expect(top.champions.map((c) => c.championId)).toEqual(["Riven"]);
    expect(top.champions[0]).toMatchObject({ games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, csPerMinute: null, masteryPoints: null, tierLabel: "" });
  });

  it("shows a role's designated substitute on the back of its card, built the same way", async () => {
    const top = (await fresh()).slots.find((s) => s.role === "TOP")!;
    expect(top.substitute?.player).toMatchObject({ id: ids.benchsub, name: "benchsub Shown", avatarUrl: `/api/public/avatars/${ids.benchsub}?v=2`, rank: null, season: null, statsVisible: false });
    expect(Object.keys(top.substitute!.player).sort()).toEqual(Object.keys(top.player!).sort());
    // Other roles have no substitute, so no back.
    expect((await fresh()).slots.filter((s) => s.substitute)).toHaveLength(1);
  });

  it("never sends a username, Riot ID, rank, record, private picture route, or anyone outside the lineup and its substitutes", async () => {
    const json = await sent();
    expect(json).not.toMatch(/_login|Riot#OCE|GOLD|"games":[1-9]|"wins":[1-9]|\/api\/avatars\//);
    expect(json).not.toContain(ids.benchother);
    expect(json).not.toContain("benchother");
    for (const id of Object.values(userIds)) expect(json).not.toContain(id);
  });

  it("a player who is archived, off the team or deactivated becomes a nameless placeholder", async () => {
    const db = handle.db;
    const visible = async () => (await fresh()).slots.some((s) => s.player?.id === ids.top);
    expect(await visible()).toBe(true);
    for (const [hide, restore] of [
      [() => db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, ids.top!)), () => db.update(players).set({ archivedAt: null }).where(eq(players.id, ids.top!))],
      [() => db.update(players).set({ teamMember: false }).where(eq(players.id, ids.top!)), () => db.update(players).set({ teamMember: true }).where(eq(players.id, ids.top!))],
      [() => db.update(users).set({ isActive: false }).where(eq(users.id, userIds.top!)), () => db.update(users).set({ isActive: true }).where(eq(users.id, userIds.top!))],
    ] as const) {
      await hide();
      expect(await visible()).toBe(false);
      const slot = (await fresh()).slots.find((s) => s.role === "TOP")!;
      // An empty role, or a placeholder for a player who may not appear: no name, picture or id either way.
      expect(slot).toMatchObject({ player: null, champions: [] });
      expect(await sent()).not.toContain(ids.top);
      expect(await publicMemberUser(db, teamId, ids.top!)).toBeNull();
      await restore();
      expect(await visible()).toBe(true);
    }
  });

  it("Riot-derived figures stay off the public pages unless the deployment allows them", () => {
    expect(publicRiotDataAllowed({})).toBe(false);
    expect(publicRiotDataAllowed({ UNIIVERSE_PUBLIC_RIOT_DATA: "yes" })).toBe(false);
    expect(publicRiotDataAllowed({ UNIIVERSE_PUBLIC_RIOT_DATA: "true" })).toBe(true);
  });
});

describe("where the deployment allows Riot data on the public pages", () => {
  const withFigures = () => {
    invalidatePublicTeam();
    return loadPublicTeam(handle.db, teamId, true);
  };

  it("the cards carry the figures members see, through the same allowlist, without the ladder change", async () => {
    const view = await withFigures();
    const plain = await fresh();
    for (const [name, role] of ROLES) {
      const slot = view.slots.find((s) => s.role === role)!;
      expect(slot.player).toMatchObject({ id: ids[name], rank: { tier: "GOLD", division: "II", leaguePoints: 64, queue: "solo" }, statsVisible: true, rankChange: null, poolIds: [], version: "" });
      // This season in the lineup role: the four stored games, two of them won.
      expect(slot.player!.season).toMatchObject({ games: 4, wins: 2, losses: 2 });
      expect(slot.champions[0]).toMatchObject({ games: 4, wins: 2, losses: 2 });
      // The same fields as without figures: the allowlist does not widen.
      expect(Object.keys(slot.player!).sort()).toEqual(Object.keys(plain.slots.find((s) => s.role === role)!.player!).sort());
    }
    expect(view.slots.find((s) => s.role === "TOP")!.substitute?.player).toMatchObject({ id: ids.benchsub, statsVisible: true, rankChange: null });
  });

  it("without that setting the allowlist drops every figure, even from a roster that carries them", async () => {
    const roster = await getTeamRoster(handle.db, teamId);
    const top = roster.slots.find((s) => s.role === "TOP")!;
    expect(top.player!.rank).not.toBeNull();
    const members = new Map([[ids.top!, { name: "Top Shown", avatarVersion: 3, userId: userIds.top! }]]);
    const plain = toPublicSlot(top, members);
    expect(plain.player).toMatchObject({ rank: null, season: null, rankChange: null, statsVisible: false, seasonLabel: "" });
    expect(plain.champions[0]).toMatchObject({ games: 0, wins: 0, winRate: null, masteryPoints: null });
    expect(toPublicSlot(top, members, true).player).toMatchObject({ rank: { tier: "GOLD" }, statsVisible: true });
  });

  it("still never sends a username, Riot ID, account id or anyone outside the lineup and its substitutes", async () => {
    invalidatePublicTeam();
    const json = JSON.stringify(await loadPublicTeam(handle.db, teamId, true));
    expect(json).toContain("GOLD");
    expect(json).not.toMatch(/_login|Riot#OCE|OC1_|\/api\/avatars\//);
    expect(json).not.toContain(ids.benchother);
    for (const id of Object.values(userIds)) expect(json).not.toContain(id);
  });

  it("the public Leaderboards rank only the lineup and its substitutes, by display name, linking to no profile", async () => {
    invalidatePublicTeam();
    const data = await loadPublicLeaderboardData(handle.db, teamId);
    expect(data.players.map((p) => p.id).sort()).toEqual([...ROLES.map(([name]) => ids[name]!), ids.benchsub!].sort());
    expect(data.players.find((p) => p.id === ids.top)).toMatchObject({ name: "Top Shown", avatarUrl: `/api/public/avatars/${ids.top}?v=3`, rank: { tier: "GOLD", division: "II" } });
    expect(new Set(data.games.map((g) => g.playerId))).not.toContain(ids.benchother);
    // Both views, as the public page builds them: no profile or game links, no viewer.
    const views = (["form", "records"] as const).map((tab) => buildRecentLeaderboardView(data, { tab }, null, { basePath: "/public/leaderboards", profiles: false }));
    for (const view of views) {
      expect(Object.values(view.players).every((p) => p.profileHref === null)).toBe(true);
      expect(Object.values(view.tabs).every((href) => href.startsWith("/public/leaderboards"))).toBe(true);
      expect(view.viewer).toBeNull();
    }
    expect(views[1]!.records!.records.every((r) => r.holder === null || r.holder.href === null)).toBe(true);
    // What the page sends: the views, with no sign-in name, Riot ID, profile route or private picture route.
    const json = JSON.stringify(views);
    expect(json).not.toMatch(/_login|Riot#OCE|\/players\/|\/api\/avatars\//);
    expect(json).not.toContain(ids.benchother);
    for (const id of Object.values(userIds)) expect(json).not.toContain(id);
  });
});

describe("social links", () => {
  const youtube = "https://www.youtube.com/@TopShown";
  const twitch = "https://www.twitch.tv/top_kept_private";
  const discord = "top.private.name";

  it("are saved checked and normalised, for the session's own profile only", async () => {
    state.session = memberSession("top");
    const { saveSocialLinksAction } = await import("@/server/actions/account");
    expect(await saveSocialLinksAction({ youtube: { value: "https://evil.example/@TopShown", public: true } })).toMatchObject({ ok: false, error: expect.stringMatching(/^YouTube: /) });
    // Only a real true switches a link on; anything else (a missing flag, "yes", 1) keeps it private.
    expect(await saveSocialLinksAction({ youtube: { value: "youtube.com/@TopShown", public: true }, twitch: { value: "Top_Kept_Private", public: "yes" }, discord: { value: "@Top.Private.Name" } })).toEqual({
      ok: true,
      data: { links: { youtube: { value: youtube, public: true }, twitch: { value: twitch, public: false }, discord: { value: discord, public: false } } },
    });
    const [row] = await handle.db.select({ links: players.socialLinks }).from(players).where(eq(players.id, ids.top!));
    expect(row!.links).toEqual({ youtube: { value: youtube, public: true }, twitch: { value: twitch, public: false }, discord: { value: discord, public: false } });
    // Nobody else's profile was touched.
    const others = await handle.db.select({ links: players.socialLinks }).from(players);
    expect(others.filter((r) => r.links)).toHaveLength(1);
    state.session = memberSession("benchsub");
    expect((await saveSocialLinksAction({ twitch: { value: "bench_live", public: true } })).ok).toBe(true);
    state.session = null;
  });

  it("reach the public page only when switched on, and never otherwise", async () => {
    const view = await fresh();
    const top = view.slots.find((s) => s.role === "TOP")!;
    expect(top.player!.social).toEqual([{ kind: "youtube", label: "YouTube", text: "@TopShown", href: youtube }]);
    expect(top.substitute!.player.social.map((l) => l.href)).toEqual(["https://www.twitch.tv/bench_live"]);
    const json = await sent();
    expect(json).not.toContain(twitch);
    expect(json).not.toContain(discord);
  });

  it("show team members the same links as the public page; one switched off and the stored value never leave the server", async () => {
    const roster = await getTeamRoster(handle.db, teamId);
    const top = roster.slots.find((s) => s.role === "TOP")!;
    expect(top.player!.social).toEqual([{ kind: "youtube", label: "YouTube", text: "@TopShown", href: youtube }]);
    for (const v of [twitch, "Top_Kept_Private", discord]) expect(JSON.stringify(roster)).not.toContain(v);
    const { loadProfileHeader } = await import("@/server/players/profile-header");
    const header = (await loadProfileHeader(handle.db, ids.top!))!;
    expect(header.social.map((l) => l.kind)).toEqual(["youtube"]);
    expect(JSON.stringify(header)).not.toContain(twitch);
    // Player records (sent to the browser by the Players directory) carry none of it.
    const { listPlayers } = await import("@/server/repositories/team");
    const listed = JSON.stringify(await listPlayers(handle.db, teamId));
    for (const v of [youtube, twitch, discord]) expect(listed).not.toContain(v);
    expect(JSON.stringify(header.player)).not.toContain(discord);
  });

  it("a link stored in the old shape is shown only if it was chosen for the public page", async () => {
    // A row an older version wrote (migration 0061 converts them; during a deployment an old
    // instance can still write one): "team" and "hidden" stay private, "public" is shown.
    const legacy = { youtube: { value: youtube, show: "public" }, twitch: { value: twitch, show: "team" }, discord: { value: discord, show: "hidden" } } as unknown as SocialLinks;
    const [before] = await handle.db.select({ links: players.socialLinks }).from(players).where(eq(players.id, ids.top!));
    await handle.db.update(players).set({ socialLinks: legacy }).where(eq(players.id, ids.top!));
    try {
      const roster = await getTeamRoster(handle.db, teamId);
      expect(roster.slots.find((s) => s.role === "TOP")!.player!.social.map((l) => l.kind)).toEqual(["youtube"]);
      const { loadProfileHeader } = await import("@/server/players/profile-header");
      expect((await loadProfileHeader(handle.db, ids.top!))!.social.map((l) => l.kind)).toEqual(["youtube"]);
      const json = await sent();
      expect(json).toContain(youtube);
      for (const v of [twitch, discord]) expect(json).not.toContain(v);
      // The owner's own settings read it in the new shape, with the old team choice switched off.
      const { loadSocialLinks } = await import("@/server/repositories/profile");
      expect((await loadSocialLinks(handle.db, [ids.top!])).get(ids.top!)).toEqual({ youtube: { value: youtube, public: true }, twitch: { value: twitch, public: false }, discord: { value: discord, public: false } });
    } finally {
      await handle.db.update(players).set({ socialLinks: before!.links }).where(eq(players.id, ids.top!));
      invalidatePublicTeam();
    }
  });

  it("go when the account is deleted, even though the profile is kept (archived)", async () => {
    const { deleteAccount } = await import("@/server/auth/account-admin");
    const db = handle.db;
    const [extra] = await db.insert(users).values({ username: "leaver_login", displayName: "Leaver", role: "player", setupCompletedAt: new Date() }).returning();
    const id = (await createPlayer(db, teamId, { displayName: "Leaver", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    await db.update(users).set({ playerId: id }).where(eq(users.id, extra!.id));
    await db.update(players).set({ socialLinks: { twitch: { value: "https://www.twitch.tv/leaver", public: true } } }).where(eq(players.id, id));
    await deleteAccount(db, userIds.owner!, extra!.id);
    const [row] = await db.select({ archivedAt: players.archivedAt, links: players.socialLinks }).from(players).where(eq(players.id, id));
    expect(row!.archivedAt).not.toBeNull();
    expect(row!.links).toBeNull();
  });
});

describe("public pictures", () => {
  const fetchAvatar = (playerId: string) => publicAvatar(new Request(`http://local/api/public/avatars/${playerId}?v=3`), { params: Promise.resolve({ playerId }) });

  it("are served to anyone for the lineup and its substitutes only, never cached by shared caches", async () => {
    invalidatePublicTeam();
    state.session = null;
    const ok = await fetchAvatar(ids.mid!);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe("avatar-mid");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=300");
    expect((await fetchAvatar(ids.benchsub!)).status).toBe(200);
    // Someone not on the public page: the same answer as an id that does not exist.
    expect((await fetchAvatar(ids.benchother!)).status).toBe(404);
    expect((await fetchAvatar("not-a-uuid")).status).toBe(404);
    expect((await fetchAvatar(userIds.mid!)).status).toBe(404);
    // The same for a signed-in member.
    state.session = memberSession("jungle");
    expect((await fetchAvatar(ids.benchother!)).status).toBe(404);
    expect(await publicImageOwner(handle.db, ids.mid!)).toEqual({ userId: userIds.mid });
    state.session = null;
  });
});
