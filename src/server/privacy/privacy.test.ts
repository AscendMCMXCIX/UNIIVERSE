import { describe, expect, it } from "vitest";
import type { MatchParticipantDetail } from "@/server/db/schema";
import { redactNames } from "./erasure";
import { ErasureFilter, parseErasureFile } from "./ledger";
import { riotIdsInLog } from "./reconcile";
import { redactParticipants, redactTimeline } from "./redact";
import { erasureKey, keyCheckOf, normaliseRiotId, riotIdToken, tagged, tokenOf } from "./tokens";

/*
  The parts of personal-data erasure that need no database: keyed tokens, recognising an erased
  person in a stored game, what a game keeps of them, their names in free text, Riot IDs in job
  logs, and the checks a records file must pass before it is imported. The erasure itself is
  tested end to end in tests/db/privacy-erasure.test.ts.
*/

const key = Buffer.from(erasureKey("test-secret"));
const otherKey = Buffer.from(erasureKey("another-secret"));

describe("keyed tokens", () => {
  it("fold a Riot ID's spelling (case, spaces, full-width letters) and refuse anything that is not name#tag", () => {
    expect(normaliseRiotId("Hide on bush#KR1")).toBe("hideonbush#kr1");
    expect(normaliseRiotId("  ＨＩＤＥ ON BUSH # kr1 ")).toBe("hideonbush#kr1");
    expect(normaliseRiotId("Пётр Пустота#RU1")).toBe("пётрпустота#ru1");
    expect(normaliseRiotId("a#b#TAG")).toBe("a#b#tag");
    for (const bad of ["", "NoTag", "#TAG", "Name#", "   #  ", null, undefined]) expect(normaliseRiotId(bad)).toBeNull();
  });

  it("are one token for every spelling of a Riot ID, differ between kinds and keys, and hold nothing of the identifier", () => {
    const t = riotIdToken("Hide on bush#KR1", key)!;
    expect(t).toMatch(/^riotid:[0-9a-f]{64}$/);
    expect(riotIdToken("HIDEONBUSH#kr1", key)).toBe(t);
    expect(t.toLowerCase()).not.toContain("hide");
    expect(riotIdToken("Hide on bush#KR1", otherKey)).not.toBe(t);
    expect(riotIdToken("not a riot id", key)).toBeNull();
    expect(tokenOf("puuid", "abc", key)).not.toBe(tokenOf("account", "abc", key));
    expect(tagged("puuid", "abc", key)).toBe(`puuid:${tokenOf("puuid", "abc", key)}`);
  });

  it("tell a record made under another UNIIVERSE_AUTH_SECRET apart", () => {
    expect(keyCheckOf(key)).toMatch(/^[0-9a-f]{16}$/);
    expect(keyCheckOf(key)).toBe(keyCheckOf(Buffer.from(erasureKey("test-secret"))));
    expect(keyCheckOf(otherKey)).not.toBe(keyCheckOf(key));
  });
});

describe("recognising an erased person", () => {
  const record = { id: "r1", tokens: [tagged("puuid", "puuid-old", key), riotIdToken("Alice#OCE", key)!, tagged("user", "user-1", key), tagged("account", "account-1", key)] };

  it("matches their PUUID or any spelling of their Riot ID, and nothing else", () => {
    const f = new ErasureFilter([record], key);
    expect(f.empty).toBe(false);
    expect(f.puuid("puuid-old")).toBe(true);
    expect(f.puuid("puuid-other")).toBe(false);
    expect(f.riotId("alice # oce")).toBe(true);
    expect(f.riotId("Alice#EUW")).toBe(false);
    expect(f.riotId("Alice")).toBe(false);
    // Account and user ids are for reconciling a restored database, never Riot identities.
    expect(f.puuid("user-1")).toBe(false);
    expect(f.puuid("account-1")).toBe(false);
    expect(f.puuid(null)).toBe(false);
    expect(f.riotId(undefined)).toBe(false);
  });

  it("finds them under a PUUID it has not seen (a new API key) by Riot ID, and remembers that PUUID", async () => {
    const f = new ErasureFilter([record], key);
    expect(f.participant({ puuid: "puuid-new", name: "ALICE#oce" })).toBe(true);
    expect(f.participant({ puuid: "puuid-old", name: "Renamed#OCE" })).toBe(true);
    expect(f.participant({ puuid: "puuid-bob", name: "Bob#OCE" })).toBe(false);
    expect(f.participant({ puuid: "", name: null })).toBe(false);
    const written: unknown[] = [];
    await f.remember({ execute: async (query: unknown) => void written.push(query) } as never);
    // One statement for the record, adding only the new PUUID's token (never the PUUID itself).
    expect(written).toHaveLength(1);
    expect(JSON.stringify(written)).toContain(tagged("puuid", "puuid-new", key));
    expect(JSON.stringify(written)).not.toContain("puuid-new\"");
    expect(f.puuid("puuid-new")).toBe(true);
    // Nothing more to write the second time.
    await f.remember({ execute: async (query: unknown) => void written.push(query) } as never);
    expect(written).toHaveLength(1);
  });

  it("matches no one without records, or with tokens made under another key", () => {
    const none = new ErasureFilter([], key);
    expect(none.empty).toBe(true);
    expect(none.participant({ puuid: "puuid-old", name: "Alice#OCE" })).toBe(false);
    const elsewhere = new ErasureFilter([record], otherKey);
    expect(elsewhere.puuid("puuid-old")).toBe(false);
    expect(elsewhere.riotId("Alice#OCE")).toBe(false);
  });
});

