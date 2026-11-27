import { asc, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchDetails, matchTimelines, patches, riotAccounts, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { FIXTURE_VERSION } from "@/server/riot/static/fixture";
import { previousPatch } from "@/domain/champion-builds";

/*
  Demo data only (synthetic DEMO_ games in the in-memory demo), so Champion Intel's builds and runes
  (docs/CHAMPION_INTEL.md, "Builds and runes") have something to show in the browser tests and the
  screenshots. The demo's records are all of patch 16.20 with one build per role, while the builds
  count the game's current patch (and the one before it): without this the section would only ever
  say it has too few games. Applied after the demo's games and its recurring players, never to a
  real record, and the same on every fresh demo (the games are chosen by their champions and their
  members' names, never by the random ids). Running it twice changes nothing.

  Each queue is counted on its own (D5), so the games are chosen by queue too:
  - Thresh in support: his Ranked Solo/Duo games moved to the current patch, and the other players'
    builds made two: a most common one, and a less common one of 20 games with 16 wins (80%): shown
    as a choice with its win rate, never as the "Highest win rate" (the D6 case: fewer than 30
    games). His Ranked Flex games moved too: 18, too few, so Flex says so and offers Solo/Duo.
  - Nasus in top: most of his Ranked Solo/Duo games moved to the current patch with one build: the
    two choices agree.
  - Leona in support (and the bot lane): a few Ranked Solo/Duo games on the current patch and the
    rest on the previous one: the previous patch is added (and said); her bot lane has too few in
    Solo/Duo to show, so one role.
  - A Nasus or a Leona in a game moved for another champion (a Ranked Flex game of Thresh's) plays
    the fixture's build too, so no moved game keeps a seeded build, which follows the random ids.
  - Everything else stays on its own patch: Ahri, Jinx and the other champions the browser tests
    open show the honest "not enough games" line.
  The "Highest win rate" view and a role choice between two roles are the Master+ demo's
  (server/demo/high-elo.ts), shown only to the browser tests: an honest rule rarely finds one in
  the team's sample sizes.
  A rewritten player's purchases follow one plain path (starting items, boots, then completed items
  every few minutes), and their record's final items and rune page match it. The team members' own
  players are never rewritten.
*/

interface DemoBuild {
  start: number[];
  boots: number;
  /** Completed items in the order bought (the first three are the core). */
  items: number[];
  runes: NonNullable<MatchParticipantDetail["runes"]>;
}

const THRESH_COMMON: DemoBuild = {
  start: [3865, 2003, 2003],
  boots: 3158,
  items: [3190, 3107, 3109, 3222, 3050],
  runes: { keystone: 8439, primary: 8400, secondary: 8300, primaryPerks: [8439, 8463, 8473, 8242], secondaryPerks: [8304, 8347], shards: [5007, 5008, 5001] },
};
const THRESH_WINNING: DemoBuild = {
  start: [3865, 2003, 2003],
  boots: 3047,
  items: [3190, 3050, 3109, 3107, 3222],
  runes: { keystone: 8465, primary: 8400, secondary: 8300, primaryPerks: [8465, 8463, 8473, 8242], secondaryPerks: [8304, 8347], shards: [5007, 5008, 5001] },
};
const NASUS: DemoBuild = {
  start: [1054, 2003],
  boots: 3047,
  items: [3078, 3065, 3075, 3742, 3143],
  runes: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8444, 8451], shards: [5005, 5008, 5001] },
};
const LEONA: DemoBuild = {
  start: [3865, 2003, 2003],
  boots: 3047,
  items: [3190, 3109, 3050, 3075, 3143],
  runes: { keystone: 8439, primary: 8400, secondary: 8300, primaryPerks: [8439, 8463, 8473, 8242], secondaryPerks: [8304, 8347], shards: [5007, 5008, 5001] },
};

/** The demo's position names (the demo's records carry the role names). */
const SUPPORT = new Set(["SUPPORT", "UTILITY"]);
const TOP = new Set(["TOP"]);
const BOT = new Set(["ADC", "BOTTOM"]);

