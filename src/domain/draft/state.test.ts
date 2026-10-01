import { describe, expect, it } from "vitest";
import { applyAction, deriveDraft, undoLastAction, type DraftState } from "./state";
import { DEFAULT_ASSIGNMENT } from "../../../tests/fixtures/players";

function fresh(side: "blue" | "red" = "blue"): DraftState {
  return { side, actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
}

function must(result: ReturnType<typeof applyAction>): DraftState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("draft state", () => {
  it("starts at blue's first ban and tracks whose turn it is", () => {
    const d = deriveDraft(fresh("red"));
    expect(d.nextStep?.index).toBe(0);
    expect(d.ourTurn).toBe(false);
    expect(d.ourRemainingBans).toBe(5);
    expect(d.enemyRemainingPicks).toBe(5);
  });

  it("rejects selecting a banned or already picked champion", () => {
    let s = fresh("blue");
    s = must(applyAction(s, { championId: "Aatrox" })); // blue ban
    expect(applyAction(s, { championId: "Aatrox" }).ok).toBe(false); // red tries to ban same champion
    s = must(applyAction(s, { championId: "Ahri" }));
    for (let i = 0; i < 4; i++) s = must(applyAction(s, { championId: null }));
    s = must(applyAction(s, { championId: "Jinx", role: "ADC" })); // B1
    const dup = applyAction(s, { championId: "Jinx" }); // R1 cannot take Jinx
    expect(dup.ok).toBe(false);
    const banned = applyAction(s, { championId: "Ahri" });
    expect(banned.ok).toBe(false);
  });

  it("records our picks with player intent and derives open roles", () => {
    let s = fresh("blue");
    for (let i = 0; i < 6; i++) s = must(applyAction(s, { championId: null }));
    s = must(applyAction(s, { championId: "Jinx", role: "ADC" }));
    const d = deriveDraft(s);
    expect(d.ourPicks).toEqual([{ index: 6, championId: "Jinx", playerId: "player-d", role: "ADC" }]);
    expect(d.openRoles).toEqual(["TOP", "JUNGLE", "MID", "SUPPORT"]);
    expect(d.nextStep?.side).toBe("red");
    expect(d.pickedChampionIds.has("Jinx")).toBe(true);
  });

  it("rejects a pick whose player does not match the current assignment", () => {
    let s = fresh("blue");
    for (let i = 0; i < 6; i++) s = must(applyAction(s, { championId: null }));
    const bad = applyAction(s, { championId: "Jinx", role: "ADC", playerId: "player-e" });
    expect(bad.ok).toBe(false);
  });

  it("supports undo and completion", () => {
    let s = fresh("blue");
    for (let i = 0; i < 6; i++) s = must(applyAction(s, { championId: null }));
    s = must(applyAction(s, { championId: "Jinx", role: "ADC" }));
    s = undoLastAction(s);
    expect(deriveDraft(s).nextStep?.index).toBe(6);
    const champs = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
    let k = 0;
    while (!deriveDraft(s).isComplete) {
      const step = deriveDraft(s).nextStep!;
      s = must(applyAction(s, { championId: step.type === "ban" ? null : champs[k++]! }));
    }
    expect(deriveDraft(s).isComplete).toBe(true);
    expect(deriveDraft(s).ourPicks).toHaveLength(5);
    expect(deriveDraft(s).enemyPicks).toHaveLength(5);
    expect(applyAction(s, { championId: "Z" }).ok).toBe(false);
  });

  it("treats fearless/series-unavailable champions as unavailable", () => {
    const s: DraftState = { ...fresh("blue"), unavailableChampionIds: ["Yone"] };
    expect(applyAction(s, { championId: "Yone" }).ok).toBe(false);
    expect(deriveDraft(s).unavailableChampionIds.has("Yone")).toBe(true);
  });
});
