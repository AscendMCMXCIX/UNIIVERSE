import { describe, expect, it } from "vitest";
import { emptyTraits } from "./champion-model/traits";
import { strengthTags, tagInputsHash, teamStrengthTags, type TagChampion, type TagInput } from "./player-tags";

const champ = (over: Partial<TagChampion> & { championId: string }): TagChampion => ({ name: over.championId, role: "TOP", classes: ["Fighter"], traits: emptyTraits(), tier: "strong", games: 40, ...over });
const base: TagInput = { primaryRole: "TOP", roles: ["TOP", "MID"], champions: [], performance: null };

describe("strength tags", () => {
  it("names a playstyle only from champions the player is proven on", () => {
    const tags = strengthTags({
      ...base,
      champions: [
        champ({ championId: "Riven", games: 120, tier: "core" }),
        champ({ championId: "Ambessa", games: 60 }),
        // Lots of mastery-only Ornn (not proven) must not make them a tank player.
        champ({ championId: "Ornn", classes: ["Tank"], tier: "comfortable", games: 4, traits: { ...emptyTraits(), engage: 3, frontline: 3 } }),
      ],
    });
    const labels = tags.map((t) => t.label);
    expect(labels).toContain("Proven Fighter");
    expect(labels).toContain("Riven Specialist");
    expect(labels).not.toContain("Engage Specialist");
    expect(labels).not.toContain("Reliable Frontline");
    expect(tags.every((t) => t.kind === "playstyle")).toBe(true);
    expect(tags.length).toBeLessThanOrEqual(3);
  });

  it("gives engage and frontline tags when proven experience is on such champions", () => {
    const traits = { ...emptyTraits(), engage: 3, frontline: 2 };
    const tags = strengthTags({ ...base, primaryRole: "SUPPORT", roles: ["SUPPORT"], champions: [champ({ championId: "Leona", role: "SUPPORT", classes: ["Tank"], traits, games: 80 }), champ({ championId: "Nautilus", role: "SUPPORT", classes: ["Tank"], traits, games: 50 })] });
    const labels = tags.map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["Engage Specialist", "Reliable Frontline"]));
  });

  it("claims measured performance only with enough games and a clear threshold", () => {
    const perf = { games: 12, winRate: 0.75, detailedGames: 12, kdaRatio: 6, csPerMinute: 9, csGames: 12, visionPerGame: 40, visionGames: 12 };
    expect(strengthTags({ ...base, performance: perf }).some((t) => t.kind === "performance")).toBe(false);
    const enough = { ...perf, games: 45, detailedGames: 45, csGames: 45, visionGames: 45, winRate: 0.58, kdaRatio: 3.6, csPerMinute: 8.1, visionPerGame: 20 };
    const labels = strengthTags({ ...base, performance: enough }).map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["Strong Season Form", "Efficient KDA", "Consistent Farmer"]));
    expect(labels).not.toContain("Vision Focused"); // 20 per game is ordinary for a top laner
  });

  it("does not flip a held tag over one or two games", () => {
    const perf = { games: 40, winRate: 0.535, detailedGames: 40, kdaRatio: 2, csPerMinute: 6, csGames: 40, visionPerGame: 10, visionGames: 40 };
    expect(strengthTags({ ...base, performance: perf }).some((t) => t.key === "form")).toBe(false);
    expect(strengthTags({ ...base, performance: perf, previous: ["form"] }).some((t) => t.key === "form")).toBe(true);
  });

  it("falls back to a neutral description, never a fabricated strength", () => {
    const tags = strengthTags({ ...base, champions: [champ({ championId: "Gwen", tier: "comfortable", games: 3 })] });
    expect(tags.every((t) => t.kind === "neutral")).toBe(true);
    expect(tags[0]!.label).toBe("Top Main");
  });

  it("changes its fingerprint only when the evidence meaningfully changes", () => {
    const input: TagInput = { ...base, champions: [champ({ championId: "Riven", games: 41 })], performance: { games: 41, winRate: 0.551, detailedGames: 41, kdaRatio: 3.31, csPerMinute: 7.62, csGames: 41, visionPerGame: 20.2, visionGames: 41 } };
    const same = { ...input, champions: [champ({ championId: "Riven", games: 42 })], performance: { ...input.performance!, games: 42, winRate: 0.552 } };
    expect(tagInputsHash(same)).toBe(tagInputsHash(input));
    const changed = { ...input, champions: [champ({ championId: "Riven", games: 41, tier: "core" })] };
    expect(tagInputsHash(changed)).not.toBe(tagInputsHash(input));
  });
});

