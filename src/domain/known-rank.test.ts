import { describe, expect, it } from "vitest";
import { matchRankQueue, participantRank, rankBadgeLabel, rankChecksWhen, rankShortLabel, RANK_FRESH_DAYS, type ParticipantRank, type RankReading } from "./known-rank";

const DAY = 86_400_000;
const now = new Date("2026-10-19T12:00:00Z");
const at = (iso: string) => new Date(iso).getTime();
const gold2 = { tier: "GOLD", division: "II", leaguePoints: 45 };
const plat4 = { tier: "PLATINUM", division: "IV", leaguePoints: 12 };
const check = (iso: string, solo: RankReading["solo"], flex: RankReading["flex"]): RankReading => ({ at: at(iso), kind: "check", solo, flex });
const sighting = (iso: string, solo: RankReading["solo"]): RankReading => ({ at: at(iso), kind: "sighting", solo, flex: null });

describe("which rank a match window shows", () => {
  it("is the match's own ranked queue when the player has a rank there, else the other one", () => {
    const both = [check("2026-10-19T08:00:00Z", gold2, plat4)];
    expect(participantRank(both, 420, now.getTime())).toMatchObject({ state: "ranked", queue: "solo", tier: "GOLD", division: "II", leaguePoints: 45 });
    expect(participantRank(both, 440, now.getTime())).toMatchObject({ state: "ranked", queue: "flex", tier: "PLATINUM" });
    // Normal games, ARAM, Clash: Solo/Duo first.
    expect(participantRank(both, 400, now.getTime()).queue).toBe("solo");
    expect(participantRank(both, null, now.getTime()).queue).toBe("solo");
    // Ranked in Flex only: shown in a Solo/Duo game, as Flex.
    expect(participantRank([check("2026-10-19T08:00:00Z", "unranked", plat4)], 420, now.getTime())).toMatchObject({ state: "ranked", queue: "flex" });
    expect(matchRankQueue(440)).toBe("flex");
    expect(matchRankQueue(420)).toBe("solo");
  });

  it("is unranked only on a check's word, and unknown with no reading at all (never unranked by default)", () => {
    expect(participantRank([check("2026-10-18T00:00:00Z", "unranked", "unranked")], 420, now.getTime())).toMatchObject({ state: "unranked", kind: "check", asOf: "2026-10-18T00:00:00.000Z" });
    expect(participantRank([], 420, now.getTime())).toMatchObject({ state: "unknown", asOf: null, stale: true });
    // A sighting never recorded an absence of rank.
    expect(participantRank([sighting("2026-10-18T00:00:00Z", "unranked")], 420, now.getTime()).state).toBe("unknown");
  });

  it("takes the newest reading; it is stale without a check in the last three days", () => {
    const fresh = check(new Date(now.getTime() - (RANK_FRESH_DAYS * DAY - 60_000)).toISOString(), gold2, "unranked");
    const old = check(new Date(now.getTime() - (RANK_FRESH_DAYS * DAY + 60_000)).toISOString(), plat4, "unranked");
    expect(participantRank([fresh], 420, now.getTime()).stale).toBe(false);
    expect(participantRank([old], 420, now.getTime()).stale).toBe(true);
    expect(participantRank([old, fresh], 420, now.getTime())).toMatchObject({ tier: "GOLD", stale: false });
    // A newer sighting is shown, but only a check makes the rank current.
    const r = participantRank([old, sighting("2026-10-19T00:00:00Z", { tier: "EMERALD", division: null, leaguePoints: null })], 420, now.getTime());
    expect(r).toMatchObject({ tier: "EMERALD", kind: "sighting", stale: true });
  });

  it("drops the division of apex tiers (Riot reports I for them)", () => {
    expect(participantRank([check("2026-10-19T00:00:00Z", { tier: "GRANDMASTER", division: "I", leaguePoints: 612 }, "unranked")], 420, now.getTime())).toMatchObject({ tier: "GRANDMASTER", division: null, leaguePoints: 612 });
  });
});

