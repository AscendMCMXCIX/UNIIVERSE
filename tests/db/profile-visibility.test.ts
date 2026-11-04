import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Two owner decisions (4 Nov 2026), through the real pages, components and server actions, signed
  in with a real session cookie (Next.js plumbing replaced by small fakes, as in auth-actions):

  1. A teammate's rank is a statistic. Without "view teammates' statistics" a viewer receives no
     tier, division, LP, queue or ranked record of another player: not in the profile header's
     identity (every /players/[id] tab), not in the Riot Accounts tab's accounts. Left out, never
     sent as "Unranked". One's own always; Standard viewers as before.
  2. A personal-use profile (players.team_member false) opens only for its own player and
     administrators. A member, a Restricted Player and a Player Manager are answered "not found"
     by the layout and every tab page, and refused by the actions that read or change the player.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[], pathname: "/" }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirects.push(to);
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { accountMatches, matchDetails, patches, riotAccounts, users, type MatchParticipantDetail } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import type { Capability } from "@/server/auth/permissions";
import { loadProfileHeader } from "@/server/players/profile-header";
import { headerIdentity, IdentitySync } from "@/components/players/profile-sections";
import { ProfileAccountsTab } from "@/components/players/profile-accounts-tab";
import * as playerActions from "@/server/actions/players";
import * as accountActions from "@/server/actions/accounts";
import * as matchActions from "@/server/actions/match-history";
import PlayerLayout from "@/app/(app)/players/[id]/layout";
import OverviewPage from "@/app/(app)/players/[id]/page";
import AccountsPage from "@/app/(app)/players/[id]/accounts/page";
import ChampionsPage from "@/app/(app)/players/[id]/champions/page";
import MatchesPage from "@/app/(app)/players/[id]/matches/page";

const RESTRICTED: Capability[] = ["view-team", "view-players", "view-matches", "edit-own-profile", "manage-own-riot-accounts"];
const MATCH = "OC1_900000001";

let handle: DbHandle;
const player: Record<string, string> = {};
const user: Record<string, string> = {};
const accountId: Record<string, string> = {};
const env: Record<string, string | undefined> = {};

async function signInAs(name: string | null) {
  state.cookies.clear();
  state.redirects = [];
  if (!name) return;
  const { token } = await createSession(handle.db, user[name]!);
  state.cookies.set(SESSION_COOKIE, token);
}

type Node = { type: unknown; props: Record<string, unknown> };
const isNode = (n: unknown): n is Node => !!n && typeof n === "object" && "type" in n && "props" in n;
const SYNC_SERVER = new Set<unknown>([IdentitySync]);

/**
 * The server side of a React tree, as far as this test needs it: server components (async ones,
 * and the sync ones listed) are called; every other component's props, and every text, are what
 * React would send to the browser. Returned as JSON.
 */
async function browserPayload(node: unknown): Promise<string> {
  const out: unknown[] = [];
  const walk = async (n: unknown): Promise<void> => {
    if (Array.isArray(n)) {
      for (const x of n) await walk(x);
      return;
    }
    if (typeof n === "string" || typeof n === "number") {
      out.push(n);
      return;
    }
    if (!isNode(n)) return;
    const { type, props } = n;
    if (typeof type === "function" && (type.constructor.name === "AsyncFunction" || SYNC_SERVER.has(type))) {
      await walk(await (type as (p: unknown) => unknown)(props));
      return;
    }
    const { children, ...rest } = props;
    if (typeof type !== "string" && typeof type !== "symbol") out.push({ component: (type as { name?: string; displayName?: string }).displayName ?? (type as { name?: string }).name ?? "?", props: rest });
    for (const value of Object.values(rest)) if (isNode(value)) await walk(value);
    await walk(children);
  };
  await walk(node);
  return JSON.stringify(out);
}

