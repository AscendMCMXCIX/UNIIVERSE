import { describe, expect, it } from "vitest";
import { estimateProficiency, type ChampionHistoryEvidence } from "./index";

const now = new Date("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const row = (championId: string, games: number, wins: number, last: Date, role: ChampionHistoryEvidence["role"] = "TOP"): ChampionHistoryEvidence => ({ championId, role, games, wins, lastPlayedAt: last, patchDistance: 0 });

describe("proficiency", () => {
  it("is neutral with no evidence", () => {
    const p = estimateProficiency("Gwen", "TOP", [], null, { now });
    expect(p.score).toBe(0.5);
    expect(p.tier).toBe("unknown");
    expect(p.confidence).toBe(0);
  });

  it("rates a recently played, high-volume champion as core comfort", () => {
    const p = estimateProficiency("Gwen", "TOP", [row("Gwen", 80, 44, daysAgo(2))], { championId: "Gwen", points: 250_000, level: 7, lastPlayedAt: daysAgo(2) }, { now });
    expect(p.tier).toBe("core");
    expect(p.score).toBeGreaterThan(0.75);
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  it("keeps a familiarity baseline for champions not played recently (rusty, not removed)", () => {
    const p = estimateProficiency("Riven", "TOP", [row("Riven", 120, 65, daysAgo(200))], null, { now });
    expect(p.tier).toBe("rusty");
    expect(p.score).toBeGreaterThan(0.55);
    expect(p.notes.join(" ")).toMatch(/rusty/);
  });

  it("does not let a tiny sample dominate", () => {
    const tiny = estimateProficiency("Jax", "TOP", [row("Jax", 2, 2, daysAgo(1))], null, { now });
    const solid = estimateProficiency("Gwen", "TOP", [row("Gwen", 40, 21, daysAgo(10))], null, { now });
    expect(tiny.score).toBeLessThan(solid.score);
    expect(tiny.confidence).toBeLessThan(0.3);
    expect(tiny.notes.join(" ")).toMatch(/small sample/);
  });

  it("recognises off-role experience", () => {
    const p = estimateProficiency("Sylas", "TOP", [row("Sylas", 30, 16, daysAgo(5), "MID"), row("Sylas", 2, 1, daysAgo(5), "TOP")], null, { now });
    expect(p.roleShare).toBeLessThan(0.1);
    expect(p.notes.join(" ")).toMatch(/outside TOP/);
  });

  it("counts Normal games as real practice at reduced weight, never ignores them", () => {
    const ranked = estimateProficiency("Riven", "TOP", [row("Riven", 20, 11, daysAgo(3))], null, { now });
    const normals = estimateProficiency("Riven", "TOP", [{ ...row("Riven", 20, 11, daysAgo(3)), queueGroup: "normal" }], null, { now });
    const none = estimateProficiency("Riven", "TOP", [], null, { now });
    expect(normals.tier).not.toBe("unknown");
    expect(normals.score).toBeGreaterThan(none.score);
    expect(normals.score).toBeLessThan(ranked.score);
    expect(normals.confidence).toBeLessThan(ranked.confidence);
    expect(normals).toMatchObject({ games: 20, normalGames: 20, rankedGames: 0 });
    expect(normals.notes.join(" ")).toMatch(/Normal games/);
    // Mixed history: both queues contribute.
    const mixed = estimateProficiency("Riven", "TOP", [row("Riven", 20, 11, daysAgo(3)), { ...row("Riven", 20, 11, daysAgo(3)), queueGroup: "normal" }], null, { now });
    expect(mixed.score).toBeGreaterThan(ranked.score);
  });

  it("uses combined mastery but never rates a champion on mastery alone", () => {
    const single = estimateProficiency("Riven", "TOP", [], { championId: "Riven", points: 400_000, level: 7, lastPlayedAt: daysAgo(400), accounts: 1 }, { now });
    const combined = estimateProficiency("Riven", "TOP", [], { championId: "Riven", points: 650_000, level: 7, lastPlayedAt: daysAgo(400), accounts: 2 }, { now });
    expect(combined.score).toBeGreaterThanOrEqual(single.score);
    expect(combined.mastery).toMatchObject({ points: 650_000, accounts: 2 });
    // Huge mastery, no games for over a year: familiar but rusty, never "very strong".
    expect(combined.tier).toBe("rusty");
    expect(combined.confidence).toBeLessThan(0.35);
  });

  it("caps a recently played mastery-only champion at Comfortable", () => {
    // 268k mastery last played yesterday (e.g. in ARAM), but no stored games in a supported queue.
    const p = estimateProficiency("Ashe", "ADC", [], { championId: "Ashe", points: 268_000, level: 7, lastPlayedAt: daysAgo(1), accounts: 1 }, { now });
    expect(p.tier).toBe("comfortable");
    expect(p.games).toBe(0);
    expect(p.notes.join(" ")).toMatch(/Mastery only/);
  });
  it("does not rate big mastery with a handful of games as Very strong (Phase 5 audit)", () => {
    const mastery = { championId: "Riven", points: 600_000, level: 10, lastPlayedAt: daysAgo(3) };
    const few = estimateProficiency("Riven", "TOP", [row("Riven", 2, 2, daysAgo(3))], mastery, { now });
    expect(few.tier).toBe("comfortable");
    expect(few.notes.join(" ")).toMatch(/Mostly mastery/);
    const some = estimateProficiency("Riven", "TOP", [row("Riven", 8, 5, daysAgo(3))], mastery, { now });
    expect(some.tier).toBe("strong");
    const many = estimateProficiency("Riven", "TOP", [row("Riven", 40, 22, daysAgo(3))], mastery, { now });
    expect(many.tier).toBe("core");
  });
});

describe("role-specific experience", () => {
  it("rates a champion lower in a role the player rarely plays it in (Gwen top ≠ Gwen jungle)", () => {
    const history = [row("Gwen", 100, 55, daysAgo(2), "TOP"), row("Gwen", 2, 1, daysAgo(5), "JUNGLE")];
    const top = estimateProficiency("Gwen", "TOP", history, null, { now });
    const jungle = estimateProficiency("Gwen", "JUNGLE", history, null, { now });
    expect(top.tier).toBe("core");
    expect(jungle.tier).not.toBe("core");
    expect(jungle.score).toBeLessThan(top.score);
    expect(jungle.notes.join(" ")).toMatch(/Mostly played outside JUNGLE/);
  });

  it("still credits general familiarity: off-role games are not worthless", () => {
    const history = [row("Gwen", 100, 55, daysAgo(2), "TOP")];
    const jungle = estimateProficiency("Gwen", "JUNGLE", history, null, { now });
    const stranger = estimateProficiency("Gwen", "JUNGLE", [row("Gwen", 1, 0, daysAgo(2), "JUNGLE")], null, { now });
    expect(jungle.score).toBeGreaterThan(stranger.score);
  });

  describe("revision 2 (October 2026 audit)", () => {
    const v1 = { config: { revision: 1 as const } };
    const gwenTop = [row("Gwen", 100, 55, daysAgo(3))];
    const mastery = (points: number, last = 3) => ({ championId: "Gwen", points, level: 7, lastPlayedAt: daysAgo(last) });

    it("keeps one role's experience and mastery from making the champion a Main in another role", () => {
      const before = estimateProficiency("Gwen", "JUNGLE", gwenTop, mastery(300_000), { now, ...v1 });
      const after = estimateProficiency("Gwen", "JUNGLE", gwenTop, mastery(300_000), { now });
      expect(before.tier).toBe("core"); // the flaw: 0 jungle games, rated a Main
      expect(after.tier).toBe("comfortable"); // familiar with the champion, not a jungle main
      expect(after.score).toBeLessThan(before.score);
      // Top itself is unchanged.
      expect(estimateProficiency("Gwen", "TOP", gwenTop, mastery(300_000), { now }).tier).toBe("core");
    });

    it("does not let another game mode hide that a champion is out of practice", () => {
      const old = [row("Gwen", 60, 30, daysAgo(200))];
      expect(estimateProficiency("Gwen", "TOP", old, mastery(150_000, 5), { now, ...v1 }).tier).toBe("strong");
      expect(estimateProficiency("Gwen", "TOP", old, mastery(150_000, 5), { now }).tier).toBe("rusty");
      // With no stored games at all, mastery's date still tells recency.
      expect(estimateProficiency("Gwen", "TOP", [], mastery(400_000, 5), { now }).tier).toBe("comfortable");
    });

    it("says a game or two is a few games, not no data, and never more", () => {
      const two = estimateProficiency("Gwen", "TOP", [row("Gwen", 2, 2, daysAgo(1))], null, { now });
      expect(two.tier).toBe("moderate");
      expect(estimateProficiency("Gwen", "TOP", [row("Gwen", 2, 2, daysAgo(1))], null, { now, ...v1 }).tier).toBe("unknown");
      // Two wins out of two: a small edge in the score, nothing more.
      expect(two.score).toBeLessThan(0.55);
    });

    it("rates experience, not results: a main with a poor month is still a main, with a lower score", () => {
      const good = estimateProficiency("Gwen", "TOP", [row("Gwen", 40, 24, daysAgo(2))], mastery(80_000), { now });
      const poor = estimateProficiency("Gwen", "TOP", [row("Gwen", 40, 14, daysAgo(2))], mastery(80_000), { now });
      expect(poor.tier).toBe("core");
      expect(poor.score).toBeLessThan(good.score);
    });
  });
});

