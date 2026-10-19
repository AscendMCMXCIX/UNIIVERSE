import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Team Overview, one designated substitute per role:
  - Chosen in Edit lineup (manage-lineup, checked on the server) from bench members who list the
    role; one per role (a new choice replaces the old), removable, saved with the lineup.
  - Never a starter, an archived member, a non-member, a member without a role, or someone who does
    not list the role; becoming a starter ends a player's substitute duties.
  - The roster carries the substitute as a full card (the back of the Team card), with the same
    statistics rule as starters; no substitute, no back.
  - Start on the back swaps them: the substitute starts, the former starter becomes the substitute.
    Refused when the lineup changed since the page loaded.
  - The public page shows the substitute only for a consenting member.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as Session | null }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => {
  const { hasPermission } = await import("@/server/auth/permissions");
  const notAllowed = (message: string) => Object.assign(new Error(message), { name: "NotAuthorizedError" });
  return {
    ...(await orig<object>()),
    getSession: async () => state.session,
    // The real rule (session.ts): signed in, and the permission held.
    requirePermission: async (permission: Parameters<typeof hasPermission>[1]) => {
      if (!state.session) throw notAllowed("Please sign in.");
      if (!hasPermission(state.session, permission)) throw notAllowed("You don't have permission to do that.");
      return state.session;
    },
  };
});

import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, patches, players, users } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import type { Role } from "@/domain/roles";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { archivePlayer, createPlayer, getCurrentLineup, getOrCreateTeam, setLineup, setLineupSlot, setLineupSubstitute, setTeamMember } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getTeamRoster, getTeamRosterForViewer, type RosterSlot } from "@/server/team/roster";
import { loadPublicTeam } from "@/server/public/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { STANDARD_PLAYER, type Capability } from "@/server/auth/permissions";
import { setLineupSlotAction, setLineupSubstituteAction } from "@/server/actions/players";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};

