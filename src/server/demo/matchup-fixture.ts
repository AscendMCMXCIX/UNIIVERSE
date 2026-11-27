import { asc, eq, inArray, isNotNull, like } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchDetails, matchTimelines, matchupNotes, riotAccounts, type MatchFrames, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { getCurrentPatch } from "@/server/repositories/champions";
import { currentKits } from "@/server/matchup/notes-store";
import { laneOf } from "@/domain/match-analysis";
import type { NoteInput } from "@/domain/matchup/notes";
import { publicPatchName } from "@/domain/patch";

/*
  Demo data only (synthetic DEMO_ games and notes in the in-memory demo), so Matchup Intel's band
  (docs/MATCHUP_INTEL.md) has every state to show in the browser tests and the screenshots: the
  demo's games are drawn per member, and two champions rarely meet in one lane often enough.
  Applied after the demo's builds (builds-fixture.ts), never to a real record, and the same on every
  fresh demo (games chosen by their members' names and numbers, never by random ids); running it
  twice changes nothing.

  - Ahri against Zed in Mid: AHRI_ZED Ranked Solo/Duo games with a timeline, both of them the
    others' lane opponents (the two mid seats of members' games in another lane are set to them,
    their frames drawn as a lane, Ahri's kills on Zed and Zed's on her before 10:00 at times no
    other death shares, and first blood in a few): the figures.
  - Riven against Darius in Top: RIVEN_DARIUS games: "figures show from 10".
  - Two reviewed notes, published on the current patch with the champions' kit hashes as stored:
    an opponent note on Zed in Mid and one on Darius in Top (observations, never advice).
  The members' own seats, champions and results are never changed; the records keep their patch
  (so no champion's builds move), and only the two seats' champions, frames and kill times are.
*/

const AHRI_ZED = 14;
const RIVEN_DARIUS = 4;

const DEMO_NOTES: NoteInput[] = [
  {
    scope: "opponent",
    role: "MID",
    opponentId: "Zed",
    championId: null,
    points: [
      { text: "Zed's W leaves a shadow that repeats his Q and E, so those skillshots can come from two places at once.", refs: ["Zed.W", "Zed.Q", "Zed.E"], levels: "1-3" },
      { text: "Zed's abilities cost energy, which refills over time rather than from mana items.", refs: ["Zed.Q"], levels: null },
      { text: "Zed's R makes him untargetable as he moves behind his target and marks it.", refs: ["Zed.R"], levels: "6" },
    ],
    sources: [{ kind: "ddragon", title: "Zed's abilities in Riot's Data Dragon", url: "", patch: "" }],
  },
  {
    scope: "opponent",
    role: "TOP",
    opponentId: "Darius",
    championId: null,
    points: [
      { text: "Darius's passive applies a bleed that stacks with his attacks and abilities.", refs: ["Darius.P"], levels: null },
      { text: "Darius's E pulls champions in front of him and slows them.", refs: ["Darius.E"], levels: "1-3" },
    ],
    sources: [{ kind: "ddragon", title: "Darius's abilities in Riot's Data Dragon", url: "", patch: "" }],
  },
];

/** A game's place in a fresh demo, the same whatever its random ids: the member's name and its number. */
function gameKey(matchId: string, participants: readonly MatchParticipantDetail[]): string {
  const own = /^DEMO_([^_]+)_(\d+)$/.exec(matchId);
  const me = own ? participants.find((p) => p.puuid.startsWith(`demo-${own[1]}`)) : undefined;
  return me && own ? `${me.name}#${own[2]!.padStart(3, "0")}` : `~${matchId}`;
}

/** A lane's series over the frames: gold, experience and CS from Riot-like rates, `lead` gold a minute more or less. */
function laneSeries(t: readonly number[], lead: number, support: boolean): { g: number[]; x: number[]; c: number[] } {
  return {
    g: t.map((ms) => Math.round(500 + (ms / 60_000) * ((support ? 250 : 380) + lead))),
    x: t.map((ms) => Math.round(Math.max(0, ms / 60_000 - 1.5) * (430 + lead / 4))),
    c: t.map((ms) => Math.round(Math.max(0, ms / 60_000 - 1.5) * (support ? 1.2 : 7.2 + lead / 200))),
  };
}

