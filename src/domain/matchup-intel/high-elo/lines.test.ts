import { describe, expect, it } from "vitest";
import { evidenceRefusedWords } from "@/domain/matchup-intel/refused-words";
import type { EvidenceNames, PatchWindow } from "@/domain/matchup-intel/evidence";
import { HIGH_MIN_CHOICES, HIGH_MIN_PAIR, HIGH_MIN_RECORD, highEloSection, sampleSize, wonWords, type HighEloRow } from "./lines";

const names: EvidenceNames = {
  champion: (id) => id,
  item: (id) => ({ "1054": "Doran's Shield", "2003": "Health Potion", "6692": "Eclipse", "3071": "Black Cleaver" })[id] ?? null,
  spell: (key) => ({ "4": "Flash", "12": "Teleport", "14": "Ignite" })[key] ?? null,
  rune: (id) => ({ "8010": "Conqueror", "8437": "Grasp of the Undying", "8128": "Dark Harvest" })[id] ?? null,
};
const window: PatchWindow = { current: "16.23", previous: "16.22", unchanged: () => false };

/** A row with equal weights (w = n, so the effective size is n) and `won` of its games won. */
function row(over: Partial<HighEloRow> & { n: number; won?: number }): HighEloRow {
  const w = over.w ?? over.n;
  const won = over.won ?? Math.round(over.n / 2);
  return { patch: "16.23", region: "europe", opponent: "", kind: "games", value: "", w, w2: over.w2 ?? w, ww: (won * w) / over.n, ...over, n: over.n };
}

const base = (n: number) => [
  row({ n, won: Math.round(n * 0.52) }),
  row({ kind: "ks", value: "8010", n: Math.round(n * 0.6) }),
  row({ kind: "ks", value: "8437", n: Math.round(n * 0.25) }),
  row({ kind: "ks", value: "8128", n: Math.round(n * 0.15) - 1 }),
  row({ kind: "spells", value: "4,12", n }),
];

const section = (rows: HighEloRow[], over: Partial<Parameters<typeof highEloSection>[0]> = {}) => highEloSection({ rows, region: "all", window, champion: "Riven", opponent: null, roleName: "Top", names, ...over });

