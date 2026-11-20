import { describe, expect, it } from "vitest";
import { EVIDENCE_FIELDS, MIN_LANE_ENDS, fewGamesWords, fieldLine, laneEndLine, objectivesLine, queueSplit, recordLine, sampleWords, scopeTier, type EvidenceCounts, type EvidenceNames, type PatchWindow } from "./evidence";
import { evidenceRefusedWords } from "./refused-words";
import { UNCERTAIN, UNCERTAIN_HIDDEN, NO_DUO_NOTES, NO_HIGH_ELO } from "@/components/matchup-intel/evidence-panel";

const names: EvidenceNames = { champion: (id) => ({ Riven: "Riven", Darius: "Darius", LeeSin: "Lee Sin" })[id] ?? id, item: (id) => ({ "1055": "Doran's Blade", "2003": "Health Potion", "3071": "Black Cleaver" })[id] ?? null, spell: (k) => ({ "4": "Flash", "14": "Ignite", "12": "Teleport" })[k] ?? null, rune: (id) => ({ "8010": "Conqueror" })[id] ?? null };
const only: PatchWindow = { current: "16.22", previous: "16.21", unchanged: () => false };
const pooled: PatchWindow = { current: "16.22", previous: "16.21", unchanged: () => true };

function counts(): EvidenceCounts {
  return {
    games: [
      { patch: "16.22", queue: 420, n: 3, won: 2 },
      { patch: "16.22", queue: 400, n: 6, won: 3 },
      { patch: "16.21", queue: 420, n: 4, won: 1 },
    ],
    fields: {
      spells: [
        { patch: "16.22", queue: 420, value: "4,14", n: 3 },
        { patch: "16.22", queue: 400, value: "4,14", n: 3 },
        { patch: "16.22", queue: 400, value: "4,12", n: 3 },
        { patch: "16.21", queue: 420, value: "4,12", n: 4 },
      ],
      start: [{ patch: "16.22", queue: 400, value: "1055,2003", n: 2 }],
      items: [{ patch: "16.22", queue: 400, value: "3071", n: 5 }],
      runes: [
        { patch: "16.22", queue: 420, value: "8000:8010,9111,9104,8299|8400:8446,8451", n: 4 },
        { patch: "16.21", queue: 420, value: "8000:8010,9111,9104,8299|8400:8446,8451", n: 1 },
      ],
      skills: [{ patch: "16.22", queue: 420, value: "QEW", n: 9 }],
      max: [{ patch: "16.22", queue: 420, value: "QEW", n: 9 }],
    },
    objectives: [{ patch: "16.22", queue: 420, games: 4, taken: 7, total: 12 }],
    ends: Array.from({ length: 12 }, (_, i) => ({ patch: "16.22", queue: 420, end: 600_000 + i * 30_000 })),
  };
}

