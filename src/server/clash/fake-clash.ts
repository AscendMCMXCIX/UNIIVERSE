import type { ClashPlayer, ClashTeam, ClashTournament } from "@/server/riot/api/schemas";
import type { ClashFeature } from "./features";
import { ClashApiError, CLASH_FAILURE_TEXT, type ClashSource } from "./source-types";

/*
  Browser tests and the in-memory demo only: a stand-in for Riot's Clash data, so the Clash
  workspace can be tested in every state without a Riot key. It is used only with
  UNIIVERSE_FAKE_RIOT_IDS=1 on the in-memory demo database, never on a deployment (the same rule as
  the account stand-in in server/riot/verify-identity.ts), and only when a test asks for it with
  the uniiverse_fake_clash cookie: "<features>|<scenario>", e.g. "registration,rosters|underway".
  Real data never meets it.

  Our team is made of the demo players' accounts (their PUUIDs start with "demo-") and one player
  who is not in UNIIVERSE. The opponents are the team the screenshot stand-in reads (Night Owls
  Gaming, names in five scripts), registered for the same day; their PUUIDs are the ones the
  account stand-in gives their Riot IDs.
*/

export const FAKE_CLASH_COOKIE = "uniiverse_fake_clash";

export const FAKE_CLASH_SCENARIOS = ["none", "upcoming", "open", "registered", "approaching", "underway", "two-teams", "cancelled", "stale-roster", "unavailable", "forbidden"] as const;
export type FakeClashScenario = (typeof FAKE_CLASH_SCENARIOS)[number];

export function fakeClashMode(): boolean {
  return process.env.UNIIVERSE_FAKE_RIOT_IDS === "1" && process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
}

/** The stand-in's switches and scenario for this request, or null (no stand-in: real switches, real Riot). */
export async function fakeClashSettings(): Promise<{ features: Set<ClashFeature>; scenario: FakeClashScenario } | null> {
  if (!fakeClashMode()) return null;
  let raw: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    raw = (await cookies()).get(FAKE_CLASH_COOKIE)?.value;
  } catch {
    return null; // outside a request (a job): no stand-in
  }
  if (!raw) return null;
  const [features = "", scenario = "registered"] = decodeURIComponent(raw).split("|");
  const known = (FAKE_CLASH_SCENARIOS as readonly string[]).includes(scenario) ? (scenario as FakeClashScenario) : "registered";
  const wanted = new Set(features.split(/[\s,]+/));
  return { features: new Set((["registration", "rosters", "capture"] as const).filter((f) => wanted.has(f))), scenario: known };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The opponents the screenshot stand-in reads, as Riot would register them. */
export const FAKE_OPPONENTS: Array<{ gameName: string; tagLine: string; position: string }> = [
  { gameName: "Пётр Пустота", tagLine: "RU1", position: "TOP" },
  { gameName: "오징어게임", tagLine: "KR1", position: "JUNGLE" },
  { gameName: "ドラゴンの心", tagLine: "JP1", position: "MIDDLE" },
  { gameName: "我是大魔王", tagLine: "CN1", position: "BOTTOM" },
  { gameName: "xX_Sn1per_Xx", tagLine: "OCE", position: "UTILITY" },
];
/** The account stand-in's PUUID for a Riot ID (server/riot/verify-identity.ts). */
export const fakePuuid = (gameName: string, tagLine: string) => `browser-test-${gameName.toLowerCase()}-${tagLine.toLowerCase()}`;
const OUTSIDER = { gameName: "Friend of the Team", tagLine: "OCE" };
const STALE = [
  { gameName: "Former Top", tagLine: "OCE" },
  { gameName: "Former Mid", tagLine: "OCE" },
  { gameName: "Former Support", tagLine: "OCE" },
];

function tournamentsFor(scenario: FakeClashScenario, now: number): ClashTournament[] {
  const phase = (id: number, registration: number, start: number, cancelled = false) => ({ id, registrationTime: now + registration, startTime: now + start, cancelled });
  switch (scenario) {
    case "none":
      return [];
    case "upcoming":
      return [{ id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, 3 * DAY, 6 * DAY)] }];
    case "open":
    case "registered":
      return [{ id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, -DAY, 3 * DAY)] }];
    case "approaching":
      return [{ id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, -4 * DAY, 3 * HOUR)] }];
    case "underway":
    case "stale-roster":
      return [{ id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, -4 * DAY, -HOUR)] }];
    case "two-teams":
      return [
        { id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, -DAY, 3 * DAY)] },
        { id: 9102, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_2", schedule: [phase(9202, -DAY, 4 * DAY)] },
      ];
    case "cancelled":
      return [{ id: 9101, themeId: 4, nameKey: "bilgewater", nameKeySecondary: "day_1", schedule: [phase(9201, -DAY, 3 * DAY, true)] }];
    default:
      return [];
  }
}