describe("highEloSection", () => {
  it("says none are counted yet, and how many when fewer than a result needs", () => {
    expect(section([]).empty).toBe("Master+ games: none counted for Riven in Top on patch 26.23 yet.");
    const few = section([row({ n: HIGH_MIN_RECORD - 1 })]);
    expect(few.lines).toEqual([]);
    expect(few.empty).toBe(`Master+ games: ${HIGH_MIN_RECORD - 1} for Riven in Top on patch 26.23 (effective ${HIGH_MIN_RECORD - 1}), fewer than the ${HIGH_MIN_RECORD} a result needs.`);
  });

  it("states the result with its interval and n, and the title says the games were observed", () => {
    const s = section(base(400));
    expect(s.tier).toBe("Observed in Master+ ranked games · all regions (n = 400)");
    const record = s.lines.find((l) => l.key === "record")!;
    expect(record.label).toBe("Riven in Top");
    expect(record.values).toMatch(/^52\.0% won \(95% interval \d+\.\d%–\d+\.\d%, which includes 50%\)$/);
    expect(record.sample).toBe("n = 400 · patch 26.23");
  });

  it("names the most common choice and every other at 15% or more, as shares", () => {
    const ks = section(base(400)).lines.find((l) => l.key === "ks")!;
    expect(ks.values).toBe("Conqueror 60% · Grasp of the Undying 25%");
    // Each share is of the games that record the choice; the section's games are said once above the choices, a line's own only where it differs.
    expect(ks.sample).toBe("of 399 games");
    expect(section(base(400)).choices).toBe("Choices, of 400 games · patch 26.23");
    expect(section(base(400)).lines.find((l) => l.key === "spells")!.sample).toBe("");
    expect(section(base(400)).lines.find((l) => l.key === "spells")!.values).toBe("Flash + Teleport 100%");
  });

  it("shows no choice under its threshold, and the result from its own", () => {
    const s = section(base(HIGH_MIN_CHOICES - 10));
    expect(s.lines.map((l) => l.key)).toEqual(["record", "end"]);
  });

  it("against the chosen opponent: a result from 100 effective games, else how many there are", () => {
    const few = section([...base(400), row({ opponent: "Darius", n: 40 })], { opponent: "Darius" }).lines.find((l) => l.key === "pair")!;
    expect(few.values).toBe(`40 games with the lane opponent confirmed (effective 40), fewer than the ${HIGH_MIN_PAIR} a result against one opponent needs`);
    const many = section([...base(400), row({ opponent: "Darius", n: 150, won: 60 })], { opponent: "Darius" });
    const pair = many.lines.find((l) => l.key === "pair")!;
    expect(pair.label).toBe("Against Darius");
    expect(pair.values).toMatch(/^40\.0% won \(95% interval/);
    expect(pair.values).not.toMatch(/includes 50%/);
    expect(many.choices).toContain("against every opponent");
  });

  it("counts one region's games only when a region is chosen, and adds every region's for all", () => {
    const rows = [...base(200), ...base(100).map((r) => ({ ...r, region: "asia" as const }))];
    expect(section(rows).n).toBe(300);
    expect(section(rows, { region: "asia" }).n).toBe(100);
    expect(section(rows, { region: "asia" }).tier).toBe("Observed in Master+ ranked games · Korea and Japan (n = 100)");
    expect(section(rows, { region: "sea" }).empty).toMatch(/none counted/);
  });

  it("states n and the effective size when the weights are unequal", () => {
    expect(sampleSize({ n: 100, w: 100, w2: 400, ww: 0 })).toBe("n = 100 (effective 25)");
    // 100 games worth 25: fewer than the 30 a result needs.
    expect(section([row({ n: 100, w: 100, w2: 400 })]).empty).toContain("effective 25");
  });

  it("counts the previous patch only where Riot's data shows the champion unchanged", () => {
    const rows = [row({ n: 20 }), row({ patch: "16.22", n: 40 })];
    expect(section(rows).empty).toContain("patch 26.23");
    const pooled = section(rows, { window: { ...window, unchanged: () => true } });
    expect(pooled.n).toBe(60);
    expect(pooled.lines[0]!.sample).toBe("n = 60 · patches 26.23 and 26.22");
  });

  it("shows the lane end as a range from 30 measured games, against everyone when too few against the opponent", () => {
    const ends = Array.from({ length: 4 }, (_, i) => row({ kind: "end", value: String(540_000 + i * 30_000), n: 10 }));
    const s = section([...base(400), ...ends], { opponent: "Darius" });
    const end = s.lines.find((l) => l.key === "end")!;
    expect(end.values).toMatch(/^the middle half between \d+:\d\d and \d+:\d\d, median \d+:\d\d$/);
    expect(end.sample).toBe("n = 40 measured · patch 26.23 · against every opponent");
    expect(section(base(400)).lines.find((l) => l.key === "end")!.values).toBe("Not measured yet: 0 of the 30 games needed have a measured lane end");
  });

  it("uses no refused word in any line it builds", () => {
    const rows = [...base(400), row({ opponent: "Darius", n: 150 }), ...Array.from({ length: 4 }, (_, i) => row({ kind: "end", value: String(540_000 + i * 30_000), n: 10 }))];
    const texts = [section([]).empty!, section([row({ n: 10 })]).empty!];
    for (const s of [section(rows, { opponent: "Darius" }), section([...base(400), row({ opponent: "Darius", n: 10 })], { opponent: "Darius" })]) {
      texts.push(s.tier, s.choices ?? "", ...s.lines.flatMap((l) => [l.label, l.values, l.sample]));
    }
    texts.push(wonWords({ n: 0, w: 0, w2: 0, ww: 0 }));
    for (const t of texts) expect(evidenceRefusedWords(t), t).toEqual([]);
  });
});
