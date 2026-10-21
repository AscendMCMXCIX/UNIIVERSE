import { describe, expect, it } from "vitest";
import { identityMarker, parseJar } from "./account-jar";

const token = (c: string) => `s1.${c.repeat(43)}`;

describe("old cookie of remembered accounts", () => {
  it("reads well-formed, distinct session tokens only, at most three", () => {
    expect(parseJar(undefined)).toEqual([]);
    expect(parseJar(`${token("a")},junk,${token("a")}, ${token("b")}`)).toEqual([token("a"), token("b")]);
    expect(parseJar("eyJhbGciOi.legacy.jwt")).toEqual([]);
    const many = ["a", "b", "c", "d", "e"].map(token).join(",");
    expect(parseJar(many)).toEqual([token("a"), token("b"), token("c")]);
  });

  it("fingerprints an account without revealing its id or any token", () => {
    const id = "6f1c2c1e-1111-4222-8333-944445555666";
    const marker = identityMarker(id);
    expect(marker).toMatch(/^[0-9a-f]{16}$/);
    expect(marker).toBe(identityMarker(id));
    expect(marker).not.toBe(identityMarker("6f1c2c1e-1111-4222-8333-944445555667"));
    expect(id).not.toContain(marker);
  });
});