describe("strength tags across a lineup", () => {
  const fighter = (role: TagInput["primaryRole"], id: string, extra: Partial<TagChampion> = {}) => champ({ championId: id, role, games: 70, ...extra });

  it("rewords a class tag teammates share into its role-qualified form (same evidence, told apart)", () => {
    const [top, jungle, mid] = teamStrengthTags([
      { ...base, primaryRole: "TOP", roles: ["TOP"], champions: [fighter("TOP", "Riven"), fighter("TOP", "Camille")] },
      { ...base, primaryRole: "JUNGLE", roles: ["JUNGLE"], champions: [fighter("JUNGLE", "Viego"), fighter("JUNGLE", "XinZhao")] },
      { ...base, primaryRole: "MID", roles: ["MID"], champions: [fighter("MID", "Yone"), fighter("MID", "Yasuo")] },
    ]);
    const labels = [top, jungle, mid].map((t) => t!.map((x) => x.label));
    expect(labels[0]).toContain("Top-Lane Skirmisher");
    expect(labels[1]).toContain("Bruiser Jungler");
    expect(labels[2]).toContain("Mid-Lane Fighter");
    expect(labels.flat()).not.toContain("Proven Fighter");
  });

  it("keeps the plain wording when nobody else shows it", () => {
    const [solo] = teamStrengthTags([{ ...base, champions: [fighter("TOP", "Riven"), fighter("TOP", "Camille")] }, { ...base, primaryRole: "SUPPORT", roles: ["SUPPORT"], champions: [] }]);
    expect(solo!.map((t) => t.label)).toContain("Proven Fighter");
  });

  it("prefers a specific, true alternative over a generic tag a teammate shares", () => {
    const poke = { ...emptyTraits(), poke: 3, earlyGame: 3 };
    // Both show "Early Pressure"; one of them is also clearly a Jayce player.
    const [a] = teamStrengthTags([
      { ...base, champions: [champ({ championId: "Jayce", games: 160, tier: "core", classes: ["Fighter"], traits: poke }), champ({ championId: "Kennen", classes: ["Mage"], games: 30, traits: poke })] },
      { ...base, primaryRole: "MID", roles: ["MID"], champions: [champ({ championId: "Leblanc", role: "MID", classes: ["Assassin"], games: 60, traits: poke })] },
    ]);
    expect(a!.map((t) => t.label)).toContain("Jayce Specialist");
  });

  it("names breadth when a player is proven on many kinds of champion", () => {
    const tags = strengthTags({
      ...base,
      champions: [champ({ championId: "Riven", games: 20 }), champ({ championId: "Ornn", classes: ["Tank"], games: 20 }), champ({ championId: "Kennen", classes: ["Mage"], games: 20 }), champ({ championId: "Akali", classes: ["Assassin"], games: 15 }), champ({ championId: "Gnar", games: 12 })],
    });
    expect(tags.map((t) => t.label)).toContain("Versatile Pool");
  });

  it("never invents a strength for a player with no proven champions", () => {
    const [, empty] = teamStrengthTags([{ ...base, champions: [fighter("TOP", "Riven")] }, { ...base, primaryRole: "ADC", roles: ["ADC"], champions: [champ({ championId: "Jinx", role: "ADC", classes: ["Marksman"], tier: "moderate", games: 2 })] }]);
    expect(empty!.every((t) => t.kind === "neutral")).toBe(true);
  });
});
