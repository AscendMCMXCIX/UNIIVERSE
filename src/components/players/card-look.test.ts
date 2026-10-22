import { describe, expect, it } from "vitest";
import { nameParts } from "./card-look";

describe("nameParts: where a long word of a card name may break", () => {
  it("leaves a name without a long word whole", () => {
    expect(nameParts("Demo Support")).toEqual(["Demo Support"]);
    expect(nameParts("Valkyrie of the Endless Twilight")).toEqual(["Valkyrie of the Endless Twilight"]);
  });

  it("breaks a long word where its parts meet: a capital after a small letter, letters and digits", () => {
    expect(nameParts("XxShadowAssassinOfTheVoidxX2026")).toEqual(["Xx", "Shadow", "Assassin", "Of", "The", "Voidx", "X", "2026"]);
    expect(nameParts("NightHunter99 main")).toEqual(["Night", "Hunter", "99 main"]);
  });

  it("keeps every character, in order, so the text itself never changes", () => {
    for (const name of ["XxShadowAssassinOfTheVoidxX2026", "ŜtëllàrŴïndwàlkér 星の守護者 ✦", "ALLCAPSNAMEWITHOUTSEAMS"]) expect(nameParts(name).join("")).toBe(name);
  });

  it("reads letters beyond ASCII", () => {
    expect(nameParts("ŜtëllàrŴïndwàlkér")).toEqual(["Ŝtëllàr", "Ŵïndwàlkér"]);
  });
});
