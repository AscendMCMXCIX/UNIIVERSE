import { describe, expect, it } from "vitest";
import { playerHome, preferredMode } from "./view-mode";
import type { Session } from "./permissions";

const base: Session = { userId: "u", role: "player", label: "P", playerId: "p", username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true };
const administrator: Session = { ...base, admin: true };

describe("the mode an account opens in at /", () => {
  it("is always Player Mode for anyone who is not an administrator, whatever the cookie says", () => {
    for (const cookie of [undefined, "", "player", "admin", "nonsense"]) {
      expect(preferredMode(cookie, base), String(cookie)).toBe("player");
      expect(preferredMode(cookie, { ...base, role: "coach" })).toBe("player");
      expect(preferredMode(cookie, { ...base, capabilities: ["manage-lineup", "manage-players", "manage-matches"] })).toBe("player");
      expect(preferredMode(cookie, { ...base, admin: false })).toBe("player");
      expect(preferredMode(cookie, null)).toBe("player");
    }
  });

  it("is the mode an administrator used last", () => {
    for (const s of [administrator, { ...base, role: "owner" as const }, { ...base, role: "owner" as const, playerId: null }]) {
      expect(preferredMode("admin", s)).toBe("admin");
      expect(preferredMode("player", s)).toBe("player");
    }
  });

  it("with no preference: Player Mode for an administrator who plays, Admin Mode for an admin-only Owner", () => {
    expect(preferredMode(undefined, administrator)).toBe("player");
    expect(preferredMode(undefined, { ...base, role: "owner" })).toBe("player");
    expect(preferredMode(undefined, { ...base, role: "owner", playerId: null })).toBe("admin");
    expect(preferredMode("nonsense", { ...base, role: "owner", playerId: null })).toBe("admin");
  });
});

describe("Player Mode's start page", () => {
  it("is Team for team members, an admin-only Owner included, and the profile otherwise", () => {
    expect(playerHome(base)).toBe("/team");
    expect(playerHome({ ...base, role: "owner", playerId: null })).toBe("/team");
    expect(playerHome({ ...base, teamMember: false })).toBe("/overview");
    expect(playerHome(null)).toBe("/overview");
  });
});
