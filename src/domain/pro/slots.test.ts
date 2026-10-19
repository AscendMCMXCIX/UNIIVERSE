import { describe, expect, it } from "vitest";
import { banSlotFor, describeSlotProfile, draftSlotFor, summariseSlots, type ProSlotRecord } from "./slots";

describe("professional draft slots", () => {
  it("maps side and pick order to the tournament slot", () => {
    expect(draftSlotFor("blue", 1)).toBe("B1");
    expect(draftSlotFor("red", 1)).toBe("R1R2");
    expect(draftSlotFor("red", 2)).toBe("R1R2");
    expect(draftSlotFor("blue", 2)).toBe("B2B3");
    expect(draftSlotFor("blue", 3)).toBe("B2B3");
    expect(draftSlotFor("red", 3)).toBe("R3");
    expect(draftSlotFor("red", 4)).toBe("R4");
    expect(draftSlotFor("blue", 4)).toBe("B4B5");
    expect(draftSlotFor("blue", 5)).toBe("B4B5");
    expect(draftSlotFor("red", 5)).toBe("R5");
    expect(draftSlotFor("blue", 0)).toBeNull();
    expect(banSlotFor(3)).toBe("BAN1");
    expect(banSlotFor(4)).toBe("BAN2");
    expect(banSlotFor(6)).toBeNull();
  });

  it("summarises slot counts into shares and describes them honestly", () => {
    const records: ProSlotRecord[] = [
      { championId: "Rumble", slot: "B1", role: "TOP", games: 12, wins: 7 },
      { championId: "Rumble", slot: "R1R2", role: "TOP", games: 6, wins: 3 },
      { championId: "Rumble", slot: "B4B5", role: "TOP", games: 2, wins: 1 },
      { championId: "Rumble", slot: "BAN2", role: null, games: 5, wins: 3 },
      { championId: "Jax", slot: "R5", role: "TOP", games: 9, wins: 5 },
      { championId: "Jax", slot: "B4B5", role: "TOP", games: 3, wins: 1 },
    ];
    const rumble = summariseSlots("Rumble", records)!;
    expect(rumble.picks).toBe(20);
    expect(rumble.firstRotation).toBeCloseTo(0.9);
    expect(rumble.bans).toBe(5);
    expect(describeSlotProfile(rumble)).toMatch(/first rotation \(90%/);
    const jax = summariseSlots("Jax", records)!;
    expect(jax.counterpick).toBeCloseTo(0.75);
    expect(describeSlotProfile(jax)).toMatch(/last-pick counter/);
    expect(summariseSlots("Nobody", records)).toBeNull();
    expect(describeSlotProfile({ ...jax, picks: 3 })).toBeNull();
  });
});
