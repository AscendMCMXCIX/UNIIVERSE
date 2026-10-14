import { describe, expect, it } from "vitest";
import { passwordChecks, PASSWORD_RULES, validatePasswordStrength } from "./password-policy";

describe("password policy (new and changed passwords only)", () => {
  it("needs 6+ characters, a capital letter, a number and a symbol", () => {
    expect(validatePasswordStrength("Ab1!cd")).toBeNull();
    expect(validatePasswordStrength("Ünï1-x")).toBeNull(); // any script's capitals and symbols count
    expect(validatePasswordStrength("Ab1!c")).toMatch(/6 characters/);
    expect(validatePasswordStrength("ab1!cd")).toMatch(/capital/);
    expect(validatePasswordStrength("Abc!de")).toMatch(/number/);
    expect(validatePasswordStrength("Abc1de")).toMatch(/symbol/);
    expect(validatePasswordStrength("Ab1 cd")).toMatch(/symbol/); // a space is not a symbol
  });

  it("explains the rules in plain words and checks each one live", () => {
    expect(PASSWORD_RULES).toMatch(/capital letter/);
    expect(passwordChecks("abc")).toEqual([
      { label: "6+ characters", ok: false },
      { label: "a capital letter", ok: false },
      { label: "a number", ok: false },
      { label: "a symbol", ok: false },
    ]);
    expect(passwordChecks("Ab1!cd").every((c) => c.ok)).toBe(true);
  });
});
