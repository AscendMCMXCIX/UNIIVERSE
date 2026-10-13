import { describe, expect, it } from "vitest";
import { resolveViewMode } from "./view-mode";
import type { Session } from "./permissions";

const base: Session = { userId: "u", role: "player", label: "P", playerId: "p", username: "p", hasPassword: true, setupComplete: true };

describe("admin mode", () => {
  it("is off by default for everyone, including owners", () => {
    expect(resolveViewMode(undefined, { ...base, role: "owner" })).toBe("player");
    expect(resolveViewMode("", { ...base, role: "owner" })).toBe("player");
  });
  it("turns on only for an owner who asked for it", () => {
    expect(resolveViewMode("admin", { ...base, role: "owner" })).toBe("admin");
    expect(resolveViewMode("admin", { ...base, role: "coach" })).toBe("player");
    expect(resolveViewMode("admin", base)).toBe("player");
    expect(resolveViewMode("admin", null)).toBe("player");
  });
});
