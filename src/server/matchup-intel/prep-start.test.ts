import { describe, expect, it } from "vitest";
import { timelineParticipants } from "@/server/accounts/match-timeline";
import { matchPrep, startingSet, type PrepParticipant, type PrepTimeline } from "@/domain/matchup-intel/prep";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";

/*
  The starting set from what a stored timeline records (docs/MATCHUP_INTEL.md, "In your games"):
  Riot's events go through the same storing step the sync uses (timelineParticipants), then through
  matchPrep, so an undone purchase and a sale in the first minute are judged on the stored form.
*/
const ev = (type: string, timestamp: number, participantId: number, extra: Record<string, unknown> = {}) => ({ type, timestamp, participantId, ...extra });
const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const parts: PrepParticipant[] = Array.from({ length: 10 }, (_, i) => ({ puuid: `p${i}`, teamId: i < 5 ? 100 : 200, championId: `C${i}`, position: LANES[i % 5]!, teamPosition: LANES[i % 5]!, individualPosition: LANES[i % 5]! }));

function riot(events: ReturnType<typeof ev>[]): RiotMatchTimeline {
  const puuids = parts.map((p) => p.puuid);
  return { metadata: { matchId: "M_1", participants: puuids }, info: { participants: puuids.map((puuid, i) => ({ participantId: i + 1, puuid })), frames: [{ events }] } } as unknown as RiotMatchTimeline;
}

/** The stored timeline as prep reads it; `salesKept` as on a timeline kept from 20 Nov 2026 on (it has plates). */
function stored(events: ReturnType<typeof ev>[], salesKept: boolean): PrepTimeline {
  return { participants: timelineParticipants(riot(events)).map((p) => ({ puuid: p.puuid, purchases: p.purchases, skills: p.skills, sold: p.sold ?? null })), salesKept };
}

const firstMinute = [
  ev("ITEM_PURCHASED", 2_000, 1, { itemId: 1055 }),
  ev("ITEM_PURCHASED", 2_500, 1, { itemId: 2003 }),
  // Bought and undone in the first minute.
  ev("ITEM_PURCHASED", 4_000, 1, { itemId: 1056 }),
  ev("ITEM_UNDO", 5_000, 1, { beforeId: 1056, afterId: 0 }),
  // Bought and sold in the first minute.
  ev("ITEM_PURCHASED", 6_000, 1, { itemId: 1054 }),
  ev("ITEM_SOLD", 20_000, 1, { itemId: 1054 }),
  // Two potions, one sold in the first minute: one stays.
  ev("ITEM_PURCHASED", 7_000, 1, { itemId: 2003 }),
  ev("ITEM_SOLD", 30_000, 1, { itemId: 2003 }),
  // A sale undone: the item is held again.
  ev("ITEM_PURCHASED", 8_000, 1, { itemId: 3340 }),
  ev("ITEM_SOLD", 31_000, 1, { itemId: 3340 }),
  ev("ITEM_UNDO", 32_000, 1, { beforeId: 0, afterId: 3340 }),
  // Sold after the first minute: still part of the start.
  ev("ITEM_SOLD", 400_000, 1, { itemId: 1055 }),
];

describe("the starting set (items held at the end of the first minute)", () => {
  it("leaves out an item bought and undone, or bought and sold, in the first minute", () => {
    expect(matchPrep(parts, 0, stored(firstMinute, true), null)?.start).toBe("1055,2003,3340");
  });

  it("keeps the first minute's purchases as bought when the timeline does not keep sales (kept before 20 Nov 2026); undone purchases are still gone", () => {
    expect(matchPrep(parts, 0, stored(firstMinute, false), null)?.start).toBe("1054,1055,2003,2003,3340");
  });

  it("takes a sale off the latest purchase of that item before it, never one bought after", () => {
    expect(startingSet([[1_000, 2003], [50_000, 2003]], [[10_000, 2003]])).toEqual([2003]);
    expect(startingSet([[30_000, 1054]], [[10_000, 1054]])).toEqual([1054]);
    expect(startingSet([[1_000, 1055]], [[60_000, 1055]])).toEqual([1055]);
  });

  it("has no starting set when everything bought in the first minute was sold in it", () => {
    expect(matchPrep(parts, 0, stored([ev("ITEM_PURCHASED", 2_000, 1, { itemId: 1054 }), ev("ITEM_SOLD", 10_000, 1, { itemId: 1054 })], true), null)?.start).toBeUndefined();
  });
});
