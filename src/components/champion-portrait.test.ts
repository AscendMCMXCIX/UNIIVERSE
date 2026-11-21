import { describe, expect, it } from "vitest";
import { championInitials } from "./champion-portrait";

describe("championInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(championInitials("Lee Sin")).toBe("LS");
    expect(championInitials("Nunu & Willump")).toBe("NW");
    expect(championInitials("Dr. Mundo")).toBe("DM");
    expect(championInitials("Jarvan IV")).toBe("JI");
  });
  it("takes the first two letters of a one-word name", () => {
    expect(championInitials("Ahri")).toBe("AH");
    expect(championInitials("Kai'Sa")).toBe("KA");
    expect(championInitials("K'Sante")).toBe("KS");
  });
});
