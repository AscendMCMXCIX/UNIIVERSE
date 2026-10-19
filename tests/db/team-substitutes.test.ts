import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Team Overview, substitute cards: each filled lineup card turns over to the role's substitutes.
  - The substitutes come with the roster (no request when a card turns): bench members who list the
    role, best fit first, never a starter, a member without a role, an archived member or a non-member.
  - A substitute's card carries the same parts as a starter's, in that role, and the same statistics
    rule (hidden without "view teammates' statistics", except the viewer's own).
  - The public page shows only consenting members as substitutes.
  - Saving a substitute as the starter (Edit lineup) needs "manage lineup" and is refused when the
    lineup changed since the page loaded, so another manager's change is never overwritten.
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
import { archivePlayer, createPlayer, getCurrentLineup, getOrCreateTeam, setLineupSlot, setTeamMember } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getTeamRoster, getTeamRosterForViewer, type RosterSlot } from "@/server/team/roster";
import { loadPublicTeam } from "@/server/public/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { STANDARD_PLAYER, type Capability } from "@/server/auth/permissions";
import { setLineupSlotAction } from "@/server/actions/players";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};

const viewer = (playerId: string | null, capabilities: readonly Capability[]): Session => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Viewer", username: "viewer", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId, capabilities: [...capabilities], teamMember: true });
const subsOf = (slots: RosterSlot[], role: Role) => slots.find((s) => s.role === role)!.substitutes;
const names = (slots: RosterSlot[], role: Role) => subsOf(slots, role).map((s) => s.player.name);
const lineup = async () => (await getCurrentLineup(handle.db, teamId)).slots;

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

describe("substitutes on the roster", () => {
  it("lists bench members who list the role, best fit first, and nobody who cannot take it", async () => {
    const { slots } = await getTeamRoster(handle.db, teamId);
    // Primary-role substitutes first (main players before other players), then the secondary role.
    expect(names(slots, "TOP")).toEqual(["Sub Top", "Other Top", "Flex"]);
    // An additional role counts; nobody else lists Jungle or Bottom.
    expect(names(slots, "SUPPORT")).toEqual(["Flex"]);
    expect(names(slots, "JUNGLE")).toEqual([]);
    expect(names(slots, "ADC")).toEqual([]);
    // Starter Top lists Mid too but starts: never a substitute. Nor archived members, non-members or members without a role.
    const all = JSON.stringify(slots.map((s) => s.substitutes));
    for (const name of ["Starter Top", "Starter Mid", "Archived Top", "Not A Member", "No Role Yet"]) expect(all).not.toContain(name);
  });

  it("builds a substitute's card like a starter's, in the role it is shown for", async () => {
    const { slots } = await getTeamRoster(handle.db, teamId);
    const inTop = subsOf(slots, "TOP").find((s) => s.player.name === "Flex")!;
    const inMid = subsOf(slots, "MID").find((s) => s.player.name === "Flex")!;
    expect(inTop.player.profileRole).toBe("secondary");
    expect(inMid.player.profileRole).toBe("primary");
    // The role's own pool, in order, with figures in that role only.
    expect(inTop.champions.map((c) => c.championId)).toEqual(["Gwen", "Jax"]);
    expect(inMid.champions.map((c) => c.championId)).toEqual(["Syndra"]);
    expect(inTop.player.season?.games).toBe(3);
    expect(inMid.player.season?.games).toBe(6);
    expect(inTop.champions.find((c) => c.championId === "Gwen")!.games).toBe(3);
    expect(inTop.player.statsVisible).toBe(true);
    // The same parts the front of the card uses.
    expect(Object.keys(inTop.player).sort()).toEqual(Object.keys(slots.find((s) => s.role === "TOP")!.player!).sort());
  });

  it("follows the statistics rule: hidden for teammates without access, always shown for the viewer's own card", async () => {
    const restricted = STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats");
    const { slots } = await getTeamRosterForViewer(handle.db, teamId, viewer(ids.subTop!, restricted));
    const flex = subsOf(slots, "TOP").find((s) => s.player.name === "Flex")!;
    expect(flex.player.statsVisible).toBe(false);
    expect(flex.player.season).toBeNull();
    expect(flex.player.rank).toBeNull();
    expect(flex.champions.every((c) => c.games === 0 && c.winRate === null && c.tierLabel === "")).toBe(true);
    expect(subsOf(slots, "TOP").find((s) => s.player.name === "Sub Top")!.player.statsVisible).toBe(true);
  });
});

describe("substitutes on the public page", () => {
  it("shows consenting members only, with no figure, and leaves everyone else out entirely", async () => {
    const consent = (key: string, name: string) => handle.db.update(players).set({ publicProfile: true, publicName: name }).where(eq(players.id, ids[key]!));
    await consent("top", "Public Top");
    await consent("subTop", "Public Sub");
    const team = await loadPublicTeam(handle.db, teamId);
    const top = team.slots.find((s) => s.role === "TOP")!;
    expect(top.substitutes.map((s) => s.player.name)).toEqual(["Public Sub"]);
    expect(top.substitutes[0]!.player.statsVisible).toBe(false);
    expect(top.substitutes[0]!.champions.every((c) => c.games === 0)).toBe(true);
    // A role whose starter is private shows no card, so no substitutes either.
    expect(team.slots.find((s) => s.role === "MID")!.substitutes).toEqual([]);
    const sent = JSON.stringify(team);
    for (const name of ["Flex", "Other Top", "Sub Top", "Flex#OCE"]) expect(sent).not.toContain(name);
    await handle.db.update(players).set({ publicProfile: false, publicName: null });
  });
});

describe("saving a substitute as the starter", () => {
  it("swaps the starter to the bench, where they become a substitute for the roles they list", async () => {
    await setLineupSlot(handle.db, teamId, "TOP", ids.subTop!, { replacing: ids.top! });
    expect((await lineup()).TOP).toBe(ids.subTop);
    const { slots } = await getTeamRoster(handle.db, teamId);
    expect(slots.find((s) => s.role === "TOP")!.player!.name).toBe("Sub Top");
    expect(names(slots, "TOP")).toEqual(["Starter Top", "Other Top", "Flex"]);
    expect(names(slots, "MID")).toEqual(["Flex", "Starter Top"]);
    await setLineupSlot(handle.db, teamId, "TOP", ids.top!, { replacing: ids.subTop! });
    expect((await lineup()).TOP).toBe(ids.top);
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
