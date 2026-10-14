import { describe, expect, it } from "vitest";
import { emptyTraits } from "./champion-model/traits";
import { strengthTags, tagInputsHash, teamStrengthTags, type TagChampion, type TagInput } from "./player-tags";

const champ = (over: Partial<TagChampion> & { championId: string }): TagChampion => ({ name: over.championId, classes: ["Fighter"], traits: emptyTraits(), tier: "strong", roleGames: 40, games: 40, ...over });
const base: TagInput = { role: "TOP", primaryRole: "TOP", champions: [], performance: null };
const labels = (input: TagInput) => strengthTags(input).map((t) => t.label);

describe("strength tags", () => {
  it("names the player's signature champion and the style of what they are proven on, for the role", () => {
    const tags = strengthTags({
      ...base,
      champions: [
        champ({ championId: "Riven", roleGames: 120, games: 120, tier: "core" }),
        champ({ championId: "Ambessa", roleGames: 60, games: 60 }),
        // Mastery-only Ornn (not proven) must not make them a tank player.
        champ({ championId: "Ornn", classes: ["Tank"], tier: "comfortable", roleGames: 4, games: 4, traits: { ...emptyTraits(), engage: 3, frontline: 3 } }),
      ],
    });
    const l = tags.map((t) => t.label);
    expect(l[0]).toBe("Riven Specialist");
    expect(l).toContain("Top-Lane Skirmisher");
    expect(l.some((x) => /Engage|Frontline|Tank/.test(x))).toBe(false);
    expect(tags.length).toBeLessThanOrEqual(3);
  });

  it("describes the ASSIGNED role, not the player's usual one", () => {
    // A Top main holding Jungle: only their Jungle pool and Jungle games count.
    const jungle: TagInput = {
      role: "JUNGLE",
      primaryRole: "TOP",
      champions: [
        champ({ championId: "Vi", classes: ["Fighter"], tier: "strong", roleGames: 45, games: 45, traits: { ...emptyTraits(), engage: 3 } }),
        champ({ championId: "Sejuani", classes: ["Tank"], tier: "strong", roleGames: 30, games: 30, traits: { ...emptyTraits(), engage: 3, frontline: 3 } }),
      ],
      performance: null,
    };
    const l = labels(jungle);
    expect(l).toContain("Engage Jungler");
    expect(l.join(" ")).not.toMatch(/Top/);
  });

  it("does not credit off-role experience to the assigned role", () => {
    // 200 Gwen games, but only 3 of them in Jungle: no Gwen specialist in the Jungle slot.
    const l = labels({ role: "JUNGLE", primaryRole: "TOP", champions: [champ({ championId: "Gwen", tier: "comfortable", roleGames: 3, games: 200 })], performance: null });
    expect(l.join(" ")).not.toMatch(/Gwen Specialist|Comfort Pick/);
    expect(l).toContain("Flex from Top");
  });

  it("names a pair when two champions share the role", () => {
    const l = labels({ ...base, champions: [champ({ championId: "Gwen", tier: "core", roleGames: 70 }), champ({ championId: "Riven", tier: "core", roleGames: 55 })] });
    expect(l[0]).toBe("Gwen & Riven");
  });

  it("claims measured performance only with enough games in the role and a clear threshold", () => {
    const perf = { games: 12, winRate: 0.75, detailedGames: 12, kdaRatio: 6, csPerMinute: 9, csGames: 12, visionPerGame: 40, visionGames: 12 };
    expect(strengthTags({ ...base, performance: perf }).some((t) => t.kind === "performance")).toBe(false);
    const enough = { ...perf, games: 45, detailedGames: 45, csGames: 45, visionGames: 45, winRate: 0.58, kdaRatio: 3.6, csPerMinute: 8.1, visionPerGame: 20 };
    const l = labels({ ...base, performance: enough });
    expect(l).toEqual(expect.arrayContaining(["Strong Top Form", "Efficient KDA", "Consistent Farmer"]));
    expect(l).not.toContain("Vision Focused"); // 20 per game is ordinary for a top laner
  });

  it("does not flip a held tag over one or two games", () => {
    const perf = { games: 40, winRate: 0.535, detailedGames: 40, kdaRatio: 2, csPerMinute: 6, csGames: 40, visionPerGame: 10, visionGames: 40 };
    expect(strengthTags({ ...base, performance: perf }).some((t) => t.key === "form")).toBe(false);
    expect(strengthTags({ ...base, performance: perf, previous: ["form"] }).some((t) => t.key === "form")).toBe(true);
  });

  it("describes the configured pool, never a fabricated strength, when nothing is proven", () => {
    const engage = { ...emptyTraits(), engage: 3 };
    const tags = strengthTags({ ...base, role: "SUPPORT", primaryRole: "SUPPORT", champions: ["Leona", "Nautilus", "Rell"].map((id) => champ({ championId: id, tier: "comfortable", roleGames: 3, games: 3, traits: engage })) });
    expect(tags.map((t) => t.label)).toEqual(["Engage-Oriented Support Pool"]);
    const few = strengthTags({ ...base, champions: [champ({ championId: "Gwen", tier: "comfortable", roleGames: 3, games: 3 })] });
    expect(few.every((t) => t.kind === "neutral")).toBe(true);
    expect(few[0]!.label).toBe("Gwen Top");
    expect(strengthTags({ ...base, champions: [] })[0]!.label).toBe("Top Pool Not Set");
  });

  it("changes its fingerprint only when the evidence meaningfully changes, and with the role", () => {
    const input: TagInput = { ...base, champions: [champ({ championId: "Riven", roleGames: 41 })], performance: { games: 41, winRate: 0.551, detailedGames: 41, kdaRatio: 3.31, csPerMinute: 7.62, csGames: 41, visionPerGame: 20.2, visionGames: 41 } };
    const same = { ...input, champions: [champ({ championId: "Riven", roleGames: 42 })], performance: { ...input.performance!, games: 42, winRate: 0.552 } };
    expect(tagInputsHash(same)).toBe(tagInputsHash(input));
    expect(tagInputsHash({ ...input, champions: [champ({ championId: "Riven", roleGames: 41, tier: "core" })] })).not.toBe(tagInputsHash(input));
    expect(tagInputsHash({ ...input, role: "JUNGLE" })).not.toBe(tagInputsHash(input));
  });
});

