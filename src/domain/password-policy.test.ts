import { describe, expect, it } from "vitest";
import { passwordChecks, PASSWORD_RULES, validatePasswordStrength } from "./password-policy";

describe("password policy (new and changed passwords only)", () => {
  it("needs 12 to 256 characters, of any kind", () => {
    expect(validatePasswordStrength("purple tiger lamp")).toBeNull(); // spaces and lower case are fine
    expect(validatePasswordStrength("ünïcode-wörds")).toBeNull();
    expect(validatePasswordStrength("abcdefghijk")).toMatch(/at least 12 characters/);
    expect(validatePasswordStrength("Ab1!cd")).toMatch(/at least 12 characters/); // the old rules are not enough
    expect(validatePasswordStrength("x".repeat(256))).toBeNull();
    expect(validatePasswordStrength("x".repeat(257))).toMatch(/at most 256/);
  });

  it("explains the rules in plain words and checks the length live", () => {
    expect(PASSWORD_RULES).toMatch(/12 characters/);
    expect(passwordChecks("abc")).toEqual([{ label: "12+ characters", ok: false }]);
    expect(passwordChecks("purple tiger lamp").every((c) => c.ok)).toBe(true);
  });
});
