import { describe, expect, it } from "vitest";
import { turnOffPhrase, typedMatches } from "./typed-confirmation";

describe("typedMatches", () => {
  it("accepts the phrase whatever its letter case and outer or repeated spaces", () => {
    expect(typedMatches("TURN OFF", "TURN OFF")).toBe(true);
    expect(typedMatches("turn off", "TURN OFF")).toBe(true);
    expect(typedMatches("  Turn   off ", "TURN OFF")).toBe(true);
    expect(typedMatches(turnOffPhrase("rank-watch").toLowerCase(), turnOffPhrase("rank-watch"))).toBe(true);
    // A name typed as the list shows it (full-width letters are the same letters).
    expect(typedMatches("ＤｅｍｏＰｌａｙｅｒ", "DemoPlayer")).toBe(true);
  });

  it("refuses anything else: another phrase, a part of it, nothing, or an empty expected phrase", () => {
    expect(typedMatches("TURN OF", "TURN OFF")).toBe(false);
    expect(typedMatches("TURNOFF", "TURN OFF")).toBe(false);
    expect(typedMatches("TURN OFF rank-watch", "TURN OFF")).toBe(false);
    expect(typedMatches(turnOffPhrase("integrity"), turnOffPhrase("rank-watch"))).toBe(false);
    expect(typedMatches("", "TURN OFF")).toBe(false);
    expect(typedMatches(undefined, "TURN OFF")).toBe(false);
    expect(typedMatches(null, "TURN OFF")).toBe(false);
    expect(typedMatches(42, "42")).toBe(false);
    expect(typedMatches("", "")).toBe(false);
    expect(typedMatches("  ", " ")).toBe(false);
  });
});