const player = (puuid: string, name: string, teamId: number, win: boolean): MatchParticipantDetail => ({
  puuid,
  name,
  teamId,
  championId: "Ahri",
  championKey: 103,
  champLevel: 18,
  position: "MIDDLE",
  win,
  kills: 7,
  deaths: 2,
  assists: 9,
  cs: 210,
  gold: 13_200,
  damage: 31_000,
  damageTaken: 18_000,
  vision: 24,
  wardsPlaced: 11,
  items: [3089, 3020, 0, 0, 0, 0, 3340],
  spells: [4, 14],
  runes: { keystone: 8112, primary: 8100, secondary: 8300 },
});

describe("what a stored game keeps of a removed player", () => {
  it("only their side and the game's result: no identity, champion, position, items or figures", () => {
    const game = [player("p-alice", "Alice#OCE", 100, true), player("p-bob", "Bob#OCE", 100, true), player("p-cara", "Cara#OCE", 200, false)];
    const { participants, removed } = redactParticipants(game, (p) => p.puuid === "p-alice");
    expect(removed).toBe(1);
    expect(participants[0]).toEqual({ puuid: "", name: null, teamId: 100, championId: null, championKey: 0, champLevel: null, position: null, win: true, kills: 0, deaths: 0, assists: 0, cs: null, gold: null, damage: null, damageTaken: null, vision: null, wardsPlaced: null, items: null, spells: null, runes: null, removed: true });
    // The other players are untouched, in Riot's order.
    expect(participants[1]).toBe(game[1]);
    expect(participants[2]).toBe(game[2]);
  });

  it("leaves a player already removed as they are, and counts only new removals", () => {
    const first = redactParticipants([player("p-alice", "Alice#OCE", 100, true)], () => true).participants;
    const again = redactParticipants(first, () => true);
    expect(again.removed).toBe(0);
    expect(again.participants[0]).toBe(first[0]);
  });

  it("drops their timeline entries and per-minute figures, keeping everyone else's", () => {
    const row = {
      matchId: "OC1_1",
      participants: [
        { puuid: "p-alice", purchases: [[60_000, 1055]] as Array<[number, number]>, skills: [1, 2, 3] },
        { puuid: "p-bob", purchases: [[61_000, 1056]] as Array<[number, number]>, skills: [3, 1, 2] },
      ],
      frames: { t: [0, 60_000], p: { "p-alice": { g: [500, 900], x: [0, 280], c: [0, 9] }, "p-bob": { g: [500, 850], x: [0, 250], c: [0, 8] } } },
    };
    const kept = redactTimeline(row, (puuid) => puuid !== "p-alice");
    expect(kept.participants.map((p) => p.puuid)).toEqual(["p-bob"]);
    expect(Object.keys(kept.frames!.p)).toEqual(["p-bob"]);
    expect(kept.frames!.t).toEqual([0, 60_000]);
    expect(kept.matchId).toBe("OC1_1");
    expect(JSON.stringify(kept)).not.toContain("p-alice");
  });
});