/** The props one client component received, from a payload. */
function propsOf(payload: string, component: string): Array<Record<string, unknown>> {
  return (JSON.parse(payload) as Array<{ component?: string; props?: Record<string, unknown> }>).filter((x) => x.component === component).map((x) => x.props!);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const search = { searchParams: Promise.resolve({}) };

/** What the layout and each tab page answer for this profile: "not found", a redirect, or rendered. */
async function pagesFor(id: string): Promise<string[]> {
  const answers: string[] = [];
  for (const run of [() => PlayerLayout({ children: "tab", ...params(id) }), () => OverviewPage({ ...params(id), ...search }), () => AccountsPage(params(id)), () => ChampionsPage({ ...params(id), ...search }), () => MatchesPage({ ...params(id), ...search })]) {
    try {
      const r = (await run()) as unknown;
      answers.push(r === "tab" ? "children" : isNode(r) && (r.props.header as { player?: { id?: string } } | undefined)?.player?.id === id ? "rendered" : `rendered something else: ${JSON.stringify(r)?.slice(0, 80)}`);
    } catch (err) {
      const message = (err as Error).message;
      answers.push(message === "NEXT_NOT_FOUND" ? "not found" : message.startsWith("NEXT_REDIRECT ") ? `redirect ${message.slice(14).split("?")[0]}` : `error: ${message}`);
    }
  }
  return answers;
}

const part = (puuid: string, name: string, teamId: number, championId: string, championKey: number, position: string): MatchParticipantDetail => ({ puuid, name, teamId, championId, championKey, champLevel: 16, position, win: teamId === 100, kills: 4, deaths: 3, assists: 7, cs: 180, gold: 11_000, damage: 18_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

beforeAll(async () => {
  for (const k of ["UNIIVERSE_REQUIRE_AUTH", "DATABASE_URL", "UNIIVERSE_AUTH_SECRET", "RIOT_API_KEY"]) env[k] = process.env[k];
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
  handle = await testDb();
  state.db = handle.db;
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
  const teamId = (await getOrCreateTeam(db)).id;
  // Profiles: Ace (a ranked team member), the viewers' own profiles, and Solo (personal use, ranked too).
  for (const [name, role, champion] of [["ace", "MID", "Ahri"], ["mate", "TOP", "Riven"], ["rex", "JUNGLE", "Viego"], ["pam", "SUPPORT", "Thresh"], ["solo", "ADC", "Jinx"]] as const) {
    player[name] = (await createPlayer(db, teamId, { displayName: name[0]!.toUpperCase() + name.slice(1), primaryRole: role, primaryPool: [champion] })).id;
  }
  await setTeamMember(db, teamId, player.solo!, false);
  const accounts = [
    { name: "ace", puuid: "puuid-ace", tier: "GOLD", division: "II", lp: 45 },
    { name: "mate", puuid: "puuid-mate", tier: null, division: null, lp: null },
    { name: "solo", puuid: "puuid-solo", tier: "PLATINUM", division: "IV", lp: 12 },
  ];
  for (const a of accounts) {
    const [row] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: player[a.name]!, gameName: a.name, tagLine: "OCE", platform: "oc1", puuid: a.puuid, label: "main", syncStatus: "ok", tier: a.tier, division: a.division, leaguePoints: a.lp, rankedWins: a.tier ? 31 : null, rankedLosses: a.tier ? 27 : null, rankQueue: a.tier ? "solo" : null, rankUpdatedAt: a.tier ? new Date() : null })
      .returning({ id: riotAccounts.id });
    accountId[a.name] = row!.id;
  }
  // Accounts: the Owner (no profile), each viewer's own, and Solo's.
  const accountRows: Array<{ name: string; role: "owner" | "player"; playerId: string | null; capabilities: Capability[] | null; groups?: string[] }> = [
    { name: "owner", role: "owner", playerId: null, capabilities: null },
    { name: "ace", role: "player", playerId: player.ace!, capabilities: RESTRICTED },
    { name: "mate", role: "player", playerId: player.mate!, capabilities: null },
    { name: "rex", role: "player", playerId: player.rex!, capabilities: RESTRICTED },
    { name: "pam", role: "player", playerId: player.pam!, capabilities: null, groups: ["player-manager"] },
    { name: "solo", role: "player", playerId: player.solo!, capabilities: null },
  ];
  for (const a of accountRows) {
    const [row] = await db.insert(users).values({ username: `${a.name}_login`, displayName: a.name, role: a.role, playerId: a.playerId, setupCompletedAt: new Date(), customCapabilities: a.capabilities, accessGroups: a.groups ?? [] }).returning({ id: users.id });
    user[a.name] = row!.id;
  }
  // One game: Ace (blue mid) with Mate, against Solo, all on stored records.
  const created = Date.now() - 86_400_000;
  for (const [name, championId, teamId, role] of [["ace", "Ahri", 100, "MID"], ["solo", "Jinx", 200, "ADC"]] as const) {
    await db.insert(accountMatches).values({ accountId: accountId[name]!, matchId: MATCH, gameCreation: created, queueId: 420, championId, role, win: teamId === 100, teamId, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 3, assists: 7 });
  }
  await db.insert(matchDetails).values({
    matchId: MATCH,
    platform: "oc1",
    queueId: 420,
    gameCreation: created,
    gameDuration: 1800,
    gameVersion: "16.20.1",
    teams: [],
    participants: [part("puuid-ace", "ace#OCE", 100, "Ahri", 103, "MIDDLE"), part("puuid-mate", "mate#OCE", 100, "Riven", 92, "TOP"), part("puuid-solo", "solo#OCE", 200, "Jinx", 222, "BOTTOM"), part("puuid-stranger", "Stranger#OCE", 200, "Thresh", 412, "UTILITY")],
  });
}, 120_000);

afterAll(async () => {
  await handle.close();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("decision 1: a teammate's rank is a statistic", () => {
  it("a Restricted viewer receives no rank of a teammate: the header's identity on every tab, and the Riot Accounts tab", async () => {
    await signInAs("rex");
    const frame = await browserPayload(await PlayerLayout({ children: null, ...params(player.ace!) }));
    const [header] = propsOf(frame, "ProfileHeader");
    expect(header!.identity).toMatchObject({ playerId: player.ace, showRank: false, rank: null });
    expect(propsOf(frame, "ProfileIdentityProvider")[0]!.initial).toMatchObject({ showRank: false, rank: null });
    const tab = await browserPayload(await AccountsPage(params(player.ace!)));
    expect(propsOf(tab, "ProfileIdentitySync")[0]!.identity).toMatchObject({ showRank: false, rank: null });
    const [panel] = propsOf(tab, "RiotAccountsPanel");
    expect(panel!.accounts).toEqual([expect.objectContaining({ riotId: "ace#OCE", tier: null, division: null, leaguePoints: null, rankedWins: null, rankedLosses: null, rankQueue: null, rankUpdatedAt: null })]);
    // Nothing of the rank anywhere in what reaches the browser, and no "Unranked" in its place.
    for (const payload of [frame, tab]) {
      expect(payload).not.toMatch(/GOLD|Gold/);
      expect(payload).not.toMatch(/Unranked/);
    }
    // The other tabs' identity too (each tab hands the header its own).
    for (const page of [() => OverviewPage({ ...params(player.ace!), ...search }), () => ChampionsPage({ ...params(player.ace!), ...search }), () => MatchesPage({ ...params(player.ace!), ...search })]) {
      const tabNode = (await page()) as Node;
      const fragment = (await (tabNode.type as (p: unknown) => Promise<Node>)(tabNode.props)) as Node;
      const [sync] = fragment.props.children as Node[];
      const identity = await browserPayload(sync);
      expect(propsOf(identity, "ProfileIdentitySync")[0]!.identity).toMatchObject({ playerId: player.ace, showRank: false, rank: null });
      expect(identity).not.toMatch(/GOLD/);
    }
  });

  it("the header leaves a hidden rank out on the Overview and the compact band, and says Unranked only for a player with no rank", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ProfileHeader } = await import("@/components/players/profile-header");
    const header = (await loadProfileHeader(handle.db, player.ace!))!;
    await signInAs("rex");
    const { getSession } = await import("@/server/auth/session");
    const hidden = headerIdentity(header, await getSession());
    await signInAs("mate");
    const shown = headerIdentity(header, await getSession());
    const unranked = { ...shown, rank: null };
    const basePath = `/players/${player.ace}`;
    for (const pathname of [basePath, `${basePath}/accounts`]) {
      state.pathname = pathname;
      const html = (identity: typeof shown) => renderToStaticMarkup(createElement(ProfileHeader, { identity, self: false, basePath }));
      expect(html(hidden), pathname).not.toContain('data-testid="profile-rank"');
      expect(html(hidden), pathname).not.toMatch(/Unranked|Gold/);
      expect(html(shown), pathname).toContain("Gold II");
      expect(html(unranked), pathname).toContain("Unranked");
    }
    state.pathname = "/";
  });

  it("a Standard viewer still receives it, without the ranked wins and losses the header never used", async () => {
    await signInAs("mate");
    const frame = await browserPayload(await PlayerLayout({ children: null, ...params(player.ace!) }));
    const identity = propsOf(frame, "ProfileHeader")[0]!.identity as { showRank: boolean; rank: Record<string, unknown> | null };
    expect(identity).toMatchObject({ showRank: true, rank: { tier: "GOLD", division: "II", leaguePoints: 45, queue: "solo" } });
    expect(Object.keys(identity.rank!).sort()).toEqual(["asOf", "division", "leaguePoints", "queue", "tier"]);
    const tab = await browserPayload(await AccountsPage(params(player.ace!)));
    expect(propsOf(tab, "RiotAccountsPanel")[0]!.accounts).toEqual([expect.objectContaining({ tier: "GOLD", division: "II", leaguePoints: 45, rankedWins: 31, rankedLosses: 27, rankQueue: "solo" })]);
  });

  it("one's own rank always, even on a level without teammates' statistics", async () => {
    await signInAs("ace");
    const header = (await loadProfileHeader(handle.db, player.ace!))!;
    const { getSession } = await import("@/server/auth/session");
    const session = await getSession();
    expect(session?.capabilities).not.toContain("view-teammate-stats");
    expect(headerIdentity(header, session)).toMatchObject({ showRank: true, rank: { tier: "GOLD" } });
    const tab = await browserPayload(await ProfileAccountsTab({ db: handle.db, header, session }));
    expect(propsOf(tab, "RiotAccountsPanel")[0]!.accounts).toEqual([expect.objectContaining({ tier: "GOLD", rankedWins: 31 })]);
    // A teammate's stays hidden for the same account.
    const other = (await loadProfileHeader(handle.db, player.mate!))!;
    expect(headerIdentity(other, session)).toMatchObject({ showRank: false, rank: null });
  });
});

describe("decision 2: a personal-use profile is its player's and the administrators' only", () => {
  it("the layout and every tab page answer 'not found' to a member, a Restricted Player and a Player Manager", async () => {
    for (const name of ["mate", "rex", "pam"]) {
      await signInAs(name);
      expect(await pagesFor(player.solo!), name).toEqual(["not found", "not found", "not found", "not found", "not found"]);
    }
  });

  it("its player opens it (as My Profile) and the Owner opens it", async () => {
    await signInAs("solo");
    expect(await pagesFor(player.solo!)).toEqual(["children", "redirect /overview", "redirect /overview/accounts", "redirect /overview/champions", "redirect /overview/matches"]);
    await signInAs("owner");
    expect(await pagesFor(player.solo!)).toEqual(["rendered", "rendered", "rendered", "rendered", "rendered"]);
    // A team member's profile is unchanged for members.
    await signInAs("rex");
    expect(await pagesFor(player.ace!)).toEqual(["rendered", "rendered", "rendered", "rendered", "rendered"]);
  });

  const reads = (id: string) => [
    () => matchActions.getMatchDetailAction(id, MATCH),
    () => matchActions.getMatchTimelineAction(id, MATCH),
    () => matchActions.getMatchGroupsAction(id, MATCH),
    () => matchActions.getMatchMeetingsAction(id, MATCH, { season: 16, mode: "all", accountId: null }),
    () => matchActions.getMatchRanksAction(id, MATCH),
  ];
  const NOT_IN_HISTORY = { status: "not-found", message: "This match is not in this player's history." };

  it("the match actions refuse a member, a Restricted Player and a Player Manager, and answer its player and the Owner", async () => {
    for (const name of ["mate", "rex", "pam"]) {
      await signInAs(name);
      for (const read of reads(player.solo!)) {
        const r = await read();
        // The Restricted Player was refused before too, for want of teammates' statistics.
        if (name === "rex") expect(r, name).toMatchObject({ status: "not-found" });
        else expect(r, name).toEqual(NOT_IN_HISTORY);
      }
      for (const refresh of [matchActions.refreshMatchesAction, matchActions.catchUpFiguresAction]) expect((await refresh(player.solo!)).status, name).toBe("unavailable");
    }
    // The Player Manager may refresh team members' profiles, not this one.
    await signInAs("pam");
    expect(await matchActions.refreshMatchesAction(player.solo!)).toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    expect(await matchActions.catchUpFiguresAction(player.solo!)).toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    for (const name of ["solo", "owner"]) {
      await signInAs(name);
      expect(await matchActions.getMatchDetailAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchGroupsAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchMeetingsAction(player.solo!, MATCH, { season: 16, mode: "all", accountId: null }), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchRanksAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.refreshMatchesAction(player.solo!), name).not.toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    }
  });

  it("the profile and Riot account actions refuse a Player Manager, and still serve its player and the Owner", async () => {
    await signInAs("pam");
    const refused = { ok: false, error: "Player not found." };
    expect(await playerActions.cardPreviewFiguresAction(player.solo!, null)).toEqual(refused);
    expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null })).toEqual(refused);
    expect(await playerActions.saveProfilePatchAction(player.solo!, {}, null)).toEqual(refused);
    expect(await playerActions.archivePlayerAction(player.solo!, false)).toEqual(refused);
    expect(await accountActions.reorderAccountsAction(player.solo!, [accountId.solo!])).toEqual(refused);
    expect(await accountActions.addPlayerAccountAction(player.solo!, { riotId: "Sneaky#OCE" })).toEqual(refused);
    // Nothing was linked.
    expect((await handle.db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, player.solo!))).length).toBe(1);
    // The same Player Manager on a team member's profile: as before.
    expect(await playerActions.cardPreviewFiguresAction(player.ace!, null)).toMatchObject({ ok: true });
    expect(await accountActions.reorderAccountsAction(player.ace!, [accountId.ace!])).toMatchObject({ ok: true });
    // A member without the right is refused as before (by their capability).
    await signInAs("mate");
    expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null })).toMatchObject({ ok: false });
    for (const name of ["solo", "owner"]) {
      await signInAs(name);
      expect(await playerActions.cardPreviewFiguresAction(player.solo!, null), name).toMatchObject({ ok: true });
      expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null }), name).toEqual({ ok: true });
      expect(await accountActions.reorderAccountsAction(player.solo!, [accountId.solo!]), name).toMatchObject({ ok: true });
    }
    await signInAs("owner");
    expect(await playerActions.archivePlayerAction(player.solo!, false)).toEqual({ ok: true });
  });
});