describe("the evidence lines", () => {
  it("count k of n with the patch and every queue, at n of 3 or more", () => {
    expect(fieldLine("spells", counts(), only, ["Riven"], names)).toEqual({ key: "spells", label: "Summoner spells", values: "Flash + Ignite in 6, Flash + Teleport in 3", sample: "of 9 games · patch 26.22 · Normal Draft 6, Solo/Duo 3" });
    // Two games only: no line.
    expect(fieldLine("start", counts(), only, ["Riven"], names)).toBeNull();
  });

  it("add the previous patch only where Riot's data shows no change, and say so", () => {
    const line = fieldLine("spells", counts(), pooled, ["Riven"], names)!;
    expect(line.sample).toBe("of 13 games · patches 26.22 and 26.21 · Solo/Duo 7, Normal Draft 6");
    expect(line.note).toMatch(/no change between the two patches/);
    expect(recordLine("record", "Riven against Darius", counts(), only, ["Riven"])).toEqual({ key: "record", label: "Riven against Darius", values: "9 games, 5 won", sample: "patch 26.22 · Normal Draft 6, Solo/Duo 3" });
  });

  it("never name the previous patch when it adds no game", () => {
    const c = counts();
    expect(fieldLine("items", c, pooled, ["Riven"], names)?.sample).toBe("of 5 games · patch 26.22 · Normal Draft 5");
    expect(recordLine("record", "Riven", { ...c, games: c.games.filter((g) => g.patch === "16.22") }, pooled, ["Riven"])?.sample).toBe("patch 26.22 · Normal Draft 6, Solo/Duo 3");
  });

  it("ask the diff about every chosen champion and everything a line names", () => {
    const asked: string[][] = [];
    const window: PatchWindow = { ...only, unchanged: (list) => (asked.push(list.map((n) => `${n.kind}:${n.key}`)), false) };
    fieldLine("runes", counts(), window, ["Riven"], names);
    expect(asked[0]).toEqual(["champion:Riven", "rune:8010", "rune:9111", "rune:9104", "rune:8299", "rune:8446", "rune:8451"]);
  });

  it("show the lane end only from 10 measured games, as a range and a median, never one minute", () => {
    const line = laneEndLine(counts(), only, ["Riven"], false);
    expect(line.values).toBe("the middle half between 11:23 and 14:08, median 12:45");
    expect(line.sample).toBe("n = 12 · patch 26.22 · Solo/Duo 12");
    const few = { ...counts(), ends: counts().ends.slice(0, MIN_LANE_ENDS - 1) };
    // What is counted is the games with a measured lane end, not every game with positions (R7 review C5).
    expect(laneEndLine(few, only, ["Riven"], false).values).toBe("Not measured yet: 9 of the 10 games needed have a measured lane end");
    // The rule in plain words: from 2:00, positions once a minute, never "frames".
    expect(line.note).toBe("The earlier of the lane's outer turret falling and either player out of the lane at two one-minute positions in a row, from 2:00 (time in base excluded).");
    expect(laneEndLine(counts(), only, ["LeeSin"], true).values).toMatch(/^Not measured/);
  });

  it("count a jungler's early objectives", () => {
    expect(objectivesLine(counts(), only, ["LeeSin"], names)?.values).toBe("7 of 12 to Lee Sin's team");
  });

  it("write queues and small samples honestly", () => {
    expect(queueSplit([{ queue: 400, n: 6 }, { queue: 420, n: 3 }, { queue: 999, n: 1 }])).toBe("Normal Draft 6, Solo/Duo 3, Queue 999 1");
    expect(sampleWords(1, ["16.22"], [{ queue: 420, n: 1 }])).toBe("of 1 game · patch 26.22 · Solo/Duo 1");
    expect(fewGamesWords("own", 2, "Riven against Darius", ["16.22"])).toBe("In your games: 2 as Riven against Darius on patch 26.22, fewer than the 3 a line needs.");
    expect(fewGamesWords("team", 0, "Riven", ["16.22"])).toBe("In the team's games: none as Riven on patch 26.22.");
  });
});

describe("EVIDENCE_REFUSED_WORDS on every evidence template", () => {
  it("passes on every line each template can write, and on the panel's fixed sentences", () => {
    const c = counts();
    const lines = [
      ...EVIDENCE_FIELDS.flatMap((f) => [fieldLine(f, c, only, ["Riven"], names), fieldLine(f, c, pooled, ["Riven"], names)]),
      recordLine("record", "Riven against Darius", c, pooled, ["Riven"]),
      objectivesLine(c, only, ["LeeSin"], names),
      laneEndLine(c, only, ["Riven"], false),
      laneEndLine({ ...c, ends: [] }, only, ["Riven"], false),
      laneEndLine(c, only, ["LeeSin"], true),
    ].filter((l) => !!l);
    expect(lines.length).toBeGreaterThan(8);
    const texts = [
      ...lines.flatMap((l) => [`${l!.label}: ${l!.values} ${l!.sample}`, l!.note ?? ""]),
      scopeTier("own", 9),
      scopeTier("team", 23),
      fewGamesWords("own", 2, "Riven against Darius", ["16.22"]),
      fewGamesWords("own", 0, "Riven", ["16.22"]),
      fewGamesWords("team", 2, "Riven", ["16.22"]),
      UNCERTAIN,
      UNCERTAIN_HIDDEN,
      NO_DUO_NOTES,
      NO_HIGH_ELO,
      "These counts ignore the empty slots: the enemy ADC, the allied support, the enemy support.",
      "In your games: this account has no player profile, so it has no games of its own.",
      "In the team's games: teammates' statistics are not part of this account's access.",
      "Some of these games were stored before Riot's two position readings were kept: their lane opponent is by Riot's position.",
      "This 2v2: too few games: fewer than 3 on patch 26.22",
      "With Lulu: 5 games, 3 won · patch 26.22 · Solo/Duo 5",
    ];
    for (const t of texts) expect(evidenceRefusedWords(t), t).toEqual([]);
  });
});
