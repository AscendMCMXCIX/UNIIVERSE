import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { getOrCreateTeam } from "@/server/repositories/team";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { loadPlayedTogether } from "@/server/matches/played-together";
import { loadScoreSources, togetherScores } from "@/server/matches/together-scores";
import { getMatchTimeline } from "@/server/accounts/match-timeline";
import { getMatchDetail, scoreRecordOf } from "@/server/players/match-history";
import { finalScoresOf, scoreInputsOf } from "@/domain/performance-inputs";
import { togetherEntry } from "@/domain/played-together";
import { matchDetails } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { processEgress } from "@/server/db/egress";

/*
  Team → Matches' member scores (the owner's requirements of 25 Nov 2026: one look for places across
  the site) are the opened game's score and place for each member, never another calculation: each
  shown game is scored once through Match History's own functions, from a record trimmed in the
  database to the score's figures. On the demo roster every member of every listed game is compared
  with getMatchDetail + getMatchTimeline + finalScoresOf, the way the opened game computes it in the
  browser; the trimmed record reads exactly what the whole one does; and on Postgres the bytes the
  database sends for the default page are measured (docs/HOSTING_USAGE.md).
*/

let demo: DbHandle;
let teamId: string;

beforeAll(async () => {
  demo = await testDb();
  await syncStaticData(demo.db, new FixtureStaticProvider(), { fingerprint: false });
  await seedDemoRoster(demo.db);
  await seedDemoAccounts(demo.db);
  teamId = (await getOrCreateTeam(demo.db)).id;
}, 120_000);
afterAll(async () => {
  await demo.close();
});

describe("Team Matches' member scores", () => {
  it("are each member's opened-game score and place, MVP only on a won game and ACE only on a lost one", async () => {
    const data = await loadPlayedTogether(demo.db, teamId);
    const shown = data.games.slice(0, 20);
    expect(shown.length).toBeGreaterThan(2);
    const scores = await togetherScores(demo.db, teamId, shown, { riotConfigured: false });
    let compared = 0;
    for (const g of shown) {
      const entry = scores[togetherEntry(g.matchId, g.teamId)]!;
      expect(Object.keys(entry).sort()).toEqual(g.members.map((m) => m.playerId).sort());
      const ranks: number[] = [];
      for (const m of g.members) {
        const detail = await getMatchDetail(demo.db, m.playerId, g.matchId, { viewerIsOwner: true });
        if (detail.status !== "ok") throw new Error("demo record missing");
        const tl = await getMatchTimeline(demo.db, m.playerId, g.matchId, { fetch: false });
        const opened = finalScoresOf(detail.view, tl.status === "ok" ? tl.timeline : null);
        const mine = opened?.players.find((p) => p.slot === detail.view.player.slot);
        const got = entry[m.playerId]!;
        if (!opened || !mine) {
          expect(got.state).toBe("none");
          continue;
        }
        expect(got, `${g.matchId} ${m.playerId}`).toEqual({ state: "ok", score: mine.score, rank: mine.rank, of: opened.scored, mvp: mine.mvp, ace: mine.ace, version: opened.version });
        if (got.state !== "ok") continue;
        ranks.push(got.rank);
        if (got.mvp) expect(g.win, "an MVP on a won game").toBe(true);
        if (got.ace) expect(g.win, "an ACE on a lost game").toBe(false);
        compared += 1;
      }
      expect(new Set(ranks).size, "each member's place once").toBe(ranks.length);
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("score from a trimmed record that reads exactly what the whole record does", async () => {
    const data = await loadPlayedTogether(demo.db, teamId);
    const ids = data.games.slice(0, 5).map((g) => g.matchId);
    const sources = await loadScoreSources(demo.db, ids);
    const whole = await demo.db.select().from(matchDetails).where(inArray(matchDetails.matchId, ids));
    expect(sources.size).toBe(whole.length);
    for (const d of whole) {
      const t = sources.get(d.matchId)!;
      expect([t.queueId, t.gameDuration]).toEqual([d.queueId, d.gameDuration]);
      // The score's inputs, built by the scoreboard's own mapping, and its scores are the same from both.
      const [trimmed, full] = [scoreRecordOf(t, t.participants[0]!), scoreRecordOf(d, d.participants[0]!)];
      expect(scoreInputsOf(trimmed, null)).toEqual(scoreInputsOf(full, null));
      expect(trimmed.teams.map((x) => [x.teamId, x.win, x.kills])).toEqual(full.teams.map((x) => [x.teamId, x.win, x.kills]));
      expect(finalScoresOf(trimmed, null)).toEqual(finalScoresOf(full, null));
      // Nothing the score does not read: no names, items, spells, runes or challenges.
      for (const p of t.participants) expect([p.name, p.items, p.spells, p.runes, p.challenges]).toEqual([null, null, null, null, undefined]);
    }
  });

  it("give no score to a game without a stored record, and an empty answer for no games", async () => {
    expect(await togetherScores(demo.db, teamId, [], { riotConfigured: false })).toEqual({});
    const missing = await togetherScores(demo.db, teamId, [{ matchId: "OC1_NOT_STORED", teamId: 100, members: [{ playerId: "p1", championId: "Ahri" }] }], { riotConfigured: false });
    expect(missing).toEqual({ [togetherEntry("OC1_NOT_STORED", 100)]: { p1: { state: "none" } } });
  });

  it("read a few KB a game from the database (Postgres only: the app counts what it sends)", async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const data = await loadPlayedTogether(demo.db, teamId);
    const shown = data.games.slice(0, 20);
    const at = processEgress().bytes;
    await togetherScores(demo.db, teamId, shown, { riotConfigured: false });
    const bytes = processEgress().bytes - at;
    const perGame = bytes / shown.length;
    // Measured 25 Nov 2026 on the demo (docs/HOSTING_USAGE.md): the trimmed records, the members' PUUID lookup and any lane timelines.
    console.info(`together-scores egress: ${bytes} bytes for ${shown.length} games (${Math.round(perGame)} a game)`);
    expect(perGame).toBeLessThan(4_000);
  });
});