/** How many of Thresh's rewritten Solo/Duo games take the less common build: won and lost (16 of 20, 80%: the D6 case). */
const WINNING_WINS = 16;
const WINNING_LOSSES = 4;
/** Nasus in top: Solo/Duo games moved to the current patch. */
const NASUS_GAMES = 30;
/** The queues the fixture moves: Ranked Solo/Duo, and Ranked Flex for Thresh's few. */
const SOLO = 420;
const FLEX = 440;
/** Leona: games of hers moved to the current patch in each role (the rest go to the previous one). */
const LEONA_CURRENT = { support: 8, bot: 4 };

/** The purchases a build makes in a game of `durationS`: the start at once, boots at 5:00, then a completed item every 4:00 from 8:00. */
function purchasesOf(build: DemoBuild, durationS: number): Array<[number, number]> {
  const end = durationS * 1000;
  const out: Array<[number, number]> = build.start.map((id, i) => [1_000 + i * 300, id]);
  out.push([300_000, build.boots]);
  build.items.forEach((id, i) => {
    const at = 480_000 + i * 240_000;
    if (at < end - 30_000) out.push([at, id]);
  });
  return out;
}

/** The record's final items for those purchases: the completed items and the boots, the starting item a support keeps, then the trinket. */
function finalItems(build: DemoBuild, purchases: ReadonlyArray<readonly [number, number]>, trinket: number): number[] {
  const done = purchases.map(([, id]) => id).filter((id) => build.items.includes(id));
  const kept = build.start.filter((id) => id !== 2003).slice(0, 1);
  const six = [...done, build.boots, ...kept].slice(0, 6);
  return [...six, ...Array.from({ length: 6 - six.length }, () => 0), trinket];
}

/** A game's place in a fresh demo, the same whatever its random ids: a member's game by the member's name and its number, else its match id. */
function gameKey(matchId: string, participants: readonly MatchParticipantDetail[]): string {
  const own = /^DEMO_([^_]+)_(\d+)$/.exec(matchId);
  const me = own ? participants.find((p) => p.puuid.startsWith(`demo-${own[1]}`)) : undefined;
  return me && own ? `${me.name}#${own[2]!.padStart(3, "0")}` : matchId;
}