describe("the rank badge", () => {
  const ranked = (over: Partial<ParticipantRank>): ParticipantRank => ({ state: "ranked", queue: "solo", tier: "GOLD", division: "II", leaguePoints: 45, asOf: "2026-10-10T08:00:00Z", kind: "check", stale: true, ...over });

  it("shows a recent rank plainly, with the queue, LP and the date it was checked in full", () => {
    expect(rankBadgeLabel(ranked({}), 420, now)).toEqual({
      text: "Gold 2",
      queueMark: null,
      spoken: "Ranked Solo/Duo: Gold II, 45 LP, checked 10 Oct 2026",
      title: "Ranked Solo/Duo: Gold II, 45 LP, checked 10 Oct 2026. Their rank then, not at the time of this match",
    });
    expect(rankBadgeLabel(ranked({ tier: "GRANDMASTER", division: null, leaguePoints: 612 }), 420, now).text).toBe("GM");
  });

  it("marks a rank from the match's other ranked queue", () => {
    expect(rankBadgeLabel(ranked({ queue: "flex" }), 420, now).queueMark).toBe("Flex");
    expect(rankBadgeLabel(ranked({ queue: "solo" }), 440, now).queueMark).toBe("Solo");
    expect(rankBadgeLabel(ranked({ queue: "flex" }), 440, now).queueMark).toBeNull();
    expect(rankBadgeLabel(ranked({ queue: "flex" }), 440, now).spoken).toMatch(/^Ranked Flex: /);
  });

  it("puts the month on the badge once the rank is over 30 days old, and the year from another year", () => {
    expect(rankBadgeLabel(ranked({ tier: "PLATINUM", division: "IV", asOf: "2026-08-02T00:00:00Z" }), 420, now).text).toBe("Plat 4 · Aug");
    expect(rankBadgeLabel(ranked({ tier: "EMERALD", division: "I", asOf: "2025-12-30T00:00:00Z" }), 420, now).text).toBe("Emerald 1 · Dec 2025");
    expect(rankBadgeLabel(ranked({ tier: "UNKNOWNTIER", division: "I", asOf: "2026-10-18T00:00:00Z" }), 420, now).text).toBe("Unknowntier 1");
  });

  it("says how an old sighting was read, and never claims a sighting was checked", () => {
    const r = rankBadgeLabel(ranked({ kind: "sighting", leaguePoints: null, asOf: "2026-09-20T00:00:00Z" }), 420, now);
    expect(r.title).toBe("Ranked Solo/Duo: Gold II, last seen 20 Sep 2026. Their rank then, not at the time of this match");
  });

  it("tells unranked (a check found no entry) from not available (nothing read)", () => {
    const unranked = rankBadgeLabel({ ...ranked({}), state: "unranked", queue: null, tier: null, division: null, leaguePoints: null }, 420, now);
    expect(unranked.text).toBe("Unranked");
    expect(unranked.spoken).toBe("Unranked: no Ranked Solo/Duo or Flex entry when checked 10 Oct 2026");
    const unknown = rankBadgeLabel({ state: "unknown", queue: null, tier: null, division: null, leaguePoints: null, asOf: null, kind: null, stale: true }, 420, now);
    expect(unknown).toMatchObject({ text: "—", spoken: "Rank not available" });
  });
});