export async function applyDemoMatchups(db: Db): Promise<void> {
  const members = new Set((await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(isNotNull(riotAccounts.puuid))).map((r) => r.puuid!));
  const records = (await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants, queueId: matchDetails.queueId }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%")).orderBy(asc(matchDetails.matchId)))
    .filter((r) => r.participants.length === 10 && /^DEMO_[^_]+_\d+$/.test(r.matchId))
    .map((r) => ({ ...r, key: gameKey(r.matchId, r.participants) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!records.length) return;
  const timelines = new Map((await db.select({ matchId: matchTimelines.matchId, participants: matchTimelines.participants, frames: matchTimelines.frames }).from(matchTimelines).where(inArray(matchTimelines.matchId, records.map((r) => r.matchId)))).map((t) => [t.matchId, t]));

  const used = new Set<string>();
  /** The pairs already in the demo (a member's own lane), and the games set to the pair until `want`. */
  const place = async (a: string, b: string, lane: "MIDDLE" | "TOP", want: number, plan: (i: number) => { lead: number; aWins?: boolean; kills: Array<"A" | "B">; firstBlood: "A" | "B" | null }) => {
    const seatOf = (parts: readonly MatchParticipantDetail[], champion: string) => parts.findIndex((p) => p.championId === champion && laneOf(p.position) === lane);
    let have = records.filter((r) => r.queueId === 420 && timelines.get(r.matchId)?.frames && seatOf(r.participants, a) >= 0 && seatOf(r.participants, b) >= 0 && r.participants[seatOf(r.participants, a)]!.teamId !== r.participants[seatOf(r.participants, b)]!.teamId).length;
    let i = 0;
    for (const r of records) {
      if (have >= want) break;
      const tl = timelines.get(r.matchId);
      if (used.has(r.matchId) || r.queueId !== 420 || !tl?.frames || !tl.participants.length) continue;
      if (r.participants.some((p) => p.championId === a || p.championId === b)) continue;
      const seats = r.participants.flatMap((p, k) => (laneOf(p.position) === lane ? [k] : []));
      if (seats.length !== 2 || seats.some((k) => members.has(r.participants[k]!.puuid))) continue;
      const [sa, sb] = r.participants[seats[0]!]!.teamId === r.participants[seats[1]!]!.teamId ? [-1, -1] : [seats[0]!, seats[1]!];
      if (sa < 0) continue;
      const step = plan(i++);
      used.add(r.matchId);
      have += 1;
      const pa = r.participants[sa]!;
      const pb = r.participants[sb]!;
      const frames: MatchFrames = { t: tl.frames.t, p: { ...tl.frames.p, [pa.puuid]: laneSeries(tl.frames.t, step.lead, false), [pb.puuid]: laneSeries(tl.frames.t, -step.lead, false) } };
      // Kill times before 10:00 that no other death in the game shares.
      const taken = new Set(tl.participants.flatMap((p) => p.deaths ?? []));
      const kills: Array<{ by: string; on: string; at: number }> = [];
      step.kills.forEach((who, k) => {
        let at = 150_000 + k * 97_000 + (i % 5) * 1_013;
        while (taken.has(at)) at += 7;
        taken.add(at);
        kills.push(who === "A" ? { by: pa.puuid, on: pb.puuid, at } : { by: pb.puuid, on: pa.puuid, at });
      });
      const participants: MatchTimelineParticipant[] = tl.participants.map((p) => {
        const mine = kills.filter((k) => k.by === p.puuid).map((k) => k.at);
        const theirs = kills.filter((k) => k.on === p.puuid).map((k) => k.at);
        if (p.puuid !== pa.puuid && p.puuid !== pb.puuid) return p;
        return { ...p, kills: [...(p.kills ?? []).filter((t) => t >= 600_000), ...mine].sort((x, y) => x - y), deaths: [...(p.deaths ?? []).filter((t) => t >= 600_000), ...theirs].sort((x, y) => x - y) };
      });
      const nobodyFirst = r.participants.every((p) => p.stats?.firstBloodKill !== true);
      const parts = r.participants.map((p, k) => {
        if (k !== sa && k !== sb) return p;
        const isA = k === sa;
        const champion = isA ? a : b;
        const fb = nobodyFirst && step.firstBlood !== null && (step.firstBlood === "A") === isA;
        return { ...p, championId: champion, stats: { ...(p.stats ?? {}), firstBloodKill: fb } };
      });
      await db.update(matchDetails).set({ participants: parts }).where(eq(matchDetails.matchId, r.matchId));
      await db.update(matchTimelines).set({ frames, participants }).where(eq(matchTimelines.matchId, r.matchId));
    }
  };
  // Ahri ahead at 10:00 in 9 of the games, behind in the rest; kills on each other in some; first blood in five.
  await place("Ahri", "Zed", "MIDDLE", AHRI_ZED, (i) => ({ lead: i % 3 === 2 ? -40 : 25 + (i % 4) * 5, kills: i % 4 === 0 ? ["A"] : i % 4 === 1 ? ["B", "A"] : i % 4 === 2 ? ["B"] : [], firstBlood: i % 3 === 0 ? "A" : i % 5 === 1 ? "B" : null }));
  await place("Riven", "Darius", "TOP", RIVEN_DARIUS, (i) => ({ lead: i % 2 ? 20 : -20, kills: [], firstBlood: null }));

  // The two reviewed notes, published on the current patch with the kits as stored.
  const current = await getCurrentPatch(db);
  const existing = await db.select({ id: matchupNotes.id }).from(matchupNotes).limit(1);
  if (!current || existing.length) return;
  const { kits, abilities } = await currentKits(db, DEMO_NOTES.map((n) => n.opponentId));
  for (const n of DEMO_NOTES) {
    const hash = kits[n.opponentId];
    if (!hash) continue;
    await db.insert(matchupNotes).values({
      scope: n.scope,
      role: n.role,
      opponentId: n.opponentId,
      championId: n.championId,
      status: "published",
      points: n.points,
      sources: n.sources.map((s) => ({ ...s, patch: publicPatchName(current.patch) })),
      reviewedAt: new Date(),
      reviewedPatch: current.patch,
      reviewedVersion: current.ddragonVersion,
      kitHashes: { [n.opponentId]: hash },
      abilityHashes: { [n.opponentId]: abilities[n.opponentId] ?? {} },
    });
  }
}