export async function applyDemoBuilds(db: Db): Promise<void> {
  const [current] = await db.select({ id: patches.id, version: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1);
  if (!current || current.version === FIXTURE_VERSION) return;
  const known = (await db.select({ id: patches.id }).from(patches).orderBy(desc(patches.sortKey))).map((r) => r.id);
  const previous = previousPatch(current.id, known);
  const members = new Set((await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(isNotNull(riotAccounts.puuid))).map((r) => r.puuid!));
  const records = (await db.select({ matchId: matchDetails.matchId, queueId: matchDetails.queueId, participants: matchDetails.participants, gameVersion: matchDetails.gameVersion, duration: matchDetails.gameDuration }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%")).orderBy(asc(matchDetails.matchId)))
    .filter((r) => r.participants.length > 0)
    .map((r) => ({ ...r, key: gameKey(r.matchId, r.participants) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!records.length) return;
  const timelines = new Map((await db.select({ matchId: matchTimelines.matchId, participants: matchTimelines.participants }).from(matchTimelines).where(inArray(matchTimelines.matchId, records.map((r) => r.matchId)))).map((t) => [t.matchId, t.participants]));

  // Every player on the champion in those positions (the demo can put it on both sides of one game).
  const seats = (r: (typeof records)[number], champion: string, positions: Set<string>) => r.participants.filter((p) => p.championId === champion && positions.has(p.position ?? "") && !p.removed);
  const version = (patch: string) => `${patch}.1`;
  const patchOf = new Map<string, string>();
  const rewrite = new Map<string, Map<string, DemoBuild>>();
  const give = (matchId: string, puuid: string, build: DemoBuild) => {
    if (members.has(puuid)) return;
    const m = rewrite.get(matchId) ?? new Map<string, DemoBuild>();
    m.set(puuid, build);
    rewrite.set(matchId, m);
  };

  // Thresh in support: every Solo/Duo and Flex game on the current patch; in Solo/Duo the others'
  // builds two, the less common one taken by WINNING_WINS won and WINNING_LOSSES lost games that
  // have a timeline.
  let wins = 0;
  let losses = 0;
  for (const r of records) {
    const found = seats(r, "Thresh", SUPPORT);
    if (!found.length || (r.queueId !== SOLO && r.queueId !== FLEX)) continue;
    patchOf.set(r.matchId, current.id);
    for (const p of found) {
      const timed = timelines.get(r.matchId)?.some((t) => t.puuid === p.puuid) ?? false;
      let build = THRESH_COMMON;
      if (r.queueId === SOLO && timed && !members.has(p.puuid) && (p.win ? wins < WINNING_WINS : losses < WINNING_LOSSES)) {
        build = THRESH_WINNING;
        if (p.win) wins += 1;
        else losses += 1;
      }
      give(r.matchId, p.puuid, build);
    }
  }
  // Nasus in top: NASUS_GAMES Solo/Duo games on the current patch, one build.
  let nasus = 0;
  for (const r of records) {
    const found = seats(r, "Nasus", TOP);
    if (!found.length || r.queueId !== SOLO || nasus >= NASUS_GAMES) continue;
    nasus += 1;
    patchOf.set(r.matchId, current.id);
    for (const p of found) give(r.matchId, p.puuid, NASUS);
  }
  // Leona in support and in the bot lane: a few Solo/Duo games on the current patch, the rest on the previous one.
  if (previous) {
    const taken = { support: 0, bot: 0 };
    for (const r of records) {
      if (r.queueId !== SOLO) continue;
      const support = seats(r, "Leona", SUPPORT);
      const found = [...support, ...seats(r, "Leona", BOT)];
      if (!found.length) continue;
      const role = support.length ? "support" : "bot";
      if (!patchOf.has(r.matchId)) patchOf.set(r.matchId, taken[role] < LEONA_CURRENT[role] ? current.id : previous);
      if (patchOf.get(r.matchId) === current.id) taken[role] += 1;
      for (const p of found) give(r.matchId, p.puuid, LEONA);
    }
  }

  // A Nasus or a Leona in a game moved for another champion plays that champion's build too (every
  // moved game's builds are the fixture's). Leona's own games are Solo/Duo's, so a Leona met in a
  // Ranked Flex game moved for Thresh kept the demo's seeded build, which is drawn from a sequence
  // seeded by the game's match id (server/demo/seed), and so by the member's random player id: on
  // the current patch it differed from one fresh demo to the next.
  const everyMoved = [["Nasus", TOP, NASUS], ["Leona", SUPPORT, LEONA], ["Leona", BOT, LEONA]] as const;
  for (const r of records) if (patchOf.has(r.matchId)) for (const [champion, positions, build] of everyMoved) for (const p of seats(r, champion, positions)) if (!rewrite.get(r.matchId)?.has(p.puuid)) give(r.matchId, p.puuid, build);

  for (const r of records) {
    const patch = patchOf.get(r.matchId);
    const builds = rewrite.get(r.matchId);
    if (!patch && !builds) continue;
    const purchases = new Map<string, Array<[number, number]>>();
    const participants = r.participants.map((p) => {
      const build = builds?.get(p.puuid);
      if (!build) return p;
      const bought = purchasesOf(build, r.duration);
      purchases.set(p.puuid, bought);
      const runes = { ...build.runes, primaryPerks: [...build.runes.primaryPerks!], secondaryPerks: [...build.runes.secondaryPerks!], shards: [...build.runes.shards!] as [number, number, number] };
      return { ...p, items: finalItems(build, bought, p.items?.[6] ?? 3364), runes };
    });
    await db.update(matchDetails).set({ participants, ...(patch ? { gameVersion: version(patch) } : {}) }).where(eq(matchDetails.matchId, r.matchId));
    const tl = timelines.get(r.matchId);
    if (tl && purchases.size) {
      const next: MatchTimelineParticipant[] = tl.map((t) => {
        const bought = purchases.get(t.puuid);
        if (!bought) return t;
        const { sold: _sold, destroyed: _destroyed, ...rest } = t;
        return { ...rest, purchases: bought };
      });
      await db.update(matchTimelines).set({ participants: next }).where(eq(matchTimelines.matchId, r.matchId));
    }
  }
}