const viewer = (playerId: string | null, capabilities: readonly Capability[]): Session => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Viewer", username: "viewer", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId, capabilities: [...capabilities], teamMember: true });
const slotOf = (slots: RosterSlot[], role: Role) => slots.find((s) => s.role === role)!;
const subName = (slots: RosterSlot[], role: Role) => slotOf(slots, role).substitute?.player.name ?? null;
const lineup = async () => (await getCurrentLineup(handle.db, teamId)).slots;
const subs = async () => (await getCurrentLineup(handle.db, teamId)).substitutes;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  teamId = (await getOrCreateTeam(db)).id;
  const make = async (key: string, input: Parameters<typeof createPlayer>[2]) => {
    ids[key] = (await createPlayer(db, teamId, input)).id;
    await db.insert(users).values({ username: `${key}_login`, displayName: input.displayName, role: "player", playerId: ids[key], setupCompletedAt: new Date() });
  };
  // The lineup.
  await make("top", { displayName: "Starter Top", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven"], secondaryPool: ["Ahri"] });
  await make("jungle", { displayName: "Starter Jungle", primaryRole: "JUNGLE", primaryPool: ["Viego"] });
  await make("mid", { displayName: "Starter Mid", primaryRole: "MID", secondaryRole: "TOP", primaryPool: ["Orianna"], secondaryPool: ["Jax"] });
  await make("adc", { displayName: "Starter ADC", primaryRole: "ADC", primaryPool: ["Jinx"] });
  await make("support", { displayName: "Starter Support", primaryRole: "SUPPORT", primaryPool: ["Nautilus"] });
  // The bench.
  await make("subTop", { displayName: "Sub Top", primaryRole: "TOP", primaryPool: ["Ornn", "Sion"] });
  await make("flex", { displayName: "Flex", primaryRole: "MID", secondaryRole: "TOP", primaryPool: ["Syndra"], secondaryPool: ["Gwen", "Jax"], additionalRoles: [{ role: "SUPPORT", pool: ["Lulu"] }] });
  await make("otherTop", { displayName: "Other Top", primaryRole: "TOP", group: "other", primaryPool: ["Garen"] });
  await make("gone", { displayName: "Archived Top", primaryRole: "TOP", primaryPool: ["Darius"] });
  await make("outsider", { displayName: "Not A Member", primaryRole: "TOP", primaryPool: ["Fiora"] });
  const [noRole] = await db.insert(players).values({ teamId, displayName: "No Role Yet", group: "main" }).returning({ id: players.id });
  ids.noRole = noRole!.id;
  for (const role of ["top", "jungle", "mid", "adc", "support"] as const) await setLineupSlot(db, teamId, role.toUpperCase() as Role, ids[role]!);
  await archivePlayer(db, ids.gone!, true);
  await setTeamMember(db, teamId, ids.outsider!, false);
  // Flex has games in Mid (6) and Top (3): each substitute card counts the role it is shown for.
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") });
  const account = await addAccount(db, { ownerType: "player", playerId: ids.flex!, riotId: "Flex#OCE", platform: "oc1" });
  const game = (i: number, championId: string, role: string) => ({ accountId: account.id, matchId: `OC1_F${role}${i}`, gameCreation: Date.now() - i * 3_600_000, queueId: 420, championId, role, win: i % 2 === 0, patch: "16.20", kills: 7, deaths: 3, assists: 6, cs: 210, damage: 21000, visionScore: 23, gameDuration: 1800 });
  await db.insert(accountMatches).values([...Array.from({ length: 6 }, (_, i) => game(i, "Syndra", "MID")), ...Array.from({ length: 3 }, (_, i) => game(i, "Gwen", "TOP"))]);
  invalidateProficiencyCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("choosing substitutes", () => {
  it("starts with none: no role has a back until one is chosen; the candidates are bench members who list the role", async () => {
    const { slots } = await getTeamRoster(handle.db, teamId);
    for (const s of slots) expect(s.substitute).toBeNull();
    // Primary-role candidates first (main players before other players), then the secondary role.
    expect(slotOf(slots, "TOP").substituteCandidates.map((c) => c.name)).toEqual(["Sub Top", "Other Top", "Flex"]);
    // An additional role counts; nobody else lists Jungle or Bottom.
    expect(slotOf(slots, "SUPPORT").substituteCandidates.map((c) => c.name)).toEqual(["Flex"]);
    expect(slotOf(slots, "JUNGLE").substituteCandidates).toEqual([]);
    const offered = JSON.stringify(slots.map((s) => s.substituteCandidates));
    for (const name of ["Starter Top", "Starter Mid", "Archived Top", "Not A Member", "No Role Yet"]) expect(offered).not.toContain(name);
  });

  it("keeps exactly one per role: a new choice replaces the old, and it can be removed", async () => {
    await setLineupSubstitute(handle.db, teamId, "TOP", ids.subTop!);
    await setLineupSubstitute(handle.db, teamId, "TOP", ids.flex!);
    expect((await subs()).TOP).toBe(ids.flex);
    // The same player may cover several roles.
    await setLineupSubstitute(handle.db, teamId, "MID", ids.flex!);
    let { slots } = await getTeamRoster(handle.db, teamId);
    expect(subName(slots, "TOP")).toBe("Flex");
    expect(subName(slots, "MID")).toBe("Flex");
    expect(slots.filter((s) => s.substitute).length).toBe(2);
    await setLineupSubstitute(handle.db, teamId, "MID", null);
    ({ slots } = await getTeamRoster(handle.db, teamId));
    expect(subName(slots, "MID")).toBeNull();
    expect(subName(slots, "TOP")).toBe("Flex");
    // Saved with the lineup: it reads back the same.
    expect(await subs()).toEqual({ TOP: ids.flex });
  });

  it("refuses anyone who cannot substitute there, and changes nothing", async () => {
    const before = await subs();
    await expect(setLineupSubstitute(handle.db, teamId, "TOP", ids.mid!)).rejects.toThrow(/starting lineup/);
    await expect(setLineupSubstitute(handle.db, teamId, "JUNGLE", ids.subTop!)).rejects.toThrow(/does not list Jungle/);
    await expect(setLineupSubstitute(handle.db, teamId, "TOP", ids.gone!)).rejects.toThrow(/archived/);
    await expect(setLineupSubstitute(handle.db, teamId, "TOP", ids.outsider!)).rejects.toThrow(/not a member/);
    await expect(setLineupSubstitute(handle.db, teamId, "TOP", ids.noRole!)).rejects.toThrow(/not chosen their roles/);
    expect(await subs()).toEqual(before);
  });

  it("builds the substitute's card like a starter's, in its role, with the same statistics rule", async () => {
    await setLineupSubstitute(handle.db, teamId, "MID", ids.flex!);
    const { slots } = await getTeamRoster(handle.db, teamId);
    const inTop = slotOf(slots, "TOP").substitute!;
    const inMid = slotOf(slots, "MID").substitute!;
    expect(inTop.player.profileRole).toBe("secondary");
    expect(inMid.player.profileRole).toBe("primary");
    // The role's own pool, in order, with figures in that role only.
    expect(inTop.champions.map((c) => c.championId)).toEqual(["Gwen", "Jax"]);
    expect(inMid.champions.map((c) => c.championId)).toEqual(["Syndra"]);
    expect(inTop.player.season?.games).toBe(3);
    expect(inMid.player.season?.games).toBe(6);
    expect(Object.keys(inTop.player).sort()).toEqual(Object.keys(slotOf(slots, "TOP").player!).sort());
    // Hidden for a teammate without "view teammates' statistics".
    const restricted = STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats");
    const hidden = slotOf((await getTeamRosterForViewer(handle.db, teamId, viewer(ids.subTop!, restricted))).slots, "TOP").substitute!;
    expect(hidden.player.statsVisible).toBe(false);
    expect(hidden.player.season).toBeNull();
    expect(hidden.champions.every((c) => c.games === 0 && c.winRate === null && c.tierLabel === "")).toBe(true);
    await setLineupSubstitute(handle.db, teamId, "MID", null);
  });

  it("drops a substitute who can no longer take the role, and ends the duties of anyone who starts", async () => {
    await setLineupSubstitute(handle.db, teamId, "SUPPORT", ids.flex!);
    // Flex starts at Mid (a bulk lineup change too): no longer anyone's substitute.
    await setLineupSlot(handle.db, teamId, "MID", ids.flex!);
    expect(await subs()).toEqual({});
    await setLineupSlot(handle.db, teamId, "MID", ids.mid!);
    await setLineupSubstitute(handle.db, teamId, "TOP", ids.subTop!);
    await setLineup(handle.db, teamId, { ...(await lineup()), TOP: ids.subTop! });
    expect((await subs()).TOP).toBeUndefined();
    await setLineup(handle.db, teamId, { ...(await lineup()), TOP: ids.top! });
    // Archived after being chosen: kept in storage, but no card shows them.
    await setLineupSubstitute(handle.db, teamId, "TOP", ids.otherTop!);
    await archivePlayer(handle.db, ids.otherTop!, true);
    expect(subName((await getTeamRoster(handle.db, teamId)).slots, "TOP")).toBeNull();
    await archivePlayer(handle.db, ids.otherTop!, false);
    expect(subName((await getTeamRoster(handle.db, teamId)).slots, "TOP")).toBe("Other Top");
  });

  it("needs the manage-lineup permission on the server, whatever the page showed", async () => {
    const before = await subs();
    state.session = viewer(ids.subTop!, STANDARD_PLAYER);
    expect((await setLineupSubstituteAction("TOP", ids.flex!)).ok).toBe(false);
    expect((await setLineupSubstituteAction("TOP", null)).ok).toBe(false);
    state.session = null;
    expect((await setLineupSubstituteAction("TOP", ids.flex!)).ok).toBe(false);
    expect(await subs()).toEqual(before);
    state.session = viewer(ids.subTop!, [...STANDARD_PLAYER, "manage-lineup"]);
    // Malformed input is refused before anything is read.
    expect((await setLineupSubstituteAction("NOT_A_ROLE" as Role, ids.flex!)).ok).toBe(false);
    expect((await setLineupSubstituteAction("TOP", "not-an-id")).ok).toBe(false);
    expect(await setLineupSubstituteAction("TOP", ids.flex!)).toEqual({ ok: true });
    expect((await subs()).TOP).toBe(ids.flex);
    expect(await setLineupSubstituteAction("TOP", null)).toEqual({ ok: true });
    expect((await subs()).TOP).toBeUndefined();
    state.session = null;
  });
});

describe("the substitute on the public page", () => {
  it("is shown for a consenting member only, with no figure, and nothing about anyone else is sent", async () => {
    await setLineupSubstitute(handle.db, teamId, "TOP", ids.subTop!);
    await setLineupSubstitute(handle.db, teamId, "MID", ids.flex!);
    const consent = (key: string, name: string) => handle.db.update(players).set({ publicProfile: true, publicName: name }).where(eq(players.id, ids[key]!));
    await consent("top", "Public Top");
    await consent("subTop", "Public Sub");
    const team = await loadPublicTeam(handle.db, teamId);
    const top = team.slots.find((s) => s.role === "TOP")!;
    expect(top.substitute!.player.name).toBe("Public Sub");
    expect(top.substitute!.player.statsVisible).toBe(false);
    expect(top.substitute!.champions.every((c) => c.games === 0)).toBe(true);
    expect(top.substituteCandidates).toEqual([]);
    // A role whose starter is private shows no card, so no substitute either.
    expect(team.slots.find((s) => s.role === "MID")!.substitute).toBeNull();
    const sent = JSON.stringify(team);
    for (const name of ["Flex", "Other Top", "Sub Top", "Flex#OCE"]) expect(sent).not.toContain(name);
    await handle.db.update(players).set({ publicProfile: false, publicName: null });
    await setLineupSubstitute(handle.db, teamId, "MID", null);
  });
});

describe("Start: the substitute becomes the starter", () => {
  it("swaps them: the former starter becomes the role's substitute", async () => {
    expect((await subs()).TOP).toBe(ids.subTop);
    await setLineupSlot(handle.db, teamId, "TOP", ids.subTop!, { replacing: ids.top! });
    expect((await lineup()).TOP).toBe(ids.subTop);
    expect((await subs()).TOP).toBe(ids.top);
    const { slots } = await getTeamRoster(handle.db, teamId);
    expect(slotOf(slots, "TOP").player!.name).toBe("Sub Top");
    expect(subName(slots, "TOP")).toBe("Starter Top");
    await setLineupSlot(handle.db, teamId, "TOP", ids.top!, { replacing: ids.subTop! });
    expect((await lineup()).TOP).toBe(ids.top);
    expect((await subs()).TOP).toBe(ids.subTop);
  });

  it("refuses when the lineup changed since the page loaded, and changes nothing", async () => {
    const before = await lineup();
    // Someone else already replaced the starter this manager saw.
    await expect(setLineupSlot(handle.db, teamId, "TOP", ids.flex!, { replacing: ids.subTop! })).rejects.toThrow(/lineup changed/);
    // The substitute was put in the lineup meanwhile (here: already starting at Mid).
    await expect(setLineupSlot(handle.db, teamId, "TOP", ids.mid!, { replacing: ids.top! })).rejects.toThrow(/lineup changed/);
    expect(await lineup()).toEqual(before);
  });

  it("never saves someone who cannot take the role", async () => {
    const before = await lineup();
    await expect(setLineupSlot(handle.db, teamId, "JUNGLE", ids.subTop!, { replacing: ids.jungle! })).rejects.toThrow(/does not list Jungle/);
    await expect(setLineupSlot(handle.db, teamId, "TOP", ids.gone!, { replacing: ids.top! })).rejects.toThrow(/archived/);
    await expect(setLineupSlot(handle.db, teamId, "TOP", ids.outsider!, { replacing: ids.top! })).rejects.toThrow(/not a member/);
    await expect(setLineupSlot(handle.db, teamId, "TOP", ids.noRole!, { replacing: ids.top! })).rejects.toThrow(/does not list Top|not chosen their roles/);
    expect(await lineup()).toEqual(before);
  });

  it("needs the manage-lineup permission on the server, whatever the page showed", async () => {
    const before = await lineup();
    state.session = viewer(ids.subTop!, STANDARD_PLAYER);
    const refused = await setLineupSlotAction("TOP", ids.subTop!, { replacing: ids.top! });
    expect(refused.ok).toBe(false);
    state.session = null;
    expect((await setLineupSlotAction("TOP", ids.subTop!, { replacing: ids.top! })).ok).toBe(false);
    expect(await lineup()).toEqual(before);

    state.session = viewer(ids.subTop!, [...STANDARD_PLAYER, "manage-lineup"]);
    // A malformed guard is refused before anything is read.
    expect((await setLineupSlotAction("TOP", ids.subTop!, { replacing: "" })).ok).toBe(false);
    const stale = await setLineupSlotAction("TOP", ids.subTop!, { replacing: ids.flex! });
    expect(stale).toEqual({ ok: false, error: expect.stringMatching(/lineup changed/) });
    expect((await setLineupSlotAction("TOP", ids.subTop!, { replacing: ids.top! })).ok).toBe(true);
    expect((await lineup()).TOP).toBe(ids.subTop);
    expect((await setLineupSlotAction("TOP", ids.top!, { replacing: ids.subTop! })).ok).toBe(true);
    state.session = null;
  });
});