describe("strength tags across a lineup", () => {
  const fighterTop = (id: string, games: number): TagInput => ({ ...base, champions: [champ({ championId: id, roleGames: games, games })] });

  it("names the player whose proven experience in their role clearly leads the lineup", () => {
    const lineup: TagInput[] = [
      { ...base, champions: [champ({ championId: "Gwen", tier: "core", roleGames: 150 }), champ({ championId: "Riven", roleGames: 40 })] },
      { role: "MID", primaryRole: "MID", champions: [champ({ championId: "Ahri", classes: ["Mage"], roleGames: 50 })], performance: null },
      { role: "SUPPORT", primaryRole: "SUPPORT", champions: [champ({ championId: "Leona", classes: ["Tank"], roleGames: 30 })], performance: null },
    ];
    const tags = teamStrengthTags(lineup);
    expect(tags[0]!.map((t) => t.label)).toContain("Most Experienced in Lineup");
    expect(tags.slice(1).flat().some((t) => t.key === "most-experienced")).toBe(false);
  });

  it("prefers a specific, true alternative over a generic tag a teammate shares", () => {
    const a: TagInput = { ...fighterTop("Riven", 60), champions: [champ({ championId: "Riven", roleGames: 60 }), champ({ championId: "Jax", roleGames: 50 }), champ({ championId: "Fiora", roleGames: 40 }), champ({ championId: "Camille", roleGames: 30 })] };
    const b = fighterTop("Darius", 80);
    const [ta, tb] = teamStrengthTags([a, b]);
    // Both are top-lane fighters; A also has real depth (and the most experience), shown ahead of the shared wording.
    const la = ta!.map((t) => t.label);
    expect(la).toEqual(expect.arrayContaining(["Most Experienced in Lineup", "Deepest Pool in Lineup"]));
    expect(la.indexOf("Top-Lane Skirmisher")).not.toBe(0);
    expect(tb!.map((t) => t.label)).toContain("Top-Lane Skirmisher");
  });

  it("never repeats a tag across the lineup: the next true tag takes its place", () => {
    const [ta, tb] = teamStrengthTags([fighterTop("Riven", 60), fighterTop("Darius", 60)]);
    const la = ta!.map((t) => t.label);
    const lb = tb!.map((t) => t.label);
    expect(la.length).toBeGreaterThan(0);
    expect(lb.length).toBeGreaterThan(0);
    expect(la.filter((l) => lb.includes(l))).toEqual([]);
    // Each still says something true about their own champion.
    expect([...la, ...lb].some((l) => l.includes("Darius"))).toBe(true);
  });

  it("names the champions a player mains in the role, and lineup comparisons only one player can win", () => {
    const mains: TagInput = { ...fighterTop("Riven", 80), champions: [champ({ championId: "Riven", roleGames: 80, tier: "core" }), champ({ championId: "Jax", roleGames: 20, tier: "core" })] };
    const [t] = teamStrengthTags([mains, fighterTop("Darius", 10)]);
    expect(t!.map((x) => x.label)).toContain("Jax Main");
    const five = ["Riven", "Darius", "Garen", "Fiora", "Camille"].map((c, i) => fighterTop(c, 20 + i * 10));
    const labels = teamStrengthTags(five).flatMap((l) => l.map((x) => x.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never invents a strength for a player with no proven champions", () => {
    const [, tb] = teamStrengthTags([fighterTop("Riven", 120), { ...base, champions: [champ({ championId: "Gwen", tier: "moderate", roleGames: 2, games: 2 })] }]);
    expect(tb!.every((t) => t.kind === "neutral")).toBe(true);
  });
});
