import { describe, expect, it } from "vitest";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS } from "./competition";
import { stepsFor } from "./draft/formats";

const order = (formatId: string, type: "ban" | "pick") =>
  stepsFor(formatId, "blue")
    .filter((s) => s.type === type)
    .map((s) => (s.side === "blue" ? "B" : "R"))
    .join("");

describe("competition modes", () => {
  it("offers Ranked 5s and Ranked Flex as separate modes with their own draft rules", () => {
    expect(DRAFT_MODE_OPTIONS.slice(0, 2)).toEqual(["ranked-5s", "ranked-flex"]);
    expect(COMPETITION_MODE_INFO["ranked-5s"].label).toBe("Ranked 5s");
    expect(COMPETITION_MODE_INFO["ranked-flex"].label).toBe("Ranked Flex");
    // Ranked 5s: tournament draft, two alternating ban phases, 1-2-2-1 then 2-1-1 picks.
    expect(COMPETITION_MODE_INFO["ranked-5s"].defaultFormatId).toBe("tournament");
    expect(order("tournament", "ban")).toBe("BRBRBR" + "RBRB");
    expect(order("tournament", "pick")).toBe("BRRBBR" + "RBBR");
    // Ranked Flex: five simultaneous bans each, then 1-2-2-2-2-1.
    expect(COMPETITION_MODE_INFO["ranked-flex"].defaultFormatId).toBe("ranked-flex");
    expect(order("ranked-flex", "ban")).toBe("BBBBBRRRRR");
    expect(order("ranked-flex", "pick")).toBe("BRRBBRRBBR");
    expect(stepsFor("ranked-flex", "blue").filter((s) => s.type === "ban").every((s) => s.simultaneous)).toBe(true);
    // Neither lets the user pick another format; Ranked 5s expects scouting, Flex usually not.
    expect(COMPETITION_MODE_INFO["ranked-5s"].formatSelectable).toBe(false);
    expect(COMPETITION_MODE_INFO["ranked-flex"].formatSelectable).toBe(false);
    expect(COMPETITION_MODE_INFO["ranked-5s"].scouting).toBe("short");
  });
});
