import { describe, expect, it } from "vitest";
import { hashPassword, temporaryPassword, validatePasswordStrength, verifyPassword } from "./password";

describe("passwords", () => {
  it("generates temporary passwords that pass the strength rules and verify after hashing", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = temporaryPassword();
      expect(validatePasswordStrength(p)).toBeNull();
      expect(p).toHaveLength(14);
      seen.add(p);
    }
    expect(seen.size).toBe(20);
    const p = temporaryPassword();
    const hash = await hashPassword(p);
    expect(await verifyPassword(p, hash)).toBe(true);
    expect(await verifyPassword(p + "x", hash)).toBe(false);
  });
});