describe("names in notes other people wrote", () => {
  it("replaces whole-word mentions in any case, longest first, and leaves other words alone", () => {
    const terms = ["Alice Anders#OCE", "Alice Anders", "Alice"];
    expect(redactNames("alice plays mid; ALICE ANDERS#oce is her Riot ID", terms)).toBe("[removed] plays mid; [removed] is her Riot ID");
    expect(redactNames("Malice and Alicea stay; Alice_2 too", terms)).toBe("Malice and Alicea stay; Alice_2 too");
    expect(redactNames("Ask Пётр", ["Пётр"])).toBe("Ask [removed]");
    expect(redactNames("Нет Петра", ["Пётр"])).toBe("Нет Петра");
    // Characters that mean something in a pattern are matched as written.
    expect(redactNames("x a.b y and aXb", ["a.b"])).toBe("x [removed] y and aXb");
  });
});

describe("Riot IDs in job logs", () => {
  it("finds the Riot IDs older account syncs wrote, in a stored run's summary or in plain text, and nothing else", () => {
    // A run's summary as stored (JSON): each line starts with the account's Riot ID, or names its new one after "is now".
    const summary = JSON.stringify({ synced: 2, logs: ["Alice#OCE: season 2026 history complete (12); fetched 3", "Old#OCE is now New Name#OCE (renamed in Riot); data kept", "account 1a2b3c4d: 3 new games"] });
    expect(riotIdsInLog(summary).sort()).toEqual(["Alice#OCE", "New Name#OCE", "Old#OCE"]);
    expect(riotIdsInLog("Bob Smith#EUW: Riot says EUW, not EUNE; following Riot\naccount 9f8e7d6c: no new games").sort()).toEqual(["Bob Smith#EUW"]);
    expect(riotIdsInLog("No Riot ID here: 3 games, 50% #1 pick")).toEqual([]);
    expect(riotIdsInLog("")).toEqual([]);
  });
});

describe("an erasure records file", () => {
  const good = {
    format: "uniiverse-erasures",
    version: 1,
    exportedAt: "2026-10-22T10:00:00.000Z",
    records: [{ reference: "ER-7K2QF9", erasedAt: "2026-10-01T12:00:00.000Z", tokens: [tagged("user", "u", key), tagged("user", "u", key), riotIdToken("Alice#OCE", key)!], keyCheck: keyCheckOf(key), releasedAt: null }],
  };
  const withRecord = (over: Record<string, unknown>) => ({ ...good, records: [{ ...good.records[0], ...over }] });

  it("is read whole, with each record's tokens once", () => {
    const [r] = parseErasureFile(good);
    expect(r).toEqual({ reference: "ER-7K2QF9", erasedAt: new Date("2026-10-01T12:00:00.000Z"), tokens: [tagged("user", "u", key), riotIdToken("Alice#OCE", key)], keyCheck: keyCheckOf(key), releasedAt: null });
    expect(parseErasureFile(withRecord({ releasedAt: "2026-10-05T09:00:00.000Z" }))[0]!.releasedAt).toEqual(new Date("2026-10-05T09:00:00.000Z"));
  });

  it("is refused whole when it is not a records file or any record is malformed", () => {
    for (const notAFile of [null, "text", [], { ...good, format: "other" }, { ...good, version: 2 }, { ...good, records: "x" }]) expect(() => parseErasureFile(notAFile)).toThrow("This is not a UNIIVERSE erasure records file.");
    expect(() => parseErasureFile(withRecord({ reference: "Alice" }))).toThrow("The file has a malformed record.");
    expect(() => parseErasureFile(withRecord({ keyCheck: "not-hex" }))).toThrow("The file has a malformed record.");
    // A token must be a keyed token: a name, Riot ID or PUUID written in plain text is refused.
    expect(() => parseErasureFile(withRecord({ tokens: ["riotid:Alice#OCE"] }))).toThrow("Record ER-7K2QF9 has malformed tokens.");
    expect(() => parseErasureFile(withRecord({ tokens: [42] }))).toThrow("Record ER-7K2QF9 has malformed tokens.");
    expect(() => parseErasureFile(withRecord({ erasedAt: "yesterday" }))).toThrow("Record ER-7K2QF9 has a malformed date.");
    expect(() => parseErasureFile(withRecord({ erasedAt: 1_700_000_000_000 }))).toThrow("Record ER-7K2QF9 has a malformed date.");
    expect(() => parseErasureFile(withRecord({ releasedAt: "later" }))).toThrow("Record ER-7K2QF9 has a malformed date.");
    expect(() => parseErasureFile({ ...good, records: [good.records[0], good.records[0]] })).toThrow("Record ER-7K2QF9 appears twice.");
  });
});
