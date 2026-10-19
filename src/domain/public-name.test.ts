import { describe, expect, it } from "vitest";
import { parsePublicName, PUBLIC_NAME_MAX } from "./public-name";

describe("public name", () => {
  it("accepts ordinary names, tidying spaces", () => {
    expect(parsePublicName("  Jun   Park ")).toEqual({ ok: true, name: "Jun Park" });
    expect(parsePublicName("Zoë-K")).toEqual({ ok: true, name: "Zoë-K" });
    expect(parsePublicName("Mid.Lane 2")).toEqual({ ok: true, name: "Mid.Lane 2" });
  });

  it("refuses empty, long, markup and link-like names", () => {
    for (const bad of [undefined, null, 4, "", " a ", "x".repeat(PUBLIC_NAME_MAX + 1), "<b>me</b>", "http://x.y", "me@site", "-dash", "tab\tname\u0000"]) {
      expect(parsePublicName(bad).ok).toBe(false);
    }
  });
});