describe("an opponent's rank in a collapsed match card", () => {
  const ranked = (over: Partial<ParticipantRank>): ParticipantRank => ({ state: "ranked", queue: "solo", tier: "EMERALD", division: "II", leaguePoints: 45, asOf: "2026-10-18T08:00:00Z", kind: "check", stale: false, ...over });

  it("is the tier's letter and division, the apex tiers by their letters alone", () => {
    expect(rankShortLabel(ranked({}), 420, now)).toMatchObject({ text: "E2", tier: "EMERALD", queueMark: null, spoken: "Emerald 2" });
    expect(rankShortLabel(ranked({ tier: "DIAMOND", division: "IV" }), 420, now).text).toBe("D4");
    expect(rankShortLabel(ranked({ tier: "PLATINUM", division: "I" }), 420, now).text).toBe("P1");
    expect(rankShortLabel(ranked({ tier: "MASTER", division: null }), 420, now).text).toBe("M");
    expect(rankShortLabel(ranked({ tier: "GRANDMASTER", division: null }), 420, now).text).toBe("GM");
    expect(rankShortLabel(ranked({ tier: "CHALLENGER", division: null }), 420, now).text).toBe("C");
    expect(rankShortLabel(ranked({ tier: "IRON", division: "III" }), 420, now).text).toBe("I3");
  });

  it("marks a rank from the other ranked queue, Solo/Duo and Flex told apart", () => {
    // A Solo/Duo (or normal) game showing someone's Flex rank, and a Flex game showing a Solo/Duo one.
    expect(rankShortLabel(ranked({ queue: "flex" }), 420, now)).toMatchObject({ text: "E2", queueMark: "f", spoken: "Emerald 2 in Flex" });
    expect(rankShortLabel(ranked({ queue: "flex" }), 400, now).queueMark).toBe("f");
    expect(rankShortLabel(ranked({ queue: "solo" }), 440, now)).toMatchObject({ queueMark: "s", spoken: "Emerald 2 in Solo/Duo" });
    expect(rankShortLabel(ranked({ queue: "flex" }), 440, now).queueMark).toBeNull();
  });

  it("tells confirmed unranked from nothing known, and shows nothing for the latter", () => {
    expect(rankShortLabel({ ...ranked({}), state: "unranked", queue: null, tier: null, division: null, leaguePoints: null }, 420, now)).toMatchObject({ text: "Unr", tier: null, spoken: "unranked" });
    const unknown = rankShortLabel({ state: "unknown", queue: null, tier: null, division: null, leaguePoints: null, asOf: null, kind: null, stale: true }, 420, now);
    expect(unknown).toMatchObject({ text: null, spoken: null });
    expect(unknown.title).toMatch(/not available/);
  });

  it("is a current or last-known rank on hover, never the rank at the time of the game, and quieter once over a month old", () => {
    const fresh = rankShortLabel(ranked({}), 420, now);
    expect(fresh.title).toBe("Ranked Solo/Duo: Emerald II, 45 LP, checked 18 Oct 2026. Their rank then, not at the time of this match");
    expect(fresh.old).toBe(false);
    expect(rankShortLabel(ranked({ asOf: "2026-08-02T00:00:00Z", stale: true }), 420, now).old).toBe(true);
    expect(rankShortLabel(ranked({ kind: "sighting", asOf: "2026-10-01T00:00:00Z" }), 420, now).title).toMatch(/last seen 1 Oct 2026/);
  });
});

describe("when a match's ranks were checked", () => {
  const checked = (iso: string): ParticipantRank => ({ state: "ranked", queue: "solo", tier: "GOLD", division: "I", leaguePoints: 1, asOf: iso, kind: "check", stale: false });
  it("is today, one day or a span, in the installation's time zone; sightings and unknowns do not count", () => {
    expect(rankChecksWhen([checked("2026-10-19T01:00:00Z"), checked("2026-10-19T10:00:00Z")], now)).toBe("today");
    expect(rankChecksWhen([checked("2026-10-16T01:00:00Z")], now)).toBe("16 Oct");
    expect(rankChecksWhen([checked("2026-10-16T01:00:00Z"), checked("2026-10-19T01:00:00Z")], now)).toBe("16–19 Oct");
    expect(rankChecksWhen([checked("2026-09-28T01:00:00Z"), checked("2026-10-02T01:00:00Z")], now)).toBe("28 Sep–2 Oct");
    expect(rankChecksWhen([checked("2025-12-30T01:00:00Z"), checked("2026-10-19T01:00:00Z")], now)).toBe("30 Dec 2025–19 Oct");
    expect(rankChecksWhen([{ ...checked("2026-10-19T01:00:00Z"), kind: "sighting" }], now)).toBeNull();
    expect(rankChecksWhen([], now)).toBeNull();
  });
});
