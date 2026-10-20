import { describe, expect, it } from "vitest";
import { accountShortNames } from "./account-names";

describe("account short names", () => {
  it("are the in-game names, never a label", () => {
    const names = accountShortNames([
      { id: "a", riotId: "Faker#KR1" },
      { id: "b", riotId: "Smurf Lord#OCE" },
    ]);
    expect([...names.values()]).toEqual(["Faker", "Smurf Lord"]);
  });

  it("add the tagline only where two accounts share a name (case ignored)", () => {
    const names = accountShortNames([
      { id: "a", riotId: "Ascend#OCE" },
      { id: "b", riotId: "ascend#EUW" },
      { id: "c", riotId: "Other#OCE" },
    ]);
    expect(names.get("a")).toBe("Ascend#OCE");
    expect(names.get("b")).toBe("ascend#EUW");
    expect(names.get("c")).toBe("Other");
  });
});
