import { describe, expect, it } from "vitest";
import { hashPassword, isCommonPassword, temporaryPassword, validatePasswordStrength, verifyPassword } from "./password";
import commonPasswords from "./common-passwords.json";

describe("passwords", () => {
  it("generates temporary passwords that pass the strength rules and verify after hashing", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = temporaryPassword();
      expect(validatePasswordStrength(p)).toBeNull();
      expect(p).toMatch(/^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}-[A-Za-z2-9]{4}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(20);
    const p = temporaryPassword();
    const hash = await hashPassword(p);
    expect(await verifyPassword(p, hash)).toBe(true);
    expect(await verifyPassword(p + "x", hash)).toBe(false);
  });

  it("keeps verifying passwords chosen under the old rules", async () => {
    // Too short for the new rules, but an existing password is never re-checked.
    const old = "Ab1!cd";
    expect(validatePasswordStrength(old)).toMatch(/12 characters/);
    expect(await verifyPassword(old, await hashPassword(old))).toBe(true);
  });

  it("refuses common passwords, ignoring case", () => {
    expect(commonPasswords.passwords.length).toBeGreaterThan(1000);
    expect(commonPasswords.passwords.every((p) => p.length >= 12 && p === p.toLowerCase())).toBe(true);
    for (const p of ["qwerty123456", "QWERTY123456", "1q2w3e4r5t6y", "passwordpassword"]) {
      expect(isCommonPassword(p), p).toBe(true);
      expect(validatePasswordStrength(p)).toMatch(/too common/);
    }
    expect(isCommonPassword("purple tiger lamp")).toBe(false);
  });
});