const OURS = "fake-ours";
const OURS_SECOND = "fake-ours-2";
const OPPONENTS = "fake-night-owls";

/** A stand-in for one scenario. Our members are the "demo-" accounts asked about, in the order asked. */
export function createFakeClashSource(scenario: FakeClashScenario, clock: () => number = Date.now): ClashSource {
  let requests = 0;
  const members: string[] = [];
  const fail = () => {
    if (scenario === "unavailable") throw new ClashApiError("unavailable", CLASH_FAILURE_TEXT.unavailable);
    if (scenario === "forbidden") throw new ClashApiError("forbidden", CLASH_FAILURE_TEXT.forbidden);
  };
  const registered = scenario === "registered" || scenario === "approaching" || scenario === "underway" || scenario === "two-teams" || scenario === "cancelled" || scenario === "stale-roster";
  const ourTeam = (id: string): ClashTeam => {
    const sorted = [...members].sort();
    const mine = scenario === "two-teams" ? sorted.filter((_, i) => (id === OURS ? i % 2 === 0 : i % 2 === 1)).slice(0, 4) : sorted.slice(0, 4);
    const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    return {
      id,
      tournamentId: id === OURS_SECOND ? 9102 : 9101,
      name: id === OURS_SECOND ? "Demo Clash Team Two" : "Demo Clash Team",
      abbreviation: id === OURS_SECOND ? "DC2" : "DCT",
      tier: 2,
      iconId: 1,
      players: [
        ...mine.map((puuid, i) => ({ puuid, position: positions[i]!, role: i === 0 ? "CAPTAIN" : "MEMBER" })),
        { puuid: fakePuuid(OUTSIDER.gameName, OUTSIDER.tagLine), position: "FILL", role: "MEMBER" },
      ],
    };
  };
  const opponents = (): ClashTeam => ({
    id: OPPONENTS,
    tournamentId: 9101,
    name: "Night Owls Gaming",
    abbreviation: "NOG",
    tier: 2,
    iconId: 7,
    players: (scenario === "stale-roster" ? [...FAKE_OPPONENTS.slice(0, 2), ...STALE.map((s, i) => ({ ...s, position: ["MIDDLE", "BOTTOM", "UTILITY"][i]! }))] : FAKE_OPPONENTS).map((o, i) => ({
      puuid: fakePuuid(o.gameName, o.tagLine),
      position: o.position ?? "FILL",
      role: i === 1 ? "CAPTAIN" : "MEMBER",
    })),
  });
  const opponentPuuids = () => new Set(opponents().players.map((p) => p.puuid));
  const named = new Map([...FAKE_OPPONENTS, OUTSIDER, ...STALE].map((o) => [fakePuuid(o.gameName, o.tagLine), `${o.gameName}#${o.tagLine}`]));

  return {
    async tournaments() {
      requests++;
      fail();
      return tournamentsFor(scenario, clock());
    },
    async registrations(_platform, puuid): Promise<ClashPlayer[]> {
      requests++;
      fail();
      if (puuid.startsWith("demo-")) {
        if (!members.includes(puuid)) members.push(puuid);
        if (!registered) return [];
        const sorted = [...members].sort();
        const team = scenario === "two-teams" && sorted.indexOf(puuid) % 2 === 1 ? OURS_SECOND : OURS;
        return [{ puuid, teamId: team, position: "FILL", role: "MEMBER" }];
      }
      if ((scenario === "underway" || scenario === "stale-roster") && opponentPuuids().has(puuid)) return [{ puuid, teamId: OPPONENTS, position: "FILL", role: "MEMBER" }];
      return [];
    },
    async team(_platform, teamId) {
      requests++;
      fail();
      if (teamId === OURS || teamId === OURS_SECOND) return registered ? ourTeam(teamId) : null;
      if (teamId === OPPONENTS) return opponents();
      return null;
    },
    async tournamentOfTeam(_platform, teamId) {
      requests++;
      fail();
      const all = tournamentsFor(scenario, clock());
      return all.find((t) => t.id === (teamId === OURS_SECOND ? 9102 : 9101)) ?? null;
    },
    async riotId(_platform, puuid) {
      requests++;
      fail();
      const known = named.get(puuid);
      if (known) return known;
      const m = /^browser-test-(.+)-([^-]+)$/.exec(puuid);
      return m ? `${m[1]}#${m[2]!.toUpperCase()}` : null;
    },
    get requests() {
      return requests;
    },
  };
}
